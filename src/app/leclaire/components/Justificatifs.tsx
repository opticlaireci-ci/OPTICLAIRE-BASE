import { useState } from 'react'
import type { Transaction, AppSettings } from '../types'
import { formatDate, formatFCFA } from '../outils'
import { ApercuFichier, BoutonTelecharger, Miniature, aJustificatif } from './Fichier'

interface Props {
  transactions: Transaction[]
  settings: AppSettings
  onEdit: (t: Transaction) => void
}

export default function Justificatifs({ transactions, settings, onEdit }: Props) {
  const [viewing, setViewing] = useState<Transaction | null>(null)

  const withAttachment = transactions.filter(aJustificatif)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {withAttachment.length} justificatif{withAttachment.length !== 1 ? 's' : ''} enregistré{withAttachment.length !== 1 ? 's' : ''}
        </p>
      </div>

      {withAttachment.length === 0 ? (
        <div className="bg-white rounded-xl border py-20 text-center" style={{ borderColor: 'var(--color-border)' }}>
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Aucun justificatif enregistré</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>Ajoutez des justificatifs lors de la saisie des mouvements</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {withAttachment.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {/* Preview */}
              <div
                className="h-36 flex items-center justify-center cursor-pointer relative"
                style={{ background: '#F8FAFC' }}
                onClick={() => setViewing(t)}
              >
                {t.attachmentType === 'application/pdf' ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#DC2626' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-medium" style={{ color: '#DC2626' }}>PDF</span>
                  </div>
                ) : (
                  <Miniature t={t} />
                )}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                  <span className="text-white text-xs font-medium bg-black/50 px-3 py-1 rounded-full">Voir</span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      background: t.type === 'income' ? 'var(--color-income-light)' : 'var(--color-expense-light)',
                      color: t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)',
                    }}
                  >
                    {t.type === 'income' ? 'Entrée' : 'Sortie'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{formatDate(t.date)}</span>
                </div>
                <p className="text-sm font-medium truncate mb-0.5" style={{ color: '#1E293B' }}>{t.description}</p>
                <p className="text-xs truncate mb-2" style={{ color: 'var(--color-muted)' }}>{t.attachmentName}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)', color: t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)' }}>
                    {t.type === 'income' ? '+' : '-'}{formatFCFA(t.amount, settings.currency)}
                  </span>
                  <div className="flex gap-1">
                    <BoutonTelecharger
                      t={t}
                      className="text-xs px-2 py-1 rounded-md"
                      style={{ color: 'var(--color-blue)', background: 'var(--color-blue-light)' }}
                    >
                      ↓
                    </BoutonTelecharger>
                    <button
                      onClick={() => onEdit(t)}
                      className="text-xs px-2 py-1 rounded-md"
                      style={{ color: 'var(--color-muted)', background: '#F1F5F9' }}
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Viewer */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => e.target === e.currentTarget && setViewing(null)}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-navy)', fontFamily: 'var(--font-display)' }}>
                  {viewing.description}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{viewing.attachmentName}</p>
              </div>
              <div className="flex items-center gap-2">
                <BoutonTelecharger
                  t={viewing}
                  className="text-xs px-3 py-1.5 rounded-lg text-white"
                  style={{ background: 'var(--color-blue)' }}
                >
                  Télécharger
                </BoutonTelecharger>
                <button onClick={() => setViewing(null)} style={{ color: 'var(--color-muted)' }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <ApercuFichier t={viewing} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
