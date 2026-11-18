import { useState, type FormEvent } from 'react'
import type { AppSettings } from '../types'

interface Props {
  settings: AppSettings
  /** Enregistre ; renvoie false en cas d'échec. */
  onSave: (s: AppSettings) => Promise<boolean>
  onToast: (msg: string, type: 'success' | 'error') => void
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative flex-shrink-0 transition-colors duration-200"
      style={{ width: 44, height: 24, borderRadius: 12, background: value ? 'var(--color-blue)' : '#CBD5E1' }}
    >
      <span
        className="absolute top-0.5 bg-white rounded-full shadow transition-transform duration-200"
        style={{ width: 20, height: 20, left: 2, transform: value ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}

export default function Settings({ settings, onSave, onToast }: Props) {
  const [form, setForm] = useState<AppSettings>({ ...settings })
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (await onSave(form)) onToast('Paramètres enregistrés avec succès.', 'success')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "w-full rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none transition-all"

  return (
    <div className="max-w-2xl space-y-5 fade-up">
      <form onSubmit={handleSave} className="space-y-5">
        {/* General */}
        <div className="bg-white rounded-2xl p-6 space-y-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-blue-light)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-blue)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>
              Informations générales
            </h3>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
              Nom de l'entreprise
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              className={inputClass}
              placeholder="LECLAIRE"
              onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--color-blue)')}
              onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = '')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Symbole devise
              </label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className={inputClass}
                placeholder="FCFA"
                onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--color-blue)')}
                onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = '')}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Code ISO devise
              </label>
              <input
                type="text"
                value={form.currencyCode}
                onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))}
                className={inputClass}
                placeholder="XOF"
                onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--color-blue)')}
                onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = '')}
              />
            </div>
          </div>
        </div>

        {/* Rules */}
        <div className="bg-white rounded-2xl p-6 space-y-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#EDE9FE' }}>
              <svg className="w-4 h-4" fill="none" stroke="#7C3AED" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>
              Règles de gestion
            </h3>
          </div>

          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#1E293B' }}>Autoriser le découvert</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                Permet les sorties même si le solde est insuffisant
              </p>
            </div>
            <Toggle value={form.allowOverdraft} onChange={(v) => setForm((f) => ({ ...f, allowOverdraft: v }))} />
          </div>

          <div className="pt-4 border-t flex items-start justify-between gap-6" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#1E293B' }}>Justificatif obligatoire</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                Exige une pièce jointe pour chaque mouvement
              </p>
            </div>
            <Toggle value={form.requireAttachment} onChange={(v) => setForm((f) => ({ ...f, requireAttachment: v }))} />
          </div>
        </div>

        {/* Data info */}
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}
        >
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="#0369A1" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold mb-0.5" style={{ color: '#0369A1' }}>
              Données synchronisées via Supabase
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#0C4A6E' }}>
              Les données sont synchronisées entre appareils via <strong>Supabase</strong>. Chaque utilisateur ne voit que ses propres mouvements — seuls les admins ont accès à toutes les données. Justificatifs limités à 3 Mo par fichier.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #0B1D3A, #152D58)', fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </button>
      </form>

    </div>
  )
}
