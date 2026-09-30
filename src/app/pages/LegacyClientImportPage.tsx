import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import * as XLSX from 'xlsx';
import { Upload, FolderOpen, FileText, CheckCircle2, AlertTriangle, Loader2, Package, CalendarDays, ShieldCheck, Users } from 'lucide-react';
import { getMagasins } from '../constants/magasins';
import { importerDossierClient, parseMoney, type ImportDocumentInput, type ImportReglementInput } from '../services/legacyClientImportService';
import { parseLegacyClientPdf, type LegacyPdfParsed } from '../utils/legacyClientPdf';

interface ParsedData {
  raw: any;
  sourceFile?: string;
  reglements?: ImportReglementInput[];
  articles?: any[];
  verres?: any[];
  bonsAssurance?: any[];
  ordonnance?: any;
  conseillere?: string;
  numeroFacture?: string;
  rdvRetrait?: string;
  dateRecuperation?: string;
}

function first(obj: any, keys: string[], fallback = ''): any {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) {
    const v = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.replace(/[_-]/g, '')];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
}

function normalizeDate(v: any): string {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function pickRoot(parsed: any): any {
  if (!parsed || typeof parsed !== 'object') return {};
  if (parsed.client || parsed.vente || parsed.sale || parsed.customer) return parsed;
  if (Array.isArray(parsed)) return parsed[0] || {};
  const keys = Object.keys(parsed);
  for (const k of keys) {
    const v = parsed[k];
    if (v && typeof v === 'object' && (v.client || v.vente || v.sale || v.customer)) return v;
  }
  return parsed;
}

function extractData(parsed: any, sourceFile: string): ParsedData {
  const root = pickRoot(parsed);
  const c = root.client || root.customer || root;
  const v = root.vente || root.sale || root.facture || root;
  const regs = root.reglements || root.reglements_client || root.payments || v.reglements || [];
  const articles = root.articles || root.items || v.articles || v.items || [];
  const verres = root.verres || root.prescription || v.verres || [];
  const bons = root.bonsAssurance || root.bons_assurance || root.assurance?.bons || v.bonsAssurance || v.bons_assurance || [];
  const ordonnance = root.ordonnance || root.prescription || c.ordonnance || v.ordonnance || null;
  return {
    raw: root,
    sourceFile,
    reglements: Array.isArray(regs) ? regs.map((r: any) => ({
      montant: parseMoney(first(r, ['montant', 'amount', 'paid', 'payment'])),
      date: normalizeDate(first(r, ['date', 'date_reglement', 'payment_date'])),
      mode_paiement: first(r, ['mode_paiement', 'modePaiement', 'mode', 'payment_method'], 'Espèces'),
      compte_banque: first(r, ['compte_banque', 'compteBanque', 'bank_account']),
      recu: first(r, ['recu', 'receipt', 'numero_recu']),
      details: first(r, ['details', 'description', 'note']),
    })).filter((r: ImportReglementInput) => r.montant > 0) : [],
    articles: Array.isArray(articles) ? articles : [],
    verres: Array.isArray(verres) ? verres : [],
    bonsAssurance: Array.isArray(bons) ? bons : (bons && typeof bons === 'object' ? [bons] : []),
    ordonnance,
  };
}

async function parseStructuredFile(file: File): Promise<ParsedData | null> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.json')) {
      return extractData(JSON.parse(await file.text()), file.name);
    }
    if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      return extractData(rows, file.name);
    }
  } catch {
    return null;
  }
  return null;
}

async function fileToImportDocument(file: File): Promise<ImportDocumentInput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return { name: file.name, type: file.type, size: file.size, relativePath: (file as any).webkitRelativePath || file.name, dataBase64: btoa(binary) };
}

