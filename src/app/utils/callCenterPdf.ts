import * as pdfjsLib from 'pdfjs-dist';
// Worker pdf.js (résolu par Vite en URL statique).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Import automatique des « ÉTAT CLIENT » PDF LECLAIRE / BOBOPTIQUE dans le
 * Call Center.
 *
 * Ces PDF ont une structure fixe :
 *   - un en-tête « PÉRIODE : 01-11-2025 | 30-11-2025 » → donne le mois ciblé ;
 *   - un tableau : # | Client | Adresse | Téléphone I | Téléphone II.
 *   - la colonne Client contient « N°(01618) NOM » (+ éventuellement des lignes
 *     Profession / Anniversaire / Adresse).
 *
 * On lit le texte positionné (x, y) de chaque page, on regroupe en lignes puis
 * en colonnes, et on reconstitue chaque client (nom + Téléphone I).
 */

export interface ParsedPdfClient {
  client: string;
  telephone: string;
}

export interface ParsedPdf {
  /** Mois au format 'YYYY-MM' déduit de la période, sinon null. */
  month: string | null;
  clients: ParsedPdfClient[];
}

interface TextItem { str: string; x: number; y: number }

// Nettoie un numéro : ne garde que chiffres et « + » de tête. Les fragments
// invalides (« 225 », « +225 », « 22507 » seuls) sont renvoyés vides.
function cleanPhone(raw: string): string {
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 8) return '';
  // « 225 » / « 22507 » sans numéro réel après l'indicatif.
  if (/^\+?2250?7?$/.test(compact)) return '';
  return compact;
}

// Retire les préfixes « N°(01618) » et « (Matricule: ...) » d'un nom.
function cleanName(raw: string): string {
  return raw
    .replace(/\(Matricule:[^)]*\)/gi, '')
    .replace(/N°\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// « 01-11-2025 | 30-11-2025 » → '2025-11'
function monthFromPeriod(text: string): string | null {
  const m = text.match(/P[ÉE]RIODE\s*:\s*(\d{2})-(\d{2})-(\d{4})/i);
  if (!m) return null;
  const [, , mm, yyyy] = m;
  return `${yyyy}-${mm}`;
}

async function readPageItems(page: any): Promise<TextItem[]> {
  const content = await page.getTextContent();
  return content.items
    .filter((it: any) => typeof it.str === 'string')
    .map((it: any) => ({
      str: it.str as string,
      x: it.transform[4] as number,
      y: it.transform[5] as number,
    }));
}

// Regroupe les items d'une page en lignes visuelles (même y, à tolérance près).
function groupLines(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  let current: TextItem[] = [];
  let lastY: number | null = null;
  for (const it of sorted) {
    if (lastY === null || Math.abs(it.y - lastY) <= 4) {
      current.push(it);
    } else {
      if (current.length) lines.push(current);
      current = [it];
    }
    lastY = it.y;
  }
  if (current.length) lines.push(current);
  return lines.map(l => l.sort((a, b) => a.x - b.x));
}

/**
 * Parse un fichier PDF « ÉTAT CLIENT » et renvoie le mois + la liste des clients.
 */
export async function parseEtatClientPdf(file: File | ArrayBuffer): Promise<ParsedPdf> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  let month: string | null = null;
  // Frontières de colonnes (x mini) détectées depuis l'en-tête du tableau.
  let colClient = 90;
  let colAdresse = 450;
  let colTel1 = 640;
  let colTel2 = 770;
  let headerFound = false;

  interface Record { name: string; phone: string }
  const records: Record[] = [];
  let cur: Record | null = null;

  // Pré-lecture de toutes les pages pour déterminer le mode de détection.
  const pagesItems: TextItem[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    pagesItems.push(await readPageItems(page));
  }

  // Chaque client débute par un matricule « N°(01618) ». Quand il est présent,
  // c'est le repère fiable (le numéro d'ordre # est parfois mal positionné par
  // pdf.js et crée des clients fantômes). On ne retombe sur le # que si le
  // document ne contient aucun matricule.
  const hasMatricule = pagesItems.some(items =>
    /N°\s*\(/.test(items.map(i => i.str).join(' ')),
  );

  for (const items of pagesItems) {
    if (!month) {
      const joined = items.map(i => i.str).join(' ');
      month = monthFromPeriod(joined);
    }

    const lines = groupLines(items);

    for (const line of lines) {
      const lineText = line.map(i => i.str).join(' ').trim();

      // Détection de l'en-tête → calibre les colonnes sur les vrais x.
      if (!headerFound && /Client/i.test(lineText) && /T[ée]l[ée]phone/i.test(lineText)) {
        for (const it of line) {
          const t = it.str.trim();
          if (/^Client/i.test(t)) colClient = it.x - 5;
          else if (/^Adresse/i.test(t)) colAdresse = it.x - 5;
          else if (/^T[ée]l[ée]phone\s*I{1}$|^T[ée]l[ée]phone\s*I\b/i.test(t)) colTel1 = it.x - 5;
          else if (/^T[ée]l[ée]phone\s*II/i.test(t)) colTel2 = it.x - 5;
        }
        headerFound = true;
        continue;
      }

      // Colonne # : entier seul en début de ligne (gauche de la colonne Client).
      const numItem = line.find(i => i.x < colClient && /^\d{1,3}$/.test(i.str.trim()));

      // Texte de la colonne Client / Téléphone I sur cette ligne.
      const clientText = line
        .filter(i => i.x >= colClient && i.x < colAdresse)
        .map(i => i.str).join(' ').trim();
      const telText = line
        .filter(i => i.x >= colTel1 && i.x < colTel2)
        .map(i => i.str).join(' ').trim();

      // Début d'un nouveau client : matricule « N°(01618) » si le document en
      // contient, sinon repli sur le numéro d'ordre #.
      const startsMatricule = /N°\s*\(/.test(clientText);
      const isNewRecord = hasMatricule ? startsMatricule : !!numItem;

      if (isNewRecord) {
        // Nouveau client : on clôt le précédent.
        if (cur && cur.name) records.push(cur);
        cur = { name: '', phone: '' };
      }
      if (!cur) continue;

      // Nom : on accumule les lignes du client tant qu'on n'est pas sur une
      // ligne de métadonnée (Profession / Anniversaire / Adresse / Entreprise).
      const isMeta = /^(Profession|Anniversaire|Adresse|Entreprise)\s*:/i.test(clientText)
        || /^\(Matricule/i.test(clientText);
      if (clientText && !isMeta) {
        const part = cleanName(clientText);
        if (part) cur.name = cur.name ? `${cur.name} ${part}` : part;
      }

      // Téléphone I : on retient le premier numéro valide rencontré.
      if (!cur.phone) {
        const ph = cleanPhone(telText);
        if (ph) cur.phone = ph;
      }
    }
  }
  if (cur && cur.name) records.push(cur);

  const clients = records
    .filter(r => r.name)
    .map(r => ({ client: r.name.replace(/\s+/g, ' ').trim(), telephone: r.phone }));

  return { month, clients };
}
