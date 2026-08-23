import { logger } from '../utils/logger';
import { doc, getDoc, setDoc } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { OPTIC_TABLES, OPTIC_STORAGE_KEY } from '../pages/lentillesOpticData';
import type { Cell } from '../pages/lentillesOpticData';

/**
 * Décrément AUTOMATIQUE du stock « LENTILLES OPTIC » à la validation d'une facture.
 *
 * Flux : facture validée → pour chaque œil (verre) choisi, on repère le bon
 * tableau (Progressif / SPH+CYL- / SPH-CYL+ / SPH-CYL-), la ligne SPH et la
 * colonne (Addition ou CYL), puis on incrémente « Monté » de la quantité. Le
 * Restant (= Initial − Monté) baisse donc automatiquement.
 *
 * Écrit dans le MÊME document Supabase que la grille éditable
 * (`leclaire_lentilles_optic`), donc l'écran Stock Lentilles se met à jour en
 * temps réel sur tous les postes.
 */

type Overrides = Record<string, Record<string, Record<string, Cell>>>;

export interface LentilleVendue {
  typeVerre?: string;      // 'Progressif' | 'Unifocal' | 'Bifocal' | ...
  sphere?: string | number;
  cylindre?: string | number;
  addition?: string | number;
  quantite?: number;
}

const num = (v: string | number | undefined | null): number => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

// Formate une dioptrie au format des libellés de tableaux : « +1,25 », « -0,25 », « 0,00 ».
const fmtDiop = (v: number): string => {
  const r = Math.round(v * 4) / 4; // arrondi au 0,25 le plus proche
  if (r === 0) return '0,00';
  return `${r > 0 ? '+' : '-'}${Math.abs(r).toFixed(2).replace('.', ',')}`;
};

// Choisit le tableau selon type de verre et signes SPH/CYL.
function choisirTable(typeVerre: string | undefined, sph: number, cyl: number): string | null {
  if ((typeVerre || '').toLowerCase().includes('progress')) return 'progressif';
  if (sph >= 0 && cyl < 0) return 'sph-plus-cyl-moins';
  if (sph < 0 && cyl > 0) return 'sph-moins-cyl-plus';
  if (sph < 0 && cyl < 0) return 'sph-moins-cyl-moins';
  // SPH+/CYL+ ou CYL nul sur unifocal : pas de tableau OPTIC dédié.
  return null;
}

// Libellé de ligne (SPH). En Progressif, la sphère 0 s'appelle « Afocal 0,00 ».
function libelleLigne(tableId: string, sph: number): string {
  if (sph === 0) return tableId === 'progressif' ? 'Afocal 0,00' : '0,00';
  return fmtDiop(sph);
}

// Libellé de colonne : Addition en Progressif, CYL sinon.
function libelleColonne(tableId: string, add: number, cyl: number): string {
  return tableId === 'progressif' ? fmtDiop(add) : fmtDiop(cyl);
}

export interface CibleCase {
  tableId: string;
  table: typeof OPTIC_TABLES[number];
  row: string;
  col: string;
}

/**
 * Repère la case (tableau / ligne SPH / colonne Add ou CYL) correspondant à un
 * verre. Renvoie null si aucune case dédiée n'existe (verre hors tableaux OPTIC).
 */
export function trouverCase(v: LentilleVendue): CibleCase | null {
  const sph = num(v.sphere);
  const cyl = num(v.cylindre);
  const add = num(v.addition);
  const tableId = choisirTable(v.typeVerre, sph, cyl);
  if (!tableId) return null;
  const table = OPTIC_TABLES.find(t => t.id === tableId);
  if (!table) return null;
  const row = libelleLigne(tableId, sph);
  const col = libelleColonne(tableId, add, cyl);
  if (!table.rows.includes(row) || !table.cols.includes(col)) return null;
  return { tableId, table, row, col };
}

/**
 * Applique le montage (décrément stock) pour une liste de verres vendus.
 * Les verres sans tableau/ligne/colonne correspondants sont ignorés silencieusement.
 * Renvoie le nombre de cases effectivement décrémentées.
 */
export async function decrementerLentillesOptic(verres: LentilleVendue[]): Promise<number> {
  const cibles = verres
    .map(v => {
      const qte = Math.max(0, Math.round(v.quantite ?? 1));
      if (qte === 0) return null;
      const c = trouverCase(v);
      if (!c) return null;
      return { ...c, qte };
    })
    .filter(Boolean) as (CibleCase & { qte: number })[];

  if (cibles.length === 0) return 0;

  try {
    // 1. Lecture de l'état courant du store (overrides par-dessus le seed).
    const ref = doc(db, 'app_data', OPTIC_STORAGE_KEY);
    const snap = await getDoc(ref);
    const overrides: Overrides = (snap.exists() ? (snap.data()?.value ?? {}) : {}) as Overrides;

    // 2. Application des décréments.
    let count = 0;
    for (const c of cibles) {
      const current: Cell =
        overrides[c.tableId]?.[c.row]?.[c.col] ??
        c.table.seed[c.row]?.[c.col] ??
        [0, 0];
      const next: Cell = [current[0], current[1] + c.qte];
      overrides[c.tableId] = overrides[c.tableId] || {};
      overrides[c.tableId][c.row] = { ...(overrides[c.tableId][c.row] || {}), [c.col]: next };
      count++;
    }

    // 3. Persistance (partagée temps réel avec l'écran Stock Lentilles).
    await setDoc(
      ref,
      { key: OPTIC_STORAGE_KEY, value: overrides, updated_at: new Date().toISOString() },
      { merge: true },
    );
    return count;
  } catch (e) {
    logger.error('❌ Décrément stock lentilles OPTIC:', e);
    return 0;
  }
}
