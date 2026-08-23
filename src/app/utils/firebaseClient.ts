/**
 * COUCHE D'ACCÈS AUX DONNÉES — 100% SUPABASE
 *
 * ⚠️ Firebase a été entièrement retiré. Ce module ne conserve que l'API publique
 * historique (db, auth, restSetDoc/restDeleteDoc/restGetDoc, waitForAuth…) pour
 * ne pas casser les imports existants, mais TOUT est désormais routé vers
 * Supabase :
 *   - `db` / opérations documentaires → Postgres direct via PostgREST (`supabaseDirect`)
 *   - authentification → Supabase Auth (`authCompat` / `supabaseClient`)
 *
 * Le nom du fichier est conservé uniquement par commodité d'import.
 */

import { auth } from './authCompat';
import { db } from './firestoreCompat';
import { kvSetDoc, kvDeleteDoc, kvGetDoc } from './supabaseDirect';

// La synchro cloud (Supabase) est active : les 7 magasins partagent les données.
export const FIREBASE_DATA_ENABLED = true;

export { db, auth };

/** Session « données » : plus rien à faire, Supabase gère l'auth globalement. */
export function ensureFirebaseDataSession(): Promise<void> {
  return Promise.resolve();
}

export const authReady: Promise<any> = Promise.resolve(auth.currentUser);

/** Renvoie l'utilisateur courant en attendant la session Supabase si besoin. */
export async function waitForAuth(): Promise<any> {
  return auth.ensureSession();
}

/** Le store KV Supabase n'exige pas de session : renvoie un jeton neutre. */
export async function requireFirebaseUser(): Promise<any> {
  return auth.currentUser || { uid: 'anon' };
}

export async function confirmFirebaseWrite<T>(_label: string, writeFactory: () => Promise<T>): Promise<T> {
  return writeFactory();
}

// ── Opérations documentaires (REST) → Supabase KV ──────────────────────────────

export async function restSetDoc(
  collectionName: string, id: string, data: any, merge = true,
): Promise<void> {
  await kvSetDoc(collectionName, id, data, merge);
}

export async function restDeleteDoc(collectionName: string, id: string): Promise<void> {
  await kvDeleteDoc(collectionName, id);
}

export async function restGetDoc<T = any>(collectionName: string, id: string): Promise<T | null> {
  return kvGetDoc<T>(collectionName, id);
}
// Sécurité : plus d'exposition de l'objet auth sur `window` (fuite potentielle
// de session/tokens via la console).
