import { logger } from '../utils/logger';
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, writeBatch,
} from '../utils/firestoreCompat';
import { db, FIREBASE_DATA_ENABLED } from '../utils/firebaseClient';
import { logNetworkAware } from '../utils/networkErrors';

export interface InventaireRow {
  id: string;
  magasin_id?: string | null;
  date_inventaire?: string | null;
  responsable?: string | null;
  items?: any;
  total_ecarts?: number | null;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export async function chargerInventaires(magasinIds: string[]): Promise<InventaireRow[]> {
  if (!FIREBASE_DATA_ENABLED) return [];
  if (!magasinIds.length) return [];
  const ids = magasinIds.map(s => s.toUpperCase());
  try {
    const q = query(collection(db, 'inventaires'), where('magasin_id', 'in', ids));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as InventaireRow))
      .sort((a, b) => (b.date_inventaire || '').localeCompare(a.date_inventaire || ''));
  } catch (err) {
    logNetworkAware('chargerInventaires', err);
    return [];
  }
}

function toIso(value: any): string {
  if (value) {
    const fr = String(value).match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    const candidate = fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : value;
    const d = new Date(candidate);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export function inventaireToRow(inv: any): InventaireRow {
  const { id, magasin, magasinId, date, dateInventaire, responsable, items, produits, totalEcarts, ...rest } = inv;
  const mag = (magasinId || magasin || '').toUpperCase() || null;
  return {
    id: String(id),
    magasin_id: mag,
    date_inventaire: toIso(date || dateInventaire),
    responsable: responsable || null,
    items: items || produits || [],
    total_ecarts: typeof totalEcarts === 'number' ? totalEcarts : null,
    data: rest,
  };
}

export function rowToInventaire(r: InventaireRow): any {
  // La couche d'accès direct (fromRow) APLATIT la colonne jsonb `data` au niveau
  // racine et supprime la clé `data`. Les champs sans colonne dédiée — dont
  // `type` (montures vs lentilles), les infos d'audit, etc. — arrivent donc en
  // haut de `r`. Si on ne réétalait que `r.data`, ces champs seraient PERDUS :
  // un inventaire lentilles rechargé perdrait `type='lentilles'` et
  // n'apparaîtrait jamais. On repart donc de la totalité de `r`.
  const { data, magasin_id, date_inventaire, responsable, items, total_ecarts, ...extra } =
    r as any;
  return {
    ...extra,          // champs aplatis (type, createdAt, createdBy, updatedAt…)
    ...(data || {}),   // si `data` n'a pas été aplati (autre chemin), on le garde
    id: r.id,
    magasinId: r.magasin_id || '',
    magasin: r.magasin_id || '',
    date: r.date_inventaire,
    dateInventaire: r.date_inventaire,
    responsable: r.responsable || '',
    items: r.items || [],
    produits: r.items || [],
    totalEcarts: r.total_ecarts || 0,
  };
}

export async function replaceInventaires(inventaires: any[]): Promise<void> {
  // ⛔️ Écriture Firebase coupée (batch brut) : no-op, les inventaires restent en local.
  if (!FIREBASE_DATA_ENABLED) {
    logger.warn('⛔️ replaceInventaires ignoré (données Firebase coupées)');
    return;
  }
  const rows = (inventaires || [])
    .filter(i => i && i.id !== undefined && i.id !== null)
    .map(inventaireToRow);

  const batch = writeBatch(db);

  if (rows.length === 0) {
    const existing = await getDocs(collection(db, 'inventaires'));
    existing.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return;
  }

  // Upsert des lignes courantes
  const now = new Date().toISOString();
  rows.forEach(r => batch.set(doc(db, 'inventaires', r.id), { ...r, updated_at: now }, { merge: true }));
  await batch.commit();

  // Supprimer les obsolètes
  const ids = new Set(rows.map(r => r.id));
  const existing = await getDocs(collection(db, 'inventaires'));
  const deleteBatch = writeBatch(db);
  let hasDeletes = false;
  existing.docs.forEach(d => {
    if (!ids.has(d.id)) {
      deleteBatch.delete(d.ref);
      hasDeletes = true;
    }
  });
  if (hasDeletes) await deleteBatch.commit();
}
