import { supabase } from './supabaseClient';
import { resolveTarget } from './supabaseDirect';
import { logger } from './logger';

/**
 * TEMPS RÉEL VÉRITABLE — canaux `postgres_changes` (WebSocket).
 *
 * Historiquement, le « temps réel » d'OPTICLAIRE était du POLLING (6 s dans
 * `firestoreCompat.onSnapshot`, 8 s dans `supabaseRealtime`) : hérité de l'époque
 * où tout passait par une edge function, qui ne peut pas pousser d'événements.
 * Depuis la migration vers PostgREST direct, les données vivent dans de vraies
 * tables : Postgres peut donc NOTIFIER les changements via la réplication
 * logique, et supabase-js les relaie en WebSocket.
 *
 * ── Modèle retenu : « realtime déclencheur + polling filet de sécurité » ──────
 * Le canal ne transporte PAS la donnée métier jusqu'aux composants. Il sert
 * uniquement de RÉVEIL : à chaque INSERT/UPDATE/DELETE, on déclenche
 * immédiatement le rafraîchissement déjà existant (pollEntity / tick). On garde
 * ainsi TOUTE la logique éprouvée (pull incrémental, gardes anti-clignotement,
 * fusion des magasins) et on gagne uniquement la latence : ~100 ms au lieu de
 * 0–8 s d'attente.
 *
 * C'est aussi ce qui rend le passage SÛR : si une table n'est pas dans la
 * publication `supabase_realtime`, si le WebSocket est bloqué par un proxy
 * d'entreprise, ou si l'utilisateur n'a pas de session, aucun événement n'arrive
 * — et le polling (ralenti mais toujours actif) continue de tout rattraper.
 * Aucune régression possible, contrairement à un remplacement pur.
 */

/** Cadence de polling quand le canal temps réel est CONNECTÉ (filet de sécurité). */
export const SLOW_POLL_MS = 60_000;

/** Regroupe les rafales d'événements (une écriture batch = N événements). */
const DEBOUNCE_MS = 250;

type Unsubscribe = () => void;

interface LiveChannel {
  /** Abonnés au réveil de cette table. */
  listeners: Set<() => void>;
  /** Canal supabase-js (type volontairement souple : RealtimeChannel). */
  channel: any;
  /** true dès que le serveur a confirmé la souscription. */
  connected: boolean;
  debounce: ReturnType<typeof setTimeout> | null;
}

/** Un seul canal par TABLE, mutualisé entre toutes les entités qui la visent. */
const channels = new Map<string, LiveChannel>();

/**
 * Compteur rendant chaque topic unique.
 *
 * `supabase.removeChannel()` est ASYNCHRONE : le canal reste référencé dans le
 * client le temps du `unsubscribe` réseau. Or `supabase.channel(topic)` renvoie
 * le canal EXISTANT quand ce topic est déjà connu. Sans ce compteur, un
 * démontage/remontage rapide d'une page (React StrictMode, navigation aller-retour)
 * récupérait l'ancien canal déjà `subscribe()`d, et `.on('postgres_changes', …)`
 * levait « cannot add postgres_changes callbacks … after subscribe() » — erreur
 * remontée jusqu'au rendu React, qui faisait tomber la page dans l'ErrorBoundary.
 */
let topicSeq = 0;

/** Abonnés aux changements de statut (les pollers ajustent leur intervalle). */
const statusListeners = new Set<(table: string, connected: boolean) => void>();

/**
 * S'abonne aux changements de statut de connexion des canaux. Permet aux
 * pollers de basculer entre cadence rapide (realtime KO) et lente (realtime OK).
 */
export function onLiveStatusChange(cb: (table: string, connected: boolean) => void): Unsubscribe {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

function setConnected(table: string, connected: boolean) {
  const live = channels.get(table);
  if (!live || live.connected === connected) return;
  live.connected = connected;
  logger.log(connected
    ? `📡 Temps réel connecté sur public.${table}`
    : `📴 Temps réel interrompu sur public.${table} — retour au polling rapide`);
  statusListeners.forEach(cb => { try { cb(table, connected); } catch { /* isolé */ } });
}

/** Le canal de la table visée par cette entité est-il actuellement connecté ? */
export function isLive(entity: string): boolean {
  return channels.get(resolveTarget(entity).table)?.connected ?? false;
}

/**
 * Ouvre (ou réutilise) un canal `postgres_changes` sur la table de `entity` et
 * appelle `onChange` à chaque modification. Renvoie la fonction de désabonnement.
 *
 * Aucun filtre n'est posé côté serveur : les tables « fourre-tout »
 * (`referentiels`, `app_data`) mélangent plusieurs entités, et Realtime
 * n'accepte que des filtres d'égalité — pas de `like`. Comme `onChange` ne fait
 * que déclencher un re-pull (lui-même correctement filtré), un réveil un peu
 * trop large est sans conséquence fonctionnelle.
 */
export function subscribeEntityChanges(entity: string, onChange: () => void): Unsubscribe {
  const { table } = resolveTarget(entity);

  let live = channels.get(table);
  if (!live) {
    const created: LiveChannel = {
      listeners: new Set(),
      channel: null,
      connected: false,
      debounce: null,
    };

    const fire = () => {
      if (created.debounce) clearTimeout(created.debounce);
      created.debounce = setTimeout(() => {
        created.debounce = null;
        created.listeners.forEach(cb => { try { cb(); } catch { /* isolé */ } });
      }, DEBOUNCE_MS);
    };

    // Le temps réel est un CONFORT (le polling reste le filet de sécurité) : un
    // échec d'ouverture de canal ne doit jamais interrompre l'appelant, qui est
    // le plus souvent un `useEffect` de page.
    try {
      created.channel = supabase
        .channel(`live:${table}:${++topicSeq}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, fire)
        .subscribe((status: string) => {
          // SUBSCRIBED → opérationnel. CHANNEL_ERROR / TIMED_OUT / CLOSED →
          // dégradé : on repasse en polling rapide (supabase-js retente seul).
          setConnected(table, status === 'SUBSCRIBED');
        });
    } catch (e) {
      logger.warn(`⚠️ Temps réel indisponible sur public.${table} — polling rapide conservé`, e);
      return () => { /* rien à libérer */ };
    }

    // Inscrit APRÈS succès : une entrée au `channel: null` serait réutilisée par
    // les appels suivants, qui n'ouvriraient alors plus jamais de canal.
    channels.set(table, created);
    live = created;
  }

  live.listeners.add(onChange);

  return () => {
    const current = channels.get(table);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size > 0) return;
    // Plus aucun abonné : on ferme le canal pour libérer le WebSocket.
    if (current.debounce) clearTimeout(current.debounce);
    closeChannel(current);
    channels.delete(table);
  };
}

/**
 * Ferme un canal sans jamais lever. `removeChannel` renvoie une promesse : sans
 * `catch`, une fermeture pendant un rechargement produirait un rejet non traité.
 */
function closeChannel(live: LiveChannel) {
  if (!live.channel) return;
  try {
    const p = supabase.removeChannel(live.channel);
    if (p && typeof (p as any).catch === 'function') (p as any).catch(() => { /* déjà fermé */ });
  } catch { /* déjà fermé */ }
  live.channel = null;
}

/** Ferme tous les canaux (déconnexion / rechargement). */
export function closeAllLiveChannels() {
  channels.forEach(live => {
    if (live.debounce) clearTimeout(live.debounce);
    closeChannel(live);
  });
  channels.clear();
}
