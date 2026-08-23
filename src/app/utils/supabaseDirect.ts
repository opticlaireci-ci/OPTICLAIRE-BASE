import { logger } from './logger';
import { supabase } from './supabaseClient';
import { isPermissionError } from './networkErrors';

/**
 * NOYAU "ACCÈS DIRECT" — remplace supabaseKv.ts.
 *
 * Même API publique (kvGetCollection, kvGetCollectionDelta, kvGetDoc,
 * kvSetDoc, kvCreateDoc, kvDeleteDoc, supabaseHealthCheck) : rien à changer
 * dans firestoreCompat.ts à part l'import. Mais chaque appel va DIRECTEMENT
 * sur une vraie table Postgres via PostgREST (supabase-js), sécurisée par
 * RLS (voir SUPABASE_SCHEMA_DIRECT.sql) — plus besoin de l'Edge Function
 * pour le CRUD métier. La session utilisateur (JWT) est envoyée
 * automatiquement par le client supabase-js sur chaque requête ; RLS s'en
 * sert via auth.uid().
 *
 * Entités mappées 1:1 sur une table dédiée (la forme des objets JS envoyés
 * par les services — snake_case — correspond EXACTEMENT aux colonnes).
 */
const DIRECT_TABLES = new Set([
  'clients', 'articles', 'montures', 'acteurs', 'verres_types',
  'ventes', 'reglements', 'factures_assurance', 'reglements_assurance',
  'releves_assurance', 'inventaires', 'mouvements_stock', 'bons',
  'rdv_enligne', 'emplois_du_temps', 'catalogues', 'audit_log',
  // Table créée par INSTALLATION_NOUVEAU_PROJET.sql (partie 0), avec les
  // 21 colonnes attendues par atelierService.ts.
  'bons_commande_verres',
]);

export interface Target {
  table: string;
  /** Sous-type utilisé pour les tables "fourre-tout" (referentiels, app_data). */
  refType?: string;
}

/**
 * Résout l'entité vers sa table Postgres réelle. Exporté pour `supabaseLive.ts`,
 * qui doit savoir sur QUELLE table ouvrir le canal `postgres_changes`.
 */
export function resolveTarget(entity: string): Target {
  if (entity === 'db_professions') return { table: 'professions' };
  if (DIRECT_TABLES.has(entity)) return { table: entity };
  // Entité `app_data` "brute" (clés localStorage leclaire_* via supabaseRealtime) :
  // la clé Postgres est l'id tel quel, SANS préfixe (pas de `app_data:` redondant).
  if (entity === 'app_data') return { table: 'app_data' };
  if (entity.startsWith('db_')) return { table: 'referentiels', refType: entity.slice(3) };
  if (entity.startsWith('global_')) return { table: 'referentiels', refType: entity };
  // Filet de sécurité : petites listes/réglages non (encore) migrés.
  return { table: 'app_data', refType: entity };
}

function isRefTable(target: Target) {
  return target.table === 'referentiels';
}
function isAppData(target: Target) {
  return target.table === 'app_data';
}

/** Clé Postgres de la table `app_data` (préfixée seulement si sous-type). */
function appDataKey(target: Target, id: string) {
  return target.refType ? `${target.refType}:${id}` : id;
}

/** Construit la ligne Postgres à partir de l'objet JS envoyé par un service. */
function toRow(target: Target, id: string, value: Record<string, any>) {
  if (isRefTable(target)) return { ...value, id, type: target.refType };
  if (isAppData(target)) return { key: appDataKey(target, id), value: { id, ...value } };
  return { ...value, id };
}

/** Reconstruit l'objet JS attendu par le service à partir d'une ligne Postgres. */
function fromRow(target: Target, row: any): any {
  if (!row) return null;
  if (isAppData(target)) return row.value ?? null;
  // La colonne `data` est le fourre-tout où `kvSetDoc` a rangé les champs qui
  // n'ont pas de colonne dédiée (voir relocateUnknownColumns). On la remet à plat
  // pour que le service retrouve son objet tel qu'il l'avait écrit. Les vraies
  // colonnes ont la priorité : elles sont la source de vérité.
  if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
    const { data, ...columns } = row;
    return { ...data, ...columns };
  }
  return row;
}

