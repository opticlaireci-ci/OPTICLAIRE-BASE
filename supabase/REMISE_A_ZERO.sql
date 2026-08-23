-- ============================================================================
--  OPTICLAIRE — REMISE À ZÉRO COMPLÈTE DES DONNÉES (même projet Supabase)
--  Dashboard → SQL Editor → New query → coller TOUT ce fichier → RUN
-- ============================================================================
--
--  ⚠️ IRRÉVERSIBLE. Ce script SUPPRIME :
--    • toutes les données métier (clients, ventes, stocks, règlements, bons,
--      rendez-vous, catalogues, audit, etc.) — PARTIE 1
--    • le fourre-tout `app_data` (réglages non migrés) — PARTIE 2
--    • le magasin clé/valeur `kv_store` : rôles utilisateurs, réglages
--      (`app_data:*`), et le verrou de bootstrap `app_data:initialized` — PARTIE 3
--
--  Il NE TOUCHE PAS :
--    • le schéma (tables, policies RLS, fonctions norm_id/est_admin/...) —
--      inutile de relancer INSTALLATION_NOUVEAU_PROJET.sql après ceci ;
--    • les comptes de connexion Supabase Auth (emails/mots de passe) : ce
--      sont des objets gérés par Supabase (pas de simples lignes SQL), voir
--      PARTIE 4 pour les supprimer proprement si vous voulez repartir à zéro
--      sur les comptes aussi.
--
--  APRÈS EXÉCUTION : la PARTIE 3 supprime le verrou de bootstrap. Au prochain
--  chargement de l'app, l'écran de connexion proposera donc de RECRÉER le
--  compte propriétaire (POST /setup/bootstrap-owner), comme sur un projet
--  neuf. Si vous avez SUPPRIMÉ les comptes Auth en PARTIE 4, ce compte
--  propriétaire sera entièrement nouveau lui aussi.
-- ============================================================================


-- ############################################################################
-- #  PARTIE 1 / 4 — TABLES MÉTIER (structure conservée)
-- ############################################################################
do $$
declare
  t text;
  tables text[] := array[
    'clients', 'articles', 'montures', 'acteurs', 'verres_types', 'professions',
    'ventes', 'reglements', 'factures_assurance', 'reglements_assurance',
    'releves_assurance', 'inventaires', 'mouvements_stock', 'bons',
    'rdv_enligne', 'emplois_du_temps', 'catalogues', 'audit_log',
    'referentiels', 'bons_commande_verres'
  ];
begin
  foreach t in array tables loop
    execute format('truncate table public.%I restart identity cascade', t);
    raise notice 'public.% vidée', t;
  end loop;
end $$;


-- ############################################################################
-- #  PARTIE 2 / 4 — app_data (fourre-tout, entités non migrées)
-- ############################################################################
truncate table public.app_data restart identity cascade;


-- ############################################################################
-- #  PARTIE 3 / 4 — kv_store (rôles, réglages, verrou de bootstrap)
-- ############################################################################
-- ⚠️ Ceci efface AUSSI les assignations magasin/rôle de tous les comptes
--    existants (user_meta:*) et le verrou `app_data:initialized`. C'est
--    voulu : sans cela, l'app resterait bloquée en pensant qu'un propriétaire
--    existe déjà, sans qu'aucun compte n'ait plus de rôle exploitable.
truncate table public.kv_store_10865fd7 restart identity cascade;


-- ############################################################################
-- #  PARTIE 4 / 4 — (OPTIONNEL) Suppression des comptes Supabase Auth
-- ############################################################################
-- Les comptes de connexion (auth.users) ne sont PAS des lignes métier : ils
-- sont gérés par le service Auth de Supabase, pas par ce script. Deux façons
-- de les supprimer si vous voulez un blanc total :
--
--   A) DASHBOARD (recommandé, sûr) :
--      Authentication → Users → sélectionner tous les comptes → Delete.
--
--   B) SQL DIRECT (déconseillé sauf si vous savez ce que vous faites) :
--      Décommentez la ligne ci-dessous UNIQUEMENT si vous voulez supprimer
--      TOUS les comptes existants par SQL. Cascade sur les tables internes
--      Supabase (sessions, identities...).
--
-- delete from auth.users;


-- ############################################################################
-- #  VÉRIFICATION — toutes les tables doivent afficher 0
-- ############################################################################
select
  (select count(*) from public.clients)             as clients,
  (select count(*) from public.ventes)              as ventes,
  (select count(*) from public.bons)                as bons,
  (select count(*) from public.app_data)            as app_data,
  (select count(*) from public.kv_store_10865fd7)   as kv_store;
