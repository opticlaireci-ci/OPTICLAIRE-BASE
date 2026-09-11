-- ============================================================================
-- OPTICLAIRE — MAINTENANCE DEFINITIVE STOCK / VENTES
-- Date : 2026-09
--
-- Objectifs :
--   1. Garantir les colonnes nécessaires aux mouvements de stock.
--   2. Garantir une RLS cohérente avec magasin_id/source/destination + data JSONB.
--   3. Ajouter les index utiles.
--   4. Nettoyer les anciennes valeurs incohérentes de magasin.
--   5. Contrôler les mouvements de vente existants sans supprimer de données.
--
-- IMPORTANT : ce script est volontairement NON DESTRUCTIF.
-- Il ne supprime aucune vente ni aucun mouvement.
-- ============================================================================

begin;

-- 1) Schéma compatible avec toutes les versions de l'application.
alter table public.mouvements_stock add column if not exists magasin_id text;
alter table public.mouvements_stock add column if not exists data jsonb default '{}'::jsonb;
alter table public.mouvements_stock add column if not exists magasin_source text;
alter table public.mouvements_stock add column if not exists magasin_destination text;

-- 2) Migration des anciennes données JSONB vers les colonnes dédiées.
update public.mouvements_stock
set magasin_id = coalesce(magasin_id, data->>'magasin_id', data->>'magasin_source', data->>'magasin_destination'),
    magasin_source = coalesce(magasin_source, data->>'magasin_source'),
    magasin_destination = coalesce(magasin_destination, data->>'magasin_destination')
where (magasin_id is null and (data ? 'magasin_id' or data ? 'magasin_source' or data ? 'magasin_destination'))
   or (magasin_source is null and data ? 'magasin_source')
   or (magasin_destination is null and data ? 'magasin_destination');

-- 3) Normalisation légère des identifiants magasin.
update public.mouvements_stock
set magasin_id = lower(regexp_replace(coalesce(magasin_id,''), '[^a-zA-Z0-9-]', '', 'g'))
where magasin_id is not null;
update public.mouvements_stock
set magasin_source = lower(regexp_replace(coalesce(magasin_source,''), '[^a-zA-Z0-9-]', '', 'g'))
where magasin_source is not null;
update public.mouvements_stock
set magasin_destination = lower(regexp_replace(coalesce(magasin_destination,''), '[^a-zA-Z0-9-]', '', 'g'))
where magasin_destination is not null;

-- 4) Index : lecture du stock et vérifications beaucoup plus rapides.
create index if not exists mouvements_stock_magasin_id_idx
  on public.mouvements_stock (magasin_id);
create index if not exists mouvements_stock_magasin_source_idx
  on public.mouvements_stock (magasin_source);
create index if not exists mouvements_stock_magasin_destination_idx
  on public.mouvements_stock (magasin_destination);
create index if not exists mouvements_stock_bon_article_idx
  on public.mouvements_stock (bon_id, article_id);
create index if not exists mouvements_stock_type_created_idx
  on public.mouvements_stock (type, created_at);

-- 5) RLS : même règle sur INSERT/UPDATE/SELECT/DELETE.
alter table public.mouvements_stock enable row level security;

do $$
declare
  cond text := '(public.est_admin() '
            || 'or (coalesce(magasin_id, magasin_source, magasin_destination, data->>''magasin_id'', data->>''magasin_source'', data->>''magasin_destination'') is null) '
            || 'or public.norm_id(magasin_id) = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(magasin_source) = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(magasin_destination) = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(data->>''magasin_id'') = any(public.mes_magasins_norm()) '
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
end $$;

grant select, insert, update, delete on public.mouvements_stock to authenticated;

-- 6) Contrôles non destructifs : les lignes sont retournées dans le SQL Editor.
--    Une sortie de vente doit avoir type=vente, magasin_source et bon_id.
select id, type, magasin_id, magasin_source, magasin_destination, bon_id, article_id, quantite, created_at
from public.mouvements_stock
where type = 'vente'
  and (magasin_source is null or bon_id is null or article_id is null or coalesce(quantite,0) <= 0)
order by created_at desc nulls last;

commit;

notify pgrst, 'reload schema';
