import { logger } from '../utils/logger';
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, writeBatch,
} from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { isAuthError, isNoSessionError } from '../utils/networkErrors';

export interface EmploiRow {
  id: string;
  magasin_id: string;
  annee: number;
  mois: number;
  horaires?: any;
  jours_exceptionnels?: any;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export async function chargerEmplois(magasinIds: string[]): Promise<EmploiRow[] | null> {
  if (!magasinIds.length) return [];
  const ids = magasinIds.map(s => s.toUpperCase());
  try {
    const q = query(collection(db, 'emplois_du_temps'), where('magasin_id', 'in', ids));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as EmploiRow))
      .sort((a, b) => (b.annee - a.annee) || (b.mois - a.mois));
  } catch (err) {
    if (!isAuthError(err) && !isNoSessionError(err)) {
      logger.error('❌ chargerEmplois (cache local préservé):', err);
    }
    return null;
  }
}

export function emploiToRow(e: any): EmploiRow {
  const { id, magasinId, annee, mois, horaires, joursExceptionnels, ...rest } = e;
  return {
    id: String(id),
    magasin_id: (magasinId || '').toUpperCase(),
    annee: Number(annee) || new Date().getFullYear(),
    mois: Number(mois) || 0,
    horaires: horaires || {},
    jours_exceptionnels: joursExceptionnels || [],
    data: rest,
  };
}

export function rowToEmploi(r: EmploiRow): any {
  return {
    id: r.id, magasinId: r.magasin_id, annee: r.annee, mois: r.mois,
    horaires: r.horaires || {}, joursExceptionnels: r.jours_exceptionnels || [],
    createdAt: r.created_at, ...(r.data || {}),
  };
}

export async function replaceEmplois(items: any[]): Promise<void> {
  const rows = (items || [])
    .filter(i => i && i.id !== undefined && i.id !== null)
    .map(emploiToRow);

  const existing = await getDocs(collection(db, 'emplois_du_temps'));
  const batch = writeBatch(db);
  existing.docs.forEach(d => batch.delete(d.ref));
  const now = new Date().toISOString();
  rows.forEach(r => batch.set(doc(db, 'emplois_du_temps', r.id), { ...r, updated_at: now }));
  await batch.commit();
}
