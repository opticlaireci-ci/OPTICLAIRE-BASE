import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
// Fréquence de vérification du temps réellement écoulé. Un simple setTimeout ne
// suffit PAS sur mobile : dès que l'onglet passe en arrière-plan ou que l'écran
// se verrouille, les navigateurs (iOS/Android) SUSPENDENT les minuteurs. Au
// réveil, le compte à rebours reprendrait sans tenir compte du temps écoulé →
// pas de déconnexion. On compare donc l'horloge réelle à intervalles réguliers
// ET au retour de l'onglet au premier plan.
const CHECK_INTERVAL_MS = 30 * 1000;
// Horodatage de dernière activité persistée : survit à un rechargement de page
// et est partagé entre onglets (déconnexion cohérente sur le même appareil).
const LAST_ACTIVITY_KEY = 'leclaire_last_activity';

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'touchmove', 'scroll', 'click', 'wheel',
] as const;

export function IdleTimeout() {
  const { isAuthenticated, logout } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const markActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    try { localStorage.setItem(LAST_ACTIVITY_KEY, String(now)); } catch { /* quota */ }
  }, []);

  const checkIdle = useCallback(() => {
    // On lit l'horodatage persisté (mis à jour aussi par les autres onglets) et
    // on retient le plus récent : l'utilisateur peut être actif dans un onglet
    // voisin. La déconnexion se base sur le TEMPS RÉEL écoulé (Date.now()),
    // fiable même après une suspension des minuteurs en arrière-plan.
    let last = lastActivityRef.current;
    try {
      const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
      if (Number.isFinite(stored) && stored > last) last = stored;
    } catch { /* ignore */ }
    if (Date.now() - last >= IDLE_TIMEOUT_MS) {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    markActivity();
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, markActivity, { passive: true }));

    // Vérification périodique du temps écoulé.
    intervalRef.current = setInterval(checkIdle, CHECK_INTERVAL_MS);

    // Au retour de l'onglet au premier plan (déverrouillage du téléphone, retour
    // sur l'app), on vérifie IMMÉDIATEMENT : c'est le cas clé du mobile.
    const onVisible = () => { if (!document.hidden) checkIdle(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, markActivity));
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [isAuthenticated, markActivity, checkIdle]);

  return null;
}
