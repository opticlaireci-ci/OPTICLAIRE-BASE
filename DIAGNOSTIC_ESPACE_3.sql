-- ============================================================================
-- OPTICLAIRE — DIAGNOSTIC 3 : OÙ SONT LES MÉGAOCTETS RESTANTS ? (lecture seule)
--
-- Supabase → SQL Editor → coller TOUT → Run.
-- Compare la taille de la base à la somme de TOUTES les tables (système
-- compris) et liste les 15 plus gros éléments, tous schémas confondus.
-- ============================================================================

SELECT
  '— TOTAL BASE —'                                          AS element,
  pg_size_pretty(pg_database_size(current_database()))      AS taille,
  pg_database_size(current_database())                      AS octets
UNION ALL
SELECT
  '— somme de toutes les tables —',
  pg_size_pretty(sum(pg_total_relation_size(c.oid))),
  sum(pg_total_relation_size(c.oid))::bigint
FROM pg_class c
WHERE c.relkind IN ('r', 'm')
UNION ALL
SELECT * FROM (
  SELECT
    n.nspname || '.' || c.relname,
    pg_size_pretty(pg_total_relation_size(c.oid)),
    pg_total_relation_size(c.oid)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'm')
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 15
) t
ORDER BY octets DESC;
