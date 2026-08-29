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
      case 'mouvements': case 'reglements': return 'reglements-ventes';
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
        } else if (src === 'reglements-ventes') {
          const [regl, vts] = await Promise.all([chargerTousLesReglements(), chargerToutesLesVentes()]);
          if (!annule) { setReglements(regl); setVentes(vts); }
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
      case 'devis-proforma': {
        const isDevis = activeReport === 'devis-proforma';
        const filtered = ventes
          .filter(v => isDevis ? v.type === 'devis' : v.type !== 'devis')
          .filter(v => dansIntervalle(v.date))
          .filter(v => magasinOk(v.magasin_id));
        const rows = filtered.map(v => mkRow(v.id, [
          fmtDate(v.date), numDoc(v), v.numero_client || '', v.client || '',
          v.telephone || '', v.magasin_id || '', v.edite_par || '', fmtMontant(montantVente(v)),
        ]));
        const total = filtered.reduce((s, v) => s + montantVente(v), 0);
        return build(isDevis ? 'DEVIS | PROFORMA' : 'VENTES | FACTURES', isDevis ? 'Devis' : 'Ventes',
          [{ label: 'Date' }, { label: 'N° Doc' }, { label: 'N° Client' }, { label: 'Client' }, { label: 'Téléphone' }, { label: 'Magasin' }, { label: 'Édité par' }, { label: 'Total', align: 'right' }],
          rows, `Total : ${fmtMontant(total)}`);
      }
      case 'sav': {
        const savRows: Row[] = [];
        ventes
          .filter(v => v.type !== 'devis')
          .filter(v => dansIntervalle(v.date))
          .filter(v => magasinOk(v.magasin_id))
          .forEach(v => {
            const records: any[] = (v.recap as any)?.savRecords || [];
            records.forEach((r: any, i: number) => {
              savRows.push(mkRow(`${v.id}-sav-${i}`, [
                fmtDate(v.date), numDoc(v), v.client || '', v.magasin_id || '',
                r.reference || '', r.details || '', r.date ? fmtDate(r.date) : '—',
              ]));
            });
          });
        return build('SERVICE APRÈS-VENTE', 'SAV',
          [{ label: 'Date Vente' }, { label: 'N° Doc' }, { label: 'Client' }, { label: 'Magasin' }, { label: 'Référence SAV' }, { label: 'Détails SAV' }, { label: 'Date SAV' }],
          savRows, `${savRows.length} entrée(s) SAV`);
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
        const filteredR = reglements
          .filter(r => dansIntervalle(r.date))
          .filter(r => magasinOk(r.magasin_id))
          .filter(r => modePaiement === 'Tous Règlements' ? true : (r.mode_paiement || '').toLowerCase() === modePaiement.toLowerCase());
        const regRows = filteredR.map(r => mkRow(r.id, [
          fmtDate(r.date), r.recu || '', r.mode_paiement || '', r.compte_banque || '',
          r.magasin_id || '', r.edite_par || '', fmtMontant(num(r.montant)),
        ]));

        // Acomptes initiaux des ventes (paiement à la commande, stocké dans recap.acompte)
        const filteredV = ventes
          .filter(v => v.type !== 'devis')
          .filter(v => dansIntervalle(v.date))
          .filter(v => magasinOk(v.magasin_id))
          .filter(v => num((v.recap as any)?.acompte) > 0)
          .filter(v => modePaiement === 'Tous Règlements' ? true : ((v.recap as any)?.modePaiement || '').toLowerCase() === modePaiement.toLowerCase());
        const acompteRows = filteredV.map(v => mkRow(`acompte-${v.id}`, [
          fmtDate(v.date), numDoc(v), (v.recap as any)?.modePaiement || '', '',
          v.magasin_id || '', v.edite_par || '', fmtMontant(num((v.recap as any)?.acompte)),
        ]));

        const totalR = filteredR.reduce((s, r) => s + num(r.montant), 0);
        const totalV = filteredV.reduce((s, v) => s + num((v.recap as any)?.acompte), 0);
        const allRows = [...regRows, ...acompteRows];
        return build(activeReport === 'mouvements' ? 'MOUVEMENTS FINANCIERS' : 'RÈGLEMENTS',
          activeReport === 'mouvements' ? 'Mouvements' : 'Reglements',
          [{ label: 'Date' }, { label: 'Reçu / N° Doc' }, { label: 'Mode de paiement' }, { label: 'Compte/Banque' }, { label: 'Magasin' }, { label: 'Édité par' }, { label: 'Montant', align: 'right' }],
          allRows, `Total encaissé : ${fmtMontant(totalR + totalV)}`);
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
    doc.autoPrint();
    const blobViz = doc.output('blob');
    const urlViz = URL.createObjectURL(blobViz);
    const winViz = window.open(urlViz, '_blank');
    if (winViz) winViz.onload = () => { winViz.print(); winViz.onafterprint = () => winViz.close(); };
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
  const reportBtnStyle = (isActive: boolean): React.CSSProperties => ({
    padding: 'clamp(7px,1.8vw,10px) clamp(8px,2vw,14px)',
    border: '1px solid rgba(255,255,255,0.3)',
    backgroundColor: isActive ? '#06b6d4' : '#2a2a2a', color: '#fff',
    fontWeight: 700, fontSize: 'clamp(10px,2.2vw,12px)', cursor: 'pointer',
    whiteSpace: 'nowrap', borderRadius: '4px', opacity: isActive ? 1 : 0.82,
    lineHeight: 1.35, minHeight: '40px', textAlign: 'center',
  });
  const fieldStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: '6px', padding: '9px 10px', fontSize: '15px', backgroundColor: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 700, marginBottom: '5px', display: 'block', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.03em' };
  const thStyle: React.CSSProperties = { padding: '9px 10px', fontWeight: 700, fontSize: '12px', borderBottom: '2px solid #0891b2', whiteSpace: 'nowrap', background: '#06b6d4', color: '#fff' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: '13px' };

  const isReglements = activeReport === 'mouvements' || activeReport === 'reglements';

  const btn = (r: ReportType, label: React.ReactNode) => (
    <button style={reportBtnStyle(activeReport === r)} onClick={() => setActiveReport(r)}>{label}</button>
  );

  return (
    <div style={{ padding: 'clamp(12px,3vw,24px)', backgroundColor: '#f1f5f9', minHeight: '100vh' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', backgroundColor: '#fff', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <Printer size={20} color="#06b6d4" />
        <div>
          <h1 style={{ fontSize: 'clamp(13px,3vw,16px)', fontWeight: 700, margin: 0, color: '#111827' }}>Visualisation PDF &amp; EXCEL</h1>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '1px' }}>{TENANT.nom}</div>
        </div>
      </div>

      <p style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '13px', marginBottom: '14px', fontWeight: 500, lineHeight: 1.5 }}>
        ⚠️ Plus l'intervalle de dates est large, plus la génération sera longue. Choisissez des intervalles courts pour de meilleures performances.
      </p>

      {/* ── Groupes de boutons ── */}
      <div style={{ backgroundColor: '#e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Ligne 1 : États stocks / commandes */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {btn('bons-monture', <>BONS COMMANDE<br/>MONTURE / ACCESS.</>)}
          {btn('bons-verre',   <>BONS COMMANDE<br/>VERRE</>)}
          {btn('stock',        'ÉTAT DE STOCK')}
          {btn('inventaires',  'INVENTAIRES')}
        </div>
        {/* Ligne 2 : Rapports commerciaux */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {btn('mouvements',        <>MOUVEMENTS<br/>FINANCIERS</>)}
          {btn('recap-activites',   <>RÉCAP.<br/>ACTIVITÉS</>)}
          {btn('recap-verres',      <>RÉCAP.<br/>VERRES</>)}
          {btn('recap-montures',    <>RÉCAP.<br/>MONTURES</>)}
          {btn('recap-accessoires', <>RÉCAP.<br/>ACCESSOIRES</>)}
          {btn('recap-traitements', <>RÉCAP.<br/>TRAITEMENTS</>)}
          {btn('devis-proforma',    <>DEVIS /<br/>PROFORMA</>)}
          {btn('ventes-factures',   <>VENTES /<br/>FACTURES</>)}
          {btn('sav',               'SAV')}
          {btn('reglements',        'RÈGLEMENTS')}
        </div>
        {/* Ligne 3 : Assurances / Clients */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {btn('recap-releves',      <>RELEVÉS<br/>ASSURANCE</>)}
          {btn('ca-assurances',      <>CA<br/>ASSURANCES</>)}
          {btn('ca-ophtalmologues',  <>CA<br/>OPHTALMOLOGUES</>)}
          {btn('ca-cabinets',        <>CA<br/>CABINETS OPHT.</>)}
          {btn('clients',            'CLIENTS')}
        </div>
      </div>

      {/* ── Filtres ── */}
      <div style={{ border: '2px solid #06b6d4', borderRadius: '8px', padding: 'clamp(12px,3vw,20px)', marginBottom: '20px', backgroundColor: '#fff' }}>
        <div style={{ fontWeight: 700, fontSize: '13px', color: '#06b6d4', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtres</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Date Début</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input type="date" style={fieldStyle} value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
              {dateDebut && <X size={14} style={{ position: 'absolute', right: '8px', cursor: 'pointer', color: '#9ca3af' }} onClick={() => setDateDebut('')} />}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Date Fin</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input type="date" style={fieldStyle} value={dateFin} onChange={e => setDateFin(e.target.value)} />
              {dateFin && <X size={14} style={{ position: 'absolute', right: '8px', cursor: 'pointer', color: '#9ca3af' }} onClick={() => setDateFin('')} />}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Magasin</label>
            <select style={fieldStyle} value={magasin} onChange={e => setMagasin(e.target.value)}>
              <option>Tous les Magasins</option>
              {getAllMagasinIds().map(id => <option key={id} value={id}>{id.toUpperCase()}</option>)}
            </select>
          </div>
          {isReglements && (
            <div>
              <label style={labelStyle}>Mode de Paiement</label>
              <select style={fieldStyle} value={modePaiement} onChange={e => setModePaiement(e.target.value)}>
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

      {/* ── Résultats ── */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: 'clamp(12px,3vw,20px)', marginBottom: '24px', backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>

        {/* Barre titre + actions */}
        <div style={{ marginBottom: '14px' }}>
          <h3 style={{ fontSize: 'clamp(13px,3vw,16px)', fontWeight: 700, margin: '0 0 10px 0', color: '#111827' }}>
            {view.title || 'Rapport'} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '13px' }}>— {view.rows.length} résultat(s)</span>
          </h3>
          {/* Recherche + boutons sur la même ligne, wrappable */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 180px', minWidth: '140px' }}>
              <Search size={15} style={{ position: 'absolute', left: '9px', color: '#9ca3af', pointerEvents: 'none' }} />
              <input type="text" placeholder="Rechercher…" value={recherche} onChange={e => setRecherche(e.target.value)}
                style={{ ...fieldStyle, paddingLeft: '32px' }} />
            </div>
            <button onClick={imprimer}
              style={{ flex: '1 1 120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#374151', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
              <Printer size={15} /> Imprimer PDF
            </button>
            <button onClick={exporterExcel}
              style={{ flex: '1 1 120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
              <FileSpreadsheet size={15} /> Excel
            </button>
          </div>
        </div>

        {/* Tableau scrollable */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: `${view.headers.length * 110}px` }}>
            <thead>
              <tr>
                {view.headers.map((h, i) => (
                  <th key={i} style={{ ...thStyle, textAlign: h.align || 'left' }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chargement && (
                <tr><td colSpan={view.headers.length} style={{ ...tdStyle, textAlign: 'center', color: '#6b7280', whiteSpace: 'normal', padding: '24px' }}>Chargement…</td></tr>
              )}
              {!chargement && view.rows.length === 0 && (
                <tr><td colSpan={view.headers.length} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', whiteSpace: 'normal', padding: '24px' }}>Aucun résultat trouvé.</td></tr>
              )}
              {!chargement && view.rows.map((r, i) => (
                <tr key={r.key} style={{ backgroundColor: i % 2 ? '#f8fafc' : '#fff' }}>
                  {r.cells.map((c, j) => (
                    <td key={j} style={{ ...tdStyle, textAlign: view.headers[j]?.align || 'left' }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {view.footer && !chargement && view.rows.length > 0 && (
          <div style={{ marginTop: '12px', textAlign: 'right', fontWeight: 700, fontSize: '14px', color: '#111827' }}>{view.footer}</div>
        )}
      </div>
    </div>
  );
}
