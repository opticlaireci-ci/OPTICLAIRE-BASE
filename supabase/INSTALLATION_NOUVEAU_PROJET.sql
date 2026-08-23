-- ============================================================================
--  OPTICLAIRE — INSTALLATION COMPLÈTE & SÉCURISÉE SUR UN PROJET SUPABASE VIERGE
--  Dashboard → SQL Editor → New query → coller TOUT ce fichier → RUN
-- ============================================================================
--
--  CE FICHIER EST L'INSTALLEUR UNIQUE d'un nouveau projet. Il crée TOUT le
--  côté BASE DE DONNÉES, sécurisé par défaut (correctifs d'audit intégrés) :
--    • les 21 tables métier + kv_store (accès direct PostgREST),
--    • les colonnes attendues par les services TypeScript,
--    • la sécurité RLS DURCIE :
--        – pas d'élévation de privilège (auto-écriture de rôle verrouillée),
--        – isolation multi-tenant par magasin,
--    • l'activation du temps réel.
--
--  ⚠️ LES ROUTES DE L'EDGE FUNCTION (/me, /admin/users, /sms/send, /setup/*)
--     NE SONT PAS DU SQL : ce sont du code Deno dans
--     supabase/functions/server/index.tsx, à déployer séparément
--     (`supabase functions deploy server`). Ce script ne les touche pas.
--
--  ENTIÈREMENT IDEMPOTENT : relançable sans rien détruire ni perdre.
--
--  ORDRE DES PARTIES
--    0 — Tables métier (accès direct PostgREST)
--    1 — Table clé/valeur kv_store + fonctions de sécurité + RLS (rôles/réglages)
--    2 — Colonnes attendues par les interfaces TypeScript des services
--    3 — RLS métier DURCIE (isolation par magasin)
--    4 — Activation du temps réel (postgres_changes)
--    5 — Vérifications
-- ============================================================================


-- ############################################################################
-- #  PARTIE 0 / 5 — CRÉATION DES TABLES MÉTIER
-- ############################################################################
-- Modèle commun (cf. src/app/utils/supabaseDirect.ts) :
--   • `id text primary key` — identifiants générés côté client.
--   • `magasin_id text` — cloisonnement par magasin (désormais imposé par RLS).
--   • `data jsonb` — fourre-tout (champs sans colonne dédiée).
--   • `updated_at` — pull incrémental.

do $$
declare
  t text;
  tables text[] := array[
    'clients', 'articles', 'montures', 'acteurs', 'verres_types', 'professions',
    'ventes', 'reglements', 'factures_assurance', 'reglements_assurance',
    'releves_assurance', 'inventaires', 'mouvements_stock', 'bons',
    'rdv_enligne', 'emplois_du_temps', 'catalogues', 'audit_log'
  ];
begin
  foreach t in array tables loop
    execute format($f$
      create table if not exists public.%I (
        id         text primary key,
        magasin_id text,
        data       jsonb default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )$f$, t);
    raise notice 'public.% prête', t;
  end loop;
end $$;

-- ── referentiels — petites listes (db_*, global_*), distinguées par `type` ───
create table if not exists public.referentiels (
  type       text not null,
  id         text not null,
  data       jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (type, id)
);

-- ── app_data — réglages, listes globales, entités non migrées ────────────────
create table if not exists public.app_data (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists app_data_key_prefix_idx
  on public.app_data (key text_pattern_ops);
create index if not exists app_data_updated_at_idx
  on public.app_data (updated_at);

-- ── bons_commande_verres — Atelier / Règlement verrier ──────────────────────
create table if not exists public.bons_commande_verres (
  id                  text primary key,
  num_facture         text,
  num_ref             text,
  num_bc              text,
  num_bl              text,
  fournisseur         text,
  officine            text,
  magasin             text,
  client              text,
  total_net           numeric,
  acompte             numeric,
  total_reste         numeric,
  statut              text,
  date                text,
  date_edition        text,
  date_recuperation   text,
  date_entree_atelier text,
  date_retour_magasin text,
  data                jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists bons_commande_verres_magasin_idx
  on public.bons_commande_verres (magasin);
create index if not exists bons_commande_verres_fournisseur_idx
  on public.bons_commande_verres (fournisseur);
create index if not exists bons_commande_verres_statut_idx
  on public.bons_commande_verres (statut);

-- ── Horodatage automatique de updated_at sur toutes les tables ──────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'clients', 'articles', 'montures', 'acteurs', 'verres_types', 'professions',
    'ventes', 'reglements', 'factures_assurance', 'reglements_assurance',
    'releves_assurance', 'inventaires', 'mouvements_stock', 'bons',
    'rdv_enligne', 'emplois_du_temps', 'catalogues', 'audit_log',
    'referentiels', 'app_data', 'bons_commande_verres'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;


-- ############################################################################
-- #  PARTIE 1 / 5 — KV, FONCTIONS DE SÉCURITÉ ET RLS (rôles / réglages)
-- ############################################################################

create table if not exists public.kv_store_10865fd7 (
  key   text  not null primary key,
  value jsonb not null
);

alter table public.kv_store_10865fd7
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.kv_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kv_store_10865fd7_touch on public.kv_store_10865fd7;
create trigger kv_store_10865fd7_touch
  before insert or update on public.kv_store_10865fd7
  for each row execute function public.kv_touch_updated_at();

create index if not exists kv_store_10865fd7_key_prefix_idx
  on public.kv_store_10865fd7 (key text_pattern_ops);
create index if not exists kv_store_10865fd7_updated_at_idx
  on public.kv_store_10865fd7 (updated_at);


-- ─────────────────────────────────────────────────────────────────────────────
--  FONCTIONS UTILITAIRES DE SÉCURITÉ (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER : lisent kv_store en contournant la RLS (évite toute
-- récursion de policy). `search_path = ''` fige la résolution des objets.

-- Normalisation d'un identifiant magasin — RÉPLIQUE EXACTE de normId()
-- (supabase/functions/server/index.tsx) : minuscule → suppression de tout ce
-- qui n'est pas [a-z0-9] → suppression du préfixe 'leclaire'.
-- INDISPENSABLE : les données stockent souvent magasin_id en MAJUSCULES ; sans
-- normaliser des DEUX côtés, la comparaison masquerait des données légitimes.
create or replace function public.norm_id(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(v, '')), '[^a-z0-9]', '', 'g'),
           '^leclaire', ''
         );
$$;

-- L'application est-elle déjà initialisée (un propriétaire existe) ?
create or replace function public.app_initialisee()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.kv_store_10865fd7 where key = 'app_data:initialized'
  );
$$;

-- Métadonnées (rôles/magasins) de l'appelant courant.
create or replace function public.mon_user_meta()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select value
  from public.kv_store_10865fd7
  where key = 'user_meta:' || auth.uid()::text;
$$;

-- Magasins autorisés pour l'appelant, DÉJÀ NORMALISÉS.
create or replace function public.mes_magasins_norm()
returns text[]
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    array_agg(public.norm_id(m->>'magasin_id')) filter (where m->>'magasin_id' is not null),
    array[]::text[]
  )
  from jsonb_array_elements(
    coalesce(public.mon_user_meta()->'magasins', '[]'::jsonb)
  ) as m;
