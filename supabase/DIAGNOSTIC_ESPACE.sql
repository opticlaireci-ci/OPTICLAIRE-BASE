-- ============================================================================
-- OPTICLAIRE — DIAGNOSTIC DE L'ESPACE DISQUE (lecture seule, ne modifie RIEN)
--
-- Supabase → SQL Editor → coller TOUT → Run.
-- Affiche, du plus gros au plus petit, ce qui occupe la place dans la base.
-- Envoyez une capture du résultat pour une analyse précise.
-- ============================================================================

WITH tailles AS (
  SELECT
    n.nspname AS schema,
    c.relname AS objet,
    pg_total_relation_size(c.oid) AS total,
    pg_relation_size(c.oid) AS donnees,
    pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid) AS gros_champs,
    pg_indexes_size(c.oid) AS index,
    c.reltuples::bigint AS lignes_estimees,
    coalesce(s.n_dead_tup, 0) AS lignes_mortes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
  WHERE c.relkind IN ('r', 'm')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
)
SELECT
  schema || '.' || objet                     AS "table",
  pg_size_pretty(total)                      AS "taille totale",
  pg_size_pretty(gros_champs)                AS "dont gros champs (JSON, textes)",
  pg_size_pretty(index)                      AS "dont index",
  lignes_estimees                            AS "lignes (estim.)",
  lignes_mortes                              AS "lignes mortes (à nettoyer)",
  round(100.0 * total / nullif(sum(total) OVER (), 0), 1) AS "% de la base"
FROM tailles
ORDER BY total DESC
LIMIT 25;
