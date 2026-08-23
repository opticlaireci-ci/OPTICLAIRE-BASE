import { logger } from '../utils/logger';
/**
 * Hydratation des ventes depuis FIRESTORE vers le cache localStorage.
 *
 * Modèle du STOCK : lecture DIRECTE Firestore (source de vérité partagée) →
 * cache localStorage (format camelCase attendu par l'UI) → événement de MàJ.
 * Temps réel via `onSnapshot` Firestore : cohérent sur tous les navigateurs.
 */

import { type VenteSupabase, chargerVentes, subscriberVentesMagasin } from './ventesService';
import { safeReplaceLocalArray } from './safeHydrate';

function snakeToCamel(v: VenteSupabase): any {
  return {
    id: v.id, magasinId: v.magasin_id, type: v.type, date: v.date,
    numeroClient: v.numero_client, client: v.client, civilite: v.civilite,
    telephone: v.telephone, telephone2: v.telephone2, email: v.email,
    adresse: v.adresse, profession: v.profession, dateNaissance: v.date_naissance,
    soldeClient: v.solde_client, matriculeAssurance: v.matricule_assurance,
    entreprise: v.entreprise, ophtalmologue: v.ophtalmologue,
    telOphtalmologue: v.tel_ophtalmologue, cabinetOphtalmologue: v.cabinet_ophtalmologue,
    telCabinet: v.tel_cabinet, verres: v.verres || [], articles: v.articles || [],
    bonsAssurance: v.bons_assurance || [], recap: v.recap || {},
    totalBrut: v.total_brut, totalNet: v.total_net,
    editePar: v.edite_par, statut: v.statut,
    createdAt: v.created_at, updatedAt: v.updated_at,
  };
}

function writeCache(magasinId: string, rows: VenteSupabase[], authoritative = true) {
  // authoritative=false pour l'hydratation initiale : si le cloud renvoie VIDE
  // (hoquet réseau / cold-start), on PRÉSERVE le cache local peuplé au lieu de le
  // vider (évite le clignotement « les infos partent puis reviennent »).
  // authoritative=true pour le temps réel : reflète les vraies suppressions.
  safeReplaceLocalArray(`leclaire_ventes_${magasinId}`, rows.map(snakeToCamel), { authoritative });
  try { window.dispatchEvent(new CustomEvent('ventes-updated', { detail: { magasinId } })); } catch {}
}

async function hydrateOne(magasinId: string) {
  const rows = await chargerVentes(magasinId);
  writeCache(magasinId, rows, false);
  logger.log(`💾 Cache ventes magasin ${magasinId} : ${rows.length} entrées (Firestore direct)`);
}

export async function hydrateVentes(magasinIds: string[]): Promise<void> {
  await Promise.all(magasinIds.map(id => hydrateOne(id).catch(err => {
    logger.error(`❌ hydrateVentes ${id}:`, err);
  })));
}

let unsubscribers: Array<() => void> = [];

/**
 * Temps réel Firestore (`onSnapshot`) : on maintient un accumulateur par magasin
 * et on réécrit le cache local à chaque changement. Fiable sur tous les navigateurs.
 */
export function subscribeVentesRealtime(magasinIds: string[]): () => void {
  unsubscribers.forEach(u => u());

  unsubscribers = magasinIds.map(magasinId => {
    const map = new Map<string, VenteSupabase>();
    return subscriberVentesMagasin(
      magasinId,
      v => { map.set(v.id, v); writeCache(magasinId, Array.from(map.values())); },
      v => { map.set(v.id, v); writeCache(magasinId, Array.from(map.values())); },
      id => { map.delete(id); writeCache(magasinId, Array.from(map.values())); },
    );
  });

  return () => {
    unsubscribers.forEach(u => u());
    unsubscribers = [];
  };
}
