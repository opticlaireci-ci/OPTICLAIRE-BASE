import { logger } from '../utils/logger';
/**
 * Hydratation clients depuis FIRESTORE vers le cache localStorage.
 *
 * Modèle du STOCK : lecture DIRECTE Firestore (source de vérité partagée) →
 * cache localStorage (format camelCase attendu par l'UI) → événement de MàJ.
 * Temps réel via `onSnapshot` Firestore : cohérent sur tous les navigateurs.
 */

import { type ClientRow, chargerClients, subscribeClientsMagasin } from './clientsService';
import { safeReplaceLocalArray } from './safeHydrate';

function snakeToCamel(r: ClientRow): any {
  return {
    id: r.id, numeroClient: r.numero_client, nom: r.nom, telephone: r.telephone,
    telephone2: r.telephone2 || '', email: r.email || '', adresse: r.adresse || '',
    profession: r.profession || '', jourNaissance: r.jour_naissance || '',
    moisNaissance: r.mois_naissance || '', anneeNaissance: r.annee_naissance || '',
    matriculeAssurance: r.matricule_assurance || '', entreprise: r.entreprise || '',
    notes: r.notes || '', solde: r.solde, dateEdition: r.date_edition, source: r.source,
  };
}

function writeCache(magasinId: string, rows: ClientRow[], authoritative = true) {
  // authoritative=false à l'hydratation initiale : un cloud transitoirement vide
  // ne doit pas effacer un cache client peuplé (anti-clignotement à la connexion).
  safeReplaceLocalArray(
    `leclaire_clients_magasin_${magasinId}`,
    rows.map(snakeToCamel),
    { authoritative },
  );
  try { window.dispatchEvent(new CustomEvent('leclaire-clients-update', { detail: { magasinId } })); } catch {}
}

async function hydrateOne(magasinId: string) {
  const rows = await chargerClients(magasinId);
  writeCache(magasinId, rows, false);
  logger.log(`💾 Cache clients magasin ${magasinId} : ${rows.length} entrées (Firestore direct)`);
}

export async function hydrateClients(magasinIds: string[]): Promise<void> {
  await Promise.all(magasinIds.map(id => hydrateOne(id).catch(e => logger.error('❌ hydrateClients', id, e))));
}

let unsubscribers: Array<() => void> = [];

/**
 * Temps réel Firestore (`onSnapshot`) : à chaque changement côté serveur, on
 * réécrit le cache local et on notifie l'UI. Fiable sur tous les navigateurs.
 */
export function subscribeClientsRealtime(magasinIds: string[]): () => void {
  unsubscribers.forEach(u => u());
  unsubscribers = magasinIds.map(id =>
    subscribeClientsMagasin(id, rows => writeCache(id, rows)),
  );
  return () => {
    unsubscribers.forEach(u => u());
    unsubscribers = [];
  };
}
