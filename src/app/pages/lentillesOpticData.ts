/**
 * Données des tableaux de stock « LENTILLES OPTIC » (source : PDF fournis).
 *
 * Chaque tableau est une matrice : lignes = SPH, colonnes = Addition (progressif)
 * ou CYL. Chaque case contient [Initial, Monté]. Le Restant est toujours calculé
 * (Restant = Initial − Monté), il n'est donc pas stocké.
 *
 * Le SEED ci-dessous sert de dotation par défaut, identique sur tous les postes.
 * Les modifications de l'utilisateur sont enregistrées par-dessus dans Supabase
 * (clé `leclaire_lentilles_optic`) et partagées entre tous les magasins.
 *
 * ⚠️ Les PDF « écrasent » les cases dont le Monté est vide, ce qui rend les
 * grandes matrices CYL ambiguës à relire automatiquement. Sont pré-remplies de
 * façon fiable : le Progressif (9 colonnes) en entier, et la colonne plano
 * (CYL 0,00) des tableaux SPH+/CYL- et SPH-/CYL+. Le reste est à saisir/corriger
 * directement dans l'application (tout est enregistré dans Supabase).
 */

export type Cell = [initial: number, monte: number];
export type TableSeed = Record<string, Record<string, Cell>>;

export interface OpticTable {
  id: string;
  label: string;
  rowLabel: string; // en-tête de la 1re colonne (ex. « SPH »)
  colLabel: string; // libellé du groupe de colonnes (ex. « Addition »)
  rows: string[];
  cols: string[];
  seed: TableSeed;
}

