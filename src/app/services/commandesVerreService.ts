/**
 * COMMANDES DE VERRE (Atelier → « Commande de verre »).
 *
 * Parcours :
 *   1. Le magasin (conseillère, opticien) passe la commande : verres + ordonnance
 *      du client → statut « Envoyée » ; elle apparaît dans « Réception commande ».
 *   2. L'assistante administrative la CONFIRME → statut « En attente » : le
 *      magasin voit « En attente ».
 *   3. Elle clique sur « Verre arrivé » → statut « Arrivée » : le magasin voit
 *      « Commande arrivée », reçoit un message et l'icône clignote dans la barre
 *      du haut jusqu'à ce qu'il ouvre ses commandes.
 *
 * Stockage : table `bons` (déjà partagée entre magasins, mêmes règles d'accès
 * que les bons de distribution : chaque magasin voit les siennes,
 * l'administration toutes), type `commande_verre`, magasin dans
 * `magasin_source`. L'ordonnance (photo compressée ou PDF) va dans le STOCKAGE
 * de fichiers Supabase (espace privé « ordonnances »,
 * STOCKAGE_ORDONNANCES_2026-10-28.sql) : la base de données ne la contient pas.
 * Stockage pas encore installé : repli sur une ligne à part de la table `bons`
 * (type `ordonnance_verre`), comme les toutes premières commandes. Dans les deux
 * cas, les listes ne téléchargent jamais les fichiers, seulement à l'ouverture.
 */
import {
  collection, doc, getDoc, getDocs, query, setDoc, where,
} from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { attribuerNumero } from '../utils/autoNumbers';
import { magasinCanonique } from '../constants/magasins';
import { logger } from '../utils/logger';

export const TYPE_COMMANDE_VERRE = 'commande_verre';
export const TYPE_ORDONNANCE_VERRE = 'ordonnance_verre';
export const EVENEMENT_COMMANDES_VERRE = 'commandes-verre-updated';

/** Statuts, dans l'ordre du parcours. */
export const STATUT_ENVOYEE = 'Envoyée';
export const STATUT_EN_ATTENTE = 'En attente';
export const STATUT_ARRIVEE = 'Arrivée';
export type StatutCommandeVerre = typeof STATUT_ENVOYEE | typeof STATUT_EN_ATTENTE | typeof STATUT_ARRIVEE;

/** Rôles qui reçoivent, confirment et signalent l'arrivée des commandes. */
export const ROLES_RECEPTION_VERRE = ['super_admin', 'admin', 'administrateur', 'assistante_admin'];

export interface LigneVerre {
  oeil: 'OD' | 'OG';
  typeVerre: string;
  verre: string;
  traitement: string;
  matiere: string;
  sphere: string;
  cylindre: string;
  axe: string;
  addition: string;
  diametre: string;
  quantite: number;
}

export interface OrdonnanceInfo {
  nom: string;
  type: string;
  taille: number;
  /** Chemin dans l'espace de stockage « ordonnances » (absent : fichier rangé dans la base). */
  chemin?: string;
}

/** Espace de stockage Supabase des ordonnances (privé). */
export const ESPACE_ORDONNANCES = 'ordonnances';

export interface CommandeVerre {
  id: string;
  numero: string;
  date: string;
  /** Identifiant du magasin demandeur (MAJUSCULES). */
  magasinId: string;
  magasinLabel: string;
  client: string;
  telephone: string;
  numeroFacture: string;
  fournisseur: string;
  verres: LigneVerre[];
  observations: string;
  ordonnance: OrdonnanceInfo | null;
  statut: StatutCommandeVerre;
  creePar: string;
  dateConfirmation?: string;
  confirmePar?: string;
  dateArrivee?: string;
  arriveePar?: string;
  /** Le magasin a vu l'arrivée (l'icône cesse de clignoter). */
  arriveeVue?: boolean;
  arriveeVueLe?: string;
}

/** Libellé du statut tel que le voit le MAGASIN demandeur. */
export function libelleStatutMagasin(statut: string): string {
  if (statut === STATUT_ARRIVEE) return 'Commande arrivée';
  if (statut === STATUT_EN_ATTENTE) return 'En attente';
  return 'Envoyée (à confirmer)';
}

/** Libellé du statut tel que le voit la RÉCEPTION (assistante administrative). */
export function libelleStatutReception(statut: string): string {
  if (statut === STATUT_ARRIVEE) return 'Verre arrivé';
  if (statut === STATUT_EN_ATTENTE) return 'Confirmée — en attente du verre';
  return 'À confirmer';
}

