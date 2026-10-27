-- ============================================================================
-- OPTICLAIRE — TOTAUX DES ANCIENS DOSSIERS IMPORTÉS (correction définitive)
--
-- À exécuter UNE fois dans Supabase → SQL Editor → Run.
--
-- PROBLÈME : le trigger `trg_normaliser_totaux_vente` (installé par
-- FIX_TOTAUX_VENTES_ASSURANCE_DEFINITIF.sql) recalculait le TOTAL de CHAQUE
-- vente à partir des lignes (monture + verres). Pour un ancien dossier dont le
-- prix des verres n'avait pas été lu, il ne restait que la MONTURE.
--
-- CORRECTION :
--   1. Le trigger respecte désormais les ventes importées : il conserve le
--      TOTAL / TOTAL NET de la facture d'origine (recap.totalBrutOrigine /
--      recap.totalNetOrigine, sinon les montants enregistrés).
--   2. Les prix des verres rangés par œil (`verres[].lignes`) sont comptés.
--   3. Les anciens dossiers déjà importés sont réparés : si la somme
--      monture + verres dépasse le total enregistré (= monture seule), le
--      total est rétabli à monture + verres, remise déduite.
--
-- Compatible avec les deux schémas de public.ventes (colonnes dédiées OU
-- champs rangés dans la colonne JSONB `data`). Ré-exécutable sans risque.
-- ============================================================================

