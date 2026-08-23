import type { CallContact } from './callCenter';

/**
 * APPEL EN COURS — reprise automatique sur mobile.
 *
 * Sur téléphone, toucher « Appeler » ouvre le composeur : l'application passe en
 * arrière-plan et peut même être déchargée par le système. Au retour, la fiche de
 * renseignement de l'appel doit se rouvrir toute seule pour être remplie.
 *
 * On mémorise donc le contact appelé dans le localStorage au moment du clic, et
 * la page le restaure au montage puis à chaque retour au premier plan.
 */

const KEY = 'leclaire_callcenter_appel_en_cours';

/** Au-delà de ce délai, l'appel en attente est considéré comme abandonné. */
const EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 h

export interface PendingCall {
  contact: CallContact;
  magasinId: string;
  /** Horodatage ISO du lancement de l'appel. */
  startedAt: string;
}

export function savePendingCall(contact: CallContact, magasinId: string): void {
  try {
    const payload: PendingCall = { contact, magasinId, startedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
}

export function readPendingCall(): PendingCall | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCall;
    if (!parsed?.contact || !parsed?.magasinId) return null;
    const age = Date.now() - new Date(parsed.startedAt).getTime();
    if (!Number.isFinite(age) || age > EXPIRATION_MS) {
      clearPendingCall();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCall(): void {
  try { localStorage.removeItem(KEY); } catch {}
}
