-- ============================================================================
-- OPTICLAIRE — NETTOYAGE DES RESTES INUTILES
--
-- Supabase → SQL Editor → coller TOUT → Run. Ré-exécutable sans risque.
--
-- 1. app_data contient d'ANCIENNES COPIES de caches locaux (ventes, clients,
--    catalogues…) : « leclaire_ventes_palmeraie », « leclaire_ventes_PALMERAIE »,
--    « leclaire_clients_magasin_ABOBO »… Ces données vivent désormais dans
--    leurs vraies tables (ventes, clients…). L'application ne les relit JAMAIS
--    depuis app_data (elle les ignore), mais elle les TÉLÉCHARGE quand même à
--    chaque synchronisation complète, sur chaque poste. On les supprime.
--    → Les vraies ventes / clients ne sont PAS touchés.
--
-- 2. Les tables de sauvegarde créées par le nettoyage des doublons
--    (sauvegarde_doublons_ventes / _reglements) — à ne lancer que si vous avez
--    vérifié que les doublons sont bien corrigés.
-- ============================================================================

DO $$
DECLARE
  identite "char";
  nb integer := 0;
BEGIN
  IF to_regclass('public.app_data') IS NULL THEN RETURN; END IF;

  -- Journal minimal pendant la suppression (cf. incident « disque plein »).
  SELECT relreplident INTO identite FROM pg_class WHERE oid = 'public.app_data'::regclass;
  IF identite = 'f' THEN EXECUTE 'ALTER TABLE public.app_data REPLICA IDENTITY DEFAULT'; END IF;

  -- Mêmes règles que isStructuredKey() dans l'application : ces clés sont
  -- ignorées à la lecture depuis app_data, leurs données sont dans les tables.
  DELETE FROM public.app_data
  WHERE key LIKE 'leclaire\_ventes\_%'
     OR key LIKE 'leclaire\_factures\_assurance\_%'
     OR key LIKE 'leclaire\_clients\_magasin\_%'
     OR key LIKE 'leclaire\_reglements\_%'
     OR key LIKE 'leclaire\_rdv\_enligne\_%'
     OR key IN ('leclaire_reglements_assurance', 'leclaire_releves_assurance',
                'leclaire_db_bon-distribution', 'leclaire_db_bon-transfert', 'leclaire_db_bon-retour',
                'leclaire_inventaires', 'leclaire_bons_commande_verres', 'leclaire_emplois_du_temps',
                'leclaire_bons_commande', 'leclaire_bons_livraison', 'leclaire_bons_peremption')
     OR key ~ '^leclaire_db_(categories|couleurs|diametres|familles|marques|matieres|tailles|traitements|types|professions|modes)$'
     OR key ~ '^leclaire_global_(accessoires|montures|services|traitements|verres)$';
  GET DIAGNOSTICS nb = ROW_COUNT;

  IF identite = 'f' THEN EXECUTE 'ALTER TABLE public.app_data REPLICA IDENTITY FULL'; END IF;
  RAISE NOTICE '% ancienne(s) copie(s) de cache supprimée(s) de app_data.', nb;
END $$;

-- 2. Tables de sauvegarde des doublons (décommentez les 2 lignes si les
--    doublons sont bien corrigés) :
-- DROP TABLE IF EXISTS public.sauvegarde_doublons_ventes;
-- DROP TABLE IF EXISTS public.sauvegarde_doublons_reglements;

SELECT pg_size_pretty(pg_total_relation_size('public.app_data')) AS taille_app_data;
