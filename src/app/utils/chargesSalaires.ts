/**
 * « Charges & salaires » (page Comptabilité → Mouvements) — calculs.
 *
 *  - Charges du mois : une ligne par officine (magasins d'OPTICLAIRE + BUREAU
 *    + lignes ajoutées), une colonne par charge (UNITÉ, FIBRE OPTIQUE, CIE,
 *    SODECI, SALAIRES avec référence et montant ; LOYER, PRIMES avec montant),
 *    total par charge et CHARGES TOTALES.
 *  - Salaires des employés : NOM, FONCTION, SALAIRE DE BASE, EMPRUNT et
 *    SALAIRE FINAL = salaire de base − emprunt ; totaux.
 *
 * Les informations sont FIXES d'un mois à l'autre : noms, fonctions et
 * salaires de base des employés, officines, références et montants des
 * charges. Un mois pas encore enregistré montre le mois enregistré le plus
 * proche AVANT lui (les emprunts, propres à chaque mois, y sont à 0).
 * Une correction faite un mois vaut pour ce mois et pour les mois suivants :
 * elle est reportée sur les mois suivants déjà enregistrés, sauf là où une
 * autre valeur y avait été mise exprès.
 *
 * Ce module ne contient que des calculs (aucun accès au réseau ni à l'écran).
 */
import { cle, nomCourt, nouvelId, sansAccents, somme, type MagasinPoint } from './pointsSemaine';

type Cellule = string | number | boolean | Date | null | undefined;

// ── Mois ─────────────────────────────────────────────────────────────────────

