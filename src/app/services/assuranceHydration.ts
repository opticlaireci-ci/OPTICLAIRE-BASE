import { logger } from '../utils/logger';
/**
 * Hydratation assurance depuis Firebase vers le cache localStorage.
 */

import { collection, query, where, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import {
  chargerFacturesAssurance, chargerReglementsAssurance, chargerRelevesAssurance,
  type FactureAssuranceRow, type ReglementAssuranceRow, type ReleveAssuranceRow,
} from './assuranceService';
import { safeReplaceLocalArray } from './safeHydrate';

function factureToCamel(r: FactureAssuranceRow): any {
  return { id: r.id, magasinId: r.magasin_id, numero: r.numero || '',
    dateFacture: r.date_facture || '', clientNom: r.client_nom || '',
    clientId: r.client_id || '', assurance: r.assurance || '',
    montantTotal: r.montant_total || 0, partAssurance: r.part_assurance || 0,
    partClient: r.part_client || 0, statut: r.statut || '', ...(r.data || {}) };
}
function reglementToCamel(r: ReglementAssuranceRow): any {
  return { id: r.id, magasinId: r.magasin_id || '', assurance: r.assurance || '',
    dateReglement: r.date_reglement || '', montant: r.montant || 0,
    reference: r.reference || '', ...(r.data || {}) };
}
function releveToCamel(r: ReleveAssuranceRow): any {
  return { id: r.id, magasinId: r.magasin_id || '', assurance: r.assurance || '',
    dateReleve: r.date_releve || '', montant: r.montant || 0, ...(r.data || {}) };
}

async function hydrateFacturesOne(magasinId: string) {
  const rows = await chargerFacturesAssurance(magasinId);
  safeReplaceLocalArray(`leclaire_factures_assurance_${magasinId}`, rows.map(factureToCamel));
  logger.log(`💾 Cache factures assurance ${magasinId} : ${rows.length}`);
}
async function hydrateReglements() {
  const rows = await chargerReglementsAssurance();
  safeReplaceLocalArray('leclaire_reglements_assurance', rows.map(reglementToCamel));
}
async function hydrateReleves() {
  const rows = await chargerRelevesAssurance();
  safeReplaceLocalArray('leclaire_releves_assurance', rows.map(releveToCamel));
}

export async function hydrateAssurance(magasinIds: string[]): Promise<void> {
  await Promise.all([
    ...magasinIds.map(id => hydrateFacturesOne(id).catch(e => logger.error('❌ hydrateFactures', id, e))),
    hydrateReglements().catch(e => logger.error('❌ hydrateReglements', e)),
    hydrateReleves().catch(e => logger.error('❌ hydrateReleves', e)),
  ]);
  try { window.dispatchEvent(new CustomEvent('assurance-updated')); } catch {}
}

let unsubscribeListeners: Array<() => void> = [];
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function subscribeAssuranceRealtime(magasinIds: string[]): () => void {
  unsubscribeListeners.forEach(fn => fn());
  unsubscribeListeners = [];
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

  magasinIds.forEach(magasinId => {
    const q = query(collection(db, 'factures_assurance'), where('magasin_id', '==', magasinId));
    unsubscribeListeners.push(onSnapshot(q, () => {
      hydrateFacturesOne(magasinId)
        .then(() => window.dispatchEvent(new CustomEvent('assurance-updated')))
        .catch(e => logger.error('❌ rehydrate factures:', e));
    }));
  });

  unsubscribeListeners.push(onSnapshot(collection(db, 'reglements_assurance'), () => {
    hydrateReglements().then(() => window.dispatchEvent(new CustomEvent('assurance-updated')));
  }));
  unsubscribeListeners.push(onSnapshot(collection(db, 'releves_assurance'), () => {
    hydrateReleves().then(() => window.dispatchEvent(new CustomEvent('assurance-updated')));
  }));

  pollInterval = setInterval(() => {
    hydrateAssurance(magasinIds).catch(e => logger.error('❌ poll assurance:', e));
  }, 30_000);

  return () => {
    unsubscribeListeners.forEach(fn => fn());
    unsubscribeListeners = [];
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  };
}
