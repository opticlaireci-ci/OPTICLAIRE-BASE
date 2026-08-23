import { logger } from '../utils/logger';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Monitor, Settings, Plus, Home, X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { getActiveMagasins } from '../constants/magasins';
import {
  ACCUEIL_CONTENT_KEY, readAccueilContent, saveAccueilContent, newAccueilBlock, type AccueilContent,
} from '../utils/accueilContent';
import { reinitialiserDonnees, type ResetCible } from '../services/resetService';
import { useAuth } from '../contexts/AuthContext';
import { TENANT } from '../config/tenant';

const ADMIN_ROLES = ['super_admin', 'admin', 'administrateur'];

export function EspaceAdministrateurPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Ces actions sensibles peuvent être déléguées : un admin les voit toujours,
  // sinon elles n'apparaissent que si la clé correspondante a été cochée pour
  // l'utilisateur (menuAccess) dans la Gestion des Utilisateurs.
  const isAdmin = ADMIN_ROLES.includes(user?.role || '');
  const menuAccess = user?.menuAccess || [];
  const peut = (key: string) => isAdmin || menuAccess.includes(key);
  const [magasins, setMagasins] = useState(() => getActiveMagasins());
  const [accueilOpen, setAccueilOpen] = useState(false);
  const [accueilForm, setAccueilForm] = useState<AccueilContent>(() => readAccueilContent());
  const [savingAccueil, setSavingAccueil] = useState(false);

  // ── Réinitialisation des données (zone dangereuse) ──────────────────────────
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCibles, setResetCibles] = useState<Record<ResetCible, boolean>>({ ventes: true, reglements: true, clients: false });
  const [resetMagasin, setResetMagasin] = useState<string>('__ALL__');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const MOT_CONFIRMATION = 'REINITIALISER';

  const toggleResetCible = (c: ResetCible) => setResetCibles(prev => ({ ...prev, [c]: !prev[c] }));

  const lancerReset = async () => {
    const cibles = (Object.keys(resetCibles) as ResetCible[]).filter(c => resetCibles[c]);
    if (cibles.length === 0) { alert('Sélectionnez au moins un type de données à réinitialiser.'); return; }
    if (resetConfirm.trim().toUpperCase() !== MOT_CONFIRMATION) { alert(`Tapez « ${MOT_CONFIRMATION} » pour confirmer.`); return; }
    setResetting(true);
    try {
      const res = await reinitialiserDonnees(cibles, resetMagasin === '__ALL__' ? undefined : resetMagasin);
      const total = res.reduce((s, r) => s + r.supprimes, 0);
      const erreurs = res.reduce((s, r) => s + r.erreurs, 0);
      setResetOpen(false);
      setResetConfirm('');
      alert(`✅ Réinitialisation terminée : ${total} enregistrement(s) supprimé(s)${erreurs ? ` — ${erreurs} erreur(s)` : ''}.`);
    } catch (e: any) {
      alert('❌ Échec de la réinitialisation : ' + (e?.message || e));
    } finally {
      setResetting(false);
    }
  };

  // Recharger les magasins actifs quand le composant monte
  useEffect(() => {
    const actifs = getActiveMagasins();
    logger.log('🏪 Magasins ACTIFS chargés:', actifs.length);
    console.table(actifs.map(m => ({ id: m.id, label: m.label, actif: m.actif })));
    setMagasins(actifs);
  }, []);

  const ouvrirAccueil = () => {
    setAccueilForm(readAccueilContent());
    setAccueilOpen(true);
  };

  const ajouterBloc = () => {
    setAccueilForm(f => ({ ...f, blocks: [...f.blocks, newAccueilBlock()] }));
  };

  const modifierBloc = (id: string, key: 'title' | 'message', value: string) => {
    setAccueilForm(f => ({
      ...f,
      blocks: f.blocks.map(b => (b.id === id ? { ...b, [key]: value } : b)),
    }));
  };

  const supprimerBloc = (id: string) => {
    setAccueilForm(f => ({ ...f, blocks: f.blocks.filter(b => b.id !== id) }));
  };

  const enregistrerAccueil = async () => {
    setSavingAccueil(true);
    try {
      await saveAccueilContent(accueilForm);
      window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key: ACCUEIL_CONTENT_KEY } }));
      setAccueilOpen(false);
      alert('✅ La page d\'accueil a été mise à jour pour tous les utilisateurs.');
    } catch {
      alert('❌ Erreur lors de l\'enregistrement.');
    } finally {
      setSavingAccueil(false);
    }
  };

  function ouvrirMagasin(idMagasin: string) {
    navigate(`/magasin/${idMagasin}/dashboard`);
  }

  function gererMagasin(idMagasin: string) {
    navigate(`/gerer-magasin?magasin=${idMagasin}`);
  }

  function gererListeMagasins() {
    navigate('/gestion-magasins');
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="mb-6 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e5e7eb' }}>
        <h1 className="text-xl font-semibold text-gray-800">Gestion Magasins</h1>
        <div className="flex items-center gap-2">
          {peut('action:personnaliser-accueil') && (
            <button
              onClick={ouvrirAccueil}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <Home size={18} />
              Personnaliser l'accueil
            </button>
          )}
          {peut('action:gerer-magasins') && (
            <button
              onClick={gererListeMagasins}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              <Plus size={18} />
              Gérer les Magasins
            </button>
          )}
          {peut('action:reinitialiser-donnees') && (
            <button
              onClick={() => { setResetConfirm(''); setResetOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              <AlertTriangle size={18} />
              Réinitialiser les données
            </button>
          )}
        </div>
      </div>

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-red-50">
              <span className="font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={18} /> Réinitialiser les données</span>
              <button onClick={() => setResetOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                ⚠️ Action <b>irréversible</b> et <b>partagée</b> : les données seront supprimées définitivement
                pour <b>tous les utilisateurs et tous les appareils</b>.
              </p>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Magasin concerné</label>
                <select
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full outline-none focus:border-red-400 bg-white"
                  value={resetMagasin}
                  onChange={e => setResetMagasin(e.target.value)}
                >
                  <option value="__ALL__">Tous les magasins</option>
                  {magasins.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="accent-red-600" checked={resetCibles.ventes} onChange={() => toggleResetCible('ventes')} />
                  Ventes / Factures et Devis / Proforma
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="accent-red-600" checked={resetCibles.reglements} onChange={() => toggleResetCible('reglements')} />
                  Règlements
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="accent-red-600" checked={resetCibles.clients} onChange={() => toggleResetCible('clients')} />
                  Liste des clients
                </label>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">
                  Tapez <b>{MOT_CONFIRMATION}</b> pour confirmer
                </label>
                <input
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full outline-none focus:border-red-400"
                  value={resetConfirm}
                  onChange={e => setResetConfirm(e.target.value)}
                  placeholder={MOT_CONFIRMATION}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setResetOpen(false)} disabled={resetting}
                className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
              <button onClick={lancerReset} disabled={resetting || resetConfirm.trim().toUpperCase() !== MOT_CONFIRMATION}
                className="px-4 py-2 rounded text-sm text-white font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {resetting && <Loader2 size={14} className="animate-spin" />}
                Réinitialiser définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      {accueilOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100">
              <span className="font-semibold text-gray-800">Personnaliser la page d'accueil</span>
              <button onClick={() => setAccueilOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                Ce contenu s'affiche sur la page d'accueil de <b>tous les utilisateurs</b> (synchronisé sur tous les appareils).
              </p>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Titre principal</label>
                <input
                  className="border border-gray-200 rounded px-3 py-2 text-sm w-full outline-none focus:border-blue-400"
                  value={accueilForm.title}
                  onChange={e => setAccueilForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={`Bienvenue dans votre espace ${TENANT.nom}`}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Message principal</label>
                <textarea
                  className="border border-gray-200 rounded px-3 py-2 text-sm w-full outline-none focus:border-blue-400"
                  rows={4}
                  value={accueilForm.message}
                  onChange={e => setAccueilForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Écrivez ici le message à afficher sur la page d'accueil…"
                />
              </div>

              {/* Blocs / annonces supplémentaires */}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <label className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Blocs supplémentaires</label>
                <button onClick={ajouterBloc} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                  <Plus size={13} /> Ajouter un bloc
                </button>
              </div>
              {accueilForm.blocks.length === 0 && (
                <p className="text-xs text-gray-400 italic">Aucun bloc. Cliquez sur « Ajouter un bloc » pour en créer un.</p>
              )}
              {accueilForm.blocks.map((b, i) => (
                <div key={b.id} className="border border-gray-200 rounded p-3 flex flex-col gap-2 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Bloc {i + 1}</span>
                    <button onClick={() => supprimerBloc(b.id)} className="text-red-500 hover:text-red-700 p-0.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm w-full outline-none focus:border-blue-400 bg-white"
                    value={b.title}
                    onChange={e => modifierBloc(b.id, 'title', e.target.value)}
                    placeholder="Titre du bloc"
                  />
                  <textarea
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm w-full outline-none focus:border-blue-400 bg-white"
                    rows={3}
                    value={b.message}
                    onChange={e => modifierBloc(b.id, 'message', e.target.value)}
                    placeholder="Contenu du bloc…"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setAccueilOpen(false)} disabled={savingAccueil}
                className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
              <button onClick={enregistrerAccueil} disabled={savingAccueil}
                className="px-4 py-2 rounded text-sm text-white font-semibold bg-blue-600 hover:bg-blue-700">
                {savingAccueil ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-5">
        {magasins.map((magasin) => {
          const accederUrl = `/magasin/${magasin.id}/dashboard`;
          const gererUrl = `/gerer-magasin?magasin=${magasin.id}`;

          return (
            <div
              key={magasin.id}
              className="flex flex-col items-center justify-between rounded-xl p-5 gap-5"
              style={{
                background: '#fff',
                border: '2px solid #000',
                width: 220,
                minHeight: 260,
              }}
            >
              <span className="text-gray-800 font-black text-sm text-center tracking-wide leading-tight">
                {magasin.label}
              </span>

              {/* Logo LeClaire avec contour noir */}
              <div
                style={{
                  width: 160,
                  height: 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '3px solid #000',
                  borderRadius: '12px',
                  padding: '8px',
                  backgroundColor: '#fff',
                }}
              >
                <img
                  src={TENANT.visuels.logo}
                  alt="LeClaire Logo"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <button
                  onClick={() => ouvrirMagasin(magasin.id)}
                  className="flex items-center gap-1.5 text-white text-xs font-medium px-2 py-1.5 rounded shadow active:scale-95 transition-all w-full justify-center"
                  style={{
                    background: '#000',
                    border: '2px solid #fff',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  <Monitor size={12} />
                  Accéder au Magasin
                </button>
                <button
                  onClick={() => gererMagasin(magasin.id)}
                  className="flex items-center gap-1.5 text-white text-xs font-medium px-2 py-1.5 rounded shadow active:scale-95 transition-all w-full justify-center"
                  style={{
                    background: '#000',
                    border: '2px solid #fff',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  <Settings size={12} />
                  Gérer le magasin
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
