import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { Transaction, AppSettings } from '../types'
import { formatFCFA, calcBalance, calcTotalIncome, calcTotalExpense } from '../outils'

interface Props {
  transactions: Transaction[]
  settings: AppSettings
}

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function formatAmount(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'k'
  return String(v)
}

const PIE_PALETTE = [
  { fill: '#6366F1', glow: 'rgba(99,102,241,0.4)' },
  { fill: '#0EA5E9', glow: 'rgba(14,165,233,0.4)' },
  { fill: '#10B981', glow: 'rgba(16,185,129,0.4)' },
  { fill: '#F59E0B', glow: 'rgba(245,158,11,0.4)' },
  { fill: '#EC4899', glow: 'rgba(236,72,153,0.4)' },
  { fill: '#8B5CF6', glow: 'rgba(139,92,246,0.4)' },
  { fill: '#06B6D4', glow: 'rgba(6,182,212,0.4)' },
  { fill: '#F97316', glow: 'rgba(249,115,22,0.4)' },
  { fill: '#84CC16', glow: 'rgba(132,204,22,0.4)' },
  { fill: '#EF4444', glow: 'rgba(239,68,68,0.4)' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DarkTooltip({ active, payload, label, currency, settings }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'linear-gradient(145deg, #0F172A, #1E293B)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      minWidth: 160,
    }}>
      {label && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginBottom: 6, letterSpacing: '0.05em' }}>{label}</p>}
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem' }}>
              {p.name === 'income' ? 'Entrées' : p.name === 'expense' ? 'Sorties' : p.name === 'balance' ? 'Solde' : p.name}
            </span>
          </div>
          <span style={{ color: 'white', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {formatFCFA(Number(p.value ?? 0), (currency || settings?.currency) ?? 'FCFA')}
          </span>
        </div>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload, settings }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{
      background: 'linear-gradient(145deg, #0F172A, #1E293B)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', marginBottom: 4 }}>{d.name}</p>
      <p style={{ color: d.payload.fill, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        {formatFCFA(Number(d.value ?? 0), settings?.currency ?? 'FCFA')}
      </p>
    </div>
  )
}

