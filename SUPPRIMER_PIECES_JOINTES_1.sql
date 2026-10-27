-- ============================================================================
-- OPTICLAIRE — SUPPRESSION DES PDF / PIÈCES JOINTES STOCKÉS DANS LA BASE
-- ÉTAPE 1 / 2
--
-- Supabase → SQL Editor → coller TOUT ce fichier → Run.
--
-- Supprime UNIQUEMENT le contenu des fichiers importés avec les anciens
-- dossiers (PDF en base64) :
--   • les lignes `documents_importes:…` de la table app_data ;
--   • la table documents_importes (si elle a été créée), vidée.
-- Les ventes, clients, règlements et ordonnances importés ne sont PAS touchés :
-- toutes leurs informations sont dans la vente. Le NOM des fichiers reste noté
-- sur chaque vente.
--
-- ⚠ Pas de sauvegarde possible ici : c'est justement leur volume qui remplit
-- le disque. Gardez vos PDF d'origine sur votre ordinateur.
--
-- SANS RISQUE POUR LE DISQUE : app_data est en « REPLICA IDENTITY FULL » (chaque
-- suppression recopierait tout le PDF dans le journal WAL — c'est ce qui a
-- rempli le disque la dernière fois). Ce réglage est suspendu le temps de la
-- suppression, puis rétabli.
-- ============================================================================

DO $$
DECLARE
  identite "char";
  nb_app_data integer := 0;
  nb_table bigint := 0;
BEGIN
  -- 1) Table dédiée : TRUNCATE libère la place immédiatement, sans journal lourd.
  IF to_regclass('public.documents_importes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.documents_importes' INTO nb_table;
    EXECUTE 'TRUNCATE public.documents_importes';
  END IF;

  -- 2) app_data : suppression avec journal minimal.
  IF to_regclass('public.app_data') IS NOT NULL THEN
    SELECT relreplident INTO identite FROM pg_class WHERE oid = 'public.app_data'::regclass;
    IF identite = 'f' THEN
      EXECUTE 'ALTER TABLE public.app_data REPLICA IDENTITY DEFAULT';
    END IF;

    DELETE FROM public.app_data WHERE key LIKE 'documents_importes:%';
    GET DIAGNOSTICS nb_app_data = ROW_COUNT;

    IF identite = 'f' THEN
      EXECUTE 'ALTER TABLE public.app_data REPLICA IDENTITY FULL';
    END IF;
  END IF;

  RAISE NOTICE 'Pièces supprimées : % dans app_data, % dans documents_importes.', nb_app_data, nb_table;
END $$;

-- Contrôle : il ne doit plus rester aucune pièce jointe.
SELECT 'pièces restant dans app_data' AS controle,
       (SELECT count(*) FROM public.app_data WHERE key LIKE 'documents_importes:%')::text AS valeur
UNION ALL
SELECT 'taille de la base (avant étape 2)', pg_size_pretty(pg_database_size(current_database()));
