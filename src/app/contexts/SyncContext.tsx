import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { startAutoSync, forcSync, type SyncStatus } from '../services/syncService';

interface SyncContextType {
  status: SyncStatus;
  lastSync: Date | null;
  /** Incrémenté à chaque fois que des données arrivent de Supabase — utilisez-le dans vos useEffect pour re-lire le localStorage */
  syncVersion: number;
  forcerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType>({
  status: 'idle',
  lastSync: null,
  syncVersion: 0,
  forcerSync: async () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  // ready = true quand le premier sync est terminé (ou après timeout 5s)
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    // Timeout de sécurité : afficher l'app même si le sync prend trop de temps
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
    }, 5000);

    const stopSync = startAutoSync(
      (newStatus) => {
        // Defer state updates to avoid updating during render
        setTimeout(() => {
          setStatus(newStatus);
          if (newStatus === 'synced') {
            setLastSync(new Date());
            // Débloquer l'app dès le premier sync réussi
            if (!readyRef.current) {
              readyRef.current = true;
              setReady(true);
            }
          } else if (newStatus === 'error' && !readyRef.current) {
            // En cas d'erreur, débloquer quand même après un court délai
            setTimeout(() => {
              if (!readyRef.current) {
                readyRef.current = true;
                setReady(true);
              }
            }, 1500);
          }
        }, 0);
      },
      // Callback quand des données arrivent de Supabase : on incrémente
      // syncVersion pour les composants qui veulent s'en servir, mais on
      // NE RECHARGE PLUS la page automatiquement (cela perturbait la
      // navigation et les Dialogs).
      (_key, _value) => {
        // Defer state update to avoid updating during render
        setTimeout(() => {
          setSyncVersion(v => v + 1);
        }, 0);
      }
    );

    return () => {
      stopSync();
      clearTimeout(timeout);
    };
  }, []);

  const forcerSync = useCallback(async () => {
    await forcSync();
    setLastSync(new Date());
    setSyncVersion(v => v + 1);
  }, []);

  if (!ready) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#f9fafb',
        gap: '16px',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #e5e7eb',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
          Synchronisation des données...
        </p>
      </div>
    );
  }

  return (
    <SyncContext.Provider value={{ status, lastSync, syncVersion, forcerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
