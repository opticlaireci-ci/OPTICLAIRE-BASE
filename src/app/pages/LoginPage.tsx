import { logger } from '../utils/logger';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { User, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ServerStatusBanner } from '../components/ServerStatusBanner';
import { supabase, kvRestUrl, KV_TABLE_NAME, serverFetch } from '../utils/supabaseClient';
import { LOGIN_SETTINGS_KEY, DEFAULT_LOGIN_SETTINGS } from '../constants/loginSettings';
import type { LoginSettings } from '../constants/loginSettings';
import { useSeason } from '../contexts/SeasonContext';
import { publicAnonKey } from '../../../utils/supabase/info';
import { SeasonEffects } from '../components/SeasonEffects';
import { TENANT } from '../config/tenant';
import { validatePasswordStrength } from '../utils/passwordPolicy';

const HERO_IMAGE = TENANT.visuels.accueil;
const LOGO_IMAGE = TENANT.visuels.logo;

// Neige animée sur toute la page (flocons en position absolue, chute continue).
function SnowOverlay() {
  const flakes = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="snow-layer" aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, overflow: 'hidden' }}>
      {flakes.map(i => {
        const left = Math.random() * 100;
        const size = 4 + Math.random() * 8;
        const dur = 6 + Math.random() * 8;
        const delay = -Math.random() * 12;
        const drift = (Math.random() * 40 - 20).toFixed(0);
        return (
          <span
            key={i}
            style={{
              position: 'absolute', top: '-10px', left: `${left}%`,
              width: size, height: size, borderRadius: '50%', backgroundColor: '#fff',
              opacity: 0.85, boxShadow: '0 0 4px rgba(255,255,255,0.8)',
              // @ts-ignore variable CSS personnalisée
              '--drift': `${drift}px`,
              animation: `snow-fall ${dur}s linear ${delay}s infinite`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

function LoginForm() {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  // Paramètres personnalisables (modifiés depuis l'Administrateur). La page de
  // connexion n'est pas authentifiée : on lit le cache localStorage puis on
  // poll Supabase toutes les 30 s pour rester synchronisé entre appareils.
  const [settings, setSettings] = useState<LoginSettings>(() => {
    try {
      const raw = localStorage.getItem(LOGIN_SETTINGS_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      return { ...DEFAULT_LOGIN_SETTINGS, ...(Array.isArray(arr) ? arr[0] : arr) };
    } catch {
      return DEFAULT_LOGIN_SETTINGS;
    }
  });

  // Mode festif : si un mode est actif, son logo remplace automatiquement le
  // logo de connexion ; sinon on garde le logo par défaut (ou Noël historique).
  const { activeMode: season } = useSeason();
  const loginLogo = season?.logo ?? (settings.noelActif ? TENANT.visuels.logoNoel : LOGO_IMAGE);

  // Synchronisation cross-appareils : lecture anonyme Supabase + polling 30 s.
  // Le StorageEvent ne couvre que les onglets du même navigateur ; ce polling
  // garantit que mobile ET desktop voient les mêmes paramètres de connexion.
  useEffect(() => {
    async function fetchLoginSettings() {
      try {
        const url = kvRestUrl(LOGIN_SETTINGS_KEY);
        const res = await fetch(url, {
          headers: { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` },
        });
        if (!res.ok) return;
        const rows = await res.json();
        const v = Array.isArray(rows) && rows[0]?.value?.value;
        if (!Array.isArray(v) || !v[0]) return;
        const fresh = { ...DEFAULT_LOGIN_SETTINGS, ...v[0] };
        setSettings(fresh);
        try { localStorage.setItem(LOGIN_SETTINGS_KEY, JSON.stringify([v[0]])); } catch {}
      } catch {}
    }

    fetchLoginSettings();
    const timer = setInterval(fetchLoginSettings, 30_000);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOGIN_SETTINGS_KEY || !e.newValue) return;
      try {
        const arr = JSON.parse(e.newValue);
        setSettings({ ...DEFAULT_LOGIN_SETTINGS, ...(Array.isArray(arr) ? arr[0] : arr) });
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(timer); window.removeEventListener('storage', onStorage); };
  }, []);

  // ── Première installation : détecter si le propriétaire existe déjà ──────────
  const [needsSetup, setNeedsSetup] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState(TENANT.emailProprietaire ?? 'admin@leclaire.ci');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupDone, setSetupDone] = useState(false);

  // ── Détection « projet neuf » ───────────────────────────────────────────────
  // RÈGLE ABSOLUE : on n'affiche le formulaire de première installation que sur
  // une réponse REÇUE ET EXPLICITE disant « aucun propriétaire n'existe ». Toute
  // erreur (HTTP non-2xx, réseau, RLS, timeout) laisse l'écran de connexion
  // NORMAL. Auparavant un `!r.ok` retombait sur `[]`, donc le moindre hoquet
  // réseau ou refus RLS faisait apparaître l'écran de première installation sur
  // chaque navigateur, alors que le compte existait déjà.
  //
  // Source de vérité = /setup/status : l'edge function vérifie avec la clé
  // service_role qu'AU MOINS UN `user_meta` porte le rôle `super_admin`. C'est
  // fiable et indépendant du drapeau `app_data:initialized` (qui n'est écrit
  // qu'à la toute fin du bootstrap, et manquait donc si celui-ci avait échoué en
  // cours de route).
  useEffect(() => {
    let active = true;

    (async () => {
      // 1) Signal faisant autorité : l'edge function.
      try {
        const res = await serverFetch('/setup/status');
        if (!active) return;
        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (!active) return;
          if (json?.success === true && typeof json?.data?.initialized === 'boolean') {
            setNeedsSetup(json.data.initialized === false);
            if (json.data.ownerEmail) setOwnerEmail(json.data.ownerEmail);
            return;
          }
        }
      } catch (err) {
        logger.warn('⚠️ /setup/status injoignable, repli sur la lecture anonyme', err);
      }

      // 2) Repli si l'edge function est injoignable : drapeau app_data:initialized.
      //    Un drapeau présent prouve que l'app est installée. Son ABSENCE n'est
      //    concluante que si la requête a RÉUSSI (HTTP 200) : sinon on ne sait
      //    rien et on garde l'écran de connexion.
      try {
        const res = await fetch(kvRestUrl('initialized'), {
          headers: { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` },
        });
        if (!active) return;
        if (!res.ok) {
          logger.warn(`⚠️ Détection installation : HTTP ${res.status} — écran de connexion conservé`);
          return;
        }
        const rows = await res.json().catch(() => null);
        if (!active || !Array.isArray(rows)) return;
        setNeedsSetup(!(rows.length > 0 && rows[0]?.value?.initialized === true));
      } catch (err) {
        logger.warn('⚠️ Détection installation impossible — écran de connexion conservé', err);
      }
    })();

    return () => { active = false; };
  }, []);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      setSetupError('Adresse email invalide.');
      return;
    }
    const pwdError = validatePasswordStrength(setupPassword);
    if (pwdError) {
      setSetupError(pwdError);
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setSetupLoading(true);
    try {
      // 1. Créer le compte Supabase Auth
      let session = null as Awaited<ReturnType<typeof supabase.auth.signUp>>['data']['session'];
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: ownerEmail,
        password: setupPassword,
        options: { data: { nom: 'Propriétaire', prenom: TENANT.nom } },
      });

      if (signUpError) {
        // Cas de REPRISE : le compte Auth a déjà été créé lors d'une tentative
        // précédente qui a échoué APRÈS le signUp (typiquement à l'écriture des
        // droits). Supabase refuse alors « User already registered » et l'écran
        // d'installation deviendrait un cul-de-sac. On se connecte plutôt avec le
        // mot de passe saisi et on reprend l'installation à l'étape 2.
        const dejaInscrit = /already registered|already exists|User already/i
          .test(signUpError.message || '');
        if (!dejaInscrit) {
          setSetupError(`Erreur création compte : ${signUpError.message}`);
          return;
        }
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: setupPassword,
        });
        if (signInError || !signInData?.session) {
          setSetupError(
            `Le compte ${ownerEmail} existe déjà, mais la connexion a échoué : ` +
            `${signInError?.message || 'session absente'}.\n` +
            `Saisissez le mot de passe utilisé lors de la première tentative, ` +
            `ou supprimez ce compte dans Supabase Dashboard → Authentication → Users pour repartir de zéro.`
          );
          return;
        }
        session = signInData.session;
      } else {
        session = signUpData?.session ?? null;
      }

      // Pas de session → confirmation par email requise (désactivez-la dans Supabase Dashboard).
      if (!session) {
        setSetupError(
          '📧 Un email de confirmation a été envoyé à ' + ownerEmail + '.\n' +
          'Confirmez votre adresse puis revenez vous connecter.\n\n' +
          '💡 Pour éviter cette étape à l\'avenir : Supabase Dashboard → Authentication → Settings → désactivez « Confirm email ».'
        );
        return;
      }

      const uid = session.user.id;

      // 2. Écrire user_meta avec le rôle super_admin sur tous les magasins
      // N'écrire QUE `key` et `value` : la table KV provisionnée par Figma Make
      // n'a pas de colonne `updated_at` (PostgREST : « Could not find the
      // 'updated_at' column ... in the schema cache »), et l'edge function n'en a
      // pas besoin non plus — seule la table `app_data`, distincte, l'utilise pour
      // le pull incrémental.
      const { error: metaError } = await supabase.from(KV_TABLE_NAME).upsert({
        key: `user_meta:${uid}`,
        value: {
          user_id: uid,
          magasins: TENANT.magasins.map(m => ({ magasin_id: m.id, role: 'super_admin' })),
          permissions: [],
          menuAccess: [],
        },
      });

      if (metaError) {
        setSetupError(
          `Compte créé mais droits non enregistrés : ${metaError.message}. ` +
          `Vérifiez que le script setup-nouveau-projet.sql a bien été exécuté en entier dans Supabase Dashboard.`
        );
        return;
      }

      // 3. Marquer le projet comme initialisé
      // L'erreur DOIT être lue : sans ça un échec ici (grant/policy manquant sur
      // la clé `app_data:initialized`) passait inaperçu — le formulaire annonçait
      // « compte créé », basculait sur l'écran de connexion, et l'écran de
      // première installation réapparaissait au rechargement suivant.
      // ⚠️ NE PAS utiliser `.upsert()` ici : supabase-js émet alors
      // `INSERT ... ON CONFLICT DO UPDATE`, ce qui exige une policy UPDATE sur la
      // clé `app_data:initialized`. Or, par conception, cette clé n'a qu'une
      // policy INSERT (« écrite une seule fois, puis immuable côté client ») —
      // le chemin ON CONFLICT échoue donc en RLS (« new row violates row-level
      // security policy ») même quand la ligne n'existe pas encore. Un `.insert()`
      // simple correspond exactement à la policy INSERT existante.
      const { error: initErrorRaw } = await supabase.from(KV_TABLE_NAME).insert({
        key: 'app_data:initialized',
        value: { initialized: true },
      });

      // La clé existe déjà (23505) = projet déjà initialisé → on considère OK.
      const initError =
        initErrorRaw && (initErrorRaw as { code?: string }).code === '23505'
          ? null
          : initErrorRaw;

      if (initError) {
        setSetupError(
          `Compte et droits créés, mais le drapeau d'initialisation n'a pas pu être écrit : ` +
          `${initError.message}. Connectez-vous normalement — l'écran d'installation ` +
          `réapparaîtra tant que ce drapeau est absent.`,
        );
        setEmailOrUsername(ownerEmail);
        setPassword(setupPassword);
        return;
      }

      // Compte créé : basculer vers l'écran de connexion, pré-rempli.
      setSetupDone(true);
      setNeedsSetup(false);
      setEmailOrUsername(ownerEmail);
      setPassword(setupPassword);
    } catch (err) {
      logger.error('❌ Erreur bootstrap propriétaire:', err);
      setSetupError('Erreur inattendue. Vérifiez la console.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!emailOrUsername || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);

    try {
      // Ne pas logger l'identifiant saisi (email/nom d'utilisateur) en console.
      const result = await login(emailOrUsername, password);

      if (result.success) {
        logger.log('✅ Connexion réussie, redirection...');

        // Attendre que React soit synchronisé
        await new Promise(resolve => setTimeout(resolve, 200));

        const currentUser = JSON.parse(localStorage.getItem('leclaire_current_user') || 'null');

        if (currentUser) {
          // Administrateurs / directeurs / comptables → tableau de bord global
          // Conseillères / caissiers / employés → dashboard de leur magasin
          const adminRoles = ['super_admin', 'admin', 'administrateur', 'manager', 'directeur', 'comptable'];
          const isAdmin = adminRoles.includes(currentUser.role);
          const destination = currentUser.role === 'responsable_call_center'
            ? '/call-center/accueil'
            : isAdmin
              ? '/accueil'
              : currentUser.magasinActuel
                ? `/magasin/${currentUser.magasinActuel}/accueil`
                : '/accueil';

          logger.log('🚀 Redirection:', destination);
          navigate(destination, { replace: true });
        } else {
          setError('Erreur de chargement du profil utilisateur');
        }
      } else {
        const message = result.error || 'Connexion impossible. Réessayez dans un instant.';
        logger.warn('⚠️ Connexion échouée:', message);
        setError(message);
      }
    } catch (err) {
      logger.error('❌ Erreur connexion:', err);
      setError('Erreur de connexion au serveur. Vérifiez votre connexion internet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-auto" style={{ backgroundColor: '#0a1535' }}>
      <style>{`
        @keyframes rainbow {
          0%   { color: #ff4444; }
          16%  { color: #ff9900; }
          33%  { color: #ffe600; }
          50%  { color: #00e676; }
          66%  { color: #2979ff; }
          83%  { color: #d500f9; }
          100% { color: #ff4444; }
        }
        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.06); }
        }
        .motivational-text {
          animation: rainbow 3s linear infinite, pulse-scale 2s ease-in-out infinite;
          font-weight: 800;
          font-size: 0.8rem;
          text-align: center;
          letter-spacing: 0.06em;
          display: block;
        }
        @media (min-width: 640px) {
          .motivational-text { font-size: 0.95rem; }
        }
        @keyframes shimmer {
          0%   { opacity: 0.6; }
          50%  { opacity: 1; }
          100% { opacity: 0.6; }
        }
        .badge-shimmer { animation: shimmer 2.5s ease-in-out infinite; }
        @keyframes snow-fall {
          0%   { transform: translate(0, 0); }
          100% { transform: translate(var(--drift, 0px), 105vh); }
        }
      `}</style>

      {settings.noelActif && <SnowOverlay />}

      {/* Animations festives — UNIQUEMENT sur la page de connexion */}
      <SeasonEffects />

      {/* Background image — full screen */}
      <div className="absolute inset-0">
        <img
          src={HERO_IMAGE}
          alt={`Magasin ${TENANT.nom}`}
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center top' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 45%, rgba(10,21,53,0.88) 100%)' }}
        />
      </div>

      {/* Main layout: left panel + right image */}
      <div className="relative z-10 flex flex-col md:flex-row w-full" style={{ minHeight: '100vh' }}>

        {/* LEFT panel */}
        <div
          className="flex flex-col items-center w-full md:w-96 lg:w-[420px] px-6 md:px-10 pt-10 md:pt-0 pb-8 gap-4 md:justify-center md:min-h-screen"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(10,21,53,0.75) 100%)' }}
        >
          {/* Logo */}
          <div
            className="rounded-2xl shadow-2xl flex items-center justify-center bg-white"
            style={{ width: 124, height: 124, border: '3px solid rgba(255,255,255,0.5)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', position: 'relative' }}
          >
            {loginLogo ? (
              <img src={loginLogo} alt={`Logo ${TENANT.nomComplet}`} className="w-full h-full object-contain rounded-2xl" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a56db 60%, #0e3fa8 100%)' }}>
                <span className="text-white font-black text-2xl">LO</span>
              </div>
            )}
          </div>

          {/* Title banner */}
          <div
            className="flex flex-col items-center px-5 py-2.5 rounded-xl w-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <p
              className="text-white font-black uppercase text-center"
              style={{ fontSize: 'clamp(0.85rem, 4vw, 1.15rem)', letterSpacing: '0.1em', textShadow: '0 2px 8px rgba(0,0,0,0.9)', lineHeight: 1.6 }}
            >
              {settings.titre}
            </p>
            <span className="badge-shimmer text-white font-semibold tracking-widest mt-1 text-center" style={{ fontSize: '0.6rem', opacity: 0.75 }}>
              {settings.sousTitre}
            </span>
          </div>

          {/* Hero image strip — mobile only */}
          <div
            className="md:hidden w-full rounded-2xl overflow-hidden shadow-xl relative"
            style={{ height: 220, border: '1.5px solid rgba(255,255,255,0.2)' }}
          >
            <img
              src={HERO_IMAGE}
              alt={`Boutique ${TENANT.nomComplet}`}
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center 30%' }}
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
          </div>

          {/* Login card */}
          <div className="w-full rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'rgba(30,30,30,0.82)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.22)' }}>

            {/* Card header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderBottom: '2px solid #1a56db' }}
            >
              <span className="font-bold text-sm text-white">Connexion</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#1a56db', color: '#fff' }}>FR</span>
            </div>

            {/* Card body */}
            <div className="flex flex-col items-center gap-3 px-5 py-5">
              <span className="motivational-text">{settings.slogan}</span>

              <ServerStatusBanner />

              {setupDone && !needsSetup && (
                <div className="w-full rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857' }}>
                  ✅ Compte propriétaire créé. Connectez-vous ci-dessous.
                </div>
              )}

              {needsSetup ? (
                <div className="w-full flex flex-col gap-3">
                  <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'rgba(26,86,219,0.15)', border: '1px solid rgba(26,86,219,0.4)' }}>
                    <ShieldCheck size={18} className="shrink-0 mt-0.5" style={{ color: '#93c5fd' }} />
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                      <strong>Première installation.</strong> Créez le compte super administrateur pour accéder à tous les magasins.
                    </p>
                  </div>

                  {setupError && (
                    <div className="w-full rounded-lg px-4 py-3 text-sm whitespace-pre-line" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
                      {setupError}
                    </div>
                  )}

                  <form onSubmit={handleBootstrap} className="w-full flex flex-col gap-2.5">
                    {/* Email */}
                    <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.95)' }}>
                      <div className="flex items-center justify-center w-10 h-10 shrink-0" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #d1d5db' }}>
                        <User size={16} style={{ color: '#6b7280' }} />
                      </div>
                      <input
                        type="email"
                        placeholder="Email administrateur"
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        autoFocus
                        className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
                        style={{ color: '#111827' }}
                      />
                    </div>
                    <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.95)' }}>
                      <div className="flex items-center justify-center w-10 h-10 shrink-0" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #d1d5db' }}>
                        <Lock size={16} style={{ color: '#6b7280' }} />
                      </div>
                      <input
                        type="password"
                        placeholder="Nouveau mot de passe"
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
                        style={{ color: '#111827' }}
                      />
                    </div>
                    <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.95)' }}>
                      <div className="flex items-center justify-center w-10 h-10 shrink-0" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #d1d5db' }}>
                        <Lock size={16} style={{ color: '#6b7280' }} />
                      </div>
                      <input
                        type="password"
                        placeholder="Confirmer le mot de passe"
                        value={setupConfirm}
                        onChange={(e) => setSetupConfirm(e.target.value)}
                        className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
                        style={{ color: '#111827' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={setupLoading}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                      style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: '0 4px 16px rgba(5,150,105,0.4)', letterSpacing: '0.05em' }}
                    >
                      {setupLoading ? 'Création en cours…' : 'CRÉER LE COMPTE PROPRIÉTAIRE'}
                    </button>
                  </form>
                </div>
              ) : (
              <>
              {error && (
                <div className="w-full rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2.5">
                {/* Email ou Nom d'utilisateur */}
                <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.95)' }}>
                  <div className="flex items-center justify-center w-10 h-10 shrink-0" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #d1d5db' }}>
                    <User size={16} style={{ color: '#6b7280' }} />
                  </div>
                  <input
                    type="text"
                    placeholder="Email ou nom d'utilisateur"
                    value={emailOrUsername}
                    onChange={(e) => setEmailOrUsername(e.target.value)}
                    autoFocus
                    className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
                    style={{ color: '#111827' }}
                  />
                </div>

                {/* Password */}
                <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.95)' }}>
                  <div className="flex items-center justify-center w-10 h-10 shrink-0" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #d1d5db' }}>
                    <Lock size={16} style={{ color: '#6b7280' }} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
                    style={{ color: '#111827' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="flex items-center justify-center w-10 h-10 shrink-0 transition-colors hover:bg-gray-100"
                    style={{ borderLeft: '1px solid #d1d5db' }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} style={{ color: '#6b7280' }} /> : <Eye size={15} style={{ color: '#6b7280' }} />}
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                  style={{ background: 'linear-gradient(135deg, #1a56db 0%, #0e3fa8 100%)', boxShadow: '0 4px 16px rgba(26,86,219,0.4)', letterSpacing: '0.05em' }}
                >
                  {loading ? 'Connexion en cours...' : 'SE CONNECTER'}
                </button>
              </form>
              </>
              )}
            </div>

            {/* Card footer */}
            <div className="px-5 py-3 flex items-center justify-center" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <p className="text-center" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', letterSpacing: '0.03em' }}>
                {settings.piedDePage}
              </p>
            </div>

          </div>{/* end login card */}
        </div>{/* end LEFT panel */}

        {/* RIGHT panel — desktop only */}
        <div className="hidden md:block flex-1 relative">
          <img
            src={HERO_IMAGE}
            alt={`Boutique ${TENANT.nomComplet}`}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: 'center 30%' }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(10,21,53,0.35) 0%, transparent 40%)' }} />
        </div>

      </div>{/* end main layout */}
    </div>
  );
}

export function LoginPage() {
  return <LoginForm />;
}