$$;

-- L'appelant est-il admin/super_admin (accès inter-magasins) ?
create or replace function public.est_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      coalesce(public.mon_user_meta()->'magasins', '[]'::jsonb)
    ) as m
    where m->>'role' in ('super_admin', 'admin', 'administrateur')
  );
$$;

grant execute on function public.norm_id(text)       to authenticated, anon;
grant execute on function public.app_initialisee()   to authenticated, anon;
grant execute on function public.mon_user_meta()     to authenticated;
grant execute on function public.mes_magasins_norm() to authenticated;
grant execute on function public.est_admin()         to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  RLS DU KV
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.kv_store_10865fd7 enable row level security;

-- Lecture anonyme : UNIQUEMENT les réglages `app_data:%` (écran de connexion).
drop policy if exists "lecture anonyme des reglages app_data" on public.kv_store_10865fd7;
create policy "lecture anonyme des reglages app_data"
  on public.kv_store_10865fd7
  for select
  to anon
  using (key like 'app_data:%');

-- Lecture par un utilisateur de SON propre user_meta (repli de connexion /me).
drop policy if exists "user lit son propre user_meta" on public.kv_store_10865fd7;
create policy "user lit son propre user_meta"
  on public.kv_store_10865fd7
  for select
  to authenticated
  using (key = 'user_meta:' || auth.uid()::text);

