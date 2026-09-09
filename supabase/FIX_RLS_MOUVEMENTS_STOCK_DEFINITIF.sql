-- ============================================================================
-- OPTICLAIRE — CORRECTION DEFINITIVE RLS mouvements_stock
--
-- Erreur corrigée :
--   new row violates row-level security policy for table "mouvements_stock"
--
-- Cause : selon la version de la base, magasin_source / magasin_destination
-- peuvent être dans data JSONB ou exister comme colonnes réelles. La politique
-- précédente ne regardait que data JSONB. Les ventes étaient donc refusées
-- par RLS alors que le code envoyait les magasins dans les colonnes réelles.
-- ============================================================================

-- 1) On rend le schéma compatible avec les deux formats.
alter table public.mouvements_stock add column if not exists magasin_source text;
alter table public.mouvements_stock add column if not exists magasin_destination text;

-- 2) Migration des anciennes lignes JSONB vers les colonnes réelles.
update public.mouvements_stock
set magasin_source = coalesce(magasin_source, data->>'magasin_source'),
    magasin_destination = coalesce(magasin_destination, data->>'magasin_destination')
where (magasin_source is null and data->>'magasin_source' is not null)
   or (magasin_destination is null and data->>'magasin_destination' is not null);

-- 3) Index utiles.
create index if not exists mouvements_stock_magasin_id_idx
  on public.mouvements_stock (magasin_id);
create index if not exists mouvements_stock_magasin_source_idx
  on public.mouvements_stock (magasin_source);
create index if not exists mouvements_stock_magasin_destination_idx
  on public.mouvements_stock (magasin_destination);

-- 4) RLS robuste : accepte magasin_id, colonnes réelles ET ancien data JSONB.
do $$
declare
  cond text := '(public.est_admin() '
            || 'or (coalesce(magasin_id, magasin_source, magasin_destination, data->>''magasin_source'', data->>''magasin_destination'') is null) '
            || 'or public.norm_id(magasin_id) = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(magasin_source) = any(public.mes_magasins_norm()) '
            || 'or public.norm_id(magasin_destination) = any(public.mes_magasins_norm()) '
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

notify pgrst, 'reload schema';

-- Vérification rapide :
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='mouvements_stock'
  and column_name in ('magasin_id','magasin_source','magasin_destination','data')
order by ordinal_position;
