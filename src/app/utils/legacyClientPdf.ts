// Lecture des anciens dossiers client PDF (factures / bons / dossiers exportés).
// pdf.js est chargé uniquement lorsque l'utilisateur sélectionne un PDF.
type PdfjsModule = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfjsModule> | null = null;
async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

function normalizeSpace(s: string): string {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeDate(value: string): string {
  const s = normalizeSpace(value);
  let m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return '';
}

function money(value: string): number {
  const cleaned = normalizeSpace(value).replace(/F\s*CFA|FCFA|CFA/gi, '').replace(/\s/g, '').replace(/,/g, '.');
  const n = Number(cleaned.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return normalizeSpace(m[1]);
  }
  return '';
}

function firstGroups(text: string, pattern: RegExp): string[] {
  const m = text.match(pattern);
  return m ? m.slice(1).map(normalizeSpace) : [];
}

function stripCivilite(name: string): { civilite: string; nom: string } {
  let s = normalizeSpace(name);
  // On retire les doublons éventuels : « MME. MME ... » -> « MME ... ».
  const civ = /^(MME|M\.?|MR|MADAME|MONSIEUR)\.?\s+/i;
  let civilite = '';
  const first = s.match(civ);
  if (first) {
    const raw = first[1].toUpperCase();
    civilite = raw === 'MADAME' ? 'MME' : raw === 'MONSIEUR' ? 'M' : raw.replace('.', '');
    s = s.replace(civ, '');
    // deuxième civilité accidentellement répétée dans l'ancien logiciel
    s = s.replace(civ, '');
  }
  return { civilite, nom: s.trim() };
}

export interface LegacyPdfParsed {
  rawText: string;
  sourceFile: string;
  numeroClient?: string;
  civilite?: string;
  nom?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  venteDate?: string;
  totalBrut?: number;
  totalNet?: number;
  remisePct?: number;
  acompte?: number;
  acompteDate?: string;
  modePaiement?: string;
  numeroFacture?: string;
  conseillere?: string;
  rdvRetrait?: string;
  dateRecuperation?: string;
  articles?: any[];
  verres?: any[];
  ordonnance?: any;
  bonsAssurance?: any[];
  notes?: string;
}

type PdfItem = { str: string; x: number; y: number };

async function extractContent(file: File): Promise<{ text: string; pageItems: PdfItem[][] }> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  const pageItems: PdfItem[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it: any) => typeof it.str === 'string')
      .map((it: any) => ({ str: it.str as string, x: it.transform?.[4] || 0, y: it.transform?.[5] || 0 }));
    pageItems.push(items.map((i: any) => ({ str: i.str, x: i.x, y: i.y })));
    items.sort((a: any, b: any) => b.y - a.y || a.x - b.x);
    const lines: string[] = [];
    let current: any[] = [];
    let lastY: number | null = null;
    for (const item of items) {
      if (lastY === null || Math.abs(item.y - lastY) <= 4) current.push(item);
      else { if (current.length) lines.push(current.sort((a,b) => a.x-b.x).map(i => i.str).join(' ')); current = [item]; }
      lastY = item.y;
    }
    if (current.length) lines.push(current.sort((a,b) => a.x-b.x).map(i => i.str).join(' '));
    pages.push(lines.join('\n'));
  }
  return { text: pages.join('\n\n'), pageItems };
}

// Lecture de l'ordonnance PAR POSITION DES COLONNES (et non plus par ordre des nombres) :
// quand « Addition » ou « Cylindre » est vide, les nombres se décalent et l'ancienne lecture
// mettait par exemple la hauteur/écart dans « addition ».
const EYE_FIELDS = ['sphere', 'cylindre', 'axe', 'dec', 'addition', 'hauteur', 'evLoin', 'evPres'] as const;
type EyeField = (typeof EYE_FIELDS)[number];
type EyeValues = Record<EyeField, string>;
const emptyEye = (): EyeValues => ({ sphere: '', cylindre: '', axe: '', dec: '', addition: '', hauteur: '', evLoin: '', evPres: '' });
const hasEye = (e?: Partial<EyeValues> | null) => !!e && EYE_FIELDS.some(k => !!e[k]);

