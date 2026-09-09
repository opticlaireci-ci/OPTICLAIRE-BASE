import { logger } from './logger';
import { supabase } from './supabaseClient';
import { isPermissionError, isAuthError, isNoSessionError, isTransientNetworkError } from './networkErrors';

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
// ── File d'attente locale des écritures échouées ─────────────────────────────
// Une panne réseau peut survenir après les retries, alors que l'utilisateur a
// déjà quitté l'écran. On garde alors l'écriture exacte sur ce navigateur et
// la rejouons automatiquement dès que la base redevient joignable.
const PENDING_WRITES_KEY = 'leclaire_pending_cloud_writes_v2';
let pendingFlushRunning = false;

function readPendingWrites(): any[] {
  try {
    const raw = localStorage.getItem(PENDING_WRITES_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function writePendingWrites(rows: any[]) {
  try { localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(rows.slice(-100))); } catch {}
}
function isRetryableWriteError(err: any): boolean {
  if (isAuthError(err) || isNoSessionError(err) || isPermissionError(err)) return false;
  const status = Number(err?.status ?? err?.code ?? 0);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  return true;
}
function enqueuePendingWrite(entity: string, id: string, value: Record<string, any>, merge: boolean) {
  const rows = readPendingWrites();
  const key = `${entity}|${id}`;
  const existing = rows.findIndex(r => `${r.entity}|${r.id}` === key);
  const item = { entity, id, value, merge, queuedAt: new Date().toISOString() };
  if (existing >= 0) rows[existing] = item;
  else rows.push(item);
  writePendingWrites(rows);
}

async function flushPendingWrites() {
  if (pendingFlushRunning) return;
  pendingFlushRunning = true;
  try {
    const rows = readPendingWrites();
    if (!rows.length) return;
    const remaining: any[] = [];
    for (const item of rows) {
      try {
        await kvSetDocInternal(item.entity, item.id, item.value, !!item.merge, false);
      } catch (err) {
        // On conserve uniquement ce qui est encore potentiellement récupérable.
        // Une erreur de droits/session ne doit pas supprimer silencieusement la
        // donnée : elle reste en file et sera retentée après reconnexion/correction.
        remaining.push(item);
        if (!isRetryableWriteError(err)) break;
      }
    }
    writePendingWrites(remaining);
  } finally {
    pendingFlushRunning = false;
  }
}

// Déclenche la récupération sans dépendre d'un écran particulier.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushPendingWrites(); });
  setTimeout(() => { void flushPendingWrites(); }, 2500);
  setInterval(() => { void flushPendingWrites(); }, 15000);
}

/**
 * Écriture DURCIE : une réponse réseau perdue après un upsert réussi ne doit
 * jamais être interprétée comme une perte de donnée. Le même document est
 * rejoué avec le même id (opération idempotente), puis relu pour confirmer que
 * la ligne existe réellement dans la base.
 *
 * Toutes les écritures métier passent par cette fonction : ventes, clients,
 * règlements, bons, inventaires, etc. Un problème transitoire est donc traité
 * au niveau central au lieu de dépendre de chaque écran.
 */
async function kvSetDocInternal(
  entity: string,
  id: string,
  value: Record<string, any>,
  merge = false,
  queueOnFailure = true,
): Promise<void> {
  const target = resolveTarget(entity);
  let payload = value;
  if (merge) {
    const existing = await kvGetDoc<Record<string, any>>(entity, id);
    if (existing) payload = { ...existing, ...value };
  }
  const base = { ...toRow(target, id, payload), updated_at: new Date().toISOString() };

  const retryable = isRetryableWriteError;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // `app_data` stocke l'objet entier dans une colonne jsonb.
  if (isAppData(target)) {
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const { error } = await supabase.from(target.table).upsert(base as any);
      if (!error) return;
      lastErr = error;
      if (!retryable(error) || attempt === 6) break;
      await sleep(Math.min(700 * Math.pow(1.8, attempt - 1), 7000) + Math.random() * 300);
    }
    const finalErr = new Error(`kvSetDoc ${entity}/${id}: ${lastErr?.message || lastErr}`);
    if (queueOnFailure && isRetryableWriteError(lastErr)) enqueuePendingWrite(entity, id, value, merge);
    throw finalErr;
  }

  // Une itération par colonne inconnue restante à découvrir.
  const maxSchemaEssais = Object.keys(base).length + 1;
  let row: Record<string, any> = base as Record<string, any>;
  for (let schemaEssai = 0; schemaEssai < maxSchemaEssais; schemaEssai++) {
    row = relocateUnknownColumns(target.table, base) as Record<string, any>;

    let lastErr: any = null;
    let success = false;
    // Une écriture peut réussir côté serveur puis perdre sa réponse réseau.
    // Rejouer exactement le même upsert est sans danger grâce à `id`.
    for (let attempt = 1; attempt <= 6; attempt++) {
      const { error } = await supabase.from(target.table).upsert(row as any);
      if (!error) {
        success = true;
        break;
      }
      lastErr = error;
      const missing = missingColumnFromError(error.message || '');
      if (missing) {
        if (missing === 'data') {
          tablesSansData.add(target.table);
          console.warn(`⚠️ public.${target.table} n'a pas de colonne "data" : les champs sans colonne dédiée seront ignorés.`);
          break;
        }
        let set = unknownColumns.get(target.table);
        if (!set) unknownColumns.set(target.table, (set = new Set()));
        set.add(missing);
        row = relocateUnknownColumns(target.table, base);
        // Recommence immédiatement avec le schéma adapté.
        lastErr = null;
        break;
      }
      if (!retryable(error) || attempt === 6) break;
      await sleep(Math.min(700 * Math.pow(1.8, attempt - 1), 7000) + Math.random() * 300);
    }
    if (success) return;
    if (lastErr) {
      const finalErr = new Error(`kvSetDoc ${entity}/${id}: ${lastErr.message || lastErr}`);
      if (queueOnFailure && isRetryableWriteError(lastErr)) enqueuePendingWrite(entity, id, value, merge);
      throw finalErr;
    }
    // `data` absent : la ligne a encore ses colonnes connues, on peut tenter
    // une dernière fois sans le champ fourre-tout.
    if (tablesSansData.has(target.table)) {
      const clean = { ...row };
      delete (clean as any).data;
      const { error } = await supabase.from(target.table).upsert(clean as any);
      if (!error) return;
      throw new Error(`kvSetDoc ${entity}/${id}: ${error.message}`);
    }
  }
  throw new Error(`kvSetDoc ${entity}/${id}: schéma de public.${target.table} incompatible après adaptation.`);
}
/** Point d'entrée public de toutes les écritures métier. */
export async function kvSetDoc(
  entity: string,
  id: string,
  value: Record<string, any>,
  merge = false,
): Promise<void> {
  return kvSetDocInternal(entity, id, value, merge, true);
}

/** Crée un document avec id auto-généré côté client. Renvoie l'id créé. */
export async function kvCreateDoc(entity: string, value: Record<string, any>): Promise<string> {
  // L'id est choisi AVANT l'appel réseau. Si la réponse est perdue, le même id
  // sera réutilisé par le retry de kvSetDoc : aucune création en double.
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