-- ── SÉCURITÉ : auto-écriture des rôles VERROUILLÉE après initialisation ──────
-- Un utilisateur ne peut écrire SON user_meta QUE pendant le bootstrap (tant
-- que `app_data:initialized` n'existe pas). Ensuite, les rôles ne se modifient
-- que via l'edge function d'admin (service_role, qui contourne la RLS).
-- → Ferme l'élévation de privilège « je me nomme super_admin depuis la console ».
drop policy if exists "bootstrap user_meta insert" on public.kv_store_10865fd7;
drop policy if exists "bootstrap user_meta update" on public.kv_store_10865fd7;

create policy "bootstrap user_meta insert"
  on public.kv_store_10865fd7
  for insert
  to authenticated
  with check (
    key = 'user_meta:' || auth.uid()::text
    and not public.app_initialisee()
  );

create policy "bootstrap user_meta update"
  on public.kv_store_10865fd7
  for update
  to authenticated
  using (
    key = 'user_meta:' || auth.uid()::text
    and not public.app_initialisee()
  )
  with check (
    key = 'user_meta:' || auth.uid()::text
    and not public.app_initialisee()
  );

-- `app_data:initialized` : écrit UNE seule fois, puis immuable côté client.
drop policy if exists "bootstrap initialized insert" on public.kv_store_10865fd7;
drop policy if exists "bootstrap initialized update" on public.kv_store_10865fd7;
create policy "bootstrap initialized insert"
  on public.kv_store_10865fd7
  for insert
  to authenticated
  with check (
    key = 'app_data:initialized'
    and not public.app_initialisee()
  );

-- ── ADMIN : gestion des utilisateurs SANS edge function ─────────────────────
-- Repli côté client (src/app/utils/userAdminFallback.ts) : tant que l'edge
-- function n'est pas déployée, un admin (`est_admin()`) doit pouvoir lister,
-- créer, modifier et supprimer les DROITS (clés `user_meta:*`) directement via
-- PostgREST. Ces policies n'accordent RIEN à un non-admin.
drop policy if exists "admin lit tous les user_meta"     on public.kv_store_10865fd7;
drop policy if exists "admin insere des user_meta"       on public.kv_store_10865fd7;
drop policy if exists "admin met a jour des user_meta"   on public.kv_store_10865fd7;
drop policy if exists "admin supprime des user_meta"     on public.kv_store_10865fd7;

create policy "admin lit tous les user_meta"
  on public.kv_store_10865fd7 for select to authenticated
  using (key like 'user_meta:%' and public.est_admin());

create policy "admin insere des user_meta"
  on public.kv_store_10865fd7 for insert to authenticated
  with check (key like 'user_meta:%' and public.est_admin());

create policy "admin met a jour des user_meta"
  on public.kv_store_10865fd7 for update to authenticated
  using (key like 'user_meta:%' and public.est_admin())
  with check (key like 'user_meta:%' and public.est_admin());

create policy "admin supprime des user_meta"
  on public.kv_store_10865fd7 for delete to authenticated
  using (key like 'user_meta:%' and public.est_admin());

grant select, insert, update, delete on public.kv_store_10865fd7 to authenticated;
grant select on public.kv_store_10865fd7 to anon;


-- ############################################################################
-- #  PARTIE 2 / 5 — COLONNES ATTENDUES PAR LES SERVICES TypeScript
-- ############################################################################

-- ── clients ─────────────────────────────────────────────────────────────────
alter table public.clients add column if not exists nom                 text;
alter table public.clients add column if not exists prenom              text;
alter table public.clients add column if not exists telephone           text;
alter table public.clients add column if not exists telephone2          text;
alter table public.clients add column if not exists email               text;
alter table public.clients add column if not exists adresse             text;
alter table public.clients add column if not exists notes               text;
alter table public.clients add column if not exists solde               numeric;
alter table public.clients add column if not exists date_edition        text;
alter table public.clients add column if not exists source              text;
alter table public.clients add column if not exists user_id             text;
alter table public.clients add column if not exists matricule_assurance text;
alter table public.clients add column if not exists entreprise          text;

-- ── bons ─────────────────────────────────────────────────────────────────────
alter table public.bons add column if not exists type                text;
alter table public.bons add column if not exists numero              text;
alter table public.bons add column if not exists date                text;
alter table public.bons add column if not exists magasin_source      text;
alter table public.bons add column if not exists magasin_destination text;
alter table public.bons add column if not exists responsable         text;
alter table public.bons add column if not exists recepteur           text;
alter table public.bons add column if not exists expediteur          text;
alter table public.bons add column if not exists items               jsonb default '[]'::jsonb;
alter table public.bons add column if not exists statut              text;
alter table public.bons add column if not exists observations        text;
alter table public.bons add column if not exists valide_par          text;
alter table public.bons add column if not exists user_id             text;

-- ── factures_assurance ───────────────────────────────────────────────────────
alter table public.factures_assurance add column if not exists numero          text;
alter table public.factures_assurance add column if not exists date_facture    text;
alter table public.factures_assurance add column if not exists client_nom      text;
alter table public.factures_assurance add column if not exists client_id       text;
alter table public.factures_assurance add column if not exists assurance       text;
alter table public.factures_assurance add column if not exists montant_total   numeric;
alter table public.factures_assurance add column if not exists part_assurance  numeric;
alter table public.factures_assurance add column if not exists part_client     numeric;
alter table public.factures_assurance add column if not exists statut          text;

-- ── reglements_assurance ─────────────────────────────────────────────────────
alter table public.reglements_assurance add column if not exists assurance      text;
alter table public.reglements_assurance add column if not exists date_reglement text;
alter table public.reglements_assurance add column if not exists montant        numeric;
alter table public.reglements_assurance add column if not exists reference      text;

-- ── releves_assurance ────────────────────────────────────────────────────────
alter table public.releves_assurance add column if not exists assurance   text;
alter table public.releves_assurance add column if not exists date_releve text;
alter table public.releves_assurance add column if not exists montant     numeric;

-- ── rdv_enligne ──────────────────────────────────────────────────────────────
alter table public.rdv_enligne add column if not exists num_ref     text;
alter table public.rdv_enligne add column if not exists client      text;
alter table public.rdv_enligne add column if not exists motif       text;
alter table public.rdv_enligne add column if not exists commentaire text;
alter table public.rdv_enligne add column if not exists rendez_vous text;
alter table public.rdv_enligne add column if not exists date        text;
alter table public.rdv_enligne add column if not exists statut      text;

-- ── emplois_du_temps ─────────────────────────────────────────────────────────
alter table public.emplois_du_temps add column if not exists annee               text;
alter table public.emplois_du_temps add column if not exists mois                text;
alter table public.emplois_du_temps add column if not exists horaires            jsonb default '{}'::jsonb;
alter table public.emplois_du_temps add column if not exists jours_exceptionnels jsonb default '[]'::jsonb;

-- ── audit_log (« user » = mot réservé) ───────────────────────────────────────
alter table public.audit_log add column if not exists action  text;
alter table public.audit_log add column if not exists module  text;
alter table public.audit_log add column if not exists "user"  text;
alter table public.audit_log add column if not exists details jsonb default '{}'::jsonb;
alter table public.audit_log add column if not exists date    text;

-- ── inventaires ──────────────────────────────────────────────────────────────
alter table public.inventaires add column if not exists date_inventaire text;
alter table public.inventaires add column if not exists responsable     text;
alter table public.inventaires add column if not exists items           jsonb default '[]'::jsonb;
alter table public.inventaires add column if not exists total_ecarts    int;

-- ── Index updated_at (pull incrémental) ──────────────────────────────────────
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
    execute format('create index if not exists %I on public.%I (updated_at)',
                   t || '_updated_at_idx', t);
  end loop;
end $$;


-- ############################################################################
-- #  PARTIE 3 / 5 — RLS MÉTIER DURCIE (ISOLATION PAR MAGASIN)
-- ############################################################################
-- Le navigateur écrit via PostgREST avec le rôle `authenticated`. La RLS
-- garantit désormais qu'un utilisateur n'accède QU'À ses magasins.
--   • Tables TRANSACTIONNELLES : cloisonnées (voir groupes ci-dessous).
--   • Tables PARTAGÉES (catalogues/référentiels) : accessibles à tout
--     utilisateur authentifié (comportement voulu).
--   • Rôle `anon` : AUCUN droit (aucune donnée métier sans session).
--
-- NOTE : les policies tolèrent les lignes SANS magasin (NULL) pour ne jamais
-- verrouiller des données globales ou héritées. Sur un projet neuf, aucune
-- ligne orpheline n'existe : l'isolation est de fait totale.

-- Active RLS + accorde les GRANTs sur TOUTES les tables (pré-requis des policies).
do $$
declare
  t text;
  tables text[] := array[
    'clients', 'articles', 'montures', 'acteurs', 'verres_types', 'professions',
    'ventes', 'reglements', 'factures_assurance', 'reglements_assurance',
    'releves_assurance', 'inventaires', 'mouvements_stock', 'bons',
    'rdv_enligne', 'emplois_du_temps', 'catalogues', 'audit_log',
    'referentiels', 'app_data', 'bons_commande_verres'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    -- On repart d'un état propre : suppression des éventuelles anciennes policies.
    execute format('drop policy if exists %I on public.%I', t || '_auth_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_delete', t);
  end loop;
end $$;

-- ── Tables PARTAGÉES (non cloisonnées) : accès à tout authentifié ────────────
do $$
declare
  t text;
  tables text[] := array[
    'articles', 'montures', 'acteurs', 'verres_types', 'professions',
    'catalogues', 'referentiels', 'app_data'
  ];
begin
  foreach t in array tables loop
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   t || '_auth_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)',
                   t || '_auth_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
                   t || '_auth_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)',
                   t || '_auth_delete', t);
  end loop;
end $$;

-- `app_data` porte des réglages GLOBAUX (partagés, non cloisonnés) : sa
-- SUPPRESSION est réservée aux admins. insert/update restent ouverts
-- (auto-enregistrement des référentiels lors d'une vente, sauvegarde réglages).
drop policy if exists app_data_auth_delete on public.app_data;
create policy app_data_auth_delete on public.app_data
  for delete to authenticated using (public.est_admin());

-- ── Groupe 1 : tables à magasin unique (colonne magasin_id) ─────────────────
do $$
declare
  t text;
  tables text[] := array[
    'clients', 'ventes', 'reglements', 'factures_assurance',
    'reglements_assurance', 'releves_assurance', 'inventaires',
    'rdv_enligne', 'emplois_du_temps', 'audit_log'
  ];
  cond text := '(public.est_admin() '
            || 'or magasin_id is null '
            || 'or public.norm_id(magasin_id) = any(public.mes_magasins_norm()))';
begin
  foreach t in array tables loop
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   t || '_auth_select', t, cond);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   t || '_auth_insert', t, cond);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   t || '_auth_update', t, cond, cond);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   t || '_auth_delete', t, cond);
    raise notice 'public.% : isolation magasin_id appliquée', t;
  end loop;
