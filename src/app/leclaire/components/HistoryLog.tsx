import { useMemo, useState } from 'react'
import type { AuditLog } from '../types'
import { formatDateTime, roleLabel } from '../outils'

interface Props {
  auditLogs: AuditLog[]
}

const actionLabels: Record<string, { label: string; color: string; bg: string }> = {
  CREATE_INCOME: { label: 'Entrée créée', color: 'var(--color-income)', bg: 'var(--color-income-light)' },
  CREATE_EXPENSE: { label: 'Sortie créée', color: 'var(--color-expense)', bg: 'var(--color-expense-light)' },
  UPDATE: { label: 'Mouvement modifié', color: 'var(--color-blue)', bg: 'var(--color-blue-light)' },
  DELETE: { label: 'Mouvement supprimé', color: '#F59E0B', bg: '#FEF3C7' },
  CREATE_STORE: { label: 'Magasin créé', color: '#0EA5E9', bg: '#E0F2FE' },
  RENAME_STORE: { label: 'Magasin renommé', color: '#0EA5E9', bg: '#E0F2FE' },
  DELETE_STORE: { label: 'Magasin supprimé', color: '#F59E0B', bg: '#FEF3C7' },
  CREATE_USER: { label: 'Compte créé', color: '#059669', bg: '#D1FAE5' },
  UPDATE_USER: { label: 'Compte modifié', color: 'var(--color-blue)', bg: 'var(--color-blue-light)' },
  DELETE_USER: { label: 'Compte supprimé', color: '#DC2626', bg: '#FEE2E2' },
  SETTINGS: { label: 'Paramètres', color: '#8B5CF6', bg: '#EDE9FE' },
  LOGIN: { label: 'Connexion', color: '#8B5CF6', bg: '#EDE9FE' },
  LOGOUT: { label: 'Déconnexion', color: '#64748B', bg: '#F1F5F9' },
}

export default function HistoryLog({ auditLogs }: Props) {
  const [search, setSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')

  const users = useMemo(
    () => [...new Set(auditLogs.map((l) => l.userName))].sort(),
    [auditLogs],
  )

  const sorted = useMemo(() => {
    return [...auditLogs]
      .filter((l) => {
        if (filterUser && l.userName !== filterUser) return false
        if (filterAction && l.action !== filterAction) return false
        if (search) {
          const q = search.toLowerCase()
          if (!l.description.toLowerCase().includes(q) && !l.userName.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [auditLogs, search, filterUser, filterAction])

  const exportCSV = () => {
    const headers = ['Date/Heure', 'Utilisateur', 'Rôle', 'Action', 'Détail']
    const rows = sorted.map((l) => [
      formatDateTime(l.createdAt),
      `"${l.userName.replace(/"/g, '""')}"`,
      l.userRole ? roleLabel(l.userRole) : '',
      actionLabels[l.action]?.label ?? l.action,
      `"${l.description.replace(/"/g, '""')}"`,
    ])
    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leclaire_tracabilite_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetFilters = () => { setSearch(''); setFilterUser(''); setFilterAction('') }
  const inputClass = 'rounded-lg border border-border px-3 py-2 text-sm outline-none bg-white'

  return (
    <div className="space-y-4 fade-up">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 space-y-3" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-muted)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par utilisateur ou détail…"
            className={inputClass + ' w-full pl-9'}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className={inputClass + ' text-xs flex-1 min-w-[120px]'}>
            <option value="">Tous les utilisateurs</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className={inputClass + ' text-xs flex-1 min-w-[120px]'}>
            <option value="">Toutes les actions</option>
            {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {sorted.length} action{sorted.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button onClick={resetFilters} className="text-xs px-3 py-1.5 rounded-lg border border-border" style={{ color: 'var(--color-muted)' }}>
              Réinitialiser
            </button>
            <button onClick={exportCSV} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ background: '#16A34A' }}>
              ↓ Exporter
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        {sorted.length === 0 ? (
          <div className="py-20 text-center" style={{ color: 'var(--color-muted)' }}>
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">Aucune action enregistrée</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {sorted.map((log) => {
              const meta = actionLabels[log.action] ?? { label: log.action, color: '#64748B', bg: '#F1F5F9' }
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3.5" style={{ borderColor: '#F1F5F9' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: meta.bg }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: meta.color }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: '#1E293B' }}>{log.userName}</span>
                      {log.userRole && (
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded" style={{ background: '#F1F5F9', color: 'var(--color-muted)' }}>
                          {roleLabel(log.userRole)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1" style={{ color: '#374151' }}>{log.description}</p>
                    <p className="text-[0.65rem] mt-1 num" style={{ color: 'var(--color-muted)' }}>
                      {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