// ── Auto-adaptation au schéma réel de la base ────────────────────────────────
// Les services écrivent des objets issus de l'UI (saveVente fait un spread de la
// vente complète) : un champ ajouté dans un formulaire arrive en base sans que la
// colonne existe, et PostgREST rejette TOUTE la ligne (code PGRST204).
// Plutôt que de perdre l'enregistrement, on déplace le champ fautif dans la
// colonne jsonb `data` et on réessaie. Le champ reste donc persisté et relisible
// (cf. fromRow). On mémorise par table pour ne payer l'aller-retour qu'une fois.
const unknownColumns = new Map<string, Set<string>>();
/** Tables dépourvues de colonne `data` : le champ inconnu doit alors être abandonné. */
const tablesSansData = new Set<string>();

function missingColumnFromError(message: string): string | null {
  // Message PostgREST : "Could not find the 'date_edition' column of 'clients' …"
  const m = /Could not find the '([^']+)' column/.exec(message);
  return m ? m[1] : null;
}

/** Déplace vers `data` les colonnes déjà connues comme absentes de cette table. */
function relocateUnknownColumns(table: string, row: Record<string, any>): Record<string, any> {
  const inconnues = unknownColumns.get(table);
  if (!inconnues || inconnues.size === 0) return row;

  const sortie: Record<string, any> = {};
  const data: Record<string, any> = { ...(row.data ?? {}) };
  for (const [k, v] of Object.entries(row)) {
    if (k === 'data') continue;
    if (inconnues.has(k)) data[k] = v;
    else sortie[k] = v;
  }
  if (!tablesSansData.has(table)) sortie.data = data;
  return sortie;
}

function whereScope<Q extends { eq: Function; like: Function; not: Function }>(q: Q, target: Target): Q {
  if (isRefTable(target)) return q.eq('type', target.refType);
  // `app_data` brut : on exclut les clés préfixées `sousType:id` (entités non
  // migrées) pour ne renvoyer que les vraies clés leclaire_* de supabaseRealtime.
  if (isAppData(target)) {
    return target.refType ? q.like('key', `${target.refType}:%`) : q.not('key', 'like', '%:%');
  }
  return q;
}

/** Renvoie tous les documents (valeurs) d'une entité/collection. */
export async function kvGetCollection<T = any>(entity: string): Promise<T[]> {
  const target = resolveTarget(entity);
  const query = whereScope(supabase.from(target.table).select('*') as any, target);
  const { data, error } = await query;
  if (error) throw new Error(`kvGetCollection ${entity}: ${error.message}`);
  return ((data || []).map((r: any) => fromRow(target, r)).filter(Boolean)) as T[];
}

/**
 * Variante incrémentale : si `since` est fourni, ne renvoie que les lignes
 * dont `updated_at` a changé depuis cet instant. `serverTime` (l'horodatage
 * capturé juste avant la requête) est le filigrane à réutiliser au prochain
 * appel.
 */
export async function kvGetCollectionDelta<T = any>(
  entity: string,
  since?: string | null,
): Promise<{ items: T[]; serverTime: string | null }> {
  const target = resolveTarget(entity);
  const requestStart = new Date().toISOString();
  let query = whereScope(supabase.from(target.table).select('*') as any, target);
  if (since) query = query.gte('updated_at', since);
  const { data, error } = await query;
  if (error) throw new Error(`kvGetCollectionDelta ${entity}: ${error.message}`);
  const items = ((data || []).map((r: any) => fromRow(target, r)).filter(Boolean)) as T[];
  return { items, serverTime: requestStart };
}

/** Renvoie un document par id, ou null s'il n'existe pas. */
export async function kvGetDoc<T = any>(entity: string, id: string): Promise<T | null> {
  const target = resolveTarget(entity);
  const key = isAppData(target) ? `${target.refType}:${id}` : id;
  const col = isAppData(target) ? 'key' : 'id';
  let query = supabase.from(target.table).select('*').eq(col, key);
  if (isRefTable(target)) query = query.eq('type', target.refType);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`kvGetDoc ${entity}/${id}: ${error.message}`);
  return data ? (fromRow(target, data) as T) : null;
}

/**
 * Écrit (upsert) un document avec un id explicite.
 * `merge` fusionne avec l'existant (équivalent setDoc({merge:true})).
 */
