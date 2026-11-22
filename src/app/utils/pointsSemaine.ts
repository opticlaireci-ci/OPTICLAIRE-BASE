/**
 * « Point hebdomadaire » et « Point Mobile Money » (page Mouvement) — calculs.
 *
 * Les deux points se REMPLISSENT SEULS à partir des encaissements
 * d'OPTICLAIRE (acompte de chaque vente, règlements clients, entrées de caisse
 * et de la comptabilité générale) :
 *  - point hebdomadaire : recettes de chaque officine, jour par jour ;
 *  - point Mobile Money : les mêmes encaissements, rangés par moyen de
 *    paiement (Orange Money, Wave, TPE / Visa…).
 * Rien de ce qui vient des assurances n'en fait partie : ni les bons ou la
 * prise en charge, ni les règlements des assurances, ni une entrée notée
 * « assurance ». Le cadre « Recette assurance » du point hebdomadaire se
 * remplit à la main.
 *
 * Toute case reste MODIFIABLE : le montant tapé remplace le calcul (case
 * « modifiée à la main ») ; vider la case revient au calcul automatique. On
 * peut ajouter des officines, des colonnes, des lignes, des moyens de paiement.
 *
 * Enregistrement : une clé partagée par semaine (`leclaire_point_hebdo_<lundi>`,
 * `leclaire_point_mobile_<lundi>`) + le dernier modèle (officines, colonnes,
 * lignes) repris pour les semaines suivantes. Rien de plus n'est nécessaire
 * dans Supabase (données partagées d'OPTICLAIRE, `app_data`).
 *
 * Ce module ne contient que des calculs (aucun accès au réseau ni à l'écran).
 */
import type { VenteSupabase } from '../services/ventesService';
import type { ReglementSupabase } from '../services/reglementsService';
import type { AuditInfo } from './auditUtils';

export const JOURS_POINT = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'] as const;

/** Rôles qui modifient les points (les mêmes que pour le Récap hebdomadaire). */
export const ROLES_ECRITURE = ['super_admin', 'admin', 'administrateur', 'directeur', 'comptable'];

/** Entrée / sortie de caisse d'un magasin (clé `leclaire_mouvements_caisse`). */
export interface MouvementCaisseRecap {
  id: string; date: string; magasinId: string; type: 'entree' | 'sortie'; categorie: string;
  montant: number; libelle: string; modePaiement: string; reference?: string; responsable?: string;
}
/** Mouvement de la comptabilité générale (clé `leclaire_mouvements`, page Mouvement). */
export interface MouvementAdministrationRecap {
  id: string; reference: string; magasin?: string; dateMouvement: string; heure?: string; beneficiaire: string;
  type: string; nature: string; montant: number; modePaiement: string; compteBanque: string; commentaire: string;
}

/** Date « aaaa-mm-jj » d'une date enregistrée (comme le Récap hebdomadaire). */
export function dateMouvementISO(date: string): string {
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? String(date).slice(0, 10) : parsed.toISOString().slice(0, 10);
}
export function normaliserTypeMouvement(type: unknown): 'entree' | 'sortie' | '' {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'entree' || t === 'entrée' || t === 'in' || t === 'credit') return 'entree';
  if (t === 'sortie' || t === 'out' || t === 'debit') return 'sortie';
  return '';
}
/** Tout ce qui vient d'une assurance est exclu des points. */
const estAssurance = (...textes: unknown[]) => textes.some(t => /assurance/i.test(String(t || '')));

// ── Semaines (dates « aaaa-mm-jj » sans fuseau horaire) ─────────────────────

const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];

