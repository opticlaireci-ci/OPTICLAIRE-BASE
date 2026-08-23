/**
 * API wrapper — Firebase remplace les Edge Functions Supabase.
 * Les opérations CRUD sont maintenant faites directement via Firestore.
 */

import {
  collection, doc, getDocs, setDoc, deleteDoc, getDoc,
} from '../utils/firestoreCompat';
import { db, restSetDoc, restDeleteDoc, FIREBASE_DATA_ENABLED } from '../utils/firebaseClient';
import { safeUuid } from '../utils/safeId';

// Cache mémoire court pour getAll : évite de re-télécharger toute une collection
// à chaque navigation ou à chaque événement (les hooks de lookup appellent
// getAll très souvent). TTL court pour rester quasi temps réel.
const GETALL_TTL_MS = 15_000;
const _getAllCache = new Map<string, { at: number; promise: Promise<any[]> }>();

function invalidateGetAll(entity: string) {
  _getAllCache.delete(entity);
}

export const api = {
  getAll: async <T>(entity: string): Promise<T[]> => {
    if (!FIREBASE_DATA_ENABLED) return [];
    const cached = _getAllCache.get(entity);
    if (cached && Date.now() - cached.at < GETALL_TTL_MS) {
      return cached.promise as Promise<T[]>;
    }
    const promise = getDocs(collection(db, entity))
      .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as T)))
      .catch(err => { _getAllCache.delete(entity); throw err; });
    _getAllCache.set(entity, { at: Date.now(), promise });
    return promise;
  },

  get: async <T>(entity: string, id: string): Promise<T> => {
    if (!FIREBASE_DATA_ENABLED) throw new Error(`${entity}/${id} introuvable (données Firebase coupées)`);
    const snap = await getDoc(doc(db, entity, id));
    if (!snap.exists()) throw new Error(`${entity}/${id} introuvable`);
    return { id: snap.id, ...snap.data() } as unknown as T;
  },

  create: async <T>(entity: string, data: Partial<T>): Promise<T> => {
    const id = (data as any).id || safeUuid();
    const payload = { ...data, id, created_at: new Date().toISOString() };
    await restSetDoc(entity, id, payload, false);
    invalidateGetAll(entity);
    return payload as unknown as T;
  },

  update: async <T>(entity: string, id: string, data: Partial<T>): Promise<T> => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    await restSetDoc(entity, id, payload, true);
    invalidateGetAll(entity);
    const snap = await getDoc(doc(db, entity, id));
    return { id: snap.id, ...snap.data() } as unknown as T;
  },

  delete: async (entity: string, id: string): Promise<void> => {
    await restDeleteDoc(entity, id);
    invalidateGetAll(entity);
  },
};
