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
-- les factures, VF-xxxx pour les ventes flash) : aucun doublon avec l'existant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.compteurs (
  nom    text PRIMARY KEY,
  valeur bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.compteurs ENABLE ROW LEVEL SECURITY;
-- Aucun accès direct : on passe uniquement par la fonction ci-dessous.
REVOKE ALL ON public.compteurs FROM anon, authenticated;

-- Point de départ = plus grand numéro existant (factures et ventes flash).
DO $$
DECLARE
  max_fa bigint := 0;
  max_vf bigint := 0;
BEGIN
  IF to_regclass('public.ventes') IS NOT NULL THEN
    WITH v AS (
      SELECT upper(trim(coalesce(
        CASE WHEN jsonb_typeof(to_jsonb(t.*)->'data') = 'object'
             THEN (to_jsonb(t.*)->'data') || (to_jsonb(t.*) - 'data')
             ELSE to_jsonb(t.*) END -> 'recap' ->> 'numFacture', ''))) AS num
      FROM public.ventes t
    )
    SELECT
      coalesce(max(substring(num FROM '^FA-0*([0-9]{1,12})$')::bigint), 0),
      coalesce(max(substring(num FROM '^VF-0*([0-9]{1,12})$')::bigint), 0)
    INTO max_fa, max_vf
    FROM v;
  END IF;

  INSERT INTO public.compteurs (nom, valeur) VALUES ('facture', max_fa), ('vente_flash', max_vf)
  ON CONFLICT (nom) DO UPDATE SET valeur = GREATEST(public.compteurs.valeur, EXCLUDED.valeur);

  RAISE NOTICE 'Prochaine facture : FA-%  |  prochaine vente flash : VF-%',
    lpad((GREATEST(max_fa, (SELECT valeur FROM public.compteurs WHERE nom = 'facture')) + 1)::text, 4, '0'),
    lpad((GREATEST(max_vf, (SELECT valeur FROM public.compteurs WHERE nom = 'vente_flash')) + 1)::text, 4, '0');
END $$;

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
