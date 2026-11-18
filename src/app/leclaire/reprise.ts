/**
 * LECLAIRE — reprise des données de l'ancienne application LECLAIRE (projet
 * Supabase séparé, table clé-valeur `kv_store_7bfd382c`) dans les tables
 * LECLAIRE du projet OPTICLAIRE.
 *
 *  - Lecture seule de l'ancienne base : rien n'y est modifié ni supprimé.
 *  - Chaque ancienne personne est rattachée au compte OPTICLAIRE de même
 *    e-mail (ou à celui choisi) ; sans compte, elle est reprise « non
 *    rattachée » et garde ses mouvements.
 *  - Rejouable sans doublon : les identifiants d'origine sont conservés ; un
 *    mouvement déjà repris n'est pas réécrit (seul un justificatif manquant
 *    est retenté).
 *  - Les justificatifs (photos / PDF enregistrés dans l'ancienne base) sont
 *    déposés dans l'espace privé « leclaire-justificatifs ».
 */
import { supabase } from '../utils/supabaseClient'
import type { AppSettings, AuditLog, Shop, Transaction } from './types'
import type { CompteOpticlaire } from './leclaireService'
import { avecType, dataUrlVersBlob, enregistrerReglages, ESPACE_JUSTIFICATIFS, nomFichierSur, normaliserType, type LigneMouvement } from './leclaireService'

/** Ancienne base LECLAIRE (projet Supabase de l'application LECLAIRE). */
export const ANCIENNE_BASE_URL = 'https://gtayokshgmsjnhtadyxr.supabase.co'
/** Clé publique (anon) de l'ancienne application, déjà présente dans son site. */
export const ANCIENNE_BASE_CLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0YXlva3NoZ21zam5odGFkeXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMzUyODEsImV4cCI6MjEwMjkxMTI4MX0.ZjpKGHpGk5ZWnjcaWjLGrQBsxXX3zgg0Rdke9mDaZ-s'
export const ANCIENNE_TABLE = 'kv_store_7bfd382c'

export const CLES = {
  transactions: 'leclaire_transactions',
  users: 'leclaire_users',
  stores: 'leclaire_stores',
  categories: 'leclaire_categories',
  settings: 'leclaire_settings',
  auditLogs: 'leclaire_audit_logs',
} as const

export interface AncienUser { id: string; name: string; email: string; role: string; createdAt?: string }

export interface AncienneBase {
  users: AncienUser[]
  stores: Shop[]
  categories: string[]
  settings: AppSettings | null
  auditLogs: AuditLog[]
  transactions: Transaction[]
}

// ── Lecture ──────────────────────────────────────────────────────────────────

function deballer(v: unknown): unknown {
  if (v && typeof v === 'object' && '__lv' in (v as any) && 'data' in (v as any)) return (v as any).data
  if (typeof v === 'string') {
    try { return deballer(JSON.parse(v)) } catch { return v }
  }
  return v
}

const tableau = (v: unknown): any[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [])
const texte = (v: unknown) => (v == null ? '' : String(v))

/** Valeurs brutes (clé → valeur, enveloppe {__lv, data} ou non) → ancienne base lisible. */
export function extraire(brut: Record<string, unknown>): AncienneBase {
  const val = (k: string) => deballer(brut[k])
  const s = val(CLES.settings) as any
  return {
    users: tableau(val(CLES.users)).map(u => ({
      id: texte(u.id), name: texte(u.name) || texte(u.email) || 'Sans nom', email: texte(u.email).trim(),
      role: texte(u.role) || 'user', createdAt: u.createdAt ? texte(u.createdAt) : undefined,
    })).filter(u => u.id),
    stores: tableau(val(CLES.stores)).map(m => ({ id: texte(m.id), name: texte(m.name) || 'Magasin', createdAt: texte(m.createdAt) || new Date().toISOString() })).filter(m => m.id),
    categories: (Array.isArray(val(CLES.categories)) ? (val(CLES.categories) as unknown[]) : []).map(texte).map(c => c.trim()).filter(Boolean),
    settings: s && typeof s === 'object' ? {
      currency: texte(s.currency) || 'FCFA',
      currencyCode: texte(s.currencyCode) || 'XOF',
      allowOverdraft: !!s.allowOverdraft,
      requireAttachment: !!s.requireAttachment,
      companyName: texte(s.companyName) || 'LECLAIRE',
    } : null,
    auditLogs: tableau(val(CLES.auditLogs)) as AuditLog[],
    transactions: tableau(val(CLES.transactions)) as Transaction[],
  }
}

