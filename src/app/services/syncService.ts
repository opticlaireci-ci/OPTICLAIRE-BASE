import { logger } from '../utils/logger';
/**
 * Service de synchronisation bidirectionnelle localStorage ↔ Firebase.
 * Même API publique conservée pour les imports existants.
 */

import { collection, getDocs, doc } from '../utils/firestoreCompat';
import { db, auth } from '../utils/firebaseClient';
import { onAuthStateChanged } from '../utils/authCompat';
import { logNetworkAware } from '../utils/networkErrors';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

const MIGRATION_KEY = 'leclaire_sync_v5_cloud_first_migrated';

let _onStatus: ((s: SyncStatus) => void) | null = null;
let _onDataUpdate: ((key: string, value: any) => void) | null = null;
let _pullInterval: ReturnType<typeof setInterval> | null = null;
let _initialPullDone = false;

// ── Push TOUTES les clés locales vers Firebase ────────────────────────────────
export async function pushAllToCloud(): Promise<{ success: boolean; count: number }> {
  if (!auth.currentUser) return { success: true, count: 0 };
  let count = 0;
  try {
    const { saveToSupabase } = await import('./supabaseRealtime');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('leclaire_')) continue;
      if (key.includes('session') || key.includes('current_user') || key === MIGRATION_KEY) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const val = JSON.parse(raw);
        if (Array.isArray(val) && val.length === 0) continue;
        const ok = await saveToSupabase(key, val, true);
        if (ok) count++;
      } catch {
        await saveToSupabase(key, raw, true);
        count++;
      }
    }
    logger.log(`✅ Push cloud: ${count} clés envoyées`);
    return { success: true, count };
  } catch (err) {
    logger.error('❌ Push cloud échoué:', err);
    return { success: false, count };
  }
}

// ── Pull depuis Firebase → localStorage ──────────────────────────────────────
export async function pullFromCloud(): Promise<{ success: boolean; count: number; receivedKeys: Set<string> }> {
  // Ne rien tenter tant que l'utilisateur n'est pas authentifié : les règles
  // Firestore exigent request.auth != null, donc un pull anonyme échouerait
  // toujours avec permission-denied (bruit inutile dans la console).
  if (!auth.currentUser) {
    return { success: true, count: 0, receivedKeys: new Set() };
  }
  try {
    const { setItemWithoutSync } = await import('./autoSync');
    const { isStructuredKey } = await import('./structuredKeys');

    const snap = await getDocs(collection(db, 'app_data'));
    const receivedKeys = new Set<string>();
    let count = 0;
    let skipped = 0;

    snap.docs.forEach(d => {
      const data = d.data();
      const key = data.key || d.id;
      if (!key) return;
      if (isStructuredKey(key)) { skipped++; return; }
      try {
        const newValue = JSON.stringify(data.value);
        if (localStorage.getItem(key) === newValue) return;
        setItemWithoutSync(key, newValue);
        receivedKeys.add(key);
        // Notifier les abonnés (ex. SyncContext → incrément de syncVersion) pour
        // que l'UI se rafraîchisse après un pull automatique (toutes les 30 s),
        // et pas seulement lors d'un sync manuel.
        _onDataUpdate?.(key, data.value);
        count++;
      } catch (e) {
        logger.error(`Erreur écriture ${key}:`, e);
      }
    });

    if (skipped > 0) logger.log(`🛡️ ${skipped} clés structurées préservées`);
    logger.log(`✅ Pull cloud: ${count} clés chargées`);

    receivedKeys.forEach(k => {
      window.dispatchEvent(new StorageEvent('storage', { key: k, storageArea: localStorage }));
    });

    return { success: true, count, receivedKeys };
  } catch (err) {
    logNetworkAware('⚠️ Pull cloud échoué', err);
    return { success: false, count: 0, receivedKeys: new Set() };
  }
}

// ── Sync forcé manuel ─────────────────────────────────────────────────────────
export async function forcSync(): Promise<void> {
  _onStatus?.('syncing');
  await pushAllToCloud();
  await pullFromCloud();
  _onStatus?.('synced');
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
export function startAutoSync(
  onStatus?: (s: SyncStatus) => void,
  onDataUpdate?: (key: string, value: any) => void
): () => void {
  _onStatus = onStatus ?? null;
  _onDataUpdate = onDataUpdate ?? null;
  _onStatus?.('syncing');

  const doInitialSync = () => {
    const hasMigrated = localStorage.getItem(MIGRATION_KEY) === '1';

    if (!hasMigrated) {
      logger.log('ℹ️ Synchronisation cloud active : pull initial Firebase');
      pullFromCloud()
        .then(({ success, count, receivedKeys }) => {
          logger.log(`ℹ️ ${count} clés depuis Firebase`);
          const itemsToPush: { key: string; value: any }[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith('leclaire_') || key === MIGRATION_KEY) continue;
            if (key.includes('session') || key.includes('current_user')) continue;
            if (receivedKeys.has(key)) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
              const val = JSON.parse(raw);
              if (Array.isArray(val) && val.length === 0) continue;
              itemsToPush.push({ key, value: val });
            } catch {
              itemsToPush.push({ key, value: raw });
            }
          }
          logger.log(`⬆️ Migration: ${itemsToPush.length} clés locales à envoyer`);
          import('./supabaseRealtime').then(({ saveToSupabase }) => {
            Promise.all(itemsToPush.map(it => saveToSupabase(it.key, it.value, true)));
          });
        })
        .then(() => {
          Storage.prototype.setItem.call(localStorage, MIGRATION_KEY, '1');
          _initialPullDone = true;
          _onStatus?.('synced');
        })
        .catch(() => { _initialPullDone = true; _onStatus?.('error'); });
    } else {
      pullFromCloud()
        .then(({ success }) => {
          _initialPullDone = true;
          _onStatus?.(success ? 'synced' : 'error');
        })
        .catch(() => { _initialPullDone = true; _onStatus?.('error'); });
    }
  };

  // Attendre l'auth Firebase avant de puller
  const unsubAuth = onAuthStateChanged(auth, user => {
    if (user) {
      unsubAuth();
      doInitialSync();
    }
  });

  // Pull périodique de secours. Le poller temps réel (supabaseRealtime, ~8s)
  // couvre déjà les mises à jour ; on espace donc ce pull à 60s et on l'ignore
  // quand l'onglet est en arrière-plan pour éviter les requêtes redondantes.
  if (_pullInterval) clearInterval(_pullInterval);
  _pullInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    pullFromCloud();
  }, 60_000);

  // Handlers NOMMÉS afin de pouvoir les retirer dans le cleanup (sinon fuite :
  // ils s'accumulent à chaque re-login / HMR et multiplient les pulls complets).
  const refresh = () => { pullFromCloud(); };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') pullFromCloud();
  };
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    if (_pullInterval) { clearInterval(_pullInterval); _pullInterval = null; }
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubAuth();
  };
}

export function stopAutoSync() {
  if (_pullInterval) { clearInterval(_pullInterval); _pullInterval = null; }
}
