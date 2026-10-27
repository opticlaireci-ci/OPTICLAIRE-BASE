-- ============================================================================
-- OPTICLAIRE — NUMÉROS DE FACTURE CROISSANTS POUR TOUS LES MAGASINS
--
-- Supabase → SQL Editor → coller TOUT → Run. Ré-exécutable sans risque.
-- Ne modifie AUCUNE vente existante.
--
-- Avant : chaque navigateur comptait de son côté (FA-0001 à PALMERAIE, FA-0001
-- à YOPOUGON…). Désormais UN SEUL compteur, dans la base, partagé par tous les
-- magasins et tous les appareils : PALMERAIE fait FA-0001, YOPOUGON enchaîne
-- FA-0002 puis FA-0003, etc. Deux ventes simultanées ne peuvent jamais
-- recevoir le même numéro (incrément atomique).
--
-- Le compteur démarre APRÈS le plus grand numéro déjà utilisé (FA-xxxx pour
-- les factures, VF-xxxx pour les ventes flash, n° de reçu, référence de bon de
-- commande verre) : aucun doublon avec l'existant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.compteurs (
  nom    text PRIMARY KEY,
  valeur bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.compteurs ENABLE ROW LEVEL SECURITY;
-- Aucun accès direct : on passe uniquement par la fonction ci-dessous.
REVOKE ALL ON public.compteurs FROM anon, authenticated;

-- Point de départ = plus grand numéro existant (factures, ventes flash, reçus,
-- bons de commande verre).
CREATE OR REPLACE FUNCTION pg_temp.max_numero(p_table text, p_chemin text[], p_motif text)
RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE r bigint := 0;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN 0; END IF;
  EXECUTE format($q$
    SELECT coalesce(max(substring(upper(trim(v #>> %L)) FROM %L)::bigint), 0)
    FROM (SELECT CASE WHEN jsonb_typeof(to_jsonb(t.*)->'data') = 'object'
                      -- colonnes vides ignorées : elles masqueraient la valeur rangée dans data
                      THEN (to_jsonb(t.*)->'data') || jsonb_strip_nulls(to_jsonb(t.*) - 'data')
                      ELSE to_jsonb(t.*) END AS v
          FROM public.%I t) s$q$, p_chemin, p_motif, p_table)
  INTO r;
  RETURN coalesce(r, 0);
END $f$;

INSERT INTO public.compteurs (nom, valeur) VALUES
  ('facture',            pg_temp.max_numero('ventes', '{recap,numFacture}', '^FA-0*([0-9]{1,12})$')),
  ('vente_flash',        pg_temp.max_numero('ventes', '{recap,numFacture}', '^VF-0*([0-9]{1,12})$')),
  ('recu',               GREATEST(pg_temp.max_numero('ventes', '{recap,numRecu}', '^0*([0-9]{1,12})$'),
                                  pg_temp.max_numero('reglements', '{recu}', '^0*([0-9]{1,12})$'))),
  ('bon_commande_verre', pg_temp.max_numero('bons_commande_verres', '{num_ref}', '^0*([0-9]{1,12})$'))
ON CONFLICT (nom) DO UPDATE SET valeur = GREATEST(public.compteurs.valeur, EXCLUDED.valeur);

-- Renvoie le PROCHAIN numéro (1, 2, 3…) et l'enregistre en une seule opération.
CREATE OR REPLACE FUNCTION public.prochain_numero(p_nom text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.compteurs AS c (nom, valeur) VALUES (p_nom, 1)
  ON CONFLICT (nom) DO UPDATE SET valeur = c.valeur + 1
  RETURNING c.valeur;
$$;

REVOKE ALL ON FUNCTION public.prochain_numero(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prochain_numero(text) TO authenticated;

SELECT nom, valeur AS dernier_numero_utilise FROM public.compteurs ORDER BY nom;