function mergeLegacyPdfData(items: LegacyPdfParsed[]): LegacyPdfParsed | null {
  if (!items.length) return null;
  // Le PDF qui ressemble le plus à une facture sert de base, puis les autres
  // PDF du même dossier complètent les champs manquants (ordonnance, assurance,
  // dates, conseillère, etc.). Aucun PDF n'est perdu : ils restent tous dans files.
  const score = (p: LegacyPdfParsed) =>
    (p.totalNet ? 6 : 0) + (p.numeroFacture ? 4 : 0) + (p.nom ? 4 : 0) +
    (p.conseillere ? 3 : 0) + (p.articles?.length ? 2 : 0) +
    (p.verres?.length ? 2 : 0) + (p.ordonnance ? 2 : 0) + (p.acompte ? 1 : 0);
  const ordered = [...items].sort((a, b) => score(b) - score(a));
  const base = { ...ordered[0] };
  for (const p of ordered.slice(1)) {
    const keys: (keyof LegacyPdfParsed)[] = [
      'numeroClient','civilite','nom','telephone','email','adresse','venteDate',
      'totalBrut','totalNet','remisePct','acompte','acompteDate','modePaiement',
      'numeroFacture','conseillere','rdvRetrait','dateRecuperation','ordonnance','notes'
    ];
    for (const k of keys) {
      const current = base[k] as any;
      const incoming = p[k] as any;
      const empty = current === undefined || current === null || current === '' || current === 0;
      if (empty && incoming !== undefined && incoming !== null && incoming !== '' && incoming !== 0) (base as any)[k] = incoming;
    }
    if ((!base.articles || !base.articles.length) && p.articles?.length) base.articles = p.articles;
    if ((!base.verres || !base.verres.length) && p.verres?.length) base.verres = p.verres;
    if ((!base.bonsAssurance || !base.bonsAssurance.length) && p.bonsAssurance?.length) base.bonsAssurance = p.bonsAssurance;
  }
  return base;
}

