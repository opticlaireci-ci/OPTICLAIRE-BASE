/**
 * LECLAIRE dans OPTICLAIRE : caisse des ouvertures de magasins (de la caution
 * aux travaux) et des missions des employés. Mêmes écrans que l'application
 * LECLAIRE, mais :
 *  - connexion = compte OPTICLAIRE (plus d'écran de connexion propre, plus de
 *    mots de passe enregistrés en clair) ;
 *  - accès par les cases « Accès LECLAIRE » / « Administrateur LECLAIRE » de
 *    Gestion des utilisateurs (administrateurs d'OPTICLAIRE : d'office) ;
 *  - données dans les tables LECLAIRE de Supabase, à part d'OPTICLAIRE ;
 *  - plus de bouton « Réinitialiser l'application ».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, AuditLog, ModalState, Shop, ToastMsg, Transaction, User, View } from './types'
import { isPrivilegedRole } from './types'
import { calcBalance, genId, DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './outils'
import * as svc from './leclaireService'
import type { CompteOpticlaire, EntreeLeclaire } from './leclaireService'

import Toast from './components/Toast'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import TransactionModal from './components/TransactionModal'
import TransactionDetail from './components/TransactionDetail'
import Movements from './components/Movements'
import Statistics from './components/Statistics'
import Categories from './components/Categories'
import Justificatifs from './components/Justificatifs'
import HistoryLog from './components/HistoryLog'
import Users from './components/Users'
import Stores from './components/Stores'
import Settings from './components/Settings'
import Reprise from './components/Reprise'
import ImportFichier from './components/ImportFichier'
import { getMagasins } from '../constants/magasins'
import { nomMagasin } from '../config/tenant'
import { magasinCite, magasinHabituel } from './classement'
import Logo from './components/Logo'
import './leclaire.css'

/** Rafraîchissement automatique (données saisies sur un autre poste). */
const RAFRAICHISSEMENT_MS = 2 * 60 * 1000

interface Props {
  /** Compte OPTICLAIRE connecté (identifiant Supabase). */
  compte: { id: string; nom: string; email?: string }
  onRetour: () => void
  onLogout: () => void
}

function Ecran({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 text-center" style={{ minHeight: '100dvh', background: 'linear-gradient(145deg, #071428, #0D1F3C)' }}>
      <div className="mb-5"><Logo size={56} variant="dark" /></div>
      <div className="w-full max-w-[440px] rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>{titre}</h2>
        {children}
      </div>
    </div>
  )
}

