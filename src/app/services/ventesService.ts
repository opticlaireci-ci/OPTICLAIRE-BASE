import { logger } from '../utils/logger';
/**
 * SERVICE VENTES — lecture/écriture DIRECTES sur Firestore.
 *
 * Modèle identique au STOCK (`inventaireService.loadStockMagasin`) : on lit la
 * collection Firestore `ventes` EN DIRECT à l'affichage, sans cache intermédiaire
 * ni couche Convex. C'est le seul modèle qui reste cohérent sur tous les
 * navigateurs et appareils (aperçu Figma comme déploiement Vercel).
 */

import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, onSnapshot,
} from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { journaliserSuppression } from './auditLogService';
import { logNetworkAware, isAuthError, isNoSessionError } from '../utils/networkErrors';

export interface VenteSupabase {
  id: string;
  magasin_id: string;
  type: 'vente' | 'devis';
  date: string;
  numero_client?: string;
  client: string;
  civilite?: string;
  telephone?: string;
  telephone2?: string;
  email?: string;
  adresse?: string;
  profession?: string;
  date_naissance?: string;
  solde_client?: string;
  matricule_assurance?: string;
  entreprise?: string;
  ophtalmologue?: string;
  tel_ophtalmologue?: string;
  cabinet_ophtalmologue?: string;
  tel_cabinet?: string;
  verres: any[];
  articles: any[];
  bons_assurance: any[];
  recap: any;
  total_brut: number;
  total_net: number;
  edite_par: string;
  statut: string;
  created_at?: string;
  updated_at?: string;
}

const COLLECTION = 'ventes';

function sortByDateDesc<T extends { date?: string }>(arr: T[]): T[] {
  return arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** Clé de cache localStorage des ventes (par magasin, ou 'ALL' pour tous). */
export const ventesCacheKey = (magasinId: string) => `leclaire_ventes_${magasinId.toUpperCase()}`;

/** Lecture SYNCHRONE des dernières ventes connues (cache) — affichage immédiat. */
export function readVentesCache(magasinId: string): VenteSupabase[] {
  try {
    const raw = localStorage.getItem(ventesCacheKey(magasinId));
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

/** Écrit le cache + notifie les abonnés si les données ont changé. */
function writeVentesCache(magasinId: string, ventes: VenteSupabase[]) {
  try {
    const next = JSON.stringify(ventes);
    if (localStorage.getItem(ventesCacheKey(magasinId)) !== next) {
      localStorage.setItem(ventesCacheKey(magasinId), next);
      window.dispatchEvent(new CustomEvent('ventes-updated', { detail: { magasinId: magasinId.toUpperCase() } }));
    }
  } catch {}
}

/**
 * Insère/met à jour une vente dans le cache local (par magasin ET cache 'ALL')
 * pour que le prochain affichage montre IMMÉDIATEMENT la bonne valeur, sans
 * flash de l'ancien montant en attendant le fetch Firestore.
 */
function upsertVenteCache(vente: VenteSupabase) {
  const apply = (key: string) => {
    const list = readVentesCache(key);
    const idx = list.findIndex(v => v.id === vente.id);
    if (idx >= 0) list[idx] = vente;
    else list.unshift(vente);
    writeVentesCache(key, sortByDateDesc(list));
  };
  if (vente.magasin_id) apply(vente.magasin_id);
  apply('ALL');
}

/** Retire une vente du cache local (par magasin ET cache 'ALL'). */
function removeVenteCache(venteId: string) {
  for (const key of new Set(readVentesCache('ALL').map(v => v.magasin_id).concat('ALL'))) {
    const list = readVentesCache(key);
    const next = list.filter(v => v.id !== venteId);
    if (next.length !== list.length) writeVentesCache(key, next);
  }
}

/** Charge toutes les ventes d'un magasin DIRECTEMENT depuis Firestore. */
export async function chargerVentes(magasinId: string): Promise<VenteSupabase[]> {
  try {
    const q = query(collection(db, COLLECTION), where('magasin_id', '==', magasinId));
    const snap = await getDocs(q);
    const ventes = sortByDateDesc(snap.docs.map(d => ({ id: d.id, ...d.data() } as VenteSupabase)));
    writeVentesCache(magasinId, ventes);
    return ventes;
  } catch (err) {
    logNetworkAware('Erreur chargerVentes (Firestore)', err);
    return readVentesCache(magasinId);
  }
}

/** Charge toutes les ventes (tous magasins) DIRECTEMENT depuis Firestore. */
export async function chargerToutesLesVentes(): Promise<VenteSupabase[]> {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const ventes = sortByDateDesc(snap.docs.map(d => ({ id: d.id, ...d.data() } as VenteSupabase)));
    writeVentesCache('ALL', ventes);
    return ventes;
  } catch (err) {
    logger.error('Erreur chargerToutesLesVentes (Firestore):', err);
    return readVentesCache('ALL');
  }
}

/** Charge une vente par son id depuis Firestore. */
export async function chargerVenteParId(venteId: string): Promise<VenteSupabase | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, venteId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as VenteSupabase) : null;
  } catch (err) {
    logger.error('Erreur chargerVenteParId (Firestore):', err);
    return null;
  }
}