// ── Conversion ligne `bons` ↔ commande ──────────────────────────────────────

function versLigne(c: CommandeVerre) {
  return {
    id: c.id,
    type: TYPE_COMMANDE_VERRE,
    numero: c.numero,
    date: c.date,
    magasin_source: c.magasinId,
    magasin_destination: null,
    responsable: c.creePar || null,
    items: c.verres,
    statut: c.statut,
    observations: c.observations || null,
    valide_par: c.confirmePar || null,
    data: {
      magasinLabel: c.magasinLabel,
      client: c.client,
      telephone: c.telephone,
      numeroFacture: c.numeroFacture,
      fournisseur: c.fournisseur,
      ordonnance: c.ordonnance,
      creePar: c.creePar,
      dateConfirmation: c.dateConfirmation || null,
      confirmePar: c.confirmePar || null,
      dateArrivee: c.dateArrivee || null,
      arriveePar: c.arriveePar || null,
      arriveeVue: !!c.arriveeVue,
      arriveeVueLe: c.arriveeVueLe || null,
    },
  };
}

/** Ligne lue (colonnes + `data` remis à plat par la couche d'accès) → commande. */
export function depuisLigne(r: any): CommandeVerre {
  const d = r?.data && typeof r.data === 'object' ? { ...r.data, ...r } : (r || {});
  const statut = [STATUT_ENVOYEE, STATUT_EN_ATTENTE, STATUT_ARRIVEE].includes(d.statut) ? d.statut : STATUT_ENVOYEE;
  return {
    id: String(d.id),
    numero: String(d.numero || ''),
    date: String(d.date || d.created_at || ''),
    magasinId: String(d.magasin_source || '').toUpperCase(),
    magasinLabel: String(d.magasinLabel || d.magasin_source || ''),
    client: String(d.client || ''),
    telephone: String(d.telephone || ''),
    numeroFacture: String(d.numeroFacture || ''),
    fournisseur: String(d.fournisseur || ''),
    verres: Array.isArray(d.items) ? d.items : [],
    observations: String(d.observations || ''),
    ordonnance: d.ordonnance || null,
    statut,
    creePar: String(d.creePar || d.responsable || ''),
    dateConfirmation: d.dateConfirmation || undefined,
    confirmePar: d.confirmePar || d.valide_par || undefined,
    dateArrivee: d.dateArrivee || undefined,
    arriveePar: d.arriveePar || undefined,
    arriveeVue: !!d.arriveeVue,
    arriveeVueLe: d.arriveeVueLe || undefined,
  };
}

function prevenir() {
  try { window.dispatchEvent(new CustomEvent(EVENEMENT_COMMANDES_VERRE)); } catch { /* hors navigateur */ }
}

// ── Lecture ─────────────────────────────────────────────────────────────────

/**
 * Commandes de verre, les plus récentes d'abord. `magasinId` : celles de ce
 * magasin seulement ; absent : toutes celles que le compte peut voir.
 * Lève une erreur si la base ne répond pas.
 */
