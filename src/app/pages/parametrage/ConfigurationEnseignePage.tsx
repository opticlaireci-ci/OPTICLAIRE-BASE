/**
 * CONFIGURATION DE L'ENSEIGNE (onboarding d'un nouveau client)
 *
 * Cet écran permet de rebaptiser l'installation courante et de repartir de zéro,
 * SANS toucher au code. Il s'adresse à un déploiement neuf destiné à un nouveau
 * client (ex. BOBOPTIQUE), dupliqué depuis OPTICLAIRE et branché sur une NOUVELLE
 * base Supabase.
 *
 * ⚠️ Utilisé sur l'installation de LECLAIRE, il REMPLACE le nom de LECLAIRE et
 * peut effacer ses données. À réserver à une copie neuve.
 */
import { useState } from 'react';
import { AlertTriangle, Plus, Trash2, Save, RotateCcw, Loader2, X, Building2, Eraser } from 'lucide-react';
import {
  TENANT,
  tenantConfigDefaut,
  tenantEstPersonnalise,
  enregistrerTenantConfig,
  reinitialiserTenantConfig,
  type TenantConfigModifiable,
} from '../../config/tenant';
import { reinitialiserDonnees, type ResetCible } from '../../services/resetService';
import { supabase } from '../../utils/supabaseClient';

