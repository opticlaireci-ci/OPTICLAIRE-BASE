import { logger } from '../utils/logger';
/**
 * Helper anti-perte de données.
 *
 * Politique :
 *  - Si la clé a été écrite localement très récemment (< RECENT_WRITE_MS) → on ignore
 *    le remote : il y a probablement une RPC en vol et le remote est en mi-chemin.
 *  - Si Supabase renvoie une LISTE NON VIDE → on écrase le cache local (cas normal).
 *  - Si Supabase renvoie VIDE alors que le cache local contient des données →
 *    on suppose un push raté ; on préserve le cache local.
 *  - Si Supabase renvoie VIDE et que le local est vide aussi → on écrit [] (no-op).
 */

import { setItemWithoutSync } from './autoSync';

// Fenêtre de protection après une écriture locale.
// Doit couvrir : retries RPC (~1 min max), latence mobile, mise en veille brève.
const RECENT_WRITE_MS = 60_000;
// En mémoire uniquement : plus d'écriture persistante navigateur pour l'état métier.
let recentWritesMemory: Record<string, number> = {};
function loadRecentWrites(): Record<string, number> {
  return { ...recentWritesMemory };
}

function saveRecentWrites(obj: Record<string, number>): void {
  const now = Date.now();
  const cleaned: Record<string, number> = {};
  for (const k of Object.keys(obj)) {
    if (now - obj[k] < RECENT_WRITE_MS * 2) cleaned[k] = obj[k];
  }
  recentWritesMemory = cleaned;
}

export function markLocalWrite(key: string): void {
  const writes = loadRecentWrites();
  writes[key] = Date.now();
  saveRecentWrites(writes);
}

export function clearLocalWrite(key: string): void {
  const writes = loadRecentWrites();
  delete writes[key];
  saveRecentWrites(writes);
}

/** Vrai si `key` a été écrite localement dans la fenêtre de protection anti-course. */
export function wasRecentlyWritten(key: string): boolean {
  const w = recentWritesMemory[key];
  return !!w && Date.now() - w < RECENT_WRITE_MS;
}

export function safeReplaceLocalArray(
  key: string,
  remote: any[],
  opts?: { authoritative?: boolean },
): void {
  // Protection anti-course : si une écriture locale (et donc une RPC) est en vol,
  // ne pas écraser avec un remote potentiellement en mi-chemin.
  const writes = loadRecentWrites();
  const lastWrite = writes[key];
  if (lastWrite && Date.now() - lastWrite < RECENT_WRITE_MS) {
    return;
  }

  if (remote.length > 0) {
    setItemWithoutSync(key, JSON.stringify(remote));
    return;
  }

  // Mode "autoritaire" : la source (Convex) fait foi. Un remote vide signifie
  // réellement "aucune donnée" → on écrase le cache local (hors fenêtre d'écriture
  // récente déjà gérée ci-dessus). Utilisé quand la lecture a RÉUSSI ; en cas
  // d'échec de lecture, l'appelant ne doit PAS appeler cette fonction.
  if (opts?.authoritative) {
    setItemWithoutSync(key, JSON.stringify([]));
    return;
  }
  // remote vide : ne pas écraser un cache local non vide
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        logger.warn(`🛡️ Hydratation ignorée pour ${key} (Supabase vide, cache local préservé : ${parsed.length} entrées)`);
        return;
      }
    }
  } catch {}
  setItemWithoutSync(key, JSON.stringify([]));
}
