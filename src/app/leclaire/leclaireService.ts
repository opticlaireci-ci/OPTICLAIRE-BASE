/**
 * LECLAIRE — lecture / écriture des données dans Supabase (projet OPTICLAIRE).
 *
 * Données SÉPARÉES d'OPTICLAIRE : tables `leclaire_caisse_*` et espace privé
 * « leclaire-justificatifs » (supabase/LECLAIRE_CAISSE_2026-11-18.sql). Rien
 * n'est gardé dans le navigateur (pas de clé locale, donc rien n'est envoyé
 * par la synchronisation d'OPTICLAIRE) et chaque mouvement est une ligne :
 * deux personnes qui saisissent en même temps ne s'écrasent pas.
 *
 * Les droits sont vérifiés par la base (règles d'accès) : un utilisateur ne
 * lit et ne saisit que ses mouvements ; l'administration LECLAIRE voit tout.
 */
import { supabase } from '../utils/supabaseClient'
import type { AppSettings, AuditLog, Shop, Transaction, User, UserRole } from './types'
import { DEFAULT_SETTINGS } from './outils'

export const ESPACE_JUSTIFICATIFS = 'leclaire-justificatifs'
export const SCRIPT_INSTALLATION = 'supabase/LECLAIRE_CAISSE_2026-11-18.sql'
/** Taille maximale d'un justificatif (comme l'application LECLAIRE). */
export const TAILLE_MAX_JUSTIFICATIF = 3 * 1024 * 1024

const T_MOUVEMENTS = 'leclaire_caisse_mouvements'
const T_UTILISATEURS = 'leclaire_caisse_utilisateurs'
const T_MAGASINS = 'leclaire_caisse_magasins'
const T_CATEGORIES = 'leclaire_caisse_categories'
const T_REGLAGES = 'leclaire_caisse_reglages'
const T_JOURNAL = 'leclaire_caisse_journal'

const COLONNES_MOUVEMENT = 'id, utilisateur_id, type, montant, date, description, categorie, mode_paiement, beneficiaire, commentaire, magasin_id, magasin_nom, justificatif_nom, justificatif_type, justificatif_chemin, created_at, updated_at'

/** LECLAIRE pas encore installé dans Supabase (script non exécuté). */
export class LeclaireNonInstalle extends Error {
  constructor() {
    super(`LECLAIRE n'est pas encore installé dans Supabase : exécutez le script ${SCRIPT_INSTALLATION} (SQL Editor).`)
    this.name = 'LeclaireNonInstalle'
  }
}

function estAbsent(err: any): boolean {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)
    || /could not find the (function|table)|does not exist|schema cache/i.test(msg)
}

function echec(err: any, action: string): never {
  if (estAbsent(err)) throw new LeclaireNonInstalle()
  throw new Error(`${action} : ${err?.message || err}`)
}

/**
 * Une modification ou suppression refusée par les règles d'accès ne renvoie
 * pas d'erreur : simplement, aucune ligne n'est touchée. On le signale.
 */
function verifierTouche(data: unknown[] | null, action: string): void {
  if (!data || data.length === 0) throw new Error(`${action} : refusé (droits insuffisants) ou élément introuvable. Actualisez la page.`)
}

// ── Correspondance lignes ↔ objets de l'écran ───────────────────────────────

export type LigneMouvement = {
  id: string; utilisateur_id: string; type: 'income' | 'expense'; montant: number | string; date: string
  description: string; categorie: string; mode_paiement: string; beneficiaire: string; commentaire: string
  magasin_id: string | null; magasin_nom: string | null
  justificatif_nom: string | null; justificatif_type: string | null; justificatif_chemin: string | null
  created_at: string; updated_at: string
}

