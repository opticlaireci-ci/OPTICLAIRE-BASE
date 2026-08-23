import { logger } from '../utils/logger';
/**
 * Service de synchronisation automatique localStorage ↔ Firebase
 * Intercepte les appels localStorage pour les rediriger vers Firestore.
 */

import { saveToSupabase, loadAllFromSupabase, subscribeToChanges } from './supabaseRealtime';
import { markLocalWrite, clearLocalWrite } from './safeHydrate';
import { isCatalogueKey } from './catalogueService';
import { auth, FIREBASE_DATA_ENABLED } from '../utils/firebaseClient';
import { onAuthStateChanged } from '../utils/authCompat';
import { isAuthError, isNoSessionError, isPermissionError } from '../utils/networkErrors';
import { supabase } from '../utils/supabaseClient';

/**
 * Y a-t-il une session utilisateur active ?
 *
 * Les overrides localStorage sont installés dès le démarrage, AVANT toute
 * connexion : les écritures faites sur l'écran de login (`leclaire_last_activity`,
 * caches divers) partaient donc vers PostgREST avec la clé anon. Le rôle Postgres
 * est alors `anon`, jamais `authenticated`, et les policies refusent l'écriture
 * avec un 42501 — un faux « droits manquants » qui n'a rien à voir avec les GRANT.
 */
async function hasSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    // getSession() injoignable : on ne pousse pas, le cache local fait foi.
    return false;
  }
}

function pushWithRetry(label: string, key: string, fn: () => Promise<any>) {
  const attempt = async (n: number) => {
    markLocalWrite(key);

    // Déconnecté → l'écriture échouerait forcément. Ce n'est pas une erreur :
    // la valeur reste en cache local et repartira à la prochaine réécriture
    // une fois la session ouverte. Abandon silencieux, aucun log.
    if (!(await hasSession())) {
      clearLocalWrite(key);
      return;
    }

    // Ajout d'un timeout global pour chaque tentative de synchronisation.
    // Si la promesse reste bloquée (connexion proxy coupée silencieusement),
    // on lève une erreur pour forcer le retry avec une nouvelle connexion.
    //
    // Marge : ce timeout englobe AUSSI le temps passé dans la file de concurrence
    // de serverFetch (MAX_CONCURRENT=4). Au démarrage, une rafale d'écritures
    // (catalogues + inventaires + atelier + rdv) fait patienter chaque écriture
    // >13 s dans la file AVANT même de partir. Avec 25 s, l'écriture lente-mais-
    // valide était tuée à tort puis RÉENFILÉE, ce qui aggravait la congestion
    // (effet boule de neige → timeouts en cascade sur toutes les entités).
    // serverFetch avorte déjà réellement une requête bloquée (12 s/tentative,
    // ~40 s dans le pire cas avec retries). On place donc ce filet AU-DESSUS de ce
    // pire cas : il ne se déclenche plus que pour une promesse réellement figée.
    const TIMEOUT_MS = 60_000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout d'écriture Firebase (${label}) après ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
    );

    Promise.race([fn(), timeoutPromise])
      .then(() => {
        logger.log(`✅ ${label} synchronisé (tentative ${n + 1})`);
        setTimeout(() => clearLocalWrite(key), 2000);
      })
      .catch(err => {
        // Session absente/expirée : inutile de réessayer (chaque tentative
        // échouera pareil et polluerait la console). Le cache local est conservé
        // et sera re-poussé automatiquement après reconnexion. Abandon silencieux.
        if (isAuthError(err) || isNoSessionError(err)) {
          clearLocalWrite(key);
          return;
        }
        // Droits Postgres manquants : réessayer 9 fois avec backoff ne fait que
        // répéter la même erreur pendant ~1 min et noyer la console. On abandonne
        // dès la première occurrence, en nommant le correctif. Le cache local est
        // préservé : la donnée repartira dès que le GRANT sera posé et que la clé
        // sera réécrite.
        if (isPermissionError(err)) {
          clearLocalWrite(key);
          logger.error(
            `❌ ${label} : écriture refusée par Postgres (SQLSTATE 42501) alors qu'une ` +
            `session est bien active — il manque donc réellement un GRANT ou une policy ` +
            `pour le rôle « authenticated ». Exécutez supabase/FIX_DROITS_AUTHENTICATED.sql ` +
            `dans le SQL Editor. Aucune nouvelle tentative, cache local conservé.`,
          );
          return;
        }
        logger.warn(`⚠️ ${label} échec ${n + 1}:`, err?.message || err);
        if (n < 8) {
          const delay = Math.min(1500 * Math.pow(1.7, n), 30_000);
          setTimeout(() => { void attempt(n + 1); }, delay);
        } else {
          logger.error(`❌ ${label} abandonné après 9 tentatives`);
        }
      });
  };
  void attempt(0);
}

