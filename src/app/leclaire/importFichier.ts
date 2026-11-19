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
import { catalogueMagasins, coeur, deduireParPeriode, normaliser, reconnaitre, sansAccents, type MagasinConnu } from './reconnaissance'

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

export { sansAccents, normaliser, motsCles } from './reconnaissance'
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

export interface Detection {
  magasinId: string | null
  /** D'où vient le magasin : colonne « Magasin », texte de la ligne, ou rien. */
  par: 'colonne' | 'texte' | null
  /** Plusieurs magasins cités dans la ligne. */
  ambigu?: boolean
  /** Nom de la colonne « Magasin » qui ne correspond à aucun magasin LECLAIRE. */
  inconnu?: string
}

/** Magasin LECLAIRE existant de la ligne (sans créer de magasin). */
export function detecterMagasin(l: Pick<LigneFichier, 'magasinTexte' | 'description' | 'commentaire' | 'beneficiaire'>, magasins: Shop[]): Detection {
  const cat = catalogueMagasins(magasins, [], [])
  if (l.magasinTexte) {
    const exact = magasins.find(m => normaliser(m.name) === normaliser(l.magasinTexte))
    if (exact) return { magasinId: exact.id, par: 'colonne' }
    const r = reconnaitre(l.magasinTexte, cat, false)
    if (r.magasin?.id) return { magasinId: r.magasin.id, par: 'colonne' }
    return { magasinId: null, par: null, inconnu: l.magasinTexte, ambigu: r.ambigu }
  }
  const r = reconnaitre([l.description, l.commentaire, l.beneficiaire], cat, false)
  return r.magasin?.id ? { magasinId: r.magasin.id, par: 'texte' } : { magasinId: null, par: null, ambigu: r.ambigu }
}

/** D'où vient le magasin retenu pour une ligne. */
export type OrigineMagasin = 'choix' | 'colonne' | 'mention' | 'nom' | 'periode' | 'defaut' | null
/** D'où vient la personne retenue pour une ligne. */
export type OriginePersonne = 'colonne' | 'habituelle' | 'choisie'

export interface PlanLigne {
  magasin: MagasinConnu | null
  origine: OrigineMagasin
  /** Ligne (numéro dans le fichier) dont la période a donné le magasin. */
  depuisLigne?: number
  ambigu?: boolean
  personneId: string
  personneOrigine: OriginePersonne
}

/** Magasin d'un mouvement LECLAIRE existant (identifiant, sinon nom enregistré). */
export function magasinDuMouvement(t: Pick<Transaction, 'storeId' | 'storeName'>, magasins: Shop[]): Shop | undefined {
  return (t.storeId ? magasins.find(m => m.id === t.storeId) : undefined)
    || (t.storeName ? magasins.find(m => normaliser(m.name) === normaliser(t.storeName)) : undefined)
}

/** Personne qui a le plus de mouvements dans chaque magasin (à égalité : la plus récente). */
export function personnesHabituelles(existants: Transaction[], magasins: Shop[]): Map<string, string> {
  const compte = new Map<string, Map<string, { n: number; dernier: string }>>()
  for (const t of existants) {
    const m = magasinDuMouvement(t, magasins)
    if (!m) continue
    const parPersonne = compte.get(m.id) || new Map()
    const c = parPersonne.get(t.userId) || { n: 0, dernier: '' }
    c.n++
    if (t.date > c.dernier) c.dernier = t.date
    parPersonne.set(t.userId, c)
    compte.set(m.id, parPersonne)
  }
  const out = new Map<string, string>()
  for (const [magasin, parPersonne] of compte) {
    const meilleur = [...parPersonne.entries()].sort((a, b) => b[1].n - a[1].n || b[1].dernier.localeCompare(a[1].dernier))[0]
    if (meilleur) out.set(magasin, meilleur[0])
  }
  return out
}

/**
 * Magasin et personne de chaque ligne, automatiquement :
 *  magasin : choix fait à la main > colonne « Magasin » > « MAGASIN DE X » >
 *  nom cité dans la ligne > même période (même personne, 45 jours au plus) >
 *  magasin par défaut (facultatif) ;
 *  personne : colonne « Personne » > personne habituelle du magasin (mode
 *  automatique) > personne choisie.
 */
