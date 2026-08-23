import { logger } from './logger';

/**
 * PURGE DES DONNÉES MÉTIER DU NAVIGATEUR À LA DÉCONNEXION (audit — ÉLEVÉ 3).
 *
 * Les caches locaux (`leclaire_*`) contiennent des données personnelles et de
 * SANTÉ (clients, ventes, prescriptions optiques). Laissées en clair dans
 * localStorage après la déconnexion, elles restent lisibles par la personne
 * suivante sur un poste partagé, par une extension de navigateur ou en cas de
 * vol de l'appareil. On les efface donc à chaque fin de session.
 *
 * On balaie tout le préfixe `leclaire_` : c'est le seul moyen sûr de ne rien
 * oublier (nouveaux caches ajoutés au fil du temps). Ces données sont la copie
 * locale d'une source de vérité distante (Supabase) : elles sont ré-hydratées à
 * la prochaine connexion, aucune perte définitive.
 */
export function purgeBusinessCaches(): void {
  try {
    const aSupprimer: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle && cle.startsWith('leclaire_')) aSupprimer.push(cle);
    }
    aSupprimer.forEach((cle) => localStorage.removeItem(cle));
    logger.log(`🧹 ${aSupprimer.length} cache(s) métier purgé(s) à la déconnexion`);
  } catch (err) {
    logger.error('❌ Purge des caches métier impossible:', err);
  }
}