// ── Générateurs de libellés ──────────────────────────────────────────────────
const fmtDiop = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(2).replace('.', ',')}`;

// SPH de start à end (pas 0,25), ascendant ou descendant.
function sphRange(start: number, end: number, step = 0.25): string[] {
  const out: string[] = [];
  const dir = end >= start ? 1 : -1;
  const n = Math.round(Math.abs(end - start) / step);
  for (let i = 0; i <= n; i++) {
    const v = +(start + i * step * dir).toFixed(2);
    out.push(v === 0 ? '0,00' : fmtDiop(v));
  }
  return out;
}

// CYL de 0 à borne (négative ou positive), pas 0,25.
function cylRange(sign: 1 | -1, max = 6): string[] {
  const out: string[] = ['0,00'];
  for (let v = 0.25; v <= max + 1e-9; v += 0.25) out.push(fmtDiop(sign * +v.toFixed(2)));
  return out;
}

const ADD_COLS = ['+1,00', '+1,25', '+1,50', '+1,75', '+2,00', '+2,25', '+2,50', '+2,75', '+3,00'];

// ── TABLEAU 1 — PROGRESSIF (lignes SPH × colonnes Addition) ──────────────────
const T1_ROWS = [
  'Afocal 0,00', '-0,25', '-0,50', '-0,75', '-1,00', '-1,25', '-1,50', '-1,75',
  '-2,00', '-2,25', '-2,50', '-2,75',
  '+0,25', '+0,50', '+0,75', '+1,00', '+1,25', '+1,50', '+1,75', '+2,00', '+2,25', '+2,50', '+2,75',
];

// Chaque ligne = 9 cases [Initial, Monté] alignées sur ADD_COLS.
const T1_MATRIX: Record<string, Cell[]> = {
  'Afocal 0,00': [[10, 9], [10, 10], [10, 10], [10, 9], [10, 9], [6, 1], [6, 4], [6, 4], [6, 2]],
  '-0,25': [[50, 6], [50, 12], [50, 10], [50, 8], [10, 5], [6, 5], [6, 1], [6, 1], [6, 1]],
  '-0,50': [[50, 1], [50, 3], [50, 3], [50, 10], [10, 3], [6, 5], [6, 2], [6, 1], [6, 2]],
  '-0,75': [[10, 2], [10, 3], [10, 0], [10, 1], [10, 1], [6, 3], [6, 0], [6, 0], [6, 1]],
  '-1,00': [[10, 1], [10, 0], [10, 1], [10, 2], [10, 0], [6, 0], [6, 0], [6, 0], [6, 0]],
  '-1,25': [[10, 2], [10, 3], [10, 1], [10, 0], [10, 0], [6, 0], [6, 0], [6, 0], [6, 0]],
  '-1,50': [[10, 0], [10, 0], [10, 1], [10, 0], [10, 1], [6, 0], [6, 0], [6, 0], [6, 0]],
  '-1,75': [[10, 2], [10, 2], [10, 0], [10, 2], [10, 0], [6, 0], [6, 0], [6, 0], [6, 0]],
  '-2,00': [[10, 0], [10, 0], [10, 0], [10, 1], [10, 0], [6, 0], [6, 0], [6, 0], [6, 0]],
  '-2,25': [[10, 0], [10, 0], [10, 1], [10, 1], [10, 0], [6, 0], [6, 0], [6, 0], [6, 0]],
  '-2,50': [[10, 0], [10, 0], [10, 1], [10, 0], [10, 0], [6, 0], [6, 0], [6, 0], [6, 0]],
  '-2,75': [[10, 0], [10, 0], [10, 0], [10, 0], [10, 1], [6, 0], [6, 0], [6, 0], [6, 0]],
  '+0,25': [[45, 14], [45, 16], [10, 9], [10, 9], [50, 9], [50, 13], [6, 1], [6, 0], [6, 1]],
  '+0,50': [[30, 4], [45, 3], [10, 9], [10, 10], [50, 9], [6, 4], [6, 5], [6, 2], [6, 2]],
  '+0,75': [[45, 2], [30, 4], [10, 4], [10, 9], [10, 2], [6, 3], [6, 0], [6, 0], [6, 2]],
  '+1,00': [[30, 0], [30, 4], [10, 5], [10, 0], [50, 4], [6, 5], [6, 5], [6, 0], [6, 5]],
  '+1,25': [[10, 0], [10, 0], [50, 4], [10, 0], [10, 3], [6, 2], [6, 0], [6, 1], [6, 0]],
  '+1,50': [[10, 0], [10, 4], [10, 3], [10, 2], [10, 1], [6, 0], [6, 0], [6, 1], [6, 3]],
  '+1,75': [[10, 0], [10, 0], [10, 1], [10, 3], [10, 1], [6, 0], [6, 1], [6, 2], [46, 3]],
  '+2,00': [[10, 2], [10, 1], [10, 1], [10, 0], [10, 0], [6, 2], [6, 2], [6, 0], [6, 2]],
  '+2,25': [[10, 0], [10, 0], [10, 1], [10, 0], [10, 1], [6, 0], [6, 0], [6, 0], [6, 0]],
  '+2,50': [[10, 0], [10, 0], [10, 1], [10, 0], [10, 1], [6, 0], [26, 3], [6, 2], [6, 1]],
  '+2,75': [[10, 0], [10, 0], [10, 0], [10, 0], [10, 0], [6, 0], [6, 0], [6, 0], [6, 0]],
};

function buildT1Seed(): TableSeed {
  const seed: TableSeed = {};
  for (const row of T1_ROWS) {
    const cells = T1_MATRIX[row];
    if (!cells) continue;
    seed[row] = {};
    ADD_COLS.forEach((col, i) => { seed[row][col] = cells[i] ?? [0, 0]; });
  }
  return seed;
}

// ── Colonne plano (CYL 0,00) des tableaux SPH+/CYL- et SPH-/CYL+ ─────────────
// Seule cette colonne est relue de façon fiable depuis les PDF.
const T2_PLANO: Record<string, Cell> = {
  '0,00': [160, 98], '+0,25': [150, 109], '+0,50': [100, 100], '+0,75': [100, 34],
  '+1,00': [100, 22], '+1,25': [90, 13], '+1,50': [80, 6], '+1,75': [50, 12],
  '+2,00': [50, 7], '+2,25': [50, 1], '+2,50': [50, 1], '+2,75': [50, 1],
  '+3,00': [30, 0], '+3,25': [30, 0], '+3,50': [30, 0], '+3,75': [30, 1],
  '+4,00': [30, 1], '+4,25': [30, 0], '+4,50': [30, 0], '+4,75': [30, 1],
  '+5,00': [30, 1], '+5,25': [30, 0], '+5,50': [30, 0], '+5,75': [30, 0],
  '+6,00': [20, 0], '+6,25': [10, 0], '+6,50': [10, 0], '+6,75': [10, 0],
  '+7,00': [10, 0], '+7,25': [10, 0], '+7,50': [10, 0], '+7,75': [10, 0],
  '+8,00': [10, 1], '+8,25': [10, 0], '+8,50': [10, 1], '+8,75': [10, 0],
  '+9,00': [10, 0], '+9,25': [10, 0], '+9,50': [10, 0], '+9,75': [10, 0], '+10,00': [10, 0],
};

const T3_PLANO: Record<string, Cell> = {
  '0,00': [0, 0], '-0,25': [150, 132], '-0,50': [100, 90], '-0,75': [100, 30],
  '-1,00': [80, 31], '-1,25': [80, 8], '-1,50': [130, 18], '-1,75': [70, 5],
  '-2,00': [21, 12], '-2,25': [20, 10], '-2,50': [20, 9], '-2,75': [20, 1],
  '-3,00': [20, 2], '-3,25': [20, 7], '-3,50': [20, 4], '-3,75': [20, 5],
  '-4,00': [70, 2], '-4,25': [20, 0], '-4,50': [70, 2], '-4,75': [20, 0],
  '-5,00': [70, 3], '-5,25': [20, 0], '-5,50': [70, 3], '-5,75': [20, 1],
  '-6,00': [60, 2], '-6,25': [10, 0], '-6,50': [60, 2], '-6,75': [10, 0],
  '-7,00': [10, 0], '-7,25': [10, 0], '-7,50': [10, 0], '-7,75': [10, 0],
  '-8,00': [10, 2], '-8,25': [10, 0], '-8,50': [10, 0], '-8,75': [10, 0],
  '-9,00': [10, 0], '-9,25': [10, 0], '-9,50': [10, 0], '-9,75': [10, 0], '-10,00': [10, 0],
};

// Construit un seed ne contenant que la colonne plano (CYL 0,00).
function planoSeed(plano: Record<string, Cell>): TableSeed {
  const seed: TableSeed = {};
  for (const [row, cell] of Object.entries(plano)) seed[row] = { '0,00': cell };
  return seed;
}

export const OPTIC_TABLES: OpticTable[] = [
  {
    id: 'progressif',
    label: 'Progressif',
    rowLabel: 'SPH',
    colLabel: 'Addition',
    rows: T1_ROWS,
    cols: ADD_COLS,
    seed: buildT1Seed(),
  },
  {
    id: 'sph-plus-cyl-moins',
    label: 'SPH+ / CYL−',
    rowLabel: 'SPH',
    colLabel: 'CYL',
    rows: sphRange(0, 10),
    cols: cylRange(-1),
    seed: planoSeed(T2_PLANO),
  },
  {
    id: 'sph-moins-cyl-plus',
    label: 'SPH− / CYL+',
    rowLabel: 'SPH',
    colLabel: 'CYL',
    rows: sphRange(0, -10, 0.25),
    cols: cylRange(1),
    seed: planoSeed(T3_PLANO),
  },
  {
    id: 'sph-moins-cyl-moins',
    label: 'SPH− / CYL−',
    rowLabel: 'SPH',
    colLabel: 'CYL',
    rows: sphRange(0, -10, 0.25),
    cols: cylRange(-1),
    seed: {},
  },
];

export const OPTIC_STORAGE_KEY = 'leclaire_lentilles_optic';
