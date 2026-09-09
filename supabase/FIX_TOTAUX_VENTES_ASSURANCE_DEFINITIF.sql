-- ============================================================================
-- OPTICLAIRE — CORRECTION DÉFINITIVE DES TOTAUX VENTES / ASSURANCE
--
-- IMPORTANT : la table public.ventes de certains projets ne possède PAS de
-- colonnes total_brut / total_net / recap. Ces champs sont alors conservés
-- dans la colonne JSONB `data` par le noyau supabaseDirect.ts.
--
-- Cette version fonctionne avec les DEUX schémas :
--   1) colonnes Postgres dédiées ;
--   2) données stockées dans `data` JSONB.
--
-- RÈGLE MÉTIER :
--   TOTAL     = somme réelle des lignes de vente avant remise
--   REMISE    = TOTAL × remise%
--   TOTAL NET = TOTAL - REMISE
--   BON ASSURANCE = prise en charge / règlement, JAMAIS une partie du TOTAL.
--
-- Exemple corrigé :
--   articles/verres = 30 000 F
--   bon assurance   = 100 000 F
--   => TOTAL = 30 000 F ; TOTAL NET = 30 000 F si remise 0%.
-- ============================================================================

DO $$
DECLARE
  has_data boolean;
  has_total_brut boolean;
  has_total_net boolean;
  has_recap boolean;