export function versTransaction(r: LigneMouvement): Transaction {
  return {
    id: r.id,
    userId: r.utilisateur_id,
    type: r.type,
    amount: Number(r.montant) || 0,
    date: String(r.date || '').slice(0, 10),
    description: r.description || '',
    category: r.categorie || '',
    paymentMethod: (r.mode_paiement || 'Espèces') as Transaction['paymentMethod'],
    beneficiaryOrSource: r.beneficiaire || '',
    comment: r.commentaire || '',
    storeId: r.magasin_id || undefined,
    storeName: r.magasin_nom || undefined,
    attachmentName: r.justificatif_nom || undefined,
    attachmentType: r.justificatif_type || undefined,
    attachmentPath: r.justificatif_chemin || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function versLigne(t: Transaction): LigneMouvement {
  return {
    id: t.id,
    utilisateur_id: t.userId,
    type: t.type,
    montant: Number(t.amount) || 0,
    date: String(t.date || '').slice(0, 10),
    description: t.description || '',
    categorie: t.category || '',
    mode_paiement: t.paymentMethod || '',
    beneficiaire: t.beneficiaryOrSource || '',
    commentaire: t.comment || '',
    magasin_id: t.storeId || null,
    magasin_nom: t.storeName || null,
    justificatif_nom: t.attachmentPath ? (t.attachmentName || null) : null,
    justificatif_type: t.attachmentPath ? (t.attachmentType || null) : null,
    justificatif_chemin: t.attachmentPath || null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }
}

/** Lit toute une table, par pages (Supabase renvoie 1 000 lignes au plus par requête). */
async function toutLire<R>(table: string, colonnes: string, tri: { col: string; asc: boolean }[]): Promise<R[]> {
  const PAGE = 1000
  const out: R[] = []
  for (let debut = 0; ; debut += PAGE) {
    let q = supabase.from(table).select(colonnes)
    for (const t of tri) q = q.order(t.col, { ascending: t.asc })
    const { data, error } = await q.range(debut, debut + PAGE - 1)
    if (error) echec(error, `Lecture de ${table}`)
    out.push(...((data || []) as R[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

// ── Entrée dans LECLAIRE ─────────────────────────────────────────────────────

export interface EntreeLeclaire {
  role: 'admin' | 'utilisateur' | null
  /** Fiche LECLAIRE de la personne connectée. */
  id?: string
  nom?: string
  email?: string
}

/** Rôle LECLAIRE et fiche de la personne connectée (créée au premier passage). */
export async function entrer(): Promise<EntreeLeclaire> {
  const { data, error } = await supabase.rpc('leclaire_caisse_entree')
  if (error) echec(error, 'Ouverture de LECLAIRE')
  const d = (data || {}) as any
  return { role: d.role ?? null, id: d.id, nom: d.nom, email: d.email }
}

/** Compte OPTICLAIRE vu par l'administration LECLAIRE. */
export interface CompteOpticlaire {
  compte: string
  nom: string
  email: string
  /** Accès LECLAIRE donné par les cases (vide : aucun accès). */
  acces: 'admin' | 'utilisateur' | null
}

export async function listerComptes(): Promise<CompteOpticlaire[]> {
  const { data, error } = await supabase.rpc('leclaire_caisse_comptes')
  if (error) echec(error, 'Liste des comptes')
  return ((data || []) as any[]).map(c => ({ compte: c.compte, nom: c.nom || c.email || '', email: c.email || '', acces: c.acces ?? null }))
}

// ── Chargement ───────────────────────────────────────────────────────────────

export interface DonneesLeclaire {
  transactions: Transaction[]
  users: User[]
  stores: Shop[]
  categories: string[]
  settings: AppSettings
  auditLogs: AuditLog[]
  /** Comptes OPTICLAIRE (administration seulement). */
  comptes: CompteOpticlaire[]
}

function roleAffiche(acces: CompteOpticlaire['acces'] | undefined): UserRole {
  return acces === 'admin' ? 'admin' : 'user'
}

/**
 * Charge tout ce que la personne a le droit de voir. Pour l'administration,
 * crée au passage la fiche des comptes qui ont reçu l'accès mais n'ont pas
 * encore ouvert LECLAIRE (pour pouvoir leur affecter un mouvement).
 */
export async function chargerTout(admin: boolean): Promise<DonneesLeclaire> {
  const [lignes, personnes, magasins, categories, reglages] = await Promise.all([
    toutLire<LigneMouvement>(T_MOUVEMENTS, COLONNES_MOUVEMENT, [{ col: 'date', asc: false }, { col: 'created_at', asc: false }]),
    toutLire<any>(T_UTILISATEURS, 'id, compte, nom, email, ancien_role, created_at', [{ col: 'nom', asc: true }]),
    toutLire<any>(T_MAGASINS, 'id, nom, created_at', [{ col: 'created_at', asc: true }]),
    toutLire<any>(T_CATEGORIES, 'nom', [{ col: 'nom', asc: true }]),
    supabase.from(T_REGLAGES).select('devise, code_devise, decouvert_autorise, justificatif_obligatoire, nom_entreprise').eq('id', 1).maybeSingle(),
  ])
  if (reglages.error) echec(reglages.error, 'Lecture des paramètres')

  let comptes: CompteOpticlaire[] = []
  let auditLogs: AuditLog[] = []
  if (admin) {
    const [c, j] = await Promise.all([
      listerComptes(),
      toutLire<any>(T_JOURNAL, 'id, compte, utilisateur_nom, utilisateur_role, action, mouvement_id, description, created_at', [{ col: 'created_at', asc: false }]),
    ])
    comptes = c
    auditLogs = j.map(l => ({
      id: l.id, userId: l.compte || '', userName: l.utilisateur_nom || '', userRole: (l.utilisateur_role || undefined) as UserRole | undefined,
      action: l.action, transactionId: l.mouvement_id || undefined, description: l.description || '', createdAt: l.created_at,
    }))
    // Fiches manquantes des comptes qui ont l'accès.
    const avecFiche = new Set(personnes.map(p => p.compte).filter(Boolean))
    const manquants = comptes.filter(cp => cp.acces && !avecFiche.has(cp.compte))
    if (manquants.length) {
      const nouvelles = manquants.map(cp => ({ id: cp.compte, compte: cp.compte, nom: cp.nom || cp.email, email: cp.email }))
      const { error } = await supabase.from(T_UTILISATEURS).upsert(nouvelles, { onConflict: 'id', ignoreDuplicates: true })
      if (!error) personnes.push(...nouvelles.map(n => ({ ...n, ancien_role: null, created_at: new Date().toISOString() })))
    }
  }

  const accesParCompte = new Map(comptes.map(c => [c.compte, c.acces]))
  const users: User[] = personnes
    .map(p => ({
      id: p.id,
      name: p.nom || p.email || 'Sans nom',
      email: p.email || '',
      role: roleAffiche(p.compte ? accesParCompte.get(p.compte) : null),
      compte: p.compte || null,
      ancienRole: p.ancien_role || null,
      createdAt: p.created_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  const r = reglages.data as any
  const settings: AppSettings = r ? {
    currency: r.devise || DEFAULT_SETTINGS.currency,
    currencyCode: r.code_devise || DEFAULT_SETTINGS.currencyCode,
    allowOverdraft: !!r.decouvert_autorise,
    requireAttachment: !!r.justificatif_obligatoire,
    companyName: r.nom_entreprise || DEFAULT_SETTINGS.companyName,
  } : DEFAULT_SETTINGS

  return {
    transactions: lignes.map(versTransaction),
    users,
    stores: magasins.map(m => ({ id: m.id, name: m.nom, createdAt: m.created_at })),
    categories: categories.map(c => c.nom),
    settings,
    auditLogs,
    comptes,
  }
}

// ── Justificatifs ────────────────────────────────────────────────────────────

/** Nouveau fichier choisi dans le formulaire. */
export interface NouveauJustificatif { nom: string; type: string; contenu: string }

/** Contenu `data:` → Blob, décodé sur place (la politique du site interdit fetch(data:)). */
export function dataUrlVersBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!m) throw new Error('Justificatif illisible (contenu inattendu).')
  const type = m[1] || 'application/octet-stream'
  if (!m[3]) return new Blob([decodeURIComponent(m[4])], { type })
  const binaire = atob(m[4])
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return new Blob([octets], { type })
}

/** Nom de fichier sûr pour le stockage (sans accents, espaces ni caractères spéciaux). */
export function nomFichierSur(nom: string): string {
  const base = (nom || 'justificatif')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return (base || 'justificatif').slice(-80)
}

export function cheminJustificatif(personneId: string, mouvementId: string, nom: string): string {
  return `${personneId}/${mouvementId}/${Date.now().toString(36)}-${nomFichierSur(nom)}`
}

/** Type de fichier normalisé (« image/jpg » n'est pas un type reconnu par le stockage). */
export function normaliserType(type: string | undefined): string {
  const t = (type || '').toLowerCase().trim()
  return t === 'image/jpg' || t === 'image/pjpeg' ? 'image/jpeg' : t
}

/**
 * Fichier prêt pour le stockage : la bibliothèque Supabase envoie le type
 * propre au fichier (et non le type demandé), il doit donc être le bon.
 */
export function avecType(contenu: Blob, type: string): Blob {
  const t = normaliserType(type || contenu.type) || 'application/octet-stream'
  return contenu.type === t ? contenu : new Blob([contenu], { type: t })
}

/** Dépose un justificatif ; renvoie son chemin. */
export async function deposerJustificatif(chemin: string, contenu: Blob, type: string): Promise<string> {
  const fichier = avecType(contenu, type)
  const { error } = await supabase.storage.from(ESPACE_JUSTIFICATIFS)
    .upload(chemin, fichier, { contentType: fichier.type, upsert: false })
  if (error) {
    if (/bucket not found/i.test(error.message || '')) throw new LeclaireNonInstalle()
    throw new Error(`Envoi du justificatif impossible : ${error.message}`)
  }
  return chemin
}

async function retirerFichier(chemin: string | undefined): Promise<void> {
  if (!chemin) return
  try { await supabase.storage.from(ESPACE_JUSTIFICATIFS).remove([chemin]) } catch { /* fichier déjà absent */ }
}

const cacheFichiers = new Map<string, Promise<Blob>>()

/** Oublie les justificatifs déjà chargés (fermeture de LECLAIRE, changement de compte). */
export function viderCacheJustificatifs(): void {
  cacheFichiers.clear()
}

/** Justificatif d'un mouvement (chargé à la demande, gardé en mémoire le temps de la page). */
export function lireJustificatif(chemin: string): Promise<Blob> {
  let p = cacheFichiers.get(chemin)
  if (!p) {
    p = supabase.storage.from(ESPACE_JUSTIFICATIFS).download(chemin).then(({ data, error }) => {
      if (error || !data) throw new Error(`Justificatif illisible : ${error?.message || 'fichier absent'}`)
      return data
    })
    p.catch(() => cacheFichiers.delete(chemin))
    cacheFichiers.set(chemin, p)
  }
  return p
}

// ── Mouvements ───────────────────────────────────────────────────────────────

/**
 * Enregistre un mouvement (création ou modification). `fichier` : nouveau
 * justificatif à déposer ; `retirer` : supprimer le justificatif actuel.
 * Renvoie le mouvement tel qu'enregistré.
 */
export async function enregistrerMouvement(
  t: Transaction,
  options: { nouveau: boolean; fichier?: NouveauJustificatif | null; retirer?: boolean; ancienChemin?: string },
): Promise<Transaction> {
  let chemin = options.retirer ? undefined : t.attachmentPath
  let depose: string | undefined
  if (options.fichier) {
    depose = await deposerJustificatif(
      cheminJustificatif(t.userId, t.id, options.fichier.nom),
      dataUrlVersBlob(options.fichier.contenu),
      options.fichier.type,
    )
    chemin = depose
  }
  const enregistre: Transaction = {
    ...t,
    attachmentPath: chemin,
    attachmentName: chemin ? (options.fichier?.nom ?? t.attachmentName) : undefined,
    attachmentType: chemin ? (options.fichier ? normaliserType(options.fichier.type) : t.attachmentType) : undefined,
    attachmentData: undefined,
  }
  const ligne = versLigne(enregistre)
  const { data, error } = options.nouveau
    ? await supabase.from(T_MOUVEMENTS).insert({ ...ligne }).select('id')
    : await supabase.from(T_MOUVEMENTS).update({ ...ligne, id: undefined, created_at: undefined }).eq('id', t.id).select('id')
  if (error || !data?.length) {
    if (depose) await retirerFichier(depose)
    if (error) echec(error, 'Enregistrement du mouvement')
    verifierTouche(data, 'Enregistrement du mouvement')
  }
  if (!options.nouveau && options.ancienChemin && options.ancienChemin !== chemin) await retirerFichier(options.ancienChemin)
  return enregistre
}

export async function supprimerMouvement(t: Transaction): Promise<void> {
  const { data, error } = await supabase.from(T_MOUVEMENTS).delete().eq('id', t.id).select('id')
  if (error) echec(error, 'Suppression du mouvement')
  verifierTouche(data, 'Suppression du mouvement')
  await retirerFichier(t.attachmentPath)
}

/** Rattache des mouvements à un magasin LECLAIRE. */
export async function reaffecterMagasin(ids: string[], magasin: Shop): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(T_MOUVEMENTS)
      .update({ magasin_id: magasin.id, magasin_nom: magasin.name, updated_at: new Date().toISOString() })
      .in('id', ids.slice(i, i + 200)).select('id')
    if (error) echec(error, 'Réaffectation des mouvements')
    verifierTouche(data, 'Réaffectation des mouvements')
  }
}

// ── Magasins, catégories, paramètres ─────────────────────────────────────────

export async function ajouterMagasin(m: Shop): Promise<void> {
  const { error } = await supabase.from(T_MAGASINS).insert({ id: m.id, nom: m.name, created_at: m.createdAt })
  if (error) echec(error, 'Création du magasin')
}

export async function renommerMagasin(id: string, nom: string): Promise<void> {
  const { data, error } = await supabase.from(T_MAGASINS).update({ nom }).eq('id', id).select('id')
  if (error) echec(error, 'Renommage du magasin')
  verifierTouche(data, 'Renommage du magasin')
  const { error: e2 } = await supabase.from(T_MOUVEMENTS).update({ magasin_nom: nom }).eq('magasin_id', id)
  if (e2) echec(e2, 'Renommage du magasin dans les mouvements')
}

/** Supprime le magasin ; ses mouvements sont gardés (sans magasin, nom conservé). */
export async function supprimerMagasin(id: string): Promise<void> {
  const { error: e1 } = await supabase.from(T_MOUVEMENTS).update({ magasin_id: null }).eq('magasin_id', id)
  if (e1) echec(e1, 'Détachement des mouvements du magasin')
  const { data, error } = await supabase.from(T_MAGASINS).delete().eq('id', id).select('id')
  if (error) echec(error, 'Suppression du magasin')
  verifierTouche(data, 'Suppression du magasin')
}

export async function ajouterCategorie(nom: string): Promise<void> {
  const { error } = await supabase.from(T_CATEGORIES).upsert({ nom }, { onConflict: 'nom', ignoreDuplicates: true })
  if (error) echec(error, 'Ajout de la catégorie')
}

export async function ajouterCategories(noms: string[]): Promise<void> {
  const uniques = [...new Set(noms.map(n => n.trim()).filter(Boolean))]
  for (let i = 0; i < uniques.length; i += 200) {
    const { error } = await supabase.from(T_CATEGORIES).upsert(uniques.slice(i, i + 200).map(nom => ({ nom })), { onConflict: 'nom', ignoreDuplicates: true })
    if (error) echec(error, 'Ajout des catégories')
  }
}

/**
 * Mouvements importés d'un fichier (administration) : envoyés par lots ; une
 * ligne déjà importée (même identifiant) est ignorée. Renvoie le nombre de
 * mouvements réellement ajoutés.
 */
export async function insererMouvementsImportes(lignes: LigneMouvement[], progression?: (fait: number, total: number) => void): Promise<number> {
  let ajoutes = 0
  for (let i = 0; i < lignes.length; i += 200) {
    const { data, error } = await supabase.from(T_MOUVEMENTS)
      .upsert(lignes.slice(i, i + 200), { onConflict: 'id', ignoreDuplicates: true }).select('id')
    if (error) echec(error, 'Import des mouvements')
    ajoutes += (data || []).length
    progression?.(Math.min(i + 200, lignes.length), lignes.length)
  }
  return ajoutes
}

export async function enregistrerReglages(s: AppSettings): Promise<void> {
  const { data, error } = await supabase.from(T_REGLAGES).upsert({
    id: 1,
    devise: s.currency,
    code_devise: s.currencyCode,
    decouvert_autorise: s.allowOverdraft,
    justificatif_obligatoire: s.requireAttachment,
    nom_entreprise: s.companyName,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('id')
  if (error) echec(error, 'Enregistrement des paramètres')
  verifierTouche(data, 'Enregistrement des paramètres')
}

// ── Personnes ────────────────────────────────────────────────────────────────

/** Rattache une personne à un compte OPTICLAIRE (null : la détacher). Renvoie la fiche retenue. */
export async function rattacherPersonne(personneId: string, compte: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('leclaire_caisse_rattacher', { p_personne: personneId, p_compte: compte })
  if (error) echec(error, 'Rattachement')
  return String(data || personneId)
}

export async function renommerPersonne(personneId: string, nom: string): Promise<void> {
  const { data, error } = await supabase.from(T_UTILISATEURS).update({ nom, updated_at: new Date().toISOString() }).eq('id', personneId).select('id')
  if (error) echec(error, 'Modification du nom')
  verifierTouche(data, 'Modification du nom')
}

// ── Historique ───────────────────────────────────────────────────────────────

/** Inscrit une action dans l'historique (sans bloquer l'écran en cas d'échec). */
export async function journaliser(compte: string | undefined, nom: string, role: UserRole, action: string, description: string, mouvementId?: string): Promise<void> {
  try {
    const { error } = await supabase.from(T_JOURNAL).insert({
      compte: compte || null, utilisateur_nom: nom, utilisateur_role: role, action, description, mouvement_id: mouvementId || null,
    })
    if (error) console.warn('[LECLAIRE] historique non enregistré :', error.message)
  } catch (e) {
    console.warn('[LECLAIRE] historique non enregistré :', e)
  }
}
