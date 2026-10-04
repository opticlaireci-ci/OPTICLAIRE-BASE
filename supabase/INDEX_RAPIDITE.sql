-- ============================================================================
-- OPTICLAIRE — INDEX DE RAPIDITÉ
--
-- À exécuter UNE fois dans Supabase → SQL Editor → Run. Ré-exécutable sans risque.
--
-- L'application demande maintenant à Supabase « les ventes / clients /
-- règlements DU magasin X » au lieu de tout télécharger. Ces index permettent
-- à Postgres de trouver ces lignes directement, même avec des dizaines de
-- milliers de ventes, au lieu de parcourir toute la table.
--
-- Fonctionne quel que soit le schéma : un index est créé sur la vraie colonne
-- si elle existe, et sur le champ rangé dans la colonne JSONB `data` sinon.
-- Les tables ou colonnes absentes sont simplement ignorées.
-- ============================================================================

DO $$
DECLARE
  cible record;
  a_colonne boolean;
  a_data boolean;
  nom text;
BEGIN
  FOR cible IN
    SELECT * FROM (VALUES
      ('ventes', 'magasin_id'),
      ('ventes', 'updated_at'),
      ('clients', 'magasin_id'),
      ('clients', 'updated_at'),
      ('reglements', 'magasin_id'),
      ('reglements', 'vente_id'),
      ('reglements', 'updated_at'),
      ('factures_assurance', 'magasin_id'),
      ('inventaires', 'magasin_id'),
      ('rdv_enligne', 'magasin_id'),
      ('emplois_du_temps', 'magasin_id'),
      ('mouvements_stock', 'magasin_id'),
      ('mouvements_stock', 'updated_at'),
      ('bons', 'magasin_source'),
      ('bons', 'magasin_destination')
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

    -- Champ (aussi) rangé dans data : index sur l'expression data->>'champ'.
    IF a_data AND cible.col <> 'updated_at' THEN
      nom := 'idx_' || cible.tbl || '_data_' || cible.col;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I ((data->>%L))', nom, cible.tbl, cible.col);
    END IF;
  END LOOP;
END $$;

ANALYZE;

-- Contrôle : index présents sur les tables principales.
SELECT tablename AS table, indexname AS index
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx\_%'
  AND tablename IN ('ventes', 'clients', 'reglements', 'factures_assurance', 'inventaires',
                    'rdv_enligne', 'emplois_du_temps', 'mouvements_stock', 'bons')
ORDER BY 1, 2;
