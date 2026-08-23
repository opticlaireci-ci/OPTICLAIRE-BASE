/**
 * Logger conditionné à l'environnement.
 *
 * En développement (`import.meta.env.DEV`), les `log`/`warn` s'affichent
 * normalement. En production, ils sont silencieux afin de ne pas exposer d'infos
 * internes ni polluer la console des utilisateurs. Les `error` restent toujours
 * actifs (une erreur en prod doit rester visible / traçable) — point d'ancrage
 * idéal pour brancher plus tard un service de monitoring (Sentry, etc.).
 *
 * Migration progressive : remplacez `console.log/warn/error` par `logger.*`
 * dossier par dossier (services/, puis utils/, puis pages/) pour garder des
 * diffs relisibles — pas en un seul gros commit.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: any[]) => {
    // On garde les erreurs même en production…
    console.error(...args);
    // TODO: brancher ici un service de monitoring (Sentry, etc.) plutôt que
    // d'exposer la stack uniquement dans la console utilisateur.
  },
};
