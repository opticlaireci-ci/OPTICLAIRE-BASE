/**
 * POLLING ÉCONOME EN CONNEXIONS SUPABASE
 *
 * Chaque requête REST (`supabase.from(...)`) occupe une connexion Postgres du
 * pool `authenticator` (PostgREST), qui la garde ouverte ~30 s après usage. Des
 * dizaines de `setInterval` à 5-10 s, multipliés par les onglets ouverts dans
 * chaque magasin, maintenaient ce pool gonflé en permanence (≈ 20 connexions).
 *
 * `setVisibleInterval` remplace `setInterval` pour tout rafraîchissement réseau :
 *   - AUCUN tick quand l'onglet est en arrière-plan (document.hidden) ;
 *   - au retour sur l'onglet, un rattrapage IMMÉDIAT si au moins un tick a été
 *     sauté (l'utilisateur voit des données fraîches sans attendre) ;
 *   - renvoie directement la fonction d'arrêt (à appeler dans le cleanup).
 *
 * Le temps réel (`supabaseLive`) et les événements applicatifs
 * ('ventes-updated', 'leclaire-sync-update'…) restent la source principale de
 * fraîcheur : ce polling n'est qu'un filet de sécurité, d'où des cadences lentes.
 */

/** Cadence par défaut des rafraîchissements de page (filet de sécurité). */
export const PAGE_POLL_MS = 30_000;

const isHidden = () => typeof document !== 'undefined' && document.hidden;

export function setVisibleInterval(fn: () => unknown, ms: number): () => void {
  let missed = false;
  const run = () => {
    try {
      const r = fn();
      // Un rejet de promesse ne doit jamais remonter en « unhandled rejection ».
      if (r && typeof (r as Promise<unknown>).catch === 'function') {
        (r as Promise<unknown>).catch(() => { /* géré par l'appelant */ });
      }
    } catch { /* isolé : le prochain tick retentera */ }
  };

  const timer = setInterval(() => {
    if (isHidden()) { missed = true; return; }
    run();
  }, ms);

  const onVisibility = () => {
    if (!isHidden() && missed) {
      missed = false;
      run();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    clearInterval(timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
