-- ============================================================================
-- OPTICLAIRE — RETIRE DE app_data LES CLÉS PROPRES À UN APPAREIL
--
-- Supabase → SQL Editor → coller TOUT → Run. Ré-exécutable sans risque.
-- Ne touche à AUCUNE vente, aucun client, aucun règlement.
--
-- La file des « écritures en attente » d'un navigateur (et le magasin
-- sélectionné) étaient recopiés dans app_data, donc sur tous les appareils.
-- L'application ne les synchronise plus ; ce script efface les anciennes copies.
-- ============================================================================
DELETE FROM public.app_data
WHERE key IN ('leclaire_pending_cloud_writes_v2', 'leclaire_magasin_actuel', 'leclaire_catalogues_migrated')
   OR key LIKE 'leclaire\_stock\_cache\_%';

SELECT count(*) AS cles_restantes_dans_app_data FROM public.app_data;