const originalSetItem    = localStorage.setItem.bind(localStorage);
const originalGetItem    = localStorage.getItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);
const originalClear      = localStorage.clear.bind(localStorage);

const cloudMemoryCache = new Map<string, string>();

function isLeclaireBusinessKey(key: string): boolean {
  return key.startsWith('leclaire_') &&
    !key.includes('session') &&
    !key.includes('current_user') &&
    !key.includes('recent_writes');
}

function rememberInMemory(key: string, value: string) {
  if (isLeclaireBusinessKey(key)) cloudMemoryCache.set(key, value);
}

let syncEnabled = false;
let initialSyncDone = false;
let storageOverridesInstalled = false;

function installStorageOverrides() {
  if (storageOverridesInstalled) return;
  storageOverridesInstalled = true;

  localStorage.getItem = function(key: string) {
    return originalGetItem(key);
  };

  localStorage.setItem = function(key: string, value: string) {
    // Écriture DURABLE en local (survit au rechargement, affichage instantané)
    // ET envoi vers Supabase (source de vérité partagée par tous les navigateurs).
    // Auparavant les données métier étaient gardées EN MÉMOIRE uniquement : si le
    // push cloud échouait/traînait, elles disparaissaient au rechargement et
    // n'étaient jamais visibles ailleurs. On persiste donc toujours en local ;
    // le polling Supabase (5 s) réécrit ce cache avec la valeur cloud partagée.
    originalSetItem(key, value);
    rememberInMemory(key, value);
    if (key.startsWith('leclaire_')) markLocalWrite(key);
    pushLeclaireKeyToCloud(key, value);
  };

  localStorage.removeItem = function(key: string) {
    cloudMemoryCache.delete(key);
    originalRemoveItem(key);
    // Ne jamais envoyer de suppression Firebase pour les clés de session :
    // current_user et magasin_actuel sont gérés localement uniquement.
    if (key.startsWith('leclaire_') && !key.includes('current_user') && !key.includes('magasin_actuel') && !key.includes('session')) {
      import('./supabaseRealtime').then(({ saveToSupabase }) => {
        saveToSupabase(key, null, true).catch(err => {
          logger.error(`❌ Erreur suppression auto ${key}:`, err);
        });
      });
    }
  };

  localStorage.clear = function() {
    logger.warn('⚠️ localStorage.clear() appelé - les données Firebase restent intactes');
    cloudMemoryCache.clear();
    originalClear();
  };
}