export default function LeclaireApp({ compte, onRetour, onLogout }: Props) {
  const [entree, setEntree] = useState<EntreeLeclaire | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<{ message: string; installation: boolean } | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [comptes, setComptes] = useState<CompteOpticlaire[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [stores, setStores] = useState<Shop[]>([])
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'income' })
  const [detail, setDetail] = useState<Transaction | null>(null)
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null)
  const [essai, setEssai] = useState(0)

  const admin = entree?.role === 'admin'
  // Noms des magasins d'OPTICLAIRE : LECLAIRE finance leur ouverture, il les reconnaît dans les textes.
  const magasinsOpticlaire = useMemo(() => {
    try { return getMagasins().map((m) => m.label).filter(Boolean) } catch { return [] as string[] }
  }, [])

  const addToast = useCallback((message: string, type: ToastMsg['type'] = 'success') => {
    setToasts((prev) => [...prev, { id: genId(), message, type }])
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  const appliquer = useCallback((d: svc.DonneesLeclaire) => {
    setTransactions(d.transactions)
    setUsers(d.users)
    setStores(d.stores)
    setCategories(d.categories.length ? d.categories : DEFAULT_CATEGORIES)
    setSettings(d.settings)
    setAuditLogs(d.auditLogs)
    setComptes(d.comptes)
  }, [])

  // Justificatifs gardés en mémoire : jamais d'un compte à l'autre.
  useEffect(() => {
    svc.viderCacheJustificatifs()
    return () => svc.viderCacheJustificatifs()
  }, [compte.id])

  // ── Ouverture : droits puis données ────────────────────────────────────────
  useEffect(() => {
    let annule = false
    ;(async () => {
      setChargement(true)
      setErreur(null)
      try {
        const e = await svc.entrer()
        if (annule) return
        setEntree(e)
        if (!e.role) return
        const d = await svc.chargerTout(e.role === 'admin')
        if (!annule) appliquer(d)
      } catch (err) {
        if (!annule) setErreur({ message: err instanceof Error ? err.message : String(err), installation: err instanceof svc.LeclaireNonInstalle })
      } finally {
        if (!annule) setChargement(false)
      }
    })()
    return () => { annule = true }
  }, [essai, compte.id, appliquer])

  // ── Rafraîchissement (autre poste, autre personne) ─────────────────────────
  const enCours = useRef(false)
  const recharger = useCallback(async (signalerErreur = false) => {
    if (!entree?.role || enCours.current) return
    enCours.current = true
    try {
      appliquer(await svc.chargerTout(entree.role === 'admin'))
    } catch (err) {
      if (signalerErreur) addToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      enCours.current = false
    }
  }, [entree, appliquer, addToast])

  useEffect(() => {
    if (!entree?.role) return
    const tick = () => { if (document.visibilityState === 'visible') recharger() }
    const id = window.setInterval(tick, RAFRAICHISSEMENT_MS)
    const auRetour = () => { if (document.visibilityState === 'visible') recharger() }
    document.addEventListener('visibilitychange', auRetour)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', auRetour) }
  }, [entree, recharger])

  // ── Personne connectée ─────────────────────────────────────────────────────
  const currentUser: User | null = useMemo(() => {
    if (!entree?.role || !entree.id) return null
    return {
      id: entree.id,
      name: entree.nom || compte.nom || entree.email || 'Utilisateur',
      email: entree.email || compte.email || '',
      role: entree.role === 'admin' ? 'admin' : 'user',
      compte: compte.id,
      createdAt: new Date().toISOString(),
    }
  }, [entree, compte])

  // ── Mouvements visibles (rôle + « voir les données de ») ───────────────────
  const visibleTransactions = useMemo(() => {
    if (!currentUser) return []
    if (viewAsUserId) return transactions.filter((t) => t.userId === viewAsUserId)
    if (!isPrivilegedRole(currentUser.role)) return transactions.filter((t) => t.userId === currentUser.id)
    return transactions
  }, [transactions, currentUser, viewAsUserId])

  const viewAsUser = useMemo(() => (viewAsUserId ? users.find((u) => u.id === viewAsUserId) ?? null : null), [viewAsUserId, users])

  const handleViewAsUser = useCallback((userId: string) => { setViewAsUserId(userId); setView('dashboard') }, [])
  const handleClearViewAs = useCallback(() => { setViewAsUserId(null); setView('users') }, [])

  // ── Historique ─────────────────────────────────────────────────────────────
  const addAuditLog = useCallback((action: string, description: string, transactionId?: string) => {
    if (!currentUser) return
    const log: AuditLog = {
      id: genId(), userId: compte.id, userName: currentUser.name, userRole: currentUser.role,
      action, transactionId, description, createdAt: new Date().toISOString(),
    }
    if (isPrivilegedRole(currentUser.role)) setAuditLogs((prev) => [log, ...prev])
    svc.journaliser(compte.id, currentUser.name, currentUser.role, action, description, transactionId)
  }, [currentUser, compte.id])

  const signaler = useCallback((err: unknown) => {
    addToast(err instanceof Error ? err.message : String(err), 'error')
  }, [addToast])

  // ── Catégories ─────────────────────────────────────────────────────────────
  const handleNewCategory = useCallback((cat: string) => {
    const c = cat.trim()
    if (!c) return
    setCategories((prev) => (prev.includes(c) ? prev : [...prev, c].sort((a, b) => a.localeCompare(b, 'fr'))))
    if (!categories.includes(c)) svc.ajouterCategorie(c).catch(signaler)
  }, [categories, signaler])

  // ── Magasins LECLAIRE ──────────────────────────────────────────────────────
  const handleAddStore = useCallback(async (name: string) => {
    const shop: Shop = { id: genId(), name, createdAt: new Date().toISOString() }
    try {
      await svc.ajouterMagasin(shop)
      setStores((prev) => [...prev, shop])
      addAuditLog('CREATE_STORE', `Magasin créé : "${name}"`)
    } catch (err) { signaler(err) }
  }, [addAuditLog, signaler])

  // Création d'un magasin depuis l'import de fichier : renvoie le magasin créé.
  const handleAddStoreRetour = useCallback(async (name: string): Promise<Shop | null> => {
    const existant = stores.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (existant) return existant
    const shop: Shop = { id: genId(), name: name.trim(), createdAt: new Date().toISOString() }
    try {
      await svc.ajouterMagasin(shop)
      setStores((prev) => [...prev, shop])
      addAuditLog('CREATE_STORE', `Magasin créé : "${shop.name}"`)
      addToast(`Magasin « ${shop.name} » créé.`, 'success')
      return shop
    } catch (err) { signaler(err); return null }
  }, [stores, addAuditLog, addToast, signaler])

  const handleRenameStore = useCallback(async (id: string, name: string) => {
    const prev = stores.find((s) => s.id === id)
    try {
      await svc.renommerMagasin(id, name)
      setStores((list) => list.map((s) => (s.id === id ? { ...s, name } : s)))
      setTransactions((list) => list.map((t) => (t.storeId === id ? { ...t, storeName: name } : t)))
      addAuditLog('RENAME_STORE', `Magasin renommé : "${prev?.name ?? '—'}" → "${name}"`)
    } catch (err) { signaler(err) }
  }, [stores, addAuditLog, signaler])

  const handleDeleteStore = useCallback(async (id: string) => {
    const shop = stores.find((s) => s.id === id)
    try {
      await svc.supprimerMagasin(id)
      setStores((list) => list.filter((s) => s.id !== id))
      setTransactions((list) => list.map((t) => (t.storeId === id ? { ...t, storeId: undefined } : t)))
      if (shop) addAuditLog('DELETE_STORE', `Magasin supprimé : "${shop.name}"`)
    } catch (err) { signaler(err); recharger() }
  }, [stores, addAuditLog, signaler, recharger])

  const handleReassignTransactions = useCallback(async (ids: string[], storeId: string) => {
    if (!currentUser || !isPrivilegedRole(currentUser.role)) { addToast('Seul un administrateur peut réaffecter un mouvement.', 'error'); return }
    const store = stores.find((s) => s.id === storeId)
    if (!store) return
    try {
      await svc.reaffecterMagasin(ids, store)
      const idSet = new Set(ids)
      const maintenant = new Date().toISOString()
      setTransactions((list) => list.map((t) => (idSet.has(t.id) ? { ...t, storeId, storeName: store.name, updatedAt: maintenant } : t)))
      addAuditLog('UPDATE', `${ids.length} mouvement(s) réaffecté(s) au magasin "${store.name}"`)
    } catch (err) { signaler(err); recharger() }
  }, [currentUser, stores, addToast, addAuditLog, signaler, recharger])

  // Classement automatique des mouvements sans magasin (magasins reconnus créés au besoin).
  const handleClasser = useCallback(async (groupes: Array<{ nom: string; id: string | null; ids: string[] }>) => {
    let n = 0
    const resume: string[] = []
    try {
      for (const g of groupes) {
        const shop = g.id ? stores.find((s) => s.id === g.id) ?? null : await handleAddStoreRetour(g.nom)
        if (!shop) throw new Error(`Magasin « ${g.nom} » introuvable ou impossible à créer.`)
        await svc.reaffecterMagasin(g.ids, shop)
        n += g.ids.length
        resume.push(`${shop.name} : ${g.ids.length}`)
      }
      addAuditLog('UPDATE', `Classement automatique : ${n} mouvement(s) rangé(s) dans leur magasin (${resume.join(', ')})`)
      addToast(`${n} mouvement(s) rangé(s) dans leur magasin.`, 'success')
    } catch (err) {
      signaler(err)
    } finally {
      await recharger(true)
    }
  }, [stores, handleAddStoreRetour, addAuditLog, addToast, signaler, recharger])

  // ── Mouvements ─────────────────────────────────────────────────────────────
  const handleSaveTransaction = useCallback(async (
    data: Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    assignedUserId?: string,
  ): Promise<boolean> => {
    if (!currentUser) return false
    const fichier = data.attachmentData
      ? { nom: data.attachmentName || 'justificatif', type: data.attachmentType || '', contenu: data.attachmentData }
      : null
    const targetUserId = (isPrivilegedRole(currentUser.role) && assignedUserId) || viewAsUserId || currentUser.id
    const nomCible = users.find((u) => u.id === targetUserId)?.name ?? 'un utilisateur'
    try {
      handleNewCategory(data.category)
      if (modal.editing) {
        if (!isPrivilegedRole(currentUser.role)) {
          addToast('Seul un administrateur peut modifier un mouvement.', 'error')
          setModal({ open: false, mode: 'income' })
          return false
        }
        const editing = modal.editing
        const reassigned = assignedUserId && assignedUserId !== editing.userId
        const updated = await svc.enregistrerMouvement(
          { ...editing, ...data, userId: targetUserId, updatedAt: new Date().toISOString() },
          { nouveau: false, fichier, retirer: !data.attachmentPath && !data.attachmentData, ancienChemin: editing.attachmentPath },
        )
        setTransactions((list) => list.map((t) => (t.id === updated.id ? updated : t)))
        addAuditLog('UPDATE', `Modification : "${updated.description}" — ${updated.amount.toLocaleString('fr-FR')} ${settings.currency}${reassigned ? ` — affecté à ${nomCible}` : ''}`, updated.id)
        addToast('Mouvement mis à jour avec succès.', 'success')
      } else {
        const balance = calcBalance(visibleTransactions)
        if (data.type === 'expense' && !settings.allowOverdraft && balance < data.amount) {
          addToast(`Solde insuffisant. Disponible : ${balance.toLocaleString('fr-FR')} ${settings.currency}`, 'error')
          return false
        }
        const maintenant = new Date().toISOString()
        const txn = await svc.enregistrerMouvement(
          { id: genId(), userId: targetUserId, ...data, attachmentPath: undefined, createdAt: maintenant, updatedAt: maintenant },
          { nouveau: true, fichier },
        )
        setTransactions((list) => [txn, ...list])
        const assignNote = isPrivilegedRole(currentUser.role) && targetUserId !== currentUser.id ? ` — affecté à ${nomCible}` : ''
        addAuditLog(data.type === 'income' ? 'CREATE_INCOME' : 'CREATE_EXPENSE',
          `${data.type === 'income' ? 'Entrée' : 'Sortie'} créée : "${data.description}" — ${data.amount.toLocaleString('fr-FR')} ${settings.currency}${assignNote}`, txn.id)
        addToast(data.type === 'income' ? 'Entrée enregistrée avec succès.' : 'Dépense enregistrée avec succès.', 'success')
      }
      setModal({ open: false, mode: 'income' })
      return true
    } catch (err) {
      signaler(err)
      return false
    }
  }, [currentUser, modal.editing, visibleTransactions, settings, users, viewAsUserId, addToast, addAuditLog, handleNewCategory, signaler])

  const handleDeleteTransaction = useCallback(async (id: string) => {
    if (!currentUser || !isPrivilegedRole(currentUser.role)) { addToast('Seul un administrateur peut supprimer un mouvement.', 'error'); return }
    const txn = transactions.find((t) => t.id === id)
    if (!txn) return
    try {
      await svc.supprimerMouvement(txn)
      setTransactions((list) => list.filter((t) => t.id !== id))
      addAuditLog('DELETE', `Suppression : "${txn.description}" — ${txn.amount.toLocaleString('fr-FR')} ${settings.currency}`, id)
      addToast('Mouvement supprimé.', 'success')
    } catch (err) { signaler(err) }
  }, [currentUser, transactions, settings, addToast, addAuditLog, signaler])

  const handleViewTransaction = useCallback((t: Transaction) => setDetail(t), [])
  const handleEditTransaction = useCallback((t: Transaction) => { setDetail(null); setModal({ open: true, mode: t.type, editing: t }) }, [])

  // ── Personnes ──────────────────────────────────────────────────────────────
  const handleRattacher = useCallback(async (personneId: string, compteId: string | null) => {
    const p = users.find((u) => u.id === personneId)
    const c = comptes.find((x) => x.compte === compteId)
    try {
      await svc.rattacherPersonne(personneId, compteId)
      addAuditLog('UPDATE_USER', compteId ? `${p?.name ?? 'Personne'} rattachée au compte ${c?.email ?? compteId}` : `${p?.name ?? 'Personne'} détachée de son compte`)
      addToast('Rattachement enregistré.', 'success')
      if (viewAsUserId === personneId) setViewAsUserId(null)
      await recharger(true)
    } catch (err) { signaler(err) }
  }, [users, comptes, viewAsUserId, addAuditLog, addToast, recharger, signaler])

  const handleRenommer = useCallback(async (personneId: string, nom: string) => {
    try {
      await svc.renommerPersonne(personneId, nom)
      setUsers((list) => list.map((u) => (u.id === personneId ? { ...u, name: nom } : u)))
      addToast('Nom enregistré.', 'success')
    } catch (err) { signaler(err) }
  }, [addToast, signaler])

  // ── Paramètres ─────────────────────────────────────────────────────────────
  const handleSaveSettings = useCallback(async (s: AppSettings): Promise<boolean> => {
    try {
      await svc.enregistrerReglages(s)
      setSettings(s)
      addAuditLog('SETTINGS', "Paramètres de l'application mis à jour")
      return true
    } catch (err) { signaler(err); return false }
  }, [addAuditLog, signaler])

  // ── Écrans d'attente / d'erreur ────────────────────────────────────────────
  if (chargement) {
    return (
      <div className="leclaire-app">
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '100dvh', background: 'linear-gradient(145deg, #071428, #0D1F3C)' }}>
          <div className="mb-5 animate-pulse"><Logo size={60} variant="dark" /></div>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Chargement de LECLAIRE…</p>
        </div>
      </div>
    )
  }

  const boutonRetour = (
    <button onClick={onRetour} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #1D6FA4 0%, #0EA5E9 60%, #38BDF8 100%)', fontFamily: 'var(--font-display)' }}>
      RETOUR À OPTICLAIRE
    </button>
  )

  if (erreur) {
    return (
      <div className="leclaire-app">
        <Ecran titre={erreur.installation ? 'LECLAIRE n’est pas encore installé' : 'Connexion à LECLAIRE impossible'}>
          <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {erreur.installation
              ? `Un administrateur doit d'abord exécuter le script ${svc.SCRIPT_INSTALLATION} dans Supabase (projet OPTICLAIRE → SQL Editor → coller tout le fichier → RUN).`
              : 'Vos données ne sont pas perdues : réessayez dans un instant.'}
          </p>
          <div className="rounded-lg px-3 py-2 mb-4 text-left" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs font-mono break-all" style={{ color: '#FCA5A5' }} data-testid="lc-erreur">{erreur.message}</p>
          </div>
          <button onClick={() => setEssai((n) => n + 1)} className="w-full py-3 rounded-xl text-sm font-bold mb-2" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
            RÉESSAYER
          </button>
          {boutonRetour}
        </Ecran>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="leclaire-app">
        <Ecran titre="Accès à LECLAIRE non autorisé">
          <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.6)' }} data-testid="lc-sans-acces">
            Votre compte n'a pas l'accès à LECLAIRE. Demandez à un administrateur de cocher « Accès LECLAIRE » sur votre
            fiche (OPTICLAIRE → Gestion des utilisateurs).
          </p>
          {boutonRetour}
        </Ecran>
      </div>
    )
  }

  const balance = calcBalance(visibleTransactions)

  return (
    <div className="leclaire-app">
      <Layout currentUser={currentUser} view={view} onChangeView={setView} onLogout={onLogout} onRetour={onRetour}>
        {viewAsUser && (
          <div
            className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #1E3A5F, #1E40AF)', border: '1px solid rgba(56,189,248,0.25)', boxShadow: '0 2px 12px rgba(30,64,175,0.2)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 text-white" style={{ background: 'rgba(255,255,255,0.15)', fontFamily: 'var(--font-display)' }}>
                {viewAsUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate" style={{ fontFamily: 'var(--font-display)' }}>Données de : {viewAsUser.name}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Vous consultez en tant qu'administrateur</p>
              </div>
            </div>
            <button
              onClick={handleClearViewAs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              Retour
            </button>
          </div>
        )}

        {view === 'dashboard' && (
          <Dashboard
            currentUser={viewAsUser ?? currentUser}
            transactions={visibleTransactions}
            settings={settings}
            onAddIncome={() => setModal({ open: true, mode: 'income' })}
            onAddExpense={() => setModal({ open: true, mode: 'expense' })}
            onEdit={handleViewTransaction}
            onChangeView={setView}
          />
        )}
        {view === 'movements' && (
          <Movements
            transactions={visibleTransactions}
            settings={settings}
            users={users}
            showAuthor={isPrivilegedRole(currentUser.role) && !viewAsUserId}
            onView={handleViewTransaction}
            onAddIncome={() => setModal({ open: true, mode: 'income' })}
            onAddExpense={() => setModal({ open: true, mode: 'expense' })}
            onImport={isPrivilegedRole(currentUser.role) && !viewAsUserId ? () => setView('fichier') : undefined}
          />
        )}
        {view === 'stores' && (
          <Stores
            stores={stores}
            transactions={visibleTransactions}
            settings={settings}
            canManage={isPrivilegedRole(currentUser.role)}
            onEdit={handleViewTransaction}
            onAddStore={handleAddStore}
            onRenameStore={handleRenameStore}
            onDeleteStore={handleDeleteStore}
            onReassign={handleReassignTransactions}
            onToast={addToast}
            users={users}
            magasinsOpticlaire={magasinsOpticlaire}
            nommerMagasin={nomMagasin}
            onClasser={isPrivilegedRole(currentUser.role) && !viewAsUserId ? handleClasser : undefined}
          />
        )}
        {view === 'statistics' && <Statistics transactions={visibleTransactions} settings={settings} />}
        {view === 'categories' && <Categories transactions={visibleTransactions} settings={settings} onEdit={handleViewTransaction} />}
        {view === 'justificatifs' && <Justificatifs transactions={visibleTransactions} settings={settings} onEdit={handleViewTransaction} />}
        {view === 'history' && isPrivilegedRole(currentUser.role) && <HistoryLog auditLogs={auditLogs} />}
        {view === 'users' && isPrivilegedRole(currentUser.role) && (
          <Users
            users={users}
            currentUser={currentUser}
            transactions={transactions}
            comptes={comptes}
            onViewAsUser={handleViewAsUser}
            onRattacher={handleRattacher}
            onRenommer={handleRenommer}
          />
        )}
        {view === 'settings' && isPrivilegedRole(currentUser.role) && (
          <Settings settings={settings} onSave={handleSaveSettings} onToast={addToast} />
        )}
        {view === 'fichier' && isPrivilegedRole(currentUser.role) && (
          <ImportFichier
            stores={stores}
            users={users}
            transactions={transactions}
            categories={categories}
            currentUser={currentUser}
            settings={settings}
            magasinsOpticlaire={magasinsOpticlaire}
            nommerMagasin={nomMagasin}
            onAjouterMagasin={handleAddStoreRetour}
            onToast={addToast}
            onTermine={() => recharger(true)}
            journal={(action, description) => addAuditLog(action, description)}
          />
        )}
        {view === 'import' && isPrivilegedRole(currentUser.role) && (
          <Reprise
            comptes={comptes}
            onToast={addToast}
            onTermine={() => recharger(true)}
            journal={(action, description) => addAuditLog(action, description)}
          />
        )}
      </Layout>

      {modal.open && (
        <TransactionModal
          mode={modal.mode}
          editing={modal.editing}
          settings={settings}
          currentBalance={balance}
          categories={categories}
          stores={stores}
          onSave={handleSaveTransaction}
          onNewCategory={handleNewCategory}
          onClose={() => setModal({ open: false, mode: modal.mode })}
          readOnly={!!modal.editing && !isPrivilegedRole(currentUser.role)}
          canAssign={isPrivilegedRole(currentUser.role)}
          users={users.filter((u) => u.compte || u.id === modal.editing?.userId)}
          defaultUserId={modal.editing?.userId ?? viewAsUserId ?? currentUser.id}
          magasinHabituelDe={(id) => magasinHabituel(transactions, id, stores)?.id}
          reconnaitreMagasin={(textes) => magasinCite(textes, stores)?.id ?? null}
        />
      )}

      {detail && (
        <TransactionDetail
          transaction={detail}
          settings={settings}
          stores={stores}
          users={users}
          canManage={isPrivilegedRole(currentUser.role)}
          showAuthor={isPrivilegedRole(currentUser.role) && !viewAsUserId}
          onEdit={handleEditTransaction}
          onDelete={handleDeleteTransaction}
          onClose={() => setDetail(null)}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
