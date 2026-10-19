import { logger } from '../utils/logger';
/**
 * Service d'inventaire — Firebase/Firestore
 * Gestion du stock via la collection `mouvements_stock` et `stock_par_magasin`.
 */

import {
  collection, doc, getDocs, setDoc, getDoc, query, where,
} from '../utils/firestoreCompat';
import { db, auth } from '../utils/firebaseClient';
import { logNetworkAware, isAuthError, isNoSessionError } from '../utils/networkErrors';
import { chargerCatalogue, replaceCatalogue } from './catalogueService';

export type { StockMagasin } from './stockLedger';
import { calculerStocks, normaliserMagasin, bonAccepte, type MouvementBrut, type StockMagasin } from './stockLedger';

type Item = {
  id: string;
  type: 'monture' | 'accessoire';
  designation: string;
  quantite: number;
  prixVente: number;
};

/** Normalise les anciens libellés de magasin (ex. « LECLAIRE ABOBO ») vers l'ID métier. */
const normalizeMagasinId = normaliserMagasin;

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
 * Données du calcul : tous les mouvements, tous les bons et le catalogue.
 * Plusieurs écrans demandent le stock en même temps (vente, tableau de bord…) :
 * une seule lecture est faite et partagée pendant 3 secondes.
 */
let chargementEnCours: { promesse: Promise<DonneesStock>; t: number } | null = null;
interface DonneesStock { mouvements: MouvementBrut[]; bons: any[]; catalogue: { montures: any[]; accessoires: any[] } }

async function chargerDonneesStock(): Promise<DonneesStock> {
  if (chargementEnCours && Date.now() - chargementEnCours.t < 3000) return chargementEnCours.promesse;
  const promesse = (async () => {
    const [snapM, bons, montures, accessoires] = await Promise.all([
      getDocs(collection(db, 'mouvements_stock')),
      getDocs(collection(db, 'bons'))
        .then((snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) })))
        .catch((err: any) => { logger.warn('Impossible de lire les bons pour le stock:', err); return []; }),
      chargerCatalogue('catalogue_montures').catch(() => []),
      chargerCatalogue('catalogue_accessoires').catch(() => []),
    ]);
    const mouvements = snapM.docs.map((d: any) => ({ id: d.id, data: d.data() || {} }));
    return { mouvements, bons, catalogue: { montures, accessoires } };
  })();
  chargementEnCours = { promesse, t: Date.now() };
  promesse.catch(() => { chargementEnCours = null; });
  return promesse;
}

/** Le stock vient d'être modifié : le prochain calcul relit la base. */
function oublierDonneesStock() { chargementEnCours = null; }

function memoriserStock(target: string, rows: StockMagasin[]) {
  try {
    const prev = localStorage.getItem(stockCacheKey(target));
    const next = JSON.stringify(rows);
    if (prev !== next) {
      localStorage.setItem(stockCacheKey(target), next);
      window.dispatchEvent(new CustomEvent('leclaire-stock-updated', { detail: { magasinId: target } }));
    }
  } catch { /* quota */ }
}

/**
 * Stock réel d'un magasin, rejoué depuis les mouvements (voir stockLedger.ts).
 * Le résultat est mis en cache localStorage + un événement 'leclaire-stock-updated'
 * est émis pour que les pages abonnées se rafraîchissent AUTOMATIQUEMENT.
 */
export async function loadStockMagasin(magasinId: string): Promise<StockMagasin[]> {
  const target = normalizeMagasinId(magasinId);
  if (!target) return [];
  try {
    const { mouvements, bons, catalogue } = await chargerDonneesStock();
    const rows = calculerStocks(mouvements, bons, catalogue, [target])[target] || [];
    memoriserStock(target, rows);
    return rows;
  } catch (err) {
    logger.error('loadStockMagasin:', err);
    return readStockCache(magasinId);
  }
}

export async function recalculerStockMagasin(magasinId: string): Promise<StockMagasin[]> {
  oublierDonneesStock();
  return loadStockMagasin(magasinId);
}

