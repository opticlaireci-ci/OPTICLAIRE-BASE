-- ============================================================================
--  OPTICLAIRE — CORRECTIFS DE SÉCURITÉ (audit senior) — BASELINE TOLÉRANTE
--  Dashboard → SQL Editor → New query → coller TOUT ce fichier → RUN
--
--  Applique la sécurité LÀ OÙ ELLE EST NON CONTOURNABLE : dans Postgres (RLS).
--  Aucune donnée métier n'est déplacée vers l'edge function : le navigateur
--  continue d'écrire en direct via PostgREST avec le rôle `authenticated`, mais
--  c'est désormais la BASE qui filtre par utilisateur et par magasin.
--
--  ENTIÈREMENT IDEMPOTENT : relançable sans rien détruire ni perdre.
--
--  ⚠️ Ce fichier est la BASELINE « tolérante au NULL » : les lignes historiques
--     sans magasin identifiable restent visibles pour ne verrouiller personne.
--     Pour l'isolation TOTALE, exécutez ensuite `ISOLATION_STRICTE.sql`.
--
--  ORDRE (du plus grave au moins grave) :
--    CRITIQUE 1 — Fermer l'élévation de privilège (auto-écriture de user_meta)
--    CRITIQUE 2 — Isolation multi-tenant par magasin (RLS)
--    MOYEN      — Verrouiller le drapeau d'initialisation
-- ============================================================================


-- ############################################################################
-- #  FONCTIONS UTILITAIRES (SECURITY DEFINER)
-- ############################################################################
-- SECURITY DEFINER : elles lisent kv_store en contournant la RLS, ce qui évite
-- toute récursion de policy. `search_path = ''` fige la résolution des objets.

-- Normalisation d'un identifiant de magasin — RÉPLIQUE EXACTE de normId()
-- (supabase/functions/server/index.tsx) : minuscule → suppression de tout ce
-- qui n'est pas [a-z0-9] → suppression du préfixe 'leclaire'.
--   'ABOBO', 'abobo', 'LECLAIRE ABOBO', 'leclaire-abobo' → 'abobo'
-- INDISPENSABLE : les données stockent souvent magasin_id en MAJUSCULES alors
-- que user_meta peut le stocker autrement. Sans cette normalisation des DEUX
-- côtés, la comparaison échoue et masque des données légitimes.
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

-- L'application est-elle déjà initialisée (un propriétaire a été créé) ?
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

-- Magasins autorisés pour l'appelant, DÉJÀ NORMALISÉS (comparables à norm_id).
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

grant execute on function public.norm_id(text)      to authenticated, anon;
grant execute on function public.app_initialisee()  to authenticated, anon;
grant execute on function public.mon_user_meta()    to authenticated;
grant execute on function public.mes_magasins_norm() to authenticated;
grant execute on function public.est_admin()        to authenticated;

-- ############################################################################
-- #  CRITIQUE 0 — RLS + GRANT EXPLICITES SUR LA TABLE KV
-- ############################################################################
-- Toutes les policies ci-dessous sont INERTES si la RLS n'est pas active sur la
-- table. On l'active donc explicitement (idempotent) et on pose les GRANT de
-- table : sans RLS active + policy, PostgREST refuse ; sans GRANT, il refuse
-- aussi. Les deux sont nécessaires. `kv_store_10865fd7` contient les rôles
-- (`user_meta:*`) et les données métier (`storage:*`) : sa protection est la
-- pierre angulaire de la sécurité multi-tenant.
alter table public.kv_store_10865fd7 enable row level security;

grant select, insert, update, delete on public.kv_store_10865fd7 to authenticated;
-- `anon` : lecture seule (thème saisonnier / écran de connexion avant session).
grant select on public.kv_store_10865fd7 to anon;


-- ############################################################################
-- #  CRITIQUE 1 — ÉLÉVATION DE PRIVILÈGE
-- ############################################################################
-- APRÈS : l'auto-écriture de `user_meta` n'est autorisée QUE pendant le
-- bootstrap (tant que `app_data:initialized` n'existe pas). Une fois l'app
-- initialisée, plus AUCUN client ne peut modifier un rôle : les changements de
-- rôle passent exclusivement par l'edge function d'administration (service_role).

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

-- Lecture de son propre user_meta : conservée (repli de connexion).
drop policy if exists "user lit son propre user_meta" on public.kv_store_10865fd7;
create policy "user lit son propre user_meta"
  on public.kv_store_10865fd7
  for select
  to authenticated
  using (key = 'user_meta:' || auth.uid()::text);


-- ############################################################################
-- #  MOYEN — VERROUILLAGE DU DRAPEAU D'INITIALISATION
-- ############################################################################
-- `app_data:initialized` n'est écrit qu'UNE fois (tant qu'il n'existe pas) et
-- devient immuable côté client : impossible de « ré-ouvrir » le bootstrap.

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
-- (Pas de policy UPDATE : le drapeau est immuable côté client.)


-- ############################################################################
-- #  CRITIQUE 2 — ISOLATION MULTI-TENANT (par magasin) — TOLÉRANTE AU NULL
-- ############################################################################
-- Sur les tables TRANSACTIONNELLES, la RLS n'autorise que :
--   • les admins/super_admins (accès inter-magasins), OU
--   • les lignes dont le magasin (normalisé) fait partie des magasins de
--     l'utilisateur, OU
--   • les lignes SANS magasin identifiable (tolérance historique — retirée par
--     ISOLATION_STRICTE.sql).
-- Les catalogues/référentiels partagés (articles, montures, verres_types,
-- acteurs, professions, catalogues, referentiels, app_data) NE sont PAS
-- cloisonnés : ils restent accessibles à tout utilisateur authentifié.

-- ── Groupe 1 : tables à magasin unique (colonne magasin_id) ─────────────────
do $$
declare
  t text;
  tables text[] := array[
    'clients', 'ventes', 'reglements', 'factures_assurance',
    'reglements_assurance', 'releves_assurance', 'inventaires',
    'rdv_enligne', 'emplois_du_temps', 'audit_log'
  ];
  -- magasin_id normalisé des DEUX côtés ; NULL toléré (baseline).
  cond text := '(public.est_admin() '
            || 'or magasin_id is null '
            || 'or public.norm_id(magasin_id) = any(public.mes_magasins_norm()))';
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_auth_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_delete', t);

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   t || '_auth_select', t, cond);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   t || '_auth_insert', t, cond);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   t || '_auth_update', t, cond, cond);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   t || '_auth_delete', t, cond);

    raise notice 'public.% : isolation magasin_id (tolérante) appliquée', t;
  end loop;