function parseEyesByColumns(pageItems: PdfItem[][]): { droit: EyeValues; gauche: EyeValues } | null {
  const NUM = /^[+\-−]?\d+(?:[.,]\d+)?$/;
  for (const items of pageItems) {
    const sph = items.find(i => /^Sph[èeé]re$/i.test(i.str.trim()));
    if (!sph) continue;
    const hdr = (re: RegExp) => items.find(i => Math.abs(i.y - sph.y) <= 3 && re.test(i.str.trim()));
    const x0 = sph.x;
    const loin = hdr(/^Loin$/i), pres = hdr(/^Pr[èeé]s$/i);
    const starts: Record<EyeField, number> = {
      sphere: x0,
      cylindre: hdr(/^Cylindre$/i)?.x ?? x0 + 30.5,
      axe: hdr(/^Axe$/i)?.x ?? x0 + 65,
      dec: hdr(/^Dec$/i)?.x ?? x0 + 82,
      addition: hdr(/^Addition$/i)?.x ?? x0 + 99.6,
      hauteur: hdr(/^Hauteur$/i)?.x ?? x0 + 133.6,
      evLoin: hdr(/E\s*V\s*Loin/i)?.x ?? (loin ? loin.x - 17 : x0 + 167.1),
      evPres: hdr(/E\s*V\s*Pr[èeé]s/i)?.x ?? (pres ? pres.x - 17 : x0 + 202.6),
    };
    const ordered = [...EYE_FIELDS].sort((a, b) => starts[b] - starts[a]); // du plus à droite au plus à gauche
    const maxX = starts.evPres + 40;
    const labelD = items.find(i => /Droit/i.test(i.str) && i.x < x0);
    const labelG = items.find(i => /Gauche/i.test(i.str) && i.x < x0);
    const readRow = (label?: PdfItem): EyeValues => {
      const row = emptyEye();
      if (!label) return row;
      const vals = items
        .filter(i => NUM.test(i.str.trim()) && i.x >= x0 - 6 && i.x < maxX && i.y <= label.y + 4 && i.y >= label.y - 12)
        .sort((a, b) => a.x - b.x);
      for (const v of vals) {
        const col = ordered.find(k => v.x >= starts[k] - 4);
        if (col && !row[col]) row[col] = v.str.trim().replace('−', '-');
      }
      return row;
    };
    const droit = readRow(labelD), gauche = readRow(labelG);
    if (hasEye(droit) || hasEye(gauche)) return { droit, gauche };
  }
  return null;
}

