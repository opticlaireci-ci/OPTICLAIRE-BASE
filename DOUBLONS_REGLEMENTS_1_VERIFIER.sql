-- ============================================================================
-- OPTICLAIRE — RÈGLEMENTS ENREGISTRÉS EN DOUBLE : ÉTAPE 1 / 2 — VÉRIFIER
--
-- Ne modifie RIEN. Supabase → SQL Editor → coller TOUT → Run.
--
-- Un même paiement a pu être enregistré deux fois (double clic sur
-- « Enregistrer », ou nouvelle saisie après un message d'erreur réseau) :
-- la facture paraît alors « Soldée » avec un reste négatif (ex. -45 000).
--
-- Colonne « diagnostic » :
--   • DOUBLON      : même facture, même montant, même mode, même caissière,
--                    ressaisi moins de 10 minutes après → SUPPRIMÉ par l'étape 2
--                    (le PREMIER enregistrement est conservé) ;
--   • À VÉRIFIER   : même facture et même montant le même jour, mais à plus de
--                    10 minutes d'écart → peut être un vrai second paiement.
--                    Si c'est un doublon, le supprimer dans l'application :
--                    Vente | Facture → la facture → Règlements → « Supprimer ».
-- Les règlements des anciens dossiers importés ne sont pas concernés.
-- ============================================================================

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
    coalesce(s->>'magasin_id', '')                                AS magasin,
    round(coalesce(nullif(s->>'montant', '')::numeric, 0))        AS montant,
    lower(trim(coalesce(s->>'mode_paiement', '')))                AS mode,
    trim(coalesce(s->>'edite_par', ''))                           AS par,
    coalesce(s->>'recu', '')                                      AS recu,
    CASE WHEN coalesce(s->>'created_at', s->>'date', '') ~ '^\d{4}-\d{2}-\d{2}'
         THEN coalesce(s->>'created_at', s->>'date')::timestamptz END AS cree
  FROM r
  WHERE coalesce(s->>'vente_id', '') <> ''
    AND upper(trim(coalesce(s->>'edite_par', ''))) <> 'IMPORT ANCIEN CLIENT'
    AND id NOT LIKE 'reg-import-%'
),
ordonnes AS (
  SELECT x.*,
    lag(cree) OVER w AS cree_precedent,
    lag(id)   OVER w AS id_precedent,
    lag(recu) OVER w AS recu_precedent
  FROM x
  WINDOW w AS (PARTITION BY vente_id, montant, mode, lower(par) ORDER BY cree NULLS LAST, id)
),
ventes AS (
  SELECT t.id::text AS id,
    CASE WHEN jsonb_typeof(to_jsonb(t.*)->'data') = 'object'
         THEN (to_jsonb(t.*)->'data') || (to_jsonb(t.*) - 'data')
         ELSE to_jsonb(t.*) END AS s
  FROM public.ventes t
)
SELECT
  CASE WHEN o.cree - o.cree_precedent <= interval '10 minutes'
       THEN 'DOUBLON (supprimé à l''étape 2)'
       ELSE 'À VÉRIFIER (même jour)' END             AS diagnostic,
  o.magasin,
  v.s->'recap'->>'numFacture'                         AS facture,
  v.s->>'client'                                      AS client,
  o.montant,
  o.mode,
  o.par                                               AS edite_par,
  o.recu_precedent                                    AS recu_conserve,
  o.cree_precedent                                    AS premier_enregistrement,
  o.recu                                              AS recu_en_double,
  o.cree                                              AS enregistre_en_double_le,
  o.id                                                AS id_reglement_en_double
FROM ordonnes o
LEFT JOIN ventes v ON v.id = o.vente_id
WHERE o.cree_precedent IS NOT NULL
  AND (o.cree - o.cree_precedent <= interval '10 minutes'
       OR o.cree::date = o.cree_precedent::date)
ORDER BY o.magasin, facture, o.cree;
