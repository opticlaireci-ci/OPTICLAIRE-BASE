import { logger } from '../utils/logger';
import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2, X } from 'lucide-react';
import { supabaseHealthCheck } from '../utils/supabaseDirect';

type Status = 'checking' | 'online' | 'offline';

export function ServerStatusBanner() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const checkServer = async () => {
    setRetrying(true);
    try {
      const ok = await supabaseHealthCheck();
      if (ok) {
        setStatus('online');
        setDetail('');
      } else {
        setStatus('offline');
        setDetail('La base de données Supabase est inaccessible ou les tables sont manquantes.');
      }
    } catch (err) {
      setStatus('offline');
      setDetail('Base de données injoignable (Failed to fetch).');
      logger.warn('ServerStatusBanner: base injoignable', err);
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    checkServer();
  }, []);

  if (status === 'online' || status === 'checking' || dismissed) return null;

  return (
    <div
      className="w-full rounded-xl px-4 py-3 flex flex-col gap-2"
      style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e' }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#d97706' }} />
        <div className="flex-1 text-xs" style={{ lineHeight: 1.5 }}>
          <strong>Base de données non disponible.</strong> {detail}
          <br />
          Vérifiez que le script SQL <span className="font-mono">setup-nouveau-projet.sql</span> a
          bien été exécuté dans le Dashboard Supabase du projet courant.
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded hover:bg-amber-100 transition-colors"
          aria-label="Fermer"
        >
          <X size={14} style={{ color: '#92400e' }} />
        </button>
      </div>
      <button
        type="button"
        onClick={checkServer}
        disabled={retrying}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: '#d97706', color: '#fff' }}
      >
        {retrying ? (
          <RefreshCw size={13} className="animate-spin" />
        ) : (
          <RefreshCw size={13} />
        )}
        {retrying ? 'Vérification…' : 'Réessayer'}
      </button>
    </div>
  );
}

export function ServerOnlineBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#059669' }}>
      <CheckCircle2 size={13} /> Serveur connecté
    </span>
  );
}
