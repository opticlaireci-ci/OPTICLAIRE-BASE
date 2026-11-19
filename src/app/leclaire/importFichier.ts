/**
 * LECLAIRE — import de mouvements depuis un fichier (CSV exporté par
 * LECLAIRE « Excel / CSV », ou tableau Excel).
 *
 *  - Colonnes reconnues par leur titre (l'ordre n'a pas d'importance) :
 *    Date, Type, Description, Catégorie, Mode de paiement,
 *    Bénéficiaire/Source, Entrée, Sortie (ou Montant), Commentaire, et
 *    facultativement Magasin et Personne.
 *  - Magasin de chaque ligne : colonne « Magasin » si elle existe ; sinon le
 *    magasin LECLAIRE cité dans la ligne (description, commentaire,
 *    bénéficiaire : « CAUTION MAGASIN BINGERVILLE ») ; sinon le magasin par
 *    défaut choisi à l'import.
 *  - Pas de doublon : une ligne identique (date, type, montant, description,
 *    bénéficiaire) déjà présente dans LECLAIRE est signalée et décochée ; un
 *    même fichier importé deux fois n'ajoute rien la seconde fois.
 */
import type { Shop, Transaction } from './types'
import type { LigneMouvement } from './leclaireService'

export type Cellule = string | number | boolean | Date | null | undefined

export interface LigneFichier {
  /** Numéro de la ligne dans le fichier (1 = première ligne). */
  numero: number
  date: string
  type: 'income' | 'expense' | null
  montant: number | null
  description: string
  categorie: string
  mode: string
  beneficiaire: string
  commentaire: string
  magasinTexte: string
  personneTexte: string
  erreur?: string
}

export interface ResultatLecture {
  lignes: LigneFichier[]
  /** Colonnes trouvées (nom interne → titre dans le fichier). */
  colonnes: Record<string, string>
  aColonneMagasin: boolean
  aColonnePersonne: boolean
}

// ── Texte ────────────────────────────────────────────────────────────────────

export const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Texte comparable : majuscules, sans accents ni ponctuation, espaces simples. */
export const normaliser = (s: unknown) => sansAccents(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const cle = (s: unknown) => sansAccents(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Octets d'un fichier texte → texte (UTF-8, sinon Windows-1252 : CSV réenregistré par Excel). */
export function decoderTexte(octets: ArrayBuffer): string {
  let t: string
  try {
    t = new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    t = new TextDecoder('windows-1252').decode(octets)
  }
  return t.replace(/^﻿/, '')
}

/** CSV → tableau (séparateur « ; », « , » ou tabulation, guillemets gérés). */
export function lireCsv(texte: string): string[][] {
  const premiere = texte.split(/\r?\n/).find(l => l.trim()) || ''
  const compter = (sep: string) => { let n = 0, q = false; for (const c of premiere) { if (c === '"') q = !q; else if (c === sep && !q) n++ } return n }
  const sep = [';', '\t', ','].map(s => [s, compter(s)] as const).sort((a, b) => b[1] - a[1])[0][0]
  const lignes: string[][] = []
  let ligne: string[] = [], champ = '', guillemets = false
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (guillemets) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++ } else guillemets = false }
      else champ += c
    } else if (c === '"' && champ.trim() === '') { champ = ''; guillemets = true }
    else if (c === sep) { ligne.push(champ); champ = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''
    } else champ += c
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  return lignes
}

/** Fichier choisi (CSV, TXT, XLSX, XLS, ODS) → tableau de cellules. */
export async function lireTableur(fichier: Blob & { name?: string }): Promise<Cellule[][]> {
  const nom = (fichier.name || '').toLowerCase()
  const octets = await fichier.arrayBuffer()
  if (/\.(xlsx|xlsm|xls|ods)$/.test(nom)) {
    const XLSX = await import('xlsx')
    const classeur = XLSX.read(octets, { type: 'array', cellDates: false })
    const feuille = classeur.Sheets[classeur.SheetNames[0]]
    if (!feuille) throw new Error('Le classeur ne contient aucune feuille.')
    return XLSX.utils.sheet_to_json<Cellule[]>(feuille, { header: 1, raw: true, defval: '' })
  }
  return lireCsv(decoderTexte(octets))
}

// ── Valeurs ──────────────────────────────────────────────────────────────────

