import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, writeBatch,
} from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { logNetworkAware } from '../utils/networkErrors';

export interface BonCommandeVerreRow {
  id: string;
  num_facture?: string | null;
  num_ref?: string | null;
  num_bc?: string | null;
  num_bl?: string | null;
  fournisseur?: string | null;
  officine?: string | null;
  magasin?: string | null;
  client?: string | null;
  total_net?: number | null;
  acompte?: number | null;
  total_reste?: number | null;
  statut?: string | null;
  date?: string | null;
  date_edition?: string | null;
  date_recuperation?: string | null;
  date_entree_atelier?: string | null;
  date_retour_magasin?: string | null;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export async function chargerBonsCommandeVerres(): Promise<BonCommandeVerreRow[] | null> {
  try {
    const snap = await getDocs(query(collection(db, 'bons_commande_verres')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as BonCommandeVerreRow));
  } catch (err) {
    logNetworkAware('⚠️ chargerBonsCommandeVerres (cache local préservé)', err);
    return null;
  }
}

export function bonCommandeToRow(b: any): BonCommandeVerreRow {
  const { id, numFacture, numRef, numBC, numBL, fournisseur, officine, magasin, client,
    totalNet, acompte, totalReste, statut, date, dateEdition, dateRecuperation,
    dateEntreeAtelier, dateRetourMagasin, ...rest } = b;
  return {
    id: String(id), num_facture: numFacture || null, num_ref: numRef || null,
    num_bc: numBC || null, num_bl: numBL || null, fournisseur: fournisseur || null,
    officine: officine || null, magasin: magasin || null, client: client || null,
    total_net: typeof totalNet === 'number' ? totalNet : null,
    acompte: typeof acompte === 'number' ? acompte : null,
    total_reste: typeof totalReste === 'number' ? totalReste : null,
    statut: statut || null, date: date || null, date_edition: dateEdition || null,
    date_recuperation: dateRecuperation || null, date_entree_atelier: dateEntreeAtelier || null,
    date_retour_magasin: dateRetourMagasin || null, data: rest,
  };
}

export function rowToBonCommande(r: BonCommandeVerreRow): any {
  return {
    id: r.id, numFacture: r.num_facture || '', numRef: r.num_ref || '',
    numBC: r.num_bc || '', numBL: r.num_bl || '', fournisseur: r.fournisseur || '',
    officine: r.officine || '', magasin: r.magasin || '', client: r.client || '',
    totalNet: r.total_net || 0, acompte: r.acompte || 0, totalReste: r.total_reste || 0,
    statut: r.statut || '', date: r.date || '', dateEdition: r.date_edition || '',
    dateRecuperation: r.date_recuperation || '', dateEntreeAtelier: r.date_entree_atelier || '',
    dateRetourMagasin: r.date_retour_magasin || '', ...(r.data || {}),
  };
}

export async function replaceBonsCommandeVerres(items: any[]): Promise<void> {
  const rows = (items || [])
    .filter(i => i && i.id !== undefined && i.id !== null)
    .map(bonCommandeToRow);

  const existing = await getDocs(collection(db, 'bons_commande_verres'));
  const batch = writeBatch(db);
  existing.docs.forEach(d => batch.delete(d.ref));
  const now = new Date().toISOString();
  rows.forEach(r => batch.set(doc(db, 'bons_commande_verres', r.id), { ...r, updated_at: now }));
  await batch.commit();
}
