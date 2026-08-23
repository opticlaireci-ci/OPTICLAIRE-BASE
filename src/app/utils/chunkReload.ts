import { logger } from './logger';
/**
 * AUTO-RÉCUPÉRATION DES MODULES DYNAMIQUES ÉCHOUÉS
 *
 * Symptôme : « Failed to fetch dynamically imported module … ».
 * Cause : après un redéploiement (ou une ré-optimisation des dépendances Vite),
 * les URLs des chunks chargés paresseusement (pages en `import()`) changent. Un
 * onglet resté ouvert détient encore les anciennes URLs → le fetch du module
 * renvoie 404/500 et l'écran devient blanc.
 *
 * Correctif : dès qu'un import dynamique échoue pour cette raison, on recharge la
 * page UNE seule fois (garde en sessionStorage) pour récupérer les bons chunks.
 * La garde évite toute boucle de rechargement si l'erreur est réellement
 * persistante (ex. serveur indisponible).
 */

const RELOAD_FLAG = 'opticlaire_chunk_reloaded_at';
const RELOAD_COOLDOWN_MS = 15_000;

function isDynamicImportError(message: string): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i.test(
    message,
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
    // Ne recharge pas en boucle : au plus un rechargement par fenêtre de 15 s.
    if (Date.now() - last < RELOAD_COOLDOWN_MS) {
      logger.error('⛔️ Module dynamique introuvable après rechargement récent — abandon pour éviter une boucle.');
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* sessionStorage indisponible : on tente quand même le rechargement */
  }
  logger.warn('🔄 Chunk périmé détecté — rechargement de la page pour récupérer la dernière version…');
  window.location.reload();
}

if (typeof window !== 'undefined') {
  // Vite émet cet évènement dédié lorsqu'un préchargement de module échoue.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    reloadOnce();
  });

  // Filet de sécurité : promesses rejetées non gérées (import() qui échoue).
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e?.reason?.message || String(e?.reason || '');
    if (isDynamicImportError(msg)) reloadOnce();
  });
}

export {};