const deux = (n: number) => String(n).padStart(2, '0')

/** Date (texte jj/mm/aaaa, aaaa-mm-jj…, date Excel) → « aaaa-mm-jj », ou '' si illisible. */
export function normaliserDate(v: Cellule): string {
  if (v == null || v === '') return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : `${v.getFullYear()}-${deux(v.getMonth() + 1)}-${deux(v.getDate())}`
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { // numéro de jour Excel (1900)
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
      return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
    }
    return ''
  }
  const s = String(v).trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return valide(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s)
  if (m) return valide(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return ''
}
function valide(a: number, mo: number, j: number): string {
  const d = new Date(Date.UTC(a, mo - 1, j))
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j ? `${a}-${deux(mo)}-${deux(j)}` : ''
}

/** Montant (« 1 200 000 », « 1.200.000 », « 1 200,50 », « 15000 FCFA ») → nombre, ou null. */
export function normaliserMontant(v: Cellule): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  let s = String(v).replace(/[\s  ]/g, '').replace(/(FCFA|XOF|CFA|F)$/i, '')
  if (!s) return null
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s)
  s = s.replace(/[^0-9.,]/g, '')
  if (!s) return null
  const v1 = s.lastIndexOf(','), p1 = s.lastIndexOf('.')
  if (v1 >= 0 && p1 >= 0) {
    const dec = v1 > p1 ? ',' : '.'
    s = s.replace(dec === ',' ? /\./g : /,/g, '').replace(dec, '.')
  } else if (v1 >= 0 || p1 >= 0) {
    const sep = v1 >= 0 ? ',' : '.'
    const parties = s.split(sep)
    const milliers = parties.length > 2 || (parties.length === 2 && parties[1].length === 3)
    s = milliers ? parties.join('') : parties.join('.')
  }
  const n = Number(s)
  return isFinite(n) ? (neg ? -n : n) : null
}

const MODES: Array<[RegExp, string]> = [
  [/^(ESP|CASH|LIQUIDE)/, 'Espèces'],
  [/^VIR/, 'Virement'],
  [/(MOBILE|MOMO|ORANGE|WAVE|MTN|MOOV|FLOOZ)/, 'Mobile Money'],
  [/^CHEQ/, 'Chèque'],
  [/^(CARTE|CB|VISA)/, 'Carte'],
]
export function normaliserMode(v: Cellule): string {
  const n = normaliser(v)
  if (!n) return 'Espèces'
  for (const [re, mode] of MODES) if (re.test(n)) return mode
  return String(v).trim()
}

// ── Colonnes ─────────────────────────────────────────────────────────────────

const TITRES: Record<string, string[]> = {
  date: ['date', 'jour', 'datedumouvement', 'dateoperation'],
  type: ['type', 'nature', 'sens', 'typedemouvement'],
  description: ['description', 'libelle', 'designation', 'objet', 'motif', 'intitule'],
  categorie: ['categorie', 'category', 'rubrique', 'poste'],
  mode: ['modedepaiement', 'modepaiement', 'mode', 'paiement', 'moyendepaiement', 'reglement'],
  beneficiaire: ['beneficiairesource', 'beneficiaire', 'source', 'tiers', 'fournisseur', 'beneficiaireousource'],
  entree: ['entree', 'entrees', 'recette', 'recettes', 'credit', 'encaissement', 'entreefcfa'],
  sortie: ['sortie', 'sorties', 'depense', 'depenses', 'debit', 'decaissement', 'sortiefcfa'],
  montant: ['montant', 'somme', 'valeur', 'montantfcfa'],
  commentaire: ['commentaire', 'commentaires', 'observation', 'observations', 'remarque', 'remarques', 'note', 'notes'],
  magasin: ['magasin', 'boutique', 'store', 'site', 'agence', 'nomdumagasin'],
  personne: ['personne', 'utilisateur', 'employe', 'auteur', 'agent', 'saisipar'],
}

function trouverColonnes(entete: Cellule[]): Record<string, number> {
  const out: Record<string, number> = {}
  entete.forEach((t, i) => {
    const k = cle(t)
    if (!k) return
    for (const [nom, variantes] of Object.entries(TITRES)) if (out[nom] === undefined && variantes.includes(k)) { out[nom] = i; return }
  })
  return out
}

