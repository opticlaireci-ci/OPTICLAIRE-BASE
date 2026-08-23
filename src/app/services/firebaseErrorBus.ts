import { logger } from '../utils/logger';
/**
 * Bus d'erreurs Firebase — sert à afficher à l'écran (bandeau rouge) la cause
 * EXACTE d'un échec de lecture/écriture Firebase, y compris sur mobile où la
 * console n'est pas accessible.
 *
 * Objectif : ne plus « deviner » pourquoi les données ne partent pas sur le
 * lien public — le message précis (permission-denied, unauthorized-domain,
 * réseau bloqué, 403…) devient visible pour être corrigé.
 */

export interface FirebaseErrorInfo {
  message: string;
  context: string;
  at: number;
}

type Listener = (err: FirebaseErrorInfo | null) => void;

const listeners = new Set<Listener>();
let last: FirebaseErrorInfo | null = null;

export function reportFirebaseError(context: string, error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : (() => {
          try { return JSON.stringify(error); } catch { return String(error); }
        })();

  last = { message: raw, context, at: Date.now() };
  logger.error(`🔥 [Firebase] ${context}:`, raw);
  listeners.forEach(l => l(last));
}

export function clearFirebaseError() {
  last = null;
  listeners.forEach(l => l(null));
}

export function subscribeFirebaseError(listener: Listener): () => void {
  listeners.add(listener);
  listener(last);
  return () => listeners.delete(listener);
}