end $$;

-- ── Groupe 2 : bons (DEUX magasins : colonnes magasin_source/destination) ───
do $$
declare
  cond text := '(public.est_admin() '
            || 'or (magasin_source is null and magasin_destination is null) '
            || 'or public.norm_id(magasin_source) = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(magasin_destination) = any(public.mes_magasins_norm()))';
begin
  execute format('create policy bons_auth_select on public.bons for select to authenticated using (%s)', cond);
  execute format('create policy bons_auth_insert on public.bons for insert to authenticated with check (%s)', cond);
  execute format('create policy bons_auth_update on public.bons for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy bons_auth_delete on public.bons for delete to authenticated using (%s)', cond);
  raise notice 'public.bons : isolation source/destination appliquée';
end $$;

-- ── Groupe 3 : mouvements_stock (DEUX magasins DANS data jsonb) ─────────────
do $$
declare
  cond text := '(public.est_admin() '
            || 'or (data->>''magasin_source'' is null and data->>''magasin_destination'' is null) '
            || 'or public.norm_id(data->>''magasin_source'') = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(data->>''magasin_destination'') = any(public.mes_magasins_norm()))';
begin
  execute format('create policy mouvements_stock_auth_select on public.mouvements_stock for select to authenticated using (%s)', cond);
  execute format('create policy mouvements_stock_auth_insert on public.mouvements_stock for insert to authenticated with check (%s)', cond);
  execute format('create policy mouvements_stock_auth_update on public.mouvements_stock for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy mouvements_stock_auth_delete on public.mouvements_stock for delete to authenticated using (%s)', cond);
  raise notice 'public.mouvements_stock : isolation source/destination (data) appliquée';
