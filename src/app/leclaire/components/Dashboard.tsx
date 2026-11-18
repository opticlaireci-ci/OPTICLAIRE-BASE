import type { ReactNode } from 'react'
import type { Transaction, User, AppSettings, View } from '../types'
import { isPrivilegedRole } from '../types'
import { formatFCFA, formatDate, calcBalance, calcTotalIncome, calcTotalExpense } from '../outils'

interface Props {
  currentUser: User
  transactions: Transaction[]
  settings: AppSettings
  onAddIncome: () => void
  onAddExpense: () => void
  onEdit: (t: Transaction) => void
  onChangeView: (v: View) => void
}

function QuickStat({
  label, value, icon, color, bg, onClick,
}: {
  label: string
  value: string
  icon: ReactNode
  color: string
  bg: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-2xl p-4 text-left w-full transition-all"
      style={{
        background: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
        ;(e.currentTarget as HTMLElement).style.transform = ''
      }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-snug" style={{ color: 'var(--color-muted)' }}>{label}</p>
        <p className="text-sm font-bold num leading-snug" style={{ color: '#0F172A' }}>{value}</p>
      </div>
      {onClick && (
        <svg className="w-3.5 h-3.5 absolute top-4 right-4 sm:static sm:ml-auto flex-shrink-0 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  )
}

export default function Dashboard({ currentUser, transactions, settings, onAddIncome, onAddExpense, onEdit, onChangeView }: Props) {
  const balance = calcBalance(transactions)
  const totalIncome = calcTotalIncome(transactions)
  const totalExpense = calcTotalExpense(transactions)
  const ratio = totalIncome > 0 ? Math.min((totalExpense / totalIncome) * 100, 100) : 0

  const recent = [...transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bonjour'
    if (h < 18) return 'Bon après-midi'
    return 'Bonsoir'
  }

  const thisMonth = transactions.filter((t) => {
    const d = new Date(t.date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const thisMonthIncome = calcTotalIncome(thisMonth)
  const thisMonthExpense = calcTotalExpense(thisMonth)

  return (
    <div className="space-y-5 fade-up">
      {/* Hero balance card */}
      <div
        className="relative overflow-hidden rounded-3xl p-7"
        style={{
          background: 'linear-gradient(135deg, #0B1D3A 0%, #152D58 55%, #0E3472 100%)',
          boxShadow: '0 16px 48px rgba(11,29,58,0.35)',
          minHeight: 220,
        }}
      >
        <div style={{ position: 'absolute', top: -60, right: -40, width: 280, height: 280, borderRadius: '50%', background: 'rgba(14,165,233,0.08)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, right: 120, width: 220, height: 220, borderRadius: '50%', background: 'rgba(5,150,105,0.06)', pointerEvents: 'none' }} />
        <div className="dot-grid absolute inset-0 opacity-60" style={{ pointerEvents: 'none' }} />

        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-display)' }}>
              Solde actuel
            </p>
            <p
              className="num font-black leading-none"
              style={{
                color: balance < 0 ? '#FCA5A5' : 'white',
                fontSize: 'clamp(1.75rem, 5vw, 2.75rem)',
                textShadow: '0 2px 12px rgba(0,0,0,0.2)',
              }}
            >
              {formatFCFA(balance, settings.currency)}
            </p>

            <div className="flex flex-wrap gap-4 mt-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(5,150,105,0.25)' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="#34D399" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                </span>
                <div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Entrées</p>
                  <p className="text-sm font-bold num" style={{ color: '#6EE7B7' }}>{formatFCFA(totalIncome, settings.currency)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(220,38,38,0.25)' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="#F87171" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                </span>
                <div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Sorties</p>
                  <p className="text-sm font-bold num" style={{ color: '#FCA5A5' }}>{formatFCFA(totalExpense, settings.currency)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={onAddIncome}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'rgba(5,150,105,0.9)', color: 'white', fontFamily: 'var(--font-display)', boxShadow: '0 4px 16px rgba(5,150,105,0.4)' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#059669')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(5,150,105,0.9)')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Entrée
            </button>
            <button
              onClick={onAddExpense}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'rgba(220,38,38,0.85)', color: 'white', fontFamily: 'var(--font-display)', boxShadow: '0 4px 16px rgba(220,38,38,0.35)' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#DC2626')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.85)')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
              Sortie
            </button>
          </div>
        </div>

        <div className="relative mt-5">
          <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <span>Taux de dépenses</span>
            <span>{ratio.toFixed(1)} %</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div
              className="h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${ratio}%`, background: ratio > 80 ? '#F87171' : ratio > 60 ? '#FCD34D' : '#34D399' }}
            />
          </div>
        </div>
      </div>

      {/* Quick stat cards — each navigates to its section */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickStat
          label="Ce mois — Entrées"
          value={formatFCFA(thisMonthIncome, settings.currency)}
          color="var(--color-income)"
          bg="var(--color-income-light)"
          onClick={() => onChangeView('movements')}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
        />
        <QuickStat
          label="Ce mois — Sorties"
          value={formatFCFA(thisMonthExpense, settings.currency)}
          color="var(--color-expense)"
          bg="var(--color-expense-light)"
          onClick={() => onChangeView('movements')}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>}
        />
        <QuickStat
          label="Mouvements total"
          value={String(transactions.length)}
          color="var(--color-blue)"
          bg="var(--color-blue-light)"
          onClick={() => onChangeView('movements')}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <QuickStat
          label="Justificatifs"
          value={String(transactions.filter((t) => t.attachmentName).length)}
          color="#8B5CF6"
          bg="#EDE9FE"
          onClick={() => onChangeView('justificatifs')}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>}
        />
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-3xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: '#F1F5F9' }}>
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>
              Transactions récentes
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {greeting()}, <strong>{currentUser.name.split(' ')[0]}</strong> — {isPrivilegedRole(currentUser.role) ? 'vue globale de tous les utilisateurs' : 'vos opérations personnelles'}
            </p>
          </div>
          <button
            onClick={() => onChangeView('movements')}
            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
            style={{ background: '#F1F5F9', color: 'var(--color-muted)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#E2E8F0'; (e.currentTarget as HTMLElement).style.color = '#0D1F3C' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; (e.currentTarget as HTMLElement).style.color = 'var(--color-muted)' }}
          >
            Voir tout →
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#F1F5F9' }}>
              <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>Aucune transaction</p>
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Ajoutez votre première entrée ou sortie</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {recent.map((t) => {
              const income = t.type === 'income'
              return (
                <button
                  key={t.id}
                  onClick={() => onEdit(t)}
                  className="w-full text-left flex items-center gap-3 px-5 py-3.5 transition-colors"
                  style={{ borderColor: '#F1F5F9' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#FAFBFD')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
                >
                  <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ background: income ? 'var(--color-income)' : 'var(--color-expense)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate" style={{ color: '#1E293B' }}>{t.description}</p>
                      {t.attachmentName && (
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#94A3B8' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="num text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>{formatDate(t.date)}</span>
                      <span className="text-[0.65rem] px-2 py-0.5 rounded-md truncate" style={{ background: '#F1F5F9', color: '#475569' }}>{t.category}</span>
                    </div>
                  </div>
                  <span
                    className="font-bold num text-sm flex-shrink-0"
                    style={{ color: income ? 'var(--color-income)' : 'var(--color-expense)' }}
                  >
                    {income ? '+' : '−'}{formatFCFA(t.amount, settings.currency)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
