import { useState, useMemo } from 'react'
import type { Transaction, AppSettings, User } from '../types'
import { formatFCFA, formatDate, calcBalance, PAYMENT_METHODS } from '../outils'
import { ApercuFichier, BoutonTelecharger, aJustificatif } from './Fichier'

interface Props {
  transactions: Transaction[]
  settings: AppSettings
  onView: (t: Transaction) => void
  onAddIncome: () => void
  onAddExpense: () => void
  users?: User[]
  showAuthor?: boolean
  /** Administration : ouvrir l'import d'un fichier de mouvements. */
  onImport?: () => void
}

export default function Movements({ transactions, settings, onView, onAddIncome, onAddExpense, users = [], showAuthor = false, onImport }: Props) {
  const authorName = (userId: string) => users.find((u) => u.id === userId)?.name ?? 'Inconnu'
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [viewAttachment, setViewAttachment] = useState<Transaction | null>(null)

  const filtered = useMemo(() => {
    return [...transactions]
      .filter((t) => {
        if (filterType !== 'all' && t.type !== filterType) return false
        if (filterCategory && t.category !== filterCategory) return false
        if (filterPayment && t.paymentMethod !== filterPayment) return false
        if (filterDateFrom && t.date < filterDateFrom) return false
        if (filterDateTo && t.date > filterDateTo) return false
        if (search) {
          const q = search.toLowerCase()
          const match =
            t.description.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q) ||
            t.beneficiaryOrSource.toLowerCase().includes(q) ||
            String(t.amount).includes(q)
          if (!match) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, search, filterType, filterCategory, filterPayment, filterDateFrom, filterDateTo])

  const resetFilters = () => {
    setSearch('')
    setFilterType('all')
    setFilterCategory('')
    setFilterPayment('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const exportCSV = () => {
    // Colonnes « Magasin » (et « Personne » pour l'administration) en fin de
    // ligne : un fichier exporté se réimporte dans le bon magasin.
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = ['Date', 'Type', 'Description', 'Catégorie', 'Mode de paiement', 'Bénéficiaire/Source', 'Entrée', 'Sortie', 'Commentaire', 'Magasin', ...(showAuthor ? ['Personne'] : [])]
    const rows = filtered.map((t) => [
      t.date,
      t.type === 'income' ? 'Entrée' : 'Sortie',
      q(t.description),
      q(t.category),
      q(t.paymentMethod),
      q(t.beneficiaryOrSource),
      t.type === 'income' ? t.amount : '',
      t.type === 'expense' ? t.amount : '',
      q(t.comment ?? ''),
      q(t.storeName ?? ''),
      ...(showAuthor ? [q(users.find((u) => u.id === t.userId)?.name ?? '')] : []),
    ])
    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leclaire_mouvements_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => window.print()

  const runningBalance = (index: number) => {
    const sorted = [...filtered].reverse()
    let bal = calcBalance(transactions.filter((t) => !filtered.includes(t)))
    for (let i = 0; i <= index; i++) {
      bal += sorted[i].type === 'income' ? sorted[i].amount : -sorted[i].amount
    }
    return bal
  }

  const inputClass = "rounded-lg border border-border px-3 py-2 text-sm outline-none"

  return (
    <div className="space-y-4 fade-up">
      {/* Toolbar */}
      <div className="bg-white rounded-2xl p-5 space-y-3" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par description, catégorie, montant…"
              className={inputClass + ' w-full pl-9'}
            />
          </div>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className={inputClass}
          >
            <option value="all">Tous les types</option>
            <option value="income">Entrées</option>
            <option value="expense">Sorties</option>
          </select>

          {/* Category filter — derived from actual transactions */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={inputClass}
          >
            <option value="">Toutes catégories</option>
            {[...new Set(transactions.map((t) => t.category))].sort().map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs" style={{ color: 'var(--color-muted)' }}>Du</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={inputClass + ' text-xs'} />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs" style={{ color: 'var(--color-muted)' }}>Au</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={inputClass + ' text-xs'} />
            </div>
            <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className={inputClass + ' text-xs'}>
              <option value="">Tous modes</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex gap-2 sm:ml-auto flex-wrap">
            <button onClick={resetFilters} className="text-xs px-3 py-1.5 rounded-lg border border-border" style={{ color: 'var(--color-muted)' }}>
              Réinitialiser
            </button>
            <button onClick={exportCSV} className="text-xs px-3 py-1.5 rounded-lg border text-white" style={{ background: '#16A34A', borderColor: '#16A34A' }}>
              ↓ Excel / CSV
            </button>
            {onImport && (
              <button onClick={onImport} className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: '#16A34A', borderColor: '#16A34A' }} data-testid="lc-bouton-importer">
                ↑ Importer
              </button>
            )}
            <button onClick={handlePrint} className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: 'var(--color-navy)', borderColor: 'var(--color-border)' }}>
              🖨 Imprimer
            </button>
            <button onClick={onAddIncome} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ background: 'var(--color-income)' }}>
              + Entrée
            </button>
            <button onClick={onAddExpense} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ background: 'var(--color-expense)' }}>
              − Sortie
            </button>
          </div>
        </div>
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {filtered.length} mouvement{filtered.length !== 1 ? 's' : ''} affiché{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Movement cards — mobile-first, no horizontal scroll */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl py-20 text-center" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', color: 'var(--color-muted)' }}>
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Aucun mouvement trouvé</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {[...filtered].reverse().map((t, i) => {
            const bal = runningBalance(i)
            const income = t.type === 'income'
            return (
              <div
                key={t.id}
                onClick={() => onView(t)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(t) } }}
                className="bg-white rounded-2xl p-4 cursor-pointer transition-shadow hover:shadow-md"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `3px solid ${income ? 'var(--color-income)' : 'var(--color-expense)'}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: income ? 'var(--color-income-light)' : 'var(--color-expense-light)',
                          color: income ? 'var(--color-income)' : 'var(--color-expense)',
                        }}
                      >
                        {income ? 'Entrée' : 'Sortie'}
                      </span>
                      <span className="text-xs num" style={{ color: 'var(--color-muted)' }}>{formatDate(t.date)}</span>
                      {t.attachmentName && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewAttachment(t) }}
                          title={t.attachmentName}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-md"
                          style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)' }}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="font-semibold text-sm truncate" style={{ color: '#1E293B' }}>{t.description}</p>
                    {t.beneficiaryOrSource && (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-muted)' }}>{t.beneficiaryOrSource}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="inline-block text-[0.65rem] px-2 py-0.5 rounded-md" style={{ background: '#F1F5F9', color: 'var(--color-muted)' }}>
                        {t.category}
                      </span>
                      {showAuthor && (
                        <span className="inline-flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-md" style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)' }}>
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          {authorName(t.userId)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold num text-sm" style={{ color: income ? 'var(--color-income)' : 'var(--color-expense)' }}>
                      {income ? '+' : '−'}{formatFCFA(t.amount, settings.currency)}
                    </p>
                    <p className="text-[0.65rem] num mt-1" style={{ color: bal < 0 ? 'var(--color-expense)' : 'var(--color-muted)' }}>
                      Solde {formatFCFA(bal, settings.currency)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Attachment viewer */}
      {viewAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => e.target === e.currentTarget && setViewAttachment(null)}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-navy)', fontFamily: 'var(--font-display)' }}>
                {viewAttachment.attachmentName}
              </p>
              <div className="flex items-center gap-2">
                {aJustificatif(viewAttachment) && (
                  <BoutonTelecharger
                    t={viewAttachment}
                    className="text-xs px-3 py-1.5 rounded-lg text-white"
                    style={{ background: 'var(--color-blue)' }}
                  >
                    Télécharger
                  </BoutonTelecharger>
                )}
                <button onClick={() => setViewAttachment(null)} style={{ color: 'var(--color-muted)' }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <ApercuFichier t={viewAttachment} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