function pushLeclaireKeyToCloud(key: string, value: string) {
  import('./catalogueService').then(({ isCatalogueKey, CATALOGUE_KEY_TO_TYPE, replaceCatalogue }) => {
    if (!isCatalogueKey(key)) return;
    try {
      const items = JSON.parse(value);
      if (!Array.isArray(items)) return;
      pushWithRetry(`Catalogue ${CATALOGUE_KEY_TO_TYPE[key]}`, key,
        () => replaceCatalogue(CATALOGUE_KEY_TO_TYPE[key], items));
    } catch (e) { logger.error(`❌ Parse catalogue ${key}:`, e); }
  }).catch(e => logger.error(`❌ Import catalogueService échoué pour ${key}:`, e));

  if (key.startsWith('leclaire_rdv_enligne_')) {
    const magasinId = key.substring('leclaire_rdv_enligne_'.length);
    import('./rdvService').then(({ replaceRdvEnligne }) => {
      try {
        const items = JSON.parse(value);
        if (Array.isArray(items)) pushWithRetry('RDV en ligne', key, () => replaceRdvEnligne(magasinId, items));
      } catch (e) { logger.error('❌ Parse rdv:', e); }
    });
  }

  if (key === 'leclaire_bons_commande_verres') {
    import('./atelierService').then(({ replaceBonsCommandeVerres }) => {
      try { const items = JSON.parse(value); if (Array.isArray(items)) pushWithRetry('Atelier', key, () => replaceBonsCommandeVerres(items)); }
      catch (e) { logger.error('❌ Parse atelier:', e); }
    });
  }

  if (key === 'leclaire_emplois_du_temps') {
    import('./emploisService').then(({ replaceEmplois }) => {
      try { const items = JSON.parse(value); if (Array.isArray(items)) pushWithRetry('Emplois', key, () => replaceEmplois(items)); }
      catch (e) { logger.error('❌ Parse emplois:', e); }
    });
  }

  if (key === 'leclaire_inventaires') {
    import('./inventairesService').then(({ replaceInventaires }) => {
      try { const items = JSON.parse(value); if (Array.isArray(items)) pushWithRetry('Inventaires', key, () => replaceInventaires(items)); }
      catch (e) { logger.error('❌ Parse inventaires:', e); }
    });
  }

  if (key === 'leclaire_bons_commande' || key === 'leclaire_bons_livraison' || key === 'leclaire_bons_peremption') {
    import('./bonsService').then(({ replaceBons }) => {
      try { const items = JSON.parse(value); if (Array.isArray(items)) pushWithRetry(`Bons ${key}`, key, () => replaceBons(key, items)); }
      catch (e) { logger.error(`❌ Parse ${key}:`, e); }
    });
  }

  if (key.startsWith('leclaire_') &&
      !key.includes('session') &&
      !key.includes('current_user') &&
      !key.includes('sync_registry') &&
      !key.includes('migrated') &&
      !key.startsWith('leclaire_ventes_') &&
      !key.startsWith('leclaire_stock_cache_') &&
      !key.startsWith('leclaire_factures_assurance_') &&
      key !== 'leclaire_reglements_assurance' &&
      key !== 'leclaire_releves_assurance' &&
      !key.startsWith('leclaire_clients_magasin_') &&
      key !== 'leclaire_db_bon-distribution' &&
      key !== 'leclaire_db_bon-transfert' &&
      key !== 'leclaire_db_bon-retour' &&
      key !== 'leclaire_inventaires' &&
      !key.startsWith('leclaire_rdv_enligne_') &&
      key !== 'leclaire_bons_commande_verres' &&
      key !== 'leclaire_emplois_du_temps' &&
      key !== 'leclaire_bons_commande' &&
      key !== 'leclaire_bons_livraison' &&
      key !== 'leclaire_bons_peremption' &&
      !isCatalogueKey(key)) {
    // Coalescing : certaines clés (ex. leclaire_rapport_sms) sont réécrites en
    // rafale — chaque SMS passe « En cours » → « Envoyé », et un envoi groupé en
    // déclenche plusieurs. Sans debounce, on lance des dizaines de push cloud
    // concurrents qui saturent la fonction edge et finissent en AbortError. On
    // ne pousse donc que la DERNIÈRE valeur après une courte fenêtre d'inactivité.
    debouncedCloudPush(key, value);
  }
}