/** Lit l'ancienne base directement (lecture seule, clé publique de l'ancienne application). */
export async function lireAncienneBase(url: string, cle: string): Promise<AncienneBase> {
  const base = url.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)) throw new Error("Adresse de l'ancienne base invalide (attendu : https://xxxx.supabase.co).")
  const filtre = `in.(${Object.values(CLES).join(',')})`
  let reponse: Response
  try {
    reponse = await fetch(`${base}/rest/v1/${ANCIENNE_TABLE}?select=key,value&key=${encodeURIComponent(filtre)}`, {
      headers: { apikey: cle.trim(), Authorization: `Bearer ${cle.trim()}`, Accept: 'application/json' },
    })
  } catch (e) {
    throw new Error(`Ancienne base injoignable (${e instanceof Error ? e.message : e}). Vérifiez la connexion, et que le projet Supabase de l'ancienne application n'est pas en pause.`)
  }
  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => '')
    throw new Error(`Lecture de l'ancienne base refusée (${reponse.status}) : ${corps.slice(0, 200)}`)
  }
  const lignes = await reponse.json() as Array<{ key: string; value: unknown }>
  const brut: Record<string, unknown> = {}
  for (const l of lignes || []) brut[l.key] = l.value
  return extraire(brut)
}

/**
 * Fichier de secours (si l'ancienne base n'est pas joignable) : résultat de
 * « select json_agg(t) from kv_store_7bfd382c t » dans le SQL Editor de
 * l'ancien projet, ou objet { clé: valeur }.
 */
export function lireFichierSauvegarde(contenu: string): AncienneBase {
  let d: any
  try { d = JSON.parse(contenu) } catch { throw new Error('Fichier illisible : ce n’est pas un fichier JSON.') }
  if (Array.isArray(d) && d.length === 1 && d[0] && typeof d[0] === 'object' && 'json_agg' in d[0]) d = d[0].json_agg
  const brut: Record<string, unknown> = {}
  if (Array.isArray(d)) for (const l of d) { if (l && typeof l === 'object' && 'key' in l) brut[String(l.key)] = l.value }
  else if (d && typeof d === 'object') Object.assign(brut, d)
  const base = extraire(brut)
  if (!base.transactions.length && !base.users.length && !base.stores.length) throw new Error('Aucune donnée LECLAIRE dans ce fichier.')
  return base
}

// ── Correspondance des personnes ─────────────────────────────────────────────

const simplifier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export interface Proposition { compte: string; par: 'email' | 'nom' | null }

/** Compte OPTICLAIRE proposé pour chaque ancienne personne : même e-mail, sinon même nom. */
export function proposerCorrespondances(anciens: AncienUser[], comptes: CompteOpticlaire[]): Record<string, Proposition> {
  const parEmail = new Map(comptes.filter(c => c.email).map(c => [c.email.trim().toLowerCase(), c.compte]))
  const parNom = new Map<string, string | null>()
  for (const c of comptes) {
    const n = simplifier(c.nom)
    if (n) parNom.set(n, parNom.has(n) ? null : c.compte) // nom en double : pas de proposition
  }
  const out: Record<string, Proposition> = {}
  for (const u of anciens) {
    const e = parEmail.get(u.email.toLowerCase())
    if (e) { out[u.id] = { compte: e, par: 'email' }; continue }
    const n = parNom.get(simplifier(u.name))
    out[u.id] = n ? { compte: n, par: 'nom' } : { compte: '', par: null }
  }
  return out
}

// ── Écriture (dans le projet OPTICLAIRE) ─────────────────────────────────────

export interface CibleReprise {
  lirePersonnes(): Promise<Array<{ id: string; compte: string | null }>>
  insererPersonnes(lignes: Array<{ id: string; compte: string | null; nom: string; email: string; ancien_role: string; created_at: string }>): Promise<void>
  rattacher(personne: string, compte: string): Promise<string>
  lireMouvementsExistants(): Promise<Map<string, string | null>>
  insererMagasins(lignes: Array<{ id: string; nom: string; created_at: string }>): Promise<number>
  insererCategories(noms: string[]): Promise<number>
  enregistrerReglages(s: AppSettings): Promise<void>
  insererMouvements(lignes: LigneMouvement[]): Promise<void>
  majJustificatif(id: string, chemin: string, nom: string, type: string): Promise<void>
  deposer(chemin: string, contenu: Blob, type: string): Promise<void>
  insererJournal(lignes: Array<Record<string, unknown>>): Promise<number>
}

