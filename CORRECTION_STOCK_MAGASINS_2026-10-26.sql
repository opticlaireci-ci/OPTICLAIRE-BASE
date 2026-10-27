-- ============================================================================
--  OPTICLAIRE — STOCK DE CHAQUE MAGASIN VISIBLE À LA VENTE (2026-10-26)
--  Dashboard → SQL Editor → New query → coller TOUT ce fichier → RUN
--  ENTIÈREMENT IDEMPOTENT : peut être exécuté plusieurs fois sans risque.
--
--  Symptôme corrigé : le stock d'un article apparaît dans « État du stock »
--  mais pas à la vente (liste vide, « stock épuisé »), surtout dans certains
--  magasins.
--
--  Causes côté base :
--   1. public.norm_id (comparaison des magasins dans les règles d'accès)
--      SUPPRIMAIT les lettres accentuées : « BOUAKÉ » devenait « bouak », alors
--      que le compte de la vendeuse porte « bouake ». Les bons et mouvements
--      écrits avec l'accent étaient invisibles pour le magasin. Les anciens
--      noms renommés (COCODY → BOUAKÉ, MARCORY → YOPOUGON GANDI) aussi.
--   2. Selon le script de sécurité exécuté en dernier, la règle d'accès de
--      mouvements_stock ne regardait que data->>'magasin_source' /
--      'magasin_destination', alors que l'application écrit ces magasins dans
--      les colonnes : un transfert reçu n'était pas visible du magasin qui le
--      reçoit, et son stock n'apparaissait pas.
--   3. Une colonne magasin vide masquait la valeur rangée dans `data` à la
--      lecture : d'anciens mouvements n'étaient rattachés à aucun magasin.
--
--  Ce script :
--   A. affiche un diagnostic (noms de magasins présents dans les données) ;
--   B. rend norm_id insensible aux accents et aux anciens noms ;
--   C. recopie dans les colonnes les magasins rangés seulement dans `data` ;
--   D. réécrit les règles d'accès de mouvements_stock et de bons pour qu'elles
--      regardent TOUS les champs magasin (colonnes, magasin_id et data), en
--      gardant le mode actuel (strict ou tolérant aux lignes sans magasin) ;
--   E. crée la fonction public.stock_lignes, lue par l'application pour le
--      calcul du stock : seulement les champs utiles au stock (type, article,
--      quantité, magasins, dates, statut) — ni client, ni facture, ni
--      utilisateur. ISOLATION PAR MAGASIN : une vendeuse ne reçoit que les
--      lignes de SON magasin (distributions et transferts reçus, transferts
--      envoyés, ventes, retours, inventaires) ; seuls les administrateurs
--      reçoivent celles de tous les magasins. Le résultat ne dépend plus du
--      script de sécurité exécuté en dernier.
--
--  Sans ce script, l'application fonctionne comme avant (lecture directe des
--  tables, avec les défauts ci-dessus).
-- ============================================================================


-- Colonnes magasin (déjà présentes sur une base à jour ; ajoutées sinon).
alter table public.mouvements_stock add column if not exists magasin_source text;
alter table public.mouvements_stock add column if not exists magasin_destination text;
alter table public.bons add column if not exists magasin_source text;
alter table public.bons add column if not exists magasin_destination text;


-- ############################################################################
-- #  A — DIAGNOSTIC (ne modifie rien) : noms de magasins trouvés
-- ############################################################################
do $$
declare
  r record;
begin
  raise notice '── Magasins écrits dans mouvements_stock et bons (nom tel qu''écrit → nombre de lignes) ──';
  for r in
    select v, count(*) as n from (
      select coalesce(magasin_id, '') as v from public.mouvements_stock
      union all select coalesce(magasin_source, data->>'magasin_source', '') from public.mouvements_stock
      union all select coalesce(magasin_destination, data->>'magasin_destination', '') from public.mouvements_stock
      union all select coalesce(magasin_source, data->>'magasin_source', '') from public.bons
      union all select coalesce(magasin_destination, data->>'magasin_destination', '') from public.bons
    ) s
    where v <> ''
    group by v order by v
  loop
    raise notice '  % → %', r.v, r.n;
  end loop;
