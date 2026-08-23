/**
 * COUCHE DE COMPATIBILITÉ « FIRESTORE » — 100% SUPABASE
 *
 * Ce module expose exactement la même API que le sous-ensemble de
 * `firebase/firestore` qu'utilisait l'application (collection, doc, getDoc,
 * getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where,
 * orderBy, limit, writeBatch), mais TOUTES les opérations sont routées vers le
 * Postgres Supabase en direct via PostgREST (`supabaseDirect`). Aucune
 * dépendance Firebase, aucune edge function.
 *
 * Le temps réel (`onSnapshot`) est assuré par un polling HTTP léger : fiable
 * derrière tous les proxies et parfaitement cohérent entre navigateurs.
 */

import {
  kvGetCollection, kvGetCollectionDelta, kvGetDoc, kvSetDoc, kvCreateDoc, kvDeleteDoc,
  resolveTarget,
} from './supabaseDirect';
import { subscribeEntityChanges, onLiveStatusChange, isLive, SLOW_POLL_MS } from './supabaseLive';

/**
 * Forme d'un document. Volontairement permissive (accès dynamique par champ),
 * mais les lectures publiques (`getDoc`, `getDocs`, `onSnapshot`) sont
 * GÉNÉRIQUES : un appelant peut préciser son type métier —
 * `getDocs<Vente>(collection(db, 'ventes'))` — et bénéficier alors d'un vrai
 * typage sur `.data()`. Par défaut, on retombe sur cette forme permissive
 * (rétrocompatible avec tout le code existant).
 */
export type DocumentData = Record<string, any>;

/** Sentinelle « base de données » — ignorée, conservée pour compatibilité d'API. */
export const db: { __supabaseKv: true } = { __supabaseKv: true };

// ── Snapshots typés (surface publique) ────────────────────────────────────────

export interface DocSnap<T = DocumentData> {
  id: string;
  exists: () => boolean;
  data: () => T | undefined;
  ref: DocRef;
}

export interface DocChange<T = DocumentData> {
  type: 'added' | 'modified' | 'removed';
  doc: DocSnap<T>;
}

export interface QuerySnap<T = DocumentData> {
  docs: DocSnap<T>[];
  size: number;
  empty: boolean;
  forEach: (cb: (d: DocSnap<T>) => void) => void;
  docChanges: () => DocChange<T>[];
  /** Interne : empreinte des docs du cycle, pour le diff du polling. */
  __snapshotMap: Map<string, string>;
}

// ── Références ────────────────────────────────────────────────────────────────

interface CollectionRef { __type: 'collection'; entity: string; }
interface DocRef { __type: 'doc'; entity: string; id: string; }
interface Constraint { kind: 'where' | 'orderBy' | 'limit'; [k: string]: any; }
interface QueryRef { __type: 'query'; entity: string; constraints: Constraint[]; }

export function collection(_db: any, entity: string): CollectionRef {
  return { __type: 'collection', entity };
}

