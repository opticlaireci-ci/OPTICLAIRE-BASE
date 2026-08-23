import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveData } from '../hooks/useLiveData';
import { useAuth } from './AuthContext';
import { publicAnonKey } from '../../../utils/supabase/info';
import { kvRestUrl } from '../utils/supabaseClient';
import { SEASON_MODES } from '../config/seasonModes';
import type { SeasonId, SeasonMode } from '../config/seasonModes';

/**
 * Mode festif global (« moment de l'année ») partagé en temps réel avec tous les
 * postes/magasins via Supabase. Le mode choisi change le logo affiché dans
 * l'en-tête + la page de connexion, et déclenche une animation plein écran.
 *
 *  • `leclaire_mode_festif`  → id du mode actif (un objet { mode }).
 *  • `leclaire_modes_custom` → liste des logos personnalisés ajoutés par l'admin.
 *
 * IMPORTANT : la synchronisation cloud n'est activée QUE lorsqu'un utilisateur
 * est connecté. Avant connexion (page de login), on se contente du cache local
 * pour éviter des appels Supabase « session absente » (NO_SESSION / 401).
 */

const KEY = 'leclaire_mode_festif';
const CUSTOM_KEY = 'leclaire_modes_custom';

// Lecture ANONYME (sans session) du store partagé, pour que la page de connexion
// affiche le MÊME mode/logo/animation que les autres appareils, même avant toute
// authentification. Lecture seule ; en cas d'échec (RLS/réseau) on garde le cache
// local. Le store KV Supabase expose les documents `app_data` sous la clé
// `app_data:<clé>` avec une valeur `{ value: [...] }`.
async function lireAnon<T>(cle: string): Promise<T[] | null> {
  try {
    // fetch BRUT vers PostgREST avec la clé anon EXPLICITE : on évite que
    // supabase-js attache un éventuel jeton de session périmé (qui provoquerait
    // un 401 au lieu d'une lecture anonyme). Lecture seule, échec silencieux.
    const url = kvRestUrl(cle);
    const res = await fetch(url, {
      headers: { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const v = Array.isArray(rows) && rows[0]?.value?.value;
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}

interface SeasonCtx {
  mode: SeasonId;
  setMode: (m: SeasonId) => void;
  actif: boolean;                   // interrupteur global logos + animations
  setActif: (v: boolean) => void;
  modes: SeasonMode[];              // intégrés + personnalisés
  activeMode: SeasonMode | undefined;
  addMode: (m: SeasonMode) => void;
  removeMode: (id: SeasonId) => void;
}

const Ctx = createContext<SeasonCtx>({
  mode: 'aucun',
  setMode: () => {},
  actif: true,
  setActif: () => {},
  modes: SEASON_MODES,
  activeMode: undefined,
  addMode: () => {},
  removeMode: () => {},
});

function buildValue(
  mode: SeasonId,
  setMode: (m: SeasonId) => void,
  actif: boolean,
  setActif: (v: boolean) => void,
  custom: SeasonMode[],
  setCustom: (list: SeasonMode[]) => void,
): SeasonCtx {
  const modes = [...SEASON_MODES, ...custom];
  // Si la fonctionnalité est désactivée : aucun logo festif, aucune animation
  // (l'app retombe sur le logo par défaut).
  const activeMode = actif ? modes.find(m => m.id === mode) : undefined;
  const addMode = (m: SeasonMode) => setCustom([...custom.filter(c => c.id !== m.id), m]);
  const removeMode = (id: SeasonId) => {
    setCustom(custom.filter(c => c.id !== id));
    if (mode === id) setMode('aucun');
  };
  return { mode, setMode, actif, setActif, modes, activeMode, addMode, removeMode };
}

// Variante connectée : lit/écrit dans Supabase en temps réel.
function LiveSeason({ children }: { children: React.ReactNode }) {
  const [rows, save] = useLiveData<{ mode: SeasonId; actif?: boolean }>(KEY, [{ mode: 'aucun', actif: true }]);
  const [custom, saveCustom] = useLiveData<SeasonMode>(CUSTOM_KEY, []);
  const mode = rows[0]?.mode ?? 'aucun';
  const actif = rows[0]?.actif !== false; // activé par défaut
  const setMode = useCallback((m: SeasonId) => save([{ mode: m, actif }]), [save, actif]);
  const setActif = useCallback((v: boolean) => save([{ mode, actif: v }]), [save, mode]);
  const value = useMemo(
    () => buildValue(mode, setMode, actif, setActif, custom, saveCustom),
    [mode, setMode, actif, setActif, custom, saveCustom],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Variante hors-ligne : cache local uniquement (aucun appel réseau).
function LocalSeason({ children }: { children: React.ReactNode }) {
  const readRow = () => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      return null;
    }
  };
  const [mode, setModeState] = useState<SeasonId>(() => readRow()?.mode ?? 'aucun');
  const [actif, setActifState] = useState<boolean>(() => readRow()?.actif !== false);
  const [custom, setCustomState] = useState<SeasonMode[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const setMode = useCallback((m: SeasonId) => {
    setModeState(m);
    setActifState(prev => {
      try { localStorage.setItem(KEY, JSON.stringify([{ mode: m, actif: prev }])); } catch {}
      return prev;
    });
  }, []);
  const setActif = useCallback((v: boolean) => {
    setActifState(v);
    setModeState(prev => {
      try { localStorage.setItem(KEY, JSON.stringify([{ mode: prev, actif: v }])); } catch {}
      return prev;
    });
  }, []);
  const setCustom = useCallback((list: SeasonMode[]) => {
    setCustomState(list);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch {}
  }, []);

  // Synchronisation pré-connexion : on va chercher le mode partagé dans le cloud
  // (lecture anonyme) pour que navigateur ET mobile affichent le même mode/logo/
  // animation sur la page de connexion. Polling toutes les 30 s pour que les
  // appareils déjà sur la page login se mettent à jour quand l'admin change le
  // mode, sans exiger un rechargement manuel.
  useEffect(() => {
    let alive = true;

    async function syncFromCloud() {
      const rows = await lireAnon<{ mode: SeasonId; actif?: boolean }>(KEY);
      if (alive && rows && rows[0]) {
        const m = rows[0].mode ?? 'aucun';
        const a = rows[0].actif !== false;
        setModeState(m);
        setActifState(a);
        try { localStorage.setItem(KEY, JSON.stringify([{ mode: m, actif: a }])); } catch {}
      }
      const cust = await lireAnon<SeasonMode>(CUSTOM_KEY);
      if (alive && cust) {
        setCustomState(cust);
        try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(cust)); } catch {}
      }
    }

    syncFromCloud();
    // Poll toutes les 30 s : garantit la cohérence entre appareils même si le
    // premier fetch a échoué ou si l'admin modifie le mode après le chargement.
    const timer = setInterval(syncFromCloud, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const value = useMemo(
    () => buildValue(mode, setMode, actif, setActif, custom, setCustom),
    [mode, setMode, actif, setActif, custom, setCustom],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  // Remonte le composant approprié quand l'état d'authentification change.
  return isAuthenticated
    ? <LiveSeason>{children}</LiveSeason>
    : <LocalSeason>{children}</LocalSeason>;
}

export const useSeason = () => useContext(Ctx);
