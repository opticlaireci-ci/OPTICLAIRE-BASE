-- ============================================================================
-- OPTICLAIRE — PERFORMANCE SUPABASE (connexions, CPU, imports)
--
-- À exécuter UNE fois dans Supabase → SQL Editor → coller TOUT → Run.
-- Ré-exécutable sans risque. Ne supprime AUCUNE donnée métier.
--
-- 1. RÈGLES DE SÉCURITÉ (RLS) ACCÉLÉRÉES
--    Les policies appelaient est_admin() / mes_magasins_norm() POUR CHAQUE
--    LIGNE lue (2 lectures de kv_store par vente !). Plus il y avait de ventes
--    importées, plus chaque lecture était lente → requêtes plus longues →
--    plus de connexions occupées en même temps. Encapsulées dans (select …),
--    ces fonctions ne sont évaluées qu'UNE fois par requête. Même sécurité,
--    même résultat.
--
-- 2. PIÈCES JOINTES DES ANCIENS DOSSIERS DANS LEUR PROPRE TABLE
--    Les PDF importés (base64, jusqu'à 700 Ko par morceau) étaient rangés dans
--    app_data, table diffusée en TEMPS RÉEL à tous les postes : chaque import
--    envoyait ces mégaoctets à chaque navigateur ouvert et faisait recharger
--    app_data partout. Les NOUVELLES pièces vont désormais dans
--    `documents_importes`, NON diffusée en temps réel. Les pièces existantes
--    ne sont PAS déplacées (pour ne pas remplir le disque de la base).
--
-- 3. INDEX par magasin (identiques à INDEX_RAPIDITE.sql).
-- ============================================================================


-- ── 1. RLS : fonctions évaluées une seule fois par requête ──────────────────
DO $$
DECLARE
  p record;
  q text;
  c text;
  motif constant text := '(public\.)?(est_admin|mes_magasins_norm|mon_user_meta)\(\)';
  -- mes_magasins_norm() renvoie un TABLEAU : « = ANY ((select f())) » serait lu
  -- comme une sous-requête ; la conversion ::text[] force l'expression tableau.
  motif_tableau constant text := '(public\.)?mes_magasins_norm\(\)';
  motif_scalaire constant text := '(public\.)?(est_admin|mon_user_meta)\(\)';
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ motif
  LOOP
    -- Déjà optimisée (contient « SELECT est_admin() … ») : on ne touche pas.
    IF (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
         ~* 'select\s+(public\.)?(est_admin|mes_magasins_norm|mon_user_meta)\(\)' THEN
      CONTINUE;
    END IF;
    q := CASE WHEN p.qual IS NULL THEN NULL
              ELSE regexp_replace(regexp_replace(p.qual, motif_tableau, '((select public.mes_magasins_norm())::text[])', 'g'),
                                  motif_scalaire, '(select public.\2())', 'g') END;
    c := CASE WHEN p.with_check IS NULL THEN NULL
              ELSE regexp_replace(regexp_replace(p.with_check, motif_tableau, '((select public.mes_magasins_norm())::text[])', 'g'),
                                  motif_scalaire, '(select public.\2())', 'g') END;
    IF q IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, q);
    END IF;
    IF c IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, c);
    END IF;
    RAISE NOTICE 'Policy optimisée : %.%', p.tablename, p.policyname;
  END LOOP;
END $$;