end $$;


-- ############################################################################
-- #  B — norm_id : insensible aux accents et aux anciens noms de magasin
-- ############################################################################
-- « BOUAKÉ », « bouake », « Leclaire Bouaké » → bouake
-- « YOPOUGON GANDI », « yopougon-gandi »      → yopougongandi
-- « COCODY » (ancien nom de BOUAKÉ)            → bouake
-- « MARCORY » (ancien nom de YOPOUGON GANDI)   → yopougongandi
-- Même règle que l'application (src/app/constants/magasins.ts, LEGACY_MAGASIN_IDS).
create or replace function public.norm_id(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case n
           when 'cocody'  then 'bouake'
           when 'marcory' then 'yopougongandi'
           else n
         end
  from (
    select regexp_replace(
             regexp_replace(
               translate(lower(coalesce(v, '')),
                         'àáâãäåāăąçćčďèéêëēėęěìíîïīįñńňòóôõöøōùúûüūůýÿžźż',
                         'aaaaaaaaacccdeeeeeeeeiiiiiinnnooooooouuuuuuyyzzz'),
               '[^a-z0-9]', '', 'g'),
             '^leclaire', '') as n
  ) s;
$$;

grant execute on function public.norm_id(text) to authenticated, anon;


-- ############################################################################
-- #  C — Magasins rangés seulement dans `data` : recopiés dans les colonnes
-- ############################################################################
update public.mouvements_stock
   set magasin_source      = coalesce(magasin_source, data->>'magasin_source'),
       magasin_destination = coalesce(magasin_destination, data->>'magasin_destination')
 where (magasin_source is null and data->>'magasin_source' is not null)
    or (magasin_destination is null and data->>'magasin_destination' is not null);

update public.mouvements_stock
   set magasin_id = coalesce(magasin_source, magasin_destination)
 where magasin_id is null
   and coalesce(magasin_source, magasin_destination) is not null;

update public.bons
   set magasin_source      = coalesce(magasin_source, data->>'magasin_source'),
       magasin_destination = coalesce(magasin_destination, data->>'magasin_destination')
 where (magasin_source is null and data->>'magasin_source' is not null)
    or (magasin_destination is null and data->>'magasin_destination' is not null);


-- ############################################################################
-- #  D — Règles d'accès de mouvements_stock et bons : tous les champs magasin
-- ############################################################################
-- Le mode en place est conservé : si la règle actuelle laisse voir les lignes
-- sans aucun magasin (installation de base), on le garde ; si elle est stricte
-- (ISOLATION_STRICTE.sql), elle reste stricte.
do $$
declare
  tolerant boolean;
  cond text;
begin
  select coalesce(bool_or(qual ilike '%is null%'), true) into tolerant
    from pg_policies
   where schemaname = 'public' and tablename = 'mouvements_stock'
     and policyname = 'mouvements_stock_auth_select';

  cond := '(public.est_admin() '
       || case when tolerant
               then 'or (coalesce(magasin_id, magasin_source, magasin_destination, data->>''magasin_source'', data->>''magasin_destination'') is null) '
               else '' end
       || 'or public.norm_id(magasin_id) = any(public.mes_magasins_norm()) '
       || 'or public.norm_id(magasin_source) = any(public.mes_magasins_norm()) '
       || 'or public.norm_id(magasin_destination) = any(public.mes_magasins_norm()) '
       || 'or public.norm_id(data->>''magasin_source'') = any(public.mes_magasins_norm()) '
       || 'or public.norm_id(data->>''magasin_destination'') = any(public.mes_magasins_norm()))';

  execute 'drop policy if exists mouvements_stock_auth_select on public.mouvements_stock';
  execute 'drop policy if exists mouvements_stock_auth_insert on public.mouvements_stock';
  execute 'drop policy if exists mouvements_stock_auth_update on public.mouvements_stock';
  execute 'drop policy if exists mouvements_stock_auth_delete on public.mouvements_stock';
  execute format('create policy mouvements_stock_auth_select on public.mouvements_stock for select to authenticated using (%s)', cond);
  execute format('create policy mouvements_stock_auth_insert on public.mouvements_stock for insert to authenticated with check (%s)', cond);
  execute format('create policy mouvements_stock_auth_update on public.mouvements_stock for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy mouvements_stock_auth_delete on public.mouvements_stock for delete to authenticated using (%s)', cond);
  raise notice 'public.mouvements_stock : règles d''accès sur tous les champs magasin (%)', case when tolerant then 'mode tolérant conservé' else 'mode strict conservé' end;
end $$;

do $$
declare
  tolerant boolean;
  cond text;
begin
  select coalesce(bool_or(qual ilike '%is null%'), true) into tolerant
    from pg_policies
   where schemaname = 'public' and tablename = 'bons' and policyname = 'bons_auth_select';

  cond := '(public.est_admin() '
       || case when tolerant
               then 'or (coalesce(magasin_source, magasin_destination, data->>''magasin_source'', data->>''magasin_destination'') is null) '
               else '' end
       || 'or public.norm_id(magasin_source) = any(public.mes_magasins_norm()) '
       || 'or public.norm_id(magasin_destination) = any(public.mes_magasins_norm()) '
       || 'or public.norm_id(data->>''magasin_source'') = any(public.mes_magasins_norm()) '
       || 'or public.norm_id(data->>''magasin_destination'') = any(public.mes_magasins_norm()))';

  execute 'drop policy if exists bons_auth_select on public.bons';
  execute 'drop policy if exists bons_auth_insert on public.bons';
  execute 'drop policy if exists bons_auth_update on public.bons';
  execute 'drop policy if exists bons_auth_delete on public.bons';
  execute format('create policy bons_auth_select on public.bons for select to authenticated using (%s)', cond);
  execute format('create policy bons_auth_insert on public.bons for insert to authenticated with check (%s)', cond);
  execute format('create policy bons_auth_update on public.bons for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format('create policy bons_auth_delete on public.bons for delete to authenticated using (%s)', cond);
  raise notice 'public.bons : règles d''accès sur tous les champs magasin (%)', case when tolerant then 'mode tolérant conservé' else 'mode strict conservé' end;
end $$;


-- ############################################################################
-- #  E — public.stock_lignes : lignes du calcul de stock du magasin
-- ############################################################################
-- p_table  : 'mouvements_stock' ou 'bons' (bons de distribution, transfert, retour)
-- p_apres  : identifiant de la dernière ligne déjà reçue ('' pour commencer)
-- p_limite : taille de la page (1 000 par défaut, 5 000 au plus)
-- Renvoie (id, ligne) : `ligne` reprend les champs utiles au stock, lus dans les
-- colonnes ou, à défaut, dans `data` (une colonne vide ne masque plus la valeur
-- rangée dans `data`).
-- Vendeuse / gérant : seulement les lignes où l'un de SES magasins est le
-- magasin, l'expéditeur ou le destinataire. Administrateur : toutes.
create or replace function public.stock_lignes(
  p_table  text,
  p_apres  text default '',
  p_limite integer default 1000
)
returns table (id text, ligne jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  n integer := least(greatest(coalesce(p_limite, 1000), 1), 5000);
  depuis text := coalesce(p_apres, '');
  v_admin boolean;
  v_mags text[];
begin
  if auth.uid() is null then
    raise exception 'stock_lignes : connexion requise' using errcode = '42501';
  end if;
  v_admin := public.est_admin();
  v_mags := public.mes_magasins_norm();
  if not (v_admin or coalesce(array_length(v_mags, 1), 0) > 0) then
    raise exception 'stock_lignes : compte rattaché à aucun magasin' using errcode = '42501';
  end if;

  if p_table = 'mouvements_stock' then
    return query
      with page as (
        select m.id::text as id,
               coalesce(case when jsonb_typeof(m.data) = 'object' then m.data end, '{}'::jsonb)
                 || jsonb_strip_nulls(to_jsonb(m) - 'data') as r
          from public.mouvements_stock m
         where m.id::text collate "C" > depuis collate "C"
           and (v_admin
                or public.norm_id(m.magasin_id) = any(v_mags)
                or public.norm_id(m.magasin_source) = any(v_mags)
                or public.norm_id(m.magasin_destination) = any(v_mags)
                or public.norm_id(m.data->>'magasin_source') = any(v_mags)
                or public.norm_id(m.data->>'magasin_destination') = any(v_mags))
         order by m.id::text collate "C"
         limit n
      )
      select page.id,
             jsonb_strip_nulls(jsonb_build_object(
               'type', r->'type',
               'article_id', r->'article_id',
               'designation', r->'designation',
               'produit_type', r->'produit_type',
               'quantite', r->'quantite',
               'stock_physique', r->'stock_physique',
               'physique', r->'physique',
               'magasin_id', r->'magasin_id',
               'magasin_source', r->'magasin_source',
               'magasin_destination', r->'magasin_destination',
               'bon_id', r->'bon_id',
               'bon_uid', r->'bon_uid',
               'reference', r->'reference',
               'date_mouvement', r->'date_mouvement',
               'created_at', r->'created_at',
               'prix_vente', r->'prix_vente',
               'annule', r->'annule'
             ))
        from page
       order by page.id collate "C";

  elsif p_table = 'bons' then
    return query
      with page as (
        select b.id::text as id,
               coalesce(case when jsonb_typeof(b.data) = 'object' then b.data end, '{}'::jsonb)
                 || jsonb_strip_nulls(to_jsonb(b) - 'data') as r
          from public.bons b
         where b.id::text collate "C" > depuis collate "C"
           and lower(coalesce(to_jsonb(b)->>'type', b.data->>'type', '')) in ('distribution', 'transfert', 'retour')
           and (v_admin
                or public.norm_id(b.magasin_source) = any(v_mags)
                or public.norm_id(b.magasin_destination) = any(v_mags)
                or public.norm_id(b.data->>'magasin_source') = any(v_mags)
                or public.norm_id(b.data->>'magasin_destination') = any(v_mags))
         order by b.id::text collate "C"
         limit n
      )
      select page.id,
             jsonb_strip_nulls(jsonb_build_object(
               'type', r->'type',
               'statut', r->'statut',
               'numero', r->'numero',
               'date', r->'date',
               'created_at', r->'created_at',
               'dateValidation', r->'dateValidation',
               'data', case when jsonb_typeof(r->'data') = 'object'
                            then jsonb_strip_nulls(jsonb_build_object('dateValidation', r->'data'->'dateValidation'))
                       end,
               'magasin_source', r->'magasin_source',
               'magasin_destination', r->'magasin_destination',
               'items', (
                 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                          'id', it->'id',
                          'article_id', it->'article_id',
                          'produitId', it->'produitId',
                          'designation', it->'designation',
                          'quantite', it->'quantite',
                          'type', it->'type',
                          'prixUnit', it->'prixUnit',
                          'prixVente', it->'prixVente'
                        ))), '[]'::jsonb)
                   from jsonb_array_elements(case when jsonb_typeof(r->'items') = 'array' then r->'items' else '[]'::jsonb end) it
               )
             ))
        from page
       order by page.id collate "C";

  else
    raise exception 'stock_lignes : table inconnue %', p_table using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.stock_lignes(text, text, integer) from public;
revoke all on function public.stock_lignes(text, text, integer) from anon;
grant execute on function public.stock_lignes(text, text, integer) to authenticated;

notify pgrst, 'reload schema';


-- ############################################################################
-- #  VÉRIFICATIONS (lecture seule)
-- ############################################################################
-- 1) Les noms d'un même magasin donnent la même clé :
select v as ecrit, public.norm_id(v) as cle
  from unnest(array['bouake', 'BOUAKÉ', 'Leclaire Bouaké', 'COCODY',
                    'yopougon-gandi', 'YOPOUGON GANDI', 'MARCORY', 'LECLAIRE ABOBO']) as v;

-- 2) La fonction de stock existe :
select proname, prosecdef as securite_definie
  from pg_proc
 where proname = 'stock_lignes' and pronamespace = 'public'::regnamespace;
