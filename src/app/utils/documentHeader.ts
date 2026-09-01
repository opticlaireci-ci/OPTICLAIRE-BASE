/**
 * En-tête partagé pour TOUS les documents (PDF, Excel, impression).
 *
 * - Sans magasinId  → informations de la DIRECTION (siège de l'enseigne).
 * - Avec magasinId  → nom + coordonnées du magasin concerné
 *   (ex : « <ENSEIGNE> ABOBO » + adresse/téléphone/email du magasin).
 *
 * Le logo (src/imports/image-1.png) est préchargé et converti en dataURL
 * pour pouvoir être inséré dans les PDF jsPDF.
 */

import { jsPDF } from 'jspdf';
import logoUrl from '../../imports/image-1.png';
import { getMagasinById, getMagasinLabel } from '../constants/magasins';
import { TENANT } from '../config/tenant';

// ── Correctif GLOBAL d'affichage des montants dans les PDF ────────────────────
// `Number.toLocaleString('fr-FR')` sépare les milliers par une espace INSÉCABLE
// ÉTROITE (U+202F / U+00A0). Les polices standard de jsPDF ne connaissent pas ce
// caractère et l'affichent comme une BARRE VERTICALE (« 1|000 FCFA »).
// On corrige une fois pour toutes en remplaçant ces espaces par une espace
// normale dans TOUT texte écrit dans un PDF (y compris via jspdf-autotable, qui
// passe par doc.text en interne).
const ESPACES_PDF = /[\u00a0\u202f\u2007\u2009\u2060]/g;
const nettoyerTextePdf = (t: any): any => {
  if (typeof t === 'string') return t.replace(ESPACES_PDF, ' ');
  if (Array.isArray(t)) return t.map(nettoyerTextePdf);
  return t;
};
if (!(jsPDF as any).__patchEspaces) {
  (jsPDF as any).__patchEspaces = true;
  const proto: any = (jsPDF as any).API || (jsPDF as any).prototype;
  if (proto && typeof proto.text === 'function') {
    const originalText = proto.text;
    proto.text = function (this: any, text: any, ...rest: any[]) {
      return originalText.call(this, nettoyerTextePdf(text), ...rest);
    };
  }
}

// ── Informations de la DIRECTION ─────────────────────────────────────────────
// DÉRIVÉES des réglages de l'enseigne : voir src/app/config/tenant.ts.
export const DIRECTION_INFO = {
  nom: TENANT.nom,
  adresse: TENANT.siege.adresse,
  telephone: TENANT.siege.telephone,
  email: TENANT.siege.email,
  ville: TENANT.siege.ville,
};

export interface EnteteInfo {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  ville: string;
}

/**
 * Retourne les informations d'en-tête :
 * - direction si `magasinId` est vide/absent
 * - sinon les infos du magasin (avec repli sur la direction si un champ manque)
 */
export function getEntete(magasinId?: string): EnteteInfo {
  if (!magasinId) return { ...DIRECTION_INFO };
  const magasin = getMagasinById(magasinId);
  return {
    nom: magasin?.label || getMagasinLabel(magasinId),
    adresse: magasin?.adresse || DIRECTION_INFO.adresse,
    telephone: magasin?.telephone || DIRECTION_INFO.telephone,
    email: magasin?.email || DIRECTION_INFO.email,
    ville: DIRECTION_INFO.ville,
  };
}

// ── Préchargement du logo pour les PDF ───────────────────────────────────────
let logoDataURL = '';
let logoRatio = 2.5; // largeur / hauteur par défaut

function preloadLogo() {
  try {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        logoRatio = img.naturalWidth / img.naturalHeight;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        logoDataURL = canvas.toDataURL('image/png');
      } catch { /* canvas indisponible */ }
    };
    img.src = logoUrl;
  } catch { /* environnement sans DOM */ }
}
if (typeof window !== 'undefined') preloadLogo();

/** URL du logo (utilisable directement dans une balise <img> d'impression). */
export function getLogoUrl(): string {
  return logoUrl;
}

/** Date longue en français, ex. « 08 juillet 2026 ». */
export function frLongDate(date?: string): string {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ── En-tête PDF (jsPDF) ──────────────────────────────────────────────────────
/**
 * Dessine l'en-tête (style reçu de l'enseigne) dans un document jsPDF :
 * nom en gros gras noir + coordonnées à GAUCHE, logo à DROITE.
 * Retourne la position Y (mm) où le contenu suivant peut commencer.
 */
export function pdfHeader(doc: any, magasinId?: string, opts?: { date?: string; offsetY?: number }): number {
  const e = getEntete(magasinId);
  // Décalage vertical optionnel : permet d'insérer un talon détachable AU-DESSUS
  // de l'en-tête (cas de la Fiche) sans dupliquer la logique de dessin/logo.
  const dy = opts?.offsetY || 0;

  // Nom du magasin/direction : gros, gras, noir
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(0, 0, 0);
  doc.text(e.nom.toUpperCase(), 14, 18 + dy);

  // Coordonnées
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(e.adresse, 14, 27 + dy);
  doc.text(`Téléphone: ${e.telephone}`, 14, 32 + dy);
  doc.text(`Email: ${e.email}`, 14, 37 + dy);
  doc.text(`${e.ville}, Le ${frLongDate(opts?.date)}`, 14, 45 + dy);

  // Logo à droite
  if (logoDataURL) {
    try {
      const h = 24;
      const w = h * logoRatio;
      doc.addImage(logoDataURL, 'PNG', 196 - w, 8 + dy, w, h);
    } catch { /* logo non inséré */ }
  }

  // Séparateur
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, 50 + dy, 196, 50 + dy);

  doc.setTextColor(0, 0, 0);
  return 58 + dy;
}

// ── En-tête Excel (lignes AOA) ───────────────────────────────────────────────
/** Retourne les lignes d'en-tête à insérer en tête d'une feuille XLSX (aoa). */
export function excelHeaderRows(magasinId?: string, opts?: { date?: string }): any[][] {
  const e = getEntete(magasinId);
  return [
    [e.nom.toUpperCase()],
    [e.adresse],
    [`Téléphone: ${e.telephone}`],
    [`Email: ${e.email}`],
    [`${e.ville}, Le ${frLongDate(opts?.date)}`],
    [],
  ];
}

// ── En-tête HTML (impression / window.open) ──────────────────────────────────
/**
 * Bloc HTML d'en-tête au style du reçu de l'enseigne : nom en gros gras noir +
 * coordonnées à GAUCHE, logo à DROITE, filet noir en dessous.
 */
export function printHeaderHTML(magasinId?: string, opts?: { date?: string }): string {
  const e = getEntete(magasinId);
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:22px;">
    <div style="line-height:1.5;">
      <div style="font-size:30px;font-weight:800;color:#111;letter-spacing:-0.5px;text-transform:uppercase;">${e.nom}</div>
      <div style="height:10px;"></div>
      <div style="font-size:14px;color:#222;">${e.adresse}</div>
      <div style="font-size:14px;color:#222;">Téléphone: ${e.telephone}</div>
      <div style="font-size:14px;color:#222;">Email: ${e.email}</div>
      <div style="height:12px;"></div>
      <div style="font-size:14px;color:#222;">${e.ville}, Le ${frLongDate(opts?.date)}</div>
    </div>
    <img src="${logoUrl}" alt="Logo" style="height:96px;width:auto;object-fit:contain;border-radius:10px;flex-shrink:0;" />
  </div>`;
}