-- ── 2. Table dédiée aux pièces jointes (hors temps réel) ────────────────────
CREATE TABLE IF NOT EXISTS public.documents_importes (
  id            text PRIMARY KEY,
  import_id     text,
  vente_id      text,
  client_id     text,
  magasin_id    text,
  name          text,
  type          text,
  size          bigint,
  "relativePath" text,
  part          integer,
  total_parts   integer,
  data_base64   text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_importes_vente_id ON public.documents_importes (vente_id);
CREATE INDEX IF NOT EXISTS idx_documents_importes_magasin_id ON public.documents_importes (magasin_id);

ALTER TABLE public.documents_importes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents_importes TO authenticated;

DO $$
DECLARE
  cond text;
BEGIN
  -- Même isolation par magasin que les ventes (si les fonctions existent).
  IF to_regprocedure('public.est_admin()') IS NOT NULL
     AND to_regprocedure('public.mes_magasins_norm()') IS NOT NULL
     AND to_regprocedure('public.norm_id(text)') IS NOT NULL THEN
    cond := '((select public.est_admin()) or public.norm_id(magasin_id) = any(((select public.mes_magasins_norm())::text[])))';
  ELSE
    cond := 'true';
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS documents_importes_select ON public.documents_importes';
  EXECUTE 'DROP POLICY IF EXISTS documents_importes_insert ON public.documents_importes';
  EXECUTE 'DROP POLICY IF EXISTS documents_importes_update ON public.documents_importes';
  EXECUTE 'DROP POLICY IF EXISTS documents_importes_delete ON public.documents_importes';
  EXECUTE format('CREATE POLICY documents_importes_select ON public.documents_importes FOR SELECT TO authenticated USING (%s)', cond);
  EXECUTE format('CREATE POLICY documents_importes_insert ON public.documents_importes FOR INSERT TO authenticated WITH CHECK (%s)', cond);
  EXECUTE format('CREATE POLICY documents_importes_update ON public.documents_importes FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', cond, cond);
  EXECUTE format('CREATE POLICY documents_importes_delete ON public.documents_importes FOR DELETE TO authenticated USING (%s)', cond);

  -- Surtout PAS de diffusion temps réel pour cette table.
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'documents_importes') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.documents_importes';
  END IF;

  -- IMPORTANT : les pièces DÉJÀ importées restent dans app_data. Les déplacer
  -- en une seule fois peut remplir le disque de la base (copie complète + journal
  -- WAL). Elles ne coûtent rien tant qu'elles ne sont pas modifiées : seules les
  -- NOUVELLES pièces jointes iront dans documents_importes.
END $$;


-- ── 3. Index par magasin (lecture filtrée rapide) ───────────────────────────
DO $$
DECLARE
  cible record;
  a_colonne boolean;
  a_data boolean;
  nom text;
BEGIN
  FOR cible IN
    SELECT * FROM (VALUES
      ('ventes', 'magasin_id'), ('ventes', 'numero_client'), ('ventes', 'updated_at'),
      ('clients', 'magasin_id'), ('clients', 'updated_at'),
      ('reglements', 'magasin_id'), ('reglements', 'vente_id'), ('reglements', 'updated_at'),
      ('factures_assurance', 'magasin_id'), ('inventaires', 'magasin_id'),
      ('rdv_enligne', 'magasin_id'), ('emplois_du_temps', 'magasin_id'),
      ('mouvements_stock', 'magasin_id'), ('mouvements_stock', 'updated_at'),
      ('bons', 'magasin_source'), ('bons', 'magasin_destination')
    ) AS t(tbl, col)
  LOOP
    IF to_regclass('public.' || cible.tbl) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = cible.tbl AND column_name = cible.col) INTO a_colonne;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = cible.tbl AND column_name = 'data'
                     AND data_type = 'jsonb') INTO a_data;
    IF a_colonne THEN
      nom := 'idx_' || cible.tbl || '_' || cible.col;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', nom, cible.tbl, cible.col);
    END IF;
    IF a_data AND cible.col <> 'updated_at' THEN
      nom := 'idx_' || cible.tbl || '_data_' || cible.col;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I ((data->>%L))', nom, cible.tbl, cible.col);
    END IF;
  END LOOP;
END $$;

ANALYZE;
NOTIFY pgrst, 'reload schema';

-- Contrôle : policies optimisées + table des pièces jointes prête.
SELECT 'policies optimisées' AS controle, count(*)::text AS valeur
FROM pg_policies
WHERE schemaname = 'public' AND (coalesce(qual, '') || coalesce(with_check, '')) ~* 'select\s+(public\.)?est_admin'
UNION ALL
SELECT 'table documents_importes prête', (to_regclass('public.documents_importes') IS NOT NULL)::text
UNION ALL
SELECT 'taille de la base', pg_size_pretty(pg_database_size(current_database()));