export function planifier(
  lignes: Array<Pick<LigneFichier, 'numero' | 'date' | 'description' | 'commentaire' | 'beneficiaire' | 'magasinTexte' | 'personneTexte'>>,
  o: {
    magasins: Shop[]
    opticlaire?: string[]
    existants?: Transaction[]
    personnes: Array<{ id: string; name: string }>
    personneChoisie: string
    personneAuto: boolean
    magasinDefaut?: string
    choix?: Record<number, string>
  },
): PlanLigne[] {
  const cat = catalogueMagasins(o.magasins, o.opticlaire || [])
  const parId = new Map(cat.filter(m => m.id).map(m => [m.id as string, m]))
  const nouveaux = new Map<string, MagasinConnu>()
  const unique = (m: MagasinConnu) => {
    if (m.id) return m
    const deja = nouveaux.get(m.cle)
    if (deja) return deja
    nouveaux.set(m.cle, m)
    return m
  }
  const personneParNom = new Map(o.personnes.map(p => [normaliser(p.name), p.id]))
  const personneColonne = (l: { personneTexte: string }) => (l.personneTexte ? personneParNom.get(normaliser(l.personneTexte)) : undefined)

  // 1) colonne / texte
  const auto: Array<{ magasin: MagasinConnu | null; origine: OrigineMagasin; ambigu?: boolean }> = lignes.map(l => {
    if (l.magasinTexte) {
      const exact = o.magasins.find(m => normaliser(m.name) === normaliser(l.magasinTexte))
      if (exact) return { magasin: parId.get(exact.id) || null, origine: 'colonne' }
      const r = reconnaitre(l.magasinTexte, cat, true)
      const m = r.magasin || { cle: coeur(l.magasinTexte), nom: l.magasinTexte.trim(), id: null, source: 'texte' as const }
      return { magasin: unique(m), origine: 'colonne' }
    }
    const r = reconnaitre([l.description, l.commentaire, l.beneficiaire], cat, true)
    return r.magasin ? { magasin: unique(r.magasin), origine: r.par } : { magasin: null, origine: null, ambigu: r.ambigu }
  })
  // 2) même période, même personne (colonne « Personne », sinon tout le fichier)
  const refs = deduireParPeriode(lignes.map((l, i) => ({
    date: l.date, groupe: personneColonne(l) || normaliser(l.personneTexte) || '*', cle: auto[i].magasin?.cle || null,
  })))
  const habituelles = o.personneAuto ? personnesHabituelles(o.existants || [], o.magasins) : new Map<string, string>()
  const defaut = o.magasinDefaut ? parId.get(o.magasinDefaut) || null : null

  return lignes.map((l, i) => {
    let magasin = auto[i].magasin
    let origine = auto[i].origine
    let depuisLigne: number | undefined
    const choix = o.choix?.[l.numero]
    if (choix !== undefined) {
      magasin = choix ? (parId.get(choix) || nouveaux.get(choix.replace(/^nouveau:/, '')) || null) : null
      origine = 'choix'
    } else if (!magasin && refs[i] >= 0) {
      magasin = auto[refs[i]].magasin
      origine = 'periode'
      depuisLigne = lignes[refs[i]].numero
    } else if (!magasin && defaut) {
      magasin = defaut
      origine = 'defaut'
    }
    const col = personneColonne(l)
    const habituelle = magasin?.id ? habituelles.get(magasin.id) : undefined
    return {
      magasin, origine, depuisLigne, ambigu: auto[i].ambigu,
      personneId: col || habituelle || o.personneChoisie,
      personneOrigine: col ? 'colonne' : habituelle ? 'habituelle' : 'choisie',
    }
  })
}

/** Valeur de choix d'un magasin dans l'aperçu (magasin existant, ou à créer). */
export const valeurChoix = (m: MagasinConnu | null) => (m ? (m.id || `nouveau:${m.cle}`) : '')

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
  /**
   * Même jour, même type, même description et même bénéficiaire qu'un
   * mouvement déjà dans LECLAIRE, mais AUTRE MONTANT (ligne corrigée entre
   * deux exports) : montant enregistré dans LECLAIRE.
   */
  semblable?: number
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
  const prets: LignePreparee[] = lignes.map(l => {
    const e = empreinte(l)
    const occurrence = (vus.get(e) || 0) + 1
    vus.set(e, occurrence)
    return { ...l, empreinte: e, occurrence, dejaPresent: !l.erreur && occurrence <= (presents.get(e) || 0), id: `fic-${fnv(e, 2166136261)}${fnv(e, 374761393)}-${occurrence}` }
  })
  // Lignes corrigées : mouvement existant du même jour / description /
  // bénéficiaire, non retrouvé tel quel dans le fichier, avec un autre montant.
  const proche = (date: string, type: string | null, description: string, beneficiaire: string) =>
    [date, type, normaliser(description), normaliser(beneficiaire)].join('|')
  const restants = new Map<string, number[]>()
  for (const t of existants) {
    const k = proche(t.date, t.type, t.description, t.beneficiaryOrSource)
    restants.set(k, [...(restants.get(k) || []), Math.round(t.amount * 100)])
  }
  for (const l of prets) {
    if (!l.dejaPresent) continue
    const r = restants.get(proche(l.date, l.type, l.description, l.beneficiaire))
    const i = r ? r.indexOf(Math.round((l.montant || 0) * 100)) : -1
    if (r && i >= 0) r.splice(i, 1)
  }
  for (const l of prets) {
    if (l.dejaPresent || l.erreur) continue
    const r = restants.get(proche(l.date, l.type, l.description, l.beneficiaire))
    if (r && r.length) l.semblable = (r.shift() as number) / 100
  }
  return prets
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
