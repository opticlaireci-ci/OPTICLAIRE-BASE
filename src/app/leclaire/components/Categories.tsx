import { useMemo, useState } from 'react'
import type { Transaction, AppSettings } from '../types'
import { formatFCFA, formatDate, calcTotalIncome, calcTotalExpense } from '../outils'

interface Props {
  transactions: Transaction[]
  settings: AppSettings
  onEdit: (t: Transaction) => void
}

const CAT_COLORS = [
  { bg: '#EEF2FF', text: '#4338CA', bar: '#6366F1' },
  { bg: '#ECFDF5', text: '#065F46', bar: '#10B981' },
  { bg: '#FFF7ED', text: '#9A3412', bar: '#F97316' },
  { bg: '#FDF2F8', text: '#86198F', bar: '#EC4899' },
  { bg: '#F0F9FF', text: '#0369A1', bar: '#0EA5E9' },
  { bg: '#FEFCE8', text: '#854D0E', bar: '#EAB308' },
  { bg: '#F0FDF4', text: '#166534', bar: '#22C55E' },
  { bg: '#FFF1F2', text: '#9F1239', bar: '#F43F5E' },
  { bg: '#F5F3FF', text: '#5B21B6', bar: '#8B5CF6' },
  { bg: '#ECFEFF', text: '#155E75', bar: '#06B6D4' },
]

function colorFor(category: string) {
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash)
  return CAT_COLORS[Math.abs(hash) % CAT_COLORS.length]
}

export default function Categories({ transactions, settings, onEdit }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const grouped = useMemo(() => {
    const map: Record<string, Transaction[]> = {}
    transactions.forEach((t) => {
      if (!map[t.category]) map[t.category] = []
      map[t.category].push(t)
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([cat]) => cat.toLowerCase().includes(search.toLowerCase()))
      .map(([cat, txns]) => ({
        category: cat,
        txns: [...txns].sort((a, b) => b.date.localeCompare(a.date)),
        income: calcTotalIncome(txns),
        expense: calcTotalExpense(txns),
        count: txns.length,
      }))
  }, [transactions, search])

  const toggle = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 fade-up">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#F1F5F9' }}>
          <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>Aucune transaction</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 fade-up">
      {/* Search */}
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
          <svg className="w-4 h-4" fill="none" stroke="#94A3B8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une catégorie…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all bg-white"
          style={{ border: '1px solid var(--color-border)', color: '#0F172A' }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--color-blue)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
        />
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Catégories', value: String(grouped.length), color: 'var(--color-blue)', bg: 'var(--color-blue-light)' },
          { label: 'Entrées totales', value: formatFCFA(calcTotalIncome(transactions), settings.currency), color: 'var(--color-income)', bg: 'var(--color-income-light)' },
          { label: 'Sorties totales', value: formatFCFA(calcTotalExpense(transactions), settings.currency), color: 'var(--color-expense)', bg: 'var(--color-expense-light)' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-3 sm:p-4" style={{ border: '1px solid var(--color-border)' }}>
            <p className="text-xs font-medium mb-1 truncate" style={{ color: 'var(--color-muted)' }}>{label}</p>
            <p className="font-bold num text-xs sm:text-sm truncate" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Category sections */}
      {grouped.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted)' }}>Aucune catégorie trouvée</p>
      ) : (
        grouped.map(({ category, txns, income, expense, count }) => {
          const colors = colorFor(category)
          const isOpen = expanded.has(category)
          const net = income - expense

          return (
            <div key={category} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {/* Category header */}
              <button
                onClick={() => toggle(category)}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left transition-colors"
                style={{ background: isOpen ? colors.bg : 'white' }}
                onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = '#FAFBFD' }}
                onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'white' }}
              >
                {/* Category badge */}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold" style={{ background: colors.bg, color: colors.text }}>
                  {category.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm" style={{ color: colors.text, fontFamily: 'var(--font-display)' }}>{category}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: colors.bg, color: colors.text }}>
                      {count} mvt
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {income > 0 && (
                      <span className="text-xs font-semibold num" style={{ color: 'var(--color-income)' }}>
                        +{formatFCFA(income, settings.currency)}
                      </span>
                    )}
                    {expense > 0 && (
                      <span className="text-xs font-semibold num" style={{ color: 'var(--color-expense)' }}>
                        −{formatFCFA(expense, settings.currency)}
                      </span>
                    )}
                    {(income > 0 || expense > 0) && (
                      <span className="text-xs num" style={{ color: 'var(--color-muted)' }}>
                        net {net >= 0 ? '+' : ''}{formatFCFA(net, settings.currency)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="hidden sm:block w-24 flex-shrink-0">
                  {income + expense > 0 && (
                    <div>
                      <div className="h-1.5 rounded-full mb-1 overflow-hidden" style={{ background: 'var(--color-income-light)' }}>
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${(income / (income + expense)) * 100}%`, background: 'var(--color-income)' }}
                        />
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-expense-light)' }}>
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${(expense / (income + expense)) * 100}%`, background: 'var(--color-expense)' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <svg
                  className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : '', color: '#94A3B8' }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Transactions list — mobile-friendly cards */}
              {isOpen && (
                <div className="border-t divide-y" style={{ borderColor: '#F1F5F9' }}>
                  {txns.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onEdit(t)}
                      className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors"
                      style={{ borderColor: '#F1F5F9' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#FAFBFD')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate" style={{ color: '#1E293B' }}>{t.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="num text-xs" style={{ color: 'var(--color-muted)' }}>{formatDate(t.date)}</span>
                          {t.beneficiaryOrSource && (
                            <span className="text-xs truncate" style={{ color: '#94A3B8' }}>· {t.beneficiaryOrSource}</span>
                          )}
                        </div>
                      </div>
                      <span
                        className="font-bold num text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                        style={{
                          background: t.type === 'income' ? 'var(--color-income-light)' : 'var(--color-expense-light)',
                          color: t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)',
                        }}
                      >
                        {t.type === 'income' ? '+' : '−'}{formatFCFA(t.amount, settings.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