/** Stock de PLUSIEURS magasins en un seul téléchargement des mouvements. */
export async function loadStocksParMagasin(
  magasinIds: string[],
): Promise<Record<string, StockMagasin[]>> {
  const ids = magasinIds.map(normalizeMagasinId).filter(Boolean);
  try {
    const { mouvements, bons, catalogue } = await chargerDonneesStock();
    const calcul = calculerStocks(mouvements, bons, catalogue, ids);
    const result: Record<string, StockMagasin[]> = {};
    for (const id of ids) {
      result[id] = calcul[id] || [];
      memoriserStock(id, result[id]);
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

export async function recalculerTousLesStocks(): Promise<void> { oublierDonneesStock(); }

/** Un même article sur plusieurs lignes d'un bon ou d'une facture : quantités additionnées. */
function regrouperArticles(items: Item[]): Item[] {
  const parId = new Map<string, Item>();
  for (const item of items) {
    const id = String(item.id ?? '').trim();
    const quantite = Number(item.quantite) || 0;
    if (!id || quantite <= 0) continue;
    const l = parId.get(id);
    if (l) l.quantite += quantite;
    else parId.set(id, { ...item, id, quantite });
  }
  return [...parId.values()];
}

/**
 * Génère un UUID déterministe à partir d'une clé métier.
 *
 * Certaines bases existantes déclarent `mouvements_stock.id` en UUID. Les
 * anciennes versions fabriquaient des IDs du type `vte_FA-0004_ARTICLE`, ce
 * qui provoquait un rejet Postgres alors que la vente, elle, était déjà écrite.
 * Un UUID déterministe reste compatible avec une colonne TEXT comme avec une
 * colonne UUID et conserve l'idempotence entre les retries / appareils.
 */
function stableUuid(key: string): string {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9, h3 = 0x85ebca6b, h4 = 0xc2b2ae35;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
    h3 = Math.imul(h3 ^ c, 3266489917);
    h4 = Math.imul(h4 ^ c, 668265263);
  }
  const hex = [h1, h2, h3, h4].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

/**
 * Vérifie l'existence d'un mouvement métier avant de rejouer une opération.
 * Utilisé notamment pour réparer les anciens bons traités sans mouvement.
 */
export async function mouvementStockExiste(
  type: string,
  bonReference: string,
  magasinId: string,
  articleId: string,
): Promise<boolean> {
  const id = stableUuid(
    `${type}|${bonReference}|${magasinId}|${articleId}`
  );
  return confirmerMouvement(id);
}

async function confirmerMouvement(id: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'mouvements_stock', id));
    return snap.exists();
  } catch {
    return false;
  }
}

