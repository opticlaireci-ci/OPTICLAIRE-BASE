import { logger } from '../utils/logger';
/**
 * Hydratation des inventaires depuis Firebase vers le cache localStorage.
 */

import { collection, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { chargerInventaires, rowToInventaire, replaceInventaires } from './inventairesService';
import { setItemWithoutSync } from './autoSync';

function notify() {
  try { window.dispatchEvent(new CustomEvent('inventaires-updated')); } catch {}
  try { window.dispatchEvent(new CustomEvent('leclaire-sync-update')); } catch {}
}

function readLocalInventaires(): any[] {
  try {
    const raw = localStorage.getItem('leclaire_inventaires');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

let repairAttempted = false;

function writeCacheAndNotify(items: any[]) {
  const json = JSON.stringify(items);
  let changed = true;
  try { changed = localStorage.getItem('leclaire_inventaires') !== json; } catch {}
  setItemWithoutSync('leclaire_inventaires', json);
  logger.log(`💾 Cache inventaires : ${items.length} entrées`);
  if (changed) notify();
}

export async function hydrateInventaires(magasinIds: string[]): Promise<void> {
  if (!magasinIds.length) return;
  const rows = await chargerInventaires(magasinIds);

  if (rows.length === 0 && !repairAttempted) {
    const local = readLocalInventaires();
    if (local.length > 0) {
      repairAttempted = true;
      logger.log(`🔧 Auto-réparation inventaires : push de ${local.length} entrées locales vers Firebase`);
      try {
        await replaceInventaires(local);
        const refreshed = await chargerInventaires(magasinIds);
        writeCacheAndNotify(refreshed.map(rowToInventaire));
      } catch (e) {
        logger.error('❌ Auto-réparation inventaires échouée (cache local préservé):', e);
      }
      return;
    }
  }

  if (rows.length === 0 && readLocalInventaires().length > 0) return;

  writeCacheAndNotify(rows.map(rowToInventaire));
}

let unsubscribeListener: (() => void) | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function subscribeInventairesRealtime(magasinIds: string[]): () => void {
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (!magasinIds.length) return () => {};

  unsubscribeListener = onSnapshot(collection(db, 'inventaires'), () => {
    hydrateInventaires(magasinIds).catch(e => logger.error('❌ rehydrate inventaires:', e));
  });

  pollInterval = setInterval(() => {
    hydrateInventaires(magasinIds).catch(e => logger.error('❌ poll inventaires:', e));
  }, 30_000);

  return () => {
    if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  };
}
