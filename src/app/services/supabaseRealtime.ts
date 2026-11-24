import { logger } from '../utils/logger';
/**
 * COUCHE DE SYNCHRONISATION app_data — 100% SUPABASE
 *
 * Les clés localStorage « clé-valeur » (leclaire_*) qui ne sont pas gérées par
 * un service métier dédié sont stockées dans la table Postgres `app_data`,
 * accédée en DIRECT via PostgREST (`supabaseDirect`) — plus d'edge function
 * (un document par clé : { id, value, updated_at }).
 *
 * Le temps réel est assuré par un polling léger, cohérent entre tous les
 * navigateurs. Aucune dépendance Firebase.
 */

import { kvGetCollection, kvGetCollectionDelta, kvGetDoc, kvSetDoc, kvDeleteDoc, kvEcrireListeFusionnee } from '../utils/supabaseDirect';
import { FIREBASE_DATA_ENABLED } from '../utils/firebaseClient';
import { isStructuredKey } from './structuredKeys';
import { logNetworkAware, isAuthError, isNoSessionError, isPermissionError } from '../utils/networkErrors';
import { getValidAccessToken } from '../utils/supabaseClient';
import { subscribeEntityChanges, onLiveStatusChange, isLive, SLOW_POLL_MS } from '../utils/supabaseLive';
import { fusionnerMarquesSms, fusionnerListes, listeAvecIds } from '../utils/fusionListes';
import {
  fusionnerMagasins, lireRegistreMagasins, saveMagasins, listeCompleteMagasins,
  magasinsAEnvoyer, marquerMagasinsEnvoyes, EVENEMENT_MAGASINS,
} from '../constants/magasins';

const APP_DATA = 'app_data';

// Clés pour lesquelles on a déjà signalé un DELETE refusé (droits anon) : évite
// de répéter le même message à chaque suppression tentée.
const deleteDeniedWarned = new Set<string>();

/** Cadence de repli quand le canal temps réel `app_data` n'est pas connecté. */
const FAST_POLL_MS = 15_000;

// Clé de la liste des magasins : cas particulier. La liste est la même pour
// tout le réseau, mais chaque appareil en garde une copie. Avant, la copie d'un
// appareil remplaçait celle du serveur à chaque écriture : un appareil resté sur
// les 9 magasins de départ (cache vidé à la déconnexion, puis réécrit avec les
// valeurs par défaut) effaçait les magasins ajoutés ailleurs — « 12 puis 9 ».
// Désormais :
// - la liste n'est JAMAIS envoyée automatiquement : seulement par
//   `synchroniserMagasins`, qui relit le serveur et FUSIONNE avant d'écrire ;
// - toute lecture du serveur est fusionnée avec la copie locale (aucun magasin
//   perdu ; la modification la plus récente l'emporte ; suppression explicite) ;
// - la base refuse elle-même de perdre un magasin (PROTECTION_LISTE_MAGASINS).
const MAGASINS_KEY = 'leclaire_magasins';

/**
 * Marques « SMS déjà envoyé » (anniversaire du jour, lunettes prêtes,
 * renouvellement, vente) : ensembles partagés par les postes d'encadrement.
 * Remplacée en bloc, la copie d'un poste effaçait les marques posées par un
 * autre, et les mêmes SMS repartaient (doublons facturés).
 * Elles sont désormais FUSIONNÉES à trois (dernière version connue du serveur,
 * version du serveur, version de ce poste) : une marque ajoutée n'importe où
 * est gardée ; une marque retirée exprès (envoi refusé, à retenter) reste retirée.
 */
const CLE_MARQUES_SMS = /^leclaire_sms_(done_[a-z_]+|anniv)$/;
/**
 * Renvoie la chaîne JSON à réellement stocker en local pour une clé donnée à
 * partir de la valeur cloud. Pour `leclaire_magasins`, fusionne avec le local.
 */
