-- ============================================================================
-- OPTICLAIRE — CORRECTION DÉFINITIVE DES TOTAUX DES VENTES / FACTURES
--
-- Règle métier :
--   TOTAL = brut avant remise
--   TOTAL NET = TOTAL - remise
--   Un bon d'assurance est un règlement/prise en charge et ne modifie jamais
--   le TOTAL ou le TOTAL NET.
--
-- Corrige notamment les anciennes lignes où :
--   total_brut = 0, total_net = 100000
--   ou total_brut < total_net.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.ventes') IS NULL THEN
    RAISE NOTICE 'Table public.ventes absente : aucune migration nécessaire.';
    RETURN;
  END IF;

  -- Sécurité : ne corrige que les lignes incohérentes.
  -- Le brut minimal est au moins égal au net enregistré.
  -- En présence d'une remise, on remonte le brut pour que le net reste
  -- mathématiquement compatible avec le pourcentage de remise.
  EXECUTE $sql$
    UPDATE public.ventes
    SET total_brut = x.total_brut,
        total_net  = x.total_net
    FROM (
      SELECT
        id,
        CASE
          WHEN COALESCE(total_net, 0) > COALESCE(total_brut, 0)
               AND COALESCE(NULLIF((recap->>'remisePct'), '')::numeric, 0) > 0
               AND COALESCE(NULLIF((recap->>'remisePct'), '')::numeric, 0) < 100
            THEN GREATEST(
              COALESCE(total_brut, 0),
              COALESCE(total_net, 0),
              ROUND(COALESCE(total_net, 0) / (1 - COALESCE(NULLIF((recap->>'remisePct'), '')::numeric, 0) / 100.0))
            )
          ELSE GREATEST(COALESCE(total_brut, 0), COALESCE(total_net, 0), 0)
        END AS total_brut,
        COALESCE(NULLIF((recap->>'remisePct'), '')::numeric, 0) AS remise_pct
      FROM public.ventes
      WHERE COALESCE(total_brut, 0) < COALESCE(total_net, 0)
         OR COALESCE(total_brut, 0) = 0 AND COALESCE(total_net, 0) > 0
    ) base
    CROSS JOIN LATERAL (
      SELECT
        base.total_brut,
        GREATEST(0, ROUND(base.total_brut * (1 - LEAST(100, GREATEST(0, base.remise_pct)) / 100.0))) AS total_net
    ) x
    WHERE public.ventes.id = x.id
  $sql$;

  -- Trigger : même si une autre partie de l'application écrit directement dans
  -- public.ventes, la base refuse désormais toute inversion TOTAL/TOTAL NET et
  -- la corrige automatiquement avant INSERT/UPDATE.
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.normaliser_totaux_vente()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      pct numeric := LEAST(100, GREATEST(0, COALESCE(NULLIF(NEW.recap->>'remisePct','')::numeric, 0)));
      brut numeric := GREATEST(COALESCE(NEW.total_brut, 0), COALESCE(NEW.total_net, 0), 0);
      net_enregistre numeric := GREATEST(COALESCE(NEW.total_net, 0), 0);
    BEGIN
      IF pct > 0 AND pct < 100 AND net_enregistre > 0 THEN
        brut := GREATEST(brut, ROUND(net_enregistre / (1 - pct / 100.0)));
      END IF;
      NEW.total_brut := ROUND(brut);
      NEW.total_net := GREATEST(0, ROUND(brut * (1 - pct / 100.0)));
      RETURN NEW;
    END;
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_normaliser_totaux_vente ON public.ventes';
  EXECUTE 'CREATE TRIGGER trg_normaliser_totaux_vente BEFORE INSERT OR UPDATE OF total_brut, total_net, recap ON public.ventes FOR EACH ROW EXECUTE FUNCTION public.normaliser_totaux_vente()';

  -- Contrainte de cohérence : impossible désormais d'avoir TOTAL < TOTAL NET.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ventes'::regclass
      AND conname = 'ventes_totaux_coherents_chk'
  ) THEN
    EXECUTE 'ALTER TABLE public.ventes ADD CONSTRAINT ventes_totaux_coherents_chk CHECK (COALESCE(total_brut,0) >= COALESCE(total_net,0) AND COALESCE(total_net,0) >= 0) NOT VALID';
  END IF;

  EXECUTE 'ALTER TABLE public.ventes VALIDATE CONSTRAINT ventes_totaux_coherents_chk';
END $$;

NOTIFY pgrst, 'reload schema';

-- Vérification : doit retourner 0 ligne.
SELECT id, total_brut, total_net, recap->>'remisePct' AS remise_pct
FROM public.ventes
WHERE COALESCE(total_brut, 0) < COALESCE(total_net, 0)
   OR COALESCE(total_net, 0) < 0;
