-- ============================================================================
-- OPTICLAIRE — CONTRÔLE DE SANTÉ SUPABASE (LECTURE SEULE)
--
-- Supabase → SQL Editor → coller TOUT → Run. Ne modifie RIEN.
-- Résultat : un tableau « contrôle / état / détail ». Tout doit être OK (ou
-- INFO). Envoyez une capture si une ligne affiche ATTENTION ou PROBLÈME.
-- ============================================================================
WITH
-- Exécute une requête si la table existe, sinon renvoie la valeur par défaut.
tables_metier(nom) AS (
  VALUES ('ventes'), ('reglements'), ('clients'), ('factures_assurance'), ('bons'),
         ('mouvements_stock'), ('inventaires'), ('rdv_enligne'), ('app_data'),
         ('kv_store_10865fd7'), ('bons_commande_verres'), ('reglements_assurance')
),
rls AS (
  SELECT t.nom, c.relrowsecurity AS active
  FROM tables_metier t JOIN pg_class c ON c.oid = to_regclass('public.' || t.nom)
),
connexions AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE state = 'active') AS actives,
         count(*) FILTER (WHERE state = 'idle in transaction') AS bloquees,
         (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS maxi
  FROM pg_stat_activity
),
longues AS (
  SELECT count(*) AS n FROM pg_stat_activity
  WHERE state = 'active' AND now() - query_start > interval '1 minute' AND pid <> pg_backend_pid()
),
morts AS (
  SELECT relname, n_live_tup, n_dead_tup
  FROM pg_stat_user_tables
  WHERE schemaname = 'public' AND n_dead_tup > 10000 AND n_dead_tup > n_live_tup * 0.3
),
index_attendus(table_, colonne) AS (
  VALUES ('ventes', 'magasin_id'), ('ventes', 'updated_at'), ('reglements', 'vente_id'),
         ('reglements', 'magasin_id'), ('clients', 'magasin_id'), ('mouvements_stock', 'bon_id')
),
index_manquants AS (
  SELECT i.table_ || '.' || i.colonne AS manquant
  FROM index_attendus i
  WHERE to_regclass('public.' || i.table_) IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = i.table_ AND c.column_name = i.colonne)
    AND NOT EXISTS (
      SELECT 1 FROM pg_index x
      JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = x.indkey[0]
      WHERE x.indrelid = to_regclass('public.' || i.table_) AND a.attname = i.colonne)
),
compteurs AS (
  SELECT (xpath('/row/v/text()', x))[1]::text AS detail
  FROM unnest(xpath('/table/row', query_to_xml(
    CASE WHEN to_regclass('public.compteurs') IS NULL
      THEN 'SELECT NULL::text AS v WHERE false'
      ELSE 'SELECT string_agg(nom || '' = '' || valeur, '', '' ORDER BY nom) AS v FROM public.compteurs' END,
    true, false, ''))) AS x
),
cles_appareil AS (
  SELECT count(*) AS n FROM public.app_data
  WHERE key IN ('leclaire_pending_cloud_writes_v2', 'leclaire_magasin_actuel') OR key LIKE 'leclaire\_stock\_cache\_%'
)
SELECT * FROM (
  SELECT 1 AS ordre, 'Taille de la base' AS controle,
         CASE WHEN pg_database_size(current_database()) > 1.6e9 THEN 'ATTENTION' ELSE 'OK' END AS etat,
         pg_size_pretty(pg_database_size(current_database())) || ' (offre : 2 Go de disque)' AS detail
  UNION ALL
  SELECT 2, 'Connexions ouvertes',
         CASE WHEN total > maxi * 0.8 THEN 'ATTENTION' ELSE 'OK' END,
         total || ' / ' || maxi || ' (dont ' || actives || ' actives, ' || bloquees || ' bloquées en transaction)'
  FROM connexions
  UNION ALL
  SELECT 3, 'Requêtes de plus d''1 minute', CASE WHEN n > 0 THEN 'ATTENTION' ELSE 'OK' END, n || ' en cours' FROM longues
  UNION ALL
  SELECT 4, 'Sécurité (RLS) des tables',
         CASE WHEN bool_and(active) THEN 'OK' ELSE 'PROBLÈME' END,
         coalesce('Sans RLS : ' || string_agg(nom, ', ') FILTER (WHERE NOT active), 'activée sur ' || count(*) || ' tables')
  FROM rls
  UNION ALL
  SELECT 5, 'Index de rapidité',
         CASE WHEN count(*) = 0 THEN 'OK' ELSE 'ATTENTION' END,
         coalesce('Manquants : ' || string_agg(manquant, ', ') || ' → exécuter INDEX_RAPIDITE.sql', 'tous présents')
  FROM index_manquants
  UNION ALL
  SELECT 6, 'Tables à nettoyer (lignes mortes)',
         CASE WHEN count(*) = 0 THEN 'OK' ELSE 'INFO' END,
         coalesce(string_agg(relname || ' : ' || n_dead_tup || ' mortes / ' || n_live_tup, ', '), 'rien à signaler')
  FROM morts
  UNION ALL
  SELECT 7, 'Numérotation commune (factures, reçus…)',
         CASE WHEN to_regprocedure('public.prochain_numero(text)') IS NULL THEN 'PROBLÈME' ELSE 'OK' END,
         CASE WHEN to_regprocedure('public.prochain_numero(text)') IS NULL
              THEN 'non installée → exécuter NUMEROTATION_FACTURES.sql'
              ELSE coalesce((SELECT detail FROM compteurs), 'installée') END
  UNION ALL
  SELECT 8, 'Clés propres aux appareils dans app_data',
         CASE WHEN n = 0 THEN 'OK' ELSE 'INFO' END,
         CASE WHEN n = 0 THEN 'aucune' ELSE n || ' → exécuter NETTOYAGE_CLES_APPAREIL.sql' END
  FROM cles_appareil
  UNION ALL
  SELECT 9, 'Taille des réglages (app_data)',
         CASE WHEN pg_total_relation_size('public.app_data') > 20e6 THEN 'ATTENTION' ELSE 'OK' END,
         pg_size_pretty(pg_total_relation_size('public.app_data'))
  UNION ALL
  SELECT 10, 'Ventes sans magasin',
         CASE WHEN count(*) = 0 THEN 'OK' ELSE 'ATTENTION' END,
         count(*) || ' vente(s)'
  FROM public.ventes WHERE coalesce(magasin_id, '') = ''
  UNION ALL
  SELECT 11, 'Nombre de ventes par magasin', 'INFO',
         (SELECT string_agg(m || ' : ' || n, ', ' ORDER BY m)
          FROM (SELECT coalesce(magasin_id, '?') m, count(*) n FROM public.ventes GROUP BY 1) s)
) r
ORDER BY ordre;
