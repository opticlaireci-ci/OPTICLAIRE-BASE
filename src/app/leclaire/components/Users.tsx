import { useMemo, useState } from 'react'
import type { User, Transaction } from '../types'
import type { CompteOpticlaire } from '../leclaireService'
import { formatDateTime, roleLabel } from '../outils'

/**
 * Personnes LECLAIRE. Les comptes et mots de passe sont ceux d'OPTICLAIRE :
 * l'accès se donne dans OPTICLAIRE → Gestion des utilisateurs (cases
 * « Accès LECLAIRE » et « Administrateur LECLAIRE »). Ici, l'administration
 * consulte les données de chacun et rattache à un compte les personnes
 * reprises de l'ancienne application.
 */
interface Props {
  users: User[]
  currentUser: User
  transactions: Transaction[]
  comptes: CompteOpticlaire[]
  onViewAsUser: (userId: string) => void
  onRattacher: (personneId: string, compte: string | null) => Promise<void>
  onRenommer: (personneId: string, nom: string) => Promise<void>
}

const ROLE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  superadmin: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  admin:      { bg: '#EDE9FE', text: '#6D28D9', border: '#DDD6FE' },
  user:       { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' },
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366F1,#818CF8)',
  'linear-gradient(135deg,#0D9488,#2DD4BF)',
  'linear-gradient(135deg,#DC2626,#F87171)',
  'linear-gradient(135deg,#D97706,#FCD34D)',
  'linear-gradient(135deg,#7C3AED,#C4B5FD)',
  'linear-gradient(135deg,#0369A1,#38BDF8)',
]

function avatarBg(userId: string) {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = userId.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const court = (v: number) => (v > 0 ? (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e3).toFixed(0) + 'k') : '0')

