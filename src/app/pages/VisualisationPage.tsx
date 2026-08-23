import { useState, useEffect, useMemo } from 'react';
import { X, Printer, FileSpreadsheet, Search } from 'lucide-react';
import { chargerToutesLesVentes, type VenteSupabase } from '../services/ventesService';
import { chargerTousLesReglements, type ReglementSupabase } from '../services/reglementsService';
import {
  chargerRelevesAssurance, chargerFacturesAssurance,
  type ReleveAssuranceRow, type FactureAssuranceRow,
} from '../services/assuranceService';
import { chargerTousLesClients, type ClientRow } from '../services/clientsService';
import { chargerBons, type BonRow } from '../services/bonsService';
import { chargerBonsCommandeVerres, type BonCommandeVerreRow } from '../services/atelierService';
import { chargerInventaires, type InventaireRow } from '../services/inventairesService';
import { loadStocksParMagasin, type StockMagasin } from '../services/inventaireService';
import { getAllMagasinIds } from '../constants/magasins';
import { pdfHeader, excelHeaderRows } from '../utils/documentHeader';
import { TENANT } from '../config/tenant';

type ReportType =
  | 'bons-monture' | 'bons-verre' | 'stock' | 'inventaires'
  | 'mouvements' | 'recap-activites' | 'recap-verres' | 'recap-montures'
  | 'recap-accessoires' | 'recap-traitements' | 'devis-proforma' | 'ventes-factures'
  | 'sav' | 'reglements' | 'recap-releves' | 'ca-assurances'
  | 'ca-ophtalmologues' | 'ca-cabinets' | 'clients';

interface Column { label: string; align?: 'right' }
interface Row { key: string; cells: string[]; search: string }
interface ReportView { title: string; fileName: string; headers: Column[]; rows: Row[]; footer?: string }

