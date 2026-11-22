-- ============================================================================
--  OPTICLAIRE — CHARGES DU MOIS ET SALAIRES DES EMPLOYÉS (2026-11-23)
--  Dashboard du projet OPTICLAIRE → SQL Editor → New query → coller TOUT ce
--  fichier → RUN. ENTIÈREMENT IDEMPOTENT : peut être relancé sans risque, il
--  ne supprime ni ne modifie aucune donnée existante.
--
--  Onglet « Charges & salaires » de la page Comptabilité → Mouvements.
--  Les salaires sont des données sensibles : ils ont leur PROPRE table,
--  protégée, et ne sont pas rangés avec les données partagées (app_data,
--  lisibles par tous les comptes). Seuls les super administrateurs,
--  administrateurs, directeurs et comptables (rôle de la fiche utilisateur)
--  lisent et modifient cette table ; aucun accès sans connexion.
--
--  Une ligne par mois (« 2026-10 ») : charges du mois et salaires du mois.
--  La ligne « modele » garde le dernier mois enregistré : un nouveau mois
--  repart de ses officines, références et employés.
-- ============================================================================

-- 0) Bonne base ? (le script s'arrête avec un message clair sinon)
do $$
begin
  if to_regprocedure('public.est_admin()') is null or to_regprocedure('public.mon_user_meta()') is null then
    raise exception using message =
      'Cette base n''est pas celle d''OPTICLAIRE (fonctions de sécurité est_admin / mon_user_meta absentes). '
      || 'Ouvrez le projet Supabase de l''application OPTICLAIRE (et exécutez d''abord CORRECTIFS_SECURITE.sql) puis relancez ce script.';
  end if;
end $$;

-- 1) Table
create table if not exists public.charges_salaires_mois (
  mois        text primary key,
  charges     jsonb,
  salaires    jsonb,
  modifie_par text not null default '',
  modifie_le  timestamptz not null default now(),
  constraint charges_salaires_mois_format check (mois ~ '^[0-9]{4}-[0-9]{2}$' or mois = 'modele')
);

-- 2) Qui peut lire et modifier : administration, direction, comptabilité.
create or replace function public.peut_gerer_salaires()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select auth.uid() is not null and (
    coalesce(public.est_admin(), false)
    or exists (
      select 1
      from jsonb_array_elements(coalesce(public.mon_user_meta()->'magasins', '[]'::jsonb)) as m
      where lower(m->>'role') in ('super_admin', 'admin', 'administrateur', 'directeur', 'comptable')
    )
  );
$$;
revoke all on function public.peut_gerer_salaires() from public, anon;
grant execute on function public.peut_gerer_salaires() to authenticated;

-- 3) Règles d'accès
alter table public.charges_salaires_mois enable row level security;
revoke all on public.charges_salaires_mois from public, anon;
grant select, insert, update, delete on public.charges_salaires_mois to authenticated;

drop policy if exists charges_salaires_gestion on public.charges_salaires_mois;
create policy charges_salaires_gestion on public.charges_salaires_mois
  for all to authenticated
  using (public.peut_gerer_salaires())
  with check (public.peut_gerer_salaires());

-- 4) Vérification (seul ce résultat s'affiche dans Supabase)
select 'Table des charges et salaires' as element,
       coalesce((select case when rowsecurity then 'protégée' else 'NON PROTÉGÉE !' end
                   from pg_tables where schemaname = 'public' and tablename = 'charges_salaires_mois'), 'ABSENTE') as etat
union all
select 'Règle d''accès', count(*)::text || ' / 1'
  from pg_policies where schemaname = 'public' and tablename = 'charges_salaires_mois'
union all
select 'Mois enregistrés', count(*)::text from public.charges_salaires_mois where mois <> 'modele';