/** Tableau du fichier → lignes de mouvements (avec la raison des lignes illisibles). */
export function analyser(tableau: Cellule[][]): ResultatLecture {
  let iEntete = -1
  let cols: Record<string, number> = {}
  for (let i = 0; i < Math.min(tableau.length, 15); i++) {
    const c = trouverColonnes(tableau[i] || [])
    if (c.date !== undefined && (c.entree !== undefined || c.sortie !== undefined || c.montant !== undefined)) { iEntete = i; cols = c; break }
  }
  if (iEntete < 0) {
    throw new Error('Colonnes non reconnues : le fichier doit avoir au moins une colonne « Date » et une colonne « Entrée » / « Sortie » (ou « Montant »), comme l’export « Excel / CSV » de LECLAIRE.')
  }
  const entete = tableau[iEntete]
  const colonnes: Record<string, string> = {}
  for (const [k, i] of Object.entries(cols)) colonnes[k] = String(entete[i] ?? '')
  const val = (l: Cellule[], k: string): Cellule => (cols[k] === undefined ? '' : l[cols[k]])
  const txt = (l: Cellule[], k: string) => { const v = val(l, k); return v == null ? '' : String(v).trim() }

  const lignes: LigneFichier[] = []
  for (let i = iEntete + 1; i < tableau.length; i++) {
    const l = tableau[i] || []
    if (!l.some(c => c != null && String(c).trim() !== '')) continue
    const entree = normaliserMontant(val(l, 'entree'))
    const sortie = normaliserMontant(val(l, 'sortie'))
    const montant = normaliserMontant(val(l, 'montant'))
    const t = normaliser(val(l, 'type'))
    let type: LigneFichier['type'] = null
    if (/^(ENTR|RECET|CREDIT|INCOME|ENCAISS|APPORT)/.test(t)) type = 'income'
    else if (/^(SORT|DEPENS|DEBIT|EXPENSE|DECAISS)/.test(t)) type = 'expense'
    else if (entree && !sortie) type = 'income'
    else if (sortie && !entree) type = 'expense'
    else if (montant != null) type = montant < 0 ? 'expense' : null
    const brut = type === 'income' ? (entree ?? montant) : type === 'expense' ? (sortie ?? montant) : null
    const date = normaliserDate(val(l, 'date'))
    const ligne: LigneFichier = {
      numero: i + 1,
      date,
      type,
      montant: brut == null ? null : Math.abs(brut),
      description: txt(l, 'description'),
      categorie: txt(l, 'categorie'),
      mode: normaliserMode(val(l, 'mode')),
      beneficiaire: txt(l, 'beneficiaire'),
      commentaire: txt(l, 'commentaire'),
      magasinTexte: txt(l, 'magasin'),
      personneTexte: txt(l, 'personne'),
    }
    if (!date) ligne.erreur = `date illisible (« ${txt(l, 'date') || 'vide'} »)`
    else if (!type) ligne.erreur = 'entrée ou sortie impossible à déterminer'
    else if (ligne.montant == null) ligne.erreur = 'montant manquant ou illisible'
    else if (ligne.montant <= 0) ligne.erreur = 'montant nul'
    lignes.push(ligne)
  }
  return { lignes, colonnes, aColonneMagasin: cols.magasin !== undefined, aColonnePersonne: cols.personne !== undefined }
}

// ── Magasins ─────────────────────────────────────────────────────────────────

/** Mots trop généraux pour reconnaître un magasin. */
const MOTS_GENERAUX = new Set(['MAGASIN', 'MAGASINS', 'OPTICLAIRE', 'LECLAIRE', 'OUVERTURE', 'BOUTIQUE', 'MISSION', 'NOUVEAU',
  'NOUVELLE', 'AGENCE', 'SITE', 'CAISSE', 'DES', 'DU', 'DE', 'LA', 'LE', 'LES', 'ET', 'AU', 'AUX', 'EN', 'SUR', 'TRAVAUX', 'OPTIQUE'])

/** Mots distinctifs du nom d'un magasin (« Magasin de Bouaké » → BOUAKE). */
export function motsCles(nom: string): string[] {
  const mots = normaliser(nom).split(' ').filter(m => m.length >= 3 && !MOTS_GENERAUX.has(m) && !/^\d+$/.test(m))
  return mots.length ? mots : normaliser(nom).split(' ').filter(m => m.length >= 3)
}

