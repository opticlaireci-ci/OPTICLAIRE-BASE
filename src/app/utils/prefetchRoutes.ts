/**
 * PRÉCHARGEMENT DES PAGES (navigation fluide)
 *
 * Chaque page est un chunk chargé à la demande. Sans préchargement, le premier
 * clic vers une page déclenche un téléchargement réseau (bref écran
 * « Chargement… »). On précharge donc en TÂCHE DE FOND, quand le navigateur est
 * inactif, les pages les plus utilisées : les navigations suivantes deviennent
 * alors instantanées (le chunk est déjà en cache mémoire).
 *
 * Les imports sont volontairement identiques à ceux de `routes.tsx` afin que
 * Vite/Rollup réutilise exactement les mêmes chunks.
 */

// Import factories des pages fréquemment visitées. Ordre = priorité de préchargement.
const PAGES: Array<() => Promise<unknown>> = [
  // Espace magasin — les écrans du quotidien
  () => import('../pages/AccueilPage'),
  () => import('../pages/magasin/dashboard/MagasinDashboardPage'),
  () => import('../pages/magasin/gestion-commercial/VenteFacturePage'),
  () => import('../pages/magasin/gestion-commercial/DevisProformaPage'),
  () => import('../pages/magasin/gestion-commercial/VenteFlashPage'),
  () => import('../pages/magasin/gestion-clientele/ClientsPage'),
  () => import('../pages/magasin/MouvementsCaissePage'),
  () => import('../pages/magasin/gestion-stocks/EtatStockMagasinPage'),
  // Sélection magasin + accueil global
  () => import('../pages/gestion-magasin/SelectMagasinPage'),
  () => import('../pages/DashboardPage'),
];

let started = false;

/** Précharge les pages une par une, sans jamais bloquer le thread principal. */
export function prefetchRoutes(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const ric: (cb: () => void) => void =
    (window as any).requestIdleCallback
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 2000 })
      : (cb) => window.setTimeout(cb, 300);

  let i = 0;
  const next = () => {
    if (i >= PAGES.length) return;
    const load = PAGES[i++];
    // On ignore les erreurs : un échec de préchargement est sans conséquence,
    // la page sera simplement chargée normalement au moment du clic.
    load().catch(() => {}).finally(() => ric(next));
  };
  ric(next);
}