BEGIN
  IF to_regclass('public.ventes') IS NULL THEN
    RAISE NOTICE 'public.ventes absente : aucune correction nécessaire.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ventes' AND column_name='data'
  ) INTO has_data;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ventes' AND column_name='total_brut'
  ) INTO has_total_brut;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ventes' AND column_name='total_net'
  ) INTO has_total_net;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ventes' AND column_name='recap'
  ) INTO has_recap;

  RAISE NOTICE 'ventes: data=%, total_brut=%, total_net=%, recap=%',
    has_data, has_total_brut, has_total_net, has_recap;

  -- --------------------------------------------------------------------------
  -- CAS A : données dans data JSONB
  -- --------------------------------------------------------------------------
  IF has_data THEN
    EXECUTE $sql$
      WITH base AS (
        SELECT
          id,
          COALESCE(data, '{}'::jsonb) AS d
        FROM public.ventes
      ),
      calc AS (
        SELECT
          id,
          d,
          LEAST(100, GREATEST(0,
            COALESCE(NULLIF(d->'recap'->>'remisePct','')::numeric, 0)
          )) AS remise_pct,
          COALESCE(NULLIF(d->>'total_brut','')::numeric,
                   NULLIF(d->>'totalBrut','')::numeric, 0) AS brut_stocke,
          COALESCE(NULLIF(d->>'total_net','')::numeric,
                   NULLIF(d->>'totalNet','')::numeric, 0) AS net_stocke,
          COALESCE((
            SELECT SUM(
              CASE
                WHEN COALESCE(NULLIF(a->>'total','')::numeric,0) > 0
                  THEN COALESCE(NULLIF(a->>'total','')::numeric,0)
                ELSE
                  COALESCE(NULLIF(a->>'prix','')::numeric,0)
                  * GREATEST(1, COALESCE(NULLIF(a->>'quantite','')::numeric,1))
              END
            )
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(d->'articles')='array'
                   THEN d->'articles' ELSE '[]'::jsonb END
            ) a
          ),0)
          + COALESCE((
            SELECT SUM(
              CASE
                WHEN COALESCE(NULLIF(v->>'totalVerres','')::numeric,0) > 0
                  THEN COALESCE(NULLIF(v->>'totalVerres','')::numeric,0)
                WHEN COALESCE(NULLIF(v->>'total','')::numeric,0) > 0
                  THEN COALESCE(NULLIF(v->>'total','')::numeric,0)
                ELSE
                  COALESCE(NULLIF(v->'oeilDroit'->>'prix','')::numeric,0)
                  * GREATEST(1, COALESCE(NULLIF(v->'oeilDroit'->>'quantite','')::numeric,1))
                  + COALESCE(NULLIF(v->'oeilGauche'->>'prix','')::numeric,0)
                  * GREATEST(1, COALESCE(NULLIF(v->'oeilGauche'->>'quantite','')::numeric,1))
              END
            )
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(d->'verres')='array'
                   THEN d->'verres' ELSE '[]'::jsonb END
            ) v
          ),0) AS total_lignes
        FROM base
      ),
      final AS (
        SELECT
          id,
          d,
          remise_pct,
          CASE
            -- LES LIGNES SONT LA SOURCE DE VÉRITÉ.
            WHEN total_lignes > 0 THEN ROUND(total_lignes)
            WHEN brut_stocke > 0 THEN ROUND(brut_stocke)
            ELSE GREATEST(0, ROUND(net_stocke))
          END AS total_brut
        FROM calc
      )
      UPDATE public.ventes v
      SET data = jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       COALESCE(final.d, '{}'::jsonb),
                       '{total_brut}', to_jsonb(final.total_brut), true
                     ),
                     '{totalBrut}', to_jsonb(final.total_brut), true
                   ),
                   '{total_net}',
                   to_jsonb(GREATEST(0, ROUND(final.total_brut * (1 - final.remise_pct/100.0)))),
                   true
                 )
                 || jsonb_build_object(
                      'totalNet', GREATEST(0, ROUND(final.total_brut * (1 - final.remise_pct/100.0)))
                    )
      FROM final
      WHERE v.id = final.id
    $sql$;
  END IF;

  -- --------------------------------------------------------------------------
  -- CAS B : colonnes Postgres dédiées
  -- On ne référence les colonnes que si elles existent.
  -- --------------------------------------------------------------------------
  IF has_total_brut AND has_total_net THEN
    IF has_recap THEN
      EXECUTE $sql$
        WITH calc AS (
          SELECT
            v.id,
            LEAST(100, GREATEST(0,
              COALESCE(NULLIF(v.recap->>'remisePct','')::numeric,0)
            )) AS remise_pct,
            COALESCE(v.total_brut,0)::numeric AS brut_stocke,
            COALESCE(v.total_net,0)::numeric AS net_stocke
          FROM public.ventes v
        ),
        final AS (
          SELECT *,
            CASE
              WHEN brut_stocke > 0 THEN ROUND(brut_stocke)
              ELSE GREATEST(0, ROUND(net_stocke))
            END AS brut_corrige
          FROM calc
        )
        UPDATE public.ventes v
        SET total_brut = f.brut_corrige,
            total_net = GREATEST(0, ROUND(f.brut_corrige * (1 - f.remise_pct/100.0)))
        FROM final f
        WHERE v.id=f.id
      $sql$;
    ELSE
      EXECUTE $sql$
        UPDATE public.ventes
        SET total_brut = GREATEST(0, ROUND(COALESCE(total_brut, total_net, 0))),
            total_net  = GREATEST(0, ROUND(COALESCE(total_brut, total_net, 0)))
      $sql$;
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- TRIGGER UNIVERSEL : protège les futures INSERT/UPDATE sans supposer que
  -- total_net existe comme colonne. La fonction travaille d'abord en JSONB,
  -- puis réinjecte uniquement les champs réellement présents dans NEW.
  -- --------------------------------------------------------------------------
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.normaliser_totaux_vente()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      j jsonb := to_jsonb(NEW);
      d jsonb := CASE
                   WHEN jsonb_typeof(to_jsonb(NEW)->'data')='object'
                   THEN to_jsonb(NEW)->'data'
                   ELSE '{}'::jsonb
                 END;
      source jsonb;
      remise_pct numeric := 0;
      total_lignes numeric := 0;
      total_brut numeric := 0;
      total_net numeric := 0;
      brut_stocke numeric := 0;
      net_stocke numeric := 0;
      a jsonb;
      v jsonb;
    BEGIN
      -- Les colonnes réelles sont prioritaires sur data, comme fromRow().
      source := d || (j - 'data');

      remise_pct := LEAST(100, GREATEST(0,
        COALESCE(NULLIF(source->'recap'->>'remisePct','')::numeric,0)
      ));

      brut_stocke := GREATEST(
        COALESCE(NULLIF(source->>'total_brut','')::numeric,0),
        COALESCE(NULLIF(source->>'totalBrut','')::numeric,0)
      );
      net_stocke := GREATEST(
        COALESCE(NULLIF(source->>'total_net','')::numeric,0),
        COALESCE(NULLIF(source->>'totalNet','')::numeric,0)
      );

      -- Recalcul des lignes de vente.
      IF jsonb_typeof(source->'articles')='array' THEN
        FOR a IN SELECT value FROM jsonb_array_elements(source->'articles') LOOP
          IF COALESCE(NULLIF(a->>'total','')::numeric,0) > 0 THEN
            total_lignes := total_lignes + COALESCE(NULLIF(a->>'total','')::numeric,0);
          ELSE
            total_lignes := total_lignes
              + COALESCE(NULLIF(a->>'prix','')::numeric,0)
              * GREATEST(1, COALESCE(NULLIF(a->>'quantite','')::numeric,1));
          END IF;
        END LOOP;
      END IF;

      IF jsonb_typeof(source->'verres')='array' THEN
        FOR v IN SELECT value FROM jsonb_array_elements(source->'verres') LOOP
          IF COALESCE(NULLIF(v->>'totalVerres','')::numeric,0) > 0 THEN
            total_lignes := total_lignes + COALESCE(NULLIF(v->>'totalVerres','')::numeric,0);
          ELSIF COALESCE(NULLIF(v->>'total','')::numeric,0) > 0 THEN
            total_lignes := total_lignes + COALESCE(NULLIF(v->>'total','')::numeric,0);
          ELSE
            total_lignes := total_lignes
              + COALESCE(NULLIF(v->'oeilDroit'->>'prix','')::numeric,0)
                * GREATEST(1, COALESCE(NULLIF(v->'oeilDroit'->>'quantite','')::numeric,1))
              + COALESCE(NULLIF(v->'oeilGauche'->>'prix','')::numeric,0)
                * GREATEST(1, COALESCE(NULLIF(v->'oeilGauche'->>'quantite','')::numeric,1));
          END IF;
        END LOOP;
      END IF;

      -- Source de vérité : les lignes, puis brut stocké, puis net en dernier
      -- recours. Le montant d'un bon assurance n'est jamais utilisé ici.
      IF total_lignes > 0 THEN
        total_brut := ROUND(total_lignes);
      ELSIF brut_stocke > 0 THEN
        total_brut := ROUND(brut_stocke);
      ELSE
        total_brut := GREATEST(0, ROUND(net_stocke));
      END IF;

      total_net := GREATEST(0, ROUND(total_brut * (1 - remise_pct/100.0)));

      -- Réinjecte uniquement les clés qui correspondent réellement à des
      -- colonnes de la table. jsonb_populate_record ignore les autres clés.
      j := jsonb_build_object(
        'total_brut', total_brut,
        'total_net', total_net,
        'totalBrut', total_brut,
        'totalNet', total_net
      );

      IF to_jsonb(NEW) ? 'data' THEN
        d := jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(COALESCE(d,'{}'::jsonb), '{total_brut}', to_jsonb(total_brut), true),
              '{total_net}', to_jsonb(total_net), true
            ),
            '{totalBrut}', to_jsonb(total_brut), true
          ),
          '{totalNet}', to_jsonb(total_net), true
        );
        j := j || jsonb_build_object('data', d);
      END IF;

      NEW := jsonb_populate_record(NEW, j);
      RETURN NEW;
    END;
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_normaliser_totaux_vente ON public.ventes';
  EXECUTE 'CREATE TRIGGER trg_normaliser_totaux_vente BEFORE INSERT OR UPDATE ON public.ventes FOR EACH ROW EXECUTE FUNCTION public.normaliser_totaux_vente()';

  RAISE NOTICE 'Correction des totaux terminée. Les futurs enregistrements seront normalisés automatiquement.';
