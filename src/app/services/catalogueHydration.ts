import { logger } from '../utils/logger';
/**
 * Hydratation des catalogues globaux depuis Firebase vers le cache localStorage.
 */

import { collection, query, where, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { chargerCatalogue, CATALOGUE_KEY_TO_TYPE, CATALOGUE_TYPE_TO_KEY } from './catalogueService';
import { safeReplaceLocalArray } from './safeHydrate';

function notify() {
  try { window.dispatchEvent(new CustomEvent('catalogues-updated')); } catch {}
  try { window.dispatchEvent(new CustomEvent('leclaire-sync-update')); } catch {}
}

async function hydrateOne(lsKey: string, catType: string) {
  const items = await chargerCatalogue(catType);
  safeReplaceLocalArray(lsKey, items);
  logger.log(`💾 Catalogue ${catType} : ${items.length} items`);
}

export async function hydrateCatalogues(): Promise<void> {
  await Promise.all(
    Object.entries(CATALOGUE_KEY_TO_TYPE).map(([lsKey, catType]) =>
      hydrateOne(lsKey, catType).catch(e => logger.error('❌ hydrate', catType, e))
    )
  );
  notify();
}

let unsubscribeListener: (() => void) | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function subscribeCataloguesRealtime(): () => void {
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

  unsubscribeListener = onSnapshot(collection(db, 'catalogues'), snap => {
    const changedTypes = new Set<string>();
    snap.docChanges().forEach(change => {
      const catType = change.doc.data()?.cat_type;
      if (catType) changedTypes.add(catType);
    });
    changedTypes.forEach(catType => {
      const lsKey = CATALOGUE_TYPE_TO_KEY[catType];
      if (lsKey) hydrateOne(lsKey, catType).then(notify).catch(e => logger.error('❌ rehydrate catalogue:', e));
    });
  });

  pollInterval = setInterval(() => {
    hydrateCatalogues().catch(e => logger.error('❌ poll catalogues:', e));
  }, 30_000);

  return () => {
    if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  };
}