function reconcilePulledValue(key: string, cloudValueStr: string, precedentStr?: string): string {
  if (CLE_MARQUES_SMS.test(key)) {
    try {
      const local = JSON.parse(localStorage.getItem(key) || 'null');
      // Sans version précédente connue (démarrage) : simple réunion — mieux vaut
      // ne pas renvoyer un SMS que le renvoyer en double.
      const base = precedentStr ? JSON.parse(precedentStr) : null;
      return JSON.stringify(fusionnerMarquesSms(base, JSON.parse(cloudValueStr), local));
    } catch { return cloudValueStr; }
  }
  // Liste partagée modifiée ICI depuis la dernière version reçue (envoi en
  // cours ou en attente) : la version du serveur est fusionnée avec la copie
  // locale au lieu de la remplacer — sinon l'ajout pas encore parti disparaît
  // de l'appareil, puis du serveur au prochain envoi.
  if (key !== MAGASINS_KEY && precedentStr) {
    try {
      const cloud = JSON.parse(cloudValueStr);
      const local = JSON.parse(localStorage.getItem(key) || 'null');
      const base = JSON.parse(precedentStr);
      if (listeAvecIds(cloud) && listeAvecIds(local) && listeAvecIds(base) && JSON.stringify(local) !== precedentStr) {
        return JSON.stringify(fusionnerListes(base, local, cloud));
      }
    } catch { /* valeur non JSON : version du serveur */ }
  }
  if (key !== MAGASINS_KEY) return cloudValueStr;
  try {
    const cloud = JSON.parse(cloudValueStr);
    if (!Array.isArray(cloud)) return JSON.stringify(lireRegistreMagasins());
    return JSON.stringify(fusionnerMagasins(lireRegistreMagasins(), cloud));
  } catch {
    return cloudValueStr;
  }
}

/** Empreinte d'une liste de magasins, indépendante de l'ordre. */
function empreinteMagasins(liste: unknown): string {
  return JSON.stringify(fusionnerMagasins(liste)
    .map(m => JSON.stringify(Object.keys(m).sort().map(k => [k, (m as any)[k]])))
    .sort());
}

/** La copie locale contient-elle quelque chose que le serveur n'a pas ? */
function magasinsEnAvanceSurServeur(cloudValueStr: string, fusionStr: string): boolean {
  try {
    return empreinteMagasins(JSON.parse(cloudValueStr)) !== empreinteMagasins(JSON.parse(fusionStr));
  } catch {
    return true;
  }
}

let synchroMagasinsEnCours: Promise<boolean> | null = null;
/** Dernière comparaison réussie avec la liste du serveur (horloge de ce poste). */
let derniereSynchroMagasins = 0;
/** Relecture de la liste du serveur au moins toutes les 2 minutes (application ouverte). */
const VERIF_MAGASINS_MS = 120_000;

/**
 * Synchronise la liste des magasins SANS PERTE : relit la liste du serveur, la
 * fusionne avec celle de cet appareil, enregistre le résultat ici puis sur le
 * serveur s'il lui manque quelque chose. Renvoie true si le serveur est à jour.
 * Lève une erreur si le serveur n'a pas pu être lu ou écrit.
 *
 * Est envoyé : tout ce que ce poste connaît (magasins de la configuration de
 * l'enseigne compris). Avant, un magasin saisi dans « Configuration de
 * l'enseigne », ou ajouté pendant que l'envoi échouait, restait sur un seul
 * appareil (« 12 magasins sur l'ordinateur, 9 sur l'iPhone »).
 */
export async function synchroniserMagasins(): Promise<boolean> {
  if (!FIREBASE_DATA_ENABLED) return true;
  if (synchroMagasinsEnCours) return synchroMagasinsEnCours;
  synchroMagasinsEnCours = (async () => {
    const marque = magasinsAEnvoyer();
    const doc = await kvGetDoc<{ value: unknown }>(APP_DATA, MAGASINS_KEY);
    const cloud = Array.isArray(doc?.value) ? doc!.value as unknown[] : [];
    // Copie locale : registre + serveur (la liste reçue n'est pas à renvoyer).
    saveMagasins(fusionnerMagasins(lireRegistreMagasins(), cloud), { depuisServeur: true });
    // Liste envoyée : tout ce que ce poste connaît, la version du serveur
    // l'emportant à date de modification égale.
    const complete = fusionnerMagasins(listeCompleteMagasins(), cloud);
    const fusionStr = JSON.stringify(complete);
    if (complete.length > 0 && magasinsEnAvanceSurServeur(JSON.stringify(cloud), fusionStr)) {
      // Pas de file d'attente : en cas d'échec, c'est cette fonction qui
      // réessaie, avec une liste relue et fusionnée à nouveau.
      await kvSetDoc(APP_DATA, MAGASINS_KEY, { value: complete, updated_at: new Date().toISOString() }, false, { fileAttente: false });
      logger.log(`✅ Liste des magasins envoyée au serveur (${complete.filter(m => !m.supprime).length} magasins)`);
    }
    lastSnapshot.set(MAGASINS_KEY, fusionStr);
    marquerMagasinsEnvoyes(marque);
    derniereSynchroMagasins = Date.now();
    return true;
  })();
  try {
    return await synchroMagasinsEnCours;
  } finally {
    synchroMagasinsEnCours = null;
  }
}

