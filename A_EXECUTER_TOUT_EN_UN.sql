-- ============================================================================
--  ⛔ FICHIER OBSOLÈTE ET NEUTRALISÉ — NE PAS EXÉCUTER
-- ============================================================================
--
--  Ce script recréait des policies RLS NON SÉCURISÉES :
--    • `using(true)` sur toutes les tables métier → AUCUNE isolation entre
--      magasins (fuite de données clients / santé),
--    • auto-écriture de `user_meta` non gardée → ÉLÉVATION DE PRIVILÈGE
--      (n'importe quel compte pouvait se nommer super_admin).
--
--  Ces failles ont été corrigées par l'audit de sécurité. Le rejouer
--  RÉINTRODUIRAIT les deux vulnérabilités. Il est donc volontairement
--  neutralisé : le bloc ci-dessous interrompt l'exécution immédiatement.
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
    message = 'A_EXECUTER_TOUT_EN_UN.sql est OBSOLETE et neutralise (failles de securite).',
    hint    = 'Projet neuf : INSTALLATION_NOUVEAU_PROJET.sql. Projet existant : CORRECTIFS_SECURITE.sql puis ISOLATION_STRICTE.sql.';
end $$;