function versUtc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
function depuisUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function ajouterJours(iso: string, n: number): string {
  const d = versUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return depuisUtc(d);
}
/** Lundi de la semaine qui contient la date. */
export function lundiDe(iso: string): string {
  const d = versUtc(iso);
  const j = d.getUTCDay(); // 0 = dimanche
  return ajouterJours(iso, j === 0 ? -6 : 1 - j);
}
/** Date du jour (heure du poste). */
export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** « DU 26 AU 31 OCTOBRE 2026 » (lundi → samedi, ou → dimanche). */
export function libelleSemaine(lundi: string, nbJours = 6): string {
  const a = versUtc(lundi), b = versUtc(ajouterJours(lundi, nbJours - 1));
  const j = (d: Date) => (d.getUTCDate() === 1 ? '1ER' : String(d.getUTCDate()));
  const mois = (d: Date) => MOIS[d.getUTCMonth()];
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `DU ${j(a)} ${mois(a)} ${a.getUTCFullYear()} AU ${j(b)} ${mois(b)} ${b.getUTCFullYear()}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `DU ${j(a)} ${mois(a)} AU ${j(b)} ${mois(b)} ${b.getUTCFullYear()}`;
  return `DU ${j(a)} AU ${j(b)} ${mois(b)} ${b.getUTCFullYear()}`;
}
/** « 26/10 » */
export function jourMois(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// ── Outils ───────────────────────────────────────────────────────────────────

export function sansAccents(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
/** Clé de comparaison : majuscules, sans accents ni ponctuation. */
export function cle(s: string): string {
  return sansAccents(s).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}
export const somme = (l: number[]) => l.reduce((a, b) => a + (Number(b) || 0), 0);
let compteur = 0;
export function nouvelId(prefixe: string): string {
  compteur = (compteur + 1) % 1000;
  return `${prefixe}-${Date.now().toString(36)}${compteur.toString(36)}`;
}

export interface MagasinPoint { id: string; label: string }

/** Nom court d'un magasin : « LECLAIRE YOPOUGON GANDI » → « YOPOUGON GANDI ». */
export function nomCourt(label: string, tenant: string): string {
  const l = String(label || '').trim();
  return (tenant && l.toUpperCase().startsWith(tenant.toUpperCase() + ' ') ? l.slice(tenant.length + 1) : l).toUpperCase();
}

/**
 * Ordre des magasins comme sur les points papier ; les autres magasins
 * d'OPTICLAIRE suivent dans leur ordre habituel.
 */
function ordonner(magasins: MagasinPoint[], tenant: string, prefere: string[]): MagasinPoint[] {
  const rang = (m: MagasinPoint) => {
    const k = [cle(m.id), cle(nomCourt(m.label, tenant))];
    const i = prefere.findIndex(p => k.includes(p));
    return i === -1 ? prefere.length : i;
  };
  return magasins.map((m, i) => ({ m, i })).sort((a, b) => rang(a.m) - rang(b.m) || a.i - b.i).map(x => x.m);
}

// ── Données de la semaine (lues dans OPTICLAIRE) ─────────────────────────────

export interface DonneesSemaine {
  semaine: string; // lundi
  tenant: string;
  magasins: MagasinPoint[];
  ventes: VenteSupabase[];
  reglements: ReglementSupabase[];
  mouvementsCaisse: MouvementCaisseRecap[];
  mouvementsAdministration: MouvementAdministrationRecap[];
}

const dansLaSemaine = (semaine: string, date: string) => {
  const d = dateMouvementISO(date);
  return !!d && d >= semaine && d <= ajouterJours(semaine, 6);
};
const indexJour = (semaine: string, date: string) => {
  const d = dateMouvementISO(date);
  for (let i = 0; i < 7; i++) if (ajouterJours(semaine, i) === d) return i;
  return -1;
};

/** Moyen de paiement reconnu dans un libellé de mode de paiement. */
export type CleMoyen = 'orange' | 'wave' | 'tpe' | 'mtn' | 'moov' | 'mobile';
export function classerMode(mode: string): CleMoyen | 'cheque' | null {
  const n = ' ' + sansAccents(mode).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  if (!n.trim()) return null;
  if (/assurance/.test(n)) return null;
  if (/ orange| om /.test(n)) return 'orange';
  if (/wave/.test(n)) return 'wave';
  if (/ mtn|momo/.test(n)) return 'mtn';
  if (/moov|flooz/.test(n)) return 'moov';
  if (/ tpe | visa|carte| cb |master ?card/.test(n)) return 'tpe';
  if (/cheque/.test(n)) return 'cheque';
  if (/mobile ?money/.test(n)) return 'mobile';
  return null;
}

export interface Encaissement { magasinId: string; date: string; montant: number; mode: string }

/**
 * Encaissements de la semaine, magasin par magasin, avec leur mode de
 * paiement : acompte de chaque vente (au jour de la vente), règlements
 * clients, entrées de caisse et entrées de la comptabilité générale (les
 * sources des recettes du Récap hebdomadaire). Jamais rien qui vienne d'une
 * assurance (mode de paiement, nature ou catégorie « assurance »).
 */
export function encaissementsDeLaSemaine(d: DonneesSemaine): Encaissement[] {
  const res: Encaissement[] = [];
  const pousser = (magasinId: string, date: string, montant: number, mode: string) => {
    if (!magasinId || !(montant > 0) || !dansLaSemaine(d.semaine, date)) return;
    res.push({ magasinId: String(magasinId).toUpperCase(), date: dateMouvementISO(date), montant, mode: String(mode || '') });
  };
  for (const v of d.ventes) {
    if ((v.type || 'vente') !== 'vente') continue;
    const mode = (v.recap as any)?.modePaiement;
    if (estAssurance(mode)) continue;
    pousser(v.magasin_id, v.date, parseFloat(String((v.recap as any)?.acompte ?? '0')) || 0, mode);
  }
  for (const r of d.reglements) {
    if (estAssurance(r.mode_paiement)) continue;
    pousser(r.magasin_id, r.date, Number(r.montant) || 0, r.mode_paiement);
  }
  for (const m of d.mouvementsCaisse) {
    if (normaliserTypeMouvement(m.type) !== 'entree' || estAssurance(m.modePaiement, m.categorie, m.libelle)) continue;
    pousser(m.magasinId, m.date, Number(m.montant) || 0, m.modePaiement);
  }
  // Comptabilité générale : magasin enregistré sous forme de libellé.
  const parLibelle = new Map<string, string>();
  for (const m of d.magasins) {
    parLibelle.set(cle(m.id), m.id);
    parLibelle.set(cle(m.label), m.id);
    parLibelle.set(cle(nomCourt(m.label, d.tenant)), m.id);
  }
  for (const m of d.mouvementsAdministration) {
    if (normaliserTypeMouvement(m.type) !== 'entree' || estAssurance(m.modePaiement, m.nature, m.beneficiaire)) continue;
    const id = parLibelle.get(cle(m.magasin || ''));
    if (id) pousser(id, m.dateMouvement, Number(m.montant) || 0, m.modePaiement);
  }
  return res;
}

// ── Modèles enregistrés ──────────────────────────────────────────────────────

export type Operation = 'plus' | 'moins' | 'info';
export type SourceRecap = 'officines' | 'assurances' | 'tpe' | 'frais' | 'manuel';

export interface BlocOfficine { id: string; nom: string; magasinId?: string }
export interface ColonneAssurance { id: string; nom: string; sousTraitance?: boolean }
export interface LigneRecap { id: string; libelle: string; source: SourceRecap; operation: Operation }
export interface ModeleHebdo {
  blocs: BlocOfficine[];
  /** Magasins retirés du point (ils ne reviennent pas seuls). */
  retires: string[];
  assurances: ColonneAssurance[];
  recap: LigneRecap[];
}
export interface ValeursHebdo {
  /** Recettes tapées à la main : bloc → jour (0 = lundi) → montant. */
  cases: Record<string, Record<number, number>>;
  /** Montants tapés dans une colonne d'assurance (cadre rempli à la main). */
  assurancesManuelles: Record<string, number[]>;
  /** Ligne du récapitulatif corrigée : ligne → montant. */
  recap: Record<string, number>;
}
export interface DocHebdo extends AuditInfo { id: string; semaine: string; titre?: string; modele: ModeleHebdo; valeurs: ValeursHebdo }

export type CouleurMoyen = string;
export interface Moyen { id: string; nom: string; cle?: CleMoyen; couleur: CouleurMoyen }
export interface ColonneMagasin { id: string; nom: string; magasinId?: string }
export interface ModeleMobile {
  colonnes: ColonneMagasin[];
  retires: string[];
  moyens: Moyen[];
  /** Ligne du dimanche toujours affichée (sinon seulement s'il y a des dépôts). */
  dimanche: boolean;
}
export interface ValeursMobile {
  /** Dépôts tapés à la main : moyen → colonne → jour → montant. */
  cases: Record<string, Record<string, Record<number, number>>>;
}
export interface DocMobile extends AuditInfo { id: string; semaine: string; titre?: string; modele: ModeleMobile; valeurs: ValeursMobile }

export const CLE_POINT_HEBDO = (semaine: string) => `leclaire_point_hebdo_${semaine}`;
export const CLE_POINT_MOBILE = (semaine: string) => `leclaire_point_mobile_${semaine}`;
export const CLE_MODELE_HEBDO = 'leclaire_point_hebdo_modele';
export const CLE_MODELE_MOBILE = 'leclaire_point_mobile_modele';

const ORDRE_HEBDO = ['PALMERAIE', 'YOPOUGON', 'ABOBO', 'BOUAKE', 'FAYA', 'KOUMASSI', 'BINGERVILLE', 'YOPOUGONGANDI'];
const ORDRE_MOBILE = ['PALMERAIE', 'YOPOUGON', 'ABOBO', 'FAYA', 'KOUMASSI', 'BINGERVILLE', 'BOUAKE', 'YOPOUGONGANDI'];

export const COULEURS_MOYENS: Record<CleMoyen, string> = {
  orange: '#ED7D31', wave: '#00B0F0', tpe: '#FFD966', mtn: '#FFCB05', moov: '#2E75B6', mobile: '#A6A6A6',
};
export const NOMS_MOYENS: Record<CleMoyen, string> = {
  orange: 'ORANGE MONEY', wave: 'WAVE', tpe: 'TPE VISA', mtn: 'MTN MONEY', moov: 'MOOV MONEY', mobile: 'MOBILE MONEY (opérateur non précisé)',
};

export function modeleHebdoDefaut(magasins: MagasinPoint[], tenant: string): ModeleHebdo {
  return {
    blocs: ordonner(magasins, tenant, ORDRE_HEBDO).map(m => ({ id: `mag-${m.id}`, magasinId: m.id, nom: `OFFICINE ${nomCourt(m.label, tenant)}` })),
    retires: [],
    assurances: [
      { id: 'ass-mci', nom: 'MCI' },
      { id: 'ass-willis', nom: 'WILLIS' },
      { id: 'ass-axa', nom: 'AXA', sousTraitance: true },
    ],
    recap: [
      { id: 'rc-tpe', libelle: 'RECETTE TPE/VISA/CHEQUE', source: 'tpe', operation: 'info' },
      { id: 'rc-officines', libelle: 'RECETTES TOTALES OFFICINES', source: 'officines', operation: 'plus' },
      { id: 'rc-assurances', libelle: 'RECETTES ASSURANCES', source: 'assurances', operation: 'plus' },
      { id: 'rc-frais', libelle: 'Frais Wave et OM 1%', source: 'frais', operation: 'moins' },
    ],
  };
}

export function modeleMobileDefaut(magasins: MagasinPoint[], tenant: string): ModeleMobile {
  return {
    colonnes: ordonner(magasins, tenant, ORDRE_MOBILE).map(m => ({ id: `mag-${m.id}`, magasinId: m.id, nom: nomCourt(m.label, tenant) })),
    retires: [],
    moyens: (['orange', 'wave', 'tpe'] as CleMoyen[]).map(k => ({ id: `moy-${k}`, nom: NOMS_MOYENS[k], cle: k, couleur: COULEURS_MOYENS[k] })),
    dimanche: false,
  };
}

export const valeursHebdoVides = (): ValeursHebdo => ({ cases: {}, assurancesManuelles: {}, recap: {} });
export const valeursMobileVides = (): ValeursMobile => ({ cases: {} });

/** Remet d'aplomb un document lu (données anciennes, champs manquants). */
export function normaliserDocHebdo(doc: Partial<DocHebdo> | undefined, semaine: string, modele: ModeleHebdo): DocHebdo {
  const v = (doc?.valeurs || {}) as Partial<ValeursHebdo>;
  const m = (doc?.modele || modele) as Partial<ModeleHebdo>;
  return {
    ...(doc || {}),
    id: doc?.id || semaine,
    semaine,
    titre: doc?.titre,
    modele: {
      blocs: Array.isArray(m.blocs) ? m.blocs : modele.blocs,
      retires: Array.isArray(m.retires) ? m.retires : [],
      assurances: Array.isArray(m.assurances) ? m.assurances : modele.assurances,
      recap: Array.isArray(m.recap) ? m.recap : modele.recap,
    },
    valeurs: { cases: v.cases || {}, assurancesManuelles: v.assurancesManuelles || {}, recap: v.recap || {} },
  };
}
export function normaliserDocMobile(doc: Partial<DocMobile> | undefined, semaine: string, modele: ModeleMobile): DocMobile {
  const m = (doc?.modele || modele) as Partial<ModeleMobile>;
  return {
    ...(doc || {}),
    id: doc?.id || semaine,
    semaine,
    titre: doc?.titre,
    modele: {
      colonnes: Array.isArray(m.colonnes) ? m.colonnes : modele.colonnes,
      retires: Array.isArray(m.retires) ? m.retires : [],
      moyens: Array.isArray(m.moyens) ? m.moyens : modele.moyens,
      dimanche: !!m.dimanche,
    },
    valeurs: { cases: (doc?.valeurs as ValeursMobile | undefined)?.cases || {} },
  };
}

const lireCase = (t: Record<number, number> | undefined, j: number): number | undefined => {
  const v = t?.[j];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

// ── Point hebdomadaire ───────────────────────────────────────────────────────

export interface CaseCalculee { auto: number; valeur: number; modifie: boolean }
export interface VueBloc { bloc: BlocOfficine; cases: CaseCalculee[]; total: number }
export interface LigneAssurance { cle: string; index: number; valeur: number }
export interface VueAssurance { colonne: ColonneAssurance; lignes: LigneAssurance[]; total: number }
export interface VueLigneRecap { ligne: LigneRecap; auto: number; valeur: number; modifie: boolean }
export interface VueHebdo {
  blocs: VueBloc[];
  assurances: VueAssurance[];
  recap: VueLigneRecap[];
  totalOfficines: number;
  totalAssurances: number;
  totalSousTraitance: number;
  montantDepose: number;
}

/** Blocs du modèle + magasins d'OPTICLAIRE apparus depuis (sauf retirés). */
export function blocsEffectifs(modele: ModeleHebdo, magasins: MagasinPoint[], tenant: string): BlocOfficine[] {
  const pris = new Set(modele.blocs.map(b => b.magasinId).filter(Boolean).map(id => String(id).toUpperCase()));
  const retires = new Set(modele.retires.map(id => String(id).toUpperCase()));
  const nouveaux = ordonner(magasins, tenant, ORDRE_HEBDO)
    .filter(m => !pris.has(m.id.toUpperCase()) && !retires.has(m.id.toUpperCase()))
    .map(m => ({ id: `mag-${m.id}`, magasinId: m.id, nom: `OFFICINE ${nomCourt(m.label, tenant)}` }));
  return [...modele.blocs, ...nouveaux];
}

export function calculerHebdo(doc: DocHebdo, d: DonneesSemaine, mobile?: { orange: number; wave: number; tpe: number }): VueHebdo {
  const { modele, valeurs } = doc;
  const enc = encaissementsDeLaSemaine(d);
  const blocs: VueBloc[] = blocsEffectifs(modele, d.magasins, d.tenant).map(bloc => {
    const auto = [0, 0, 0, 0, 0, 0, 0];
    if (bloc.magasinId) {
      const mag = bloc.magasinId.toUpperCase();
      for (const e of enc) {
        const j = indexJour(d.semaine, e.date);
        if (e.magasinId === mag && j >= 0) auto[j] += e.montant;
      }
    }
    const cases = JOURS_POINT.map((_, j) => {
      const tape = lireCase(valeurs.cases[bloc.id], j);
      return { auto: auto[j] || 0, valeur: tape ?? (auto[j] || 0), modifie: tape !== undefined && tape !== (auto[j] || 0) };
    });
    return { bloc, cases, total: somme(cases.map(c => c.valeur)) };
  });

  // Recette assurance : remplie à la main (les règlements des assurances
  // enregistrés dans OPTICLAIRE n'en font pas partie). Une colonne sans
  // montant montre une case vide prête à la saisie.
  const assurances: VueAssurance[] = modele.assurances.map(colonne => {
    const tapes = valeurs.assurancesManuelles[colonne.id] || [];
    const lignes = (tapes.length ? tapes : [0]).map((m, index) => ({ cle: `m-${index}`, index, valeur: Number(m) || 0 }));
    return { colonne, lignes, total: somme(lignes.map(l => l.valeur)) };
  });

  const totalOfficines = somme(blocs.map(b => b.total));
  const totalAssurances = somme(assurances.filter(a => !a.colonne.sousTraitance).map(a => a.total));
  const totalSousTraitance = somme(assurances.filter(a => a.colonne.sousTraitance).map(a => a.total));
  const tpeCheque = somme(enc.filter(e => { const k = classerMode(e.mode); return k === 'tpe' || k === 'cheque'; }).map(e => e.montant));
  const orangeWave = mobile ? mobile.orange + mobile.wave : somme(enc.filter(e => { const k = classerMode(e.mode); return k === 'orange' || k === 'wave'; }).map(e => e.montant));
  const autoDe = (s: SourceRecap) => s === 'officines' ? totalOfficines : s === 'assurances' ? totalAssurances
    : s === 'tpe' ? tpeCheque : s === 'frais' ? Math.round(orangeWave / 100) : 0;
  const recap: VueLigneRecap[] = modele.recap.map(ligne => {
    const auto = autoDe(ligne.source);
    const tape = valeurs.recap[ligne.id];
    const v = typeof tape === 'number' && Number.isFinite(tape) ? tape : auto;
    return { ligne, auto, valeur: v, modifie: v !== auto };
  });
  const montantDepose = somme(recap.filter(r => r.ligne.operation === 'plus').map(r => r.valeur))
    - somme(recap.filter(r => r.ligne.operation === 'moins').map(r => r.valeur));
  return { blocs, assurances, recap, totalOfficines, totalAssurances, totalSousTraitance, montantDepose };
}

// ── Point Mobile Money ───────────────────────────────────────────────────────

export interface VueColonneMoyen { colonne: ColonneMagasin; cases: CaseCalculee[]; total: number }
export interface VueMoyen { moyen: Moyen; dansModele: boolean; colonnes: VueColonneMoyen[]; totauxJour: number[]; total: number }
export interface VueMobile {
  jours: number[]; // index des jours affichés (0 = lundi)
  colonnes: ColonneMagasin[];
  moyens: VueMoyen[];
  /** Tableau global : colonne → jour → total tous moyens. */
  global: number[][];
  totauxColonne: number[];
  totauxJour: number[];
  total: number;
  /** Totaux par moyen reconnu (pour les frais Wave / Orange du point hebdomadaire). */
  parCle: Record<CleMoyen, number>;
}

export function colonnesEffectives(modele: ModeleMobile, magasins: MagasinPoint[], tenant: string): ColonneMagasin[] {
  const pris = new Set(modele.colonnes.map(c => c.magasinId).filter(Boolean).map(id => String(id).toUpperCase()));
  const retires = new Set(modele.retires.map(id => String(id).toUpperCase()));
  const nouvelles = ordonner(magasins, tenant, ORDRE_MOBILE)
    .filter(m => !pris.has(m.id.toUpperCase()) && !retires.has(m.id.toUpperCase()))
    .map(m => ({ id: `mag-${m.id}`, magasinId: m.id, nom: nomCourt(m.label, tenant) }));
  return [...modele.colonnes, ...nouvelles];
}

export function calculerMobile(doc: DocMobile, d: DonneesSemaine): VueMobile {
  const { modele, valeurs } = doc;
  const colonnes = colonnesEffectives(modele, d.magasins, d.tenant);
  const enc = encaissementsDeLaSemaine(d).map(e => ({ ...e, cle: classerMode(e.mode), j: indexJour(d.semaine, e.date) }));

  // Moyens : ceux du modèle + ceux trouvés dans les encaissements de la semaine.
  const moyens: { moyen: Moyen; dansModele: boolean }[] = modele.moyens.map(m => ({ moyen: m, dansModele: true }));
  for (const e of enc) {
    if (!e.cle || e.cle === 'cheque') continue;
    const k = e.cle;
    if (!moyens.some(m => m.moyen.cle === k)) moyens.push({ moyen: { id: `moy-${k}`, nom: NOMS_MOYENS[k], cle: k, couleur: COULEURS_MOYENS[k] }, dansModele: false });
  }

  const vues: VueMoyen[] = moyens.map(({ moyen, dansModele }) => {
    const cols = colonnes.map(colonne => {
      const auto = [0, 0, 0, 0, 0, 0, 0];
      if (moyen.cle && colonne.magasinId) {
        const mag = colonne.magasinId.toUpperCase();
        for (const e of enc) if (e.cle === moyen.cle && e.magasinId === mag && e.j >= 0) auto[e.j] += e.montant;
      }
      const tapees = valeurs.cases[moyen.id]?.[colonne.id];
      const cases = auto.map((a, j) => {
        const t = lireCase(tapees, j);
        return { auto: a, valeur: t ?? a, modifie: t !== undefined && t !== a };
      });
      return { colonne, cases, total: somme(cases.map(c => c.valeur)) };
    });
    const totauxJour = JOURS_POINT.map((_, j) => somme(cols.map(c => c.cases[j].valeur)));
    return { moyen, dansModele, colonnes: cols, totauxJour, total: somme(totauxJour) };
  });

  const global = colonnes.map((_, ci) => JOURS_POINT.map((__, j) => somme(vues.map(v => v.colonnes[ci].cases[j].valeur))));
  const totauxJour = JOURS_POINT.map((_, j) => somme(global.map(c => c[j])));
  const jours = [0, 1, 2, 3, 4, 5, ...(modele.dimanche || totauxJour[6] !== 0 ? [6] : [])];
  const parCle = { orange: 0, wave: 0, tpe: 0, mtn: 0, moov: 0, mobile: 0 } as Record<CleMoyen, number>;
  for (const v of vues) if (v.moyen.cle) parCle[v.moyen.cle] += v.total;
  return {
    jours, colonnes, moyens: vues, global,
    totauxColonne: global.map(c => somme(c)),
    totauxJour, total: somme(totauxJour), parCle,
  };
}

/** Texte lisible (noir ou blanc) sur une couleur de fond « #RRGGBB ». */
export function texteSur(fond: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(fond || '');
  if (!m) return '#000';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000' : '#fff';
}

/** Couleurs des colonnes de magasins (comme sur le point papier). */
export const COULEURS_COLONNES = ['#DAE3F3', '#B4C7E7', '#8FAADC', '#9DC3E6', '#FBE5D6', '#FCE4D6', '#F8CBAD', '#E2EFDA', '#D9D2E9', '#FFF2CC'];
