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
  kvGetCollectionWhere, kvGetCollectionIds, type FiltreServeur,
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

// Sérialisation mémorisée par objet : d'un cycle de synchronisation à l'autre,
// les documents inchangés sont les MÊMES objets (conservés dans itemsById) ; on
// ne les re-sérialise donc pas toutes les 15 s (des milliers de ventes = gel
// de l'écran de plusieurs centaines de ms à chaque cycle).
const serialisations = new WeakMap<object, string>();
function serialiser(it: any): string {
  if (!it || typeof it !== 'object') return JSON.stringify(it ?? null);
  let v = serialisations.get(it);
  if (v === undefined) { v = JSON.stringify(it); serialisations.set(it, v); }
  return v;
}

function makeQuerySnap<T extends { id: string } = DocumentData & { id: string }>(
  entity: string,
  items: T[],
  prev?: Map<string, string>,
): QuerySnap<T> {
  const docs = items.map(it => makeDocSnap<T>(entity, it.id, it));
  const current = new Map<string, string>();
  items.forEach(it => current.set(it.id, serialiser(it)));

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
  // Les égalités (`==`, `in`) sont aussi envoyées à Supabase : seules les lignes
  // concernées (ex. le magasin demandé) sont téléchargées. Le filtrage exact
  // ci-dessous reste appliqué, le résultat est donc strictement identique.
  const filtresServeur: FiltreServeur[] = ref.__type === 'query'
    ? (ref as QueryRef).constraints
        .filter(c => c.kind === 'where' && (c.op === '==' || c.op === 'in'))
        .map(c => ({ field: c.field, op: c.op, value: c.value }))
    : [];
  const items = filtresServeur.length
    ? await kvGetCollectionWhere<T & { id: string }>(ref.entity, filtresServeur)
    : await kvGetCollection<T & { id: string }>(ref.entity);
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
  oublierDocSuivi(ref.entity, ref.id);
}

// ── Temps réel (postgres_changes + polling de secours) ────────────────────────

/**
 * Cadence quand le canal temps réel n'est PAS connecté (WebSocket bloqué, table
 * absente de la publication, pas de session) : le polling porte alors seul la
 * fraîcheur des données.
 */
const POLL_MS = 15_000;

