import { logger } from '../utils/logger';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const LS_SESSION_KEY = 'leclaire_session';

export function SessionIndicator() {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<number>(INACTIVITY_TIMEOUT);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      try {
        const sessionStr = sessionStorage.getItem(LS_SESSION_KEY);
        if (!sessionStr) return;

        const sessionData = JSON.parse(sessionStr);
        const now = Date.now();
        const timeSinceLastActivity = now - sessionData.lastActivity;
        const remaining = INACTIVITY_TIMEOUT - timeSinceLastActivity;

        setTimeLeft(remaining);

        // Afficher avertissement si moins de 2 minutes
        if (remaining < 2 * 60 * 1000 && remaining > 0) {
          setShowWarning(true);
        } else {
          setShowWarning(false);
        }
      } catch (error) {
        logger.error('Erreur indicateur session:', error);
      }
    }, 1000); // Mise à jour chaque seconde

    return () => clearInterval(interval);
  }, [user]);

  return null;
}
