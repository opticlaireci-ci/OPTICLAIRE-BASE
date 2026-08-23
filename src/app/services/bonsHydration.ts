import { logger } from '../utils/logger';
/**
 * Hydratation des bons depuis Firebase vers le cache localStorage.
 */

import { collection, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { chargerBons, rowToDistribution, rowToTransfert, rowToRetour,
  rowToCommande, rowToLivraison, rowToPeremption } from './bonsService';
import { safeReplaceLocalArray } from './safeHydrate';

function notify() {
  try { window.dispatchEvent(new CustomEvent('bons-updated')); } catch {}
  try { window.dispatchEvent(new CustomEvent('leclaire-sync-update')); } catch {}
}

export async function hydrateBons(magasinIds: string[]): Promise<void> {
  if (!magasinIds.length) return;
  const rows = await chargerBons(magasinIds);

  safeReplaceLocalArray('leclaire_db_bon-distribution', rows.filter(r => r.type === 'distribution').map(rowToDistribution));
  safeReplaceLocalArray('leclaire_db_bon-transfert', rows.filter(r => r.type === 'transfert').map(rowToTransfert));
  safeReplaceLocalArray('leclaire_db_bon-retour', rows.filter(r => r.type === 'retour').map(rowToRetour));
  safeReplaceLocalArray('leclaire_bons_commande', rows.filter(r => r.type === 'commande').map(rowToCommande));
  safeReplaceLocalArray('leclaire_bons_livraison', rows.filter(r => r.type === 'livraison').map(rowToLivraison));
  safeReplaceLocalArray('leclaire_bons_peremption', rows.filter(r => r.type === 'peremption').map(rowToPeremption));
  notify();
}

let unsubscribeListener: (() => void) | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function subscribeBonsRealtime(magasinIds: string[]): () => void {
  if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (!magasinIds.length) return () => {};

  unsubscribeListener = onSnapshot(collection(db, 'bons'), () => {
    hydrateBons(magasinIds).catch(e => logger.error('❌ rehydrate bons:', e));
  });

  pollInterval = setInterval(() => {
    hydrateBons(magasinIds).catch(e => logger.error('❌ poll bons:', e));
  }, 30_000);

  return () => {
    if (unsubscribeListener) { unsubscribeListener(); unsubscribeListener = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  };
}
