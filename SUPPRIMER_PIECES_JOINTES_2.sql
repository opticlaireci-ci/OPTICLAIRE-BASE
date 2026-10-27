-- ============================================================================
-- OPTICLAIRE — SUPPRESSION DES PIÈCES JOINTES — ÉTAPE 2 / 2 : RENDRE LA PLACE
--
-- Après l'étape 1, la place est libérée À L'INTÉRIEUR de la base mais le disque
-- reste occupé. Cette commande réécrit la table app_data (désormais petite) et
-- rend l'espace au disque.
--
-- Supabase → SQL Editor → NOUVELLE requête vide → coller CETTE SEULE LIGNE → Run.
-- (VACUUM ne peut pas être exécuté avec d'autres instructions.)
--
-- Pendant quelques secondes, l'application peut attendre un peu en lisant ses
-- réglages : c'est normal.
-- ============================================================================

VACUUM FULL public.app_data;
