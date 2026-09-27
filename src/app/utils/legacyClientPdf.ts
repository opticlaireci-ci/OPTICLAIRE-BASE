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
  notes?: string;
}

async function extractText(file: File): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it: any) => typeof it.str === 'string')
      .map((it: any) => ({ str: it.str as string, x: it.transform?.[4] || 0, y: it.transform?.[5] || 0 }));
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
  return pages.join('\n\n');
}

export async function parseLegacyClientPdf(file: File): Promise<LegacyPdfParsed | null> {
  const rawText = await extractText(file);
  if (!normalizeSpace(rawText)) return null;
  const text = rawText;
  const compactText = normalizeSpace(text);

  const conseillere = firstMatch(compactText, [
    /(?:É|E)dit(?:é|e)\s+par\s*[:\-]?\s*([^\n|]+?)(?=\s+(?:É|E)dit(?:é|e)\s+le|\s+Date|\s+DEVIS|\s+FACTURE|$)/i,
    /(?:Conseill(?:è|e)re|Conseiller|Vendeur|Commercial(?:e)?)\s*[:\-]?\s*([^\n|]+)/i,
  ]).replace(/\s{2,}/g, ' ').trim();

  const numeroFacture = firstMatch(compactText, [
    /(?:Facture|FACTURE|Proforma|DEVIS)\s*(?:N[°ºo]?|N°)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  ]);

  const numeroClient = firstMatch(compactText, [
    /(?:N[°ºo]?\s*)\(?\s*(\d{3,})\s*\)?\s+(?:MME?\.?|MR\.?|M\.?|MADAME|MONSIEUR)/i,
    /(?:N[°ºo]?\s*client|Client)\s*[:#\-]?\s*(\d{3,})/i,
  ]);

  const rawName = firstMatch(compactText, [
    /(?:N[°ºo]?\s*\(?\s*\d+\s*\)?\s+)((?:MME?\.?|MR\.?|M\.?|MADAME|MONSIEUR)\.?\s+[A-ZÀ-ÖØ-Ý][^\n]{2,80}?)(?=\s+Téléphone|\s+Email|\s+E-mail|\s+Adresse|\s+Édité|\s+DEVIS|\s+FACTURE|$)/i,
    /(?:Nom(?:\s+du)?\s+client|Client)\s*[:\-]?\s*([^\n|]+?)(?=\s+(?:Téléphone|Tél|Email|Adresse)\s*[:\-]|$)/i,
  ]);
  const { civilite, nom } = stripCivilite(rawName);

  const telephone = firstMatch(compactText, [
    /(?:Téléphone(?:\s*I)?|Tél\.?|Mobile|Contact)\s*[:\-]?\s*(\+?\d[\d\s().-]{7,})/i,
  ]).replace(/\s+/g, ' ').trim();
  const email = firstMatch(compactText, [/(?:E-?mail|Email)\s*[:\-]?\s*([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i]);
  const adresse = firstMatch(compactText, [/(?:Adresse)\s*[:\-]?\s*([^\n|]+?)(?=\s+(?:Téléphone|Tél|Email|E-mail)\s*[:\-]|$)/i]);

  const date = firstMatch(compactText, [
    /(?:Date\s*[:\-]?\s*)(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
    /(?:Abidjan|C[ôo]te d['’]Ivoire)\s*,?\s*le\s+(\d{1,2}\s+[A-Za-zéûîôàè]+\s+\d{4})/i,
  ]);
  const venteDate = normalizeDate(date);

  const totalNetRaw = firstMatch(compactText, [
    /TOTAL\s+NET\s*[:\-]?\s*([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)?/i,
    /TOTAL\s+NET\s+([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)/i,
  ]);
  const totalBrutRaw = firstMatch(compactText, [
    /(?:TOTAL(?:\s+BRUT)?|MONTANT\s+TOTAL)\s*[:\-]?\s*([\d\s.,]+)\s*(?:F\s*CFA|FCFA|CFA)?/i,
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
    notes: conseillere ? `Conseillère / vendeur détecté sur le PDF : ${conseillere}${numeroFacture ? ` · Facture : ${numeroFacture}` : ''}` : numeroFacture ? `Facture : ${numeroFacture}` : '',
  };
}
