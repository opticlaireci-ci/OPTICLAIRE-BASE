-- ============================================================================
-- OPTICLAIRE — DOUBLONS D'ANCIENS DOSSIERS : ÉTAPE 2 / 2 — SUPPRIMER
--
-- À exécuter APRÈS avoir vérifié la liste de l'étape 1 (DOUBLONS_1_VERIFIER.sql).
-- Supabase → SQL Editor → coller TOUT le fichier → Run.
--
-- Pour chaque ancien dossier importé plusieurs fois (même magasin + n° client
-- + date + n° facture), on GARDE UNE seule vente — celle qui a les bons totaux
-- (montants d'origine), sinon le plus grand total, sinon la plus récente — et :
--   • les copies en trop sont supprimées ;
--   • leurs règlements « importés » (reg-import-…, copies de ceux de la vente
--     gardée) sont supprimés ;
--   • un règlement saisi À LA MAIN sur une copie n'est PAS perdu : il est
--     rattaché à la vente gardée ;
--   • leurs pièces jointes en double (documents_importes) sont supprimées.
--
-- Seules les ventes IMPORTÉES (anciens dossiers) sont concernées : une vente
-- saisie dans l'application n'est jamais touchée.
--
-- SÉCURITÉ :
--   • tout ce qui est supprimé est d'abord COPIÉ dans les tables
--     sauvegarde_doublons_ventes et sauvegarde_doublons_reglements ;
--   • la correspondance copie → vente gardée est notée dans
--     journal_doublons_supprimes ;
--   • tout le traitement est UN SEUL bloc : en cas d'erreur, rien n'est modifié.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.journal_doublons_supprimes (
  id_copie   text,
  id_garde   text,
  supprime_le timestamptz DEFAULT now()
);

DO $$
DECLARE
  debut timestamptz := clock_timestamp();
  nb_ventes integer := 0;
  col_vente boolean;
  col_data boolean;
  expr text;
BEGIN
  -- 1) Correspondance « copie à supprimer » → « vente gardée ».
  INSERT INTO public.journal_doublons_supprimes (id_copie, id_garde, supprime_le)
  WITH v AS (
    SELECT t.id::text AS id,
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
  SELECT c.id, g.id, debut
  FROM classees c
  JOIN classees g ON g.cle = c.cle AND g.rang = 1
  WHERE c.rang > 1;

  GET DIAGNOSTICS nb_ventes = ROW_COUNT;
  IF nb_ventes = 0 THEN
    RAISE NOTICE 'Aucun doublon trouvé : rien à supprimer.';
    RETURN;
  END IF;

  -- 2) Sauvegarde des ventes qui vont être supprimées.
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.sauvegarde_doublons_ventes AS SELECT * FROM public.ventes WHERE false';
  EXECUTE 'INSERT INTO public.sauvegarde_doublons_ventes
           SELECT t.* FROM public.ventes t
           WHERE t.id::text IN (SELECT id_copie FROM public.journal_doublons_supprimes WHERE supprime_le = $1)'
    USING debut;

  -- 3) Règlements des copies (colonne vente_id réelle OU rangée dans data).
  IF to_regclass('public.reglements') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'reglements' AND column_name = 'vente_id') INTO col_vente;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'reglements' AND column_name = 'data') INTO col_data;
    IF col_vente OR col_data THEN
      expr := CASE WHEN col_vente AND col_data THEN 'coalesce(r.vente_id::text, r.data->>''vente_id'')'
                   WHEN col_vente THEN 'r.vente_id::text'
                   ELSE 'r.data->>''vente_id''' END;

      EXECUTE 'CREATE TABLE IF NOT EXISTS public.sauvegarde_doublons_reglements AS SELECT * FROM public.reglements WHERE false';
      EXECUTE format('INSERT INTO public.sauvegarde_doublons_reglements
                      SELECT r.* FROM public.reglements r
                      WHERE %s IN (SELECT id_copie FROM public.journal_doublons_supprimes WHERE supprime_le = $1)', expr)
        USING debut;

      -- Règlements créés automatiquement par l'import : copies → supprimés.
      EXECUTE format('DELETE FROM public.reglements r
                      WHERE %s IN (SELECT id_copie FROM public.journal_doublons_supprimes WHERE supprime_le = $1)
                        AND r.id::text LIKE ''reg-import-%%''', expr)
        USING debut;

      -- Règlements saisis à la main sur une copie → rattachés à la vente gardée.
      IF col_vente THEN
        EXECUTE 'UPDATE public.reglements r SET vente_id = j.id_garde
                 FROM public.journal_doublons_supprimes j
                 WHERE j.supprime_le = $1 AND r.vente_id::text = j.id_copie'
          USING debut;
      END IF;
      IF col_data THEN
        EXECUTE 'UPDATE public.reglements r SET data = jsonb_set(r.data, ''{vente_id}'', to_jsonb(j.id_garde))
                 FROM public.journal_doublons_supprimes j
                 WHERE j.supprime_le = $1 AND r.data->>''vente_id'' = j.id_copie'
          USING debut;
      END IF;
    END IF;
  END IF;

  -- 4) Pièces jointes en double (stockées dans app_data).
  IF to_regclass('public.app_data') IS NOT NULL THEN
    DELETE FROM public.app_data a
    WHERE a.key LIKE 'documents_importes:%'
      AND a.value->>'vente_id' IN (SELECT id_copie FROM public.journal_doublons_supprimes WHERE supprime_le = debut);
  END IF;

  -- 5) Suppression des ventes en double.
  DELETE FROM public.ventes t
  WHERE t.id::text IN (SELECT id_copie FROM public.journal_doublons_supprimes WHERE supprime_le = debut);

  RAISE NOTICE '% vente(s) en double supprimée(s).', nb_ventes;
END $$;

-- Bilan : nombre de ventes en double supprimées, par exécution (la plus récente en haut).
SELECT supprime_le AS execution, count(*) AS ventes_en_double_supprimees
FROM public.journal_doublons_supprimes
GROUP BY supprime_le
ORDER BY supprime_le DESC;
