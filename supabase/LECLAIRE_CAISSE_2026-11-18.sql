-- ============================================================================
--  OPTICLAIRE — LECLAIRE (caisse des ouvertures de magasins et des missions)
--  (2026-11-18)
--  Dashboard du projet OPTICLAIRE → SQL Editor → New query → coller TOUT ce
--  fichier → RUN. ENTIÈREMENT IDEMPOTENT : peut être relancé sans risque, il
--  ne supprime ni ne modifie aucune donnée existante.
--
--  LECLAIRE est une caisse SÉPARÉE : ses tables (leclaire_caisse_*) et son
--  espace de fichiers (leclaire-justificatifs) sont à part. Aucune table
--  d'OPTICLAIRE n'est modifiée (ventes, caisse des magasins, stock… restent
--  intacts) et LECLAIRE ne lit rien d'autre que les droits des comptes.
--
--  Qui accède (cases de la fiche utilisateur, Gestion des utilisateurs) :
--   - administrateurs et super administrateur d'OPTICLAIRE : d'office,
--     comme administrateurs de LECLAIRE ;
--   - case « Accès LECLAIRE » : saisit ses entrées / dépenses et ne voit que
--     les siennes ;
--   - case « Administrateur LECLAIRE » : voit et gère tout LECLAIRE (tous les
--     mouvements, magasins LECLAIRE, utilisateurs, paramètres, historique).
--  Un compte ne peut pas se donner ces droits lui-même (fiche protégée).
--
--  Justificatifs : espace privé « leclaire-justificatifs » (photos et PDF),
--  jamais de lien public. Chacun lit ceux de SES mouvements ; les
--  administrateurs LECLAIRE lisent tout ; seuls eux suppriment.
-- ============================================================================

