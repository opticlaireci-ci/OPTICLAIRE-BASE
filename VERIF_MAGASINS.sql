-- ============================================================================
-- OPTICLAIRE — LES MAGASINS SONT-ILS TOUS TRAITÉS PAREIL ? (LECTURE SEULE)
--
-- Supabase → SQL Editor → coller TOUT → Run. Ne modifie RIEN.
--
-- Pour chaque table, compte les lignes par identifiant de magasin, tel qu'il
-- est réellement écrit dans la base. L'application cherche les données d'un
-- magasin avec son identifiant EXACT en minuscules (abobo, bouake,
-- yopougon-gandi…). La colonne « alerte » signale les lignes qu'un magasin
-- risque de NE PAS voir :
--   • MAJUSCULES  : « BOUAKE » au lieu de « bouake »
--   • ANCIEN ID   : cocody / marcory (renommés bouake / yopougon-gandi)
--   • VIDE        : aucune boutique renseignée
--   • INCONNU     : identifiant absent de la liste des magasins
-- Tout est « OK » → tous les magasins se comportent de la même façon.
-- ============================================================================

WITH magasins_connus(id) AS (
  VALUES ('abobo'), ('faya'), ('koumassi'), ('palmeraie'), ('yopougon'),
         ('bingerville'), ('man'), ('bouake'), ('yopougon-gandi')
),
tables(nom) AS (
  SELECT unnest(ARRAY['ventes', 'reglements', 'clients', 'factures_assurance',
                      'inventaires', 'bons', 'rdv_enligne', 'emplois_du_temps',
                      'mouvements_stock'])
),
comptes AS (
  SELECT t.nom AS table_, x.magasin_id, x.nb
  FROM tables t
  CROSS JOIN LATERAL xmltable(
    '/table/row'
    PASSING query_to_xml(
      CASE WHEN to_regclass('public.' || t.nom) IS NULL
        THEN 'SELECT NULL::text AS magasin_id, 0::bigint AS nb WHERE false'
        ELSE format('SELECT coalesce(magasin_id, '''') AS magasin_id, count(*) AS nb FROM public.%I GROUP BY 1', t.nom)
      END, true, false, '')
    COLUMNS magasin_id text PATH 'magasin_id', nb bigint PATH 'nb'
  ) x
)
SELECT
  c.table_,
  coalesce(nullif(c.magasin_id, ''), '(vide)') AS magasin_id,
  c.nb AS lignes,
  CASE
    WHEN coalesce(c.magasin_id, '') = ''                  THEN 'VIDE'
    WHEN lower(c.magasin_id) IN ('cocody', 'marcory')     THEN 'ANCIEN ID'
    WHEN c.magasin_id <> lower(c.magasin_id)
         AND lower(c.magasin_id) IN (SELECT id FROM magasins_connus) THEN 'MAJUSCULES'
    WHEN c.magasin_id IN (SELECT id FROM magasins_connus) THEN 'OK'
    ELSE 'INCONNU'
  END AS alerte
FROM comptes c
ORDER BY (CASE WHEN c.magasin_id IN (SELECT id FROM magasins_connus) THEN 1 ELSE 0 END),
         c.table_, c.magasin_id;