let autoIdCounter = 0;
function autoId(): string {
  autoIdCounter += 1;
  return `${Date.now().toString(36)}${autoIdCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function doc(ref: any, a?: string, b?: string): DocRef {
  // doc(db, entity, id) | doc(collectionRef, id) | doc(collectionRef) [id auto]
  if (ref && ref.__type === 'collection') {
    return { __type: 'doc', entity: ref.entity, id: a ?? autoId() };
  }
  return { __type: 'doc', entity: a as string, id: b ?? autoId() };
}

export function query(base: CollectionRef | QueryRef, ...constraints: Constraint[]): QueryRef {
  const prev = (base as QueryRef).constraints || [];
  return { __type: 'query', entity: base.entity, constraints: [...prev, ...constraints] };
}

export function where(field: string, op: string, value: any): Constraint {
  return { kind: 'where', field, op, value };
}
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Constraint {
  return { kind: 'orderBy', field, dir };
}
export function limit(n: number): Constraint {
  return { kind: 'limit', n };
}

// ── Application des contraintes côté client ─────────────────────────────────────

function matchWhere(item: any, c: Constraint): boolean {
  const v = item?.[c.field];
  switch (c.op) {
    case '==': return v === c.value;
    case '!=': return v !== c.value;
    case '<': return v < c.value;
    case '<=': return v <= c.value;
    case '>': return v > c.value;
    case '>=': return v >= c.value;
    case 'in': return Array.isArray(c.value) && c.value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(c.value);
    default: return true;
  }
}

function applyConstraints(items: any[], constraints: Constraint[]): any[] {
  let out = items;
  for (const c of constraints) {
    if (c.kind === 'where') out = out.filter(it => matchWhere(it, c));
  }
  for (const c of constraints) {
    if (c.kind === 'orderBy') {
      out = [...out].sort((a, b) => {
        const av = a?.[c.field]; const bv = b?.[c.field];
        if (av === bv) return 0;
        const res = av > bv ? 1 : -1;
        return c.dir === 'desc' ? -res : res;
      });
    }
  }
  for (const c of constraints) {
    if (c.kind === 'limit') out = out.slice(0, c.n);
  }
  return out;
}

// ── Snapshots ───────────────────────────────────────────────────────────────

function makeDocSnap<T = DocumentData>(entity: string, id: string, data: T | null): DocSnap<T> {
  return {
    id,
    exists: () => data != null,
    data: () => (data == null ? undefined : data),
    ref: { __type: 'doc', entity, id } as DocRef,
  };
}

function makeQuerySnap<T extends { id: string } = DocumentData & { id: string }>(
  entity: string,
  items: T[],
  prev?: Map<string, string>,
): QuerySnap<T> {
  const docs = items.map(it => makeDocSnap<T>(entity, it.id, it));
  const current = new Map<string, string>();
  items.forEach(it => current.set(it.id, JSON.stringify(it)));

  const changes: DocChange<T>[] = [];
  if (prev) {
    items.forEach(it => {
      const before = prev.get(it.id);
      const now = current.get(it.id)!;
      if (before === undefined) changes.push({ type: 'added', doc: makeDocSnap(entity, it.id, it) });
      else if (before !== now) changes.push({ type: 'modified', doc: makeDocSnap(entity, it.id, it) });
    });
    prev.forEach((_v, id) => {
      if (!current.has(id)) changes.push({ type: 'removed', doc: makeDocSnap(entity, id, null) });
    });
  } else {
    items.forEach(it => changes.push({ type: 'added', doc: makeDocSnap(entity, it.id, it) }));
  }

  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb: (d: DocSnap<T>) => void) => docs.forEach(cb),
    docChanges: () => changes,
    __snapshotMap: current,
  };
}

// ── Lectures ──────────────────────────────────────────────────────────────────

export async function getDoc<T = DocumentData>(ref: DocRef): Promise<DocSnap<T>> {
  const data = await kvGetDoc<T>(ref.entity, ref.id);
  return makeDocSnap<T>(ref.entity, ref.id, data);
}

export async function getDocs<T = DocumentData>(
  ref: CollectionRef | QueryRef,
): Promise<QuerySnap<T & { id: string }>> {
  const items = await kvGetCollection<T & { id: string }>(ref.entity);
  const filtered = ref.__type === 'query'
    ? applyConstraints(items, (ref as QueryRef).constraints)
    : items;
  return makeQuerySnap<T & { id: string }>(ref.entity, filtered);
}

// ── Écritures ───────────────────────────────────────────────────────────────

export async function setDoc(ref: DocRef, data: any, options?: { merge?: boolean }) {
  await kvSetDoc(ref.entity, ref.id, data, !!options?.merge);
}

export async function addDoc(ref: CollectionRef, data: any) {
  const id = await kvCreateDoc(ref.entity, data);
  return { __type: 'doc', entity: ref.entity, id } as DocRef;
}

export async function updateDoc(ref: DocRef, data: any) {
  await kvSetDoc(ref.entity, ref.id, data, true);
}

export async function deleteDoc(ref: DocRef) {
  await kvDeleteDoc(ref.entity, ref.id);
}

// ── Temps réel (postgres_changes + polling de secours) ────────────────────────

/**
 * Cadence quand le canal temps réel n'est PAS connecté (WebSocket bloqué, table
 * absente de la publication, pas de session) : le polling porte alors seul la
 * fraîcheur des données.
 */
const POLL_MS = 6000;

interface Subscriber {
  kind: 'doc' | 'query';
  docId?: string;
  constraints?: Constraint[];
  onNext: (snap: any) => void;
  onError?: (err: Error) => void;
  prevMap?: Map<string, string>;
}

interface EntityPoller {
  subscribers: Set<Subscriber>;
  timer: ReturnType<typeof setInterval> | null;
  /** Désabonnement du canal `postgres_changes` de cette entité. */
  unsubLive?: () => void;
  /** Cadence actuellement appliquée au `timer` (pour éviter de le recréer). */
  currentPollMs?: number;
  inFlight?: boolean;
  // ── État du pull incrémental (P6 généralisé) ────────────────────────────────
  itemsById: Map<string, any>;   // cache local complet reconstitué à partir des pulls
  since: string | null;          // filigrane serveur du dernier pull réussi
  cycleCount: number;            // nombre de cycles depuis le dernier pull complet
  hadBaseline: boolean;          // un premier pull complet a-t-il déjà réussi ?
}

/**
 * Pollers mutualisés par entité : tous les abonnements à une même collection
 * partagent UNE seule requête HTTP par cycle (au lieu d'une par abonné), ce qui
 * évite la rafale de requêtes concurrentes vers l'edge function.
 *
 * Depuis P6-généralisé : chaque cycle ne redemande QUE les documents modifiés
 * depuis le dernier filigrane (`?since=`), au lieu de retélécharger toute la
 * collection. Un pull complet est refait périodiquement (FULL_RESYNC_EVERY)
 * pour rattraper les suppressions, qu'un pull delta ne peut pas voir (une ligne
 * supprimée n'a pas de `updated_at` à comparer, elle a juste disparu).
 */
const pollers = new Map<string, EntityPoller>();

// Un pull complet toutes les FULL_RESYNC_EVERY cycles (≈ toutes les 40-50s avec
// POLL_MS=6000 + gigue). Suffisant pour rattraper une suppression faite sur un
// autre navigateur sans perdre l'essentiel du gain de bande passante.
const FULL_RESYNC_EVERY = 6;

async function pollEntity(entity: string) {
  const poller = pollers.get(entity);
  if (!poller || poller.subscribers.size === 0) return;
  // Garde anti-empilement : si un cycle précédent est encore en vol (edge
  // function lente / cold-start), on saute ce tick au lieu d'empiler des
  // requêtes concurrentes vers la même entité.
  if (poller.inFlight) return;
  poller.inFlight = true;

  const needsFullPull = !poller.hadBaseline || poller.cycleCount >= FULL_RESYNC_EVERY;

  let items: any[];
  try {
    const { items: fetched, serverTime } = await kvGetCollectionDelta(
      entity,
      needsFullPull ? null : poller.since,
    );
    if (needsFullPull) {
      // Garde anti-clignotement : un pull complet qui revient VIDE alors que le
      // cache local contient déjà des documents est presque toujours un hoquet
      // transitoire (cold-start edge function, coupure proxy), pas une vraie
      // mise à zéro. On ignore ce cycle plutôt que d'effacer le cache.
      if (fetched.length === 0 && poller.itemsById.size > 0) {
        poller.cycleCount = 0; // on retentera un pull complet au prochain cycle
        return;
      }
      poller.itemsById = new Map(fetched.map((it: any) => [it.id, it]));
      poller.hadBaseline = true;
      poller.cycleCount = 0;
    } else {
      // Pull delta : on FUSIONNE (upsert) — les suppressions seront rattrapées
      // par le prochain pull complet périodique, pas par ce chemin.
      for (const it of fetched) poller.itemsById.set(it.id, it);
      poller.cycleCount += 1;
    }
    if (serverTime) poller.since = serverTime;
    items = Array.from(poller.itemsById.values());
  } catch (err) {
    poller.subscribers.forEach(s => s.onError?.(err as Error));
    return;
  } finally {
    poller.inFlight = false;
  }
  poller.subscribers.forEach(sub => {
    try {
      if (sub.kind === 'doc') {
        const found = items.find(it => it.id === sub.docId);
        sub.onNext(makeDocSnap(entity, sub.docId!, found ?? null));
      } else {
        const filtered = sub.constraints?.length
          ? applyConstraints(items, sub.constraints)
          : items;
        // Garde anti-clignotement : un cycle de polling qui renvoie VIDE alors que
        // le snapshot précédent contenait des documents est presque toujours un
        // hoquet transitoire (cold-start edge function, coupure proxy, token en
        // cours de refresh), PAS une vraie mise à zéro de la collection. L'émettre
        // marquerait tous les docs comme 'removed' → le cache local serait écrasé
        // par [] (les infos « disparaissent »), puis rechargé au cycle suivant
        // (« reviennent lentement »). On ignore donc ce cycle : on ne touche ni au
        // prevMap ni au cache. Une vraie suppression sera reflétée dès qu'un cycle
        // non vide (ou un rechargement getDocs) confirmera l'état réel.
        if (filtered.length === 0 && sub.prevMap && sub.prevMap.size > 0) {
          return;
        }
        const snap = makeQuerySnap(entity, filtered, sub.prevMap);
        sub.prevMap = snap.__snapshotMap;
        sub.onNext(snap);
      }
    } catch (err) {
      sub.onError?.(err as Error);
    }
  });
}

export function onSnapshot<T = DocumentData>(
  ref: DocRef | CollectionRef | QueryRef,
  onNext: (snap: DocSnap<T> | QuerySnap<T & { id: string }>) => void,
  onError?: (err: Error) => void,
): () => void {
  const entity = ref.entity;
  const sub: Subscriber = (ref as DocRef).__type === 'doc'
    ? { kind: 'doc', docId: (ref as DocRef).id, onNext, onError }
    : { kind: 'query', constraints: (ref as QueryRef).constraints || [], onNext, onError };

  let poller = pollers.get(entity);
  if (!poller) {
    poller = {
      subscribers: new Set(),
      timer: null,
      itemsById: new Map(),
      since: null,
      cycleCount: 0,
      hadBaseline: false,
    };
    pollers.set(entity, poller);
  }
  poller.subscribers.add(sub);

  // Premier chargement immédiat (léger décalage aléatoire pour lisser la rafale).
  setTimeout(() => pollEntity(entity), Math.random() * 400);

  // Temps réel : un changement Postgres déclenche le pull SANS attendre le tick.
  if (!poller.unsubLive) {
    poller.unsubLive = subscribeEntityChanges(entity, () => pollEntity(entity));
  }

  applyPollCadence(entity);

  return () => {
    const p = pollers.get(entity);
    if (!p) return;
    p.subscribers.delete(sub);
    if (p.subscribers.size > 0) return;
    if (p.timer) { clearInterval(p.timer); p.timer = null; }
    p.unsubLive?.();
    p.unsubLive = undefined;
    pollers.delete(entity);
  };
}

/**
 * (Re)programme le timer d'une entité à la bonne cadence : lente quand le canal
 * temps réel est connecté (simple filet de sécurité contre un événement perdu),
 * rapide sinon (le polling est alors la seule source de fraîcheur).
 */
function applyPollCadence(entity: string) {
  const poller = pollers.get(entity);
  if (!poller || poller.subscribers.size === 0) return;
  const target = isLive(entity) ? SLOW_POLL_MS : POLL_MS;
  if (poller.timer && poller.currentPollMs === target) return;
  if (poller.timer) clearInterval(poller.timer);
  poller.currentPollMs = target;
  // Gigue : désynchronise les pollers entre eux pour éviter les rafales alignées.
  poller.timer = setInterval(() => pollEntity(entity), target + Math.floor(Math.random() * 2000));
}

// Le canal d'une table vient de se connecter ou de tomber : toutes les entités
// pointant sur cette table réajustent leur cadence. À la (re)connexion, on
// resynchronise immédiatement pour rattraper ce qui a changé pendant la coupure.
onLiveStatusChange((table, connected) => {
  for (const entity of Array.from(pollers.keys())) {
    if (resolveTarget(entity).table !== table) continue;
    applyPollCadence(entity);
    if (connected) pollEntity(entity);
  }
});

// ── writeBatch ────────────────────────────────────────────────────────────────

type BatchOp = () => Promise<void>;

export function writeBatch(_db: any) {
  const ops: BatchOp[] = [];
  return {
    set(ref: DocRef, data: any, options?: { merge?: boolean }) {
      ops.push(() => kvSetDoc(ref.entity, ref.id, data, !!options?.merge));
      return this;
    },
    update(ref: DocRef, data: any) {
      ops.push(() => kvSetDoc(ref.entity, ref.id, data, true));
      return this;
    },
    delete(ref: DocRef) {
      ops.push(() => kvDeleteDoc(ref.entity, ref.id));
      return this;
    },
    async commit() {
      await Promise.all(ops.map(op => op()));
    },
  };
}

// Types conservés pour compatibilité (imports `type { ... }`).
// NB : `DocumentData` est défini plus haut. `QuerySnapshot`/`DocumentSnapshot`
// pointent désormais vers les interfaces typées (génériques, défaut permissif).
export type Firestore = typeof db;
export type Unsubscribe = () => void;
export type QuerySnapshot<T = DocumentData> = QuerySnap<T & { id: string }>;
export type DocumentSnapshot<T = DocumentData> = DocSnap<T>;