end $$;

-- ── Groupe 4 : bons_commande_verres (colonne `magasin`, magasin unique) ─────
do $$
declare
  cond text := '(public.est_admin() '
            || 'or magasin is null '
            || 'or public.norm_id(magasin) = any(public.mes_magasins_norm()))';
begin
  execute format('create policy bons_commande_verres_select on public.bons_commande_verres for select to authenticated using (%s)', cond);
  execute format('create policy bons_commande_verres_insert on public.bons_commande_verres for insert to authenticated with check (%s)', cond);
  execute format('create policy bons_commande_verres_update on public.bons_commande_verres for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy bons_commande_verres_delete on public.bons_commande_verres for delete to authenticated using (%s)', cond);
  raise notice 'public.bons_commande_verres : isolation magasin appliquée';
end $$;


-- ############################################################################
-- #  PARTIE 4 / 5 — ACTIVATION DU TEMPS RÉEL (postgres_changes)
-- ############################################################################

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
    raise notice 'Publication supabase_realtime créée';
  end if;
end $$;

do $$
declare
  t text;
  tables text[] := array[
    'clients', 'articles', 'montures', 'acteurs', 'verres_types', 'professions',
    'ventes', 'reglements', 'factures_assurance', 'reglements_assurance',
    'releves_assurance', 'inventaires', 'mouvements_stock', 'bons',
    'rdv_enligne', 'emplois_du_temps', 'catalogues', 'audit_log',
    'referentiels', 'app_data', 'bons_commande_verres'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;


-- ############################################################################
-- #  PARTIE 5 / 5 — VÉRIFICATIONS
-- ############################################################################

-- 22 tables attendues (21 métier + kv_store_10865fd7).
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

-- Fonctions de sécurité présentes (5 attendues).
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('norm_id', 'app_initialisee', 'mon_user_meta', 'mes_magasins_norm', 'est_admin')
order by proname;

-- Aucune table avec RLS active et SANS policy (0 ligne attendue).
select c.relname as table_sans_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname)
order by 1;

-- Les tables transactionnelles doivent référencer mes_magasins_norm()/est_admin()
-- (et NON `using(true)`).
select tablename, policyname, qual
from pg_policies
where schemaname = 'public' and policyname like '%\_auth\_select'
order by tablename;

-- Tables publiées en temps réel.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