export default function Users({ users, currentUser, transactions, comptes, onViewAsUser, onRattacher, onRenommer }: Props) {
  const [rattachement, setRattachement] = useState<User | null>(null)
  const [choix, setChoix] = useState('')
  const [renommage, setRenommage] = useState<User | null>(null)
  const [nom, setNom] = useState('')
  const [occupe, setOccupe] = useState(false)

  const comptesParId = useMemo(() => new Map(comptes.map(c => [c.compte, c])), [comptes])
  const sorted = useMemo(() => [...users].sort((a, b) => {
    const sa = a.compte ? 0 : 1
    const sb = b.compte ? 0 : 1
    return sa - sb || a.name.localeCompare(b.name, 'fr')
  }), [users])
  const sansCompte = users.filter(u => !u.compte).length
  // Comptes déjà pris par une autre fiche : proposés quand même (les mouvements sont alors regroupés).
  const fichesParCompte = useMemo(() => new Map(users.filter(u => u.compte).map(u => [u.compte as string, u])), [users])

  const ouvrirRattachement = (u: User) => { setRattachement(u); setChoix(u.compte || '') }
  const validerRattachement = async () => {
    if (!rattachement) return
    setOccupe(true)
    try {
      await onRattacher(rattachement.id, choix || null)
      setRattachement(null)
    } finally {
      setOccupe(false)
    }
  }
  const validerRenommage = async () => {
    if (!renommage || !nom.trim()) return
    setOccupe(true)
    try {
      await onRenommer(renommage.id, nom.trim())
      setRenommage(null)
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="space-y-5 fade-up">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
          {users.length} personne{users.length !== 1 ? 's' : ''}
          {sansCompte > 0 && <span style={{ color: '#C2410C' }}> · {sansCompte} sans compte OPTICLAIRE</span>}
        </p>
        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
          Les comptes et mots de passe sont ceux d'OPTICLAIRE. Pour donner ou retirer l'accès : OPTICLAIRE → Gestion des
          utilisateurs → fiche de la personne → cases « Accès LECLAIRE » et « Administrateur LECLAIRE ». Les administrateurs
          d'OPTICLAIRE sont administrateurs de LECLAIRE d'office.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {sorted.map((u) => {
          const userTxns = transactions.filter((t) => t.userId === u.id)
          const userIncome = userTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
          const userExpense = userTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
          const roleStyle = ROLE_STYLES[u.role] ?? ROLE_STYLES.user
          const isMe = u.id === currentUser.id
          const compte = u.compte ? comptesParId.get(u.compte) : undefined
          const accesRetire = !!u.compte && !compte?.acces

          return (
            <div
              key={u.id}
              className="bg-white rounded-2xl overflow-hidden transition-all"
              style={{ border: `1px solid ${u.compte ? 'var(--color-border)' : '#FED7AA'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
              data-testid="lc-personne"
            >
              <button
                onClick={() => onViewAsUser(u.id)}
                className="w-full p-5 text-left transition-all group"
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#FAFBFD')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black text-white flex-shrink-0"
                    style={{ background: avatarBg(u.id), fontFamily: 'var(--font-display)' }}
                  >
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm truncate" style={{ color: '#0F172A', fontFamily: 'var(--font-display)' }}>{u.name}</span>
                      {isMe && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '0.6rem', fontWeight: 600 }}>VOUS</span>
                      )}
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{ color: '#94A3B8' }}>{u.email || 'e-mail non renseigné'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {u.compte && !accesRetire && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: roleStyle.bg, color: roleStyle.text, border: `1px solid ${roleStyle.border}` }}>
                          {roleLabel(u.role)}
                        </span>
                      )}
                      {!u.compte && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
                          Ancienne personne — sans compte OPTICLAIRE
                        </span>
                      )}
                      {accesRetire && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                          Accès LECLAIRE non coché
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Mouvements', value: String(userTxns.length), color: 'var(--color-blue)' },
                    { label: 'Entrées', value: court(userIncome), color: 'var(--color-income)' },
                    { label: 'Sorties', value: court(userExpense), color: 'var(--color-expense)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: '#F8FAFC' }}>
                      <p className="font-bold num text-sm" style={{ color }}>{value}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8', fontSize: '0.62rem' }}>{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-3 text-left" style={{ color: '#94A3B8' }}>
                  Fiche créée le {formatDateTime(u.createdAt).split(' ')[0]}
                  {u.ancienRole ? ` · reprise de l'ancienne application (${roleLabel(u.ancienRole)})` : ''}
                </p>
              </button>

              <div className="px-5 pb-4 flex items-center gap-2 border-t flex-wrap" style={{ borderColor: '#F1F5F9', paddingTop: 12 }}>
                <button
                  onClick={() => onViewAsUser(u.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)' }}
                >
                  Voir données
                </button>
                <button
                  onClick={() => ouvrirRattachement(u)}
                  className="py-2 px-3 rounded-xl text-xs font-medium"
                  style={{ background: u.compte ? '#F1F5F9' : '#FFF7ED', color: u.compte ? 'var(--color-muted)' : '#C2410C' }}
                >
                  {u.compte ? 'Compte' : 'Rattacher à un compte'}
                </button>
                <button
                  onClick={() => { setRenommage(u); setNom(u.name) }}
                  className="py-2 px-3 rounded-xl text-xs font-medium"
                  style={{ background: '#F1F5F9', color: 'var(--color-muted)' }}
                >
                  Renommer
                </button>
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: 'var(--color-muted)' }}>
            Personne n'a encore l'accès à LECLAIRE. Cochez « Accès LECLAIRE » dans OPTICLAIRE → Gestion des utilisateurs.
          </p>
        )}
      </div>

      {rattachement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={(e) => e.target === e.currentTarget && !occupe && setRattachement(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>Compte OPTICLAIRE de {rattachement.name}</h3>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              La personne verra ses mouvements en se connectant à OPTICLAIRE avec ce compte (case « Accès LECLAIRE » cochée).
              Si ce compte a déjà sa fiche LECLAIRE, les mouvements y sont regroupés.
            </p>
            <select value={choix} onChange={(e) => setChoix(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" data-testid="lc-choix-compte">
              <option value="">— Aucun compte (personne non rattachée) —</option>
              {comptes.map(c => {
                const autre = fichesParCompte.get(c.compte)
                return (
                  <option key={c.compte} value={c.compte}>
                    {c.nom} ({c.email}){c.acces ? '' : ' — accès LECLAIRE non coché'}{autre && autre.id !== rattachement.id ? ` — regroupé avec « ${autre.name} »` : ''}
                  </option>
                )
              })}
            </select>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setRattachement(null)} disabled={occupe} className="flex-1 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>Annuler</button>
              <button onClick={validerRattachement} disabled={occupe} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--color-navy)' }}>
                {occupe ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renommage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={(e) => e.target === e.currentTarget && !occupe && setRenommage(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>Nom affiché dans LECLAIRE</h3>
            <input value={nom} onChange={(e) => setNom(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" autoFocus />
            <div className="flex gap-3 pt-1">
              <button onClick={() => setRenommage(null)} disabled={occupe} className="flex-1 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>Annuler</button>
              <button onClick={validerRenommage} disabled={occupe || !nom.trim()} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--color-navy)' }}>
                {occupe ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
