import { useMemo, useState } from 'react'
import type { AppSettings, Shop, Transaction, User } from '../types'
import { formatDate, formatFCFA } from '../outils'
import { proposerClassement, type Proposition } from '../classement'
import { nomACreer } from '../reconnaissance'

/**
 * Classement automatique des mouvements sans magasin (administration
 * LECLAIRE, écran Magasins) : magasin reconnu pour chacun, à vérifier, puis
 * rangement en un clic. Les magasins reconnus qui n'existent pas encore sont
 * créés.
 */
export interface GroupeClassement { nom: string; id: string | null; ids: string[] }

interface Props {
  transactions: Transaction[]
  stores: Shop[]
  users: User[]
  settings: AppSettings
  magasinsOpticlaire: string[]
  /** Nom donné aux magasins créés (règle d'OPTICLAIRE : « LECLAIRE X »). */
  nommerMagasin?: (nom: string) => string
  onClasser: (groupes: GroupeClassement[]) => Promise<void>
}

const RAISONS: Record<Proposition['origine'], string> = {
  'nom-enregistre': 'nom du magasin enregistré',
  mention: 'cité dans le mouvement',
  nom: 'cité dans le mouvement',
  periode: 'même personne, même période',
}

export default function ClassementAuto({ transactions, stores, users, settings, magasinsOpticlaire, nommerMagasin, onClasser }: Props) {
  const propositions = useMemo(() => proposerClassement(transactions, stores, magasinsOpticlaire), [transactions, stores, magasinsOpticlaire])
  const [ouvert, setOuvert] = useState(false)
  const [exclus, setExclus] = useState<Record<string, boolean>>({})
  const [enCours, setEnCours] = useState(false)
  const nomPersonne = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users])

  if (!propositions.length) return null
  const retenues = propositions.filter(p => !exclus[p.mouvement.id])
  const parMagasin = new Map<string, { nom: string; id: string | null; ids: string[] }>()
  for (const p of retenues) {
    const k = p.magasin.id || `nouveau:${p.magasin.cle}`
    const g = parMagasin.get(k) || { nom: p.magasin.id ? p.magasin.nom : nomACreer(p.magasin, nommerMagasin), id: p.magasin.id, ids: [] }
    g.ids.push(p.mouvement.id)
    parMagasin.set(k, g)
  }
  const groupes = [...parMagasin.values()]
  const nouveaux = groupes.filter(g => !g.id).map(g => g.nom)

  const classer = async () => {
    setEnCours(true)
    try { await onClasser(groupes); setExclus({}) } finally { setEnCours(false) }
  }

  return (
    <div className="bg-white rounded-2xl p-5 space-y-3" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #A7F3D0' }} data-testid="lc-classement-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>
            Classement automatique : {propositions.length} mouvement{propositions.length > 1 ? 's' : ''} sans magasin reconnu{propositions.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            {groupes.map(g => `${g.nom}${g.id ? '' : ' (nouveau)'} : ${g.ids.length}`).join(' · ')}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOuvert(o => !o)} className="text-xs px-3 py-2 rounded-lg border border-border" style={{ color: 'var(--color-muted)' }}>
            {ouvert ? 'Masquer le détail' : 'Voir le détail'}
          </button>
          <button onClick={classer} disabled={enCours || !retenues.length} className="text-xs px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-50" style={{ background: '#059669' }} data-testid="lc-classer">
            {enCours ? 'Classement…' : `Classer ${retenues.length} mouvement${retenues.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
      {nouveaux.length > 0 && (
        <p className="text-xs" style={{ color: '#065F46' }}>{nouveaux.length > 1 ? 'Magasins qui seront créés en classant' : 'Magasin qui sera créé en classant'} : {nouveaux.join(', ')}.</p>
      )}
      {ouvert && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs no-mobile-scroll">
            <thead style={{ background: '#F8FAFC', color: 'var(--color-muted)' }}>
              <tr><th className="p-2"></th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Mouvement</th><th className="p-2 text-right">Montant</th><th className="p-2 text-left">Magasin proposé</th></tr>
            </thead>
            <tbody>
              {propositions.map(p => {
                const t = p.mouvement
                return (
                  <tr key={t.id} className="border-t border-border align-top" style={{ opacity: exclus[t.id] ? 0.5 : 1 }} data-testid="lc-classement-ligne">
                    <td className="p-2"><input type="checkbox" checked={!exclus[t.id]} onChange={e => setExclus(x => ({ ...x, [t.id]: !e.target.checked }))} /></td>
                    <td className="p-2 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="p-2" style={{ minWidth: 160 }}>
                      <span className="font-semibold" style={{ color: '#0F172A' }}>{t.description}</span>
                      <span className="block" style={{ color: '#94A3B8' }}>{nomPersonne.get(t.userId) || '—'}</span>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap num" style={{ color: t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)' }}>
                      {t.type === 'income' ? '+' : '−'}{formatFCFA(t.amount, settings.currency)}
                    </td>
                    <td className="p-2" style={{ minWidth: 150 }}>
                      <span className="font-semibold">{p.magasin.id ? p.magasin.nom : `${nomACreer(p.magasin, nommerMagasin)} (nouveau)`}</span>
                      <span className="block" style={{ color: '#059669' }}>
                        {RAISONS[p.origine]}{p.depuis ? ` (« ${p.depuis.description} », ${formatDate(p.depuis.date)})` : ''}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