const contientMot = (texte: string, mot: string) => (` ${texte} `).includes(` ${mot} `)

export interface Detection {
  magasinId: string | null
  /** D'où vient le magasin : colonne « Magasin », texte de la ligne, ou rien. */
  par: 'colonne' | 'texte' | null
  /** Plusieurs magasins cités dans la ligne. */
  ambigu?: boolean
  /** Nom de la colonne « Magasin » qui ne correspond à aucun magasin LECLAIRE. */
  inconnu?: string
}

export function detecterMagasin(l: Pick<LigneFichier, 'magasinTexte' | 'description' | 'commentaire' | 'beneficiaire'>, magasins: Shop[]): Detection {
  if (l.magasinTexte) {
    const n = normaliser(l.magasinTexte)
    const exact = magasins.find(m => normaliser(m.name) === n)
    if (exact) return { magasinId: exact.id, par: 'colonne' }
    const parMots = magasins.filter(m => motsCles(m.name).some(k => contientMot(n, k)))
    if (parMots.length === 1) return { magasinId: parMots[0].id, par: 'colonne' }
    return { magasinId: null, par: null, inconnu: l.magasinTexte, ambigu: parMots.length > 1 }
  }
  const texte = normaliser(`${l.description} ${l.commentaire} ${l.beneficiaire}`)
  const cites = magasins.filter(m => motsCles(m.name).some(k => contientMot(texte, k)))
  if (cites.length === 1) return { magasinId: cites[0].id, par: 'texte' }
  return { magasinId: null, par: null, ambigu: cites.length > 1 }
}

// ── Doublons et identifiants ─────────────────────────────────────────────────

export function empreinte(t: { date: string; type: string | null; montant: number | null; description: string; beneficiaire: string }): string {
  return [t.date, t.type, Math.round((t.montant || 0) * 100), normaliser(t.description), normaliser(t.beneficiaire)].join('|')
}
export const empreinteMouvement = (t: Transaction) =>
  empreinte({ date: t.date, type: t.type, montant: t.amount, description: t.description, beneficiaire: t.beneficiaryOrSource })

function fnv(s: string, graine: number): string {
  let h = graine >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

export interface LignePreparee extends LigneFichier {
  empreinte: string
  /** Rang de cette ligne parmi les lignes identiques du fichier (1, 2…). */
  occurrence: number
  /** Ligne déjà présente dans LECLAIRE. */
  dejaPresent: boolean
  /** Identifiant stable : réimporter le même fichier ne crée pas de doublon. */
  id: string
}

/**
 * Repère les lignes déjà présentes : deux lignes identiques dans le fichier
 * (deux taxis le même jour) restent deux mouvements ; seules celles déjà
 * enregistrées (autant de fois) sont signalées.
 */
export function preparer(lignes: LigneFichier[], existants: Transaction[]): LignePreparee[] {
  const presents = new Map<string, number>()
  for (const t of existants) { const e = empreinteMouvement(t); presents.set(e, (presents.get(e) || 0) + 1) }
  const vus = new Map<string, number>()
  return lignes.map(l => {
    const e = empreinte(l)
    const occurrence = (vus.get(e) || 0) + 1
    vus.set(e, occurrence)
    return { ...l, empreinte: e, occurrence, dejaPresent: !l.erreur && occurrence <= (presents.get(e) || 0), id: `fic-${fnv(e, 2166136261)}${fnv(e, 374761393)}-${occurrence}` }
  })
}

/** Ligne prête → ligne de la table des mouvements LECLAIRE. */
export function versLigneMouvement(l: LignePreparee, magasin: Shop | undefined, personneId: string, maintenant: string): LigneMouvement {
  return {
    id: l.id,
    utilisateur_id: personneId,
    type: l.type as 'income' | 'expense',
    montant: l.montant as number,
    date: l.date,
    description: l.description,
    categorie: l.categorie || 'Autre',
    mode_paiement: l.mode || 'Espèces',
    beneficiaire: l.beneficiaire,
    commentaire: l.commentaire,
    magasin_id: magasin?.id ?? null,
    magasin_nom: magasin?.name ?? null,
    justificatif_nom: null,
    justificatif_type: null,
    justificatif_chemin: null,
    created_at: maintenant,
    updated_at: maintenant,
  }
}