async function insertMouvements(rows: any[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const user = await auth.ensureSession();
  if (!user) {
    logNetworkAware('⚠️ insertMouvements — session absente', new Error('NO_SESSION'));
    return false;
  }
  const userId = user.uid;
  const now = new Date().toISOString();
  let dernierErreur: any = null;

  // Une coupure réseau, une réponse perdue ou une erreur partielle ne doit
  // jamais créer de doublon. Chaque ligne possède un UUID métier stable.
  for (let tentative = 1; tentative <= 4; tentative++) {
    try {
      for (const r of rows) {
        const { _docId, ...data } = r;
        const id = _docId || stableUuid(`${data.type}|${data.bon_id || data.reference || ''}|${data.magasin_source || data.magasin_id || ''}|${data.article_id || data.designation || ''}`);
        const magasinId = data.magasin_id || data.magasin_source || data.magasin_destination || null;
        const payload = { ...data, magasin_id: magasinId, user_id: userId, created_at: now };
        await setDoc(doc(db, 'mouvements_stock', id), payload, { merge: true });
        if (!(await confirmerMouvement(id))) {
          throw new Error(`Mouvement ${id} écrit mais non relu après confirmation serveur.`);
        }
      }
      logger.log(`✅ Mouvements de stock confirmés (${rows.length} ligne(s), tentative ${tentative})`);
      oublierDonneesStock();
      return true;
    } catch (err: any) {
      dernierErreur = err;
      if (tentative < 4) {
        const delai = 600 * Math.pow(2, tentative - 1);
        logger.warn(`⚠️ Mouvement de stock non confirmé, nouvelle tentative dans ${delai} ms (${tentative}/4):`, err);
        await new Promise(resolve => setTimeout(resolve, delai));
      }
    }
  }

  const err: any = dernierErreur;
  if (isAuthError(err) || isNoSessionError(err)) {
    logNetworkAware('⚠️ insertMouvements (échec après 4 tentatives)', err);
    return false;
  }
  logger.error('❌ insertMouvements après 4 tentatives:', err?.message || err);
  return false;
}


/**
 * Met à jour le stock GENERAL (magasin central).
 *
 * Règle métier :
 * - distribution vers un magasin  => stock général DIMINUE ;
 * - retour d'un magasin           => stock général AUGMENTE ;
 * - transfert entre magasins      => stock général INCHANGÉ ;
 * - vente en magasin              => stock général INCHANGÉ.
 *
 * Le stock magasin, lui, reste calculé exclusivement à partir des mouvements.
 */
async function ajusterStockGeneral(items: Item[], delta: 1 | -1): Promise<boolean> {
  const groupes = new Map<'monture' | 'accessoire', Item[]>();
  for (const item of items) {
    const type = item.type === 'accessoire' ? 'accessoire' : 'monture';
    const liste = groupes.get(type) || [];
    liste.push(item);
    groupes.set(type, liste);
  }

  try {
    for (const [type, lignes] of groupes) {
      const catType = type === 'accessoire' ? 'catalogue_accessoires' : 'catalogue_montures';
      const catalogue = await chargerCatalogue(catType);
      if (!Array.isArray(catalogue)) {
        throw new Error(`Catalogue général introuvable: ${catType}`);
      }

      const normaliser = (v: unknown) => String(v ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

      const suivant = catalogue.map((produit: any) => ({ ...produit }));
      for (const ligne of lignes) {
        const id = String(ligne.id ?? '').trim();
        const designation = normaliser(ligne.designation);
        const index = suivant.findIndex((p: any) =>
          (id && String(p?.id ?? '').trim() === id) ||
          (!id && designation && normaliser(
            type === 'monture'
              ? `${p?.marque || ''} - ${p?.reference || ''}`
              : `${p?.marque || ''} - ${p?.designation || ''}`
          ) === designation) ||
          (designation && normaliser(
            type === 'monture'
              ? `${p?.marque || ''} - ${p?.reference || ''}`
              : `${p?.marque || ''} - ${p?.designation || ''}`
          ) === designation)
        );

        if (index < 0) {
          logger.warn(`⚠️ Produit absent du stock général: ${ligne.designation} (${id})`);
          continue;
        }

        const actuel = Number(suivant[index]?.stock) || 0;
        const quantite = Math.max(0, Number(ligne.quantite) || 0);
        const nouveau = actuel + (delta * quantite);

        if (nouveau < 0) {
          throw new Error(
            `Stock général insuffisant pour "${ligne.designation}" : ${actuel} disponible, ${quantite} demandé(s).`
          );
        }
        suivant[index].stock = nouveau;
      }

      await replaceCatalogue(catType, suivant);
    }

    return true;
  } catch (err) {
    logger.error('❌ ajusterStockGeneral:', err);
    return false;
  }
}

/**
 * Identifiant d'un mouvement lié à un bon : l'IDENTIFIANT du bon, et non son
 * numéro. Deux bons portant le même numéro (« 00001 » par défaut) restent deux
 * bons distincts : avant, le second était pris pour un doublon et ignoré.
 */
const idMouvementBon = (type: string, bonId: string, magasins: string, article: string) =>
  stableUuid(`${type}|uid:${bonId}|${magasins}|${article}`);
/** Ancien identifiant (numéro du bon) : sert à ne pas rejouer un bon déjà appliqué. */
const ancienIdMouvement = (type: string, reference: string, magasins: string, article: string) =>
  stableUuid(`${type}|${reference}|${magasins}|${article}`);

/**
 * Le bon a-t-il déjà été appliqué au stock pour cet article ? Oui si son
 * mouvement existe ; ou si un mouvement d'une ancienne version existe sous son
 * numéro et qu'aucun AUTRE bon validé ne porte ce numéro pour ce magasin.
 */
async function dejaApplique(
  type: 'distribution' | 'retour' | 'transfert', bonId: string | undefined, reference: string,
  magasinsCle: string, ancienneCle: string, article: string, champMagasin: 'magasin_destination' | 'magasin_source', magasin: string,
): Promise<boolean> {
  if (bonId && await confirmerMouvement(idMouvementBon(type, bonId, magasinsCle, article))) return true;
  if (!(await confirmerMouvement(ancienIdMouvement(type, reference, ancienneCle, article)))) return false;
  if (!bonId) return true;
  try {
    const snap = await getDocs(query(collection(db, 'bons'), where('numero', '==', reference)));
    const autres = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) })).filter((b: any) =>
      String(b.id) !== String(bonId) && String(b.type || '').toLowerCase() === type
      && normalizeMagasinId(b[champMagasin]) === magasin && bonAccepte(b.statut));
    return autres.length === 0;
  } catch {
    return true; // dans le doute, on ne compte pas deux fois
  }
}

