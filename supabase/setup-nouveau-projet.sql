-- ============================================================================
--  ⛔ FICHIER OBSOLÈTE ET NEUTRALISÉ — NE PAS EXÉCUTER
-- ============================================================================
--
--  Ce script créait les policies bootstrap `user_meta` SANS garde : n'importe
--  quel compte authentifié pouvait réécrire son rôle → ÉLÉVATION DE PRIVILÈGE
--  (s'auto-nommer super_admin). Le rejouer RÉINTRODUIRAIT la faille.
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
    message = 'setup-nouveau-projet.sql est OBSOLETE et neutralise (elevation de privilege).',
    hint    = 'Projet neuf : INSTALLATION_NOUVEAU_PROJET.sql. Projet existant : CORRECTIFS_SECURITE.sql puis ISOLATION_STRICTE.sql.';
end $$;