-- 0) Bonne base ? (le script s'arrête avec un message clair sinon)
do $$
begin
  if to_regclass('public.kv_store_10865fd7') is null
     or to_regprocedure('public.est_admin()') is null
     or to_regprocedure('public.mon_user_meta()') is null then
    raise exception using message =
      'Cette base n''est pas celle d''OPTICLAIRE (table kv_store_10865fd7 ou fonctions de sécurité absentes). '
      || 'Ouvrez le projet Supabase de l''application OPTICLAIRE (et exécutez d''abord CORRECTIFS_SECURITE.sql) puis relancez ce script.';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception using message = 'Le stockage Supabase (schéma storage) est absent de ce projet.';
  end if;
end $$;

-- ############################################################################
-- 1) TABLES (séparées d'OPTICLAIRE)
-- ############################################################################

-- Personnes de LECLAIRE. `compte` = compte de connexion OPTICLAIRE. Une
-- personne reprise de l'ancienne application sans compte correspondant garde
-- ses mouvements (compte vide) jusqu'à ce qu'un administrateur la rattache.
create table if not exists public.leclaire_caisse_utilisateurs (
  id          text primary key,
  compte      uuid unique,
  nom         text not null default '',
  email       text not null default '',
  ancien_role text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Magasins LECLAIRE (magasins en cours d'ouverture, missions…) : liste propre
-- à LECLAIRE, sans lien avec les magasins d'OPTICLAIRE.
create table if not exists public.leclaire_caisse_magasins (
  id         text primary key,
  nom        text not null,
  created_at timestamptz not null default now()
);

-- Entrées (income) et dépenses (expense).
create table if not exists public.leclaire_caisse_mouvements (
  id                  text primary key,
  utilisateur_id      text not null references public.leclaire_caisse_utilisateurs(id) on update cascade,
  type                text not null check (type in ('income', 'expense')),
  montant             numeric(16,2) not null check (montant >= 0),
  date                date not null,
  description         text not null default '',
  categorie           text not null default '',
  mode_paiement       text not null default '',
  beneficiaire        text not null default '',
  commentaire         text not null default '',
  magasin_id          text,
  magasin_nom         text,
  justificatif_nom    text,
  justificatif_type   text,
  justificatif_chemin text,
  cree_par            uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists leclaire_caisse_mouvements_utilisateur_idx on public.leclaire_caisse_mouvements (utilisateur_id);
create index if not exists leclaire_caisse_mouvements_date_idx on public.leclaire_caisse_mouvements (date desc, created_at desc);
create index if not exists leclaire_caisse_mouvements_magasin_idx on public.leclaire_caisse_mouvements (magasin_id);

create table if not exists public.leclaire_caisse_categories (
  nom        text primary key,
  created_at timestamptz not null default now()
);

-- Paramètres (une seule ligne).
create table if not exists public.leclaire_caisse_reglages (
  id                       smallint primary key default 1 check (id = 1),
  devise                   text not null default 'FCFA',
  code_devise              text not null default 'XOF',
  decouvert_autorise       boolean not null default false,
  justificatif_obligatoire boolean not null default false,
  nom_entreprise           text not null default 'LECLAIRE',
  updated_at               timestamptz not null default now()
);

-- Historique des actions (jamais modifié ni supprimé depuis l'application).
create table if not exists public.leclaire_caisse_journal (
  id               text primary key default gen_random_uuid()::text,
  compte           uuid,
  utilisateur_nom  text not null default '',
  utilisateur_role text,
  action           text not null,
  mouvement_id     text,
  description      text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists leclaire_caisse_journal_date_idx on public.leclaire_caisse_journal (created_at desc);

-- Valeurs de départ (seulement sur une base neuve : rien n'est réimposé).
insert into public.leclaire_caisse_reglages (id) values (1) on conflict (id) do nothing;
insert into public.leclaire_caisse_categories (nom)
select c from unnest(array['Alimentation', 'Transport', 'Loyer', 'Électricité', 'Eau', 'Internet',
                           'Salaire', 'Fournitures', 'Achat', 'Santé', 'Communication', 'Autre']) as c
where not exists (select 1 from public.leclaire_caisse_categories)
on conflict (nom) do nothing;

-- ############################################################################
-- 2) DROITS
-- ############################################################################

-- Rôle LECLAIRE de l'appelant : 'admin', 'utilisateur' ou vide (pas d'accès).
create or replace function public.leclaire_caisse_role()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when auth.uid() is null then null
    when public.est_admin() then 'admin'
    when coalesce(public.mon_user_meta()->'menuAccess', '[]'::jsonb) ? 'droit:leclaire-admin' then 'admin'
    when coalesce(public.mon_user_meta()->'menuAccess', '[]'::jsonb) ? 'droit:leclaire' then 'utilisateur'
  end;
$$;

-- Personne(s) LECLAIRE rattachée(s) au compte de l'appelant.
create or replace function public.leclaire_caisse_mes_ids()
returns text[]
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(array_agg(u.id), array[]::text[])
  from public.leclaire_caisse_utilisateurs u
  where auth.uid() is not null and u.compte = auth.uid();
$$;

create or replace function public.leclaire_caisse_est_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(public.leclaire_caisse_role() = 'admin', false);
$$;

-- À l'ouverture de LECLAIRE : rôle de l'appelant, et sa fiche LECLAIRE
-- (créée au premier passage avec le nom et l'e-mail de son compte).
create or replace function public.leclaire_caisse_entree()
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text := public.leclaire_caisse_role();
  v_nom   text;
  v_email text;
  v_id    text;
begin
  if v_uid is null or v_role is null then
    return jsonb_build_object('role', null);
  end if;
  select nullif(btrim(coalesce(u.raw_user_meta_data->>'prenom', '') || ' ' || coalesce(u.raw_user_meta_data->>'nom', '')), ''),
         coalesce(u.email, '')
    into v_nom, v_email
    from auth.users u where u.id = v_uid;
  select id into v_id from public.leclaire_caisse_utilisateurs where compte = v_uid;
  if v_id is null then
    v_id := v_uid::text;
    insert into public.leclaire_caisse_utilisateurs (id, compte, nom, email)
    values (v_id, v_uid, coalesce(v_nom, nullif(v_email, ''), 'Utilisateur'), coalesce(v_email, ''))
    on conflict (id) do update set compte = excluded.compte, updated_at = now();
  else
    update public.leclaire_caisse_utilisateurs
       set nom = coalesce(v_nom, nom), email = coalesce(nullif(v_email, ''), email), updated_at = now()
     where id = v_id;
  end if;
  return (select jsonb_build_object('role', v_role, 'id', u.id, 'nom', u.nom, 'email', u.email)
            from public.leclaire_caisse_utilisateurs u where u.id = v_id);
end;
$$;

-- Comptes OPTICLAIRE (administrateurs LECLAIRE seulement) : ceux qui ont accès
-- à LECLAIRE ; tous les comptes pour un administrateur d'OPTICLAIRE (reprise
-- des données, rattachement d'une ancienne personne à un compte).
create or replace function public.leclaire_caisse_comptes()
returns table (compte uuid, nom text, email text, acces text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_tous boolean := public.est_admin();
begin
  if not public.leclaire_caisse_est_admin() then
    raise exception using message = 'Réservé aux administrateurs LECLAIRE.';
  end if;
  return query
  with metas as (
    select substr(k.key, 11)::uuid as uid, k.value as meta
      from public.kv_store_10865fd7 k
     where k.key like 'user_meta:%'
       and substr(k.key, 11) ~ '^[0-9a-fA-F-]{36}$'
  ), droits as (
    select m.uid,
           case
             when exists (select 1 from jsonb_array_elements(coalesce(m.meta->'magasins', '[]'::jsonb)) a
                          where a->>'role' in ('super_admin', 'admin', 'administrateur')) then 'admin'
             when coalesce(m.meta->'menuAccess', '[]'::jsonb) ? 'droit:leclaire-admin' then 'admin'
             when coalesce(m.meta->'menuAccess', '[]'::jsonb) ? 'droit:leclaire' then 'utilisateur'
           end as acces
      from metas m
  )
  select u.id,
         coalesce(nullif(btrim(coalesce(u.raw_user_meta_data->>'prenom', '') || ' ' || coalesce(u.raw_user_meta_data->>'nom', '')), ''), u.email, '')::text,
         coalesce(u.email, '')::text,
         d.acces
    from auth.users u
    left join droits d on d.uid = u.id
   where d.acces is not null or v_tous
   order by 2;
end;
$$;

-- Rattacher une personne LECLAIRE à un compte OPTICLAIRE (ou l'en détacher).
-- Si le compte a déjà sa fiche, les mouvements y sont regroupés.
create or replace function public.leclaire_caisse_rattacher(p_personne text, p_compte uuid)
returns text
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_cible text;
begin
  if not public.leclaire_caisse_est_admin() then
    raise exception using message = 'Réservé aux administrateurs LECLAIRE.';
  end if;
  if not exists (select 1 from public.leclaire_caisse_utilisateurs where id = p_personne) then
    raise exception using message = 'Personne LECLAIRE introuvable.';
  end if;
  if p_compte is null then
    update public.leclaire_caisse_utilisateurs set compte = null, updated_at = now() where id = p_personne;
    return p_personne;
  end if;
  select id into v_cible from public.leclaire_caisse_utilisateurs where compte = p_compte;
  if v_cible is null or v_cible = p_personne then
    update public.leclaire_caisse_utilisateurs set compte = p_compte, updated_at = now() where id = p_personne;
    return p_personne;
  end if;
  update public.leclaire_caisse_mouvements set utilisateur_id = v_cible where utilisateur_id = p_personne;
  delete from public.leclaire_caisse_utilisateurs where id = p_personne;
  return v_cible;
end;
$$;

-- Lecture d'un justificatif : administrateur LECLAIRE, ou mouvement de
-- l'appelant (même réaffecté), ou fichier qu'il vient de déposer.
create or replace function public.leclaire_caisse_peut_lire_fichier(p_nom text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.leclaire_caisse_est_admin()
      or (public.leclaire_caisse_role() is not null
          and (exists (select 1 from public.leclaire_caisse_mouvements m
                        where m.justificatif_chemin = p_nom
                          and m.utilisateur_id = any(public.leclaire_caisse_mes_ids()))
               or split_part(p_nom, '/', 1) = any(public.leclaire_caisse_mes_ids())));
$$;

revoke all on function public.leclaire_caisse_role()                 from public, anon;
revoke all on function public.leclaire_caisse_mes_ids()              from public, anon;
revoke all on function public.leclaire_caisse_est_admin()            from public, anon;
revoke all on function public.leclaire_caisse_entree()               from public, anon;
revoke all on function public.leclaire_caisse_comptes()              from public, anon;
revoke all on function public.leclaire_caisse_rattacher(text, uuid)  from public, anon;
revoke all on function public.leclaire_caisse_peut_lire_fichier(text) from public, anon;
grant execute on function public.leclaire_caisse_role()                 to authenticated;
grant execute on function public.leclaire_caisse_mes_ids()              to authenticated;
grant execute on function public.leclaire_caisse_est_admin()            to authenticated;
grant execute on function public.leclaire_caisse_entree()               to authenticated;
grant execute on function public.leclaire_caisse_comptes()              to authenticated;
grant execute on function public.leclaire_caisse_rattacher(text, uuid)  to authenticated;
grant execute on function public.leclaire_caisse_peut_lire_fichier(text) to authenticated;

-- ############################################################################
-- 3) RÈGLES D'ACCÈS AUX TABLES (RLS)
-- ############################################################################
alter table public.leclaire_caisse_utilisateurs enable row level security;
alter table public.leclaire_caisse_magasins     enable row level security;
alter table public.leclaire_caisse_mouvements   enable row level security;
alter table public.leclaire_caisse_categories   enable row level security;
alter table public.leclaire_caisse_reglages     enable row level security;
alter table public.leclaire_caisse_journal      enable row level security;

revoke all on public.leclaire_caisse_utilisateurs, public.leclaire_caisse_magasins,
              public.leclaire_caisse_mouvements, public.leclaire_caisse_categories,
              public.leclaire_caisse_reglages, public.leclaire_caisse_journal from anon;
grant select, insert, update, delete on public.leclaire_caisse_utilisateurs, public.leclaire_caisse_magasins,
              public.leclaire_caisse_mouvements, public.leclaire_caisse_categories,
              public.leclaire_caisse_reglages, public.leclaire_caisse_journal to authenticated;

-- Personnes : chacun voit sa fiche ; l'administration LECLAIRE gère tout.
drop policy if exists lc_utilisateurs_lecture on public.leclaire_caisse_utilisateurs;
create policy lc_utilisateurs_lecture on public.leclaire_caisse_utilisateurs
  for select to authenticated
  using (public.leclaire_caisse_est_admin() or compte = auth.uid());
drop policy if exists lc_utilisateurs_gestion on public.leclaire_caisse_utilisateurs;
create policy lc_utilisateurs_gestion on public.leclaire_caisse_utilisateurs
  for all to authenticated
  using (public.leclaire_caisse_est_admin())
  with check (public.leclaire_caisse_est_admin());

-- Mouvements : chacun voit et saisit les siens ; seule l'administration
-- LECLAIRE voit tout, modifie, réaffecte et supprime.
drop policy if exists lc_mouvements_lecture on public.leclaire_caisse_mouvements;
create policy lc_mouvements_lecture on public.leclaire_caisse_mouvements
  for select to authenticated
  using (public.leclaire_caisse_est_admin()
         or (public.leclaire_caisse_role() is not null and utilisateur_id = any(public.leclaire_caisse_mes_ids())));
drop policy if exists lc_mouvements_saisie on public.leclaire_caisse_mouvements;
create policy lc_mouvements_saisie on public.leclaire_caisse_mouvements
  for insert to authenticated
  with check (public.leclaire_caisse_est_admin()
              or (public.leclaire_caisse_role() is not null
                  and utilisateur_id = any(public.leclaire_caisse_mes_ids())
                  and cree_par = auth.uid()));
drop policy if exists lc_mouvements_modification on public.leclaire_caisse_mouvements;
create policy lc_mouvements_modification on public.leclaire_caisse_mouvements
  for update to authenticated
  using (public.leclaire_caisse_est_admin())
  with check (public.leclaire_caisse_est_admin());
drop policy if exists lc_mouvements_suppression on public.leclaire_caisse_mouvements;
create policy lc_mouvements_suppression on public.leclaire_caisse_mouvements
  for delete to authenticated
  using (public.leclaire_caisse_est_admin());

-- Magasins LECLAIRE : lus par tous les utilisateurs LECLAIRE, gérés par l'administration.
drop policy if exists lc_magasins_lecture on public.leclaire_caisse_magasins;
create policy lc_magasins_lecture on public.leclaire_caisse_magasins
  for select to authenticated
  using (public.leclaire_caisse_role() is not null);
drop policy if exists lc_magasins_gestion on public.leclaire_caisse_magasins;
create policy lc_magasins_gestion on public.leclaire_caisse_magasins
  for all to authenticated
  using (public.leclaire_caisse_est_admin())
  with check (public.leclaire_caisse_est_admin());

-- Catégories : tout utilisateur LECLAIRE en ajoute (à la saisie) ; l'administration gère.
drop policy if exists lc_categories_lecture on public.leclaire_caisse_categories;
create policy lc_categories_lecture on public.leclaire_caisse_categories
  for select to authenticated
  using (public.leclaire_caisse_role() is not null);
drop policy if exists lc_categories_ajout on public.leclaire_caisse_categories;
create policy lc_categories_ajout on public.leclaire_caisse_categories
  for insert to authenticated
  with check (public.leclaire_caisse_role() is not null);
drop policy if exists lc_categories_gestion on public.leclaire_caisse_categories;
create policy lc_categories_gestion on public.leclaire_caisse_categories
  for all to authenticated
  using (public.leclaire_caisse_est_admin())
  with check (public.leclaire_caisse_est_admin());

-- Paramètres : lus par tous les utilisateurs LECLAIRE, modifiés par l'administration.
drop policy if exists lc_reglages_lecture on public.leclaire_caisse_reglages;
create policy lc_reglages_lecture on public.leclaire_caisse_reglages
  for select to authenticated
  using (public.leclaire_caisse_role() is not null);
drop policy if exists lc_reglages_gestion on public.leclaire_caisse_reglages;
create policy lc_reglages_gestion on public.leclaire_caisse_reglages
  for all to authenticated
  using (public.leclaire_caisse_est_admin())
  with check (public.leclaire_caisse_est_admin());

-- Historique : chacun y inscrit ses propres actions ; seule l'administration le lit.
drop policy if exists lc_journal_lecture on public.leclaire_caisse_journal;
create policy lc_journal_lecture on public.leclaire_caisse_journal
  for select to authenticated
  using (public.leclaire_caisse_est_admin());
drop policy if exists lc_journal_ajout on public.leclaire_caisse_journal;
create policy lc_journal_ajout on public.leclaire_caisse_journal
  for insert to authenticated
  with check (public.leclaire_caisse_est_admin()
              or (public.leclaire_caisse_role() is not null and compte = auth.uid()));

-- ############################################################################
-- 4) ESPACE DES JUSTIFICATIFS (privé)
--    Chemin : <personne LECLAIRE>/<identifiant du mouvement>/<fichier>
-- ############################################################################
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leclaire-justificatifs', 'leclaire-justificatifs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists leclaire_justificatifs_lecture on storage.objects;
create policy leclaire_justificatifs_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'leclaire-justificatifs' and public.leclaire_caisse_peut_lire_fichier(name));

drop policy if exists leclaire_justificatifs_depot on storage.objects;
create policy leclaire_justificatifs_depot on storage.objects
  for insert to authenticated
  with check (bucket_id = 'leclaire-justificatifs'
              and (public.leclaire_caisse_est_admin()
                   or (public.leclaire_caisse_role() is not null
                       and (storage.foldername(name))[1] = any(public.leclaire_caisse_mes_ids()))));

drop policy if exists leclaire_justificatifs_remplacement on storage.objects;
create policy leclaire_justificatifs_remplacement on storage.objects
  for update to authenticated
  using (bucket_id = 'leclaire-justificatifs' and public.leclaire_caisse_est_admin())
  with check (bucket_id = 'leclaire-justificatifs' and public.leclaire_caisse_est_admin());

drop policy if exists leclaire_justificatifs_suppression on storage.objects;
create policy leclaire_justificatifs_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'leclaire-justificatifs' and public.leclaire_caisse_est_admin());

-- ############################################################################
-- 5) VÉRIFICATION (seul ce résultat s'affiche dans Supabase)
-- ############################################################################
select 'Tables LECLAIRE' as element,
       count(*)::text || ' / 6' as etat
  from pg_tables
 where schemaname = 'public' and tablename in ('leclaire_caisse_utilisateurs', 'leclaire_caisse_magasins',
       'leclaire_caisse_mouvements', 'leclaire_caisse_categories', 'leclaire_caisse_reglages', 'leclaire_caisse_journal')
   and rowsecurity
union all
select 'Règles d''accès des tables', count(*)::text || ' / 15'
  from pg_policies where schemaname = 'public' and policyname like 'lc\_%'
union all
select 'Espace des justificatifs',
       coalesce((select case when public then 'leclaire-justificatifs (PUBLIC !)' else 'leclaire-justificatifs (privé)' end
                   from storage.buckets where id = 'leclaire-justificatifs'), 'ABSENT')
union all
select 'Règles d''accès des justificatifs', count(*)::text || ' / 4'
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'leclaire\_justificatifs\_%'
union all
select 'Mouvements LECLAIRE enregistrés', count(*)::text from public.leclaire_caisse_mouvements
union all
select 'Personnes LECLAIRE', count(*)::text from public.leclaire_caisse_utilisateurs;