-- Une vente est un ANCIEN DOSSIER importé ? (colonnes réelles prioritaires sur data)
CREATE OR REPLACE FUNCTION public.vente_est_importee(j jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    lower(COALESCE(src->'recap'->>'imported', '')) IN ('true', '1')
    OR COALESCE(src->>'source_import', '') = 'ancien_logiciel'
    OR COALESCE(src->>'import_id', '') <> ''
  FROM (
    SELECT CASE WHEN jsonb_typeof(j->'data') = 'object' THEN (j->'data') || (j - 'data') ELSE j END AS src
  ) s;
$$;

-- Montant JSON → numeric sans jamais lever d'erreur (texte, vide, espaces…).
CREATE OR REPLACE FUNCTION public.montant_json(x jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := regexp_replace(replace(COALESCE(x #>> '{}', ''), ',', '.'), '[^0-9.\-]', '', 'g');
BEGIN
  IF t = '' OR t = '.' OR t = '-' THEN RETURN 0; END IF;
  RETURN t::numeric;
EXCEPTION WHEN others THEN
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.normaliser_totaux_vente()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
DECLARE
  j jsonb := to_jsonb(NEW);
  d jsonb := CASE WHEN jsonb_typeof(to_jsonb(NEW)->'data') = 'object' THEN to_jsonb(NEW)->'data' ELSE '{}'::jsonb END;
  source jsonb;
  remise_pct numeric := 0;
  total_lignes numeric := 0;
  total_brut numeric := 0;
  total_net numeric := 0;
  brut_stocke numeric := 0;
  net_stocke numeric := 0;
  brut_origine numeric := 0;
  net_origine numeric := 0;
  lignes_oeil numeric := 0;
  a jsonb;
  v jsonb;
  l jsonb;
BEGIN
  -- Les colonnes réelles sont prioritaires sur data, comme fromRow().
  source := d || (j - 'data');

  remise_pct := LEAST(100, GREATEST(0, public.montant_json(source->'recap'->'remisePct')));
  brut_stocke := GREATEST(public.montant_json(source->'total_brut'), public.montant_json(source->'totalBrut'));
  net_stocke := GREATEST(public.montant_json(source->'total_net'), public.montant_json(source->'totalNet'));

  -- Somme des lignes : monture/articles + verres.
  IF jsonb_typeof(source->'articles') = 'array' THEN
    FOR a IN SELECT value FROM jsonb_array_elements(source->'articles') LOOP
      IF public.montant_json(a->'total') > 0 THEN
        total_lignes := total_lignes + public.montant_json(a->'total');
      ELSE
        total_lignes := total_lignes + public.montant_json(a->'prix') * GREATEST(1, NULLIF(public.montant_json(a->'quantite'), 0));
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(source->'verres') = 'array' THEN
    FOR v IN SELECT value FROM jsonb_array_elements(source->'verres') LOOP
      IF public.montant_json(v->'totalVerres') > 0 THEN
        total_lignes := total_lignes + public.montant_json(v->'totalVerres');
      ELSIF public.montant_json(v->'total') > 0 THEN
        total_lignes := total_lignes + public.montant_json(v->'total');
      ELSIF public.montant_json(v->'oeilDroit'->'prix') + public.montant_json(v->'oeilGauche'->'prix') > 0 THEN
        total_lignes := total_lignes
          + public.montant_json(v->'oeilDroit'->'prix') * GREATEST(1, NULLIF(public.montant_json(v->'oeilDroit'->'quantite'), 0))
          + public.montant_json(v->'oeilGauche'->'prix') * GREATEST(1, NULLIF(public.montant_json(v->'oeilGauche'->'quantite'), 0));
      ELSIF jsonb_typeof(v->'lignes') = 'array' THEN
        -- Verres d'un ancien dossier importé : un prix par œil dans `lignes`.
        lignes_oeil := 0;
        FOR l IN SELECT value FROM jsonb_array_elements(v->'lignes') LOOP
          IF public.montant_json(l->'total') > 0 THEN
            lignes_oeil := lignes_oeil + public.montant_json(l->'total');
          ELSE
            lignes_oeil := lignes_oeil + public.montant_json(l->'prix') * GREATEST(1, NULLIF(public.montant_json(l->'quantite'), 0));
          END IF;
        END LOOP;
        total_lignes := total_lignes + lignes_oeil;
      END IF;
    END LOOP;
  END IF;

  IF public.vente_est_importee(j) THEN
    -- ── ANCIEN DOSSIER : les montants de la facture d'origine font foi ──
    brut_origine := public.montant_json(source->'recap'->'totalBrutOrigine');
    net_origine := public.montant_json(source->'recap'->'totalNetOrigine');
    IF brut_origine > 0 OR net_origine > 0 THEN
      total_net := CASE WHEN net_origine > 0 THEN net_origine ELSE brut_origine END;
      total_brut := GREATEST(brut_origine, total_net);
    ELSIF total_lignes > GREATEST(brut_stocke, net_stocke) THEN
      -- Total enregistré inférieur à monture + verres : il avait été réduit
      -- à la monture seule. On rétablit monture + verres, remise déduite.
      total_brut := total_lignes;
      total_net := GREATEST(0, total_brut * (1 - remise_pct / 100.0));
    ELSE
      total_brut := CASE WHEN brut_stocke > 0 THEN brut_stocke ELSE net_stocke END;
      total_net := CASE WHEN net_stocke > 0 THEN net_stocke ELSE total_brut END;
      total_brut := GREATEST(total_brut, total_net);
    END IF;
  ELSE
    -- ── VENTE NORMALE : règle inchangée (lignes, puis brut, puis net) ──
    IF total_lignes > 0 THEN
      total_brut := total_lignes;
    ELSIF brut_stocke > 0 THEN
      total_brut := brut_stocke;
    ELSE
      total_brut := GREATEST(0, net_stocke);
    END IF;
    total_net := GREATEST(0, total_brut * (1 - remise_pct / 100.0));
  END IF;

  total_brut := ROUND(total_brut);
  total_net := ROUND(total_net);

  -- Réinjecte uniquement les clés correspondant à de vraies colonnes
  -- (jsonb_populate_record ignore les autres).
  j := jsonb_build_object('total_brut', total_brut, 'total_net', total_net, 'totalBrut', total_brut, 'totalNet', total_net);
  IF to_jsonb(NEW) ? 'data' THEN
    d := COALESCE(d, '{}'::jsonb)
      || jsonb_build_object('total_brut', total_brut, 'total_net', total_net, 'totalBrut', total_brut, 'totalNet', total_net);
    j := j || jsonb_build_object('data', d);
  END IF;

  NEW := jsonb_populate_record(NEW, j);
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_normaliser_totaux_vente ON public.ventes;
CREATE TRIGGER trg_normaliser_totaux_vente
  BEFORE INSERT OR UPDATE ON public.ventes
  FOR EACH ROW EXECUTE FUNCTION public.normaliser_totaux_vente();

-- Réparation des anciens dossiers déjà importés : la mise à jour « à vide »
-- fait repasser chaque vente importée dans le trigger corrigé ci-dessus.
UPDATE public.ventes v SET id = v.id WHERE public.vente_est_importee(to_jsonb(v.*));

NOTIFY pgrst, 'reload schema';

-- Contrôle : anciens dossiers importés et leurs totaux après correction.
SELECT
  v.id,
  COALESCE(to_jsonb(v.*)->>'client', to_jsonb(v.*)->'data'->>'client') AS client,
  COALESCE(to_jsonb(v.*)->>'total_brut', to_jsonb(v.*)->'data'->>'total_brut') AS total,
  COALESCE(to_jsonb(v.*)->>'total_net', to_jsonb(v.*)->'data'->>'total_net') AS total_net
FROM public.ventes v
WHERE public.vente_est_importee(to_jsonb(v.*))
ORDER BY 1 DESC
LIMIT 50;
