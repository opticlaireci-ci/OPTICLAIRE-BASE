import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, writeBatch,
} from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { safeUuid } from '../utils/safeId';
import { logNetworkAware } from '../utils/networkErrors';
import { journaliserSuppression } from './auditLogService';

export type BonType = 'distribution' | 'transfert' | 'retour' | 'commande' | 'livraison' | 'peremption';

export interface BonRow {
  id: string;
  type: BonType;
  numero: string;
  date?: string | null;
  magasin_source?: string | null;
  magasin_destination?: string | null;
  responsable?: string | null;
  recepteur?: string | null;
  expediteur?: string | null;
  items: any[];
  statut?: string | null;
  observations?: string | null;
  valide_par?: string | null;
  data?: any;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function chargerBons(magasinIds: string[]): Promise<BonRow[]> {
  if (!magasinIds.length) return [];
  const ids = magasinIds.map(s => s.toUpperCase());
  try {
    // Firestore ne supporte pas OR natif cross-champs — deux requêtes fusionnées
    const [snapSrc, snapDst] = await Promise.all([
      getDocs(query(collection(db, 'bons'), where('magasin_source', 'in', ids))),
      getDocs(query(collection(db, 'bons'), where('magasin_destination', 'in', ids))),
    ]);
    const seen = new Set<string>();
    const results: BonRow[] = [];
    for (const snap of [snapSrc, snapDst]) {
      snap.docs.forEach(d => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          results.push({ id: d.id, ...d.data() } as BonRow);
        }
      });
    }
    results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return results;
  } catch (err) {
    logNetworkAware('chargerBons', err);
    return [];
  }
}

export async function upsertBon(row: BonRow): Promise<void> {
  await setDoc(doc(db, 'bons', row.id), { ...row, updated_at: new Date().toISOString() }, { merge: true });
}

export async function supprimerBon(id: string): Promise<void> {
  await deleteDoc(doc(db, 'bons', id));
  journaliserSuppression('Bons', `Bon supprimé (${id})`);
}

// ── Conversion camelCase ↔ BonRow ────────────────────────────────────────────

export function distributionToRow(b: any): BonRow {
  const { id, numero, date, magasinDest, responsable, recepteur, receiver, items, statut, observations, valideePar, dateValidation, ...rest } = b;
  return { id: String(id), type: 'distribution', numero: numero || '', date: date || new Date().toISOString(),
    magasin_destination: (magasinDest || '').toUpperCase() || null, responsable: responsable || null,
    recepteur: recepteur || receiver || null,
    items: items || [], statut: statut || 'En attente', observations: observations || null,
    valide_par: valideePar || null, data: { ...rest, dateValidation: dateValidation || null } };
}

export function transfertToRow(b: any): BonRow {
  const { id, numero, date, magasinSource, magasinDest, responsable, recepteur, items, statut, observations, valideePar, dateValidation, ...rest } = b;
  return { id: String(id), type: 'transfert', numero: numero || '', date: date || new Date().toISOString(),
    magasin_source: (magasinSource || '').toUpperCase() || null, magasin_destination: (magasinDest || '').toUpperCase() || null,
    expediteur: responsable || null, recepteur: recepteur || null, items: items || [],
    statut: statut || 'En attente', observations: observations || null, valide_par: valideePar || null,
    data: { ...rest, dateValidation: dateValidation || null } };
}

export function retourToRow(b: any): BonRow {
  const { id, numero, date, magasin, responsable, items, statut, observations, validePar, traitePar, dateValidation, dateTraitement, motifRejet, ...rest } = b;
  return { id: String(id), type: 'retour', numero: numero || '', date: date || new Date().toISOString(),
    magasin_source: (magasin || '').toUpperCase() || null, responsable: responsable || null,
    items: items || [], statut: statut || 'En attente', observations: observations || null,
    valide_par: validePar || traitePar || null, data: { ...rest, dateValidation, dateTraitement, motifRejet } };
}