export async function enregistrerDistribution(params: {
  magasinId: string;
  bonReference: string;
  /** Identifiant du bon (unique, contrairement au numéro). */
  bonId?: string;
  items: Item[];
}): Promise<boolean> {
  const mag = normalizeMagasinId(params.magasinId);
  const rows = regrouperArticles(params.items);
  if (rows.length === 0) return true;

  // Idempotence forte : si le mouvement existe déjà (double-clic, retry réseau,
  // réouverture du bon), on ne le réécrit pas et surtout on ne redéduit pas le
  // stock central. Seules les nouvelles lignes sont prises en compte.
  const nouvellesLignes: Item[] = [];
  for (const item of rows) {
    const existe = await dejaApplique('distribution', params.bonId, params.bonReference, mag, mag, item.id, 'magasin_destination', mag);
    if (!existe) nouvellesLignes.push(item);
  }
  if (nouvellesLignes.length === 0) return true;

  const maintenant = new Date().toISOString();
  const mouvementOk = await insertMouvements(nouvellesLignes.map(item => ({
    _docId: params.bonId
      ? idMouvementBon('distribution', params.bonId, mag, item.id)
      : ancienIdMouvement('distribution', params.bonReference, mag, item.id),
    type: 'distribution', article_id: item.id, quantite: item.quantite,
    magasin_id: mag, magasin_destination: mag, bon_id: params.bonReference, bon_uid: params.bonId || null,
    designation: item.designation, produit_type: item.type, prix_vente: item.prixVente, date_mouvement: maintenant,
  })));
  if (!mouvementOk) return false;

  // Une distribution sort du stock central et entre dans le magasin.
  // On ne déduit le central que pour les lignes nouvellement créées.
  return ajusterStockGeneral(nouvellesLignes, -1);
}

export async function enregistrerTransfert(params: {
  magasinSource: string;
  magasinDestination: string;
  bonReference: string;
  bonId?: string;
  items: Item[];
}): Promise<boolean> {
  const source = normalizeMagasinId(params.magasinSource);
  const destination = normalizeMagasinId(params.magasinDestination);
  const rows = regrouperArticles(params.items);
  if (rows.length === 0) return true;
  const maintenant = new Date().toISOString();
  return insertMouvements(rows.map(item => ({
    _docId: params.bonId
      ? idMouvementBon('transfert', params.bonId, `${source}|${destination}`, item.id)
      : ancienIdMouvement('transfert', params.bonReference, `${source}|${destination}`, item.id),
    type: 'transfert', article_id: item.id, quantite: item.quantite,
    magasin_id: source, magasin_source: source, magasin_destination: destination,
    bon_id: params.bonReference, bon_uid: params.bonId || null, designation: item.designation,
    produit_type: item.type, prix_vente: item.prixVente, date_mouvement: maintenant,
  })));
}

/**
 * Enregistre la SORTIE de stock d'une vente (magasin vendeur = `magasin_source`).
 * Un même article sur deux lignes est additionné. Facture MODIFIÉE : un article
 * retiré de la facture est remis à zéro (il revient donc en stock).
 */
export async function enregistrerVente(params: {
  magasinId: string;
  bonReference: string;
  items: Item[];
  /** Date de la vente (ordre chronologique du stock). */
  date?: string;
}): Promise<boolean> {
  const mag = normalizeMagasinId(params.magasinId);
  const num = String(params.bonReference || '').trim();
  const rows = regrouperArticles(params.items);
  const date = params.date || new Date().toISOString();
  const ok = await insertMouvements(rows.map(item => ({
    _docId: stableUuid(`vente|${num}|${mag}|${item.id}`),
    type: 'vente', article_id: item.id, quantite: item.quantite,
    magasin_id: mag, magasin_source: mag, bon_id: num,
    designation: item.designation, produit_type: item.type, prix_vente: item.prixVente, date_mouvement: date,
  })));
  if (!ok || !num) return ok;
  // Articles retirés de la facture depuis le dernier enregistrement.
  try {
    const ids = new Set(rows.map(r => r.id));
    const snap = await getDocs(query(collection(db, 'mouvements_stock'), where('bon_id', '==', num)));
    for (const d of snap.docs as any[]) {
      const r = d.data() || {};
      if (r.type !== 'vente' || normalizeMagasinId(r.magasin_source) !== mag) continue;
      if (ids.has(String(r.article_id || '').trim()) || !(Number(r.quantite) > 0)) continue;
      await setDoc(doc(db, 'mouvements_stock', d.id), { quantite: 0, updated_at: new Date().toISOString() }, { merge: true });
    }
    oublierDonneesStock();
  } catch (err) {
    logger.warn('Contrôle des articles retirés de la facture impossible:', err);
  }
  return true;
}