const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
export const estMois = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
export function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function ajouterMois(mois: string, n: number): string {
  const [y, m] = mois.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
/** « OCTOBRE 2026 » */
export function libelleMois(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  return `${MOIS[(m || 1) - 1]} ${y}`;
}

// ── Données enregistrées ─────────────────────────────────────────────────────

export interface ColonneCharge { id: string; nom: string; reference: boolean; couleur: string }
export interface LigneCharge { id: string; nom: string; magasinId?: string; /** toujours en bas (BUREAU) */ bas?: boolean }
export interface CelluleCharge { ref?: string; montant?: number }
export interface ChargesMois {
  colonnes: ColonneCharge[];
  lignes: LigneCharge[];
  /** Magasins retirés du tableau (ils ne reviennent pas seuls). */
  retires: string[];
  /** ligne → colonne → référence / montant */
  cases: Record<string, Record<string, CelluleCharge>>;
  /** Pour le modèle : mois dont il est la copie. */
  moisSource?: string;
}
export interface Employe { id: string; nom: string; fonction: string; salaireBase: number; emprunt: number }
export interface SalairesMois { employes: Employe[]; moisSource?: string }
export interface LigneMois { mois: string; charges: ChargesMois | null; salaires: SalairesMois | null; modifie_par?: string; modifie_le?: string }

export const COLONNES_CHARGES_DEFAUT: ColonneCharge[] = [
  { id: 'ch-unite', nom: 'UNITE', reference: true, couleur: '#F2DCDB' },
  { id: 'ch-fibre', nom: 'FIBRE OPTIQUE', reference: true, couleur: '#FBD4B4' },
  { id: 'ch-cie', nom: 'CIE', reference: true, couleur: '#D8E4BC' },
  { id: 'ch-sodeci', nom: 'SODECI', reference: true, couleur: '#CCC0DA' },
  { id: 'ch-salaires', nom: 'SALAIRES', reference: true, couleur: '#C5D9F1' },
  { id: 'ch-loyer', nom: 'LOYER', reference: false, couleur: '#B1A0C7' },
  { id: 'ch-primes', nom: 'PRIMES', reference: false, couleur: '#FDE9D9' },
];
export const COULEURS_NOUVELLES_CHARGES = ['#E2EFDA', '#FFF2CC', '#DDEBF7', '#FCE4D6', '#EDEDED', '#D9E1F2'];

export function chargesDefaut(magasins: MagasinPoint[], tenant: string): ChargesMois {
  return {
    colonnes: COLONNES_CHARGES_DEFAUT.map(c => ({ ...c })),
    lignes: [
      ...magasins.map(m => ({ id: `mag-${m.id}`, magasinId: m.id, nom: nomCourt(m.label, tenant) })),
      { id: 'ln-bureau', nom: 'BUREAU', bas: true },
    ],
    retires: [],
    cases: {},
  };
}

export function normaliserCharges(c: Partial<ChargesMois> | null | undefined, defaut: ChargesMois): ChargesMois {
  if (!c || typeof c !== 'object') return defaut;
  return {
    colonnes: Array.isArray(c.colonnes) ? c.colonnes.map(x => ({ id: String(x.id), nom: String(x.nom || ''), reference: !!x.reference, couleur: String(x.couleur || '#EDEDED') })) : defaut.colonnes,
    lignes: Array.isArray(c.lignes) ? c.lignes.map(x => ({ id: String(x.id), nom: String(x.nom || ''), ...(x.magasinId ? { magasinId: String(x.magasinId) } : {}), ...(x.bas ? { bas: true } : {}) })) : defaut.lignes,
    retires: Array.isArray(c.retires) ? c.retires.map(String) : [],
    cases: c.cases && typeof c.cases === 'object' ? c.cases : {},
    ...(c.moisSource ? { moisSource: c.moisSource } : {}),
  };
}
export function normaliserSalaires(s: Partial<SalairesMois> | null | undefined): SalairesMois {
  const l = s && Array.isArray(s.employes) ? s.employes : [];
  return {
    employes: l.map(e => ({ id: String(e.id || nouvelId('emp')), nom: String(e.nom || ''), fonction: String(e.fonction || ''), salaireBase: Number(e.salaireBase) || 0, emprunt: Number(e.emprunt) || 0 })),
    ...(s?.moisSource ? { moisSource: s.moisSource } : {}),
  };
}

/** Lignes du tableau : celles enregistrées, les magasins apparus depuis, puis les lignes « en bas » (BUREAU). */
export function lignesEffectives(c: ChargesMois, magasins: MagasinPoint[], tenant: string): LigneCharge[] {
  const pris = new Set(c.lignes.map(l => l.magasinId).filter(Boolean).map(id => String(id).toUpperCase()));
  const retires = new Set(c.retires.map(id => id.toUpperCase()));
  const nouvelles = magasins
    .filter(m => !pris.has(m.id.toUpperCase()) && !retires.has(m.id.toUpperCase()))
    .map(m => ({ id: `mag-${m.id}`, magasinId: m.id, nom: nomCourt(m.label, tenant) }));
  return [...c.lignes.filter(l => !l.bas), ...nouvelles, ...c.lignes.filter(l => l.bas)];
}

// ── Mois affiché ─────────────────────────────────────────────────────────────

/**
 * Mois enregistré mais VIDE (aucun employé, aucune référence ni aucun montant
 * de charge) — par exemple enregistré avant que les données existent : il est
 * ignoré et le mois montre les informations du mois rempli précédent.
 */
export function moisVide(l: LigneMois | null | undefined): boolean {
  if (!l) return true;
  const employes = Array.isArray(l.salaires?.employes) ? l.salaires!.employes.length : 0;
  if (employes > 0) return false;
  for (const cols of Object.values(l.charges?.cases || {})) {
    for (const v of Object.values(cols || {})) {
      if ((v?.ref ?? '') !== '' || typeof v?.montant === 'number') return false;
    }
  }
  return true;
}

/**
 * Charges et salaires d'un mois : ceux du mois s'il est enregistré, sinon ceux
 * du mois de référence (le mois enregistré le plus proche avant lui — à
 * défaut, le plus proche après), emprunts remis à 0.
 */
export function moisAffiche(ligne: LigneMois | null, reference: LigneMois | null, magasins: MagasinPoint[], tenant: string): { charges: ChargesMois; salaires: SalairesMois; source: string | null } {
  const defaut = chargesDefaut(magasins, tenant);
  if (ligne && !moisVide(ligne)) return { charges: normaliserCharges(ligne.charges, defaut), salaires: normaliserSalaires(ligne.salaires), source: null };
  if (reference && !moisVide(reference)) {
    const { moisSource: _s, ...c } = normaliserCharges(reference.charges, defaut);
    return {
      charges: JSON.parse(JSON.stringify(c)),
      salaires: { employes: normaliserSalaires(reference.salaires).employes.map(e => ({ ...e, emprunt: 0 })) },
      source: reference.mois,
    };
  }
  return { charges: defaut, salaires: { employes: [] }, source: null };
}

// ── Report d'une correction sur les mois suivants ────────────────────────────

const pareil = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Reporte sur `cible` (un mois suivant déjà enregistré) les changements faits
 * entre `avant` et `apres` : employé ajouté, retiré, nom / fonction / salaire
 * de base corrigé — seulement là où `cible` avait encore l'ancienne valeur.
 * Les emprunts (propres à chaque mois) ne sont jamais reportés.
 */
export function reporterSalaires(avant: SalairesMois, apres: SalairesMois, cible: SalairesMois): SalairesMois {
  let employes = cible.employes.map(e => ({ ...e }));
  const av = new Map(avant.employes.map(e => [e.id, e]));
  const ap = new Map(apres.employes.map(e => [e.id, e]));
  for (const [id, a] of av) {
    const n = ap.get(id);
    if (!n) { employes = employes.filter(e => e.id !== id); continue; }
    const c = employes.find(e => e.id === id);
    if (!c) continue;
    for (const champ of ['nom', 'fonction', 'salaireBase'] as const) {
      if (!pareil(a[champ], n[champ]) && pareil(c[champ], a[champ])) (c as any)[champ] = n[champ];
    }
  }
  for (const [id, n] of ap) {
    if (!av.has(id) && !employes.some(e => e.id === id)) employes.push({ ...n, emprunt: 0 });
  }
  return { ...cible, employes };
}

/**
 * Même chose pour les charges : lignes et colonnes ajoutées, retirées ou
 * renommées, références et montants corrigés (là où `cible` avait encore
 * l'ancienne valeur).
 */
export function reporterCharges(avant: ChargesMois, apres: ChargesMois, cible: ChargesMois): ChargesMois {
  const r: ChargesMois = JSON.parse(JSON.stringify(cible));
  // Lignes
  const lAv = new Map(avant.lignes.map(l => [l.id, l]));
  const lAp = new Map(apres.lignes.map(l => [l.id, l]));
  for (const [id, a] of lAv) {
    const n = lAp.get(id);
    if (!n) { r.lignes = r.lignes.filter(l => l.id !== id); continue; }
    const c = r.lignes.find(l => l.id === id);
    if (c && a.nom !== n.nom && c.nom === a.nom) c.nom = n.nom;
  }
  for (const [id, n] of lAp) {
    if (lAv.has(id) || r.lignes.some(l => l.id === id)) continue;
    const iBas = r.lignes.findIndex(l => l.bas);
    if (n.bas || iBas === -1) r.lignes.push({ ...n }); else r.lignes.splice(iBas, 0, { ...n });
  }
  for (const id of apres.retires) if (!avant.retires.includes(id) && !r.retires.includes(id)) r.retires.push(id);
  for (const id of avant.retires) if (!apres.retires.includes(id)) r.retires = r.retires.filter(x => x !== id);
  // Colonnes
  const cAv = new Map(avant.colonnes.map(c => [c.id, c]));
  const cAp = new Map(apres.colonnes.map(c => [c.id, c]));
  for (const [id, a] of cAv) {
    const n = cAp.get(id);
    if (!n) { r.colonnes = r.colonnes.filter(c => c.id !== id); continue; }
    const c = r.colonnes.find(x => x.id === id);
    if (!c) continue;
    if (a.nom !== n.nom && c.nom === a.nom) c.nom = n.nom;
    if (a.reference !== n.reference && c.reference === a.reference) c.reference = n.reference;
  }
  for (const [id, n] of cAp) if (!cAv.has(id) && !r.colonnes.some(c => c.id === id)) r.colonnes.push({ ...n });
  // Cases : référence et montant
  const lignesIds = new Set([...Object.keys(avant.cases || {}), ...Object.keys(apres.cases || {})]);
  for (const l of lignesIds) {
    const cols = new Set([...Object.keys(avant.cases?.[l] || {}), ...Object.keys(apres.cases?.[l] || {})]);
    for (const col of cols) {
      const a = avant.cases?.[l]?.[col] || {}, n = apres.cases?.[l]?.[col] || {};
      for (const champ of ['ref', 'montant'] as const) {
        if (pareil(a[champ], n[champ])) continue;
        const actuel = r.cases?.[l]?.[col]?.[champ];
        if (!pareil(actuel, a[champ])) continue;
        const cell = { ...((r.cases[l] ||= {})[col] || {}) };
        if (n[champ] === undefined || n[champ] === '') delete cell[champ]; else (cell as any)[champ] = n[champ];
        r.cases[l][col] = cell;
      }
    }
  }
  return r;
}

export const memesCharges = (a: ChargesMois, b: ChargesMois) => pareil(a, b);
export const memesSalaires = (a: SalairesMois, b: SalairesMois) => pareil(a, b);

// ── Totaux ───────────────────────────────────────────────────────────────────

export function montantCase(c: ChargesMois, ligneId: string, colId: string): number {
  return Number(c.cases[ligneId]?.[colId]?.montant) || 0;
}
export function totauxCharges(c: ChargesMois, lignes: LigneCharge[]): { parColonne: Record<string, number>; parLigne: Record<string, number>; total: number } {
  const parColonne: Record<string, number> = {};
  const parLigne: Record<string, number> = {};
  for (const col of c.colonnes) parColonne[col.id] = somme(lignes.map(l => montantCase(c, l.id, col.id)));
  for (const l of lignes) parLigne[l.id] = somme(c.colonnes.map(col => montantCase(c, l.id, col.id)));
  return { parColonne, parLigne, total: somme(Object.values(parColonne)) };
}
export const salaireFinal = (e: Employe) => (Number(e.salaireBase) || 0) - (Number(e.emprunt) || 0);
export function totauxSalaires(s: SalairesMois): { base: number; emprunt: number; final: number } {
  return {
    base: somme(s.employes.map(e => e.salaireBase)),
    emprunt: somme(s.employes.map(e => e.emprunt)),
    final: somme(s.employes.map(salaireFinal)),
  };
}

// ── Import (Excel / CSV / copier-coller) ─────────────────────────────────────

const texte = (v: Cellule) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v)).trim();
/** Montant lu dans une case : « 1 200 000 », « 1.200.000 », « 15000 F »… (vide ou texte → null). */
export function lireMontantCase(v: Cellule): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = texte(v).replace(/[\s  ]/g, '').replace(/(FCFA|XOF|CFA|F)$/i, '');
  if (!s || !/^-?[0-9][0-9.,]*$/.test(s)) return null;
  const groupes = /^-?\d{1,3}([.,]\d{3})+$/.test(s);
  const n = Number(groupes ? s.replace(/[.,]/g, '') : s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
}
/** Même nom à peu près : « YOP GANDHI » = « YOPOUGON GANDI », « BOUAKE » = « BOUAKÉ ». */
export function memeNom(a: string, b: string): boolean {
  if (cle(a) && cle(a) === cle(b)) return true;
  const mots = (s: string) => sansAccents(s).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const x = mots(a), y = mots(b);
  if (!x.length || x.length !== y.length) return false;
  const proches = (p: string, q: string) => {
    if (p === q) return true;
    if (Math.min(p.length, q.length) >= 3 && (p.startsWith(q) || q.startsWith(p))) return true;
    if (Math.min(p.length, q.length) >= 5 && Math.abs(p.length - q.length) <= 1) {
      // une lettre de différence
      let i = 0, j = 0, diff = 0;
      while (i < p.length && j < q.length) {
        if (p[i] === q[j]) { i++; j++; continue; }
        if (++diff > 1) return false;
        if (p.length > q.length) i++; else if (q.length > p.length) j++; else { i++; j++; }
      }
      return diff + (p.length - i) + (q.length - j) <= 1;
    }
    return false;
  };
  return x.every((m, k) => proches(m, y[k]));
}

