import { useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useSeason } from '../contexts/SeasonContext';
import { EFFET_OPTIONS } from '../config/seasonModes';
import type { SeasonEffet } from '../config/seasonModes';
import { ImageWithFallback } from './figma/ImageWithFallback';

/**
 * Panneau de sélection du « mode festif » (moment de l'année). L'admin :
 *  • choisit le mode actif → change le logo (en-tête + connexion) et déclenche
 *    l'animation plein écran, partagé en temps réel via Supabase ;
 *  • ajoute ses propres logos (image + libellé + emoji + couleur + animation) ;
 *  • supprime les logos personnalisés qu'il a ajoutés.
 */
export function ModeFestifPanel() {
  const { mode, setMode, actif, setActif, modes, addMode, removeMode } = useSeason();
  const [showAdd, setShowAdd] = useState(false);

  // Formulaire d'ajout
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('🎉');
  const [couleur, setCouleur] = useState('#2563eb');
  const [effet, setEffet] = useState<SeasonEffet>('confettis');
  const [logo, setLogo] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setLabel(''); setEmoji('🎉'); setCouleur('#2563eb'); setEffet('confettis'); setLogo('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const valider = () => {
    if (!label.trim() || !logo) return;
    const id = `custom-${Date.now()}`;
    addMode({ id, label: label.trim(), emoji: emoji || '🎉', logo, couleur, effet });
    resetForm();
    setShowAdd(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="font-bold text-gray-800 uppercase text-sm">🎊 Mode festif — moments de l'année</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActif(!actif)}
            title={actif ? 'Désactiver les logos et animations' : 'Activer les logos et animations'}
            className="text-sm px-3 py-1.5 rounded border flex items-center gap-2"
            style={{
              borderColor: actif ? '#16a34a' : '#d1d5db',
              backgroundColor: actif ? '#f0fdf4' : '#f9fafb',
              color: actif ? '#16a34a' : '#6b7280',
              fontWeight: 600,
            }}
          >
            <span
              className="inline-block w-9 h-5 rounded-full relative transition-colors"
              style={{ backgroundColor: actif ? '#16a34a' : '#cbd5e1' }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all"
                style={{ left: actif ? '18px' : '2px' }}
              />
            </span>
            {actif ? 'Activé' : 'Désactivé'}
          </button>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="text-sm px-3 py-1.5 rounded border flex items-center gap-1"
            style={{ borderColor: '#16a34a', color: '#16a34a', backgroundColor: '#f0fdf4', fontWeight: 600 }}
          >
            {showAdd ? <X size={15} /> : <Plus size={15} />} {showAdd ? 'Fermer' : 'Ajouter un logo'}
          </button>
          <button
            onClick={() => setMode('aucun')}
            className="text-sm px-3 py-1.5 rounded border"
            style={{
              borderColor: mode === 'aucun' ? '#2563eb' : '#d1d5db',
              backgroundColor: mode === 'aucun' ? '#eff6ff' : '#fff',
              fontWeight: mode === 'aucun' ? 700 : 500,
            }}
          >
            Aucun (logo par défaut)
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="mb-5 rounded-lg border border-gray-200 p-4 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Libellé
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Fête du magasin"
                className="border rounded px-2 py-1.5 text-sm font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Emoji
              <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4}
                className="border rounded px-2 py-1.5 text-sm font-normal w-20" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Couleur
              <input type="color" value={couleur} onChange={e => setCouleur(e.target.value)}
                className="border rounded h-9 w-16 p-0.5" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Animation plein écran
              <select value={effet} onChange={e => setEffet(e.target.value as SeasonEffet)}
                className="border rounded px-2 py-1.5 text-sm font-normal">
                {EFFET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 sm:col-span-2">
              Logo (image)
              <input ref={fileRef} type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0])}
                className="text-sm font-normal" />
            </label>
          </div>
          <div className="flex items-center gap-3 mt-3">
            {logo && (
              <div className="w-14 h-14 rounded overflow-hidden border bg-white flex-shrink-0">
                <img src={logo} alt="aperçu" className="w-full h-full object-cover" />
              </div>
            )}
            <button
              onClick={valider}
              disabled={!label.trim() || !logo}
              className="text-sm px-4 py-2 rounded text-white font-semibold"
              style={{ backgroundColor: !label.trim() || !logo ? '#9ca3af' : '#16a34a', cursor: !label.trim() || !logo ? 'not-allowed' : 'pointer' }}
            >
              Enregistrer le logo
            </button>
          </div>
        </div>
      )}

      {!actif && (
        <p className="mb-3 text-xs text-gray-500 italic">
          Les logos et animations festifs sont désactivés — le logo par défaut est utilisé. Cliquez sur « Désactivé » pour réactiver.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" style={{ opacity: actif ? 1 : 0.5 }}>
        {modes.map(m => {
          const actif = mode === m.id;
          return (
            <div key={m.id} className="relative">
              {!m.builtin && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`Supprimer le logo « ${m.label} » ?`)) removeMode(m.id); }}
                  title="Supprimer ce logo"
                  className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button
                onClick={() => setMode(m.id)}
                className="w-full flex flex-col items-center gap-2 rounded-lg p-3 transition-all"
                style={{
                  border: actif ? `3px solid ${m.couleur}` : '1px solid #e5e7eb',
                  backgroundColor: actif ? `${m.couleur}14` : '#fff',
                  boxShadow: actif ? `0 2px 8px ${m.couleur}55` : 'none',
                }}
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white" style={{ border: '1px solid #eee' }}>
                  <ImageWithFallback src={m.logo} alt={m.label} className="w-full h-full object-cover" />
                </div>
                <span className="text-xs font-semibold text-center text-gray-700 leading-tight">
                  {m.emoji} {m.label}
                </span>
                {actif && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: m.couleur }}>
                    ● Activé
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
