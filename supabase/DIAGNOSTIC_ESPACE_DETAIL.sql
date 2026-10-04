-- ============================================================================
-- OPTICLAIRE — DIAGNOSTIC DÉTAILLÉ (lecture seule, ne modifie RIEN)
--
-- Supabase → SQL Editor → NOUVELLE requête → coller TOUT → Run.
-- Liste les 30 éléments les plus lourds de app_data (réglages / listes
-- synchronisés depuis l'application) et du kv_store, ainsi que la taille
-- moyenne d'une vente.
-- ============================================================================

SELECT 'app_data' AS ou, key AS cle, pg_size_pretty(pg_column_size(value)::bigint) AS taille, pg_column_size(value) AS octets
FROM public.app_data
UNION ALL
SELECT 'kv_store', key, pg_size_pretty(pg_column_size(value)::bigint), pg_column_size(value)
FROM public.kv_store_10865fd7
UNION ALL
SELECT 'ventes (moyenne par vente)', count(*)::text || ' ventes',
       pg_size_pretty(avg(pg_column_size(v.*))::bigint), avg(pg_column_size(v.*))::bigint
FROM public.ventes v
ORDER BY octets DESC NULLS LAST
LIMIT 30;
