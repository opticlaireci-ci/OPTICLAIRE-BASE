import { logger } from '../utils/logger';
/**
 * SERVICE CLIENTS — lecture/écriture DIRECTES sur Firestore.
 *
 * Modèle identique au STOCK (`inventaireService.loadStockMagasin`) : on lit la
 * collection Firestore `clients` EN DIRECT à l'affichage, sans cache intermédiaire
 * ni couche Convex. C'est le seul modèle qui reste cohérent sur tous les
 * navigateurs et appareils (aperçu Figma comme déploiement Vercel).
 */

import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, onSnapshot,
} from '../utils/firestoreCompat';
import { db, auth } from '../utils/firebaseClient';
import { journaliserSuppression } from './auditLogService';
import { logNetworkAware } from '../utils/networkErrors';

export interface ClientRow {
  id: string;
  magasin_id: string;
  numero_client: string;
  nom: string;
  telephone: string;
  telephone2?: string;
  email?: string;
  adresse?: string;
  profession?: string;
  jour_naissance?: string;
  mois_naissance?: string;
  annee_naissance?: string;
  matricule_assurance?: string;
  entreprise?: string;
  notes?: string;
  solde: number;
  date_edition: string;
  source?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

const COLLECTION = 'clients';

function sortByEdition(arr: ClientRow[]): ClientRow[] {
  return arr.sort((a, b) => (b.date_edition || '').localeCompare(a.date_edition || ''));
}

/** Clé de cache localStorage des clients d'un magasin. */
export const clientsCacheKey = (magasinId: string) => `leclaire_clients_magasin_${magasinId.toUpperCase()}`;

/** Lecture SYNCHRONE des derniers clients connus (cache) — affichage immédiat. */
export function readClientsCache(magasinId: string): ClientRow[] {
  try {
    const raw = localStorage.getItem(clientsCacheKey(magasinId));
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

/** Écrit le cache + notifie les abonnés si les données ont changé. */
function writeClientsCache(magasinId: string, rows: ClientRow[]) {
  try {
    const next = JSON.stringify(rows);
    if (localStorage.getItem(clientsCacheKey(magasinId)) !== next) {
      localStorage.setItem(clientsCacheKey(magasinId), next);
      const detail = { detail: { magasinId: magasinId.toUpperCase() } };
      // Émettre les DEUX noms d'événement : certains écouteurs (autocomplétion
      // des ventes) n'écoutent que 'leclaire-clients-update', d'autres 'clients-updated'.
      window.dispatchEvent(new CustomEvent('clients-updated', detail));
      window.dispatchEvent(new CustomEvent('leclaire-clients-update', detail));
    }
  } catch {}
}

/** Charge tous les clients d'un magasin DIRECTEMENT depuis Firestore. */
export async function chargerClients(magasinId: string): Promise<ClientRow[]> {
  try {
    const q = query(collection(db, COLLECTION), where('magasin_id', '==', magasinId));
    const snap = await getDocs(q);
    const rows = sortByEdition(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientRow)));
    writeClientsCache(magasinId, rows);
    return rows;
  } catch (err) {
    logger.error('❌ chargerClients (Firestore):', err);
    return readClientsCache(magasinId);
  }
}

/**
 * Charge les clients de PLUSIEURS magasins en UN SEUL téléchargement de la
 * collection `clients` (le `where()` du shim filtre côté client : appeler
 * `chargerClients` 7 fois = 7 téléchargements complets). On télécharge une fois,
 * on partitionne par magasin, et on écrit le cache de chacun.
 */
export async function chargerTousLesClients(
  magasinIds: string[],
): Promise<Record<string, ClientRow[]>> {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientRow));
    const result: Record<string, ClientRow[]> = {};
    for (const id of magasinIds) {
      const rows = sortByEdition(all.filter(c => c.magasin_id === id));
      result[id] = rows;
      writeClientsCache(id, rows);
    }
    return result;
  } catch (err) {
    // Session absente/expirée ou réseau : cache local conservé (warn discret).
    logNetworkAware('⚠️ chargerTousLesClients (cache local conservé)', err);
    return Object.fromEntries(magasinIds.map(id => [id, readClientsCache(id)]));
  }
}

/** Crée ou met à jour un client dans Firestore. */
export async function upsertClient(c: Partial<ClientRow>): Promise<boolean> {
  try {
    if (!c.id) {
      logger.error('❌ upsertClient: id manquant');
      return false;
    }
    if (!c.magasin_id) {
      logger.error('❌ upsertClient: magasin_id manquant');
      return false;
    }

    // Mise à jour OPTIMISTE du cache local : le client apparaît IMMÉDIATEMENT
    // dans la Base de Données Client (qui lit ce cache) sans attendre le réseau.
    // writeClientsCache émet 'clients-updated'/'leclaire-clients-update' pour
    // rafraîchir toute page Clients ouverte.
    try {
      const cached = readClientsCache(c.magasin_id);
      const idx = cached.findIndex(x => x.id === c.id);
      const optimisticRow = { ...(idx >= 0 ? cached[idx] : {}), ...(c as ClientRow) } as ClientRow;
      const nextRows = idx >= 0
        ? cached.map(x => (x.id === c.id ? optimisticRow : x))
        : [optimisticRow, ...cached];
      writeClientsCache(c.magasin_id, nextRows);
    } catch { /* le cache ne doit jamais bloquer l'enregistrement */ }

    const ref = doc(db, COLLECTION, c.id);
    const existingSnap = await getDoc(ref);
    const existing = existingSnap.exists() ? (existingSnap.data() as ClientRow) : null;

    const now = new Date().toISOString();
    const payload: ClientRow = {
      solde: 0,
      date_edition: now,
      numero_client: '',
      nom: '',
      telephone: '',
      ...(existing || {}),
      ...(c as ClientRow),
      user_id: c.user_id || existing?.user_id || auth.currentUser?.uid || undefined,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await setDoc(ref, payload, { merge: true });
    // Re-synchronise le cache avec la version autoritative (timestamps, valeurs par défaut).
    try {
      const cached = readClientsCache(payload.magasin_id);
      const idx = cached.findIndex(x => x.id === payload.id);
      const nextRows = idx >= 0
        ? cached.map(x => (x.id === payload.id ? payload : x))
        : [payload, ...cached];
      writeClientsCache(payload.magasin_id, nextRows);
    } catch { /* ignore */ }
    return true;
  } catch (err) {
    // Silencieux : l'auto-enregistrement d'un client (depuis une vente/devis) ne
    // doit jamais afficher d'alerte. Le client reste dans le cache local optimiste.
    // Session expirée/absente ou coupure réseau → warn discret (cache préservé).
    logNetworkAware('⚠️ upsertClient (cache local conservé)', err);
    return false;
  }
}

/** Supprime un client de Firestore. */
export async function supprimerClient(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    journaliserSuppression('Clients', `Client supprimé (${id})`);
    return true;
  } catch (err) {
    logger.error('❌ supprimerClient (Firestore):', err);
    return false;
  }
}

/** Abonnement temps réel Firestore aux clients d'un magasin. */
export function subscribeClientsMagasin(
  magasinId: string,
  onChange: (clients: ClientRow[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where('magasin_id', '==', magasinId));
  return onSnapshot(
    q,
    snap => {
      const rows = sortByEdition(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientRow)));
      writeClientsCache(magasinId, rows);
      onChange(rows);
    },
    err => logNetworkAware('⚠️ subscribeClientsMagasin (Firestore)', err),
  );
}
