import { logger } from './logger';
/**
 * CLIENT SUPABASE — AUTHENTIFICATION
 *
 * Supabase gère désormais l'identité (login/logout/session) et les rôles
 * (table `user_magasins`). Les données métier restent sur Firestore pendant
 * la transition, puis passeront sur Convex (voir plan de migration).
 *
 * Le projectId et la clé publique sont fournis par Figma Make dans
 * `utils/supabase/info.tsx` (fichier autogénéré, ne pas éditer).
 */

import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'opticlaire_supabase_auth',
  },
});

// ── Nom de l'edge function serveur ───────────────────────────────────────────
// Supabase sert une edge function sous /functions/v1/<nom-de-la-fonction>. Ce
// nom doit donc concorder avec le `ROUTE_PREFIX` de
// `supabase/functions/server/index.tsx` (qui vaut par défaut
// `make-server-${APP_ID}`).
//
// C'est le SEUL endroit à modifier côté client en cas de changement de projet
// Supabase où la fonction serait déployée sous un autre nom. Le projectId et la
// clé publique, eux, sont régénérés automatiquement dans `info.tsx`.
// ⚠️ Nom RÉEL sous lequel Make déploie la fonction dans cet environnement :
// `make-server-8ddbb853` (slug de l'app Make). Il DIFFÈRE du suffixe de la table
// KV (`kv_store_10865fd7`, ci-dessous) où vivent les données — les deux ne sont
// PAS liés. Doit concorder avec ROUTE_PREFIX de l'edge function.
export const SERVER_FUNCTION_NAME = 'make-server-8ddbb853';

// URL de base de l'edge function serveur (routes <SERVER_FUNCTION_NAME>/*)
export const SERVER_BASE = `${supabaseUrl}/functions/v1/${SERVER_FUNCTION_NAME}`;

// ── Table clé/valeur ─────────────────────────────────────────────────────────
// Doit concorder avec le `KV_TABLE` de l'edge function et avec le nom de table
// de `supabase/functions/server/kv_store.tsx` (fichier autogénéré). Utilisée par
// les rares lectures anonymes qui passent directement par PostgREST (écran de
// connexion, thème saisonnier) — avant toute session, donc hors edge function.
export const KV_TABLE_NAME = 'kv_store_10865fd7';

/** URL PostgREST de lecture anonyme d'une clé `app_data:<cle>` du KV store. */
export const kvRestUrl = (cle: string) =>
  `${supabaseUrl}/rest/v1/${KV_TABLE_NAME}`
  + `?key=eq.app_data:${encodeURIComponent(cle)}&select=value`;

/**
 * Renvoie un access_token de session VALIDE, en rafraîchissant si nécessaire.
 * Renvoie null s'il n'y a pas de session (l'appelant ne doit alors pas appeler
 * les routes protégées avec la clé anon, qui serait rejetée « Invalid token »).
 */
/**
 * Rafraîchissement « single-flight ».
 *
 * Les refresh tokens Supabase sont à USAGE UNIQUE (rotation) : si plusieurs
 * appels `refreshSession()` partent en même temps (rafale de requêtes au
 * démarrage : profil, health, hydratation, pollers…), le premier consomme le
 * refresh token et les suivants reçoivent un token déjà révoqué — ce qui
 * invalide toute la session (« Invalid token » puis déconnexion).
 * On garantit donc qu'UN SEUL refresh est en vol à la fois et on partage son
 * résultat entre tous les appelants concurrents.
 */
let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        const msg = error.message || '';
        // Aucune session du tout (utilisateur non connecté, ex. page de login) :
        // « Auth session missing! ». Ce n'est PAS une erreur — on sort en silence.
        if (/auth session missing|session missing|session_not_found|no session/i.test(msg)) {
          return null;
        }
        // Refresh token absent/invalide/révoqué : la session locale est
        // irrécupérable. On la PURGE pour éviter des tentatives répétées en
        // boucle (à chaque poll) et forcer une reconnexion propre.
        if (/refresh token|invalid|not found|expired/i.test(msg)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          console.info('ℹ️ Session expirée — reconnexion nécessaire.');
        } else {
          logger.warn('⚠️ refreshSession a échoué:', msg);
        }
        return null;
      }
      return data.session?.access_token || null;
    } finally {
      // Libère le verrou au prochain tick pour que les appels quasi-simultanés
      // réutilisent bien la même promesse plutôt que d'en relancer une.
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}