let minuterieMagasins: ReturnType<typeof setTimeout> | null = null;
let delaiNouvelEssaiMagasins = 0;

/**
 * Programme une synchronisation de la liste des magasins. `toujours` : même si
 * rien n'est marqué « à envoyer » (vérification au démarrage, périodique…).
 * En cas d'échec (réseau, session expirée), nouvel essai de plus en plus espacé
 * (15 s, 30 s… jusqu'à 5 min) tant que la liste n'est pas arrivée au serveur.
 */
export function programmerSynchroMagasins(delai = 800, toujours = false): void {
  if (!FIREBASE_DATA_ENABLED || typeof window === 'undefined') return;
  if (minuterieMagasins) clearTimeout(minuterieMagasins);
  minuterieMagasins = setTimeout(async () => {
    minuterieMagasins = null;
    const enAttente = !!magasinsAEnvoyer();
    if (!toujours && !enAttente) return;
    // Sans session, le serveur refuserait : reprise au prochain cycle de
    // synchronisation, qui ne tourne qu'une fois l'utilisateur connecté.
    if (!(await getValidAccessToken().catch(() => null))) return;
    try {
      await synchroniserMagasins();
      delaiNouvelEssaiMagasins = 0;
    } catch (err) {
      logNetworkAware('⚠️ Synchronisation de la liste des magasins (nouvel essai programmé)', err);
      if (!enAttente && !magasinsAEnvoyer()) return;
      delaiNouvelEssaiMagasins = Math.min(delaiNouvelEssaiMagasins ? delaiNouvelEssaiMagasins * 2 : 15_000, 300_000);
      programmerSynchroMagasins(delaiNouvelEssaiMagasins, true);
    }
  }, delai);
}

/** À chaque cycle de synchronisation : envoi en attente, ou relecture périodique de la liste du serveur. */
function verifierMagasinsAuCycle(): void {
  if (minuterieMagasins || synchroMagasinsEnCours) return;
  if (magasinsAEnvoyer()) programmerSynchroMagasins(0, true);
  else if (Date.now() - derniereSynchroMagasins > VERIF_MAGASINS_MS) programmerSynchroMagasins(0, true);
}

// Toute modification de la liste faite sur ce poste part vers le serveur sans
// attendre (et sans dépendre de l'écran où elle a été faite).
if (typeof window !== 'undefined') {
  window.addEventListener(EVENEMENT_MAGASINS, () => { if (magasinsAEnvoyer()) programmerSynchroMagasins(); });
  window.addEventListener('online', () => { if (magasinsAEnvoyer()) programmerSynchroMagasins(0, true); });
}

const listeners = new Map<string, Set<(value: any) => void>>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollCadence = 0;
let unsubLive: (() => void) | null = null;
let unsubLiveStatus: (() => void) | null = null;
let lastSnapshot = new Map<string, string>();
let pollInFlight = false;
// Filigrane du dernier pull réussi (P6 — sync incrémental). Tant qu'il est null,
// le prochain tick fait un pull COMPLET ; ensuite il ne demande que les documents
// modifiés depuis ce filigrane, renvoyé par le serveur (`serverTime`).
let appDataSince: string | null = null;

export async function initSupabaseSync() {
  logger.log('✅ Synchronisation Supabase prête');
  return true;
}

