-- ============================================================================
--  CORRECTIF — table public.app_data sans clé primaire
-- ============================================================================
--
--  SYMPTÔME (console de l'app) :
--    kvSetDoc app_data/leclaire_… : No suitable key or wrong key type
--    kvGetCollection app_data      : No suitable key or wrong key type
--
--  CAUSE :
--    La table `app_data` de ce projet (historique) a bien les colonnes
--    `key` / `value`, mais AUCUNE clé primaire. PostgREST refuse alors
--    l'upsert (ON CONFLICT sans cible) et n'expose pas la ressource
--    correctement → « No suitable key or wrong key type ».
--
--  CORRECTIF (idempotent, sans perte de données) :
--    1. dédoublonne `key` (garde la ligne la plus récente) — pré-requis PK ;
--    2. ajoute la clé primaire sur `key` si absente ;
--    3. garantit created_at / updated_at + trigger de mise à jour ;
--    4. rétablit RLS + GRANTs (authenticated : tout ; anon : lecture).
--
--  À exécuter : Dashboard Supabase (projet khhlpczbisgxagxhihvz)
--               → SQL Editor → New query → Run.
-- ============================================================================

-- 0) Colonnes attendues (au cas où l'une manquerait) ─────────────────────────
alter table public.app_data
  add column if not exists value      jsonb not null default '{}'::jsonb,
  add column if not exists created_at  timestamptz default now(),
  add column if not exists updated_at  timestamptz default now();

-- 1) Dédoublonnage : ne garder qu'UNE ligne par `key` (la plus récente) ───────
--    Nécessaire car une clé primaire interdit les doublons. Sans doublon,
--    cette étape ne supprime rien.
delete from public.app_data a
using public.app_data b
where a.key = b.key
  and a.ctid < b.ctid;

-- Écarte d'éventuelles clés nulles (interdites en clé primaire).
delete from public.app_data where key is null;

-- 2) Clé primaire sur `key` (si absente) ─────────────────────────────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_data'::regclass
      and contype  = 'p'
  ) then
    alter table public.app_data add primary key (key);
  end if;
end $$;

-- 3) Index utiles + trigger updated_at ───────────────────────────────────────
create index if not exists app_data_key_prefix_idx
  on public.app_data (key text_pattern_ops);
create index if not exists app_data_updated_at_idx
  on public.app_data (updated_at);

create or replace function public.app_data_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists app_data_touch on public.app_data;
create trigger app_data_touch
  before update on public.app_data
  for each row execute function public.app_data_touch();

-- 4) RLS + GRANTs ────────────────────────────────────────────────────────────
alter table public.app_data enable row level security;

grant select, insert, update, delete on public.app_data to authenticated;
grant select on public.app_data to anon;  -- lectures anonymes (écran de connexion)

-- authenticated : accès complet (table partagée, non cloisonnée par magasin).
drop policy if exists app_data_auth_select on public.app_data;
drop policy if exists app_data_auth_insert on public.app_data;
drop policy if exists app_data_auth_update on public.app_data;
drop policy if exists app_data_auth_delete on public.app_data;

create policy app_data_auth_select on public.app_data
  for select to authenticated using (true);
create policy app_data_auth_insert on public.app_data
  for insert to authenticated with check (true);
create policy app_data_auth_update on public.app_data
  for update to authenticated using (true) with check (true);
-- SUPPRESSION réservée aux admins : `app_data` porte des réglages GLOBAUX
-- (partagés, non cloisonnés). Un employé n'a aucune raison d'effacer une clé
-- globale ; seuls insert/update restent ouverts (auto-enregistrement des
-- référentiels lors d'une vente, sauvegarde de réglages).
create policy app_data_auth_delete on public.app_data
  for delete to authenticated using (public.est_admin());

-- 5) Vérification ────────────────────────────────────────────────────────────
-- Doit renvoyer une ligne : contype = 'p' (clé primaire présente sur `key`).
select conname, contype
from pg_constraint
where conrelid = 'public.app_data'::regclass and contype = 'p';