export async function kvSetDoc(
  entity: string,
  id: string,
  value: Record<string, any>,
  merge = false,
): Promise<void> {
  const target = resolveTarget(entity);
  let payload = value;
  if (merge) {
    const existing = await kvGetDoc<Record<string, any>>(entity, id);
    if (existing) payload = { ...existing, ...value };
  }
  const base = { ...toRow(target, id, payload), updated_at: new Date().toISOString() };

  // `app_data` stocke l'objet entier dans une colonne jsonb : jamais de PGRST204.
  if (isAppData(target)) {
    // `toRow` renvoie une union de 3 formes (table dédiée / referentiels / app_data)
    // que supabase-js ne peut pas rapprocher d'un schéma générique : cast explicite.
    const { error } = await supabase.from(target.table).upsert(base as any);
    if (error) throw new Error(`kvSetDoc ${entity}/${id}: ${error.message}`);
    return;
  }

  // Une itération par colonne inconnue restant à découvrir. La borne évite toute
  // boucle infinie si PostgREST renvoyait un message inattendu.
  const maxEssais = Object.keys(base).length + 1;
  for (let essai = 0; essai < maxEssais; essai++) {
    const row = relocateUnknownColumns(target.table, base);
    const { error } = await supabase.from(target.table).upsert(row as any);
    if (!error) return;

    const colonne = missingColumnFromError(error.message);
    if (!colonne) throw new Error(`kvSetDoc ${entity}/${id}: ${error.message}`);

    if (colonne === 'data') {
      // La table n'a pas le fourre-tout : les champs inconnus seront abandonnés.
      tablesSansData.add(target.table);
      console.warn(
        `⚠️ public.${target.table} n'a pas de colonne "data" : les champs sans ` +
          `colonne dédiée ne seront PAS enregistrés. Exécutez ` +
          `supabase/SUPABASE_FIX_ACCES_DIRECT.sql pour l'ajouter.`,
      );
      continue;
    }

    let inconnues = unknownColumns.get(target.table);
    if (!inconnues) unknownColumns.set(target.table, (inconnues = new Set()));
    inconnues.add(colonne);
    console.warn(
      `⚠️ public.${target.table} : colonne "${colonne}" absente — champ rangé ` +
        `dans "data". Exécutez supabase/SUPABASE_FIX_ACCES_DIRECT.sql pour créer ` +
        `la colonne et retrouver le filtrage/tri SQL sur ce champ.`,
    );
  }
  throw new Error(
    `kvSetDoc ${entity}/${id}: schéma de public.${target.table} incompatible ` +
      `après ${maxEssais} tentatives d'adaptation.`,
  );
}

/** Crée un document avec id auto-généré côté client. Renvoie l'id créé. */
export async function kvCreateDoc(entity: string, value: Record<string, any>): Promise<string> {
  const id = value.id || crypto.randomUUID();
  await kvSetDoc(entity, id, { ...value, id }, false);
  return id;
}

/** Supprime un document. */
export async function kvDeleteDoc(entity: string, id: string): Promise<void> {
  const target = resolveTarget(entity);
  const key = isAppData(target) ? `${target.refType}:${id}` : id;
  const col = isAppData(target) ? 'key' : 'id';
  let query = supabase.from(target.table).delete().eq(col, key);
  if (isRefTable(target)) query = query.eq('type', target.refType);
  const { error } = await query;
  if (error) throw new Error(`kvDeleteDoc ${entity}/${id}: ${error.message}`);
}

/**
 * Vérifie que Postgres est joignable via PostgREST.
 *
 * La question posée est « la base répond-elle ? », PAS « ai-je le droit de lire
 * telle table ? ». La nuance est capitale : ce test tourne notamment sur l'écran
 * de CONNEXION, donc sans session, où le rôle est `anon`. Sonder `clients` dans
 * ces conditions renvoie forcément un 42501 — les tables métier sont réservées à
 * `authenticated` — et faisait conclure à tort « base de données non disponible ».
 *
 * Deux règles en découlent :
 *   • hors session, on sonde `kv_store_10865fd7`, la seule table lisible en
 *     anonyme (policy « lecture anonyme des reglages app_data ») ;
 *   • un refus de DROITS (42501) est considéré comme un SUCCÈS : pour répondre
 *     cela, Postgres a reçu la requête, l'a analysée et l'a évaluée. Seuls une
 *     panne réseau ou une table absente (PGRST205) signalent une vraie
 *     indisponibilité.
 */
export async function supabaseHealthCheck(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const { error } = session
      ? await supabase.from('clients').select('id', { head: true, count: 'exact' }).limit(1)
      : await supabase.from('kv_store_10865fd7').select('key', { head: true, count: 'exact' }).limit(1);

    if (!error) return true;

    // Droits refusés → la base a bel et bien répondu.
    if (isPermissionError(error)) return true;

    // PGRST205 = table introuvable dans le cache de schéma : là, c'est réel.
    logger.warn('supabaseHealthCheck (direct):', error.message);
    return false;
  } catch (err) {
    logger.warn('supabaseHealthCheck (direct):', err);
    return false;
  }
}
