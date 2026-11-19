/**
 * LECLAIRE — reconnaissance automatique du magasin d'un mouvement.
 *
 * Sources des noms reconnus (catalogue) :
 *  1. les magasins LECLAIRE déjà créés ;
 *  2. les magasins d'OPTICLAIRE (LECLAIRE finance leur ouverture : mêmes noms) ;
 *  3. les villes et communes de Côte d'Ivoire (magasin pas encore créé).
 * Dans le texte d'un mouvement (description, commentaire, bénéficiaire) :
 *  - « MAGASIN DE X », « MAGASIN X », « BOUTIQUE X »… : X est le magasin, même
 *    inconnu (nouveau magasin) ;
 *  - sinon un nom du catalogue cité dans la ligne (« TRANSPORT DE ABIDJAN A
 *    BOUAKE » → BOUAKÉ ; Abidjan, ville du siège, ne compte pas). Le nom le plus
 *    précis l'emporte (YOPOUGON GANDI plutôt que YOPOUGON) ; deux lieux
 *    différents cités → rien n'est décidé.
 * Une ligne qui ne cite aucun magasin prend celui de la ligne la plus proche
 * dans le temps de la même personne (même mission, mêmes travaux), à 45 jours
 * au plus.
 */
import type { Shop } from './types'

export const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Texte comparable : majuscules, sans accents ni ponctuation, espaces simples. */
export const normaliser = (s: unknown) => sansAccents(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

/** Mots trop généraux pour reconnaître un magasin. */
export const MOTS_GENERAUX = new Set(['MAGASIN', 'MAGASINS', 'OPTICLAIRE', 'LECLAIRE', 'OUVERTURE', 'BOUTIQUE', 'MISSION', 'NOUVEAU',
  'NOUVELLE', 'AGENCE', 'SITE', 'CAISSE', 'DES', 'DU', 'DE', 'D', 'LA', 'LE', 'LES', 'L', 'ET', 'AU', 'AUX', 'EN', 'SUR', 'TRAVAUX',
  'OPTIQUE', 'CHANTIER', 'SUCCURSALE', 'SHOWROOM'])

/** Mots distinctifs du nom d'un magasin (« Magasin de Bouaké » → BOUAKE). */
export function motsCles(nom: string): string[] {
  const mots = normaliser(nom).split(' ').filter(m => m.length >= 3 && !MOTS_GENERAUX.has(m) && !/^\d+$/.test(m))
  return mots.length ? mots : normaliser(nom).split(' ').filter(m => m.length >= 3)
}

/** Cœur du nom (« Magasin de Bouaké (ouverture) » → « BOUAKE »). */
export function coeur(nom: string): string {
  const mots = normaliser(nom).split(' ').filter(m => m && !MOTS_GENERAUX.has(m))
  return (mots.length ? mots : normaliser(nom).split(' ')).join(' ')
}

/** Villes et communes de Côte d'Ivoire (noms affichés). Abidjan (siège) n'y est pas. */
export const VILLES_CI: string[] = [
  'ABOBO', 'ADJAMÉ', 'ATTÉCOUBÉ', 'COCODY', 'KOUMASSI', 'MARCORY', 'PORT-BOUËT', 'TREICHVILLE', 'YOPOUGON', 'BINGERVILLE',
  'ANYAMA', 'SONGON', 'BOUAKÉ', 'YAMOUSSOUKRO', 'SAN-PÉDRO', 'DALOA', 'KORHOGO', 'MAN', 'GAGNOA', 'ABENGOUROU', 'DIVO',
  'SOUBRÉ', 'BONDOUKOU', 'ODIENNÉ', 'SÉGUÉLA', 'DIMBOKRO', 'AGBOVILLE', 'GRAND-BASSAM', 'ABOISSO', 'ADZOPÉ', 'SASSANDRA',
  'KATIOLA', 'FERKESSÉDOUGOU', 'TOUMODI', 'ISSIA', 'SINFRA', 'DAOUKRO', 'BOUAFLÉ', 'GUIGLO', 'DUÉKOUÉ', 'TIASSALÉ', 'DABOU',
  'JACQUEVILLE', 'BONOUA', 'TABOU', 'BOUNDIALI', 'TOUBA', 'VAVOUA', 'OUMÉ', 'LAKOTA', 'AGNIBILÉKROU', 'BOUNA', 'MANKONO',
  'DANANÉ', 'BIANKOUMA', 'TANDA', 'ASSINIE', 'ALÉPÉ', 'AZAGUIÉ', 'GRAND-LAHOU', 'MÉAGUI', 'BANGOLO', 'ZUÉNOULA', 'BÉOUMI',
  'SAKASSOU', 'BONGOUANOU', 'TIÉBISSOU', 'DIDIÉVI', 'DABAKALA', 'BOUNA', 'ARRAH', 'TENGRELA', 'MINIGNAN', 'SAMATIGUILA',
  'PLATEAU', 'RIVIERA', 'ANGRÉ', 'DEUX-PLATEAUX', 'BLOCKHAUSS', 'GONZAGUEVILLE', 'NIANGON', 'SIPOREX', 'PALMERAIE', 'FAYA',
]
/** Mots trop courants pour être reconnus seuls dans une phrase (seulement après « MAGASIN… »). */
const SEULEMENT_APRES_MAGASIN = new Set(['PLATEAU', 'RIVIERA', 'PALMERAIE', 'MAN', 'TOUBA', 'ARRAH'])

export interface MagasinConnu {
  /** Cœur du nom, comparable (« BOUAKE », « YOPOUGON GANDI »). */
  cle: string
  /** Nom affiché (et nom donné au magasin créé). */
  nom: string
  /** Magasin LECLAIRE existant ; vide : à créer. */
  id: string | null
  source: 'leclaire' | 'opticlaire' | 'ville' | 'texte' | 'enregistre'
}

/**
 * Nom du magasin à créer : ville ou nom lu dans le texte → nommé comme les
 * magasins d'OPTICLAIRE (« LECLAIRE YAMOUSSOUKRO ») par `nommer` ; magasin
 * d'OPTICLAIRE ou nom enregistré : tel quel.
 */
export function nomACreer(m: MagasinConnu, nommer?: (nom: string) => string): string {
  return nommer && (m.source === 'ville' || m.source === 'texte') ? nommer(m.nom) : m.nom
}

/** Catalogue des noms reconnus : LECLAIRE d'abord, puis OPTICLAIRE, puis villes. */
export function catalogueMagasins(leclaire: Shop[], opticlaire: string[] = [], villes: string[] = VILLES_CI): MagasinConnu[] {
  const out: MagasinConnu[] = []
  const vus = new Set<string>()
  const ajouter = (nom: string, id: string | null, source: MagasinConnu['source']) => {
    const cle = coeur(nom)
    if (!cle || (source !== 'leclaire' && vus.has(cle))) return
    vus.add(cle)
    out.push({ cle, nom: nom.trim(), id, source })
  }
  for (const s of leclaire) ajouter(s.name, s.id, 'leclaire')
  for (const n of opticlaire) ajouter(n, null, 'opticlaire')
  for (const v of villes) ajouter(v, null, 'ville')
  return out
}

const contient = (texte: string, motif: string) => !!motif && (` ${texte} `).includes(` ${motif} `)

/** Mots qui terminent un nom de magasin après « MAGASIN … ». */
const ARRETS = new Set(['SITUE', 'SITUEE', 'A', 'AU', 'AUX', 'EN', 'DE', 'DU', 'DES', 'D', 'PRES', 'COTE', 'ET', 'POUR', 'PAR', 'SUR',
  'DANS', 'LE', 'LA', 'LES', 'L', 'QUI', 'DONT', 'AVEC', 'APRES', 'AVANT', 'FR', 'FCFA', 'F', 'NUMERO', 'NO', 'N', 'RESTE', 'PAYE',
  'PAYEE', 'SOIT', 'OU', 'MOIS', 'JOUR', 'JOURS', 'LOYER', 'CAUTION', 'TRAVAUX', 'ACHAT', 'FACE', 'DERRIERE', 'VERS', 'ENTRE'])
const MOTIF_MAGASIN = /\b(?:MAGASINS?|BOUTIQUES?|AGENCES?|SUCCURSALES?|SHOWROOM)\s+(?:(?:DE|DU|DES|D)\s+)?([A-Z0-9]+(?:\s+[A-Z0-9]+){0,5})/g

/** Nom après « MAGASIN DE … » (jusqu'à un mot d'arrêt, 3 mots au plus). */
function nomsApresMagasin(texte: string): string[] {
  const out: string[] = []
  for (const m of texte.matchAll(MOTIF_MAGASIN)) {
    const mots: string[] = []
    for (const mot of m[1].split(' ')) {
      if (ARRETS.has(mot) || /^\d+$/.test(mot) || mots.length >= 3) break
      mots.push(mot)
    }
    const nom = mots.filter(x => !MOTS_GENERAUX.has(x)).join(' ')
    if (nom.length >= 3) out.push(nom)
  }
  return out
}

export interface Reconnaissance {
  magasin: MagasinConnu | null
  /** « mention » : après « MAGASIN… » ; « nom » : nom cité dans la phrase. */
  par: 'mention' | 'nom' | null
  /** Plusieurs lieux différents cités : rien n'est décidé. */
  ambigu?: boolean
}

/** Garde les noms les plus précis (YOPOUGON GANDI fait tomber YOPOUGON) ; plusieurs lieux restants → ambigu. */
function choisir(trouves: MagasinConnu[], par: Reconnaissance['par']): Reconnaissance {
  const uniques = trouves.filter((m, i) => trouves.findIndex(x => x.cle === m.cle) === i)
  const precis = uniques.filter(m => !uniques.some(x => x !== m && x.cle !== m.cle && contient(x.cle, m.cle)))
  if (precis.length === 1) return { magasin: precis[0], par }
  return { magasin: null, par: null, ambigu: precis.length > 1 }
}

/**
 * Magasin cité dans un ou plusieurs textes (description, commentaire,
 * bénéficiaire). Chaque texte est lu SÉPARÉMENT : « …au magasin » à la fin du
 * commentaire ne se lit pas avec le bénéficiaire « TAXI MOTO » qui suit.
 * `creer` : un nom inconnu après « MAGASIN… » devient un nouveau magasin
 * (import) ; sinon il est ignoré (saisie).
 */
export function reconnaitre(textes: string | string[], catalogue: MagasinConnu[], creer = true): Reconnaissance {
  const ts = (Array.isArray(textes) ? textes : [textes]).map(normaliser).filter(Boolean)
  if (!ts.length) return { magasin: null, par: null }
  // 1) « MAGASIN DE X »
  const mentions: MagasinConnu[] = []
  for (const t of ts) for (const nom of nomsApresMagasin(t)) {
    const cle = coeur(nom)
    const exact = catalogue.find(m => m.cle === cle)
    const debut = catalogue.filter(m => cle.startsWith(m.cle + ' ')).sort((a, b) => b.cle.length - a.cle.length)[0]
    const connu = exact || debut
    if (connu) mentions.push(connu)
    else if (creer) mentions.push({ cle, nom, id: null, source: 'texte' })
  }
  if (mentions.length) return choisir(mentions, 'mention')
  // 2) nom cité dans la phrase
  const cites = catalogue.filter(m => !(m.source !== 'leclaire' && SEULEMENT_APRES_MAGASIN.has(m.cle)) && ts.some(t => contient(t, m.cle)))
  if (cites.length) return choisir(cites, 'nom')
  // 3) mot distinctif d'un magasin LECLAIRE (« Bouaké chantier » cité par « BOUAKE »)
  const parMot = catalogue.filter(m => m.source === 'leclaire' && motsCles(m.nom).some(k => !SEULEMENT_APRES_MAGASIN.has(k) && ts.some(t => contient(t, k))))
  if (parMot.length) return choisir(parMot, 'nom')
  return { magasin: null, par: null }
}

// ── Déduction par période ────────────────────────────────────────────────────

const jourNum = (d: string) => { const t = Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`); return isNaN(t) ? NaN : t / 86400000 }

export interface ElementPeriode { date: string; groupe: string; cle: string | null }

/**
 * Pour chaque élément sans magasin : magasin de l'élément le plus proche dans
 * le temps du même groupe (même personne), à `maxJours` au plus ; à égalité,
 * le plus ancien (début de la mission). Renvoie l'indice de l'élément de
 * référence, ou -1.
 */
export function deduireParPeriode(elements: ElementPeriode[], maxJours = 45): number[] {
  const parGroupe = new Map<string, Array<{ j: number; i: number }>>()
  elements.forEach((e, i) => {
    const j = jourNum(e.date)
    if (e.cle && !isNaN(j)) {
      const l = parGroupe.get(e.groupe) || []
      l.push({ j, i })
      parGroupe.set(e.groupe, l)
    }
  })
  for (const l of parGroupe.values()) l.sort((a, b) => a.j - b.j || a.i - b.i)
  return elements.map(e => {
    if (e.cle) return -1
    const j = jourNum(e.date)
    const l = parGroupe.get(e.groupe)
    if (!l || isNaN(j)) return -1
    let meilleur: { j: number; i: number } | null = null
    let ecart = Infinity
    for (const x of l) {
      const d = Math.abs(x.j - j)
      if (d < ecart || (d === ecart && meilleur && x.j < meilleur.j)) { ecart = d; meilleur = x }
    }
    return meilleur && ecart <= maxJours ? meilleur.i : -1
  })
}
