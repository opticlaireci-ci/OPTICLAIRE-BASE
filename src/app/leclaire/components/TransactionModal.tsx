import { useState, useRef, useEffect, type ChangeEvent, type FormEvent } from 'react'
import type { Transaction, TransactionType, PaymentMethod, AppSettings, Shop, User } from '../types'
import { PAYMENT_METHODS, formatFCFA, roleLabel } from '../outils'

interface Props {
  mode: 'income' | 'expense'
  editing?: Transaction
  settings: AppSettings
  currentBalance: number
  categories: string[]
  stores: Shop[]
  /** Enregistre ; renvoie false si l'enregistrement a échoué (le formulaire reste ouvert). */
  onSave: (data: Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, assignedUserId?: string) => Promise<boolean> | boolean | void
  onNewCategory: (cat: string) => void
  onClose: () => void
  readOnly?: boolean
  // When an admin is recording, they may assign the movement to a specific user.
  canAssign?: boolean
  users?: User[]
  defaultUserId?: string
}

const today = () => new Date().toISOString().split('T')[0]

// ── inline combobox ──────────────────────────────────────────────────────────
function CategoryCombobox({
  value,
  onChange,
  categories,
  onNewCategory,
  accentColor,
}: {
  value: string
  onChange: (v: string) => void
  categories: string[]
  onNewCategory: (v: string) => void
  accentColor: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = categories.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
  const exactMatch = categories.some((c) => c.toLowerCase() === query.toLowerCase())
  const showCreate = query.trim().length > 0 && !exactMatch

  function select(cat: string) {
    onChange(cat)
    setQuery(cat)
    setOpen(false)
  }

  function create() {
    const cat = query.trim()
    if (!cat) return
    onNewCategory(cat)
    onChange(cat)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={(e) => { setOpen(true); (e.target as HTMLInputElement).style.borderColor = accentColor }}
        onBlur={(e) => (e.target.style.borderColor = '')}
        placeholder="Catégorie…"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-all"
        style={{ caretColor: accentColor }}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || showCreate) && (
        <div
          className="absolute z-30 left-0 right-0 mt-1 rounded-xl overflow-hidden"
          style={{ background: 'white', border: '1px solid var(--color-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto' }}
        >
          {filtered.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={() => select(c)}
              className="w-full text-left px-3 py-2 text-sm transition-colors"
              style={{ color: '#1E293B' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#F8FAFC')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
            >
              {c}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onMouseDown={create}
              className="w-full text-left px-3 py-2 text-sm font-semibold flex items-center gap-2 transition-colors"
              style={{ color: accentColor, borderTop: filtered.length > 0 ? '1px solid #F1F5F9' : 'none' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#F8FAFC')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Créer : &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── main modal ───────────────────────────────────────────────────────────────
export default function TransactionModal({
  mode, editing, settings, currentBalance, categories, stores, onSave, onNewCategory, onClose, readOnly = false,
  canAssign = false, users = [], defaultUserId = '',
}: Props) {
  const isIncome = mode === 'income'
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [date, setDate] = useState(editing?.date ?? today())
  const [description, setDescription] = useState(editing?.description ?? '')
  const [storeId, setStoreId] = useState(editing?.storeId ?? (stores[0]?.id ?? ''))
  const [assignedUserId, setAssignedUserId] = useState(editing?.userId ?? defaultUserId)
  const [category, setCategory] = useState(editing?.category ?? (categories[0] ?? 'Autre'))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(editing?.paymentMethod ?? 'Espèces')
  const [beneficiaryOrSource, setBeneficiaryOrSource] = useState(editing?.beneficiaryOrSource ?? '')
  const [comment, setComment] = useState(editing?.comment ?? '')
  const [attachmentName, setAttachmentName] = useState(editing?.attachmentName)
  const [attachmentData, setAttachmentData] = useState(editing?.attachmentData)
  const [attachmentType, setAttachmentType] = useState(editing?.attachmentType)
  // Justificatif déjà enregistré (espace « leclaire-justificatifs ») : gardé tant qu'il n'est ni retiré ni remplacé.
  const [attachmentPath, setAttachmentPath] = useState(editing?.attachmentPath)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    if (!allowed.includes(file.type)) { setError('Format non accepté. Utilisez JPG, PNG ou PDF.'); return }
    if (file.size > 3 * 1024 * 1024) { setError('Fichier trop volumineux (max 3 Mo).'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAttachmentData(ev.target?.result as string)
      setAttachmentName(file.name)
      setAttachmentType(file.type)
      setAttachmentPath(undefined)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount.replace(/\s/g, '').replace(',', '.'))
    if (!amt || amt <= 0) { setError('Le montant doit être supérieur à 0.'); return }
    if (!description.trim()) { setError('La description est obligatoire.'); return }
    if (!date) { setError('La date est obligatoire.'); return }
    if (!category.trim()) { setError('La catégorie est obligatoire.'); return }
    if (!storeId) { setError('Veuillez sélectionner un magasin.'); return }
    if (canAssign && !assignedUserId) { setError('Veuillez choisir un utilisateur à qui affecter ce mouvement.'); return }

    if (mode === 'expense' && !settings.allowOverdraft) {
      const newBalance = currentBalance - amt + (editing?.type === 'expense' ? (editing?.amount ?? 0) : 0)
      if (newBalance < 0) { setError(`Solde insuffisant. Disponible : ${formatFCFA(currentBalance, settings.currency)}`); return }
    }
    if (settings.requireAttachment && !attachmentData && !attachmentPath) { setError('Un justificatif est obligatoire.'); return }

    setSaving(true)
    try {
      await onSave({
        type: mode as TransactionType,
        amount: amt,
        date,
        storeId,
        storeName: stores.find((s) => s.id === storeId)?.name,
        description: description.trim(),
        category: category.trim(),
        paymentMethod,
        beneficiaryOrSource: beneficiaryOrSource.trim(),
        comment: comment.trim(),
        attachmentName,
        attachmentData,
        attachmentType,
        attachmentPath,
      }, canAssign ? assignedUserId : undefined)
    } finally {
      setSaving(false)
    }
  }

  const accentColor = isIncome ? 'var(--color-income)' : 'var(--color-expense)'
  const accentBg = isIncome ? 'var(--color-income-light)' : 'var(--color-expense-light)'
  const fieldClass = 'w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-all'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '95vh', fontFamily: 'var(--font-sans)' }}
      >
        {/* Drag handle — mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: '#CBD5E1' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 flex-shrink-0" style={{ background: accentColor }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              {isIncome
                ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                : <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
              }
            </div>
            <div>
              <h2 className="text-white font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>
                {readOnly ? 'Détails du mouvement' : editing ? 'Modifier' : isIncome ? 'Nouvelle entrée' : 'Nouvelle sortie'}
              </h2>
              <p className="text-white/70 text-xs">{readOnly ? 'Consultation seule' : isIncome ? 'Enregistrer un argent reçu' : 'Enregistrer une dépense'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <fieldset disabled={readOnly} className="px-5 sm:px-6 py-5 space-y-4 border-0 m-0 min-w-0">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: 'var(--color-expense-light)', color: 'var(--color-expense)' }}>
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  Montant ({settings.currency}) *
                </label>
                <input
                  type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="0" min="1" step="any" className={fieldClass}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }} required
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  Date *
                </label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className={fieldClass} required
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                {isIncome ? 'Motif / description *' : 'Motif de la dépense *'}
              </label>
              <input
                type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={isIncome ? 'Ex : Vente de marchandises' : 'Ex : Achat fournitures bureau'}
                className={fieldClass} required
                onFocus={(e) => (e.target.style.borderColor = accentColor)}
                onBlur={(e) => (e.target.style.borderColor = '')}
              />
            </div>

            {/* Store */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Magasin *
              </label>
              <select
                value={storeId} onChange={(e) => setStoreId(e.target.value)}
                className={fieldClass} required
                onFocus={(e) => (e.target.style.borderColor = accentColor)}
                onBlur={(e) => (e.target.style.borderColor = '')}
              >
                {stores.length === 0 && <option value="">Aucun magasin — créez-en un</option>}
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Assign to a user — admins only */}
            {canAssign && (
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  Affecter à l&apos;utilisateur *
                </label>
                <select
                  value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}
                  className={fieldClass}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                >
                  {users.length === 0 && <option value="">Aucun utilisateur</option>}
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} — {roleLabel(u.role)}</option>
                  ))}
                </select>
                <p className="text-[0.65rem] mt-1" style={{ color: 'var(--color-muted)' }}>
                  Ce mouvement apparaîtra dans les données de l&apos;utilisateur sélectionné.
                </p>
              </div>
            )}

            {/* Category (combobox) + Payment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  Catégorie
                </label>
                <CategoryCombobox
                  value={category}
                  onChange={setCategory}
                  categories={categories}
                  onNewCategory={onNewCategory}
                  accentColor={accentColor}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                  Mode de paiement
                </label>
                <select
                  value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className={fieldClass}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                >
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Beneficiary */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                {isIncome ? 'Personne ou source' : 'Bénéficiaire / fournisseur'}
              </label>
              <input
                type="text" value={beneficiaryOrSource} onChange={(e) => setBeneficiaryOrSource(e.target.value)}
                placeholder={isIncome ? 'Ex : Client Kofi Diallo' : 'Ex : Fournisseur Traoré'}
                className={fieldClass}
                onFocus={(e) => (e.target.style.borderColor = accentColor)}
                onBlur={(e) => (e.target.style.borderColor = '')}
              />
            </div>

            {/* Comment */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Commentaire
              </label>
              <textarea
                value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Informations complémentaires…" rows={2}
                className={fieldClass} style={{ resize: 'none' }}
                onFocus={(e) => (e.target.style.borderColor = accentColor)}
                onBlur={(e) => (e.target.style.borderColor = '')}
              />
            </div>

            {/* Attachment */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Justificatif {settings.requireAttachment ? '*' : '(facultatif)'}
              </label>
              {attachmentName ? (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border" style={{ background: accentBg, borderColor: accentColor + '40' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: accentColor }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="text-xs font-medium truncate" style={{ color: accentColor }}>{attachmentName}</span>
                  </div>
                  <button type="button" onClick={() => { setAttachmentName(undefined); setAttachmentData(undefined); setAttachmentType(undefined); setAttachmentPath(undefined); if (fileRef.current) fileRef.current.value = '' }} className="text-xs flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
                    Supprimer
                  </button>
                </div>
              ) : (
                <button
                  type="button" onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed text-sm transition-colors"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = accentColor; (e.currentTarget as HTMLElement).style.color = accentColor }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-muted)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Photo, image ou PDF (max 3 Mo)
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,application/pdf" className="hidden" onChange={handleFile} capture="environment" />
            </div>
          </fieldset>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ color: 'var(--color-muted)', background: '#F1F5F9' }}>
              {readOnly ? 'Fermer' : 'Annuler'}
            </button>
            {!readOnly && (
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60" style={{ background: accentColor, fontFamily: 'var(--font-display)' }}>
                {saving ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