export async function chargerCommandesVerre(magasinId?: string): Promise<CommandeVerre[]> {
  const filtres = [where('type', '==', TYPE_COMMANDE_VERRE)];
  const mag = magasinId ? magasinCanonique(magasinId) : '';
  if (mag) filtres.push(where('magasin_source', '==', mag));
  const snap = await getDocs(query(collection(db, 'bons'), ...filtres));
  return snap.docs
    .map((d: any) => depuisLigne({ id: d.id, ...(d.data() || {}) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Commandes arrivées que le magasin n'a pas encore vues (icône clignotante). */
export function arriveesNonVues(commandes: CommandeVerre[]): CommandeVerre[] {
  return commandes.filter(c => c.statut === STATUT_ARRIVEE && !c.arriveeVue);
}

// ── Écriture ────────────────────────────────────────────────────────────────

// Chaque écriture envoie la commande COMPLÈTE (pas de fusion avec l'ancienne ligne).
async function enregistrer(c: CommandeVerre): Promise<void> {
  await setDoc(doc(db, 'bons', c.id), { ...versLigne(c), updated_at: new Date().toISOString() });
  prevenir();
}

const idOrdonnance = (commandeId: string) => `ordonnance-${commandeId}`;

/** Fichier d'ordonnance prêt à être enregistré (déjà compressé). */
export interface FichierOrdonnance { nom: string; type: string; contenu: string }

/** Ordonnance relue pour l'affichage. */
export interface OrdonnanceLue { nom: string; type: string; blob: Blob }

const versBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();
const extension = (type: string) => (type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg');

/**
 * Dépose l'ordonnance dans l'espace de stockage « ordonnances ». Renvoie son
 * chemin, ou null si le stockage n'est pas disponible (script pas encore
 * exécuté, droits) : l'appelant la range alors dans la base, la commande
 * n'est jamais bloquée.
 */
async function deposerOrdonnance(magasinId: string, commandeId: string, f: FichierOrdonnance): Promise<string | null> {
  try {
    const { supabase } = await import('../utils/supabaseClient');
    const chemin = `${magasinId}/${commandeId}/ordonnance.${extension(f.type)}`;
    const { error } = await supabase.storage.from(ESPACE_ORDONNANCES)
      .upload(chemin, await versBlob(f.contenu), { contentType: f.type || 'application/octet-stream', upsert: true });
    if (error) throw error;
    return chemin;
  } catch (err: any) {
    logger.warn("Stockage des ordonnances indisponible (STOCKAGE_ORDONNANCES_2026-10-28.sql) — ordonnance rangée dans la base :", err?.message || err);
    return null;
  }
}

/**
 * Passe une commande (bouton « COMMANDER ») : l'ordonnance est enregistrée
 * d'abord, puis la commande, au statut « Envoyée ».
 */
export async function passerCommandeVerre(params: {
  magasinId: string;
  magasinLabel: string;
  client: string;
  telephone?: string;
  numeroFacture?: string;
  fournisseur?: string;
  verres: LigneVerre[];
  observations?: string;
  ordonnance: FichierOrdonnance;
  creePar: string;
}): Promise<CommandeVerre> {
  const magasinId = magasinCanonique(params.magasinId);
  if (!magasinId) throw new Error('Magasin demandeur inconnu.');
  if (!params.client.trim()) throw new Error('Le nom du client est obligatoire.');
  if (!params.verres.length) throw new Error('Indiquez au moins un verre à commander.');
  if (!params.ordonnance?.contenu) throw new Error("L'ordonnance du client est obligatoire.");
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const numero = await attribuerNumero('commande_verre');
  const maintenant = new Date().toISOString();
  // L'ordonnance d'abord : dans le stockage de fichiers, sinon dans la base.
  const chemin = await deposerOrdonnance(magasinId, id, params.ordonnance);
  if (!chemin) {
    await setDoc(doc(db, 'bons', idOrdonnance(id)), {
      id: idOrdonnance(id),
      type: TYPE_ORDONNANCE_VERRE,
      numero,
      date: maintenant,
      magasin_source: magasinId,
      magasin_destination: null,
      items: [],
      statut: null,
      data: { commandeId: id, nom: params.ordonnance.nom, typeFichier: params.ordonnance.type, contenu: params.ordonnance.contenu },
      updated_at: maintenant,
    });
  }
  const commande: CommandeVerre = {
    id,
    numero,
    date: maintenant,
    magasinId,
    magasinLabel: params.magasinLabel,
    client: params.client.trim(),
    telephone: (params.telephone || '').trim(),
    numeroFacture: (params.numeroFacture || '').trim(),
    fournisseur: (params.fournisseur || '').trim(),
    verres: params.verres,
    observations: (params.observations || '').trim(),
    ordonnance: {
      nom: params.ordonnance.nom,
      type: params.ordonnance.type,
      // Taille réelle du fichier (le contenu est en base64 : 4 caractères = 3 octets).
      taille: Math.round(((params.ordonnance.contenu.split(',')[1] || '').length * 3) / 4),
      ...(chemin ? { chemin } : {}),
    },
    statut: STATUT_ENVOYEE,
    creePar: params.creePar,
  };
  await enregistrer(commande);
  return commande;
}

/** Assistante administrative : commande confirmée → le magasin voit « En attente ». */
export async function confirmerCommandeVerre(c: CommandeVerre, par: string): Promise<CommandeVerre> {
  if (c.statut !== STATUT_ENVOYEE) return c;
  const maj = { ...c, statut: STATUT_EN_ATTENTE as StatutCommandeVerre, dateConfirmation: new Date().toISOString(), confirmePar: par };
  await enregistrer(maj);
  return maj;
}

/** Assistante administrative : verre arrivé → le magasin voit « Commande arrivée » et est prévenu. */
export async function signalerArriveeVerre(c: CommandeVerre, par: string): Promise<CommandeVerre> {
  if (c.statut === STATUT_ARRIVEE) return c;
  const maj = {
    ...c,
    statut: STATUT_ARRIVEE as StatutCommandeVerre,
    dateConfirmation: c.dateConfirmation || new Date().toISOString(),
    confirmePar: c.confirmePar || par,
    dateArrivee: new Date().toISOString(),
    arriveePar: par,
    arriveeVue: false,
  };
  await enregistrer(maj);
  return maj;
}

/** Le magasin a vu ses commandes arrivées : l'icône cesse de clignoter (pour tout le magasin). */
export async function marquerArriveesVues(commandes: CommandeVerre[]): Promise<void> {
  const aMarquer = arriveesNonVues(commandes);
  if (!aMarquer.length) return;
  const le = new Date().toISOString();
  for (const c of aMarquer) {
    await setDoc(doc(db, 'bons', c.id), { ...versLigne({ ...c, arriveeVue: true, arriveeVueLe: le }), updated_at: le });
  }
  prevenir();
}

/**
 * Ordonnance de la commande (chargée seulement quand on l'ouvre) : depuis le
 * stockage de fichiers, ou depuis la base pour les commandes passées avant son
 * installation. Lève une erreur si le fichier existe mais ne peut pas être lu.
 */
export async function lireOrdonnance(c: Pick<CommandeVerre, 'id' | 'ordonnance'>): Promise<OrdonnanceLue | null> {
  const chemin = c.ordonnance?.chemin;
  if (chemin) {
    const { supabase } = await import('../utils/supabaseClient');
    const { data, error } = await supabase.storage.from(ESPACE_ORDONNANCES).download(chemin);
    if (error || !data) throw new Error(`Ordonnance illisible dans le stockage : ${error?.message || 'fichier absent'}`);
    const type = c.ordonnance?.type || data.type || '';
    return { nom: c.ordonnance?.nom || chemin.split('/').pop() || 'ordonnance', type, blob: type && data.type !== type ? new Blob([data], { type }) : data };
  }
  const snap = await getDoc(doc(db, 'bons', idOrdonnance(c.id)));
  if (!snap.exists()) return null;
  const r: any = snap.data() || {};
  const d = r.data && typeof r.data === 'object' ? { ...r.data, ...r } : r;
  if (!d.contenu) return null;
  return { nom: String(d.nom || 'ordonnance'), type: String(d.typeFichier || ''), blob: await versBlob(String(d.contenu)) };
}

// ── Préparation du fichier d'ordonnance ─────────────────────────────────────

/** Taille maximale d'un PDF d'ordonnance (les photos sont, elles, réduites). */
export const TAILLE_MAX_PDF = 1.5 * 1024 * 1024;

const lireEnDataUrl = (f: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(r.error || new Error('Lecture du fichier impossible.'));
  r.readAsDataURL(f);
});

/**
 * Photo d'ordonnance réduite (1 400 px au plus, JPEG) : quelques centaines de
 * Ko au lieu de plusieurs Mo, lisible, et sans remplir la base de données.
 */
async function compresserImage(fichier: File): Promise<string> {
  const source = await lireEnDataUrl(fichier);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image d'ordonnance illisible."));
    i.src = source;
  });
  const MAX = 1400;
  const echelle = Math.min(1, MAX / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * echelle));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * echelle));
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', 0.72);
  return jpeg.length < source.length ? jpeg : source;
}

/** Prépare le fichier choisi (photo réduite ou PDF) ; lève une erreur explicite sinon. */
export async function preparerOrdonnance(fichier: File): Promise<FichierOrdonnance> {
  const type = fichier.type || '';
  if (type.startsWith('image/')) {
    const contenu = await compresserImage(fichier);
    return { nom: fichier.name.replace(/\.[^.]+$/, '') + '.jpg', type: contenu.startsWith('data:image/jpeg') ? 'image/jpeg' : type, contenu };
  }
  if (type === 'application/pdf' || /\.pdf$/i.test(fichier.name)) {
    if (fichier.size > TAILLE_MAX_PDF) {
      throw new Error(`PDF trop lourd (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, 1,5 Mo au plus). Prenez plutôt une photo de l'ordonnance.`);
    }
    return { nom: fichier.name, type: 'application/pdf', contenu: await lireEnDataUrl(fichier) };
  }
  throw new Error("Format non pris en charge : choisissez une photo (JPG, PNG…) ou un PDF de l'ordonnance.");
}
