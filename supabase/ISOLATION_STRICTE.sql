-- ============================================================================
--  OPTICLAIRE — ISOLATION MULTI-TENANT STRICTE
--  À exécuter APRÈS CORRECTIFS_SECURITE.sql, une fois les données assainies.
--  Dashboard → SQL Editor → New query → coller TOUT ce fichier → RUN
--
--  Objectif : supprimer la « tolérance au NULL » de la baseline. Après ce
--  script, une ligne SANS magasin identifiable n'est plus visible que par les
--  admins — l'isolation par magasin devient totale.
--
--  Déroulé recommandé :
--    1) Exécuter la SECTION A (diagnostic) et lire les NOTICES.
--    2) Exécuter la SECTION B (backfill) : elle remplit magasin_id depuis `data`.
--    3) Ré-exécuter la SECTION A : idéalement 0 ligne orpheline restante.
--    4) Exécuter la SECTION C (policies strictes).
--
--  Les fonctions utilitaires (norm_id, est_admin, mes_magasins_norm…) sont
--  supposées déjà créées par CORRECTIFS_SECURITE.sql.
--  ENTIÈREMENT IDEMPOTENT.
-- ============================================================================


-- ############################################################################
-- #  SECTION A — DIAGNOSTIC (ne modifie rien)
-- ############################################################################
do $$
declare
  t text;
  n bigint;
  tables text[] := array[
    'clients', 'ventes', 'reglements', 'factures_assurance',
    'reglements_assurance', 'releves_assurance', 'inventaires',
    'rdv_enligne', 'emplois_du_temps', 'audit_log'
  ];
begin
  raise notice '── Lignes sans magasin_id (magasin unique) ──';
  foreach t in array tables loop
    execute format('select count(*) from public.%I where magasin_id is null', t) into n;
    if n > 0 then raise notice '  public.% : % orpheline(s)', t, n; end if;
  end loop;

  select count(*) into n from public.bons
   where magasin_source is null and magasin_destination is null;
  if n > 0 then raise notice '  public.bons : % orpheline(s) (source+dest NULL)', n; end if;

  select count(*) into n from public.mouvements_stock
   where data->>'magasin_source' is null and data->>'magasin_destination' is null;
  if n > 0 then raise notice '  public.mouvements_stock : % orpheline(s)', n; end if;

  select count(*) into n from public.bons_commande_verres where magasin is null;
  if n > 0 then raise notice '  public.bons_commande_verres : % orpheline(s)', n; end if;

  raise notice '── Fin diagnostic ──';
end $$;


-- ############################################################################
-- #  SECTION B — BACKFILL (remplit magasin_id depuis le fourre-tout `data`)
-- ############################################################################
-- Pour les tables à magasin unique : quand la colonne magasin_id est NULL mais
-- que la valeur existe dans `data` (champ écrit avant la mise en colonne), on la
-- récupère. On NE FABRIQUE jamais de magasin : les lignes réellement dépourvues
-- d'information restent NULL (repérées par la SECTION A, réservées aux admins).
do $$
declare
  t text;
  tables text[] := array[
    'clients', 'ventes', 'reglements', 'factures_assurance',
    'reglements_assurance', 'releves_assurance', 'inventaires',
    'rdv_enligne', 'emplois_du_temps', 'audit_log'
  ];
  maj bigint;
begin
  foreach t in array tables loop
    execute format($q$
      update public.%I
         set magasin_id = coalesce(
               data->>'magasin_id', data->>'magasin', data->>'magasinId'
             )
       where magasin_id is null
         and coalesce(data->>'magasin_id', data->>'magasin', data->>'magasinId') is not null
    $q$, t);
    get diagnostics maj = row_count;
    if maj > 0 then raise notice '  public.% : % magasin_id restauré(s) depuis data', t, maj; end if;
  end loop;
end $$;

-- bons : compléter magasin_source/destination depuis data si colonnes vides.
update public.bons
   set magasin_source = coalesce(magasin_source, data->>'magasin_source'),
       magasin_destination = coalesce(magasin_destination, data->>'magasin_destination')
 where (magasin_source is null and data->>'magasin_source' is not null)
    or (magasin_destination is null and data->>'magasin_destination' is not null);


-- ############################################################################
-- #  SECTION C — POLICIES STRICTES (retrait de la tolérance au NULL)
-- ############################################################################

-- ── Groupe 1 : magasin unique (magasin_id) ─────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'clients', 'ventes', 'reglements', 'factures_assurance',
    'reglements_assurance', 'releves_assurance', 'inventaires',
    'rdv_enligne', 'emplois_du_temps', 'audit_log'
  ];
  cond text := '(public.est_admin() '
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
    raise notice 'public.% : isolation STRICTE appliquée', t;
  end loop;
end $$;

-- ── Groupe 2 : bons (source/destination) ────────────────────────────────────
do $$
declare
  cond text := '(public.est_admin() '
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
  raise notice 'public.bons : isolation STRICTE appliquée';
end $$;

-- ── Groupe 3 : mouvements_stock (source/destination dans data) ──────────────
do $$
declare
  cond text := '(public.est_admin() '
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
  raise notice 'public.mouvements_stock : isolation STRICTE appliquée';
end $$;

-- ── Groupe 4 : bons_commande_verres (colonne magasin) ───────────────────────
do $$
declare
  cond text := '(public.est_admin() '
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
  raise notice 'public.bons_commande_verres : isolation STRICTE appliquée';
end $$;
