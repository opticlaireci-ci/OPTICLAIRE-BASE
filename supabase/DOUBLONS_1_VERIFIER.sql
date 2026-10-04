-- ============================================================================
-- OPTICLAIRE — DOUBLONS D'ANCIENS DOSSIERS : ÉTAPE 1 / 2 — VÉRIFIER
--
-- Ne modifie RIEN. Liste les anciens dossiers importés plusieurs fois.
-- Supabase → SQL Editor → coller → Run.
--
-- Un même dossier = même magasin + même n° client + même date de vente
-- + même n° de facture. Pour chaque groupe, la colonne « garde » indique la
-- vente qui sera CONSERVÉE par l'étape 2 (celle qui a les bons totaux) ; les
-- autres seront supprimées.
-- ============================================================================

WITH v AS (
  SELECT
    t.id,
    CASE WHEN jsonb_typeof(to_jsonb(t.*)->'data') = 'object'
         THEN (to_jsonb(t.*)->'data') || (to_jsonb(t.*) - 'data')
         ELSE to_jsonb(t.*) END AS s
  FROM public.ventes t
),
importees AS (
  SELECT
    id, s,
    upper(trim(coalesce(s->>'magasin_id', '')))   AS magasin,
    upper(trim(coalesce(s->>'numero_client', ''))) AS client_num,
    left(coalesce(s->>'date', ''), 10)            AS date_vente,
    upper(trim(coalesce(s->'recap'->>'numFacture', ''))) AS facture
  FROM v
  WHERE lower(coalesce(s->'recap'->>'imported', '')) IN ('true', '1')
     OR coalesce(s->>'source_import', '') = 'ancien_logiciel'
     OR coalesce(s->>'import_id', '') <> ''
),
cles AS (
  SELECT *,
    magasin || '|' || client_num || '|' || date_vente || '|' ||
      CASE WHEN facture ~ '^IMP-[0-9]{10,}$' THEN '' ELSE facture END AS cle
  FROM importees
  WHERE client_num <> '' AND client_num !~ '^IMP-[0-9]{8,}$'
),
classees AS (
  SELECT *,
    count(*) OVER (PARTITION BY cle) AS nb,
    row_number() OVER (
      PARTITION BY cle
      ORDER BY (s->'recap' ? 'totalNetOrigine') DESC,
               CASE WHEN coalesce(s->>'total_brut', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (s->>'total_brut')::numeric ELSE 0 END DESC,
               coalesce(s->>'updated_at', '') DESC,
               id
    ) AS rang
  FROM cles
)
SELECT
  magasin,
  client_num                       AS n_client,
  s->>'client'                     AS client,
  date_vente,
  facture,
  nb                               AS exemplaires,
  CASE WHEN rang = 1 THEN 'GARDÉE' ELSE 'à supprimer' END AS garde,
  s->>'total_brut'                 AS total,
  s->>'total_net'                  AS total_net,
  id
FROM classees
WHERE nb > 1
ORDER BY magasin, client, date_vente, rang;

-- Résumé : nombre de dossiers en double et de ventes qui seront supprimées.
WITH v AS (
  SELECT t.id,
    CASE WHEN jsonb_typeof(to_jsonb(t.*)->'data') = 'object'
         THEN (to_jsonb(t.*)->'data') || (to_jsonb(t.*) - 'data') ELSE to_jsonb(t.*) END AS s
  FROM public.ventes t
),
cles AS (
  SELECT id,
    upper(trim(coalesce(s->>'magasin_id', ''))) || '|' || upper(trim(coalesce(s->>'numero_client', ''))) || '|' ||
    left(coalesce(s->>'date', ''), 10) || '|' ||
    CASE WHEN upper(trim(coalesce(s->'recap'->>'numFacture', ''))) ~ '^IMP-[0-9]{10,}$' THEN ''
         ELSE upper(trim(coalesce(s->'recap'->>'numFacture', ''))) END AS cle
  FROM v
  WHERE (lower(coalesce(s->'recap'->>'imported', '')) IN ('true', '1')
         OR coalesce(s->>'source_import', '') = 'ancien_logiciel'
         OR coalesce(s->>'import_id', '') <> '')
    AND upper(trim(coalesce(s->>'numero_client', ''))) <> ''
    AND upper(trim(coalesce(s->>'numero_client', ''))) !~ '^IMP-[0-9]{8,}$'
)
SELECT
  count(*) FILTER (WHERE nb > 1)            AS dossiers_en_double,
  coalesce(sum(nb - 1) FILTER (WHERE nb > 1), 0) AS ventes_a_supprimer
FROM (SELECT cle, count(*) AS nb FROM cles GROUP BY cle) g;
