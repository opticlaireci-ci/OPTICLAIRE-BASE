import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy,
} from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { logNetworkAware } from '../utils/networkErrors';
import { journaliserSuppression } from './auditLogService';

export interface FactureAssuranceRow {
  id: string;
  magasin_id: string;
  numero?: string | null;
  date_facture?: string | null;
  client_nom?: string | null;
  client_id?: string | null;
  assurance?: string | null;
  montant_total?: number | null;
  part_assurance?: number | null;
  part_client?: number | null;
  statut?: string | null;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export interface ReglementAssuranceRow {
  id: string;
  magasin_id?: string | null;
  assurance?: string | null;
  date_reglement?: string | null;
  montant?: number | null;
  reference?: string | null;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export interface ReleveAssuranceRow {
  id: string;
  magasin_id?: string | null;
  assurance?: string | null;
  date_releve?: string | null;
  montant?: number | null;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export async function chargerFacturesAssurance(magasinId: string): Promise<FactureAssuranceRow[]> {
  try {
    const q = query(collection(db, 'factures_assurance'), where('magasin_id', '==', magasinId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as FactureAssuranceRow))
      .sort((a, b) => (b.date_facture || '').localeCompare(a.date_facture || ''));
  } catch (err) {
    logNetworkAware('chargerFacturesAssurance', err);
    return [];
  }
}

export async function upsertFactureAssurance(row: FactureAssuranceRow): Promise<void> {
  await setDoc(doc(db, 'factures_assurance', row.id), { ...row, updated_at: new Date().toISOString() }, { merge: true });
}

export async function supprimerFactureAssurance(id: string): Promise<void> {
  await deleteDoc(doc(db, 'factures_assurance', id));
  journaliserSuppression('Facture Assurance', `Facture assurance supprimée (${id})`);
}

export async function chargerReglementsAssurance(): Promise<ReglementAssuranceRow[]> {
  try {
    const q = query(collection(db, 'reglements_assurance'), orderBy('date_reglement', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReglementAssuranceRow));
  } catch (err) {
    logNetworkAware('chargerReglementsAssurance', err);
    return [];
  }
}

export async function upsertReglementAssurance(row: ReglementAssuranceRow): Promise<void> {
  await setDoc(doc(db, 'reglements_assurance', row.id), { ...row, updated_at: new Date().toISOString() }, { merge: true });
}

export async function supprimerReglementAssurance(id: string): Promise<void> {
  await deleteDoc(doc(db, 'reglements_assurance', id));
  journaliserSuppression('Règlement Assurance', `Règlement assurance supprimé (${id})`);
}

export async function chargerRelevesAssurance(): Promise<ReleveAssuranceRow[]> {
  try {
    const q = query(collection(db, 'releves_assurance'), orderBy('date_releve', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReleveAssuranceRow));
  } catch (err) {
    logNetworkAware('chargerRelevesAssurance', err);
    return [];
  }
}

export async function upsertReleveAssurance(row: ReleveAssuranceRow): Promise<void> {
  await setDoc(doc(db, 'releves_assurance', row.id), { ...row, updated_at: new Date().toISOString() }, { merge: true });
}

export async function supprimerReleveAssurance(id: string): Promise<void> {
  await deleteDoc(doc(db, 'releves_assurance', id));
  journaliserSuppression('Relevé Assurance', `Relevé assurance supprimé (${id})`);
}
