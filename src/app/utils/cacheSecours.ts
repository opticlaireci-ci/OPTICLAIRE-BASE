/**
 * CACHE DE SECOURS — quand le localStorage est plein
 *
 * Les pages (ventes, factures, tableaux de bord…) s'affichent INSTANTANÉMENT
 * grâce à une copie locale des données, puis se rafraîchissent depuis Supabase.
 * Cette copie était rangée dans le localStorage, limité à ~5 Mo par site. Avec
 * des milliers de ventes, la limite est dépassée : l'écriture échouait sans
 * bruit, la copie restait vide, et chaque page s'ouvrait sur un tableau vide
 * pendant 1 à 2 s (le temps de la requête réseau).
 *
 * Ce module enveloppe localStorage (une seule fois, au démarrage) :
 *   • écriture : localStorage d'abord ; s'il est PLEIN, la valeur va en mémoire
 *     + IndexedDB (plusieurs centaines de Mo disponibles) ;
 *   • lecture : mémoire d'abord, puis localStorage ;
 *   • au démarrage, `prechargerCacheSecours()` recharge IndexedDB en mémoire
 *     AVANT l'affichage de l'application → affichage immédiat même après F5.
 *
 * Les appelants n'ont rien à changer : ils continuent d'utiliser localStorage.
 */

const DB_NOM = 'opticlaire-cache-secours';
const DB_TABLE = 'cles';

const memoire = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function ouvrirDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NOM, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(DB_TABLE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function idb(mode: IDBTransactionMode, action: (t: IDBObjectStore) => void): void {
  void ouvrirDb().then(db => {
    if (!db) return;
    try { action(db.transaction(DB_TABLE, mode).objectStore(DB_TABLE)); } catch { /* best-effort */ }
  });
}

// Écritures IndexedDB regroupées par clé (une rafale d'écritures = une seule).
const ecrituresEnAttente = new Map<string, ReturnType<typeof setTimeout>>();
function persister(cle: string) {
  const t = ecrituresEnAttente.get(cle);
  if (t) clearTimeout(t);
  ecrituresEnAttente.set(cle, setTimeout(() => {
    ecrituresEnAttente.delete(cle);
    const v = memoire.get(cle);
    if (v === undefined) idb('readwrite', s => s.delete(cle));
    else idb('readwrite', s => s.put(v, cle));
  }, 400));
}

function estQuotaDepasse(err: any): boolean {
  return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22 || err.code === 1014 || /quota/i.test(String(err.message || '')));
}

/** Clés actuellement conservées dans le cache de secours (hors localStorage). */
export function clesCacheSecours(): string[] {
  return Array.from(memoire.keys());
}

/** Recharge IndexedDB en mémoire. À attendre AVANT d'afficher l'application. */
export async function prechargerCacheSecours(delaiMaxMs = 1500): Promise<void> {
  const chargement = (async () => {
    const db = await ouvrirDb();
    if (!db) return;
    await new Promise<void>(resolve => {
      try {
        const store = db.transaction(DB_TABLE, 'readonly').objectStore(DB_TABLE);
        const req = store.openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return resolve();
          if (typeof c.value === 'string' && !memoire.has(String(c.key))) memoire.set(String(c.key), c.value);
          c.continue();
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
    });
  })();
  await Promise.race([chargement, new Promise(r => setTimeout(r, delaiMaxMs))]);
}

let installe = false;
/** Enveloppe localStorage. Idempotent ; à appeler avant tout autre module. */
export function installerCacheSecours(): void {
  if (installe || typeof localStorage === 'undefined') return;
  installe = true;
  const ls = localStorage;
  const natifSet = ls.setItem.bind(ls);
  const natifGet = ls.getItem.bind(ls);
  const natifRemove = ls.removeItem.bind(ls);
  const natifClear = ls.clear.bind(ls);

  ls.setItem = function (cle: string, valeur: string) {
    try {
      natifSet(cle, valeur);
      // La valeur tient de nouveau dans localStorage : le secours n'est plus utile.
      if (memoire.delete(cle)) persister(cle);
    } catch (err) {
      if (!estQuotaDepasse(err)) throw err;
      // localStorage plein : on retire l'ancienne copie (périmée) et on garde la
      // nouvelle en mémoire + IndexedDB. Aucune erreur remontée à l'appelant.
      try { natifRemove(cle); } catch { /* ignore */ }
      memoire.set(cle, String(valeur));
      persister(cle);
    }
  };

  ls.getItem = function (cle: string) {
    const v = memoire.get(cle);
    return v !== undefined ? v : natifGet(cle);
  };

  ls.removeItem = function (cle: string) {
    if (memoire.delete(cle)) persister(cle);
    natifRemove(cle);
  };

  ls.clear = function () {
    memoire.clear();
    idb('readwrite', s => s.clear());
    natifClear();
  };
}