export interface ResultatImportSalaires { salaires: SalairesMois; ajoutes: number; misAJour: number; ignores: number }

/**
 * Liste d'employés lue dans un tableau (fichier Excel / CSV, ou cellules
 * copiées depuis Excel). Colonnes reconnues par leur titre (NOM, FONCTION,
 * SALAIRE / SALAIRE DE BASE, EMPRUNT) ; sans titres : nom, fonction, salaire,
 * emprunt dans cet ordre. Un employé déjà présent (même nom) est mis à jour.
 */
export function importerSalaires(tableau: Cellule[][], actuel: SalairesMois): ResultatImportSalaires {
  let debut = 0;
  let iNom = 0, iFonction = 1, iSalaire = 2, iEmprunt = 3, avecEmprunt = true;
  const t = tableau.findIndex((r, i) => i < 15 && r.some(c => cle(texte(c)) === 'NOM' || cle(texte(c)) === 'NOMS'));
  if (t >= 0) {
    const r = tableau[t].map(c => cle(texte(c)));
    iNom = r.findIndex(c => c === 'NOM' || c === 'NOMS');
    iFonction = r.findIndex(c => c.startsWith('FONCTION') || c === 'POSTE');
    iSalaire = r.findIndex(c => c.startsWith('SALAIRE') && !c.includes('FINAL') && !c.includes('NET'));
    iEmprunt = r.findIndex(c => c.startsWith('EMPRUNT') || c.startsWith('AVANCE') || c.startsWith('PRET'));
    avecEmprunt = iEmprunt >= 0;
    debut = t + 1;
  }
  const employes = actuel.employes.map(e => ({ ...e }));
  let ajoutes = 0, misAJour = 0, ignores = 0;
  for (const r of tableau.slice(debut)) {
    const nom = texte(r[iNom]);
    if (!nom) continue;
    const k = cle(nom);
    if (k === 'TOTAL' || k.startsWith('FICHESALARIALE') || k === 'NOM') { continue; }
    const salaire = iSalaire >= 0 ? lireMontantCase(r[iSalaire]) : null;
    const emprunt = avecEmprunt ? lireMontantCase(r[iEmprunt]) : null;
    const fonction = iFonction >= 0 ? texte(r[iFonction]) : '';
    if (salaire === null && !fonction) { ignores++; continue; }
    const existant = employes.find(e => cle(e.nom) === k);
    if (existant) {
      if (fonction) existant.fonction = fonction;
      if (salaire !== null) existant.salaireBase = salaire;
      if (emprunt !== null) existant.emprunt = emprunt;
      misAJour++;
    } else {
      employes.push({ id: nouvelId('emp'), nom, fonction, salaireBase: salaire ?? 0, emprunt: emprunt ?? 0 });
      ajoutes++;
    }
  }
  return { salaires: { ...actuel, employes }, ajoutes, misAJour, ignores };
}

