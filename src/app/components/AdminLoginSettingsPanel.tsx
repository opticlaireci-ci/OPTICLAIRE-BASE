import { useState } from 'react';
import { useLiveData } from '../hooks/useLiveData';
import { LOGIN_SETTINGS_KEY, DEFAULT_LOGIN_SETTINGS } from '../constants/loginSettings';
import type { LoginSettings } from '../constants/loginSettings';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-bold text-gray-800 uppercase tracking-wide text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function AdminLoginSettingsPanel() {
  const [arr, save] = useLiveData<LoginSettings>(LOGIN_SETTINGS_KEY, [DEFAULT_LOGIN_SETTINGS] as any);
  const current: LoginSettings = { ...DEFAULT_LOGIN_SETTINGS, ...(arr?.[0] || {}) };
  const [draft, setDraft] = useState<LoginSettings | null>(null);
  const val = draft ?? current;
  const set = (patch: Partial<LoginSettings>) => setDraft({ ...val, ...patch });

  const enregistrer = () => { save([val] as any); setDraft(null); };
  const toggleNoel = () => { const next = { ...val, noelActif: !val.noelActif }; save([next] as any); setDraft(draft ? next : null); };

  const field = (label: string, key: keyof LoginSettings) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <input
        type="text"
        value={String(val[key] ?? '')}
        onChange={e => set({ [key]: e.target.value } as any)}
        className="px-3 py-2 rounded border border-gray-300 text-sm outline-none focus:border-blue-500"
      />
    </label>
  );

  return (
    <Panel title="Page de connexion — Personnalisation">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {field('Titre', 'titre')}
        {field('Sous-titre', 'sousTitre')}
        {field('Slogan', 'slogan')}
        {field('Pied de page', 'piedDePage')}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={enregistrer}
          disabled={!draft}
          className="px-4 py-2 rounded text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: '#1a56db' }}
        >
          Enregistrer les modifications
        </button>

        {/* Bouton Mode Noël : chapeau sur le logo + neige sur toute la page */}
        <button
          onClick={toggleNoel}
          className="px-4 py-2 rounded text-sm font-bold text-white flex items-center gap-2"
          style={{ backgroundColor: val.noelActif ? '#e11d2a' : '#6b7280' }}
        >
          {val.noelActif ? '🎅 Mode Noël : ACTIVÉ (cliquer pour désactiver)' : '🎄 Mode Noël : désactivé (cliquer pour activer)'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Le mode Noël ajoute un chapeau de Père Noël sur le logo et fait tomber la neige sur toute la page de connexion.
      </p>
    </Panel>
  );
}

