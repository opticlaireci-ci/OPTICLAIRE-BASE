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
 *     + IndexedDB ;
 *   • lecture : mémoire d'abord, puis localStorage ;
 *   • au démarrage, `prechargerCacheSecours()` recharge IndexedDB en mémoire.
 *
 * LIMITES (stabilité) : une copie locale n'est qu'un confort d'affichage, la
 * vraie donnée est sur le serveur. Sans limite, des copies de dizaines de Mo
 * étaient relues à chaque démarrage et faisaient planter le navigateur (surtout
 * sur téléphone) — à chaque actualisation, jusqu'à effacement manuel des
 * données. Désormais :
 *   • une valeur de plus de TAILLE_MAX_PERSISTEE n'est JAMAIS écrite sur le
 *     disque : elle reste en mémoire le temps de la session, puis sera
 *     retéléchargée ;
 *   • le total conservé sur le disque (IndexedDB) et en mémoire est plafonné ;
 *     au-delà, les copies les plus anciennes sont abandonnées.
 *
 * Les appelants n'ont rien à changer : ils continuent d'utiliser localStorage.
 */

const DB_NOM = 'opticlaire-cache-secours';
const DB_TABLE = 'cles';

/** Au-delà (en caractères), une valeur n'est conservée qu'en mémoire. */
const TAILLE_MAX_PERSISTEE = 3_000_000;
/** Plafond de ce qui est rangé dans IndexedDB (et rechargé au démarrage). */
const TOTAL_MAX_PERSISTE = 20_000_000;
/** Plafond de la mémoire occupée par les copies (session en cours). */
const TOTAL_MAX_MEMOIRE = 60_000_000;

const memoire = new Map<string, string>();
/** Clés dont la valeur en mémoire est aussi recopiée dans IndexedDB. */
const persistees = new Set<string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function ouvrirDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    // Le gardien de démarrage (public/boot-guard.js) peut être en train
    // d'effacer cette base après un démarrage raté : on l'attend.
    try { await (window as any).__opticlaireReparationEnCours; } catch { /* ignore */ }
    return new Promise<IDBDatabase | null>(resolve => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NOM, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(DB_TABLE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  })();
  return dbPromise;
}

function idb(mode: IDBTransactionMode, action: (t: IDBObjectStore) => void): void {
  void ouvrirDb().then(db => {
    if (!db) return;
    try { action(db.transaction(DB_TABLE, mode).objectStore(DB_TABLE)); } catch { /* best-effort */ }
  });
}

function taille(map: Map<string, string>, filtre?: Set<string>): number {
  let t = 0;
  map.forEach((v, k) => { if (!filtre || filtre.has(k)) t += v.length; });
  return t;
}

// Écritures IndexedDB regroupées par clé (une rafale d'écritures = une seule).
const ecrituresEnAttente = new Map<string, ReturnType<typeof setTimeout>>();
function persister(cle: string) {
  const t = ecrituresEnAttente.get(cle);
  if (t) clearTimeout(t);
  ecrituresEnAttente.set(cle, setTimeout(() => {
    ecrituresEnAttente.delete(cle);
    const v = memoire.get(cle);
    if (v === undefined || !persistees.has(cle)) idb('readwrite', s => s.delete(cle));
    else idb('readwrite', s => s.put(v, cle));
  }, 400));
}

/** Range une valeur dans la mémoire de secours, en respectant les plafonds. */
function garderEnSecours(cle: string, valeur: string) {
  memoire.delete(cle); // réinsertion en fin = la plus récente
  memoire.set(cle, valeur);
  persistees.delete(cle);
  const surDisque = valeur.length <= TAILLE_MAX_PERSISTEE
    && taille(memoire, persistees) + valeur.length <= TOTAL_MAX_PERSISTE;
  if (surDisque) persistees.add(cle);
  persister(cle);
  // Mémoire trop chargée : on abandonne les copies les plus anciennes.
  let total = taille(memoire);
  for (const ancienne of Array.from(memoire.keys())) {
    if (total <= TOTAL_MAX_MEMOIRE || ancienne === cle) break;
    total -= memoire.get(ancienne)!.length;
    memoire.delete(ancienne);
    persistees.delete(ancienne);
    persister(ancienne);
  }
}