export async function parseLegacyClientPdf(file: File): Promise<LegacyPdfParsed | null> {
  const { text: rawText, pageItems } = await extractContent(file);
  if (!normalizeSpace(rawText)) return null;
  const text = rawText;
  const compactText = normalizeSpace(text);

  const conseillere = firstMatch(rawText, [
    /(?:É|E)dit(?:é|e)\s+par\s*[:\-]?\s*([^\n]+?)(?=\s+(?:Téléphone|Email|Date|DEVIS|FACTURE)\b|\n|$)/i,
  ]).replace(/\s{2,}/g, ' ').trim() || firstMatch(compactText, [
    /(?:É|E)dit(?:é|e)\s+par\s*[:\-]?\s*(.+?)(?=\s+Téléphone|\s+(?:É|E)dit(?:é|e)\s+le|\s+Date|\s+DEVIS|\s+FACTURE|$)/i,
    /(?:Conseill(?:è|e)re|Conseiller|Vendeur|Commercial(?:e)?)\s*[:\-]?\s*(.+?)(?=\s+Téléphone|\s+Email|\s+FACTURE|$)/i,
  ]).replace(/\s{2,}/g, ' ').trim();

  const numeroFacture = firstMatch(compactText, [
    /(?:Facture|FACTURE|Proforma|DEVIS)\s*(?:N[°ºo]?|N°)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  ]);

  const numeroClient = firstMatch(compactText, [
    /\(\s*N[°ºo]?\s*(\d{3,})\s*\)/i,
    /(?:N[°ºo]?\s*)\(?\s*(\d{3,})\s*\)?\s+(?:MME?\.?|MR\.?|M\.?|MADAME|MONSIEUR)/i,
    /(?:N[°ºo]?\s*client|Client)\s*[:#\-]?\s*(\d{3,})/i,
  ]);

  const rawName = firstMatch(compactText, [
    // Format Leclaire : « (N° 00032) NOM PRÉNOM » — la civilité (MME/M.) est facultative.
    /\(\s*N[°ºo]?\s*\d+\s*\)\s+(.+?)(?=\s+Téléphone|\s+Tél\b|\s+Email|\s+E-mail|\s+Adresse|\s+(?:É|E)dit(?:é|e)|\s+DEVIS|\s+FACTURE|$)/i,
    /(?:N[°ºo]?\s*\(?\s*\d+\s*\)?\s+)((?:MME?\.?|MR\.?|M\.?|MADAME|MONSIEUR)\.?\s+[A-ZÀ-ÖØ-Ý][^\n]{2,80}?)(?=\s+Téléphone|\s+Email|\s+E-mail|\s+Adresse|\s+Édité|\s+DEVIS|\s+FACTURE|$)/i,
    /(?:Nom(?:\s+du)?\s+client|Client)\s*[:\-]?\s*([^\n|]+?)(?=\s+(?:Téléphone|Tél|Email|Adresse)\s*[:\-]|$)/i,
  ]);
  const { civilite, nom } = stripCivilite(rawName);

  // Le premier téléphone/email du PDF appartient au magasin. On lit donc le bloc client
  // situé entre le nom du client et « Édité par ».
  const clientStart = rawName ? Math.max(0, compactText.indexOf(rawName)) : 0;
  const blockEnd = compactText.slice(clientStart).search(/\s+(?:VERRES|MONTURES)\b/i);
  const clientBlock = compactText.slice(clientStart, blockEnd > 0 ? clientStart + blockEnd : clientStart + 500);
  const telephone = firstMatch(clientBlock, [
    /(?:Téléphone(?:\s*I)?|Tél\.?|Mobile|Contact)\s*[:\-]?\s*(\+?\d[\d\s().-]{7,})/i,
  ]).replace(/\s+/g, ' ').trim();
  const email = firstMatch(clientBlock, [/(?:E-?mail|Email)\s*[:\-]?\s*([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i]);
  // Adresse : soit « Adresse : ... », soit la ligne placée juste sous le nom (ex. quartier « N`DOTRE »).
  const lines = rawText.split('\n').map(normalizeSpace);
  const nameLineIdx = lines.findIndex(l => /\(\s*N[°ºo]?\s*\d+\s*\)/.test(l));
  const nextLine = nameLineIdx >= 0 ? (lines[nameLineIdx + 1] || '') : '';
  const adresseSousNom = nextLine && !/^(Téléphone|Tél|Mobile|Email|E-mail|(?:É|E)dit|VERRES|FACTURE|Rendez)/i.test(nextLine)
    ? nextLine.replace(/\s+(?:Téléphone|Email)\b.*$/i, '').trim() : '';
  const adresse = firstMatch(clientBlock, [/(?:Adresse)\s*[:\-]?\s*([^\n|]+?)(?=\s+(?:Téléphone|Tél|Email|E-mail)\s*[:\-]|$)/i]) || adresseSousNom;

  // La date « Abidjan, le 27 septembre 2026 » correspond à la date d'impression.
  // Pour une vente historique, on privilégie la date « Édité le » de la facture,
  // qui est la date commerciale enregistrée par l'ancien logiciel.
  const dateEdition = firstMatch(compactText, [
    /(?:É|E)dit(?:é|e)\s+le\s*[,;:]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
  ]);
  const dateFactureExplicite = firstMatch(compactText, [
    /(?:Date\s+facture|Date\s+de\s+facture|Date\s+vente|Date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
  ]);
  const date = dateFactureExplicite || dateEdition;
  const venteDate = normalizeDate(date);

  const rdvRetrait = normalizeDate(firstMatch(compactText, [
    /Rendez-vous\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
  ]));
  const dateRecuperation = normalizeDate(firstMatch(compactText, [
    /Date\s+R[ée]cup[ée]ration\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
  ]));

  const totalNetRaw = firstMatch(compactText, [
    /TOTAL\s+NET\s*[:\-]?\s*([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)?/i,
    /TOTAL\s+NET\s+([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)/i,
  ]);
  const totalBrutRaw = firstMatch(compactText, [
    /TOTAL\s*[:\-]?\s*([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)?/i,
    /(?:MONTANT\s+TOTAL)\s*[:\-]?\s*([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)?/i,
  ]);
  const acompteRaw = firstMatch(compactText, [
    /(?:Acompte|Avance|Vers[ée]ment)\s*[:\-]?\s*([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)?/i,
  ]);
  const remiseRaw = firstMatch(compactText, [/(?:Remise|Discount)\s*\(?%?\)?\s*[:\-]?\s*([\d.,]+)/i]);
  const modePaiement = firstMatch(compactText, [/(?:Mode\s+de\s+paiement|Paiement|R[èe]glement)\s*[:\-]?\s*([^\n|]+)/i]);

  const totalNet = money(totalNetRaw);
  const totalBrut = money(totalBrutRaw) || totalNet;
  const acompte = money(acompteRaw);
  const remisePct = Number(String(remiseRaw || '').replace(',', '.')) || 0;

  // ── Verres / ordonnance ──────────────────────────────────────────────────
  const prescriptionBlock = firstMatch(compactText, [
    /VERRES\s+PRESCIPTION\s+QUANTIT[ÉE]\s+PRIX\s+REMISE\s+TOTAL\s+(.+?)\s+Sph[èe]re/i,
  ]);
  const warrantyVerres = firstMatch(compactText, [/Garantie\s*:\s*([^\n]+?)(?=\s+Sph[èe]re|\s+MONTURES|$)/i]);
  const rightEye = firstGroups(compactText, /Oeil\s+Droit\s+(?:1\s+[\d\s.,]+?\s+[\d.,]+\s+[\d\s.,]+\s+)?([+\-]?\d+[.,]?\d*)\s+([+\-]?\d+[.,]?\d*)\s+(\d+)\s+([+\-]?\d+[.,]?\d*)/i);
  const leftEye = firstGroups(compactText, /Oeil\s+Gauche\s+([+\-]?\d+[.,]?\d*)\s+([+\-]?\d+[.,]?\d*)\s+(\d+)\s+([+\-]?\d+[.,]?\d*)/i);
  const byCols = parseEyesByColumns(pageItems);
  const parseEye = (raw: string[]) => raw.length >= 4 ? { sphere: raw[0], cylindre: raw[1], axe: raw[2], addition: raw[3] } : {};
  // Priorité à la lecture par colonnes ; l'ancienne lecture ne sert que de secours (PDF au format différent).
  const oeilDroitFinal: any = byCols && hasEye(byCols.droit) ? byCols.droit : parseEye(rightEye);
  const oeilGaucheFinal: any = byCols && hasEye(byCols.gauche) ? byCols.gauche : parseEye(leftEye);
  const hasRightEye = hasEye(byCols?.droit) || rightEye.length > 0;
  const hasLeftEye = hasEye(byCols?.gauche) || leftEye.length > 0;
  const prescriptionLabel = prescriptionBlock || firstMatch(compactText, [
    /VERRES\s+PRESCIPTION.*?\s+(Progressif\s*\|.*?)(?=\s+Garantie:)/i,
  ]);
  const verresBlock = firstMatch(compactText, [/(VERRES\s+PRESCIPTION[\s\S]*?)(?=\s+MONTURES)/i]);
  const glassRows = Array.from(verresBlock.matchAll(/\b1\s+([\d ]+\.\d{2})\s+0(?:\.00)?\s+([\d ]+\.\d{2})/gi)).map(m => ({ prix: money(m[1]), total: money(m[2]) }));
  const rightPrice = glassRows[0]?.prix || 0;
  const leftPrice = glassRows[1]?.prix || 0;
  const verres = (prescriptionLabel || hasRightEye || hasLeftEye) ? [{
    type: 'Verres',
    prescription: prescriptionLabel || '',
    garantie: warrantyVerres || '',
    quantite: 2,
    oeilDroit: oeilDroitFinal,
    oeilGauche: oeilGaucheFinal,
    lignes: [
      hasRightEye ? { oeil: 'Droit', quantite: 1, prix: rightPrice, total: rightPrice } : null,
      hasLeftEye ? { oeil: 'Gauche', quantite: 1, prix: leftPrice, total: leftPrice } : null,
    ].filter(Boolean),
  }] : [];
  const ordonnance = (hasRightEye || hasLeftEye || prescriptionLabel) ? {
    source: 'PDF facture ancien logiciel',
    prescription: prescriptionLabel || '',
    garantie: warrantyVerres || '',
    oeilDroit: oeilDroitFinal,
    oeilGauche: oeilGaucheFinal,
  } : null;

  // ── Monture ───────────────────────────────────────────────────────────────
  const fournisseur = firstMatch(compactText, [/Fournisseur\s*\|\s*([^\n]+?)(?=\s+LUSORIA|\s+Garantie|$)/i]);
  const mountDesignation = firstMatch(compactText, [
    /Fournisseur\s*\|[^\n]+\s+(LUSORIA\s*-[^\n]+?)(?=\s+Garantie\s*:)/i,
  ]);
  const mountWarranty = firstMatch(compactText, [
    /MONTURES.*?Garantie\s*:\s*([^\n]+?)(?=\s+TOTAL\s+|$)/i,
  ]);
  const mountMatch = compactText.match(/(LUSORIA\s*-[^\n]+?)\s+(\d+)\s+([\d ]+\.\d{2})\s+([\d]+(?:\.\d{2})?)\s+([\d ]+\.\d{2})/i);
  let articles: any[] = [];
  if (mountMatch) {
    articles.push({
      type: 'Monture', designation: normalizeSpace(mountMatch[1]), quantite: Number(mountMatch[2]),
      prix: money(mountMatch[3]), remise: money(mountMatch[4]), total: money(mountMatch[5]),
      fournisseur: fournisseur || '', garantie: mountWarranty || '',
    });
  } else if (mountDesignation) {
    articles.push({ type: 'Monture', designation: mountDesignation.trim(), fournisseur: fournisseur || '', garantie: mountWarranty || '' });
  }

  // Un PDF sans bloc « assuré » ne doit pas créer artificiellement une assurance.
  const bonsAssurance: any[] = [];

  // On considère le PDF comme facture/vente si des marqueurs commerciaux sont présents.
  const isSale = /(FACTURE|DEVIS|PROFORMA|TOTAL\s+NET|MONTANT\s+TOTAL|BON\s+DE\s+COMMANDE)/i.test(compactText);
  if (!isSale && !conseillere && !rawName) return null;

  return {
    rawText: rawText,
    sourceFile: file.name,
    numeroClient,
    civilite,
    nom,
    telephone,
    email,
    adresse,
    venteDate,
    totalBrut,
    totalNet,
    remisePct,
    acompte,
    acompteDate: venteDate,
    modePaiement,
    numeroFacture,
    conseillere,
    rdvRetrait,
    dateRecuperation,
    articles,
    verres,
    ordonnance,
    bonsAssurance,
    notes: [
      conseillere ? `Conseillère / vendeur détecté sur le PDF : ${conseillere}` : '',
      numeroFacture ? `Facture : ${numeroFacture}` : '',
      rdvRetrait ? `Rendez-vous : ${rdvRetrait}` : '',
      dateRecuperation ? `Date récupération : ${dateRecuperation}` : '',
      !bonsAssurance.length ? 'Aucun bloc assurance détecté sur cette facture.' : '',
    ].filter(Boolean).join(' · '),
  };
}