export function VisualisationPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('ventes-factures');

  // Filtres généraux
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [magasin, setMagasin] = useState('Tous les Magasins');
  const [modePaiement, setModePaiement] = useState('Tous Règlements');
  const [recherche, setRecherche] = useState('');

  // Données brutes chargées selon le rapport actif
  const [ventes, setVentes] = useState<VenteSupabase[]>([]);
  const [reglements, setReglements] = useState<ReglementSupabase[]>([]);
  const [releves, setReleves] = useState<ReleveAssuranceRow[]>([]);
  const [facturesAss, setFacturesAss] = useState<FactureAssuranceRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [bons, setBons] = useState<BonRow[]>([]);
  const [bonsVerres, setBonsVerres] = useState<BonCommandeVerreRow[]>([]);
  const [inventaires, setInventaires] = useState<InventaireRow[]>([]);
  const [stocks, setStocks] = useState<StockMagasin[]>([]);
  const [chargement, setChargement] = useState(false);

  // À quelle source de données correspond chaque rapport.
  const sourceOf = (r: ReportType): string => {
    switch (r) {
      case 'mouvements': case 'reglements': return 'reglements';
      case 'recap-releves': return 'releves';
      case 'ca-assurances': return 'factures-assurance';
      case 'clients': return 'clients';
      case 'bons-monture': return 'bons';
      case 'bons-verre': return 'bons-verres';
      case 'inventaires': return 'inventaires';
      case 'stock': return 'stock';
      default: return 'ventes'; // recap-activites/verres/montures/..., devis, ventes, sav, ca-ophtalmo/cabinet
    }
  };

  useEffect(() => {
    let annule = false;
    const src = sourceOf(activeReport);
    const allIds = getAllMagasinIds();
    async function charger() {
      setChargement(true);
      try {
        if (src === 'ventes') {
          const d = await chargerToutesLesVentes(); if (!annule) setVentes(d);
        } else if (src === 'reglements') {
          const d = await chargerTousLesReglements(); if (!annule) setReglements(d);
        } else if (src === 'releves') {
          const d = await chargerRelevesAssurance(); if (!annule) setReleves(d);
        } else if (src === 'factures-assurance') {
          const arrs = await Promise.all(allIds.map(id => chargerFacturesAssurance(id)));
          if (!annule) setFacturesAss(arrs.flat());
        } else if (src === 'clients') {
          const map = await chargerTousLesClients(allIds);
          if (!annule) setClients(Object.values(map).flat());
        } else if (src === 'bons') {
          const d = await chargerBons(allIds); if (!annule) setBons(d);
        } else if (src === 'bons-verres') {
          const d = await chargerBonsCommandeVerres(); if (!annule) setBonsVerres(d || []);
        } else if (src === 'inventaires') {
          const d = await chargerInventaires(allIds); if (!annule) setInventaires(d);
        } else if (src === 'stock') {
          const map = await loadStocksParMagasin(allIds);
          if (!annule) setStocks(Object.values(map).flat());
        }
      } finally {
        if (!annule) setChargement(false);
      }
    }
    charger();
    return () => { annule = true; };
  }, [activeReport]);

  // ── Helpers de filtrage ─────────────────────────────────────────────────────
  const parseFiltreDate = (s: string): Date | null => {
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const dansIntervalle = (isoDate?: string | null): boolean => {
    const d = isoDate ? new Date(isoDate) : null;
    if (!d || isNaN(d.getTime())) return true;
    const debut = parseFiltreDate(dateDebut);
    const fin = parseFiltreDate(dateFin);
    if (debut && d < new Date(debut.getFullYear(), debut.getMonth(), debut.getDate())) return false;
    if (fin && d > new Date(fin.getFullYear(), fin.getMonth(), fin.getDate(), 23, 59, 59)) return false;
    return true;
  };

  const magasinOk = (magId?: string | null): boolean => {
    if (magasin === 'Tous les Magasins') return true;
    return (magId || '').toUpperCase() === magasin.toUpperCase();
  };

  const fmtMontant = (n?: number) => (typeof n === 'number' && !isNaN(n) ? n : 0).toLocaleString('fr-FR') + ' FCFA';
  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr-FR');
  };
  const num = (v: any): number => { const n = Number(v); return isNaN(n) ? 0 : n; };

  // Montant total d'une vente/devis (gère devis à propositions).
  const montantVente = (v: VenteSupabase): number => {
    if (num(v.total_net) > 0) return num(v.total_net);
    if (num(v.total_brut) > 0) return num(v.total_brut);
    const props = Array.isArray(v.verres) ? (v.verres as any[]) : [];
    return props.reduce((s, p) => s + (p && typeof p === 'object' && 'totalNet' in p ? num(p.totalNet) : 0), 0);
  };
  const numDoc = (v: VenteSupabase): string => {
    const r: any = v.recap || {};
    return r.numDevis || r.numFacture || v.numero_client || '';
  };
  const modePaiementVente = (v: VenteSupabase): string => (v.recap as any)?.modePaiement || '';

  const mkRow = (key: string, cells: string[]): Row => ({ key, cells, search: cells.join(' ').toLowerCase() });

  // Explose les lignes verres/articles d'une vente pour les récapitulatifs.
  const lignesArticles = (v: VenteSupabase, type: string): { designation: string; qte: string; prix: string; total: string }[] => {
    const arts = Array.isArray(v.articles) ? (v.articles as any[]) : [];
    return arts
      .filter(a => (a?.type || '') === type)
      .map(a => ({ designation: a.designation || '', qte: String(a.quantite || ''), prix: fmtMontant(num(a.prix)), total: fmtMontant(num(a.total)) }));
  };
  const lignesVerres = (v: VenteSupabase): { designation: string; prix: string }[] => {
    const vs = Array.isArray(v.verres) ? (v.verres as any[]) : [];
    return vs
      .filter(x => x && typeof x === 'object' && !('totalNet' in x)) // exclut propositions de devis
      .map(x => ({
        designation: [x.typeVerre, x.verre, x.traitement, x.matiere].filter(Boolean).join(' · '),
        prix: fmtMontant(num(x.total || x.totalVerres || x.oeilDroit?.prix)),
      }));
  };

  // ── Construction de la vue selon le rapport ────────────────────────────────
  const view: ReportView = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const build = (title: string, fileName: string, headers: Column[], rows: Row[], footer?: string): ReportView => ({
      title, fileName, headers, rows: rows.filter(r => !q || r.search.includes(q)), footer,
    });

    switch (activeReport) {
      // ── Ventes-based ────────────────────────────────────────────────────────
      case 'ventes-factures':
      case 'devis-proforma':
      case 'sav': {
        const isDevis = activeReport === 'devis-proforma';
        const filtered = ventes
          .filter(v => activeReport === 'sav' ? montantVente(v) <= 5 : (isDevis ? v.type === 'devis' : v.type !== 'devis'))
          .filter(v => dansIntervalle(v.date))
          .filter(v => magasinOk(v.magasin_id));
        const rows = filtered.map(v => mkRow(v.id, [
          fmtDate(v.date), numDoc(v), v.numero_client || '', v.client || '',
          v.telephone || '', v.magasin_id || '', v.edite_par || '', fmtMontant(montantVente(v)),
        ]));
        const total = filtered.reduce((s, v) => s + montantVente(v), 0);
        const title = activeReport === 'sav' ? 'SAV (ventes ≤ 5 FCFA)' : isDevis ? 'DEVIS | PROFORMA' : 'VENTES | FACTURES';
        return build(title, isDevis ? 'Devis' : activeReport === 'sav' ? 'SAV' : 'Ventes',
          [{ label: 'Date' }, { label: 'N° Doc' }, { label: 'N° Client' }, { label: 'Client' }, { label: 'Téléphone' }, { label: 'Magasin' }, { label: 'Édité par' }, { label: 'Total', align: 'right' }],
          rows, `Total : ${fmtMontant(total)}`);
      }
      case 'recap-activites': {
        const filtered = ventes.filter(v => v.type !== 'devis').filter(v => dansIntervalle(v.date)).filter(v => magasinOk(v.magasin_id));
        const rows = filtered.map(v => mkRow(v.id, [
          fmtDate(v.date), numDoc(v), v.client || '', v.magasin_id || '',
          modePaiementVente(v), v.edite_par || '', fmtMontant(montantVente(v)),
        ]));
        const total = filtered.reduce((s, v) => s + montantVente(v), 0);
        return build('RÉCAPITULATIF ACTIVITÉS', 'Recap_Activites',
          [{ label: 'Date' }, { label: 'N° Doc' }, { label: 'Client' }, { label: 'Magasin' }, { label: 'Paiement' }, { label: 'Édité par' }, { label: 'Total', align: 'right' }],
          rows, `Chiffre d'affaires : ${fmtMontant(total)}`);
      }
      case 'recap-verres':
      case 'recap-montures':
      case 'recap-accessoires':
      case 'recap-traitements': {
        const filtered = ventes.filter(v => v.type !== 'devis').filter(v => dansIntervalle(v.date)).filter(v => magasinOk(v.magasin_id));
        const rows: Row[] = [];
        if (activeReport === 'recap-verres') {
          filtered.forEach(v => lignesVerres(v).forEach((l, i) => rows.push(mkRow(`${v.id}-${i}`, [
            fmtDate(v.date), numDoc(v), v.client || '', v.magasin_id || '', l.designation, l.prix,
          ]))));
          return build('RÉCAPITULATIF ACTIVITÉS VERRES', 'Recap_Verres',
            [{ label: 'Date' }, { label: 'N° Doc' }, { label: 'Client' }, { label: 'Magasin' }, { label: 'Verre' }, { label: 'Prix', align: 'right' }],
            rows);
        }
        const type = activeReport === 'recap-montures' ? 'monture' : activeReport === 'recap-accessoires' ? 'accessoire' : 'traitement';
        const label = type === 'monture' ? 'MONTURES' : type === 'accessoire' ? 'ACCESSOIRES' : 'TRAITEMENTS';
        filtered.forEach(v => lignesArticles(v, type).forEach((l, i) => rows.push(mkRow(`${v.id}-${i}`, [
          fmtDate(v.date), numDoc(v), v.client || '', v.magasin_id || '', l.designation, l.qte, l.prix, l.total,
        ]))));
        return build(`RÉCAPITULATIF ACTIVITÉS ${label}`, `Recap_${label}`,
          [{ label: 'Date' }, { label: 'N° Doc' }, { label: 'Client' }, { label: 'Magasin' }, { label: 'Désignation' }, { label: 'Qté' }, { label: 'Prix', align: 'right' }, { label: 'Total', align: 'right' }],
          rows);
      }
      case 'ca-ophtalmologues':
      case 'ca-cabinets': {
        const byOphtalmo = activeReport === 'ca-ophtalmologues';
        const filtered = ventes.filter(v => v.type !== 'devis').filter(v => dansIntervalle(v.date)).filter(v => magasinOk(v.magasin_id));
        const agg = new Map<string, { montant: number; nb: number }>();
        filtered.forEach(v => {
          const key = ((byOphtalmo ? v.ophtalmologue : v.cabinet_ophtalmologue) || '—').trim() || '—';
          const cur = agg.get(key) || { montant: 0, nb: 0 };
          cur.montant += montantVente(v); cur.nb += 1; agg.set(key, cur);
        });
        const rows = [...agg.entries()]
          .sort((a, b) => b[1].montant - a[1].montant)
          .map(([nom, d], i) => mkRow(String(i), [nom, String(d.nb), fmtMontant(d.montant)]));
        const total = filtered.reduce((s, v) => s + montantVente(v), 0);
        return build(byOphtalmo ? "CHIFFRE D'AFFAIRES OPHTALMOLOGUES" : "CHIFFRE D'AFFAIRES CABINETS",
          byOphtalmo ? 'CA_Ophtalmologues' : 'CA_Cabinets',
          [{ label: byOphtalmo ? 'Ophtalmologue' : 'Cabinet' }, { label: 'Nb ventes' }, { label: 'CA', align: 'right' }],
          rows, `Total : ${fmtMontant(total)}`);
      }
      // ── Règlements / Mouvements financiers ────────────────────────────────────
      case 'mouvements':
      case 'reglements': {
        const filtered = reglements
          .filter(r => dansIntervalle(r.date))
          .filter(r => magasinOk(r.magasin_id))
          .filter(r => modePaiement === 'Tous Règlements' ? true : (r.mode_paiement || '').toLowerCase() === modePaiement.toLowerCase());
        const rows = filtered.map(r => mkRow(r.id, [
          fmtDate(r.date), r.recu || '', r.mode_paiement || '', r.compte_banque || '',
          r.magasin_id || '', r.edite_par || '', fmtMontant(num(r.montant)),
        ]));
        const total = filtered.reduce((s, r) => s + num(r.montant), 0);
        return build(activeReport === 'mouvements' ? 'MOUVEMENTS FINANCIERS' : 'RÈGLEMENTS',
          activeReport === 'mouvements' ? 'Mouvements' : 'Reglements',
          [{ label: 'Date' }, { label: 'Reçu' }, { label: 'Mode de paiement' }, { label: 'Compte/Banque' }, { label: 'Magasin' }, { label: 'Édité par' }, { label: 'Montant', align: 'right' }],
          rows, `Total encaissé : ${fmtMontant(total)}`);
      }
      // ── Assurances ────────────────────────────────────────────────────────────
      case 'recap-releves': {
        const filtered = releves.filter(r => dansIntervalle(r.date_releve)).filter(r => magasinOk(r.magasin_id));
        const rows = filtered.map(r => mkRow(r.id, [
          fmtDate(r.date_releve), r.assurance || '', r.magasin_id || '', fmtMontant(num(r.montant)),
        ]));
        const total = filtered.reduce((s, r) => s + num(r.montant), 0);
        return build('RÉCAPITULATIF RELEVÉS', 'Releves',
          [{ label: 'Date' }, { label: 'Assurance' }, { label: 'Magasin' }, { label: 'Montant', align: 'right' }],
          rows, `Total : ${fmtMontant(total)}`);
      }
      case 'ca-assurances': {
        const filtered = facturesAss.filter(f => dansIntervalle(f.date_facture)).filter(f => magasinOk(f.magasin_id));
        const rows = filtered.map(f => mkRow(f.id, [
          fmtDate(f.date_facture), f.numero || '', f.client_nom || '', f.assurance || '',
          f.magasin_id || '', fmtMontant(num(f.part_assurance)), fmtMontant(num(f.montant_total)),
        ]));
        const total = filtered.reduce((s, f) => s + num(f.part_assurance), 0);
        return build("CHIFFRE D'AFFAIRES ASSURANCES", 'CA_Assurances',
          [{ label: 'Date' }, { label: 'N° Facture' }, { label: 'Client' }, { label: 'Assurance' }, { label: 'Magasin' }, { label: 'Part assurance', align: 'right' }, { label: 'Total', align: 'right' }],
          rows, `Total part assurance : ${fmtMontant(total)}`);
      }
      // ── Clients ────────────────────────────────────────────────────────────────
      case 'clients': {
        const filtered = clients.filter(c => magasinOk(c.magasin_id));
        const rows = filtered.map(c => mkRow(c.id, [
          c.numero_client || '', c.nom || '', c.telephone || '', c.email || '',
          c.magasin_id || '', c.profession || '', fmtMontant(num(c.solde)),
        ]));
        return build('CLIENTS', 'Clients',
          [{ label: 'N° Client' }, { label: 'Nom' }, { label: 'Téléphone' }, { label: 'Email' }, { label: 'Magasin' }, { label: 'Profession' }, { label: 'Solde', align: 'right' }],
          rows, `${filtered.length} client(s)`);
      }
      // ── Bons de commande ────────────────────────────────────────────────────────
      case 'bons-monture': {
        const filtered = bons
          .filter(b => b.type === 'commande')
          .filter(b => dansIntervalle(b.date))
          .filter(b => magasinOk(b.magasin_source) || magasinOk(b.magasin_destination));
        const rows = filtered.map(b => mkRow(b.id, [
          fmtDate(b.date), b.numero || '', b.magasin_source || b.magasin_destination || '',
          b.responsable || '', String((b.items || []).length), b.statut || '',
        ]));
        return build('ÉTAT BONS DE COMMANDE MONTURE / ACCESSOIRE', 'Bons_Commande',
          [{ label: 'Date' }, { label: 'N°' }, { label: 'Magasin' }, { label: 'Responsable' }, { label: 'Nb articles' }, { label: 'Statut' }],
          rows);
      }
      case 'bons-verre': {
        const filtered = bonsVerres
          .filter(b => dansIntervalle(b.date))
          .filter(b => magasinOk(b.magasin || b.officine));
        const rows = filtered.map(b => mkRow(b.id, [
          fmtDate(b.date), b.num_bc || b.num_ref || '', b.fournisseur || '', b.client || '',
          b.magasin || b.officine || '', b.statut || '', fmtMontant(num(b.total_net)),
        ]));
        const total = filtered.reduce((s, b) => s + num(b.total_net), 0);
        return build('ÉTAT BONS DE COMMANDE VERRE', 'Bons_Verres',
          [{ label: 'Date' }, { label: 'N° BC' }, { label: 'Fournisseur' }, { label: 'Client' }, { label: 'Magasin' }, { label: 'Statut' }, { label: 'Total', align: 'right' }],
          rows, `Total : ${fmtMontant(total)}`);
      }
      case 'inventaires': {
        const filtered = inventaires.filter(iv => dansIntervalle(iv.date_inventaire)).filter(iv => magasinOk(iv.magasin_id));
        const rows = filtered.map(iv => mkRow(iv.id, [
          fmtDate(iv.date_inventaire), iv.magasin_id || '', iv.responsable || '',
          String((Array.isArray(iv.items) ? iv.items.length : 0)), String(num(iv.total_ecarts)),
        ]));
        return build('ÉTAT INVENTAIRES', 'Inventaires',
          [{ label: 'Date' }, { label: 'Magasin' }, { label: 'Responsable' }, { label: 'Nb articles' }, { label: 'Écarts' }],
          rows);
      }
      case 'stock': {
        const filtered = stocks.filter(s => magasinOk(s.magasinId));
        const rows = filtered.map((s, i) => mkRow(`${s.magasinId}-${s.produitId}-${i}`, [
          s.designation || '', s.produitType || '', s.magasinId || '',
          String(num(s.quantiteDisponible)), fmtMontant(num(s.prixVente)),
        ]));
        const totalQte = filtered.reduce((s, r) => s + num(r.quantiteDisponible), 0);
        return build('ÉTAT DE STOCK', 'Stock',
          [{ label: 'Désignation' }, { label: 'Type' }, { label: 'Magasin' }, { label: 'Quantité', align: 'right' }, { label: 'Prix', align: 'right' }],
          rows, `Quantité totale : ${totalQte}`);
      }
      default:
        return build('', '', [], []);
    }
  }, [activeReport, ventes, reglements, releves, facturesAss, clients, bons, bonsVerres, inventaires, stocks, recherche, dateDebut, dateFin, magasin, modePaiement]);

  // ── Export PDF / Excel ──────────────────────────────────────────────────────
  const imprimer = async () => {
    // Imports paresseux : jsPDF + autoTable chargés uniquement à l'impression.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF(view.headers.length > 6 ? 'landscape' : 'portrait');
    const startY = pdfHeader(doc);
    doc.setFontSize(13);
    doc.text(view.title, 14, startY);
    autoTable(doc, {
      startY: startY + 5,
      head: [view.headers.map(h => h.label)],
      body: view.rows.map(r => r.cells),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [6, 182, 212] },
    });
    if (view.footer) {
      const y = (doc as any).lastAutoTable?.finalY || startY + 20;
      doc.setFontSize(11);
      doc.text(view.footer, 14, y + 8);
    }
    doc.save(`${view.fileName}.pdf`);
  };

  const exporterExcel = async () => {
    // Import paresseux : xlsx chargé uniquement au moment de l'export.
    const XLSX = await import('xlsx');
    const headers = view.headers.map(h => h.label);
    const aoa = [...excelHeaderRows(), headers, ...view.rows.map(r => r.cells)];
    if (view.footer) aoa.push([view.footer]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, view.fileName.slice(0, 30) || 'Rapport');
    XLSX.writeFile(wb, `${view.fileName}.xlsx`);
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const reportBtnStyle = (isActive: boolean) => ({
    padding: '6px 12px', border: '1px solid #fff',
    backgroundColor: isActive ? '#06b6d4' : '#2a2a2a', color: '#fff',
    fontWeight: 600, fontSize: '11px', cursor: 'pointer',
    whiteSpace: 'nowrap' as const, borderRadius: '3px', opacity: isActive ? 1 : 0.85,
  });
  const selectStyle = { border: '1px solid #d1d5db', borderRadius: '4px', padding: '6px 10px', fontSize: '14px', backgroundColor: '#fff', outline: 'none', width: '100%' };
  const inputStyle = { ...selectStyle };
  const labelStyle = { fontSize: '13px', fontWeight: '600' as const, marginBottom: '4px', display: 'block' };
  const thStyle = { padding: '8px 10px', fontWeight: 600 as const, fontSize: '12px', borderBottom: '1px solid #0891b2', whiteSpace: 'nowrap' as const };
  const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' as const };

  const isReglements = activeReport === 'mouvements' || activeReport === 'reglements';

  const btn = (r: ReportType, label: React.ReactNode) => (
    <button style={reportBtnStyle(activeReport === r)} onClick={() => setActiveReport(r)}>{label}</button>
  );

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <span style={{ fontSize: '20px' }}>🖨️</span>
        <h1 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Visualisation PDF & EXCEL: {TENANT.nom}</h1>
      </div>

      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>Visualisation PDF & EXCEL</h2>

      <p style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '14px', marginBottom: '20px', fontWeight: '500' }}>
        Plus l'intervalle de dates est large, plus le temps de génération du document sera long. Choisissez des intervalles plus courts pour une meilleure performance.
      </p>

      {/* Onglets États */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {btn('bons-monture', <>ÉTAT BONS DE COMMANDE<br/>MONTURE ACCESSOIRE</>)}
        {btn('bons-verre', <>ÉTAT BONS DE COMMANDE<br/>VERRE</>)}
        {btn('stock', 'ÉTAT DE STOCK')}
        {btn('inventaires', 'ÉTAT INVENTAIRES')}
      </div>

      {/* Boutons Rapports */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {btn('mouvements', <>MOUVEMENTS<br/>FINANCIERS</>)}
        {btn('recap-activites', <>RÉCAPITULATIF<br/>ACTIVITÉS</>)}
        {btn('recap-verres', <>RÉCAPITULATIF<br/>ACTIVITÉS VERRES</>)}
        {btn('recap-montures', <>RÉCAPITULATIF<br/>ACTIVITÉS MONTURES</>)}
        {btn('recap-accessoires', <>RÉCAPITULATIF<br/>ACTIVITÉS ACCESSOIRES</>)}
        {btn('recap-traitements', <>RÉCAPITULATIF<br/>ACTIVITÉS TRAITEMENTS</>)}
        {btn('devis-proforma', <>DEVIS |<br/>PROFORMA</>)}
        {btn('ventes-factures', <>VENTES |<br/>FACTURES</>)}
        {btn('sav', 'SAV')}
        {btn('reglements', 'RÈGLEMENTS')}
      </div>

      {/* Boutons du bas */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {btn('recap-releves', <>RÉCAPITULATIF<br/>RELEVÉS</>)}
        {btn('ca-assurances', <>CHIFFRE D'AFFAIRES<br/>ASSURANCES</>)}
        {btn('ca-ophtalmologues', <>CHIFFRE D'AFFAIRES<br/>OPHTALMOLOGUES</>)}
        {btn('ca-cabinets', <>CHIFFRE D'AFFAIRES<br/>CABINETS OPHTALMOLOGUE</>)}
        {btn('clients', 'CLIENTS')}
      </div>

      {/* Filtres */}
      <div style={{ border: '3px solid #06b6d4', borderRadius: '4px', padding: '20px', marginBottom: '24px', backgroundColor: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isReglements ? 4 : 3}, 1fr)`, gap: '16px' }}>
          <div>
            <label style={labelStyle}>Date Début</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input type="date" style={inputStyle} value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
              {dateDebut && <X size={14} style={{ position: 'absolute', right: '30px', cursor: 'pointer', color: '#9ca3af' }} onClick={() => setDateDebut('')} />}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Date Fin</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input type="date" style={inputStyle} value={dateFin} onChange={e => setDateFin(e.target.value)} />
              {dateFin && <X size={14} style={{ position: 'absolute', right: '30px', cursor: 'pointer', color: '#9ca3af' }} onClick={() => setDateFin('')} />}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Magasin</label>
            <select style={selectStyle} value={magasin} onChange={e => setMagasin(e.target.value)}>
              <option>Tous les Magasins</option>
              {getAllMagasinIds().map(id => <option key={id} value={id}>{id.toUpperCase()}</option>)}
            </select>
          </div>
          {isReglements && (
            <div>
              <label style={labelStyle}>Mode de Paiement</label>
              <select style={selectStyle} value={modePaiement} onChange={e => setModePaiement(e.target.value)}>
                <option>Tous Règlements</option>
                <option>Espèces</option>
                <option>Chèque</option>
                <option>Virement</option>
                <option>Carte bancaire</option>
                <option>Mobile Money</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Résultats */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', marginBottom: '24px', backgroundColor: '#fff' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>{view.title} — {view.rows.length} résultat(s)</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={15} style={{ position: 'absolute', left: '8px', color: '#9ca3af' }} />
              <input type="text" placeholder="Rechercher…" value={recherche} onChange={e => setRecherche(e.target.value)} style={{ ...inputStyle, paddingLeft: '28px', width: '260px' }} />
            </div>
            <button onClick={imprimer} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: 'none', borderRadius: '4px', backgroundColor: '#374151', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
              <Printer size={15} /> Imprimer
            </button>
            <button onClick={exporterExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: 'none', borderRadius: '4px', backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
              <FileSpreadsheet size={15} /> Excel
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#06b6d4', color: '#fff', textAlign: 'left' }}>
                {view.headers.map((h, i) => (
                  <th key={i} style={{ ...thStyle, textAlign: h.align || 'left' }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chargement && (
                <tr><td colSpan={view.headers.length} style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>Chargement…</td></tr>
              )}
              {!chargement && view.rows.length === 0 && (
                <tr><td colSpan={view.headers.length} style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>Aucun résultat trouvé.</td></tr>
              )}
              {!chargement && view.rows.map((r, i) => (
                <tr key={r.key} style={{ backgroundColor: i % 2 ? '#f9fafb' : '#fff' }}>
                  {r.cells.map((c, j) => (
                    <td key={j} style={{ ...tdStyle, textAlign: view.headers[j]?.align || 'left' }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {view.footer && !chargement && view.rows.length > 0 && (
          <div style={{ marginTop: '12px', textAlign: 'right', fontWeight: 600, fontSize: '14px' }}>{view.footer}</div>
        )}
      </div>
    </div>
  );
}