/** Crée une vente dans Firestore. */
export async function ajouterVente(
  vente: Omit<VenteSupabase, 'created_at' | 'updated_at'>
): Promise<VenteSupabase | null> {
  try {
    const now = new Date().toISOString();
    const data = { ...vente, created_at: now, updated_at: now } as VenteSupabase;
    // Écriture OPTIMISTE : on met le cache local à jour immédiatement pour que
    // l'interface affiche la vente sans attendre l'aller-retour réseau.
    upsertVenteCache(data);
    await setDoc(doc(db, COLLECTION, vente.id), data, { merge: true });
    logger.log('✅ Vente enregistrée sur Firestore:', vente.id);

    // SMS de remerciement pour une VENTE réelle (pas un devis). Idempotent :
    // un seul SMS par vente, en arrière-plan (n'impacte pas l'enregistrement).
    if (data.type === 'vente') {
      import('./smsService')
        .then(({ envoyerSmsRemerciementVente }) => envoyerSmsRemerciementVente({
          id: data.id, client: data.client, telephone: data.telephone,
        }))
        .catch(err => logger.warn('⚠️ SMS remerciement vente non envoyé:', err?.message || err));
    }

    return data;
  } catch (err) {
    // Session expirée/absente → warn discret (la vente est déjà dans le cache
    // local optimiste). On propage tout de même l'erreur pour que l'appelant
    // informe l'utilisateur qu'il doit se reconnecter pour synchroniser.
    if (isAuthError(err) || isNoSessionError(err)) {
      logNetworkAware('⚠️ ajouterVente (cache local conservé)', err);
    } else {
      logger.error('Erreur ajouterVente (Firestore):', err);
    }
    throw err;
  }
}

/** Met à jour une vente dans Firestore (merge partiel). */
export async function mettreAJourVente(
  venteId: string,
  updates: Partial<Omit<VenteSupabase, 'id' | 'created_at' | 'updated_at'>>
): Promise<VenteSupabase | null> {
  try {
    const ref = doc(db, COLLECTION, venteId);
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      logger.error('Erreur mettreAJourVente (Firestore): vente introuvable', venteId);
      return null;
    }
    const existing = { id: existingSnap.id, ...existingSnap.data() } as VenteSupabase;
    const payload = { ...existing, ...updates, updated_at: new Date().toISOString() } as VenteSupabase;
    await setDoc(ref, payload, { merge: true });
    upsertVenteCache(payload);
    logger.log('✅ Vente mise à jour sur Firestore:', venteId);
    return payload;
  } catch (err) {
    if (isAuthError(err) || isNoSessionError(err)) {
      logNetworkAware('⚠️ mettreAJourVente (cache local conservé)', err);
    } else {
      logger.error('Erreur mettreAJourVente (Firestore):', err);
    }
    throw err;
  }
}

/** Supprime une vente de Firestore. */
export async function supprimerVente(venteId: string): Promise<boolean> {
  try {
    // Retrouve un peu de contexte dans le cache pour un journal lisible
    let details = venteId;
    let magasinId: string | undefined;
    try {
      const v = readVentesCache('ALL').find(x => x.id === venteId);
      if (v) {
        const r: any = v.recap || {};
        const numDoc = r.numDevis || r.numFacture || v.numero_client || venteId;
        details = `${v.client || ''} — ${numDoc}`;
        magasinId = v.magasin_id;
      }
    } catch { /* ignore */ }
    await deleteDoc(doc(db, COLLECTION, venteId));
    removeVenteCache(venteId);
    journaliserSuppression(details.includes('devis') ? 'Devis / Proforma' : 'Ventes / Factures', details, magasinId);
    logger.log('✅ Vente supprimée sur Firestore:', venteId);
    return true;
  } catch (err) {
    logger.error('Erreur supprimerVente (Firestore):', err);
    return false;
  }
}

/**
 * Abonnement temps réel Firestore aux ventes, avec diff pour émettre
 * onInsert/onUpdate/onDelete (l'appelant dédoublonne par id).
 */
function subscribeVentesDiff(
  buildQuery: () => any,
  onInsert: (v: VenteSupabase) => void,
  onUpdate: (v: VenteSupabase) => void,
  onDelete: (id: string) => void
): () => void {
  return onSnapshot(
    buildQuery(),
    (snap: any) => {
      snap.docChanges().forEach((change: any) => {
        const v = { id: change.doc.id, ...change.doc.data() } as VenteSupabase;
        if (change.type === 'added') onInsert(v);
        else if (change.type === 'modified') onUpdate(v);
        else if (change.type === 'removed') onDelete(v.id);
      });
    },
    (err: any) => logNetworkAware('⚠️ subscribe ventes (Firestore)', err),
  );
}

export function subscriberVentesMagasin(
  magasinId: string,
  onInsert: (v: VenteSupabase) => void,
  onUpdate: (v: VenteSupabase) => void,
  onDelete: (id: string) => void
) {
  return subscribeVentesDiff(
    () => query(collection(db, COLLECTION), where('magasin_id', '==', magasinId)),
    onInsert, onUpdate, onDelete,
  );
}

export function subscriberToutesLesVentes(
  onInsert: (v: VenteSupabase) => void,
  onUpdate: (v: VenteSupabase) => void,
  onDelete: (id: string) => void
) {
  return subscribeVentesDiff(() => collection(db, COLLECTION), onInsert, onUpdate, onDelete);
}

export async function migrerVentesDepuisLocalStorage(_magasinId: string, _userName: string): Promise<number> {
  logger.log('Migration depuis localStorage non nécessaire — Firestore est la source de vérité');
  return 0;
}