function estQuotaDepasse(err: any): boolean {
  return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22 || err.code === 1014 || /quota/i.test(String(err.message || '')));
}

/** Clés actuellement conservées dans le cache de secours (hors localStorage). */
export function clesCacheSecours(): string[] {
  return Array.from(memoire.keys());
}

/** Recharge IndexedDB en mémoire (dans la limite du plafond). */
export async function prechargerCacheSecours(delaiMaxMs = 1500): Promise<void> {
  const chargement = (async () => {
    const db = await ouvrirDb();
    if (!db) return;
    await new Promise<void>(resolve => {
      try {
        let total = 0;
        const store = db.transaction(DB_TABLE, 'readwrite').objectStore(DB_TABLE);
        const req = store.openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return resolve();
          const cle = String(c.key);
          const v = c.value;
          if (typeof v !== 'string' || v.length > TAILLE_MAX_PERSISTEE || total + v.length > TOTAL_MAX_PERSISTE) {
            // Copie trop grosse (ancienne version sans limite) : supprimée.
            try { c.delete(); } catch { /* ignore */ }
          } else if (!memoire.has(cle)) {
            memoire.set(cle, v);
            persistees.add(cle);
            total += v.length;
          }
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
  if (installe) return;
  installe = true;
  // Sur certains téléphones / en navigation privée, le simple ACCÈS à
  // localStorage lève une erreur : elle ne doit jamais empêcher le démarrage.
  try { installerSansErreur(); } catch { /* stockage indisponible : on continue sans */ }
}

function installerSansErreur(): void {
  if (typeof localStorage === 'undefined') return;
  const ls = localStorage;
  const natifSet = ls.setItem.bind(ls);
  const natifGet = ls.getItem.bind(ls);
  const natifRemove = ls.removeItem.bind(ls);
  const natifClear = ls.clear.bind(ls);

  ls.setItem = function (cle: string, valeur: string) {
    const texte = String(valeur);
    // Très grosse valeur : jamais sur le disque (voir LIMITES ci-dessus).
    if (texte.length > TAILLE_MAX_PERSISTEE) {
      try { natifRemove(cle); } catch { /* ignore */ }
      garderEnSecours(cle, texte);
      return;
    }
    try {
      natifSet(cle, texte);
      // La valeur tient de nouveau dans localStorage : le secours n'est plus utile.
      if (memoire.delete(cle)) { persistees.delete(cle); persister(cle); }
    } catch (err) {
      if (!estQuotaDepasse(err)) throw err;
      // localStorage plein : on retire l'ancienne copie (périmée) et on garde la
      // nouvelle en mémoire + IndexedDB. Aucune erreur remontée à l'appelant.
      try { natifRemove(cle); } catch { /* ignore */ }
      garderEnSecours(cle, texte);
    }
  };

  ls.getItem = function (cle: string) {
    const v = memoire.get(cle);
    return v !== undefined ? v : natifGet(cle);
  };

  ls.removeItem = function (cle: string) {
    if (memoire.delete(cle)) { persistees.delete(cle); persister(cle); }
    natifRemove(cle);
  };

  ls.clear = function () {
    memoire.clear();
    persistees.clear();
    idb('readwrite', s => s.clear());
    natifClear();
  };
}

// Installation DÈS le chargement de ce module (premier import de main.tsx).
// Indispensable : d'autres modules (autoSync) mémorisent `localStorage.setItem`
// au moment où ils sont chargés. Installée plus tard, la protection était
// contournée — un stockage plein faisait alors échouer les écritures et
// planter l'application à chaque actualisation.
installerCacheSecours();
// Signale au gardien de démarrage que le code de l'application est arrivé.
try { (window as any).__opticlaireCodeCharge = true; } catch { /* ignore */ }