export async function saveToSupabase(key: string, value: any, _skipLocalStorage = false): Promise<boolean> {
  if (!FIREBASE_DATA_ENABLED) return true;
  try {
    if (value === null || value === undefined) {
      try {
        await kvDeleteDoc(APP_DATA, key);
        logger.log(`🗑️ Supprimé sur Supabase: ${key}`);
      } catch (delErr) {
        // Le rôle anon n'a PAS le droit de DELETE sur `app_data` (par
        // conception : la suppression sécurisée passe par l'Edge Function en
        // service_role). Réessayer est inutile — la donnée reste simplement en
        // base, ce qui est bénin. On le signale une seule fois par clé, en
        // discret, sans casser le flux de sauvegarde ni polluer la console.
        if (isPermissionError(delErr)) {
          if (!deleteDeniedWarned.has(key)) {
            deleteDeniedWarned.add(key);
            logger.warn(`ℹ️ Suppression cloud ignorée pour ${key} (DELETE non autorisé en accès direct ; donnée conservée en base).`);
          }
          return true;
        }
        throw delErr;
      }
      return true;
    }
    if (Array.isArray(value) && value.length === 0) {
      logger.warn(`🛡️ Push Supabase ignoré pour tableau vide: ${key}`);
      return true;
    }
    // Marques SMS : fusion avec celles du serveur (aucune marque d'un autre poste perdue).
    if (CLE_MARQUES_SMS.test(key)) {
      const actuel = await kvGetDoc<{ value?: unknown }>(APP_DATA, key).catch(() => null);
      const precedent = lastSnapshot.get(key);
      const base = precedent ? JSON.parse(precedent) : null;
      value = fusionnerMarquesSms(base, actuel?.value, value);
    }
    // Liste partagée (éléments avec identifiant : mouvements de caisse, rendez-
    // vous, demandes de devis…) : FUSION avec ce qui a été enregistré entre-temps
    // sur un autre appareil. Avant, la copie de cet appareil remplaçait celle du
    // serveur : l'ajout fait ailleurs quelques secondes plus tôt disparaissait.
    let fusionnee = false;
    let ecrite = false;
    if (key !== MAGASINS_KEY && !CLE_MARQUES_SMS.test(key) && listeAvecIds(value)) {
      try {
        const precedent = lastSnapshot.get(key);
        const base = precedent ? JSON.parse(precedent) : null;
        // Écriture conditionnelle avec fusion (aucun ajout d'un autre appareil écrasé).
        const resultat = await kvEcrireListeFusionnee(key, base, value as any[], value);
        fusionnee = JSON.stringify(resultat) !== JSON.stringify(value);
        value = resultat;
        ecrite = true;
      } catch { /* serveur injoignable : écriture habituelle ci-dessous (réessais, file d'attente) */ }
    }
    if (!ecrite) await kvSetDoc(APP_DATA, key, { value, updated_at: new Date().toISOString() });
    if (CLE_MARQUES_SMS.test(key) || listeAvecIds(value)) lastSnapshot.set(key, JSON.stringify(value));
    if (fusionnee) {
      // La copie de cet appareil reçoit aussi ce qui venait d'ailleurs.
      try {
        const { setItemWithoutSync } = await import('./autoSync');
        const texte = JSON.stringify(value);
        const ancien = localStorage.getItem(key);
        setItemWithoutSync(key, texte);
        listeners.get(key)?.forEach(cb => cb(value));
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: texte, oldValue: ancien, storageArea: localStorage }));
        window.dispatchEvent(new CustomEvent('supabase-realtime-update', { detail: { key, value } }));
      } catch { /* hors navigateur */ }
    }
    logger.log(`✅ Enregistré sur Supabase: ${key}`);
    return true;
  } catch (err) {
    // Un AbortError (timeout réseau/fonction edge lente) est transitoire : le
    // retry de pushWithRetry le re-tentera. On évite un log d'erreur bruyant.
    const name = (err as Error)?.name || '';
    const msg = (err as Error)?.message || '';
    if (name === 'AbortError' || /aborted|timeout/i.test(msg)) {
      logger.warn(`⏳ saveToSupabase (${key}) interrompu (transitoire), nouvelle tentative programmée`);
    } else if (isAuthError(err) || isNoSessionError(err)) {
      // Session absente/expirée : bénin (cache local conservé, re-poussé à la
      // reconnexion). On ne pollue pas la console — on relaie l'erreur pour que
      // le retry l'abandonne proprement.
    } else {
      logger.error(`❌ Erreur saveToSupabase (${key}):`, err);
    }
    throw err;
  }
}

export async function loadFromSupabase<T>(key: string, defaultValue: T[] = []): Promise<T[]> {
  if (!FIREBASE_DATA_ENABLED) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  }
  try {
    const doc = await kvGetDoc<{ value: T[] }>(APP_DATA, key);
    return doc?.value ?? defaultValue;
  } catch (err) {
    // Session absente/expirée ou réseau : on retombe sur le cache local (silencieux
    // si pas de session, warn discret sinon).
    logNetworkAware('⚠️ loadFromSupabase (cache local conservé)', err);
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  }
}