END $$;

NOTIFY pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- VÉRIFICATION SANS SUPPOSER L'EXISTENCE DE total_net COMME COLONNE.
-- Si data existe, cette requête affiche les ventes où TOTAL < TOTAL NET.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  has_data boolean;
  has_total_brut boolean;
  has_total_net boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ventes' AND column_name='data') INTO has_data;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ventes' AND column_name='total_brut') INTO has_total_brut;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ventes' AND column_name='total_net') INTO has_total_net;

  IF has_data THEN
    RAISE NOTICE 'Vérification data JSONB :';
    EXECUTE $q$
      SELECT id,
             COALESCE(NULLIF(data->>'total_brut','')::numeric,0) AS total,
             COALESCE(NULLIF(data->>'total_net','')::numeric,0) AS total_net,
             data->'recap'->>'remisePct' AS remise_pct
      FROM public.ventes
      WHERE COALESCE(NULLIF(data->>'total_brut','')::numeric,0)
          < COALESCE(NULLIF(data->>'total_net','')::numeric,0)
    $q$;
  ELSIF has_total_brut AND has_total_net THEN
    RAISE NOTICE 'Vérification colonnes dédiées :';
    EXECUTE 'SELECT id,total_brut,total_net FROM public.ventes WHERE COALESCE(total_brut,0) < COALESCE(total_net,0)';
  ELSE
    RAISE NOTICE 'Aucune structure de totaux reconnue dans public.ventes.';
  END IF;
END $$;
