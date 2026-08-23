-- ============================================================================
--  SECOURS — DONNER LES DROITS SUPER ADMIN À UN COMPTE EXISTANT
-- ============================================================================
--
--  ⚠️  NORMALEMENT VOUS N'AVEZ PAS BESOIN DE CE FICHIER.
--
--  La méthode recommandée est l'écran de configuration de l'application, qui
--  crée le compte propriétaire et lui attribue les 7 magasins automatiquement
--  (route POST /setup/bootstrap-owner). Ce script n'est là que si cet écran
--  est inaccessible — par exemple si plus personne n'est administrateur et que
--  vous êtes verrouillé hors de l'application.
--
--  À exécuter dans : Dashboard → SQL Editor → New query
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
--  ÉTAPE 1 — Le compte doit déjà exister dans Supabase Auth
-- ─────────────────────────────────────────────────────────────────────────────
-- Créez-le si besoin : Dashboard → Authentication → Users → « Add user »
-- en cochant « Auto Confirm User » (sinon la connexion sera refusée).
--
-- Puis retrouvez son identifiant :
select id, email, created_at
from auth.users
order by created_at;


-- ─────────────────────────────────────────────────────────────────────────────
--  ÉTAPE 2 — Attribuer le rôle super_admin sur les 7 magasins
-- ─────────────────────────────────────────────────────────────────────────────
-- Remplacez l'adresse e-mail ci-dessous par celle du compte à promouvoir.
-- L'UUID est récupéré automatiquement depuis auth.users : c'est essentiel, car
-- la clé doit être exactement `user_meta:<UUID Auth>` — un UUID inventé ou
-- recopié de travers rendrait le compte invisible pour l'application.
--
-- Les noms de magasins sont en MINUSCULES : l'application compare les
-- identifiants de magasin en minuscules côté base. Ne changez pas la casse.

insert into public.kv_store_10865fd7 (key, value)
select
  'user_meta:' || u.id,
  jsonb_build_object(
    'user_id',     u.id,
    'magasins',    jsonb_build_array(
      jsonb_build_object('magasin_id', 'abobo',       'role', 'super_admin'),
      jsonb_build_object('magasin_id', 'faya',        'role', 'super_admin'),
      jsonb_build_object('magasin_id', 'koumassi',    'role', 'super_admin'),
      jsonb_build_object('magasin_id', 'palmeraie',   'role', 'super_admin'),
      jsonb_build_object('magasin_id', 'yopougon',    'role', 'super_admin'),
      jsonb_build_object('magasin_id', 'bingerville', 'role', 'super_admin'),
      jsonb_build_object('magasin_id', 'man',         'role', 'super_admin')
    ),
    -- Vides volontairement : le rôle super_admin donne accès à tout, les
    -- listes de permissions et de menus ne servent qu'aux rôles restreints.
    'permissions', '[]'::jsonb,
    'menuAccess',  '[]'::jsonb
  )
from auth.users u
where lower(u.email) = lower('admin@leclaire.ci')   -- ← À REMPLACER
on conflict (key) do update set value = excluded.value;


-- ─────────────────────────────────────────────────────────────────────────────
--  ÉTAPE 3 — Vérifier
-- ─────────────────────────────────────────────────────────────────────────────
-- Doit renvoyer une ligne, avec le rôle super_admin sur 7 magasins.
-- Si le résultat est VIDE : l'e-mail de l'étape 2 ne correspond à aucun
-- compte Auth. Reprenez l'UUID exact via la requête de l'étape 1.
select
  k.key,
  u.email,
  jsonb_array_length(k.value -> 'magasins') as nb_magasins,
  k.value -> 'magasins' -> 0 -> 'role'      as role
from public.kv_store_10865fd7 k
join auth.users u on ('user_meta:' || u.id) = k.key
where k.key like 'user_meta:%';