export interface ResultatImportCharges { charges: ChargesMois; lignesAjoutees: string[]; colonnesAjoutees: string[]; cases: number }

/**
 * Tableau des charges lu dans un fichier (même présentation que l'export, ou
 * celle du tableau Excel : une ligne de titres « UNITE · FIBRE OPTIQUE · … »
 * puis une ligne « REFERENCE · MONTANT »). Les officines et colonnes sont
 * reconnues par leur nom ; celles qui n'existent pas sont ajoutées.
 */
export function importerCharges(tableau: Cellule[][], actuel: ChargesMois, lignes: LigneCharge[]): ResultatImportCharges {
  const t = tableau.findIndex((r, i) => i < 15 && /^(OFFICINES?|MAGASINS?|LIGNE|LIEU)/.test(cle(texte(r[0]))));
  if (t < 0) throw new Error('Titre « OFFICINE » introuvable en première colonne : utilisez le fichier « ↓ Excel » du tableau des charges comme modèle.');
  const titres = tableau[t].map(texte);
  const sous = (tableau[t + 1] || []).map(c => cle(texte(c)));
  const deuxLignes = sous.some(c => /^(REF|MONTANT)/.test(c));
  // Colonnes du fichier : (index, charge, référence ou montant)
  const champs: { i: number; nom: string; type: 'ref' | 'montant' }[] = [];
  let groupe = '';
  for (let i = 1; i < Math.max(titres.length, sous.length); i++) {
    if (titres[i]) groupe = titres[i];
    if (deuxLignes) {
      const s = sous[i] || '';
      if (!groupe) continue;
      if (s.startsWith('REF')) champs.push({ i, nom: groupe, type: 'ref' });
      else if (s.startsWith('MONTANT') || (!s && titres[i])) champs.push({ i, nom: groupe, type: 'montant' });
    } else if (titres[i]) {
      // « UNITE REFERENCE », « UNITE MONTANT », « LOYER MONTANT », « LOYER »
      const h = sansAccents(titres[i]).toUpperCase().replace(/\s+/g, ' ').trim();
      const m = /^(.*\S)\s+(REF[A-Z.]*|MONTANTS?)$/.exec(h);
      if (m) champs.push({ i, nom: m[1], type: m[2].startsWith('REF') ? 'ref' : 'montant' });
      else if (cle(h) !== 'TOTAL') champs.push({ i, nom: titres[i].trim(), type: 'montant' });
    }
  }
  const colonnes = actuel.colonnes.map(c => ({ ...c }));
  const colonnesAjoutees: string[] = [];
  const colDe = (nom: string, ref: boolean) => {
    let c = colonnes.find(x => memeNom(x.nom, nom));
    if (!c) {
      c = { id: nouvelId('ch'), nom: nom.toUpperCase(), reference: ref, couleur: COULEURS_NOUVELLES_CHARGES[colonnesAjoutees.length % COULEURS_NOUVELLES_CHARGES.length] };
      colonnes.push(c); colonnesAjoutees.push(c.nom);
    } else if (ref && !c.reference) c.reference = true;
    return c;
  };
  for (const ch of champs) colDe(ch.nom, champs.some(x => x.nom === ch.nom && x.type === 'ref'));

  const lignesModele = actuel.lignes.map(l => ({ ...l }));
  const toutes = [...lignes];
  const lignesAjoutees: string[] = [];
  const cases: ChargesMois['cases'] = JSON.parse(JSON.stringify(actuel.cases || {}));
  let n = 0;
  for (const r of tableau.slice(t + (deuxLignes ? 2 : 1))) {
    const nom = texte(r[0]);
    const k = cle(nom);
    if (!nom || k === 'TOTAL' || k.startsWith('CHARGESTOTALES') || k.startsWith('TOTAL')) continue;
    let ligne = toutes.find(l => memeNom(l.nom, nom));
    if (!ligne) {
      ligne = { id: nouvelId('ln'), nom: nom.toUpperCase() };
      // avant les lignes du bas (BUREAU)
      const iBas = lignesModele.findIndex(l => l.bas);
      if (iBas === -1) lignesModele.push(ligne); else lignesModele.splice(iBas, 0, ligne);
      toutes.push(ligne);
      lignesAjoutees.push(ligne.nom);
    } else if (!lignesModele.some(l => l.id === ligne!.id)) {
      const iBas = lignesModele.findIndex(l => l.bas);
      if (iBas === -1) lignesModele.push(ligne); else lignesModele.splice(iBas, 0, ligne);
    }
    for (const ch of champs) {
      const col = colDe(ch.nom, false);
      const v = r[ch.i];
      const cell = { ...((cases[ligne.id] ||= {})[col.id] || {}) };
      if (ch.type === 'ref') {
        const ref = texte(v).replace(/^="?|"$/g, '');
        if (ref) cell.ref = ref; else delete cell.ref;
      } else {
        const m = lireMontantCase(v);
        if (m !== null) cell.montant = m;
        else if (texte(v)) { if (!cell.ref) cell.ref = texte(v); delete cell.montant; }
        else delete cell.montant;
      }
      cases[ligne.id][col.id] = cell;
      n++;
    }
  }
  // Les lignes effectives (magasins apparus depuis) entrent dans le modèle dans le bon ordre
  const ordre = [...lignesModele.filter(l => !l.bas), ...toutes.filter(l => !l.bas && !lignesModele.some(x => x.id === l.id)), ...lignesModele.filter(l => l.bas)];
  return { charges: { ...actuel, colonnes, lignes: ordre, cases }, lignesAjoutees, colonnesAjoutees, cases: n };
}