function ensurePolling() {
  if (pollTimer || !FIREBASE_DATA_ENABLED) return;
  const tick = async () => {
    // Garde anti-empilement : ne pas lancer un nouveau cycle si le précédent
    // n'est pas terminé (edge function lente) → évite les requêtes concurrentes.
    if (pollInFlight) return;
    // Ne pas interroger le réseau quand l'onglet est en arrière-plan :
    // économise la bande passante et évite les à-coups au retour.
    if (typeof document !== 'undefined' && document.hidden) return;
    // Pas de session valide (utilisateur non connecté / session pas encore
    // résolue) : inutile d'interroger l'edge function, elle renverrait 401.
    // On saute ce cycle SILENCIEUSEMENT (le polling reprend dès la connexion).
    const token = await getValidAccessToken();
    if (!token) return;
    pollInFlight = true;
    try {
      // Pull incrémental : on ne demande que les docs modifiés depuis le dernier
      // filigrane (premier tick = pull complet car appDataSince est null).
      const { items: docs, serverTime } = await kvGetCollectionDelta<{ id: string; value: any }>(APP_DATA, appDataSince);
      if (serverTime) appDataSince = serverTime;
      const { setItemWithoutSync } = await import('./autoSync').catch(() => ({
        setItemWithoutSync: (k: string, v: string) => localStorage.setItem(k, v),
      }));
      for (const d of docs) {
        const key = d.id;
        if (isStructuredKey(key)) continue;
        const rawStr = JSON.stringify(d.value);
        const precedentStr = lastSnapshot.get(key);
        if (precedentStr === rawStr) continue;
        lastSnapshot.set(key, rawStr);
        // Fusion pour la liste des magasins (ne jamais écraser un ajout local).
        const valueStr = reconcilePulledValue(key, rawStr, precedentStr);
        const oldValue = localStorage.getItem(key);
        setItemWithoutSync(key, valueStr);
        if (key === MAGASINS_KEY) {
          window.dispatchEvent(new CustomEvent(EVENEMENT_MAGASINS));
          // Le serveur a reçu une liste incomplète (ancien appareil) : on lui
          // renvoie la liste complète.
          if (magasinsEnAvanceSurServeur(rawStr, valueStr)) programmerSynchroMagasins(0, true);
        }
        const emitted = key === MAGASINS_KEY ? JSON.parse(valueStr) : d.value;
        listeners.get(key)?.forEach(cb => cb(emitted));
        listeners.get('*')?.forEach(cb => cb({ key, value: emitted }));
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: valueStr, oldValue, storageArea: localStorage }));
        window.dispatchEvent(new CustomEvent('supabase-realtime-update', { detail: { key, value: emitted } }));
      }
      // Liste des magasins : envoi en attente sur ce poste, ou relecture directe
      // de la liste du serveur (indépendante du suivi des modifications).
      verifierMagasinsAuCycle();
    } catch (err) {
      // Erreurs d'auth / absence de session : TOTALEMENT SILENCIEUSES ici. Le
      // polling s'exécute en boucle (toutes les quelques secondes) ; pendant une
      // rotation de token, une déconnexion ou avant résolution de la session,
      // un cycle peut échouer avec 401/NO_SESSION. C'est bénin (cache conservé)
      // et le cycle suivant repart tout seul — inutile de polluer la console.
      if (!isAuthError(err) && !isNoSessionError(err)) {
        logNetworkAware('⚠️ Polling Supabase app_data', err);
      }
    } finally {
      pollInFlight = false;
    }
  };
  // Cadence adaptative : lente si le canal temps réel `app_data` est connecté
  // (le polling n'est plus qu'un filet de sécurité), rapide sinon.
  const applyCadence = () => {
    const target = isLive(APP_DATA) ? SLOW_POLL_MS : FAST_POLL_MS;
    if (pollTimer && pollCadence === target) return;
    if (pollTimer) clearInterval(pollTimer);
    pollCadence = target;
    // Onglet caché : aucun tick (le handler 'visibilitychange' rattrape au retour).
    pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      tick();
    }, target);
  };

  // Temps réel : tout changement sur public.app_data déclenche un pull immédiat,
  // au lieu d'attendre jusqu'à 8 s le prochain tick.
  if (!unsubLive) unsubLive = subscribeEntityChanges(APP_DATA, () => { tick(); });
  if (!unsubLiveStatus) {
    unsubLiveStatus = onLiveStatusChange((table) => {
      if (table !== 'app_data') return;
      applyCadence();
      tick(); // resynchronisation immédiate à la (re)connexion
    });
  }

  tick();
  applyCadence();
  // Rafraîchir immédiatement lorsque l'utilisateur revient sur l'onglet.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });
  }
}