// Debounce par clé : coalesce les écritures rapprochées en un seul push cloud.
const cloudPushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const CLOUD_PUSH_DEBOUNCE_MS = 1500;

function debouncedCloudPush(key: string, value: string) {
  const existing = cloudPushTimers.get(key);
  if (existing) clearTimeout(existing);
  cloudPushTimers.set(key, setTimeout(() => {
    cloudPushTimers.delete(key);
    // Relire la valeur la plus récente au moment du push (peut avoir évolué).
    const latest = originalGetItem(key) ?? value;
    try {
      const parsed = JSON.parse(latest);
      pushWithRetry(`app_data ${key}`, key, () => saveToSupabase(key, parsed, true));
    } catch {
      pushWithRetry(`app_data ${key}`, key, () => saveToSupabase(key, latest, true));
    }
  }, CLOUD_PUSH_DEBOUNCE_MS));
}

export async function enableAutoSync() {
  // ⛔️ Synchro cloud coupée : on N'INSTALLE PAS les overrides localStorage.
  // localStorage reste donc NATIF → les données métier persistent réellement en
  // local (fiable) au lieu d'être gardées en mémoire puis perdues au refresh.
  if (!FIREBASE_DATA_ENABLED) {
    logger.warn('⛔️ Auto-sync Firebase désactivé — persistance 100% locale (localStorage natif)');
    return;
  }
  if (syncEnabled) {
    logger.log('⚠️ Auto-sync déjà activé');
    return;
  }
  syncEnabled = true;
  logger.log('🚀 Activation de la synchronisation automatique Firebase...');

  installStorageOverrides();

  // Attendre une session Firebase Auth avant de pousser/tirer
  const currentUser = auth.currentUser;

  if (!currentUser) {
    logger.log('⏳ Pas de session — sync cloud en attente de connexion');
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && !initialSyncDone) {
        unsub();
        runInitialSyncAndOverrides();
      }
    });
    return;
  }

  await runInitialSyncAndOverrides();
}

async function runInitialSyncAndOverrides() {
  logger.log('🔐 Session authentifiée — démarrage sync cloud Firebase');

  if (!initialSyncDone) {
    logger.log('📥 Chargement des données depuis Firebase...');
    try {
      const count = await loadAllFromSupabase();
      logger.log(`✅ Pull: ${count} clés chargées depuis Firebase`);
    } catch (err) {
      logger.error('❌ Erreur pull initial:', err);
    }
    initialSyncDone = true;
  }

  subscribeToChanges('*', (_data) => {
    logger.log('📥 Données mises à jour depuis un autre appareil');
  });

  logger.log('✅ Synchronisation automatique Firebase activée !');
}

export function disableAutoSync() {
  if (!syncEnabled) return;
  localStorage.setItem = originalSetItem;
  localStorage.getItem = originalGetItem;
  localStorage.removeItem = originalRemoveItem;
  localStorage.clear = originalClear;
  storageOverridesInstalled = false;
  syncEnabled = false;
  logger.log('🛑 Synchronisation automatique désactivée');
}

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

export async function forceSyncNow() {
  logger.log('🔄 Synchronisation forcée...');
  const { syncAllToSupabase } = await import('./supabaseRealtime');
  const result = await syncAllToSupabase();
  logger.log(`✅ Sync forcée terminée: ${result.success} réussies, ${result.errors} erreurs`);
  return result;
}

export function setItemWithoutSync(key: string, value: string) {
  const oldValue = originalGetItem(key);
  if (oldValue === value) return;
  rememberInMemory(key, value);
  // Hydratation cloud → on persiste DURABLEMENT en local (source de vérité =
  // Supabase, mais le cache local survit au rechargement et évite tout « écran vide »).
  originalSetItem(key, value);
  try {
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: value, storageArea: localStorage }));
    window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key, value } }));
  } catch {}
}

export function removeItemWithoutSync(key: string) {
  cloudMemoryCache.delete(key);
  originalRemoveItem(key);
}
