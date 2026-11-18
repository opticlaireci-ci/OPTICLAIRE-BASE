import { useState } from 'react'
import type { Transaction, AppSettings, Shop, User } from '../types'
import { formatFCFA, formatDate, formatDateTime, roleLabel } from '../outils'
import { ApercuFichier, BoutonTelecharger, aJustificatif } from './Fichier'

interface Props {
  transaction: Transaction
  settings: AppSettings
  stores: Shop[]
  users: User[]
  canManage: boolean
  showAuthor: boolean
  onEdit: (t: Transaction) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function TransactionDetail({
  transaction: t, settings, stores, users, canManage, showAuthor, onEdit, onDelete, onClose,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewAttachment, setViewAttachment] = useState(false)
  const income = t.type === 'income'
  const accent = income ? 'var(--color-income)' : 'var(--color-expense)'
  const accentBg = income ? 'var(--color-income-light)' : 'var(--color-expense-light)'
  const storeName =
    stores.find((s) => s.id === t.storeId)?.name ??
    (t.storeName ? stores.find((s) => s.name === t.storeName)?.name ?? t.storeName : null) ??
    'Magasin supprimé'
  const authorName = users.find((u) => u.id === t.userId)?.name ?? 'Inconnu'
  const authorRole = users.find((u) => u.id === t.userId)?.role

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid #F1F5F9' }}>
      <span className="text-xs uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span className="text-sm font-medium text-right" style={{ color: '#1E293B' }}>{value}</span>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '95vh', fontFamily: 'var(--font-sans)' }}>
        {/* Drag handle — mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: '#CBD5E1' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 flex-shrink-0" style={{ background: accent }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {income
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />}
              </svg>
            </div>
            <div>
              <h2 className="text-white font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>
                Récapitulatif
              </h2>
              <p className="text-white/70 text-xs">{income ? 'Entrée' : 'Sortie'} · {formatDate(t.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {/* Amount hero */}
          <div className="rounded-2xl p-4 mb-4 text-center" style={{ background: accentBg }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: accent }}>Montant</p>
            <p className="text-2xl font-bold num" style={{ color: accent, fontFamily: 'var(--font-display)' }}>
              {income ? '+' : '−'}{formatFCFA(t.amount, settings.currency)}
            </p>
          </div>

          <Row label="Motif" value={t.description} />
          <Row label="Catégorie" value={t.category} />
          <Row label="Magasin" value={storeName} />
          <Row label="Mode de paiement" value={t.paymentMethod} />
          <Row label={income ? 'Source' : 'Bénéficiaire'} value={t.beneficiaryOrSource || '—'} />
          {showAuthor && (
            <Row label="Utilisateur" value={authorRole ? `${authorName} (${roleLabel(authorRole)})` : authorName} />
          )}
          {t.comment && <Row label="Commentaire" value={t.comment} />}
          <Row label="Enregistré le" value={formatDateTime(t.createdAt)} />
          {t.updatedAt && t.updatedAt !== t.createdAt && (
            <Row label="Modifié le" value={formatDateTime(t.updatedAt)} />
          )}

          {/* Attachment */}
          {t.attachmentName && (
            <div className="mt-4">
              <button
                onClick={() => setViewAttachment(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border"
                style={{ background: 'var(--color-blue-light)', borderColor: 'var(--color-blue)' + '40', color: 'var(--color-blue)' }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="text-xs font-medium truncate">{t.attachmentName}</span>
                <span className="text-xs ml-auto flex-shrink-0">Voir</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--color-muted)', background: '#F1F5F9' }}>
            Fermer
          </button>
          {canManage && (
            <>
              <button
                onClick={() => onEdit(t)}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ color: 'white', background: 'var(--color-blue)' }}
              >
                Modifier
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ color: 'var(--color-expense)', background: 'var(--color-expense-light)' }}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={(e) => e.target === e.currentTarget && setConfirmDelete(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--color-expense-light)' }}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-expense)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-center font-semibold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>
              Supprimer ce mouvement ?
            </h3>
            <p className="text-center text-sm mb-5" style={{ color: 'var(--color-muted)' }}>
              Cette action est irréversible. Le solde sera recalculé automatiquement.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                Annuler
              </button>
              <button onClick={() => { onDelete(t.id); setConfirmDelete(false); onClose() }} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--color-expense)' }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment viewer */}
      {viewAttachment && aJustificatif(t) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={(e) => e.target === e.currentTarget && setViewAttachment(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--color-navy)', fontFamily: 'var(--font-display)' }}>{t.attachmentName}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <BoutonTelecharger t={t} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--color-blue)' }}>
                  Télécharger
                </BoutonTelecharger>
                <button onClick={() => setViewAttachment(false)} style={{ color: 'var(--color-muted)' }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <ApercuFichier t={t} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