export default function Statistics({ transactions, settings }: Props) {
  const balance = calcBalance(transactions)
  const totalIncome = calcTotalIncome(transactions)
  const totalExpense = calcTotalExpense(transactions)
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0

  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; income: number; expense: number; net: number }> = {}
    transactions.forEach((t) => {
      const d = new Date(t.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { month: `${MONTHS_FR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, income: 0, expense: 0, net: 0 }
      if (t.type === 'income') map[key].income += t.amount
      else map[key].expense += t.amount
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ ...v, net: v.income - v.expense }))
      .slice(-12)
  }, [transactions])

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {}
    transactions.filter((t) => t.type === 'expense').forEach((t) => {
      map[t.category] = (map[t.category] ?? 0) + t.amount
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }))
  }, [transactions])

  const balanceEvolution = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
    let running = 0
    return sorted.map((t) => {
      running += t.type === 'income' ? t.amount : -t.amount
      return { date: t.date, balance: running, label: t.date.slice(5) }
    })
  }, [transactions])

  const KPI_CARDS = [
    {
      label: 'Solde actuel',
      value: balance,
      color: balance >= 0 ? '#34D399' : '#F87171',
      bg: balance >= 0 ? 'linear-gradient(135deg, #064E3B, #065F46)' : 'linear-gradient(135deg, #7F1D1D, #991B1B)',
      glow: balance >= 0 ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)',
      icon: balance >= 0
        ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17H5m0 0v-8m0 8l8-8 4 4 6-6" /></svg>,
    },
    {
      label: 'Entrées totales',
      value: totalIncome,
      color: '#6EE7B7',
      bg: 'linear-gradient(135deg, #064E3B, #065F46)',
      glow: 'rgba(110,231,183,0.2)',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>,
    },
    {
      label: 'Sorties totales',
      value: totalExpense,
      color: '#FCA5A5',
      bg: 'linear-gradient(135deg, #7F1D1D, #991B1B)',
      glow: 'rgba(252,165,165,0.2)',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>,
    },
    {
      label: 'Taux d\'épargne',
      value: null,
      display: `${savingsRate.toFixed(1)} %`,
      color: savingsRate >= 20 ? '#93C5FD' : '#FCD34D',
      bg: 'linear-gradient(135deg, #1E3A5F, #1E40AF)',
      glow: 'rgba(147,197,253,0.2)',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    },
  ]

  const chartPanel = (title: string, subtitle: string, children: React.ReactNode) => (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #0F172A 0%, #1E293B 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div className="px-6 pt-5 pb-1">
        <h3 className="text-sm font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', marginTop: 2 }}>{subtitle}</p>
      </div>
      <div className="p-6 pt-4">{children}</div>
    </div>
  )

  return (
    <div className="space-y-5 fade-up">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPI_CARDS.map(({ label, value, display, color, bg, glow, icon }) => (
          <div
            key={label}
            className="rounded-2xl p-4 relative overflow-hidden"
            style={{
              background: bg,
              boxShadow: `0 8px 32px ${glow}`,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</p>
              <span style={{ color, opacity: 0.8 }}>{icon}</span>
            </div>
            <p className="font-black leading-none" style={{ color, fontFamily: 'var(--font-mono)', fontSize: display ? '1.4rem' : 'clamp(0.9rem, 2vw, 1.15rem)' }}>
              {display ?? formatFCFA(value!, settings.currency)}
            </p>
          </div>
        ))}
      </div>

      {/* Monthly bar chart — income vs expense */}
      {chartPanel('Entrées vs Sorties par mois', '12 derniers mois', (
        monthlyData.length === 0
          ? <p className="text-sm text-center py-10" style={{ color: 'rgba(255,255,255,0.3)' }}>Données insuffisantes</p>
          : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} barGap={6} barCategoryGap="28%">
                <defs>
                  <linearGradient id="incomeBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34D399" />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="expenseBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F87171" />
                    <stop offset="100%" stopColor="#DC2626" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatAmount}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)' }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip content={(props) => <DarkTooltip {...props} settings={settings} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="income" fill="url(#incomeBar)" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expense" fill="url(#expenseBar)" radius={[5, 5, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )
      ))}

      {/* Net per month — signed bar */}
      {monthlyData.length > 0 && chartPanel('Résultat net mensuel', 'Entrées moins sorties par période', (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData} barCategoryGap="40%">
            <defs>
              <linearGradient id="netPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#0284C7" stopOpacity={0.7} />
              </linearGradient>
              <linearGradient id="netNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#F87171" />
                <stop offset="100%" stopColor="#DC2626" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatAmount} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} width={42} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
            <Tooltip content={(props) => <DarkTooltip {...props} settings={settings} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar
              dataKey="net"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fill="url(#netPos)"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={false}
            >
              {monthlyData.map((entry, i) => (
                <Cell key={i} fill={entry.net >= 0 ? 'url(#netPos)' : 'url(#netNeg)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ))}

      {/* Balance evolution + Category donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Balance evolution area */}
        {chartPanel('Évolution du solde', 'Courbe cumulée au fil du temps', (
          balanceEvolution.length < 2
            ? <p className="text-sm text-center py-10" style={{ color: 'rgba(255,255,255,0.3)' }}>Données insuffisantes</p>
            : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={balanceEvolution}>
                  <defs>
                    <linearGradient id="balGradPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="balLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#818CF8" />
                      <stop offset="50%" stopColor="#38BDF8" />
                      <stop offset="100%" stopColor="#34D399" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={formatAmount} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                  <Tooltip content={(props) => <DarkTooltip {...props} settings={settings} />} cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="url(#balLine)"
                    strokeWidth={2.5}
                    fill="url(#balGradPos)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#38BDF8', stroke: '#0F172A', strokeWidth: 2, filter: 'url(#glow)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )
        ))}

        {/* Expenses donut */}
        {chartPanel('Dépenses par catégorie', 'Répartition des sorties', (
          categoryData.length === 0
            ? <p className="text-sm text-center py-10" style={{ color: 'rgba(255,255,255,0.3)' }}>Aucune dépense</p>
            : (
              <>
                <div className="flex items-center gap-4">
                  {/* Donut */}
                  <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          {PIE_PALETTE.map((p, i) => (
                            <filter key={i} id={`pieGlow${i}`}>
                              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                              <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                          ))}
                        </defs>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={72}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {categoryData.map((_, i) => (
                            <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length].fill} />
                          ))}
                        </Pie>
                        <Tooltip content={(props) => <PieTooltip {...props} settings={settings} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem', letterSpacing: '0.05em' }}>TOTAL</p>
                      <p style={{ color: 'white', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', marginTop: 2 }}>
                        {formatAmount(totalExpense)}
                      </p>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex-1 space-y-1.5 overflow-y-auto" style={{ maxHeight: 160 }}>
                    {categoryData.map(({ name, value }, i) => {
                      const pct = totalExpense > 0 ? (value / totalExpense) * 100 : 0
                      return (
                        <div key={name}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <div className="flex items-center gap-1.5">
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: PIE_PALETTE[i % PIE_PALETTE.length].fill, display: 'inline-block', flexShrink: 0 }} />
                              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem' }}>{name}</span>
                            </div>
                            <span style={{ color: PIE_PALETTE[i % PIE_PALETTE.length].fill, fontSize: '0.68rem', fontWeight: 700 }}>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div
                              className="h-1 rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: PIE_PALETTE[i % PIE_PALETTE.length].fill }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )
        ))}
      </div>

      {/* Expense vs Income comparison — horizontal bar */}
      {(totalIncome > 0 || totalExpense > 0) && (
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'linear-gradient(145deg, #0F172A, #1E293B)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
        >
          <h3 className="text-sm font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>Répartition globale</h3>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', marginBottom: 20 }}>Entrées vs sorties sur toute la période</p>
          <div className="space-y-4">
            {[
              { label: 'Entrées', value: totalIncome, color: '#34D399', glow: 'rgba(52,211,153,0.3)', total: totalIncome + totalExpense },
              { label: 'Sorties', value: totalExpense, color: '#F87171', glow: 'rgba(248,113,113,0.3)', total: totalIncome + totalExpense },
            ].map(({ label, value, color, glow, total }) => {
              const pct = total > 0 ? (value / total) * 100 : 0
              return (
                <div key={label}>
                  <div className="flex justify-between items-center mb-2">
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>{label}</span>
                    <div className="flex items-center gap-3">
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>{pct.toFixed(1)}%</span>
                      <span style={{ color, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {formatFCFA(value, settings.currency)}
                      </span>
                    </div>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-3 rounded-full transition-all duration-1000"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                        boxShadow: `0 0 12px ${glow}`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
