import { useEffect, useState } from 'react';
import { subscribeFirebaseError, clearFirebaseError, type FirebaseErrorInfo } from '../services/firebaseErrorBus';

/**
 * Bandeau rouge fixe en haut de l'écran affichant la CAUSE EXACTE d'un échec
 * Firebase (lecture/écriture). Visible aussi sur mobile (pas besoin de la
 * console). Sert à diagnostiquer pourquoi les données ne se synchronisent pas
 * sur le lien public.
 */
export function FirebaseErrorBanner() {
  const [error, setError] = useState<FirebaseErrorInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeFirebaseError(setError), []);

  if (!error) return null;

  const fullText = `[${error.context}] ${error.message}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponible : on sélectionne rien, l'utilisateur peut recopier à la main
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: '#b91c1c',
        color: '#fff',
        padding: '10px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>
          ⚠️ Échec de synchronisation Firebase — {error.context}
        </div>
        <div style={{ opacity: 0.95, wordBreak: 'break-word', fontSize: 13 }}>
          {error.message}
        </div>
        <div style={{ opacity: 0.75, fontSize: 11, marginTop: 4 }}>
          Envoyez ce message exact à votre développeur pour corriger la cause.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={copy}
          style={{
            background: '#fff',
            color: '#b91c1c',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {copied ? 'Copié ✓' : 'Copier'}
        </button>
        <button
          onClick={() => clearFirebaseError()}
          aria-label="Fermer"
          style={{
            background: 'transparent',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.6)',
            borderRadius: 6,
            padding: '6px 10px',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
