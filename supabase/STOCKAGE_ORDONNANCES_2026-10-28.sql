-- ============================================================================
--  OPTICLAIRE — ORDONNANCES DES COMMANDES DE VERRE DANS LE STOCKAGE SUPABASE
--  (2026-10-28)
--  Dashboard du projet OPTICLAIRE → SQL Editor → New query → coller TOUT ce
--  fichier → RUN. ENTIÈREMENT IDEMPOTENT : peut être relancé sans risque.
--
--  Les photos et PDF d'ordonnance (Atelier → Commande de verre) sont rangés
--  dans le STOCKAGE de fichiers Supabase (espace « ordonnances », privé) et non
--  plus dans la base de données : la base reste légère et rapide.
--
--  Règles d'accès (mêmes que les commandes de verre) :
--   - un magasin dépose et consulte les ordonnances de SES commandes ;
--   - l'administration (et tout compte rattaché au magasin) les consulte ;
--   - seule l'administration peut supprimer un fichier ;
--   - jamais d'accès sans connexion (espace privé, aucun lien public).
--  Chemin d'un fichier : <MAGASIN>/<identifiant de la commande>/ordonnance.jpg
--
--  Sans ce script, l'application garde les ordonnances dans la base de
--  données, comme avant (aucune commande n'est bloquée).
-- ============================================================================

-- 0) Bonne base ? (le script s'arrête avec un message clair sinon)
do $$
begin
  if to_regclass('public.bons') is null
     or to_regprocedure('public.est_admin()') is null
     or to_regprocedure('public.mes_magasins_norm()') is null
     or to_regprocedure('public.norm_id(text)') is null then
    raise exception using message =
      'Cette base n''est pas celle d''OPTICLAIRE (table bons ou fonctions de sécurité absentes). '
      || 'Ouvrez le projet Supabase de l''application OPTICLAIRE puis relancez ce script.';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception using message = 'Le stockage Supabase (schéma storage) est absent de ce projet.';
  end if;
end $$;

-- 1) Espace « ordonnances » : privé, 5 Mo par fichier, images et PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ordonnances', 'ordonnances', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Règles d'accès : le premier dossier du chemin est le magasin.
drop policy if exists ordonnances_lecture on storage.objects;
create policy ordonnances_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'ordonnances'
         and (public.est_admin()
              or public.norm_id((storage.foldername(name))[1]) = any(public.mes_magasins_norm())));

drop policy if exists ordonnances_depot on storage.objects;
create policy ordonnances_depot on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ordonnances'
              and (public.est_admin()
                   or public.norm_id((storage.foldername(name))[1]) = any(public.mes_magasins_norm())));

drop policy if exists ordonnances_remplacement on storage.objects;
create policy ordonnances_remplacement on storage.objects
  for update to authenticated
  using (bucket_id = 'ordonnances'
         and (public.est_admin()
              or public.norm_id((storage.foldername(name))[1]) = any(public.mes_magasins_norm())))
  with check (bucket_id = 'ordonnances'
              and (public.est_admin()
                   or public.norm_id((storage.foldername(name))[1]) = any(public.mes_magasins_norm())));

drop policy if exists ordonnances_suppression on storage.objects;
create policy ordonnances_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'ordonnances' and public.est_admin());

-- 3) Vérification (seul ce résultat s'affiche dans Supabase)
select 'Espace de stockage' as element,
       coalesce((select case when public then 'ordonnances (PUBLIC !)' else 'ordonnances (privé)' end
                   from storage.buckets where id = 'ordonnances'), 'ABSENT') as etat
union all
select 'Règles d''accès', count(*)::text || ' / 4'
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'ordonnances_%'
union all
select 'Ordonnances déjà dans le stockage', count(*)::text
  from storage.objects where bucket_id = 'ordonnances'
union all
select 'Ordonnances encore dans la base (anciennes commandes)', count(*)::text
  from public.bons where type = 'ordonnance_verre';
