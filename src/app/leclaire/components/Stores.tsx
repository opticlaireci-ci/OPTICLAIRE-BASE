import { useState, useMemo } from 'react'
import type { Transaction, AppSettings, Shop } from '../types'
import { formatFCFA, formatDate, calcTotalIncome, calcTotalExpense, calcBalance } from '../outils'

interface Props {
  stores: Shop[]
  transactions: Transaction[]
  settings: AppSettings
  canManage: boolean
  onEdit: (t: Transaction) => void
  onAddStore: (name: string) => void
  onRenameStore: (id: string, name: string) => void
  onDeleteStore: (id: string) => void
  onReassign: (transactionIds: string[], storeId: string) => void
  onToast: (msg: string, type: 'success' | 'error') => void
}

const UNAFFILIATED = '__none__'

export default function Stores({
  stores, transactions, settings, canManage, onEdit,
  onAddStore, onRenameStore, onDeleteStore, onReassign, onToast,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Shop | null>(null)
  const [reassignTo, setReassignTo] = useState('')

  // Resolve the store a movement belongs to: prefer its storeId, but fall back
  // to matching by the store NAME captured at save time. This re-links movements
  // whose store was recreated with a new id (id changed, name stayed the same).
  const resolveStoreId = (t: Transaction): string => {
    if (t.storeId && stores.some((s) => s.id === t.storeId)) return t.storeId
    if (t.storeName) {
      const byName = stores.find((s) => s.name === t.storeName)
      if (byName) return byName.id
    }
    return UNAFFILIATED
  }

  // Aggregate per store
  const stats = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of transactions) {
      const key = resolveStoreId(t)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, stores])

  const unaffiliatedCount = stats.get(UNAFFILIATED)?.length ?? 0

  // ── Store detail view ──────────────────────────────────────────────────────
  if (selected) {
    const store = selected === UNAFFILIATED ? null : stores.find((s) => s.id === selected)
    const list = [...(stats.get(selected) ?? [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    const income = calcTotalIncome(list)
    const expense = calcTotalExpense(list)
    const balance = calcBalance(list)

    return (
      <div className="space-y-4 fade-up">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm font-semibold transition-colors"
          style={{ color: 'var(--color-blue)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Tous les magasins
        </button>

        {/* Header + summary */}
        <div className="rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #0B1D3A, #1E3A5F)' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(56,189,248,0.2)' }}>
              <svg className="w-5 h-5" fill="none" stroke="#38BDF8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 20v-6h6v6" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                {store ? store.name : 'Mouvements non affiliés'}
              </h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {list.length} mouvement{list.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Entrées', value: income, color: '#4ADE80' },
              { label: 'Sorties', value: expense, color: '#F87171' },
              { label: 'Solde', value: balance, color: '#38BDF8' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{s.label}</p>
                <p className="font-bold text-sm" style={{ fontFamily: 'var(--font-mono)', color: s.color }}>
                  {formatFCFA(s.value, settings.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bulk re-affiliation — only for orphaned movements, admins only */}
        {selected === UNAFFILIATED && canManage && list.length > 0 && stores.length > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-blue)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Ces mouvements ne sont rattachés à aucun magasin existant. Affectez-les à un magasin pour qu&apos;ils apparaissent dans son tableau.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none"
              >
                <option value="">Choisir un magasin…</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button
                onClick={() => {
                  if (!reassignTo) { onToast('Choisissez un magasin.', 'error'); return }
                  onReassign(list.map((t) => t.id), reassignTo)
                  onToast(`${list.length} mouvement${list.length !== 1 ? 's' : ''} réaffecté${list.length !== 1 ? 's' : ''}.`, 'success')
                  setReassignTo('')
                  setSelected(reassignTo)
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'var(--color-blue)' }}
              >
                Affecter les {list.length} mouvements
              </button>
            </div>
          </div>
        )}

        {/* Movements — mobile-friendly cards */}
        {list.length === 0 ? (
          <div className="bg-white rounded-2xl py-16 text-center text-sm" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', color: 'var(--color-muted)' }}>
            Aucun mouvement pour ce magasin.
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map((t) => {
              const income = t.type === 'income'
              return (
                <button
                  key={t.id}
                  onClick={() => onEdit(t)}
                  className="w-full text-left bg-white rounded-2xl p-4 flex items-center gap-3"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `3px solid ${income ? 'var(--color-income)' : 'var(--color-expense)'}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold" style={{
                        background: income ? 'var(--color-income-light)' : 'var(--color-expense-light)',
                        color: income ? 'var(--color-income)' : 'var(--color-expense)',
                      }}>
                        {income ? 'Entrée' : 'Sortie'}
                      </span>
                      <span className="num text-xs" style={{ color: 'var(--color-muted)' }}>{formatDate(t.date)}</span>
                    </div>
                    <p className="font-medium text-sm truncate" style={{ color: '#1E293B' }}>{t.description}</p>
                    <span className="inline-block text-[0.65rem] px-2 py-0.5 rounded-md mt-1" style={{ background: '#F1F5F9', color: 'var(--color-muted)' }}>{t.category}</span>
                  </div>
                  <span className="font-bold num text-sm flex-shrink-0" style={{ color: income ? 'var(--color-income)' : 'var(--color-expense)' }}>
                    {income ? '+' : '−'}{formatFCFA(t.amount, settings.currency)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Store list view ────────────────────────────────────────────────────────
  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    if (stores.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      onToast('Ce magasin existe déjà.', 'error')
      return
    }
    onAddStore(name)
    onToast(`Magasin "${name}" ajouté.`, 'success')
    setNewName('')
  }

  const submitRename = (id: string) => {
    const name = renameValue.trim()
    if (!name) return
    onRenameStore(id, name)
    onToast('Magasin renommé.', 'success')
    setRenaming(null)
  }

  return (
    <div className="space-y-4 fade-up">
      {/* Add store */}
      {canManage && (
        <div className="bg-white rounded-2xl p-5 flex flex-col sm:flex-row gap-3 sm:items-end" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="flex-1">
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
              Ajouter un magasin
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Ex : Magasin Marcory"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #0B1D3A, #152D58)', fontFamily: 'var(--font-display)' }}
          >
            + Ajouter
          </button>
        </div>
      )}

      {/* Store cards */}
      {stores.length === 0 && unaffiliatedCount === 0 ? (
        <div className="bg-white rounded-2xl py-20 text-center" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', color: 'var(--color-muted)' }}>
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 20v-6h6v6" />
          </svg>
          <p className="text-sm">Aucun magasin. Ajoutez-en un pour commencer.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => {
            const list = stats.get(store.id) ?? []
            const expense = calcTotalExpense(list)
            const income = calcTotalIncome(list)
            return (
              <div
                key={store.id}
                className="bg-white rounded-2xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 cursor-pointer group"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                onClick={() => setSelected(store.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-blue-light)' }}>
                      <svg className="w-5 h-5" fill="none" stroke="var(--color-blue)" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 20v-6h6v6" />
                      </svg>
                    </div>
                    {renaming === store.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitRename(store.id); if (e.key === 'Escape') setRenaming(null) }}
                        onBlur={() => submitRename(store.id)}
                        className="rounded-lg border border-border px-2 py-1 text-sm outline-none min-w-0"
                      />
                    ) : (
                      <div className="min-w-0">
                        <p className="font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>{store.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{list.length} mouvement{list.length !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                  </div>
                  {canManage && renaming !== store.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        title="Renommer"
                        onClick={(e) => { e.stopPropagation(); setRenaming(store.id); setRenameValue(store.name) }}
                        className="p-1.5 rounded-lg" style={{ color: 'var(--color-blue)', background: 'var(--color-blue-light)' }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button
                        title="Supprimer"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(store) }}
                        className="p-1.5 rounded-lg" style={{ color: 'var(--color-expense)', background: 'var(--color-expense-light)' }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-income-light)' }}>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--color-income)' }}>Entrées</p>
                    <p className="font-bold text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-income)' }}>{formatFCFA(income, settings.currency)}</p>
                  </div>
                  <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-expense-light)' }}>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--color-expense)' }}>Sorties</p>
                    <p className="font-bold text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-expense)' }}>{formatFCFA(expense, settings.currency)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--color-blue)' }}>
                  <span>Voir les dépenses</span>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </div>
              </div>
            )
          })}

          {/* Unaffiliated bucket */}
          {unaffiliatedCount > 0 && (
            <div
              className="bg-white rounded-2xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 cursor-pointer group border-2 border-dashed"
              style={{ borderColor: 'var(--color-border)' }}
              onClick={() => setSelected(UNAFFILIATED)}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#F1F5F9' }}>
                  <svg className="w-5 h-5" fill="none" stroke="var(--color-muted)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>Non affiliés</p>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{unaffiliatedCount} mouvement{unaffiliatedCount !== 1 ? 's' : ''} sans magasin</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--color-blue)' }}>
                <span>Voir les mouvements</span>
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--color-expense-light)' }}>
              <svg className="w-6 h-6" fill="none" stroke="var(--color-expense)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-center font-semibold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>
              Supprimer « {confirmDelete.name} » ?
            </h3>
            <p className="text-center text-sm mb-5" style={{ color: 'var(--color-muted)' }}>
              Le magasin sera supprimé. Ses mouvements seront conservés mais deviendront « non affiliés ».
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                Annuler
              </button>
              <button
                onClick={() => { onDeleteStore(confirmDelete.id); onToast('Magasin supprimé.', 'success'); setConfirmDelete(null) }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--color-expense)' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
