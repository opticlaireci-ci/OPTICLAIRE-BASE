/**
 * SERVICE DE RÉINITIALISATION (ADMIN)
 *
 * Purge DÉFINITIVE de données métier partagées : ventes/factures, devis/proforma
 * (même collection `ventes`), règlements, et clients. La suppression porte sur
 * Firestore (source de vérité, partagée entre tous les navigateurs/appareils)
 * ET sur les caches localStorage correspondants, avec notification de l'UI.
 *
 * ⚠️ Action irréversible : à réserver aux administrateurs et à protéger par une
 * confirmation forte côté UI.
 */

import { collection, getDocs, doc, deleteDoc, query, where } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';

export type ResetCible = 'ventes' | 'reglements' | 'clients';

export interface ResetResult {
  cible: ResetCible;
  supprimes: number;
  erreurs: number;
}

/**
 * Supprime les documents d'une collection Firestore. Si `magasinId` est fourni,
 * seuls les documents de ce magasin (champ `magasin_id`) sont supprimés ; sinon
 * TOUTE la collection est purgée.
 */
async function purgerCollection(nom: string, magasinId?: string): Promise<{ supprimes: number; erreurs: number }> {
  let supprimes = 0, erreurs = 0;
  const src = magasinId
    ? query(collection(db, nom), where('magasin_id', '==', magasinId))
    : collection(db, nom);
  const snap = await getDocs(src);
  // Suppression en petits lots parallèles pour rester rapide sans saturer.
  const ids = snap.docs.map(d => d.id);
  const LOT = 10;
  for (let i = 0; i < ids.length; i += LOT) {
    const lot = ids.slice(i, i + LOT);
    const res = await Promise.allSettled(lot.map(id => deleteDoc(doc(db, nom, id))));
    for (const r of res) { if (r.status === 'fulfilled') supprimes++; else erreurs++; }
  }
  return { supprimes, erreurs };
}

/** Retire du localStorage toutes les clés commençant par un des préfixes donnés. */
function purgerCacheLocal(prefixes: string[]) {
  const aSupprimer: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && prefixes.some(p => k === p || k.startsWith(p))) aSupprimer.push(k);
  }
  for (const k of aSupprimer) {
    localStorage.removeItem(k);
    window.dispatchEvent(new StorageEvent('storage', { key: k, storageArea: localStorage }));
  }
}

/**
 * Retire UNIQUEMENT les ventes du magasin réinitialisé du cache agrégé
 * 'leclaire_ventes_ALL', au lieu de vider tout le cache agrégé (ce qui ferait
 * disparaître à tort, le temps d'un rechargement Firestore, les ventes des
 * AUTRES magasins pour tout écran qui lit ce cache).
 */
function retirerMagasinDuCacheAgrege(mag: string) {
  try {
    const cle = 'leclaire_ventes_ALL';
    const raw = localStorage.getItem(cle);
    if (!raw) return;
    const liste = JSON.parse(raw);
    if (!Array.isArray(liste)) return;
    const filtre = liste.filter((v: any) => (v?.magasin_id || '').toUpperCase() !== mag);
    localStorage.setItem(cle, JSON.stringify(filtre));
  } catch { /* cache best-effort */ }
}

/**
 * Réinitialise les cibles demandées. Renvoie le détail par cible.
 * Les mises à jour (events) permettent aux écrans ouverts de se vider aussitôt.
 *
 * @param magasinId  Si fourni, la purge ne concerne QUE ce magasin ; sinon TOUS.
 */
export async function reinitialiserDonnees(cibles: ResetCible[], magasinId?: string): Promise<ResetResult[]> {
  const resultats: ResetResult[] = [];
  const mag = magasinId ? magasinId.toUpperCase() : undefined;

  if (cibles.includes('ventes')) {
    const r = await purgerCollection('ventes', mag);
    // Cache du magasin ciblé : on le vide entièrement (il n'a plus lieu d'être).
    // Cache agrégé 'ALL' : on RETIRE seulement les ventes de ce magasin — on ne
    // le vide pas complètement, sinon le Tableau de Bord Général (et tout autre
    // écran agrégé) afficherait à tort 0 pour TOUS les magasins pendant les
    // quelques instants précédant le prochain rechargement Firestore.
    if (mag) {
      purgerCacheLocal([`leclaire_ventes_${mag}`]);
      retirerMagasinDuCacheAgrege(mag);
    } else {
      purgerCacheLocal(['leclaire_ventes_']);
    }
    window.dispatchEvent(new CustomEvent('ventes-updated', { detail: { magasinId: mag || 'ALL' } }));
    resultats.push({ cible: 'ventes', ...r });
  }

  if (cibles.includes('reglements')) {
    const r = await purgerCollection('reglements', mag);
    // Le cache des règlements est global (indexé par vente) : on le vide dans
    // tous les cas, il se reconstruira au prochain chargement.
    purgerCacheLocal(['leclaire_reglements_cache']);
    window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key: 'leclaire_reglements_cache' } }));
    resultats.push({ cible: 'reglements', ...r });
  }

  if (cibles.includes('clients')) {
    const r = await purgerCollection('clients', mag);
    purgerCacheLocal(mag ? [`leclaire_clients_magasin_${mag}`] : ['leclaire_clients_magasin_']);
    window.dispatchEvent(new CustomEvent('leclaire-clients-update', { detail: { magasinId: mag || 'ALL' } }));
    resultats.push({ cible: 'clients', ...r });
  }

  return resultats;
}
