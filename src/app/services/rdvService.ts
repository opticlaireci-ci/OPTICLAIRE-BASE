import { logger } from '../utils/logger';
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, writeBatch,
} from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { isAuthError, isNoSessionError } from '../utils/networkErrors';

export interface RdvRow {
  id: string;
  magasin_id: string;
  num_ref?: string | null;
  client?: string | null;
  motif?: string | null;
  commentaire?: string | null;
  rendez_vous?: string | null;
  date?: string | null;
  statut?: string | null;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export async function chargerRdvEnligne(magasinIds: string[]): Promise<RdvRow[] | null> {
  if (!magasinIds.length) return [];
  const ids = magasinIds.map(s => s.toUpperCase());
  try {
    const q = query(collection(db, 'rdv_enligne'), where('magasin_id', 'in', ids));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as RdvRow))
      .sort((a, b) => (b.rendez_vous || '').localeCompare(a.rendez_vous || ''));
  } catch (err) {
    if (!isAuthError(err) && !isNoSessionError(err)) {
      logger.error('❌ chargerRdvEnligne (cache local préservé):', err);
    }
    return null;
  }
}

export function rdvToRow(magasinId: string, r: any): RdvRow {
  const { id, numRef, client, motif, commentaire, rendezVous, date, statut, magasin, ...rest } = r;
  return {
    id: String(id),
    magasin_id: (magasin || magasinId || '').toUpperCase(),
    num_ref: numRef || null,
    client: client || null,
    motif: motif || null,
    commentaire: commentaire || null,
    rendez_vous: rendezVous || null,
    date: date || null,
    statut: statut || null,
    data: rest,
  };
}

export function rowToRdv(r: RdvRow): any {
  return {
    id: r.id,
    numRef: r.num_ref || '',
    client: r.client || '',
    motif: r.motif || '',
    commentaire: r.commentaire || '',
    rendezVous: r.rendez_vous || '',
    date: r.date || '',
    statut: r.statut || '',
    magasin: r.magasin_id,
    ...(r.data || {}),
  };
}

export async function replaceRdvEnligne(magasinId: string, items: any[]): Promise<void> {
  const rows = (items || [])
    .filter(i => i && i.id !== undefined && i.id !== null)
    .map(i => rdvToRow(magasinId, i));

  const magId = magasinId.toUpperCase();
  const existing = await getDocs(query(collection(db, 'rdv_enligne'), where('magasin_id', '==', magId)));
  const batch = writeBatch(db);
  existing.docs.forEach(d => batch.delete(d.ref));
  const now = new Date().toISOString();
  rows.forEach(r => batch.set(doc(db, 'rdv_enligne', r.id), { ...r, updated_at: now }));
  await batch.commit();
}
