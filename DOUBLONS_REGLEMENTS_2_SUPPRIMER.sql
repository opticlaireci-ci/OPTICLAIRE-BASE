-- ============================================================================
-- OPTICLAIRE — RÈGLEMENTS ENREGISTRÉS EN DOUBLE : ÉTAPE 2 / 2 — SUPPRIMER
--
-- À lancer APRÈS l'étape 1 (DOUBLONS_REGLEMENTS_1_VERIFIER.sql).
-- Supprime UNIQUEMENT les lignes « DOUBLON » de l'étape 1 : même facture, même
-- montant, même mode, même caissière, ressaisi moins de 10 minutes après.
-- Le PREMIER enregistrement de chaque série est conservé.
-- Les lignes « À VÉRIFIER » ne sont PAS touchées.
-- Sécurité : chaque ligne supprimée est d'abord COPIÉE dans la table
-- public.sauvegarde_reglements_en_double (restauration possible).
-- Le résultat liste les règlements supprimés.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sauvegarde_reglements_en_double AS
  SELECT * FROM public.reglements WHERE false;

WITH r AS (
  SELECT t.id::text AS id,
    CASE WHEN jsonb_typeof(to_jsonb(t.*)->'data') = 'object'
         THEN (to_jsonb(t.*)->'data') || (to_jsonb(t.*) - 'data')
         ELSE to_jsonb(t.*) END AS s
  FROM public.reglements t
),
x AS (
  SELECT id,
    coalesce(s->>'vente_id', '')                                  AS vente_id,
    round(coalesce(nullif(s->>'montant', '')::numeric, 0))        AS montant,
    lower(trim(coalesce(s->>'mode_paiement', '')))                AS mode,
    trim(coalesce(s->>'edite_par', ''))                           AS par,
    CASE WHEN coalesce(s->>'created_at', s->>'date', '') ~ '^\d{4}-\d{2}-\d{2}'
         THEN coalesce(s->>'created_at', s->>'date')::timestamptz END AS cree
  FROM r
  WHERE coalesce(s->>'vente_id', '') <> ''
    AND upper(trim(coalesce(s->>'edite_par', ''))) <> 'IMPORT ANCIEN CLIENT'
    AND id NOT LIKE 'reg-import-%'
),
ordonnes AS (
  SELECT x.*,
    lag(cree) OVER (PARTITION BY vente_id, montant, mode, lower(par) ORDER BY cree NULLS LAST, id) AS cree_precedent
  FROM x
),
a_supprimer AS (
  SELECT id FROM ordonnes
  WHERE cree_precedent IS NOT NULL
    AND cree - cree_precedent <= interval '10 minutes'
),
sauvegarde AS (
  INSERT INTO public.sauvegarde_reglements_en_double
  SELECT t.* FROM public.reglements t WHERE t.id::text IN (SELECT id FROM a_supprimer)
  RETURNING 1
)
DELETE FROM public.reglements t
WHERE t.id::text IN (SELECT id FROM a_supprimer)
RETURNING t.id AS reglement_supprime;
