-- ============================================================================
-- OPTICLAIRE — DOUBLONS D'ANCIENS DOSSIERS : ÉTAPE 2 / 2 — SUPPRIMER
--
-- À exécuter APRÈS avoir vérifié la liste de l'étape 1 (DOUBLONS_1_VERIFIER.sql).
-- Supabase → SQL Editor → coller → Run.
--
-- Pour chaque ancien dossier importé plusieurs fois (même magasin + n° client
-- + date + n° facture), on GARDE UNE seule vente — celle qui a les bons totaux
-- (montants d'origine), sinon le plus grand total, sinon la plus récente — et :
--   • les copies en trop sont supprimées ;
--   • leurs règlements « importés » (copies de ceux de la vente gardée) sont
--     supprimés ;
--   • un règlement saisi À LA MAIN sur une copie n'est PAS perdu : il est
--     rattaché à la vente gardée ;
--   • leurs pièces jointes en double (documents_importes) sont supprimées.
--
-- SÉCURITÉ : tout ce qui est supprimé est d'abord COPIÉ dans les tables
-- sauvegarde_doublons_ventes et sauvegarde_doublons_reglements.
-- Tout se fait dans UNE transaction : en cas d'erreur, rien n'est modifié.
-- ============================================================================

BEGIN;

-- 1) Correspondance « copie à supprimer » → « vente gardée ».
CREATE TEMP TABLE doublons ON COMMIT DROP AS
WITH v AS (
  SELECT t.id,
    CASE WHEN jsonb_typeof(to_jsonb(t.*)->'data') = 'object'
         THEN (to_jsonb(t.*)->'data') || (to_jsonb(t.*) - 'data') ELSE to_jsonb(t.*) END AS s
  FROM public.ventes t
),
cles AS (
  SELECT id, s,
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
),
classees AS (
  SELECT id, cle,
    row_number() OVER (
      PARTITION BY cle
      ORDER BY (s->'recap' ? 'totalNetOrigine') DESC,
               CASE WHEN coalesce(s->>'total_brut', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (s->>'total_brut')::numeric ELSE 0 END DESC,
               coalesce(s->>'updated_at', '') DESC,
               id
    ) AS rang
  FROM cles
)
SELECT c.id AS id_copie, g.id AS id_garde
FROM classees c
JOIN classees g ON g.cle = c.cle AND g.rang = 1
WHERE c.rang > 1;

-- 2) Sauvegarde des ventes supprimées.
CREATE TABLE IF NOT EXISTS public.sauvegarde_doublons_ventes AS
  SELECT * FROM public.ventes WHERE false;
INSERT INTO public.sauvegarde_doublons_ventes
  SELECT t.* FROM public.ventes t WHERE t.id IN (SELECT id_copie FROM doublons);

-- 3) Règlements des copies (colonne vente_id réelle OU rangée dans data).
DO $$
DECLARE
  col_vente boolean;
  col_data boolean;
  expr text;
BEGIN
  IF to_regclass('public.reglements') IS NULL THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'reglements' AND column_name = 'vente_id') INTO col_vente;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'reglements' AND column_name = 'data') INTO col_data;
  IF NOT col_vente AND NOT col_data THEN RETURN; END IF;
  expr := CASE WHEN col_vente AND col_data THEN 'coalesce(r.vente_id::text, r.data->>''vente_id'')'
               WHEN col_vente THEN 'r.vente_id::text'
               ELSE 'r.data->>''vente_id''' END;

  EXECUTE 'CREATE TABLE IF NOT EXISTS public.sauvegarde_doublons_reglements AS SELECT * FROM public.reglements WHERE false';
  EXECUTE format('INSERT INTO public.sauvegarde_doublons_reglements
                  SELECT r.* FROM public.reglements r WHERE %s IN (SELECT id_copie FROM doublons)', expr);

  -- Règlements importés automatiquement : copies → supprimés.
  EXECUTE format('DELETE FROM public.reglements r
                  WHERE %s IN (SELECT id_copie FROM doublons) AND r.id::text LIKE ''reg-import-%%''', expr);

  -- Règlements saisis à la main sur une copie → rattachés à la vente gardée.
  IF col_vente THEN
    EXECUTE 'UPDATE public.reglements r SET vente_id = d.id_garde
             FROM doublons d WHERE r.vente_id::text = d.id_copie';
  END IF;
  IF col_data THEN
    EXECUTE 'UPDATE public.reglements r SET data = jsonb_set(r.data, ''{vente_id}'', to_jsonb(d.id_garde))
             FROM doublons d WHERE r.data->>''vente_id'' = d.id_copie';
  END IF;
END $$;

-- 4) Pièces jointes en double (stockées dans app_data).
DO $$
BEGIN
  IF to_regclass('public.app_data') IS NOT NULL THEN
    DELETE FROM public.app_data a
    WHERE a.key LIKE 'documents_importes:%'
      AND a.value->>'vente_id' IN (SELECT id_copie FROM doublons);
  END IF;
END $$;

-- 5) Suppression des ventes en double.
DELETE FROM public.ventes t WHERE t.id IN (SELECT id_copie FROM doublons);

-- Bilan
SELECT count(*) AS ventes_en_double_supprimees FROM doublons;

COMMIT;