export function subscribeToChanges(key: string, callback: (value: any) => void): () => void {
  if (!FIREBASE_DATA_ENABLED) return () => {};
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(callback);
  ensurePolling();
  return () => {
    const set = listeners.get(key);
    if (set) { set.delete(callback); if (set.size === 0) listeners.delete(key); }
  };
}

export async function unsubscribeAll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  pollCadence = 0;
  unsubLive?.(); unsubLive = null;
  unsubLiveStatus?.(); unsubLiveStatus = null;
  pollInFlight = false;
  listeners.clear();
  lastSnapshot = new Map();
  appDataSince = null; // prochain démarrage → pull complet
  logger.log('🛑 Désinscription de tous les changements');
}

export async function syncAllToSupabase(): Promise<{ success: number; errors: number }> {
  if (!FIREBASE_DATA_ENABLED) return { success: 0, errors: 0 };
  let success = 0, errors = 0;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('leclaire_') && key !== MAGASINS_KEY &&
        !key.includes('session') && !key.includes('current_user') &&
        !key.includes('sync_registry') && !key.includes('migrated') &&
        !isStructuredKey(key)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);
      if (value) { await saveToSupabase(key, JSON.parse(value)); success++; }
    } catch (err) { logger.error(`Erreur sync ${key}:`, err); errors++; }
  }
  // Liste des magasins : fusionnée avec le serveur, jamais écrasée.
  try { await synchroniserMagasins(); success++; } catch { errors++; }
  logger.log(`✅ Synchronisation: ${success} réussies, ${errors} erreurs`);
  return { success, errors };
}

/**
 * Dernier téléchargement COMPLET des réglages (app_data). Au démarrage, trois
 * mécanismes téléchargeaient chacun la totalité, coup sur coup : on n'en fait
 * plus qu'un, les autres repartent de ce point (téléchargement des seules
 * modifications).
 */
let dernierPullCompletA = 0;
export function pullCompletRecent(ms = 30_000): boolean {
  return Date.now() - dernierPullCompletA < ms;
}

export async function loadAllFromSupabase(): Promise<number> {
  if (!FIREBASE_DATA_ENABLED) return 0;
  try {
    const debut = new Date().toISOString();
    const docs = await kvGetCollection<{ id: string; value: any }>(APP_DATA);
    dernierPullCompletA = Date.now();
    // Le prochain cycle du poller ne demandera que ce qui a changé depuis.
    if (!appDataSince) appDataSince = debut;
    const { setItemWithoutSync } = await import('./autoSync').catch(() => ({
      setItemWithoutSync: (k: string, v: string) => localStorage.setItem(k, v),
    }));
    let count = 0, skipped = 0;
    for (const d of docs) {
      const key = d.id;
      if (isStructuredKey(key)) { skipped++; continue; }
      const rawStr = JSON.stringify(d.value);
      // Fusion pour la liste des magasins (préserve les ajouts locaux non poussés).
      const mergedStr = reconcilePulledValue(key, rawStr, lastSnapshot.get(key));
      setItemWithoutSync(key, mergedStr);
      lastSnapshot.set(key, rawStr);
      // Si la fusion a fait apparaître des magasins locaux absents du cloud,
      // on renvoie la liste fusionnée pour que le cloud (et les autres appareils)
      // convergent — sinon l'ajout resterait bloqué sur ce seul navigateur.
      if (key === MAGASINS_KEY) window.dispatchEvent(new CustomEvent(EVENEMENT_MAGASINS));
      count++;
    }
    // Liste des magasins : comparée au serveur à CHAQUE démarrage, même si la
    // ligne n'existe pas encore sur le serveur. Ce que ce poste connaît en plus
    // (magasin ajouté hors connexion, configuration de l'enseigne…) est envoyé ;
    // ce que le serveur a en plus est ajouté ici.
    programmerSynchroMagasins(0, true);
    logger.log(`📥 ${count} clés chargées depuis app_data Supabase (${skipped} clés structurées ignorées)`);
    return count;
  } catch (err) {
    logger.error('Erreur loadAllFromSupabase:', err);
    return 0;
  }
}
