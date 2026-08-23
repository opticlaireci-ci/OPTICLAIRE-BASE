/**
 * COUCHE DE COMPATIBILITÉ « AUTH » — 100% SUPABASE
 *
 * Remplace le sous-ensemble de `firebase/auth` utilisé par l'application. Toute
 * l'authentification repose sur Supabase Auth (voir `supabaseClient`). Ce module
 * ne fait que réexposer l'API attendue par le code existant.
 */

import { supabase } from './supabaseClient';

export interface User {
  uid: string;
  email: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

function toUser(session: any): User | null {
  if (!session?.user) return null;
  return {
    uid: session.user.id,
    email: session.user.email ?? null,
    getIdToken: async () => session.access_token || '',
  };
}

class AuthCompat {
  currentUser: User | null = null;
  constructor() {
    supabase.auth.getSession().then(({ data }) => {
      this.currentUser = toUser(data.session);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      this.currentUser = toUser(session);
    });
  }

  /**
   * Renvoie l'utilisateur courant en ATTENDANT réellement la session Supabase
   * si elle n'est pas encore résolue (au démarrage, `currentUser` est peuplé de
   * façon asynchrone : une écriture précoce le voyait `null` et échouait avec
   * « session non disponible »).
   */
  async ensureSession(): Promise<User | null> {
    if (this.currentUser) return this.currentUser;
    const { data } = await supabase.auth.getSession();
    this.currentUser = toUser(data.session);
    return this.currentUser;
  }
}

export const auth = new AuthCompat();

export function getAuth(): AuthCompat {
  return auth;
}

/** S'abonne aux changements de session Supabase. Appelle `cb` immédiatement. */
export function onAuthStateChanged(
  _auth: any,
  cb: (user: User | null) => void,
): () => void {
  supabase.auth.getSession().then(({ data }) => cb(toUser(data.session)));
  const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => cb(toUser(session)));
  return () => sub.subscription.unsubscribe();
}

export async function signInWithEmailAndPassword(_auth: any, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw Object.assign(new Error(error.message), { code: 'auth/invalid-credential' });
  return { user: toUser(data.session) };
}

export async function createUserWithEmailAndPassword(_auth: any, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw Object.assign(new Error(error.message), { code: 'auth/error' });
  return { user: toUser(data.session) };
}

export async function signOut(_auth?: any) {
  await supabase.auth.signOut();
}

export type { User as FbUser };