/** Transforme un libellé de magasin en identifiant technique (minuscule, sans accent/espace). */
function versId(label: string): string {
  return (label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface MagasinLigne { id: string; label: string; }

export function ConfigurationEnseignePage() {
  // ── État du formulaire, initialisé sur la configuration actuelle ────────────
  const [nom, setNom] = useState(TENANT.nom);
  const [nomComplet, setNomComplet] = useState(TENANT.nomComplet);
  const [adresse, setAdresse] = useState(TENANT.siege.adresse);
  const [telephone, setTelephone] = useState(TENANT.siege.telephone);
  const [email, setEmail] = useState(TENANT.siege.email);
  const [ville, setVille] = useState(TENANT.siege.ville);
  const [emailProprietaire, setEmailProprietaire] = useState(TENANT.emailProprietaire);
  const [devise, setDevise] = useState(TENANT.devise);
  const [magasins, setMagasins] = useState<MagasinLigne[]>(
    TENANT.magasins.map(m => ({ id: m.id, label: m.label })),
  );

  const [saving, setSaving] = useState(false);

  // ── Réinitialisation des données métier ─────────────────────────────────────
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const MOT_CONFIRMATION = 'REINITIALISER';

  // ── Effacement complet des traces locales (cache + session) ─────────────────
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wiping, setWiping] = useState(false);
  const MOT_WIPE = 'EFFACER';

  const modifierMagasin = (index: number, label: string) => {
    setMagasins(prev => prev.map((m, i) => (i === index ? { ...m, label } : m)));
  };
  const supprimerMagasin = (index: number) => {
    setMagasins(prev => prev.filter((_, i) => i !== index));
  };
  const ajouterMagasin = () => {
    setMagasins(prev => [...prev, { id: '', label: '' }]);
  };

  const enregistrer = () => {
    if (!nom.trim()) { alert("Le nom de l'enseigne est obligatoire."); return; }
    const magNettoyes = magasins
      .map(m => ({ label: m.label.trim(), id: (m.id || versId(m.label)).trim() }))
      .filter(m => m.label && m.id)
      .map(m => ({ id: m.id, label: m.label.toUpperCase() }));
    if (magNettoyes.length === 0) { alert('Ajoutez au moins un magasin.'); return; }
    // Doublons d'identifiant → collision de données
    const ids = magNettoyes.map(m => m.id);
    if (new Set(ids).size !== ids.length) {
      alert('Deux magasins ont le même identifiant. Renommez-les pour les différencier.');
      return;
    }

    const cfg: TenantConfigModifiable = {
      nom: nom.trim().toUpperCase(),
      nomComplet: nomComplet.trim() || nom.trim().toUpperCase(),
      siege: {
        adresse: adresse.trim(),
        telephone: telephone.trim(),
        email: email.trim(),
        ville: ville.trim(),
      },
      emailProprietaire: emailProprietaire.trim().toLowerCase(),
      devise: devise.trim() || 'FCFA',
      magasins: magNettoyes,
    };

    const ok = window.confirm(
      `⚠️ Confirmez le changement d'enseigne.\n\n` +
      `L'application va être rebaptisée « ${cfg.nom} » et rechargée.\n` +
      `Le nouveau nom apparaîtra partout (menus, factures, reçus, écran de connexion).\n\n` +
      `N'utilisez ceci que sur une installation NEUVE destinée à ce client.`,
    );
    if (!ok) return;

    setSaving(true);
    try {
      enregistrerTenantConfig(cfg);
      alert(`✅ Enseigne enregistrée. L'application va se recharger sous le nom « ${cfg.nom} ».`);
      window.location.reload();
    } catch (e: any) {
      setSaving(false);
      alert('❌ Échec de l\'enregistrement : ' + (e?.message || e));
    }
  };

  const revenirParDefaut = () => {
    const def = tenantConfigDefaut();
    const ok = window.confirm(
      `Rétablir la configuration d'origine livrée avec le code (« ${def.nom} ») ?\n` +
      `L'application sera rechargée. Aucune donnée métier n'est supprimée.`,
    );
    if (!ok) return;
    reinitialiserTenantConfig();
    window.location.reload();
  };

  const lancerReset = async () => {
    if (resetConfirm.trim().toUpperCase() !== MOT_CONFIRMATION) {
      alert(`Tapez « ${MOT_CONFIRMATION} » pour confirmer.`);
      return;
    }
    setResetting(true);
    try {
      const cibles: ResetCible[] = ['ventes', 'reglements', 'clients'];
      const res = await reinitialiserDonnees(cibles);
      const total = res.reduce((s, r) => s + r.supprimes, 0);
      const erreurs = res.reduce((s, r) => s + r.erreurs, 0);
      setResetOpen(false);
      setResetConfirm('');
      alert(`✅ Données remises à zéro : ${total} enregistrement(s) supprimé(s)${erreurs ? ` — ${erreurs} erreur(s)` : ''}.`);
    } catch (e: any) {
      alert('❌ Échec de la réinitialisation : ' + (e?.message || e));
    } finally {
      setResetting(false);
    }
  };

  const lancerWipe = async () => {
    if (wipeConfirm.trim().toUpperCase() !== MOT_WIPE) {
      alert(`Tapez « ${MOT_WIPE} » pour confirmer.`);
      return;
    }
    setWiping(true);
    try {
      // 1. Fermer la session Supabase (supprime les tokens sb-* de ce navigateur).
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      // 2. Effacer TOUT le stockage local et de session (caches leclaire_*,
      //    config d'enseigne, préférences…). Les données serveur ne sont PAS
      //    touchées : elles vivent dans Supabase.
      try { localStorage.clear(); } catch { /* ignore */ }
      try { sessionStorage.clear(); } catch { /* ignore */ }
      // 3. Recharger sur une app vierge (écran de connexion).
      window.location.href = '/login';
    } catch (e: any) {
      setWiping(false);
      alert('❌ Échec de l\'effacement : ' + (e?.message || e));
    }
  };

  const label = 'text-xs text-gray-600 mb-1 block';
  const input = 'border border-gray-300 rounded px-3 py-2 text-sm w-full outline-none focus:border-blue-400 bg-white';

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 pb-3 flex items-center gap-2" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <Building2 size={22} className="text-blue-600" />
          <h1 className="text-xl font-semibold text-gray-800">Configuration de l'enseigne</h1>
        </div>

        {/* Avertissement principal */}
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex gap-3">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">À lire avant de modifier</p>
            <p>
              Cet écran <b>rebaptise l'installation courante</b>. À utiliser uniquement sur une
              <b> copie neuve</b> destinée à un nouveau client (nouvelle base Supabase),
              par exemple <b>BOBOPTIQUE</b>.
            </p>
            <p className="mt-1">
              Utilisé sur l'application de <b>{TENANT.nom}</b>, il remplacerait son nom et pourrait effacer ses données.
            </p>
            {tenantEstPersonnalise() && (
              <p className="mt-2 text-amber-700">
                ℹ️ Une personnalisation est déjà enregistrée sur ce navigateur.
              </p>
            )}
          </div>
        </div>

        {/* Formulaire d'identité */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Identité</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Nom de l'enseigne *</label>
              <input className={input} value={nom} onChange={e => setNom(e.target.value)} placeholder="BOBOPTIQUE" />
            </div>
            <div>
              <label className={label}>Nom complet</label>
              <input className={input} value={nomComplet} onChange={e => setNomComplet(e.target.value)} placeholder="BOBOPTIQUE OPTIQUE" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>E-mail du propriétaire (compte admin)</label>
              <input className={input} value={emailProprietaire} onChange={e => setEmailProprietaire(e.target.value)} placeholder="admin@boboptique.ci" />
            </div>
            <div>
              <label className={label}>Devise</label>
              <input className={input} value={devise} onChange={e => setDevise(e.target.value)} placeholder="FCFA" />
            </div>
          </div>

          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mt-2">Siège</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={label}>Adresse</label>
              <input className={input} value={adresse} onChange={e => setAdresse(e.target.value)} />
            </div>
            <div>
              <label className={label}>Téléphone</label>
              <input className={input} value={telephone} onChange={e => setTelephone(e.target.value)} />
            </div>
            <div>
              <label className={label}>E-mail</label>
              <input className={input} value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className={label}>Ville</label>
              <input className={input} value={ville} onChange={e => setVille(e.target.value)} />
            </div>
          </div>

          {/* Magasins */}
          <div className="flex items-center justify-between mt-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Magasins</h2>
            <button onClick={ajouterMagasin} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <Plus size={13} /> Ajouter un magasin
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {magasins.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={input}
                  value={m.label}
                  onChange={e => modifierMagasin(i, e.target.value)}
                  placeholder="Nom du magasin (ex. PLATEAU)"
                />
                <span className="text-xs text-gray-400 w-28 truncate" title="Identifiant technique">
                  {m.id || versId(m.label) || '—'}
                </span>
                <button onClick={() => supprimerMagasin(i)} className="text-red-500 hover:text-red-700 p-1">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {magasins.length === 0 && (
              <p className="text-xs text-gray-400 italic">Aucun magasin. Cliquez sur « Ajouter un magasin ».</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-gray-200">
            <button
              onClick={revenirParDefaut}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw size={16} />
              Rétablir l'origine
            </button>
            <button
              onClick={enregistrer}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Enregistrer et appliquer
            </button>
          </div>
        </div>

        {/* Zone dangereuse : repartir de zéro */}
        <div className="bg-white rounded-lg border border-red-200 p-5 mt-6">
          <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle size={16} /> Repartir de zéro
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            Efface définitivement <b>toutes les ventes/factures, devis/proforma, règlements et clients</b> de
            cette installation, sur tous les appareils. À faire avant de livrer l'app à un nouveau client.
          </p>
          <button
            onClick={() => { setResetConfirm(''); setResetOpen(true); }}
            className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
          >
            <Trash2 size={16} />
            Réinitialiser toutes les données
          </button>
        </div>

        {/* Effacer toute trace locale (cache navigateur + session) */}
        <div className="bg-white rounded-lg border border-gray-300 p-5 mt-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <Eraser size={16} /> Effacer toute trace sur ce navigateur
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            Déconnecte la session et efface <b>tout le cache local</b> de ce navigateur
            (données affichées, config d'enseigne, session Supabase). <b>Aucune donnée du
            serveur n'est supprimée.</b> Idéal pour repartir totalement à neuf sur une copie
            avant de démarrer un nouveau client.
          </p>
          <button
            onClick={() => { setWipeConfirm(''); setWipeOpen(true); }}
            className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gray-800 hover:bg-gray-900"
          >
            <Eraser size={16} />
            Effacer le cache et la session
          </button>
        </div>
      </div>

      {/* Modale de confirmation du reset */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-red-50">
              <span className="font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={18} /> Repartir de zéro</span>
              <button onClick={() => setResetOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                ⚠️ Action <b>irréversible</b> : ventes, devis, règlements et clients seront supprimés
                définitivement pour <b>tous les utilisateurs et tous les appareils</b>.
              </p>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Tapez <b>{MOT_CONFIRMATION}</b> pour confirmer</label>
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

      {/* Modale de confirmation de l'effacement local */}
      {wipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100">
              <span className="font-semibold text-gray-800 flex items-center gap-2"><Eraser size={18} /> Effacer toute trace locale</span>
              <button onClick={() => setWipeOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                Vous allez être <b>déconnecté</b> et tout le cache de ce navigateur sera effacé
                (données affichées, config d'enseigne, session). <b>Les données du serveur restent
                intactes</b> — vous les retrouverez en vous reconnectant.
              </p>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Tapez <b>{MOT_WIPE}</b> pour confirmer</label>
                <input
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full outline-none focus:border-gray-500"
                  value={wipeConfirm}
                  onChange={e => setWipeConfirm(e.target.value)}
                  placeholder={MOT_WIPE}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setWipeOpen(false)} disabled={wiping}
                className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
              <button onClick={lancerWipe} disabled={wiping || wipeConfirm.trim().toUpperCase() !== MOT_WIPE}
                className="px-4 py-2 rounded text-sm text-white font-semibold bg-gray-800 hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2">
                {wiping && <Loader2 size={14} className="animate-spin" />}
                Effacer et se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