interface Subscriber {
  kind: 'doc' | 'query';
  docId?: string;
  constraints?: Constraint[];
  onNext: (snap: any) => void;
  onError?: (err: Error) => void;
  prevMap?: Map<string, string>;
  lastDoc?: string;
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
  /** Suppression signalée par le temps réel : resynchroniser les `id` au prochain cycle. */
  resyncDemandee?: boolean;
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

// Un pull complet toutes les FULL_RESYNC_EVERY cycles (≈ toutes les 1 min 30 avec
// POLL_MS=15000 + gigue, davantage quand le temps réel est connecté). Suffisant pour rattraper une suppression faite sur un
// autre navigateur sans perdre l'essentiel du gain de bande passante.
const FULL_RESYNC_EVERY = 6;

/**
 * Suppression faite SUR CET APPAREIL : le document est retiré tout de suite de
 * la copie suivie en temps réel, et les écrans abonnés sont prévenus.
 *
 * Sans cela, le suivi (qui ne télécharge que les lignes MODIFIÉES) gardait le
 * document supprimé jusqu'à la resynchronisation complète suivante : une
 * facture supprimée dans Vente | Facture restait dans « Clients non soldés »,
 * et pouvait même réapparaître dans la liste des ventes.
 */
function oublierDocSuivi(entity: string, id: string) {
  const poller = pollers.get(entity);
  if (!poller) return;
  let retire = false;
  for (const cle of Array.from(poller.itemsById.keys())) {
    if (String(cle) === String(id)) { poller.itemsById.delete(cle); retire = true; }
  }
  if (retire) notifierAbonnes(poller, entity, Array.from(poller.itemsById.values()));
}

async function pollEntity(entity: string) {
  const poller = pollers.get(entity);
  if (!poller || poller.subscribers.size === 0) return;
  // Garde anti-empilement : si un cycle précédent est encore en vol (edge
  // function lente / cold-start), on saute ce tick au lieu d'empiler des
  // requêtes concurrentes vers la même entité.
  if (poller.inFlight) return;
  poller.inFlight = true;

  // Suppression faite sur un AUTRE appareil (signalée par le temps réel) : un pull
  // delta ne peut pas la voir, on resynchronise donc la liste des `id` tout de suite.
  const needsFullPull = !poller.hadBaseline || poller.cycleCount >= FULL_RESYNC_EVERY || !!poller.resyncDemandee;
  if (needsFullPull) poller.resyncDemandee = false;

  let items: any[];
  try {
    // Resynchronisation périodique ALLÉGÉE : au lieu de retélécharger toute la
    // table pour repérer les suppressions, on ne lit que la liste des `id`
    // (quelques Ko) + les lignes modifiées depuis le dernier passage.
    if (needsFullPull && poller.hadBaseline && poller.since) {
      const ids = await kvGetCollectionIds(entity);
      if (ids) {
        if (ids.length === 0 && poller.itemsById.size > 0) {
          poller.cycleCount = 0; // hoquet transitoire probable : on retentera
          return;
        }
        const { items: modifies, serverTime } = await kvGetCollectionDelta(entity, poller.since);
        for (const it of modifies) poller.itemsById.set(it.id, it);
        const presents = new Set(ids);
        for (const id of Array.from(poller.itemsById.keys())) {
          if (!presents.has(String(id))) poller.itemsById.delete(id);
        }
        // Une ligne existe en base mais manque localement (événement perdu) :
        // seul ce cas rare déclenche un pull complet au cycle suivant.
        const manquante = ids.some(id => !poller.itemsById.has(id));
        poller.hadBaseline = !manquante;
        poller.cycleCount = 0;
        if (serverTime) poller.since = serverTime;
        items = Array.from(poller.itemsById.values());
        notifierAbonnes(poller, entity, items);
        return;
      }
    }
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
    // Resynchronisation demandée mais échouée (réseau) : on la retentera.
    if (needsFullPull) poller.resyncDemandee = true;
    poller.subscribers.forEach(s => s.onError?.(err as Error));
    return;
  } finally {
    poller.inFlight = false;
  }
  notifierAbonnes(poller, entity, items);
}

function notifierAbonnes(poller: EntityPoller, entity: string, items: any[]) {
  poller.subscribers.forEach(sub => {
    try {
      if (sub.kind === 'doc') {
        const found = items.find(it => it.id === sub.docId);
        // Document identique au précédent envoi : rien à redessiner.
        const empreinte = found ? serialiser(found) : 'null';
        if (sub.lastDoc === empreinte) return;
        sub.lastDoc = empreinte;
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
        // Aucun ajout / modification / suppression depuis le dernier envoi : on
        // n'envoie RIEN. Avant, chaque cycle (toutes les 15 s, par table)
        // re-dessinait les grands tableaux et réécrivait le cache local même
        // sans aucun changement → micro-blocages pendant la navigation.
        if (sub.prevMap && snap.docChanges().length === 0) return;
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
    poller.unsubLive = subscribeEntityChanges(entity, info => {
      const p = pollers.get(entity);
      if (info.suppression && p) p.resyncDemandee = true;
      pollEntity(entity);
    });
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
  // Onglet en arrière-plan : aucun tick (économise les connexions Supabase) ;
  // le rattrapage se fait au retour sur l'onglet (voir 'visibilitychange').
  poller.timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    pollEntity(entity);
  }, target + Math.floor(Math.random() * 2000));
}

// Retour sur l'onglet : resynchronisation immédiate de toutes les entités suivies,
// puisque leurs ticks ont été suspendus tant que l'onglet était caché.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    for (const entity of Array.from(pollers.keys())) pollEntity(entity);
  });
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