export async function getValidAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  // Rafraîchit si le token est expiré ou expire dans moins de 60 s.
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAt && expiresAt - Date.now() < 60_000) {
    const fresh = await refreshAccessToken();
    // Si le token est DÉJÀ expiré, ne JAMAIS retomber sur l'ancien : il serait
    // rejeté « HTTP 401 Invalid token » par le serveur (échec dur, alertes
    // bruyantes). On renvoie plutôt null → l'appelant prend le chemin gracieux
    // NO_SESSION (cache local conservé, invite à se reconnecter).
    if (fresh) return fresh;
    const expired = !expiresAt || expiresAt <= Date.now();
    return expired ? null : session.access_token;
  }
  return session.access_token;
}

/** En-têtes d'appel au serveur avec le token de session courant (ou la clé anon). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = (await getValidAccessToken()) || publicAnonKey;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * FETCH RÉSILIENT VERS L'EDGE FUNCTION — source unique pour TOUS les appels.
 *
 * Au démarrage, l'app déclenche une rafale de requêtes (profil, health, setup,
 * hydratation, pollers…). Trop de connexions simultanées vers l'edge function
 * (aggravé par le cold-start) font tomber certaines connexions (« Failed to
 * fetch »). On plafonne donc la concurrence et on réessaie les erreurs réseau.
 */
const MAX_CONCURRENT = 4;
let active = 0;
const waitQueue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) { active++; return Promise.resolve(); }
  return new Promise(resolve => waitQueue.push(() => { active++; resolve(); }));
}
function release() {
  active--;
  const next = waitQueue.shift();
  if (next) next();
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Appelle l'edge function avec limitation de concurrence + retry/backoff sur les
 * erreurs réseau transitoires. `path` commence par « / ». Les en-têtes d'auth
 * sont injectés par défaut et peuvent être surchargés via `init.headers`.
 */
// Délai max d'UNE requête vers l'edge function. Une requête bloquée (proxy coupé
// silencieusement, cold-start figé) doit être AVORTÉE : sinon le `fetch` ne se
// résout jamais, le slot de concurrence n'est jamais libéré et, au bout de
// MAX_CONCURRENT requêtes figées, TOUS les appels suivants restent bloqués dans
// `acquire()` → timeouts en cascade (« Catalogue … abandonné après 9 tentatives »).
const REQUEST_TIMEOUT_MS = 12_000;

export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await acquire();
  try {
    const base = await authHeaders();
    let headers = { ...base, ...(init.headers as Record<string, string> | undefined) };
    let refreshedOn401 = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${SERVER_BASE}${path}`, { ...init, headers, signal: controller.signal });
        // Token expiré/révoqué : on force UN rafraîchissement puis on rejoue la
        // requête une seule fois avec le nouveau token (évite le « HTTP 401 »).
        if (res.status === 401 && !refreshedOn401) {
          refreshedOn401 = true;
          const fresh = await refreshAccessToken();
          if (fresh) {
            headers = { ...headers, Authorization: `Bearer ${fresh}` };
            continue;
          }
        }
        return res;
      } catch (err) {
        lastErr = err;
        // Timeout requête (AbortError) : on échoue VITE pour libérer le slot de
        // concurrence — l'appelant (pushWithRetry) relancera. Seules les erreurs
        // réseau transitoires (TypeError) sont réessayées dans la boucle.
        if ((err as any)?.name === 'AbortError') throw err;
        if (!(err instanceof TypeError) || attempt === 3) throw err;
        await sleep(400 * Math.pow(2, attempt) + Math.random() * 300);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  } finally {
    release();
  }
}
// Sécurité : on N'EXPOSE PLUS le client Supabase sur `window`. L'exposer
// permettait de lire la session (access/refresh tokens) et d'appeler l'API
// authentifiée depuis la console du navigateur — surface d'attaque inutile.
