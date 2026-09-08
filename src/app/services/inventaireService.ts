import { logger } from '../utils/logger';
/**
 * Service d'inventaire — Firebase/Firestore
 * Gestion du stock via la collection `mouvements_stock` et `stock_par_magasin`.
 */

import {
  collection, doc, getDocs, addDoc, setDoc,
} from '../utils/firestoreCompat';
import { db, auth } from '../utils/firebaseClient';
import { logNetworkAware, isAuthError, isNoSessionError } from '../utils/networkErrors';

export interface StockMagasin {
  magasinId: string;
  produitId: string;
  produitType: 'monture' | 'accessoire';
  designation: string;
  quantiteDisponible: number;
  prixVente: number;
  derniereMiseAJour: string;
}

type Item = {
  id: string;
  type: 'monture' | 'accessoire';
  designation: string;
  quantite: number;
  prixVente: number;
};

/** Clé de cache localStorage du stock calculé d'un magasin (affichage instantané). */
export const stockCacheKey = (magasinId: string) => `leclaire_stock_cache_${magasinId.toUpperCase()}`;

/** Lecture SYNCHRONE du dernier stock connu (cache) — pour un affichage immédiat. */
export function readStockCache(magasinId: string): StockMagasin[] {
  try {
    const raw = localStorage.getItem(stockCacheKey(magasinId));
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

/**
 * Calcule le stock d'un magasin depuis les mouvements Firestore.
 * La vue SQL `stock_par_magasin` n'existe plus — on agrège depuis `mouvements_stock`.
 * Le résultat est mis en cache localStorage + un événement 'leclaire-stock-updated'
 * est émis pour que les pages abonnées se rafraîchissent AUTOMATIQUEMENT.
 */
/**
 * Complément de fiabilité : certaines anciennes distributions validées peuvent
 * exister dans `bons` sans leur mouvement correspondant (ancienne version /
 * coupure réseau). On les considère comme entrées uniquement si aucun mouvement
 * logique équivalent n'existe déjà. Cela rétablit le stock réel sans doubler les
 * distributions déjà enregistrées.
 */
async function chargerMouvementsAvecBonsAcceptes(targets: string[]) {
  const wanted = new Set(targets.map(v => String(v || '').trim().toUpperCase()).filter(Boolean));
  const snapM = await getDocs(collection(db, 'mouvements_stock'));
  const movements = snapM.docs.map((d: any) => ({ id: d.id, data: d.data() || {} }));
  const norm = (v: any) => String(v ?? '').trim().toUpperCase();
  const articleKey = (r: any) => norm(r.article_id || r.designation);
  const logicalKey = (r: any, docId = '') =>
    `${norm(r.type)}|${norm(r.bon_id || r.reference || docId)}|${articleKey(r)}`;
  const movementKeys = new Set(movements.map(({ id, data }) => logicalKey(data, id)));

  try {
    const snapB = await getDocs(collection(db, 'bons'));
    for (const d of snapB.docs as any[]) {
      const b = d.data() || {};
      const type = norm(b.type);
      const statut = norm(b.statut);
      if (!['DISTRIBUTION', 'TRANSFERT'].includes(type) || !['VALIDE', 'VALIDÉ'].includes(statut)) continue;
      const source = norm(b.magasin_source);
      const destination = norm(b.magasin_destination);
      if (!wanted.has(source) && !wanted.has(destination)) continue;
      for (const item of Array.isArray(b.items) ? b.items : []) {
        const article = item.id || item.article_id || item.designation;
        if (!article) continue;
        const fake = {
          type: type.toLowerCase(),
          bon_id: b.numero || b.id || d.id,
          article_id: article,
          designation: item.designation || article,
        };
        const key = logicalKey(fake);
        if (!movementKeys.has(key)) {
          movements.push({
            id: `fallback_${d.id}_${sanitizeIdPart(article)}`,
            data: {
              ...fake,
              quantite: Number(item.quantite) || 0,
              magasin_source: source || undefined,
              magasin_destination: destination || undefined,
              produit_type: item.type === 'accessoire' ? 'accessoire' : 'monture',
              prix_vente: Number(item.prixUnit) || 0,
              created_at: b.date || b.created_at || '',
              _fromAcceptedBon: true,
            },
          });
          movementKeys.add(key);
        }
      }
    }
  } catch (err) {
    logger.warn('Impossible de vérifier les bons acceptés pour le stock:', err);
  }
  return movements;
}

export async function loadStockMagasin(magasinId: string): Promise<StockMagasin[]> {
  try {
    const target = String(magasinId || '').trim().toUpperCase();
    if (!target) return [];
    const docs = await chargerMouvementsAvecBonsAcceptes([target]);
    const stockMap = new Map<string, StockMagasin>();
    // Un mouvement est unique par opération + bon + article. Les anciens
    // documents sans article_id utilisent la désignation comme repli.
    const seen = new Set<string>();
    const norm = (v: any) => String(v ?? '').trim().toUpperCase();
    const articleKey = (r: any) => norm(r.article_id || r.designation);
    const logicalKey = (r: any, docId: string) =>
      `${norm(r.type)}|${norm(r.bon_id || r.reference || docId)}|${articleKey(r)}`;

    docs.forEach((d: any) => {
      const r = d.data || {};
      const destination = norm(r.magasin_destination);
      const source = norm(r.magasin_source);
      const isIncoming = destination === target && (r.type === 'distribution' || r.type === 'transfert');
      const isOutgoing = source === target && (r.type === 'vente' || r.type === 'retour' || r.type === 'transfert');
      if (!isIncoming && !isOutgoing) return;

      const lk = logicalKey(r, d.id);
      if (seen.has(lk)) return;
      seen.add(lk);

      const key = articleKey(r);
      if (!key) return;
      const existing = stockMap.get(key) || {
        magasinId: target,
        produitId: r.article_id || r.designation || key,
        produitType: r.produit_type === 'accessoire' ? 'accessoire' : 'monture',
        designation: r.designation || r.article_id || key,
        quantiteDisponible: 0,
        prixVente: Number(r.prix_vente) || 0,
        derniereMiseAJour: r.created_at || '',
      };
      const q = Number(r.quantite) || 0;
      if (isIncoming) existing.quantiteDisponible += q;
      if (isOutgoing) existing.quantiteDisponible -= q;
      if (r.created_at && r.created_at > existing.derniereMiseAJour) existing.derniereMiseAJour = r.created_at;
      stockMap.set(key, existing);
    });

    const result = Array.from(stockMap.values()).filter(s => s.quantiteDisponible > 0);
    try {
      const prev = localStorage.getItem(stockCacheKey(target));
      const next = JSON.stringify(result);
      if (prev !== next) {
        localStorage.setItem(stockCacheKey(target), next);
        window.dispatchEvent(new CustomEvent('leclaire-stock-updated', { detail: { magasinId: target } }));
      }
    } catch {}
    return result;
  } catch (err) {
    logger.error('loadStockMagasin:', err);
    return [];
  }
}

export async function recalculerStockMagasin(magasinId: string): Promise<StockMagasin[]> {
  return loadStockMagasin(magasinId);
}

/**
 * Calcule le stock de PLUSIEURS magasins en UN SEUL téléchargement de la
 * collection `mouvements_stock`. Le tableau de bord admin appelait
 * `loadStockMagasin` une fois par magasin (7 téléchargements complets de la
 * même collection) → lenteur. Ici on télécharge une fois puis on partitionne
 * en mémoire, et on écrit le cache de chaque magasin + émet l'événement live.
 */
export async function loadStocksParMagasin(
  magasinIds: string[],
): Promise<Record<string, StockMagasin[]>> {
  const result: Record<string, StockMagasin[]> = {};
  try {
    const ids = magasinIds.map(id => String(id || '').trim().toUpperCase()).filter(Boolean);
    const docs = await chargerMouvementsAvecBonsAcceptes(ids);
    const norm = (v: any) => String(v ?? '').trim().toUpperCase();
    const articleKey = (r: any) => norm(r.article_id || r.designation);
    const logicalKey = (r: any, docId: string) =>
      `${norm(r.type)}|${norm(r.bon_id || r.reference || docId)}|${articleKey(r)}`;

    for (const target of ids) {
      const stockMap = new Map<string, StockMagasin>();
      const seen = new Set<string>();
      for (const { id, data: r } of docs) {
        const destination = norm(r.magasin_destination);
        const source = norm(r.magasin_source);
        const isIncoming = destination === target && (r.type === 'distribution' || r.type === 'transfert');
        const isOutgoing = source === target && (r.type === 'vente' || r.type === 'retour' || r.type === 'transfert');
        if (!isIncoming && !isOutgoing) continue;
        const lk = logicalKey(r, id);
        if (seen.has(lk)) continue;
        seen.add(lk);
        const key = articleKey(r);
        if (!key) continue;
        const existing = stockMap.get(key) || {
          magasinId: target, produitId: r.article_id || r.designation || key,
          produitType: r.produit_type === 'accessoire' ? 'accessoire' : 'monture',
          designation: r.designation || r.article_id || key, quantiteDisponible: 0,
          prixVente: Number(r.prix_vente) || 0, derniereMiseAJour: r.created_at || '',
        };
        const q = Number(r.quantite) || 0;
        if (isIncoming) existing.quantiteDisponible += q;
        if (isOutgoing) existing.quantiteDisponible -= q;
        if (r.created_at && r.created_at > existing.derniereMiseAJour) existing.derniereMiseAJour = r.created_at;
        stockMap.set(key, existing);
      }
      const rows = Array.from(stockMap.values()).filter(s => s.quantiteDisponible > 0);
      result[target] = rows;
      try {
        const prev = localStorage.getItem(stockCacheKey(target));
        const next = JSON.stringify(rows);
        if (prev !== next) {
          localStorage.setItem(stockCacheKey(target), next);
          window.dispatchEvent(new CustomEvent('leclaire-stock-updated', { detail: { magasinId: target } }));
        }
      } catch {}
    }
    return result;
  } catch (err) {
    logger.error('loadStocksParMagasin:', err);
    return Object.fromEntries(magasinIds.map(id => [id, readStockCache(id)]));
  }
}

export async function getQuantiteDisponible(
  magasinId: string,
  produitId: string,
  _produitType: 'monture' | 'accessoire'
): Promise<number> {
  const stock = await loadStockMagasin(magasinId);
  return stock.find(s => s.produitId === produitId)?.quantiteDisponible ?? 0;
}

export async function recalculerTousLesStocks(): Promise<void> {}

/** Nettoie une valeur pour l'utiliser dans un id de document KV. */
function sanitizeIdPart(v: any): string {
  return String(v ?? '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
}

async function insertMouvements(rows: any[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const userId = auth.currentUser?.uid || null;
  const now = new Date().toISOString();
  try {
    await Promise.all(rows.map(r => {
      const { _docId, ...data } = r;
      const payload = { ...data, user_id: userId, created_at: now };
      // Id DÉTERMINISTE (bon + article) → une ré-acceptation OU un retry réseau
      // écrase le même document au lieu d'en créer un doublon (10 distribué =
      // 10 en stock, jamais 60). Sans `_docId`, on retombe sur addDoc (auto-id).
      if (_docId) return setDoc(doc(db, 'mouvements_stock', _docId), payload, { merge: true });
      return addDoc(collection(db, 'mouvements_stock'), payload);
    }));
    return true;
  } catch (err: any) {
    // Session expirée/absente : ce n'est pas un refus métier. On journalise en
    // warn discret (le cache local est conservé) et on invite à se reconnecter,
    // sans l'alerte rouge « Mouvement refusé » qui laisse croire à un bug.
    if (isAuthError(err) || isNoSessionError(err)) {
      logNetworkAware('⚠️ insertMouvements (cache local conservé)', err);
      alert('Session expirée : reconnectez-vous pour synchroniser les mouvements de stock.');
      return false;
    }
    logger.error('❌ insertMouvements:', err.message);
    alert(`Mouvement de stock refusé : ${err.message}`);
    return false;
  }
}

export async function enregistrerDistribution(params: {
  magasinId: string;
  bonReference: string;
  items: Item[];
}): Promise<boolean> {
  return insertMouvements(params.items.map(item => ({
    _docId: `dist_${sanitizeIdPart(params.bonReference)}_${sanitizeIdPart(item.id)}`,
    type: 'distribution', article_id: item.id, quantite: item.quantite,
    magasin_destination: params.magasinId, bon_id: params.bonReference,
    designation: item.designation, produit_type: item.type, prix_vente: item.prixVente,
  })));
}

export async function enregistrerTransfert(params: {
  magasinSource: string;
  magasinDestination: string;
  bonReference: string;
  items: Item[];
}): Promise<boolean> {
  return insertMouvements(params.items.map(item => ({
    _docId: `trf_${sanitizeIdPart(params.bonReference)}_${sanitizeIdPart(item.id)}`,
    type: 'transfert', article_id: item.id, quantite: item.quantite,
    magasin_source: params.magasinSource, magasin_destination: params.magasinDestination,
    bon_id: params.bonReference, designation: item.designation,
    produit_type: item.type, prix_vente: item.prixVente,
  })));
}

/**
 * Enregistre une SORTIE de stock lors d'une vente (décrémente le stock réel).
 * On pose `magasin_source` = magasin vendeur, sans destination : loadStockMagasin
 * soustrait alors la quantité vendue. La clé `article_id` reprend la désignation
 * (même convention que les distributions) pour que la soustraction s'applique.
 */
export async function enregistrerVente(params: {
  magasinId: string;
  bonReference: string;
  items: Item[];
}): Promise<boolean> {
  const rows = params.items.filter(i => i.quantite > 0);
  if (rows.length === 0) return true;
  return insertMouvements(rows.map(item => ({
    _docId: `vte_${sanitizeIdPart(params.bonReference)}_${sanitizeIdPart(item.id)}`,
    type: 'vente', article_id: item.id, quantite: item.quantite,
    magasin_source: params.magasinId, bon_id: params.bonReference,
    designation: item.designation, produit_type: item.type, prix_vente: item.prixVente,
  })));
}

export async function enregistrerRetour(params: {
  magasinId: string;
  bonReference: string;
  items: Item[];
}): Promise<boolean> {
  return insertMouvements(params.items.map(item => ({
    _docId: `ret_${sanitizeIdPart(params.bonReference)}_${sanitizeIdPart(item.id)}`,
    type: 'retour', article_id: item.id, quantite: item.quantite,
    magasin_source: params.magasinId, bon_id: params.bonReference,
    designation: item.designation, produit_type: item.type, prix_vente: item.prixVente,
  })));
}