export function LegacyClientImportPage() {
  const { magasinId: routeMagasinId } = useParams<{ magasinId?: string }>();
  const magasins = getMagasins();
  const [magasinId, setMagasinId] = useState(routeMagasinId || magasins[0]?.id || '');
  const [files, setFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [importing, setImporting] = useState(false);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    numeroClient: '', civilite: '', nom: '', telephone: '', telephone2: '', email: '', adresse: '', profession: '', dateNaissance: '',
    matriculeAssurance: '', entreprise: '', ophtalmologue: '', telOphtalmologue: '', cabinetOphtalmologue: '', telCabinet: '', solde: '',
    venteDate: '', totalBrut: '', totalNet: '', remisePct: '', acompte: '', acompteDate: '', modePaiement: 'Espèces', compteBanque: '', detailsAcompte: '', sourceLogiciel: '',
    ordonnanceJson: '', articlesJson: '', verresJson: '', assuranceJson: '', reglementsJson: '', notes: '', conseillere: '', numeroFacture: '', rdvRetrait: '', dateRecuperation: '',
  });

  const update = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const applyParsed = (p: ParsedData) => {
    const root = p.raw || {};
    const c = root.client || root.customer || root;
    const v = root.vente || root.sale || root.facture || root;
    const assurance = p.bonsAssurance || [];
    const totalBrut = first(v, ['total_brut', 'totalBrut', 'total', 'montant_total', 'amount']);
    const totalNet = first(v, ['total_net', 'totalNet', 'net', 'montant_net'], totalBrut);
    const acompte = first(v, ['acompte', 'acompte_initial', 'deposit'], '');
    const firstReg = p.reglements?.[0];
    setForm(prev => ({
      ...prev,
      numeroClient: String(first(c, ['numero_client', 'numeroClient', 'client_number', 'code'], prev.numeroClient)),
      civilite: String(first(c, ['civilite', 'title'], prev.civilite)),
      nom: String(first(c, ['nom', 'name', 'client_nom', 'full_name'], prev.nom)),
      telephone: String(first(c, ['telephone', 'telephone1', 'phone', 'mobile'], prev.telephone)),
      telephone2: String(first(c, ['telephone2', 'phone2'], prev.telephone2)),
      email: String(first(c, ['email', 'mail'], prev.email)),
      adresse: String(first(c, ['adresse', 'address'], prev.adresse)),
      profession: String(first(c, ['profession', 'job'], prev.profession)),
      dateNaissance: normalizeDate(first(c, ['date_naissance', 'dateNaissance', 'birth_date'])),
      matriculeAssurance: String(first(c, ['matricule_assurance', 'matriculeAssurance', 'insurance_number'], prev.matriculeAssurance)),
      entreprise: String(first(c, ['entreprise', 'company'], prev.entreprise)),
      ophtalmologue: String(first(c, ['ophtalmologue', 'ophthalmologist'], prev.ophtalmologue)),
      telOphtalmologue: String(first(c, ['tel_ophtalmologue', 'ophthalmologist_phone'], prev.telOphtalmologue)),
      cabinetOphtalmologue: String(first(c, ['cabinet_ophtalmologue', 'ophthalmologist_office'], prev.cabinetOphtalmologue)),
      telCabinet: String(first(c, ['tel_cabinet', 'office_phone'], prev.telCabinet)),
      solde: String(first(c, ['solde', 'balance'], prev.solde)),
      venteDate: normalizeDate(first(v, ['date', 'date_vente', 'sale_date', 'invoice_date'], prev.venteDate)),
      totalBrut: String(totalBrut ?? prev.totalBrut),
      totalNet: String(totalNet ?? prev.totalNet),
      remisePct: String(first(v, ['remisePct', 'remise_pct', 'discount_pct'], prev.remisePct)),
      acompte: String(acompte || firstReg?.montant || prev.acompte),
      acompteDate: normalizeDate(first(v, ['acompte_date', 'deposit_date'], firstReg?.date || prev.acompteDate)),
      modePaiement: String(first(v, ['modePaiement', 'mode_paiement', 'payment_method'], firstReg?.mode_paiement || prev.modePaiement)),
      compteBanque: String(first(v, ['compteBanque', 'compte_banque'], firstReg?.compte_banque || prev.compteBanque)),
      detailsAcompte: String(first(v, ['details', 'payment_details'], firstReg?.details || prev.detailsAcompte)),
      sourceLogiciel: prev.sourceLogiciel || p.sourceFile?.replace(/\.[^.]+$/, '') || '',
      ordonnanceJson: p.ordonnance ? JSON.stringify(p.ordonnance, null, 2) : prev.ordonnanceJson,
      articlesJson: p.articles?.length ? JSON.stringify(p.articles, null, 2) : prev.articlesJson,
      verresJson: p.verres?.length ? JSON.stringify(p.verres, null, 2) : prev.verresJson,
      assuranceJson: assurance.length ? JSON.stringify(assurance, null, 2) : prev.assuranceJson,
      reglementsJson: p.reglements?.length ? JSON.stringify(p.reglements, null, 2) : prev.reglementsJson,
    }));
  };

  const applyParsedPdf = (p: LegacyPdfParsed) => {
    setForm(prev => ({
      ...prev,
      numeroClient: p.numeroClient || prev.numeroClient,
      civilite: p.civilite || prev.civilite,
      nom: p.nom || prev.nom,
      telephone: p.telephone || prev.telephone,
      email: p.email || prev.email,
      adresse: p.adresse || prev.adresse,
      venteDate: p.venteDate || prev.venteDate,
      totalBrut: p.totalBrut != null ? String(p.totalBrut) : prev.totalBrut,
      totalNet: p.totalNet != null ? String(p.totalNet) : prev.totalNet,
      remisePct: p.remisePct != null ? String(p.remisePct) : prev.remisePct,
      acompte: p.acompte != null ? String(p.acompte) : prev.acompte,
      acompteDate: p.acompteDate || prev.acompteDate,
      modePaiement: p.modePaiement || prev.modePaiement,
      conseillere: p.conseillere || prev.conseillere,
      numeroFacture: p.numeroFacture || prev.numeroFacture,
      rdvRetrait: p.rdvRetrait || prev.rdvRetrait,
      dateRecuperation: p.dateRecuperation || prev.dateRecuperation,
      articlesJson: p.articles?.length ? JSON.stringify(p.articles, null, 2) : prev.articlesJson,
      verresJson: p.verres?.length ? JSON.stringify(p.verres, null, 2) : prev.verresJson,
      ordonnanceJson: p.ordonnance ? JSON.stringify(p.ordonnance, null, 2) : prev.ordonnanceJson,
      assuranceJson: p.bonsAssurance?.length ? JSON.stringify(p.bonsAssurance, null, 2) : prev.assuranceJson,
      sourceLogiciel: prev.sourceLogiciel || `PDF ancien logiciel — ${p.sourceFile}`,
      notes: [prev.notes, p.notes, p.rawText ? 'Contenu intégral du PDF conservé comme pièce jointe.' : ''].filter(Boolean).join('\n'),
    }));
  };

  const buildPayloadFromPdfGroup = async (groupFiles: File[], groupName: string) => {
    const pdfs = groupFiles.filter(f => /\.pdf$/i.test(f.name));
    const parsedPdfs: LegacyPdfParsed[] = [];
    for (const f of pdfs) {
      try {
        const p = await parseLegacyClientPdf(f);
        if (p) parsedPdfs.push(p);
      } catch { /* la pièce reste conservée */ }
    }
    const best = mergeLegacyPdfData(parsedPdfs);
    if (!best || !best.nom || !best.venteDate || !(best.totalNet || 0)) return null;
    const docs = await Promise.all(groupFiles.map(fileToImportDocument));
    return {
      magasinId,
      numeroClient: best.numeroClient || '',
      civilite: best.civilite || '',
      nom: best.nom || groupName,
      telephone: best.telephone || '',
      email: best.email || '',
      adresse: best.adresse || '',
      venteDate: best.venteDate || '',
      totalBrut: best.totalBrut || best.totalNet || 0,
      totalNet: best.totalNet || 0,
      remisePct: best.remisePct || 0,
      acompteInitial: best.acompte || 0,
      acompteDate: best.acompteDate || best.venteDate || '',
      modePaiementAcompte: best.modePaiement || 'Espèces',
      articles: best.articles || [],
      verres: best.verres || [],
      bonsAssurance: best.bonsAssurance || [],
      ordonnance: best.ordonnance || null,
      documents: docs,
      notesImport: `Import groupé — dossier : ${groupName}`,
      sourceLogiciel: `Ancien logiciel — import groupé (${groupName})`,
      conseillere: best.conseillere || '',
      numeroFacture: best.numeroFacture || '',
      rdvRetrait: best.rdvRetrait || '',
      dateRecuperation: best.dateRecuperation || '',
    };
  };

  const onMultipleClientsFolder = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(ev.target.files || []);
    if (!selected.length) return;
    setBatchMessage(''); setError(''); setBatchImporting(true);
    try {
      /*
       * IMPORTANT : ne plus supposer que le client est toujours parts[1].
       * Selon la manière dont l'ancien logiciel a exporté les dossiers, on peut
       * avoir : ANCIENS/CLIENT/facture.pdf, ANCIENS/2025/CLIENT/facture.pdf,
       * ou encore plusieurs PDF dans des sous-dossiers.
       *
       * On identifie donc d'abord chaque facture PDF par le numéro client (ou
       * nom + téléphone), puis on rattache les autres pièces au dossier qui
       * contient ce PDF. Cela évite qu'un dossier soit fusionné avec un autre
       * ou qu'il soit ignoré simplement parce que sa profondeur de dossier
       * n'est pas identique.
       */
      const relPath = (file: File) => String((file as any).webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      const parentDir = (file: File) => {
        const rel = relPath(file);
        const parts = rel.split('/').filter(Boolean);
        return parts.slice(0, -1).join('/');
      };
      const normalizeKey = (v: any) => String(v || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      const pdfFiles = selected.filter(f => /\.pdf$/i.test(f.name));
      const parsedPdfEntries: { file: File; parsed: LegacyPdfParsed; dir: string; key: string }[] = [];
      for (const file of pdfFiles) {
        try {
          const parsed = await parseLegacyClientPdf(file);
          if (!parsed) continue;
          const key = parsed.numeroClient
            ? `numero:${normalizeKey(parsed.numeroClient)}`
            : `client:${normalizeKey(parsed.nom)}|tel:${normalizeKey(parsed.telephone)}`;
          if (parsed.nom || parsed.numeroClient) parsedPdfEntries.push({ file, parsed, dir: parentDir(file), key });
        } catch { /* le PDF reste conservé ; il pourra être signalé si aucune facture exploitable n'est trouvée */ }
      }

      const groups = new Map<string, File[]>();
      const groupLabels = new Map<string, string>();
      const groupRoots = new Map<string, string[]>();

      // 1) Les PDF reconnaissables déterminent les dossiers clients.
      for (const entry of parsedPdfEntries) {
        if (!groups.has(entry.key)) groups.set(entry.key, []);
        const arr = groups.get(entry.key)!;
        if (!arr.includes(entry.file)) arr.push(entry.file);
        const roots = groupRoots.get(entry.key) || [];
        if (entry.dir && !roots.includes(entry.dir)) roots.push(entry.dir);
        groupRoots.set(entry.key, roots);
        if (!groupLabels.has(entry.key)) {
          const label = entry.parsed.numeroClient
            ? `Client ${entry.parsed.numeroClient}${entry.parsed.nom ? ` — ${entry.parsed.nom}` : ''}`
            : (entry.parsed.nom || entry.file.name);
          groupLabels.set(entry.key, label);
        }
      }

      // 2) Les autres pièces sont rattachées au dossier dont le chemin est
      //    l'ancêtre le plus long. Ainsi les sous-dossiers (assurance, docs...)
      //    restent avec le bon client.
      for (const file of selected) {
        if (/\.pdf$/i.test(file.name)) {
          // Le PDF a déjà été affecté ci-dessus lorsqu'il est lisible.
          const parsedEntry = parsedPdfEntries.find(e => e.file === file);
          if (parsedEntry) continue;
        }
        const rel = relPath(file);
        let bestKey = '';
        let bestRootLen = -1;
        for (const [key, roots] of groupRoots.entries()) {
          for (const root of roots) {
            const prefix = root ? `${root}/` : '';
            if (rel === root || rel.startsWith(prefix)) {
              if (root.length > bestRootLen) {
                bestRootLen = root.length;
                bestKey = key;
              }
            }
          }
        }
        if (bestKey) groups.get(bestKey)!.push(file);
      }

      // 3) Si aucun PDF n'a pu être reconnu, on garde un fallback par dossier
      //    afin que l'utilisateur obtienne une erreur précise au lieu d'un import
      //    silencieusement perdu.
      if (!groups.size) {
        const fallback = new Map<string, File[]>();
        for (const file of selected) {
          const rel = relPath(file);
          const parts = rel.split('/').filter(Boolean);
          const group = parts.length >= 2 ? parts.slice(0, -1).join('/') : 'Dossier unique';
          if (!fallback.has(group)) fallback.set(group, []);
          fallback.get(group)!.push(file);
        }
        for (const [k, v] of fallback) { groups.set(`fallback:${k}`, v); groupLabels.set(`fallback:${k}`, k); }
      }

      const results: string[] = [];
      let ok = 0, failed = 0;
      for (const [groupKey, groupFiles] of groups) {
        const groupName = groupLabels.get(groupKey) || groupKey.replace(/^fallback:/, '');
        try {
          const payload = await buildPayloadFromPdfGroup(groupFiles, groupName);
          if (!payload) {
            failed++;
            results.push(`❌ ${groupName} : facture PDF non lisible ou informations insuffisantes (nom, date de vente ou total net manquant)`);
            continue;
          }
          const result = await importerDossierClient(payload as any);
          ok++;
          results.push(`✅ ${groupName} : ${payload.nom} · vente ${result.venteId}`);
        } catch (e: any) {
          failed++; results.push(`❌ ${groupName} : ${e?.message || 'échec de l’import'}`);
        }
      }
      setBatchMessage(`Import groupé terminé : ${ok} dossier(s) importé(s), ${failed} échec(s) sur ${groups.size}.

${results.join('\n')}`);
    } finally { setBatchImporting(false); }
  };

  const onFolder = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(ev.target.files || []);
    setFiles(selected);
    setParsed(null); setMessage(''); setError('');
    setLoadingFiles(true);
    try {
      const structured = selected.filter(f => /\.(json|csv|xlsx?|xls)$/i.test(f.name));
      let best: ParsedData | null = null;
      for (const f of structured) {
        const p = await parseStructuredFile(f);
        if (p) { best = p; break; }
      }
      if (best) { setParsed(best); applyParsed(best); }

      // Les anciens logiciels exportent souvent uniquement la facture en PDF.
      // On analyse aussi les PDF et récupère notamment la conseillère/vendeur.
      const pdfs = selected.filter(f => /\.pdf$/i.test(f.name));
      const parsedPdfs: LegacyPdfParsed[] = [];
      for (const f of pdfs) {
        try {
          const p = await parseLegacyClientPdf(f);
          if (p) parsedPdfs.push(p);
        } catch { /* PDF illisible : les pièces restent conservées */ }
      }
      const pdfBest = mergeLegacyPdfData(parsedPdfs);
      if (pdfBest) {
        applyParsedPdf(pdfBest);
        setMessage(`${parsedPdfs.length} PDF analysé(s) automatiquement (${pdfs.length} sélectionné(s)). ${pdfBest.sourceFile}${pdfBest.conseillere ? ` · conseillère : ${pdfBest.conseillere}` : ''}. Tous les PDF seront conservés dans le dossier.`);
      } else if (!best && selected.length) {
        setMessage('Dossier chargé. Aucun fichier structuré/PDF lisible automatiquement : les PDF, images et autres pièces seront quand même conservés dans le dossier.');
      }
    } finally { setLoadingFiles(false); }
  };

  const onPdfFiles = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(ev.target.files || []);
    if (!selected.length) return;
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}|${f.size}|${f.lastModified}`));
      return [...prev, ...selected.filter(f => !seen.has(`${f.name}|${f.size}|${f.lastModified}`))];
    });
    setMessage(''); setError(''); setLoadingFiles(true);
    try {
      const parsedPdfs: LegacyPdfParsed[] = [];
      for (const f of selected) {
        try {
          const p = await parseLegacyClientPdf(f);
          if (p) parsedPdfs.push(p);
        } catch { /* le PDF reste conservé comme pièce */ }
      }
      const best = mergeLegacyPdfData(parsedPdfs);
      if (best) {
        applyParsedPdf(best);
        setMessage(`${parsedPdfs.length} PDF analysé(s) automatiquement (${selected.length} sélectionné(s)). ${best.sourceFile}${best.conseillere ? ` · conseillère : ${best.conseillere}` : ''}. Tous les PDF seront conservés dans le dossier.`);
      } else {
        setMessage('PDF ajouté au dossier. Il sera conservé comme pièce jointe ; s’il s’agit d’un PDF scanné/image, les champs devront être complétés manuellement.');
      }
    } finally { setLoadingFiles(false); }
  };

  const jsonArray = (s: string): any[] => {
    if (!s.trim()) return [];
    try { const x = JSON.parse(s); return Array.isArray(x) ? x : [x]; } catch { return []; }
  };

  const totals = useMemo(() => ({
    acompte: parseMoney(form.acompte),
    assurance: jsonArray(form.assuranceJson).reduce((s, b) => s + parseMoney(b?.montant ?? b?.total ?? b?.montantAssurance), 0),
    documents: files.length,
  }), [form.acompte, form.assuranceJson, files.length]);

  const handleImport = async () => {
    setError(''); setMessage('');
    if (!magasinId || !form.nom.trim() || !form.venteDate || parseMoney(form.totalNet) <= 0) {
      setError('Renseigne au minimum le magasin, le nom du client, la date d’origine de la vente et le total net.'); return;
    }
    setImporting(true);
    try {
      const docs = await Promise.all(files.map(fileToImportDocument));
      const reglements = jsonArray(form.reglementsJson) as ImportReglementInput[];
      if (parseMoney(form.acompte) > 0 && !reglements.some(r => parseMoney(r.montant) === parseMoney(form.acompte) && normalizeDate(r.date) === normalizeDate(form.acompteDate))) {
        // L'acompte est créé séparément par le service.
      }
      const result = await importerDossierClient({
        magasinId,
        numeroClient: form.numeroClient,
        civilite: form.civilite,
        nom: form.nom,
        telephone: form.telephone,
        telephone2: form.telephone2,
        email: form.email,
        adresse: form.adresse,
        profession: form.profession,
        dateNaissance: normalizeDate(form.dateNaissance),
        matriculeAssurance: form.matriculeAssurance,
        entreprise: form.entreprise,
        ophtalmologue: form.ophtalmologue,
        telOphtalmologue: form.telOphtalmologue,
        cabinetOphtalmologue: form.cabinetOphtalmologue,
        telCabinet: form.telCabinet,
        solde: parseMoney(form.solde),
        venteDate: normalizeDate(form.venteDate),
        totalBrut: parseMoney(form.totalBrut),
        totalNet: parseMoney(form.totalNet),
        remisePct: Number(form.remisePct) || 0,
        acompteInitial: parseMoney(form.acompte),
        acompteDate: normalizeDate(form.acompteDate) || normalizeDate(form.venteDate),
        modePaiementAcompte: form.modePaiement,
        compteBanqueAcompte: form.compteBanque,
        detailsAcompte: form.detailsAcompte,
        articles: jsonArray(form.articlesJson),
        verres: jsonArray(form.verresJson),
        bonsAssurance: jsonArray(form.assuranceJson),
        ordonnance: form.ordonnanceJson.trim() ? (() => { try { return JSON.parse(form.ordonnanceJson); } catch { return { texte: form.ordonnanceJson }; } })() : null,
        reglements,
        documents: docs,
        notesImport: form.notes,
        sourceLogiciel: form.sourceLogiciel,
        conseillere: form.conseillere,
        numeroFacture: form.numeroFacture,
        rdvRetrait: normalizeDate(form.rdvRetrait),
        dateRecuperation: normalizeDate(form.dateRecuperation),
      });
      setMessage(`Import réussi. Client ${result.clientId}, vente ${result.venteId}. ${result.reglementIds.length} règlement(s) et ${result.documents} pièce(s) importé(s). La vente porte sa date d'origine ${normalizeDate(form.venteDate)} pour les tableaux de bord.`);
    } catch (e: any) {
      setError(e?.message || 'L’import a échoué.');
    } finally { setImporting(false); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="bg-white rounded-xl shadow border p-5">
        <div className="flex items-center gap-3">
          <Package className="text-blue-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Importer un ancien dossier client</h1>
            <p className="text-sm text-gray-500">Le dossier devient une vraie vente historique du magasin, avec paiements, assurance, ordonnance et pièces jointes.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border p-5 space-y-4">
        {!routeMagasinId && <div>
          <label className="block text-sm font-semibold mb-1">Magasin de destination</label>
          <select className="border rounded-lg px-3 py-2 w-full max-w-md" value={magasinId} onChange={e => setMagasinId(e.target.value)}>
            {magasins.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold mb-2"><FolderOpen size={17} /> Dossier de l'ancien client</label>
          <input type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} onChange={onFolder as any} className="block w-full border rounded-lg p-3" />
          <p className="text-xs text-gray-500 mt-2">Tu peux sélectionner tout le dossier client. JSON, CSV, Excel et PDF sont analysés automatiquement quand ils existent. Le PDF de facture permet notamment de récupérer la conseillère/vendeur, la date, le client et les montants ; le PDF original est aussi conservé comme pièce du dossier.</p>
          <div className="mt-4 border-2 border-dashed border-indigo-200 bg-indigo-50 rounded-xl p-4">
            <label className="flex items-center gap-2 text-sm font-bold mb-2 text-indigo-900"><Users size={18}/> Importer plusieurs dossiers clients en une seule fois</label>
            <input type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} onChange={onMultipleClientsFolder as any} className="block w-full border rounded-lg p-3 bg-white" />
            <p className="text-xs text-indigo-800 mt-2">Sélectionne le <b>grand dossier qui contient plusieurs dossiers clients</b>. Chaque sous-dossier est traité comme un client séparé, avec sa facture PDF, ordonnance, assurance et toutes ses pièces. Les ventes gardent leur date d'origine.</p>
          </div>
          <div className="border-t pt-3">
            <label className="flex items-center gap-2 text-sm font-semibold mb-2"><FileText size={17}/> Ou importer une ou plusieurs pièces PDF du dossier client</label>
            <input type="file" accept="application/pdf,.pdf" multiple onChange={onPdfFiles} className="block w-full border rounded-lg p-3" />
            <p className="text-xs text-gray-500 mt-2">Tu peux sélectionner plusieurs PDF en une seule fois : facture, ordonnance, assurance, justificatifs, etc. Ils sont tous conservés dans le même dossier. Les PDF lisibles sont analysés ensemble et les informations manquantes sont complétées automatiquement. Un PDF scanné reste importé comme pièce jointe.</p>
          </div>
        </div>
        {loadingFiles && <div className="text-sm text-blue-700 flex items-center gap-2"><Loader2 className="animate-spin" size={16}/> Analyse du dossier…</div>}
        {batchImporting && <div className="text-sm text-indigo-700 flex items-center gap-2"><Loader2 className="animate-spin" size={16}/> Import de plusieurs dossiers clients en cours…</div>}
        {batchMessage && <div className="whitespace-pre-line text-sm bg-indigo-50 border border-indigo-200 rounded-lg p-4">{batchMessage}</div>}
        {files.length > 0 && <div className="text-sm bg-blue-50 rounded-lg p-3">{files.length} fichier(s) trouvé(s) · {files.map(f => f.name).slice(0, 8).join(', ')}{files.length > 8 ? '…' : ''}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-white rounded-xl shadow border p-5 space-y-3">
          <h2 className="font-bold text-lg">1. Client</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['numeroClient','N° Client'],['civilite','Civilité'],['nom','Nom & prénoms'],['telephone','Téléphone'],['telephone2','Téléphone II'],['email','Email'],['adresse','Adresse'],['profession','Profession'],['dateNaissance','Date naissance'],['matriculeAssurance','Matricule assurance'],['entreprise','Entreprise'],['ophtalmologue','Ophtalmologue']
            ].map(([k,l]) => <label key={k} className="text-sm"><span className="block font-semibold mb-1">{l}</span><input className="w-full border rounded-lg px-3 py-2" value={(form as any)[k]} onChange={e => update(k,e.target.value)} /></label>)}
          </div>
        </section>

        <section className="bg-white rounded-xl shadow border p-5 space-y-3">
          <h2 className="font-bold text-lg">2. Vente historique</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="block font-semibold mb-1">Date d'origine</span><input type="date" className="w-full border rounded-lg px-3 py-2" value={form.venteDate} onChange={e=>update('venteDate',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Source / ancien logiciel</span><input className="w-full border rounded-lg px-3 py-2" value={form.sourceLogiciel} onChange={e=>update('sourceLogiciel',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Conseillère / vendeur de la vente</span><input className="w-full border rounded-lg px-3 py-2" value={form.conseillere} onChange={e=>update('conseillere',e.target.value)} placeholder="Détecté automatiquement depuis la facture PDF" /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">N° facture d'origine</span><input className="w-full border rounded-lg px-3 py-2" value={form.numeroFacture} onChange={e=>update('numeroFacture',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Rendez-vous</span><input type="date" className="w-full border rounded-lg px-3 py-2" value={form.rdvRetrait} onChange={e=>update('rdvRetrait',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Date récupération</span><input type="date" className="w-full border rounded-lg px-3 py-2" value={form.dateRecuperation} onChange={e=>update('dateRecuperation',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Total brut</span><input type="number" className="w-full border rounded-lg px-3 py-2" value={form.totalBrut} onChange={e=>update('totalBrut',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Total net</span><input type="number" className="w-full border rounded-lg px-3 py-2" value={form.totalNet} onChange={e=>update('totalNet',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Remise %</span><input type="number" className="w-full border rounded-lg px-3 py-2" value={form.remisePct} onChange={e=>update('remisePct',e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <label className="text-sm"><span className="block font-semibold mb-1">Acompte initial</span><input type="number" className="w-full border rounded-lg px-3 py-2" value={form.acompte} onChange={e=>update('acompte',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Date acompte</span><input type="date" className="w-full border rounded-lg px-3 py-2" value={form.acompteDate} onChange={e=>update('acompteDate',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Mode paiement</span><input className="w-full border rounded-lg px-3 py-2" value={form.modePaiement} onChange={e=>update('modePaiement',e.target.value)} /></label>
            <label className="text-sm"><span className="block font-semibold mb-1">Compte banque</span><input className="w-full border rounded-lg px-3 py-2" value={form.compteBanque} onChange={e=>update('compteBanque',e.target.value)} /></label>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-xl shadow border p-5 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2"><ShieldCheck size={19}/> 3. Assurance, ordonnance et contenu de la vente</h2>
        <p className="text-xs text-gray-500">Les zones JSON sont préremplies si le dossier exporté contient ces informations. Elles permettent de conserver les champs exacts de l'ancien logiciel sans les perdre.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[['ordonnanceJson','Ordonnance'],['articlesJson','Montures / articles'],['verresJson','Verres / prescription'],['assuranceJson','Bons d’assurance'],['reglementsJson','Règlements complémentaires']].map(([k,l]) => <label key={k} className="text-sm"><span className="block font-semibold mb-1">{l}</span><textarea rows={6} className="w-full border rounded-lg px-3 py-2 font-mono text-xs" value={(form as any)[k]} onChange={e=>update(k,e.target.value)} placeholder="[] ou { ... }" /></label>)}
        </div>
      </section>

      <section className="bg-white rounded-xl shadow border p-5 space-y-3">
        <h2 className="font-bold text-lg flex items-center gap-2"><FileText size={19}/> 4. Notes et pièces</h2>
        <textarea className="w-full border rounded-lg px-3 py-2" rows={3} placeholder="Notes de migration / informations complémentaires" value={form.notes} onChange={e=>update('notes',e.target.value)} />
        <div className="flex flex-wrap gap-4 text-sm text-gray-600"><span>{totals.documents} pièce(s)</span><span>Acompte : {totals.acompte.toLocaleString('fr-FR')} F CFA</span><span>Assurance : {totals.assurance.toLocaleString('fr-FR')} F CFA</span></div>
      </section>

      {parsed && <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm flex gap-2"><CheckCircle2 className="text-green-700 shrink-0" size={18}/><span>Données détectées automatiquement depuis <b>{parsed.sourceFile}</b>. Vérifie les champs avant de lancer l’import.</span></div>}
      {message && <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-sm text-green-800">{message}</div>}
      {error && <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-sm text-red-800 flex gap-2"><AlertTriangle size={18}/>{error}</div>}

      <button disabled={importing} onClick={handleImport} className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2">
        {importing ? <><Loader2 className="animate-spin"/> Importation en cours…</> : <><Upload/> IMPORTER LE DOSSIER COMME UNE VENTE HISTORIQUE</>}
      </button>
      <div className="text-xs text-gray-500 flex items-start gap-2"><CalendarDays size={15} className="mt-0.5"/> La date d'origine est conservée sur la vente. Les acomptes et règlements sont également enregistrés avec leurs dates d'origine afin que les tableaux de bord retrouvent la vente dans son mois historique.</div>
    </div>
  );
}
