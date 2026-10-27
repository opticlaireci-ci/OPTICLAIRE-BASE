-- ============================================================================
-- OPTICLAIRE — ALLÈGEMENT DE app_data (réglages) — ÉTAPE 1
--
-- Supabase → SQL Editor → coller TOUT → Run. Ré-exécutable sans risque.
-- Ne touche à AUCUNE vente, aucun client, aucun règlement : ceux-ci vivent dans
-- leurs propres tables. On retire de app_data uniquement :
--   • des clés propres à un appareil (file d'attente, magasin sélectionné,
--     dernière activité) qui n'auraient jamais dû être partagées ;
--   • d'anciennes COPIES d'affichage (ventes, clients, règlements, bons,
--     catalogues…) que l'application ne relit plus depuis app_data.
-- Le résultat liste ensuite les 15 plus grosses clés restantes.
-- ============================================================================
DO $$
DECLARE
  identite "char";
  nb integer := 0;
BEGIN
  SELECT relreplident INTO identite FROM pg_class WHERE oid = 'public.app_data'::regclass;
  -- Journal minimal pendant la suppression (cf. incident « disque plein »).
  IF identite = 'f' THEN EXECUTE 'ALTER TABLE public.app_data REPLICA IDENTITY DEFAULT'; END IF;

  DELETE FROM public.app_data
  WHERE key IN ('leclaire_pending_cloud_writes_v2', 'leclaire_magasin_actuel', 'leclaire_catalogues_migrated',
                'leclaire_last_activity', 'leclaire_users_cache', 'leclaire_comptes_banque_cache',
                'leclaire_current_user', 'leclaire_session',
                'leclaire_reglements_assurance', 'leclaire_releves_assurance',
                'leclaire_db_bon-distribution', 'leclaire_db_bon-transfert', 'leclaire_db_bon-retour',
                'leclaire_inventaires', 'leclaire_bons_commande_verres', 'leclaire_emplois_du_temps',
                'leclaire_bons_commande', 'leclaire_bons_livraison', 'leclaire_bons_peremption')
     OR key LIKE 'leclaire\_stock\_cache\_%'
     OR key LIKE 'leclaire\_ventes\_%'
     OR key LIKE 'leclaire\_clients\_magasin\_%'
     OR key LIKE 'leclaire\_reglements\_%'
     OR key LIKE 'leclaire\_factures\_assurance\_%'
     OR key LIKE 'leclaire\_rdv\_enligne\_%'
     OR key ~ '^leclaire_db_(categories|couleurs|diametres|familles|marques|matieres|tailles|traitements|types|professions|modes)$'
     OR key ~ '^leclaire_global_(accessoires|montures|services|traitements|verres)$';
  GET DIAGNOSTICS nb = ROW_COUNT;

  IF identite = 'f' THEN EXECUTE 'ALTER TABLE public.app_data REPLICA IDENTITY FULL'; END IF;
  RAISE NOTICE '% clé(s) inutile(s) retirée(s) de app_data.', nb;
END $$;

-- Les 15 plus grosses clés restantes (pour vérifier ce qui occupe la place).
SELECT key AS cle,
       pg_size_pretty(pg_column_size(value)::bigint) AS taille,
       pg_column_size(value) AS octets
FROM public.app_data
ORDER BY pg_column_size(value) DESC
LIMIT 15;