// ── Export (tableau pour Excel) ──────────────────────────────────────────────

export function tableauCharges(c: ChargesMois, lignes: LigneCharge[]): (string | number)[][] {
  const tot = totauxCharges(c, lignes);
  const tete: string[] = ['OFFICINE'];
  for (const col of c.colonnes) { if (col.reference) tete.push(`${col.nom} REFERENCE`); tete.push(`${col.nom} MONTANT`); }
  const corps = lignes.map(l => {
    const r: (string | number)[] = [l.nom];
    for (const col of c.colonnes) {
      const v = c.cases[l.id]?.[col.id];
      if (col.reference) r.push(v?.ref || '');
      r.push(typeof v?.montant === 'number' ? v.montant : '');
    }
    return r;
  });
  const total: (string | number)[] = ['TOTAL'];
  for (const col of c.colonnes) { if (col.reference) total.push(''); total.push(tot.parColonne[col.id]); }
  return [tete, ...corps, total, ['CHARGES TOTALES', tot.total]];
}
export function tableauSalaires(s: SalairesMois): (string | number)[][] {
  const t = totauxSalaires(s);
  return [
    ['NOM', 'FONCTION', 'SALAIRE DE BASE', 'EMPRUNT', 'SALAIRE FINAL'],
    ...s.employes.map(e => [e.nom, e.fonction, e.salaireBase, e.emprunt, salaireFinal(e)]),
    ['TOTAL', '', t.base, t.emprunt, t.final],
  ];
}