export function rowToDistribution(r: BonRow): any {
  return { id: r.id, numero: r.numero, date: r.date, magasinDest: r.magasin_destination || '',
    responsable: r.responsable || '', recepteur: r.recepteur || '', receiver: r.recepteur || '',
    items: r.items || [], statut: r.statut || 'En attente',
    observations: r.observations || '', valideePar: r.valide_par || '', ...(r.data || {}) };
}

export function rowToTransfert(r: BonRow): any {
  return { id: r.id, numero: r.numero, date: r.date, magasinSource: r.magasin_source || '',
    magasinDest: r.magasin_destination || '', responsable: r.expediteur || '', recepteur: r.recepteur || '',
    items: r.items || [], statut: r.statut || 'En attente', observations: r.observations || '',
    valideePar: r.valide_par || '', ...(r.data || {}) };
}

export function rowToRetour(r: BonRow): any {
  return { id: r.id, numero: r.numero, date: r.date, magasin: r.magasin_source || '',
    responsable: r.responsable || '', items: r.items || [], statut: r.statut || 'En attente',
    observations: r.observations || '', validePar: r.valide_par || '', ...(r.data || {}) };
}

export function commandeToRow(b: any): BonRow {
  const { id, reference, dateCreation, date, statut, observations, ...rest } = b;
  return { id: String(id), type: 'commande', numero: reference || '',
    date: dateCreation || date || new Date().toISOString(), statut: statut || 'En attente',
    observations: observations || null, items: b.items || [], data: rest };
}

export function rowToCommande(r: BonRow): any {
  return { id: r.id, reference: r.numero, dateCreation: r.date, statut: r.statut || 'En attente',
    observations: r.observations || '', items: r.items || [], ...(r.data || {}) };
}

export function livraisonToRow(b: any): BonRow {
  const { id, numeroBonLivraison, dateLivraison, ...rest } = b;
  return { id: String(id || Date.now()), type: 'livraison', numero: numeroBonLivraison || '',
    date: dateLivraison || new Date().toISOString(), statut: null, items: [], data: rest };
}

export function rowToLivraison(r: BonRow): any {
  return { id: r.id, numeroBonLivraison: r.numero, dateLivraison: r.date, ...(r.data || {}) };
}

export function peremptionToRow(b: any): BonRow {
  const { id, reference, dateCreation, date, motif, commentaire, statut, items, ...rest } = b;
  return { id: String(id), type: 'peremption', numero: reference || '',
    date: dateCreation || date || new Date().toISOString(), statut: statut || null,
    observations: commentaire || null, items: items || [], data: { motif, ...rest } };
}

export function rowToPeremption(r: BonRow): any {
  return { id: r.id, reference: r.numero, dateCreation: r.date, motif: (r.data || {}).motif || '',
    commentaire: r.observations || '', items: r.items || [], ...(r.data || {}) };
}

const LS_TYPE_MAP: Record<string, BonType> = {
  'leclaire_bons_commande': 'commande',
  'leclaire_bons_livraison': 'livraison',
  'leclaire_bons_peremption': 'peremption',
};

export async function replaceBons(lsKey: string, items: any[]): Promise<void> {
  const bonType = LS_TYPE_MAP[lsKey];
  if (!bonType) throw new Error(`replaceBons: clé inconnue ${lsKey}`);

  const rows: BonRow[] = items.map(b => ({
    id: String(b.id || crypto.randomUUID()),
    type: bonType,
    numero: b.numero || b.reference || '',
    date: b.date || new Date().toISOString(),
    magasin_source: b.magasin || b.magasinSource || null,
    magasin_destination: b.magasinDest || b.magasinDestination || null,
    responsable: b.responsable || b.editePar || null,
    statut: b.statut || 'En attente',
    items: b.items || [],
    observations: b.observations || b.commentaire || null,
    valide_par: b.validePar || b.valideePar || null,
    data: b,
  }));

  // Supprimer les anciens de ce type, insérer les nouveaux
  const existing = await getDocs(query(collection(db, 'bons'), where('type', '==', bonType)));
  const batch = writeBatch(db);
  existing.docs.forEach(d => batch.delete(d.ref));
  rows.forEach(r => batch.set(doc(db, 'bons', r.id), { ...r, updated_at: new Date().toISOString() }));
  await batch.commit();
}