/**
 * Facture supprimée : les montures / accessoires vendus REVIENNENT en stock.
 *
 * On ne supprime pas la sortie d'origine (traçabilité) : on ajoute une entrée
 * « annulation_vente » ; le calcul du stock remet exactement ce que la vente
 * avait retiré. Identifiant déterministe : un double-clic ne remet jamais deux
 * fois le même article en stock.
 */
export async function annulerSortiesVente(magasinId: string, numFacture: string): Promise<boolean> {
  const mag = normalizeMagasinId(magasinId);
  const num = String(numFacture || '').trim();
  if (!mag || !num) return true;
  try {
    const snap = await getDocs(query(collection(db, 'mouvements_stock'), where('bon_id', '==', num)));
    const sorties = snap.docs
      .map((d: any) => d.data() || {})
      .filter((r: any) => r.type === 'vente' && normalizeMagasinId(r.magasin_source) === mag
        && (Number(r.quantite) || 0) > 0);
    if (sorties.length === 0) return true;
    const ok = await insertMouvements(sorties.map((r: any) => {
      const article = r.article_id || r.designation;
      return {
        _docId: stableUuid(`annulation_vente|${num}|${mag}|${article}`),
        type: 'annulation_vente', article_id: article, quantite: Number(r.quantite) || 0,
        magasin_id: mag, magasin_destination: mag, bon_id: num,
        designation: r.designation || article, produit_type: r.produit_type, prix_vente: r.prix_vente,
        date_mouvement: new Date().toISOString(),
      };
    }));
    if (ok) await loadStockMagasin(mag);
    return ok;
  } catch (err) {
    logger.error('❌ annulerSortiesVente:', err);
    return false;
  }
}

/**
 * Bon de retour : la monture SORT du magasin et revient au stock central.
 * Idempotent : un bon déjà appliqué (même validé deux fois, par le magasin
 * puis par l'administration) ne retire jamais deux fois.
 */
export async function enregistrerRetour(params: {
  magasinId: string;
  bonReference: string;
  bonId?: string;
  items: Item[];
}): Promise<boolean> {
  const mag = normalizeMagasinId(params.magasinId);
  const rows = regrouperArticles(params.items);
  if (rows.length === 0) return true;

  const nouvellesLignes: Item[] = [];
  for (const item of rows) {
    const existe = await dejaApplique('retour', params.bonId, params.bonReference, mag, mag, item.id, 'magasin_source', mag);
    if (!existe) nouvellesLignes.push(item);
  }
  if (nouvellesLignes.length === 0) return true;

  const maintenant = new Date().toISOString();
  const mouvementOk = await insertMouvements(nouvellesLignes.map(item => ({
    _docId: params.bonId
      ? idMouvementBon('retour', params.bonId, mag, item.id)
      : ancienIdMouvement('retour', params.bonReference, mag, item.id),
    type: 'retour', article_id: item.id, quantite: item.quantite,
    magasin_id: mag, magasin_source: mag, bon_id: params.bonReference, bon_uid: params.bonId || null,
    designation: item.designation, produit_type: item.type, prix_vente: item.prixVente, date_mouvement: maintenant,
  })));
  if (!mouvementOk) return false;

  // Un retour sort du magasin et revient au stock central.
  return ajusterStockGeneral(nouvellesLignes, 1);
}

/**
 * INVENTAIRE : chaque article compté prend, à la date de l'inventaire, la
 * quantité PHYSIQUE trouvée dans le magasin ; les ventes, bons… postérieurs
 * s'appliquent ensuite normalement. Un même article compté sur plusieurs
 * lignes (vitrine + réserve) : quantités additionnées. Inventaire modifié :
 * les nouvelles quantités remplacent les anciennes ; article retiré de
 * l'inventaire : son ajustement est annulé.
 */