end $$;

-- ── Groupe 2 : bons (DEUX magasins — colonnes magasin_source/destination) ───
-- Un bon de transfert/distribution concerne une source ET une destination :
-- accès si l'un des deux appartient aux magasins de l'utilisateur.
do $$
declare
  cond text := '(public.est_admin() '
            || 'or (magasin_source is null and magasin_destination is null) '
            || 'or public.norm_id(magasin_source) = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(magasin_destination) = any(public.mes_magasins_norm()))';
begin
  execute 'drop policy if exists bons_auth_select on public.bons';
  execute 'drop policy if exists bons_auth_insert on public.bons';
  execute 'drop policy if exists bons_auth_update on public.bons';
  execute 'drop policy if exists bons_auth_delete on public.bons';

  execute format('create policy bons_auth_select on public.bons for select to authenticated using (%s)', cond);
  execute format('create policy bons_auth_insert on public.bons for insert to authenticated with check (%s)', cond);
  execute format('create policy bons_auth_update on public.bons for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy bons_auth_delete on public.bons for delete to authenticated using (%s)', cond);
  raise notice 'public.bons : isolation source/destination (tolérante) appliquée';
end $$;

-- ── Groupe 3 : mouvements_stock (DEUX magasins DANS data jsonb) ─────────────
-- Ces colonnes n'existent pas en dur : les services rangent magasin_source /
-- magasin_destination dans le fourre-tout `data`.
do $$
declare
  cond text := '(public.est_admin() '
            || 'or (data->>''magasin_source'' is null and data->>''magasin_destination'' is null) '
            || 'or public.norm_id(data->>''magasin_source'') = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(data->>''magasin_destination'') = any(public.mes_magasins_norm()))';
begin
  execute 'drop policy if exists mouvements_stock_auth_select on public.mouvements_stock';
  execute 'drop policy if exists mouvements_stock_auth_insert on public.mouvements_stock';
  execute 'drop policy if exists mouvements_stock_auth_update on public.mouvements_stock';
  execute 'drop policy if exists mouvements_stock_auth_delete on public.mouvements_stock';

  execute format('create policy mouvements_stock_auth_select on public.mouvements_stock for select to authenticated using (%s)', cond);
  execute format('create policy mouvements_stock_auth_insert on public.mouvements_stock for insert to authenticated with check (%s)', cond);
  execute format('create policy mouvements_stock_auth_update on public.mouvements_stock for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy mouvements_stock_auth_delete on public.mouvements_stock for delete to authenticated using (%s)', cond);
  raise notice 'public.mouvements_stock : isolation source/destination dans data (tolérante) appliquée';
end $$;

-- ── Groupe 4 : bons_commande_verres (colonne `magasin`, magasin unique) ─────
do $$
declare
  cond text := '(public.est_admin() '
            || 'or magasin is null '
            || 'or public.norm_id(magasin) = any(public.mes_magasins_norm()))';
begin
  execute 'drop policy if exists bons_commande_verres_select on public.bons_commande_verres';
  execute 'drop policy if exists bons_commande_verres_insert on public.bons_commande_verres';
  execute 'drop policy if exists bons_commande_verres_update on public.bons_commande_verres';
  execute 'drop policy if exists bons_commande_verres_delete on public.bons_commande_verres';

  execute format('create policy bons_commande_verres_select on public.bons_commande_verres for select to authenticated using (%s)', cond);
  execute format('create policy bons_commande_verres_insert on public.bons_commande_verres for insert to authenticated with check (%s)', cond);
  execute format('create policy bons_commande_verres_update on public.bons_commande_verres for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy bons_commande_verres_delete on public.bons_commande_verres for delete to authenticated using (%s)', cond);
  raise notice 'public.bons_commande_verres : isolation magasin (tolérante) appliquée';
end $$;


-- ############################################################################
-- #  VÉRIFICATIONS
-- ############################################################################
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'kv_store_10865fd7'
order by policyname;

select tablename, policyname, qual
from pg_policies
where schemaname = 'public' and policyname like '%\_auth\_select'
order by tablename;
