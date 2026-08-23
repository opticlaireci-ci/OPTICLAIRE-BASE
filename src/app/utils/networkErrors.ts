/**
 * Détection des erreurs réseau TRANSITOIRES (Supabase momentanément injoignable,
 * cold-start de l'edge function, requête avortée par timeout, perte de connexion).
 *
 * Ces situations ne sont PAS des bugs : l'app retombe sur le cache local et
 * réessaiera au prochain cycle. On les journalise donc en `warn` discret plutôt
 * qu'en `error` rouge alarmant, pour ne pas polluer la console.
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as any)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  // fetch() lève un TypeError « Failed to fetch » quand la connexion échoue.
  if (err instanceof TypeError) return true;
  const msg = String((err as any)?.message ?? err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('signal is aborted') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed')
  );
}

/**
 * Erreur d'authentification (session expirée / token révoqué) : le serveur
 * répond HTTP 401/403. L'app retombe sur le cache ; l'utilisateur doit se
 * reconnecter pour resynchroniser.
 */
export function isAuthError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err);
  return /HTTP 401|HTTP 403|invalid token|invalid.*refresh|jwt/i.test(msg);
}

/**
 * Droits Postgres manquants : PostgREST répond 401/403 avec le code SQLSTATE
 * `42501` (« permission denied for table … »). Contrairement à une session
 * expirée, RIEN ne changera en réessayant : tant que le GRANT n'est pas posé
 * côté base, chaque tentative échouera à l'identique. On distingue donc ce cas
 * pour abandonner immédiatement au lieu de boucler.
 *
 * Attention à ne pas confondre avec une violation de policy RLS (`42501` aussi
 * pour `new row violates row-level security policy`) : le traitement est le
 * même — abandonner et alerter — mais le correctif diffère (policy vs grant),
 * d'où le message explicite laissé à l'appelant.
 */
export function isPermissionError(err: unknown): boolean {
  const code = String((err as any)?.code ?? '');
  if (code === '42501') return true;
  const msg = String((err as any)?.message ?? err);
  return /permission denied for (table|schema|relation)|violates row-level security/i.test(msg);
}

/**
 * Absence PURE de session : l'utilisateur n'est pas (encore) connecté, ou l'auth
 * n'est pas résolue au démarrage. Ce n'est pas une erreur — le cache local est
 * conservé et une resynchro aura lieu dès la connexion. On ne journalise RIEN.
 */
export function isNoSessionError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err);
  return /NO_SESSION|session absente/i.test(msg);
}

/**
 * Journalise une erreur : silencieux si aucune session (non connecté), `warn`
 * discret si c'est une coupure réseau transitoire ou une session expirée (cache
 * local préservé), `error` sinon.
 */
export function logNetworkAware(prefix: string, err: unknown): void {
  if (isNoSessionError(err)) {
    // Aucune session : bruit inutile, on ne journalise pas.
    return;
  }
  if (isPermissionError(err)) {
    console.error(
      `${prefix} — droits Postgres manquants (SQLSTATE 42501). ` +
      `Exécutez supabase/FIX_DROITS_AUTHENTICATED.sql dans le SQL Editor. ` +
      `Cache local conservé, aucune donnée perdue.`,
    );
  } else if (isTransientNetworkError(err)) {
    console.warn(`${prefix} — réseau momentanément indisponible, cache local conservé.`);
  } else if (isAuthError(err)) {
    console.warn(`${prefix} — session expirée, reconnectez-vous pour resynchroniser (cache local conservé).`);
  } else {
    console.error(prefix, err);
  }
}