export async function enregistrerInventaire(params: {
  inventaireId: string;
  magasinId: string;
  /** Moment du comptage (date de création de l'inventaire). */
  date: string;
  items: Array<{ articleId: string; designation: string; stockTheorique: number; stockPhysique: number }>;
}): Promise<boolean> {
  const mag = normalizeMagasinId(params.magasinId);
  const invId = String(params.inventaireId || '').trim();
  if (!mag || !invId) return false;
  const parArticle = new Map<string, { designation: string; theorique: number; physique: number }>();
  for (const it of params.items || []) {
    const article = String(it.articleId || it.designation || '').trim();
    if (!article) continue;
    const l = parArticle.get(article);
    if (l) l.physique += Math.max(0, Number(it.stockPhysique) || 0);
    else parArticle.set(article, { designation: it.designation || article, theorique: Number(it.stockTheorique) || 0, physique: Math.max(0, Number(it.stockPhysique) || 0) });
  }
  const ok = await insertMouvements([...parArticle.entries()].map(([article, l]) => ({
    _docId: stableUuid(`inventaire|${invId}|${mag}|${article}`),
    type: 'inventaire', article_id: article, designation: l.designation, quantite: 0,
    stock_theorique: l.theorique, stock_physique: l.physique, ecart: l.physique - l.theorique,
    magasin_id: mag, magasin_destination: mag, bon_id: invId, date_mouvement: params.date, annule: false,
  })));
  if (!ok) return false;
  return annulerLignesInventaire(invId, new Set(parArticle.keys()));
}

/** Inventaire supprimé : ses ajustements sont annulés (le stock redevient celui calculé). */
export function annulerInventaire(inventaireId: string): Promise<boolean> {
  return annulerLignesInventaire(String(inventaireId || '').trim(), new Set());
}

async function annulerLignesInventaire(invId: string, garder: Set<string>): Promise<boolean> {
  if (!invId) return true;
  try {
    const snap = await getDocs(query(collection(db, 'mouvements_stock'), where('bon_id', '==', invId)));
    for (const d of snap.docs as any[]) {
      const r = d.data() || {};
      if (r.type !== 'inventaire' || r.annule || garder.has(String(r.article_id || '').trim())) continue;
      await setDoc(doc(db, 'mouvements_stock', d.id), { annule: true, updated_at: new Date().toISOString() }, { merge: true });
    }
    oublierDonneesStock();
    return true;
  } catch (err) {
    logger.error('❌ Annulation des ajustements d\'inventaire:', err);
    return false;
  }
}

/**
 * Ventes enregistrées SANS sortie de stock (devis converti en facture avec une
 * ancienne version, coupure réseau…) : la sortie manquante est écrite. Les
 * ventes importées de l'ancien logiciel sont ignorées. Sans risque : le calcul
 * ne descend jamais sous zéro et ne compte jamais deux fois une vente.
 */
export async function reparerSortiesVentes(magasinId: string, ventes: any[]): Promise<number> {
  const mag = normalizeMagasinId(magasinId);
  if (!mag) return 0;
  const { mouvements } = await chargerDonneesStock();
  const facturesAvecSortie = new Set(mouvements
    .filter(m => m.data?.type === 'vente' && normalizeMagasinId(m.data?.magasin_source) === mag)
    .map(m => String(m.data?.bon_id || '').trim()));
  let reparees = 0;
  for (const v of ventes || []) {
    const num = String(v?.recap?.numFacture || '').trim();
    if (!num || facturesAvecSortie.has(num)) continue;
    if ((v?.type || 'vente') !== 'vente' || v?.recap?.imported || String(v?.statut || '').toLowerCase() === 'devis') continue;
    const items = (Array.isArray(v?.articles) ? v.articles : [])
      .filter((a: any) => a?.type === 'monture' || a?.type === 'accessoire')
      .map((a: any) => ({
        id: String(a.produitId || a.designation || '').trim(),
        type: a.type as 'monture' | 'accessoire',
        designation: String(a.designation || '').trim(),
        quantite: parseFloat(a.quantite) || 0,
        prixVente: parseFloat(a.prix) || 0,
      }))
      .filter((a: Item) => a.id && a.quantite > 0);
    if (items.length === 0) continue;
    if (await enregistrerVente({ magasinId: mag, bonReference: num, items, date: v.date || v.created_at })) {
      reparees++;
      facturesAvecSortie.add(num);
    }
  }
  if (reparees) logger.log(`✅ ${reparees} vente(s) sans sortie de stock réparée(s) pour ${mag}`);
  return reparees;
}
