-- ============================================================================
--  ⛔ FICHIER OBSOLÈTE ET NEUTRALISÉ — NE PAS EXÉCUTER
-- ============================================================================
--
--  Ce script recréait des policies RLS `using(true)` / `with check(true)` :
--  AUCUNE isolation entre magasins (fuite de données clients / santé).
--  Le rejouer ANNULERAIT l'isolation multi-tenant mise en place par l'audit.
--
--  À UTILISER À LA PLACE :
--    • Projet NEUF ................ supabase/INSTALLATION_NOUVEAU_PROJET.sql
--    • Projet EXISTANT ........... supabase/CORRECTIFS_SECURITE.sql
--                                  puis supabase/ISOLATION_STRICTE.sql
-- ============================================================================

do $$
begin
  raise exception using
    errcode = 'raise_exception',
    message = 'FIX_DROITS_AUTHENTICATED.sql est OBSOLETE et neutralise (policies non securisees).',
    hint    = 'Projet neuf : INSTALLATION_NOUVEAU_PROJET.sql. Projet existant : CORRECTIFS_SECURITE.sql puis ISOLATION_STRICTE.sql.';
end $$;
