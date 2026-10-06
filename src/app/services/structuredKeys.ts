/**
 * Clés localStorage gérées par des tables Supabase structurées (Lots 5-12).
 * Ces clés sont hydratées depuis leurs tables dédiées (ventes, clients,
 * reglements, etc.) et NE DOIVENT JAMAIS être écrasées par d'anciennes
 * valeurs stockées dans le blob générique `app_data`.
 */
/**
 * Clés PROPRES À CET APPAREIL : elles ne doivent jamais transiter par app_data.
 * La file des écritures en attente, en particulier, était recopiée sur les
 * autres appareils, qui la rejouaient ensuite — avec le risque d'écraser une
 * vente modifiée entre-temps par une ancienne version.
 */
const CLES_LOCALES_APPAREIL = new Set([
  'leclaire_pending_cloud_writes_v2',
  'leclaire_magasin_actuel',
  'leclaire_catalogues_migrated',
  // Dernière activité (déconnexion automatique) : propre à chaque poste.
  'leclaire_last_activity',
  // Simples copies d'affichage de données déjà stockées dans leurs tables.
  'leclaire_users_cache',
  'leclaire_comptes_banque_cache',
]);

export function estCleLocaleAppareil(key: string): boolean {
  return CLES_LOCALES_APPAREIL.has(key) || key.startsWith('leclaire_stock_cache_');
}

/** Vrai si la clé ne doit PAS être synchronisée via app_data. */
export function isStructuredKey(key: string): boolean {
  if (estCleLocaleAppareil(key)) return true;
  if (key.startsWith('leclaire_ventes_')) return true;
  if (key.startsWith('leclaire_factures_assurance_')) return true;
  if (key === 'leclaire_reglements_assurance') return true;
  if (key === 'leclaire_releves_assurance') return true;
  if (key.startsWith('leclaire_clients_magasin_')) return true;
  if (key.startsWith('leclaire_reglements_')) return true;
  if (key === 'leclaire_db_bon-distribution') return true;
  if (key === 'leclaire_db_bon-transfert') return true;
  if (key === 'leclaire_db_bon-retour') return true;
  if (key === 'leclaire_inventaires') return true;
  if (key.startsWith('leclaire_rdv_enligne_')) return true;
  if (key === 'leclaire_bons_commande_verres') return true;
  if (key === 'leclaire_emplois_du_temps') return true;
  // Bons commande, livraison, péremption — hydratés depuis table `bons`
  if (key === 'leclaire_bons_commande') return true;
  if (key === 'leclaire_bons_livraison') return true;
  if (key === 'leclaire_bons_peremption') return true;
  if (/^leclaire_db_(categories|couleurs|diametres|familles|marques|matieres|tailles|traitements|types|professions|modes)$/.test(key)) return true;
  if (/^leclaire_global_(accessoires|montures|services|traitements|verres)$/.test(key)) return true;
  return false;
}