export interface Rapport {
  personnes: { reprises: number; rattachees: number; sansCompte: number }
  magasins: number
  categories: number
  reglages: boolean
  mouvements: { repris: number; dejaPresents: number; ignores: number }
  justificatifs: { repris: number; echecs: number }
  historique: number
  erreurs: string[]
}

export type Progression = (etape: string, fait: number, total: number) => void

const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']

function typeFichier(t: Transaction): string {
  const m = /^data:([^;,]+)/.exec(t.attachmentData || '')
  let type = normaliserType(m?.[1] || t.attachmentType || '')
  if (!type && /\.pdf$/i.test(t.attachmentName || '')) type = 'application/pdf'
  return type
}

function jour(v: unknown, repli: string): string {
  const s = texte(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (s && !isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return repli
}

function horodatage(v: unknown, repli: string): string {
  const d = new Date(texte(v))
  return texte(v) && !isNaN(d.getTime()) ? d.toISOString() : repli
}

/**
 * Reprend l'ancienne base. `correspondances` : ancienne personne → compte
 * OPTICLAIRE ('' : non rattachée).
 */
export async function executerReprise(
  base: AncienneBase,
  correspondances: Record<string, string>,
  options: { reglages: boolean },
  cible: CibleReprise = cibleSupabase,
  progression: Progression = () => {},
): Promise<Rapport> {
  const rapport: Rapport = {
    personnes: { reprises: 0, rattachees: 0, sansCompte: 0 }, magasins: 0, categories: 0, reglages: false,
    mouvements: { repris: 0, dejaPresents: 0, ignores: 0 }, justificatifs: { repris: 0, echecs: 0 }, historique: 0, erreurs: [],
  }
  const maintenant = new Date().toISOString()

  // 1) Personnes (y compris les auteurs de mouvements absents de la liste).
  progression('Personnes', 0, 1)
  const anciens = [...base.users]
  const premierAdmin = anciens.find(u => u.role === 'superadmin' || u.role === 'admin')?.id ?? anciens[0]?.id
  const AUTEUR_INCONNU = 'ancien-sans-auteur'
  const auteurDe = (t: Transaction) => texte(t.userId) || premierAdmin || AUTEUR_INCONNU
  const connus = new Set(anciens.map(u => u.id))
  for (const t of base.transactions) {
    const a = auteurDe(t)
    if (!connus.has(a)) {
      connus.add(a)
      anciens.push({ id: a, name: a === AUTEUR_INCONNU ? 'Auteur inconnu (ancienne application)' : `Ancien utilisateur ${a.slice(0, 8)}`, email: '', role: 'user' })
    }
  }
  const existantes = await cible.lirePersonnes()
  const parId = new Map(existantes.map(p => [p.id, p]))
  const parCompte = new Map(existantes.filter(p => p.compte).map(p => [p.compte as string, p.id]))
  const cibleDe = new Map<string, string>()
  const nouvelles: Parameters<CibleReprise['insererPersonnes']>[0] = []
  const aRattacher: Array<[string, string]> = []
  for (const u of anciens) {
    const compte = correspondances[u.id] || ''
    const deja = parId.get(u.id)
    if (deja) {
      // Déjà reprise : on respecte ce qui a été fait depuis (rattachement manuel).
      cibleDe.set(u.id, u.id)
      if (!deja.compte && compte && !parCompte.has(compte)) { aRattacher.push([u.id, compte]); parCompte.set(compte, u.id) }
      else if (!deja.compte && compte && parCompte.has(compte)) aRattacher.push([u.id, compte])
      continue
    }
    if (compte && parCompte.has(compte)) { cibleDe.set(u.id, parCompte.get(compte)!); rapport.personnes.rattachees++; continue }
    nouvelles.push({ id: u.id, compte: compte || null, nom: u.name, email: u.email, ancien_role: u.role, created_at: horodatage(u.createdAt, maintenant) })
    if (compte) { parCompte.set(compte, u.id); rapport.personnes.rattachees++ } else rapport.personnes.sansCompte++
    cibleDe.set(u.id, u.id)
    rapport.personnes.reprises++
  }
  if (nouvelles.length) await cible.insererPersonnes(nouvelles)
  for (const [p, c] of aRattacher) {
    try {
      const fiche = await cible.rattacher(p, c)
      for (const [ancien, f] of cibleDe) if (f === p) cibleDe.set(ancien, fiche)
      rapport.personnes.rattachees++
    } catch (e) { rapport.erreurs.push(`Rattachement de ${p} : ${e instanceof Error ? e.message : e}`) }
  }
  progression('Personnes', 1, 1)

  // 2) Magasins, catégories, paramètres (seulement ce qui manque).
  progression('Magasins et catégories', 0, 1)
  rapport.magasins = await cible.insererMagasins(base.stores.map(m => ({ id: m.id, nom: m.name, created_at: horodatage(m.createdAt, maintenant) })))
  const cats = new Set(base.categories)
  for (const t of base.transactions) if (texte(t.category).trim()) cats.add(texte(t.category).trim())
  rapport.categories = await cible.insererCategories([...cats])
  if (options.reglages && base.settings) { await cible.enregistrerReglages(base.settings); rapport.reglages = true }
  progression('Magasins et catégories', 1, 1)

  // 3) Mouvements et justificatifs.
  const presents = await cible.lireMouvementsExistants()
  const aInserer: LigneMouvement[] = []
  const total = base.transactions.length
  let fait = 0
  progression('Mouvements', 0, total)
  const vider = async () => {
    if (!aInserer.length) return
    const lot = aInserer.splice(0, aInserer.length)
    await cible.insererMouvements(lot)
    rapport.mouvements.repris += lot.length
  }
  for (const t of base.transactions) {
    fait++
    const id = texte(t.id)
    const type = t.type === 'income' || t.type === 'expense' ? t.type : null
    const montant = Number(String(t.amount ?? '').replace(/\s/g, '').replace(',', '.'))
    if (!id || !type || !isFinite(montant) || montant < 0) {
      rapport.mouvements.ignores++
      rapport.erreurs.push(`Mouvement ${id || '(sans identifiant)'} ignoré : ${!type ? 'type inconnu' : 'montant illisible'}.`)
      continue
    }
    const personne = cibleDe.get(auteurDe(t)) || auteurDe(t)
    const aFichier = typeof t.attachmentData === 'string' && t.attachmentData.startsWith('data:')
    const deja = presents.has(id)
    if (deja && (presents.get(id) || !aFichier)) { rapport.mouvements.dejaPresents++; if (fait % 25 === 0) progression('Mouvements', fait, total); continue }

    let chemin: string | null = null
    const nomFichier = texte(t.attachmentName) || 'justificatif'
    const leType = aFichier ? typeFichier(t) : ''
    if (aFichier) {
      try {
        if (!TYPES_ACCEPTES.includes(leType)) throw new Error(`format non accepté (${leType || 'inconnu'})`)
        const blob = dataUrlVersBlob(t.attachmentData as string)
        const c = `${personne}/${id}/ancien-${nomFichierSur(nomFichier)}`
        await cible.deposer(c, blob, leType)
        chemin = c
        rapport.justificatifs.repris++
      } catch (e) {
        rapport.justificatifs.echecs++
        rapport.erreurs.push(`Justificatif « ${nomFichier} » du mouvement « ${texte(t.description) || id} » non repris : ${e instanceof Error ? e.message : e}`)
      }
    }
    if (deja) {
      if (chemin) await cible.majJustificatif(id, chemin, nomFichier, leType)
      rapport.mouvements.dejaPresents++
    } else {
      const cree = horodatage(t.createdAt, maintenant)
      aInserer.push({
        id,
        utilisateur_id: personne,
        type,
        montant,
        date: jour(t.date, cree.slice(0, 10)),
        description: texte(t.description),
        categorie: texte(t.category).trim(),
        mode_paiement: texte(t.paymentMethod),
        beneficiaire: texte(t.beneficiaryOrSource),
        commentaire: texte(t.comment),
        magasin_id: t.storeId ? texte(t.storeId) : null,
        magasin_nom: t.storeName ? texte(t.storeName) : null,
        justificatif_nom: chemin ? nomFichier : null,
        justificatif_type: chemin ? leType : null,
        justificatif_chemin: chemin,
        created_at: cree,
        updated_at: horodatage(t.updatedAt, cree),
      })
      if (aInserer.length >= 200 || chemin) await vider()
    }
    if (fait % 10 === 0 || chemin) progression('Mouvements', fait, total)
  }
  await vider()
  progression('Mouvements', total, total)

  // 4) Historique (identifiants « ancien:… » : jamais en double).
  progression('Historique', 0, 1)
  const ancienVersCompte = new Map(Object.entries(correspondances).filter(([, c]) => c))
  rapport.historique = await cible.insererJournal(base.auditLogs.filter(l => l && l.id && l.action).map(l => ({
    id: `ancien:${l.id}`,
    compte: ancienVersCompte.get(texte(l.userId)) || null,
    utilisateur_nom: texte(l.userName),
    utilisateur_role: l.userRole || null,
    action: texte(l.action),
    mouvement_id: l.transactionId ? texte(l.transactionId) : null,
    description: texte(l.description),
    created_at: horodatage(l.createdAt, maintenant),
  })))
  progression('Historique', 1, 1)
  return rapport
}

// ── Écriture réelle (Supabase, projet OPTICLAIRE) ────────────────────────────

async function parLots<T>(lignes: T[], taille: number, f: (lot: T[]) => Promise<void>) {
  for (let i = 0; i < lignes.length; i += taille) await f(lignes.slice(i, i + taille))
}

function verifier(error: any, action: string) {
  if (error) throw new Error(`${action} : ${error.message || error}`)
}

export const cibleSupabase: CibleReprise = {
  async lirePersonnes() {
    const { data, error } = await supabase.from('leclaire_caisse_utilisateurs').select('id, compte').range(0, 9999)
    verifier(error, 'Lecture des personnes')
    return (data || []) as Array<{ id: string; compte: string | null }>
  },
  async insererPersonnes(lignes) {
    await parLots(lignes, 200, async lot => {
      const { error } = await supabase.from('leclaire_caisse_utilisateurs').upsert(lot, { onConflict: 'id', ignoreDuplicates: true })
      verifier(error, 'Reprise des personnes')
    })
  },
  async rattacher(personne, compte) {
    const { data, error } = await supabase.rpc('leclaire_caisse_rattacher', { p_personne: personne, p_compte: compte })
    verifier(error, 'Rattachement')
    return String(data || personne)
  },
  async lireMouvementsExistants() {
    const out = new Map<string, string | null>()
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabase.from('leclaire_caisse_mouvements').select('id, justificatif_chemin').order('id').range(debut, debut + 999)
      verifier(error, 'Lecture des mouvements déjà repris')
      for (const r of (data || []) as any[]) out.set(r.id, r.justificatif_chemin)
      if (!data || data.length < 1000) break
    }
    return out
  },
  async insererMagasins(lignes) {
    if (!lignes.length) return 0
    const { data, error } = await supabase.from('leclaire_caisse_magasins').upsert(lignes, { onConflict: 'id', ignoreDuplicates: true }).select('id')
    verifier(error, 'Reprise des magasins')
    return (data || []).length
  },
  async insererCategories(noms) {
    if (!noms.length) return 0
    const { data, error } = await supabase.from('leclaire_caisse_categories').upsert(noms.map(nom => ({ nom })), { onConflict: 'nom', ignoreDuplicates: true }).select('nom')
    verifier(error, 'Reprise des catégories')
    return (data || []).length
  },
  async enregistrerReglages(s) {
    await enregistrerReglages(s)
  },
  async insererMouvements(lignes) {
    await parLots(lignes, 200, async lot => {
      const { error } = await supabase.from('leclaire_caisse_mouvements').upsert(lot, { onConflict: 'id', ignoreDuplicates: true })
      verifier(error, 'Reprise des mouvements')
    })
  },
  async majJustificatif(id, chemin, nom, type) {
    const { error } = await supabase.from('leclaire_caisse_mouvements')
      .update({ justificatif_chemin: chemin, justificatif_nom: nom, justificatif_type: type }).eq('id', id).is('justificatif_chemin', null)
    verifier(error, 'Ajout du justificatif repris')
  },
  async deposer(chemin, contenu, type) {
    const fichier = avecType(contenu, type)
    const { error } = await supabase.storage.from(ESPACE_JUSTIFICATIFS).upload(chemin, fichier, { contentType: fichier.type, upsert: true })
    verifier(error, 'Dépôt')
  },
  async insererJournal(lignes) {
    let n = 0
    await parLots(lignes, 500, async lot => {
      const { data, error } = await supabase.from('leclaire_caisse_journal').upsert(lot, { onConflict: 'id', ignoreDuplicates: true }).select('id')
      verifier(error, "Reprise de l'historique")
      n += (data || []).length
    })
    return n
  },
}
