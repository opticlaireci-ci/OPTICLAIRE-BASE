-- ============================================================================
--  OPTICLAIRE — LA LISTE DES MAGASINS NE PERD PLUS JAMAIS UN MAGASIN (2026-10-27)
--  Dashboard → SQL Editor → New query → coller TOUT ce fichier → RUN
--  ENTIÈREMENT IDEMPOTENT : peut être exécuté plusieurs fois sans risque.
--
--  Symptôme corrigé : « j'enregistre 12 magasins, souvent cela affiche 12 puis
--  9 ». La liste des magasins est rangée dans public.app_data (clé
--  'leclaire_magasins'). Chaque appareil y écrivait SA copie, en remplaçant
--  celle du serveur : un appareil revenu aux 9 magasins de départ (cache vidé à
--  la déconnexion) effaçait les magasins ajoutés.
--
--  Ce script :
--   A. affiche la liste actuelle et les magasins présents dans les données
--      (ventes, stock, comptes des utilisateurs) mais absents de la liste ;
--   B. installe une protection : toute écriture de la liste est FUSIONNÉE avec
--      la liste déjà enregistrée — un magasin absent de la nouvelle copie est
--      conservé ; pour un même magasin, la modification la plus récente
--      (champ modifieLe) l'emporte ; un magasin n'est retiré que par une
--      suppression explicite (supprime = true, depuis « Gestion des magasins ») ;
--   C. interdit la suppression de la ligne 'leclaire_magasins'.
--
--  La nouvelle version de l'application fusionne déjà elle-même ; cette
--  protection couvre aussi les appareils encore ouverts sur l'ancienne version.
-- ============================================================================


-- ############################################################################
-- #  A — DIAGNOSTIC (ne modifie rien)
-- ############################################################################
-- 1) Liste actuellement enregistrée sur le serveur.
select coalesce(e->>'id', '?') as identifiant,
       coalesce(e->>'label', '') as nom,
       case when (e->>'supprime')::boolean then 'supprimé' else 'actif' end as etat
  from public.app_data a,
       jsonb_array_elements(case when jsonb_typeof(a.value->'value') = 'array' then a.value->'value' else '[]'::jsonb end) e
 where a.key = 'leclaire_magasins'
 order by 1;

-- 2) Magasins utilisés dans les données mais absents de la liste (à recréer
--    dans « Gestion des magasins » s'ils ont disparu ; même identifiant).
with liste as (
  select lower(e->>'id') as id
    from public.app_data a,
         jsonb_array_elements(case when jsonb_typeof(a.value->'value') = 'array' then a.value->'value' else '[]'::jsonb end) e
   where a.key = 'leclaire_magasins'
),
utilises as (
  select lower(magasin_id) as id, 'ventes' as source from public.ventes where magasin_id is not null
  union all
  select lower(coalesce(magasin_destination, magasin_source)), 'bons' from public.bons
   where coalesce(magasin_destination, magasin_source) is not null
  union all
  select lower(m->>'magasin_id'), 'comptes utilisateurs'
    from public.kv_store_10865fd7 k,
         jsonb_array_elements(case when jsonb_typeof(k.value->'magasins') = 'array' then k.value->'magasins' else '[]'::jsonb end) m
   where k.key like 'user_meta:%' and m->>'magasin_id' is not null
)
select u.id as identifiant_absent_de_la_liste, string_agg(distinct u.source, ', ') as trouve_dans, count(*) as lignes
  from utilises u
 where u.id <> '' and u.id not in (select id from liste where id is not null)
   -- anciens noms de BOUAKÉ et de YOPOUGON GANDI (déjà repris par l'application)
   and u.id not in ('cocody', 'marcory')
 group by u.id
 order by u.id;


-- ############################################################################
-- #  B — FUSION SANS PERTE À CHAQUE ÉCRITURE
-- ############################################################################
create or replace function public.fusionner_liste_magasins(ancienne jsonb, nouvelle jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  ordre text[] := '{}';
  carte jsonb := '{}'::jsonb;
  liste jsonb;
  e jsonb;
  k text;
  actuel jsonb;
  premiere boolean := true;
begin
  foreach liste in array array[ancienne, nouvelle] loop
    for e in
      select x from jsonb_array_elements(case when jsonb_typeof(liste) = 'array' then liste else '[]'::jsonb end) x
    loop
      if jsonb_typeof(e) <> 'object' then continue; end if;
      k := lower(btrim(coalesce(e->>'id', '')));
      if k = '' then continue; end if;
      actuel := carte->k;
      if actuel is null then
        ordre := ordre || k;
        carte := carte || jsonb_build_object(k, e);
      elsif premiere
         or coalesce(e->>'modifieLe', '') collate "C" >= coalesce(actuel->>'modifieLe', '') collate "C" then
        -- même magasin : la modification la plus récente l'emporte
        carte := jsonb_set(carte, array[k], actuel || e);
      end if;
    end loop;
    premiere := false;
  end loop;
  return coalesce(
    (select jsonb_agg(carte->o order by i) from unnest(ordre) with ordinality as t(o, i)),
    '[]'::jsonb);
end;
$$;

create or replace function public.proteger_liste_magasins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ancienne jsonb;
begin
  if tg_op = 'DELETE' then
    -- La liste des magasins n'est jamais supprimée.
    return null;
  end if;
  if tg_op = 'UPDATE' then
    ancienne := old.value->'value';
  else
    select a.value->'value' into ancienne from public.app_data a where a.key = new.key;
  end if;
  if ancienne is null or jsonb_typeof(ancienne) <> 'array' then
    return new;
  end if;
  new.value := jsonb_set(coalesce(new.value, '{}'::jsonb), '{value}',
                         public.fusionner_liste_magasins(ancienne, new.value->'value'));
  return new;
end;
$$;

drop trigger if exists app_data_liste_magasins on public.app_data;
create trigger app_data_liste_magasins
  before insert or update on public.app_data
  for each row when (new.key = 'leclaire_magasins')
  execute function public.proteger_liste_magasins();

-- ############################################################################
-- #  C — SUPPRESSION DE LA LIGNE INTERDITE
-- ############################################################################
drop trigger if exists app_data_liste_magasins_suppression on public.app_data;
create trigger app_data_liste_magasins_suppression
  before delete on public.app_data
  for each row when (old.key = 'leclaire_magasins')
  execute function public.proteger_liste_magasins();

notify pgrst, 'reload schema';


-- ############################################################################
-- #  VÉRIFICATION (lecture seule)
-- ############################################################################
-- Une liste de 9 envoyée par un ancien appareil ne retire rien d'une liste de 12 :
select jsonb_array_length(public.fusionner_liste_magasins(
         '[{"id":"abobo"},{"id":"faya"},{"id":"nouveau1"},{"id":"nouveau2"}]'::jsonb,
         '[{"id":"abobo"},{"id":"faya"}]'::jsonb)) as magasins_conserves_attendu_4;

select tgname as protection_installee
  from pg_trigger
 where tgrelid = 'public.app_data'::regclass and tgname like 'app_data_liste_magasins%'
 order by 1;
