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

import { kvGetCollection, kvGetCollectionDelta, kvGetDoc, kvSetDoc, kvDeleteDoc } from '../utils/supabaseDirect';
import { FIREBASE_DATA_ENABLED } from '../utils/firebaseClient';
import { isStructuredKey } from './structuredKeys';
import { logNetworkAware, isAuthError, isNoSessionError, isPermissionError } from '../utils/networkErrors';
import { getValidAccessToken } from '../utils/supabaseClient';
import { subscribeEntityChanges, onLiveStatusChange, isLive, SLOW_POLL_MS } from '../utils/supabaseLive';

const APP_DATA = 'app_data';

// Clés pour lesquelles on a déjà signalé un DELETE refusé (droits anon) : évite
// de répéter le même message à chaque suppression tentée.
const deleteDeniedWarned = new Set<string>();

/** Cadence de repli quand le canal temps réel `app_data` n'est pas connecté. */
const FAST_POLL_MS = 8000;

// Clé de la liste des magasins : cas particulier. Elle est modifiable hors-ligne
// (ajout d'un magasin) et son push cloud peut échouer/traîner. Un simple écrasement
// par la copie cloud (potentiellement périmée) ferait DISPARAÎTRE au rechargement
// un magasin ajouté localement. On FUSIONNE donc cloud + local (union par id) :
// - un magasin ajouté localement (pas encore poussé) est conservé ;
// - un magasin ajouté sur un autre appareil apparaît aussi.
const MAGASINS_KEY = 'leclaire_magasins';

/**
 * Renvoie la chaîne JSON à réellement stocker en local pour une clé donnée à
 * partir de la valeur cloud. Pour `leclaire_magasins`, fusionne avec le local.
 */
function reconcilePulledValue(key: string, cloudValueStr: string): string {
  if (key !== MAGASINS_KEY) return cloudValueStr;
  try {
    const cloud = JSON.parse(cloudValueStr);
    const localStr = localStorage.getItem(MAGASINS_KEY);
    const local = localStr ? JSON.parse(localStr) : [];
    if (!Array.isArray(cloud) || !Array.isArray(local)) return cloudValueStr;
    const parId = new Map<string, any>();
    // Base = cloud, puis on complète avec les magasins locaux absents du cloud.
    for (const m of cloud) if (m && m.id) parId.set(m.id, m);
    for (const m of local) if (m && m.id && !parId.has(m.id)) parId.set(m.id, m);
    return JSON.stringify(Array.from(parId.values()));
  } catch {
    return cloudValueStr;
  }
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
    await kvSetDoc(APP_DATA, key, { value, updated_at: new Date().toISOString() });
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
        if (lastSnapshot.get(key) === rawStr) continue;
        lastSnapshot.set(key, rawStr);
        // Fusion pour la liste des magasins (ne jamais écraser un ajout local).
        const valueStr = reconcilePulledValue(key, rawStr);
        const oldValue = localStorage.getItem(key);
        setItemWithoutSync(key, valueStr);
        const emitted = key === MAGASINS_KEY ? JSON.parse(valueStr) : d.value;
        listeners.get(key)?.forEach(cb => cb(emitted));
        listeners.get('*')?.forEach(cb => cb({ key, value: emitted }));
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: valueStr, oldValue, storageArea: localStorage }));
        window.dispatchEvent(new CustomEvent('supabase-realtime-update', { detail: { key, value: emitted } }));
      }
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
    pollTimer = setInterval(tick, target);
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
    if (key?.startsWith('leclaire_') &&
        !key.includes('session') && !key.includes('current_user') &&
        !key.includes('sync_registry') && !key.includes('migrated')) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);
      if (value) { await saveToSupabase(key, JSON.parse(value)); success++; }
    } catch (err) { logger.error(`Erreur sync ${key}:`, err); errors++; }
  }
  logger.log(`✅ Synchronisation: ${success} réussies, ${errors} erreurs`);
  return { success, errors };
}

export async function loadAllFromSupabase(): Promise<number> {
  if (!FIREBASE_DATA_ENABLED) return 0;
  try {
    const docs = await kvGetCollection<{ id: string; value: any }>(APP_DATA);
    const { setItemWithoutSync } = await import('./autoSync').catch(() => ({
      setItemWithoutSync: (k: string, v: string) => localStorage.setItem(k, v),
    }));
    let count = 0, skipped = 0;
    for (const d of docs) {
      const key = d.id;
      if (isStructuredKey(key)) { skipped++; continue; }
      const rawStr = JSON.stringify(d.value);
      // Fusion pour la liste des magasins (préserve les ajouts locaux non poussés).
      const mergedStr = reconcilePulledValue(key, rawStr);
      setItemWithoutSync(key, mergedStr);
      lastSnapshot.set(key, rawStr);
      // Si la fusion a fait apparaître des magasins locaux absents du cloud,
      // on repousse la liste fusionnée pour que le cloud (et les autres appareils)
      // convergent — sinon l'ajout resterait bloqué sur ce seul navigateur.
      if (key === MAGASINS_KEY && mergedStr !== rawStr) {
        try {
          const merged = JSON.parse(mergedStr);
          saveToSupabase(MAGASINS_KEY, merged, true).catch(() => {});
        } catch {}
      }
      count++;
    }
    logger.log(`📥 ${count} clés chargées depuis app_data Supabase (${skipped} clés structurées ignorées)`);
    return count;
  } catch (err) {
    logger.error('Erreur loadAllFromSupabase:', err);
    return 0;
  }
}
