import { logger } from '../utils/logger';
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
} from '../utils/firestoreCompat';
import { db, restSetDoc, restDeleteDoc, FIREBASE_DATA_ENABLED } from '../utils/firebaseClient';
import { journaliserSuppression } from './auditLogService';
import { logNetworkAware, isAuthError, isNoSessionError } from '../utils/networkErrors';

export interface ReglementSupabase {
  id: string;
  vente_id: string;
  magasin_id: string;
  recu: string;
  mode_paiement: string;
  compte_banque: string;
  details: string;
  montant: number;
  date: string;
  edite_par: string;
  created_at?: string;
  updated_at?: string;
}

// ── Cache local des règlements (map vente_id → règlements) ───────────────────
// Permet d'afficher IMMÉDIATEMENT les bons montants (reste/soldé) au retour sur
// la page, sans flash des anciennes valeurs pendant le chargement Firestore.
const REGLEMENTS_CACHE_KEY = 'leclaire_reglements_cache';

export function readReglementsCacheMap(): Record<string, ReglementSupabase[]> {
  try {
    const raw = localStorage.getItem(REGLEMENTS_CACHE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === 'object' ? p : {};
  } catch { return {}; }
}

function writeReglementsCacheMap(map: Record<string, ReglementSupabase[]>) {
  try { localStorage.setItem(REGLEMENTS_CACHE_KEY, JSON.stringify(map)); } catch {}
}

function cacheFromList(list: ReglementSupabase[]) {
  const map: Record<string, ReglementSupabase[]> = {};
  for (const r of list) { (map[r.vente_id] ||= []).push(r); }
  writeReglementsCacheMap(map);
}

/** Met à jour le cache pour un seul règlement (ajout/modif). */
function upsertReglementCache(r: ReglementSupabase) {
  const map = readReglementsCacheMap();
  const list = (map[r.vente_id] || []).filter(x => x.id !== r.id);
  list.push(r);
  map[r.vente_id] = list;
  writeReglementsCacheMap(map);
}

/** Retire un règlement du cache. */
function removeReglementCache(reglementId: string) {
  const map = readReglementsCacheMap();
  let changed = false;
  for (const k of Object.keys(map)) {
    const next = map[k].filter(x => x.id !== reglementId);
    if (next.length !== map[k].length) { map[k] = next; changed = true; }
  }
  if (changed) writeReglementsCacheMap(map);
}

export async function chargerReglements(venteId: string): Promise<ReglementSupabase[]> {
  if (!FIREBASE_DATA_ENABLED) return [];
  try {
    const q = query(collection(db, 'reglements'), where('vente_id', '==', venteId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ReglementSupabase))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  } catch (err) {
    logNetworkAware('Erreur chargerReglements', err);
    return [];
  }
}

export async function chargerReglementsParMagasin(magasinId: string): Promise<ReglementSupabase[]> {
  if (!FIREBASE_DATA_ENABLED) return [];
  try {
    const q = query(collection(db, 'reglements'), where('magasin_id', '==', magasinId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ReglementSupabase))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    logNetworkAware('Erreur chargerReglementsParMagasin', err);
    return [];
  }
}

export async function chargerTousLesReglements(): Promise<ReglementSupabase[]> {
  if (!FIREBASE_DATA_ENABLED) return [];
  try {
    const snap = await getDocs(collection(db, 'reglements'));
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ReglementSupabase))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    cacheFromList(list);
    return list;
  } catch (err) {
    // Session expirée / non connecté : bénin (cache local conservé, rechargé
    // après reconnexion) — on n'émet pas d'erreur bruyante.
    if (isAuthError(err) || isNoSessionError(err)) {
      logNetworkAware('chargerTousLesReglements', err);
    } else {
      logger.error('Erreur chargerTousLesReglements:', err);
    }
    return [];
  }
}

export async function ajouterReglement(reglement: Omit<ReglementSupabase, 'created_at' | 'updated_at'>): Promise<ReglementSupabase | null> {
  try {
    const now = new Date().toISOString();
    const data = { ...reglement, created_at: now, updated_at: now };
    await restSetDoc('reglements', reglement.id, data, false);
    upsertReglementCache(data as ReglementSupabase);
    logger.log('✅ Règlement ajouté:', reglement.id);
    return data as ReglementSupabase;
  } catch (err) {
    logger.error('Erreur ajouterReglement:', err);
    throw err;
  }
}

export async function supprimerReglement(reglementId: string): Promise<boolean> {
  try {
    await restDeleteDoc('reglements', reglementId);
    removeReglementCache(reglementId);
    journaliserSuppression('Règlements', `Règlement supprimé (${reglementId})`);
    logger.log('✅ Règlement supprimé');
    return true;
  } catch (err) {
    logger.error('Erreur supprimerReglement:', err);
    return false;
  }
}

export function subscriberReglementsVente(
  venteId: string,
  onInsert: (r: ReglementSupabase) => void,
  onUpdate: (r: ReglementSupabase) => void,
  onDelete: (id: string) => void
) {
  if (!FIREBASE_DATA_ENABLED) return () => {};
  const q = query(collection(db, 'reglements'), where('vente_id', '==', venteId));
  return onSnapshot(q, snap => {
    snap.docChanges().forEach(change => {
      const data = { id: change.doc.id, ...change.doc.data() } as ReglementSupabase;
      if (change.type === 'added') onInsert(data);
      else if (change.type === 'modified') onUpdate(data);
      else if (change.type === 'removed') onDelete(change.doc.id);
    });
  }, err => logNetworkAware('⚠️ subscribe règlements (Firestore)', err));
}

export async function calculerTotalReglements(venteId: string): Promise<number> {
  const reglements = await chargerReglements(venteId);
  return reglements.reduce((total, r) => total + r.montant, 0);
}
