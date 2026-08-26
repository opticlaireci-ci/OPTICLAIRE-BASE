import { logger } from '../../../utils/logger';
import { AddButton } from '../../../components/AddButton';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useParams } from 'react-router';
import { Calendar, Trash2, X, Download, Plus, Eye, FileText, ArrowLeft, Printer, MoreHorizontal, Pencil } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, resolveUserName, AuditInfo } from '../../../utils/auditUtils';
import { genNumFacture, genCodeBarre, genRefBonCommandeVerre, genNumRecu } from '../../../utils/autoNumbers';
import { autoSaveOphtalmologue, autoSaveCabinet } from '../../../utils/autoActeur';
import { autoSaveClient } from '../../../utils/autoClient';
import { useSupabaseSync } from '../../../hooks/useSupabaseSync';
import {
  useTypesVerre, useVerresList, findVerreByName, VerreRecord,
  useVenteProducts, findVenteProduct, VenteProduct,
  useComptesBanque, useModesPaiement, autoSaveModePaiement,
  useProfessions, useOphtalmologues, useCabinets, useAssurances,
  useClientRecordsMagasin, ClientRecord,
  useFournisseurs,
} from '../../../utils/venteLookups';
import { ajouterReglement, chargerReglements, chargerTousLesReglements, readReglementsCacheMap, subscriberReglementsVente, ReglementSupabase } from '../../../services/reglementsService';
import { ajouterVente, chargerVentes as chargerVentesSupabase, subscriberVentesMagasin, readVentesCache, supprimerVente, mettreAJourVente, VenteSupabase } from '../../../services/ventesService';
import { enregistrerVente } from '../../../services/inventaireService';
import { verifierStockVente, messageRuptures } from '../../../utils/stockVente';
import { StockParMagasin } from '../../../components/StockParMagasin';
import { useLentillesOpticStock } from '../../../hooks/useLentillesOpticStock';
import { collection, onSnapshot } from '../../../utils/firestoreCompat';
import { db } from '../../../utils/firebaseClient';
import { reportFirebaseError } from '../../../services/firebaseErrorBus';
import { pdfHeader, printHeaderHTML, excelHeaderRows, getEntete } from '../../../utils/documentHeader';
import { logNetworkAware } from '../../../utils/networkErrors';
import { canEdit, canDelete } from '../../../utils/actionRights';
import { useLiveData } from '../../../hooks/useLiveData';
import { getMagasinLabel } from '../../../constants/magasins';
import { TENANT } from '../../../config/tenant';

// ── Montant en toutes lettres (français) ─────────────────────────────────────
function montantEnLettres(nombre: number): string {
  nombre = Math.round(nombre || 0);
  if (nombre === 0) return 'ZÉRO FRANC CFA';
  const u = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const d = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  const centaines = (n: number): string => {
    let r = '';
    const c = Math.floor(n / 100), reste = n % 100;
    if (c > 0) r += (c > 1 ? u[c] + ' ' : '') + 'cent' + (c > 1 && reste === 0 ? 's' : '');
    if (reste > 0) {
      if (r) r += ' ';
      if (reste < 20) r += u[reste];
      else {
        const diz = Math.floor(reste / 10), un = reste % 10;
        if (diz === 7 || diz === 9) r += d[diz] + '-' + u[10 + un];
        else {
          r += d[diz];
          if (un === 1 && diz !== 8) r += '-et-un';
          else if (un > 0) r += '-' + u[un];
          else if (diz === 8) r += 's';
        }
      }
    }
    return r;
  };
  let mots = '';
  const millions = Math.floor(nombre / 1000000);
  const milliers = Math.floor((nombre % 1000000) / 1000);
  const reste = nombre % 1000;
  if (millions > 0) mots += (millions > 1 ? centaines(millions) + ' millions' : 'un million') + ' ';
  if (milliers > 0) mots += (milliers > 1 ? centaines(milliers) + ' ' : '') + 'mille ';
  if (reste > 0) mots += centaines(reste);
  return (mots.trim() + ' FRANCS CFA').toUpperCase();
}

// ── PDF & Excel Generators ──────────────────────────────────────────────────

async function telechargerFacturePDF(factureData: {
  numFacture: string;
  numeroClient: string;
  client: string;
  civilite?: string;
  telephone: string;
  email?: string;
  date: string;
  rdvRetrait?: string;
  verres?: any[];
  articles: any[];
  bonsAssurance: any[];
  totalNet: number;
  remisePct: string;
  acompte: string;
  editePar?: string;
  dateEdition?: string;
}, magasinId?: string) {
  // Imports paresseux : jsPDF + autoTable chargés uniquement à la génération.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const fmtDateHeure = (d?: string) => (d ? new Date(d) : new Date()).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  // Format monétaire du reçu : milliers séparés par une espace, décimales à points.
  const fmtF = (n: number) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');

  const nomClient = `${factureData.civilite ? factureData.civilite + ' ' : ''}${factureData.client || ''}`.trim().toUpperCase();
  const verres = factureData.verres || [];
  const articles = factureData.articles || [];

  // En-tête partagé (nom + coordonnées + logo)
  let y = pdfHeader(doc, magasinId, { date: factureData.date });

  // ── Bloc client (bandeau gris) + N° facture / rendez-vous ──────────────────
  doc.setFillColor(233, 233, 233);
  doc.rect(14, y, 182, 26, 'F');
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`(N° ${factureData.numeroClient || '—'}) ${nomClient}`, 18, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Téléphone: ${factureData.telephone || ''}`, 18, y + 15);
  doc.text(`Email: ${factureData.email || ''}`, 18, y + 20);
  doc.setFont('helvetica', 'bold');
  doc.text(`Édité par: ${factureData.editePar || '—'}`, 192, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Édité le, ${fmtDateHeure(factureData.dateEdition || factureData.date)}`, 192, y + 14, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`FACTURE N° ${factureData.numFacture || 'N/A'}`, 192, y + 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Rendez-vous: ${fmt(factureData.rdvRetrait)}`, 192, y + 25, { align: 'right' });
  y += 32;

  const heading = (label: string, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text(label, 14, yy);
  };

  // ── Section VERRES (prescription + prix) ───────────────────────────────────
  if (verres.length > 0) {
    heading('VERRES', y);
    verres.forEach((v: any) => {
      const desc = [
        `${v.typeVerre || ''}${v.verre ? ' | ' + v.verre : ''}`,
        v.traitement,
        [v.matiere, v.diametre].filter(Boolean).join(' | '),
        'Garantie: 2 ANS',
      ].filter(Boolean).join('\n');
      const od = v.oeilDroit || {}; const og = v.oeilGauche || {};
      const prixOD = parseFloat(od.prix || '0'); const prixOG = parseFloat(og.prix || '0');
      autoTable(doc, {
        startY: y + 3,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 7, cellPadding: 1.5, lineColor: [160, 160, 160], lineWidth: 0.1, textColor: 20, halign: 'center', valign: 'middle' },
        head: [[
          { content: 'PRESCIPTION', colSpan: 10, styles: { halign: 'left', fillColor: [225, 225, 225], textColor: 0, fontStyle: 'bold' } },
          { content: 'QUANTITÉ' }, { content: 'PRIX' }, { content: 'REMISE' }, { content: 'TOTAL' },
        ]],
        headStyles: { fillColor: [225, 225, 225], textColor: 0, fontStyle: 'bold' },
        body: [
          [
            { content: desc, rowSpan: 3, styles: { halign: 'left', valign: 'top', fontStyle: 'bold', cellWidth: 50 } },
            { content: '', styles: { fillColor: [244, 244, 244] } },
            { content: 'Sph', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Cyl', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Axe', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Dec', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Add', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'H', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'E V Loin', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'E V Près', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: '', styles: { fillColor: [244, 244, 244] } },
            { content: '', styles: { fillColor: [244, 244, 244] } },
            { content: '', styles: { fillColor: [244, 244, 244] } },
            { content: '', styles: { fillColor: [244, 244, 244] } },
          ],
          [
            { content: 'Oeil Droit', styles: { halign: 'left', fontStyle: 'bold' } },
            od.sphere || '', od.cylindre || '', od.axe || '', od.dec || '', od.addition || '', od.hauteur || '', od.evLoin || '', od.evPres || '',
            od.quantite || '1', { content: fmtF(prixOD), styles: { halign: 'right' } }, `${od.remise || '0'}`, { content: fmtF(prixOD), styles: { halign: 'right' } },
          ],
          [
            { content: 'Oeil Gauche', styles: { halign: 'left', fontStyle: 'bold' } },
            og.sphere || '', og.cylindre || '', og.axe || '', og.dec || '', og.addition || '', og.hauteur || '', og.evLoin || '', og.evPres || '',
            og.quantite || '1', { content: fmtF(prixOG), styles: { halign: 'right' } }, `${og.remise || '0'}`, { content: fmtF(prixOG), styles: { halign: 'right' } },
          ],
        ],
      });
      y = (doc as any).lastAutoTable.finalY;
    });
  }

  // ── Section MONTURES / ARTICLES ────────────────────────────────────────────
  if (articles.length > 0) {
    heading('MONTURES', y + 8);
    autoTable(doc, {
      startY: y + 11,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 2, lineColor: [160, 160, 160], lineWidth: 0.1, textColor: 20, valign: 'middle' },
      headStyles: { fillColor: [225, 225, 225], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left' }, 1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 30 },
      },
      head: [['DÉSIGNATION', 'QUANTITÉ', 'PRIX', 'REMISE', 'TOTAL']],
      body: articles.map(a => [
        `${a.designation || '—'}\nGarantie: 2 ANS`,
        a.quantite || '1',
        fmtF(parseFloat(a.prix || '0')),
        fmtF(parseFloat(a.remise || '0')),
        fmtF(parseFloat(a.total || '0')),
      ]),
    });
    y = (doc as any).lastAutoTable.finalY;
  }

  // ── Totaux ─────────────────────────────────────────────────────────────────
  const acompte = parseFloat(factureData.acompte) || 0;
  const totalAssurance = factureData.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
  const totalBrutVerres = verres.reduce((s: number, v: any) => s + (parseFloat(v.totalVerres) || 0), 0);
  const totalBrutArticles = articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
  const totalBrut = totalBrutVerres + totalBrutArticles;
  const remisePct = parseFloat(factureData.remisePct) || 0;
  const remiseMontant = totalBrut - factureData.totalNet;
  const reste = factureData.totalNet - totalAssurance - acompte;

  let ty = y + 12;
  const totalRows: Array<[string, string]> = [
    ['TOTAL', fmtF(totalBrut) + ' F CFA'],
    [`REMISE(${remisePct}%)`, fmtF(remiseMontant > 0 ? remiseMontant : 0) + ' F CFA'],
    ['TOTAL NET', fmtF(factureData.totalNet) + ' F CFA'],
  ];
  if (totalAssurance > 0) totalRows.push(['PRISE EN CHARGE', fmtF(totalAssurance) + ' F CFA']);
  totalRows.push(['ACOMPTE', fmtF(acompte) + ' F CFA']);
  totalRows.push(['TOTAL RESTE', fmtF(reste) + ' F CFA']);

  doc.setFontSize(11);
  totalRows.forEach((r, i) => {
    if (i % 2 === 0) { doc.setFillColor(229, 229, 229); doc.rect(110, ty - 5, 86, 8, 'F'); }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.text(r[0], 114, ty);
    doc.setFont('helvetica', 'bold');
    if (r[0] === 'TOTAL RESTE') doc.setTextColor(reste > 0 ? 198 : 46, reste > 0 ? 40 : 125, reste > 0 ? 40 : 50);
    doc.text(r[1], 192, ty, { align: 'right' });
    ty += 9;
  });

  // Badge « Soldée » si tout est réglé
  if (reste <= 0) {
    doc.setFillColor(67, 160, 71);
    doc.roundedRect(150, ty - 3, 46, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('✓ SOLDÉE', 173, ty + 2.5, { align: 'center' });
    ty += 10;
  }

  // ── Montant en lettres ───────────────────────────────────────────────────
  ty += 8;
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lettres = doc.splitTextToSize(`ARRÊTÉ LA PRÉSENTE FACTURE À LA SOMME DE: ${montantEnLettres(factureData.totalNet)}`, 182);
  doc.text(lettres, 14, ty);
  ty += lettres.length * 5 + 14;

  // ── Signature & pied de page ─────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Signature & Cachet', 150, ty, { align: 'center' });

  const e = getEntete(magasinId);
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(14, 285, 196, 285);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`${e.adresse} Téléphone: ${e.telephone} Email: ${e.email}`, 105, 290, { align: 'center' });

  doc.save(`Facture_${factureData.numFacture}_${factureData.client}.pdf`);
}

async function telechargerFactureExcel(factureData: {
  numFacture: string;
  numeroClient: string;
  client: string;
  telephone: string;
  date: string;
  articles: any[];
  bonsAssurance: any[];
  totalNet: number;
  remisePct: string;
  acompte: string;
  editePar?: string;
  dateEdition?: string;
}, magasinId?: string) {
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const fmtDateHeure = (d?: string) => (d ? new Date(d) : new Date()).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Import paresseux : xlsx chargé uniquement au moment de l'export.
  const XLSX = await import('xlsx');

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Facture info — en-tête partagé
  const wsData: any[][] = [
    ...excelHeaderRows(magasinId, { date: factureData.date }),
    ['FACTURE'],
    [],
    ['N° Facture:', factureData.numFacture || 'N/A'],
    ['Date:', fmt(factureData.date)],
    ['N° Client:', factureData.numeroClient],
    ['Client:', factureData.client],
    ['Téléphone:', factureData.telephone],
    ['Édité par:', factureData.editePar || '—'],
    ['Le:', fmtDateHeure(factureData.dateEdition || factureData.date)],
    [],
    ['Articles'],
    ['Désignation', 'Code Barre', 'Qté', 'Prix Unit.', 'Remise', 'Total']
  ];

  // Add articles
  factureData.articles.forEach(a => {
    wsData.push([
      a.designation || '—',
      a.codeBarre || '',
      a.quantite,
      parseFloat(a.prix || '0'),
      `${a.remise}%`,
      parseFloat(a.total || '0')
    ]);
  });

  wsData.push([]);

  // Add bons assurance
  if (factureData.bonsAssurance.length > 0) {
    wsData.push(['Bons d\'Assurance']);
    wsData.push(['Assurance', 'N° Bon', 'Matricule', 'Montant PC']);
    factureData.bonsAssurance.forEach(b => {
      wsData.push([
        b.assurance,
        b.numeroBon,
        b.matricule || '',
        parseFloat(b.montantPrisEnCharge || '0')
      ]);
    });
    wsData.push([]);
  }

  // Totals
  const acompte = parseFloat(factureData.acompte) || 0;
  const totalAssurance = factureData.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
  const reste = factureData.totalNet - totalAssurance - acompte;

  wsData.push(['Total Net:', factureData.totalNet]);
  if (totalAssurance > 0) wsData.push(['Prise en charge assurance:', -totalAssurance]);
  if (acompte > 0) wsData.push(['Acompte versé:', -acompte]);
  wsData.push(['Reste à payer:', reste]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Facture');

  XLSX.writeFile(wb, `Facture_${factureData.numFacture}_${factureData.client}.xlsx`);
}

async function telechargerFichePDF(vente: any, magasinId?: string) {
  // Imports paresseux : jsPDF + autoTable chargés uniquement à la génération.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const fmtDateHeure = (d?: string) => (d ? new Date(d) : new Date()).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const numFacture = vente.recap?.numFacture || '—';
  const editePar = (vente as any).createdBy || (vente as any).updatedBy || vente.edite_par || '—';
  const dateEdition = (vente as any).createdAt || vente.date;
  const rdv = vente.recap?.rdvRetrait;
  const civilite = vente.clientInfo?.civilite || vente.civilite || '';
  const nomClient = `${civilite ? civilite + ' ' : ''}${vente.client || ''}`.trim().toUpperCase();
  const email = vente.clientInfo?.email || vente.email || '';
  const assurance = (vente.bonsAssurance && vente.bonsAssurance[0]?.assurance) || '';
  const verres = vente.verres || [];
  const articles = vente.articles || [];

  // ── Talon détachable (haut de page, cadre pointillé) ───────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(14, 8, 132, 24);
  doc.setLineDashPattern([], 0);
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`FICHE N° (${numFacture})`, 18, 15);
  const wFiche = doc.getTextWidth(`FICHE N° (${numFacture})`);
  doc.setFont('helvetica', 'normal');
  doc.text(` ÉDITÉ LE, ${fmtDateHeure(dateEdition)}`, 18 + wFiche, 15);
  doc.text('CLIENT: ', 18, 22);
  const wClient = doc.getTextWidth('CLIENT: ');
  doc.setFont('helvetica', 'bold');
  doc.text(`N° (${vente.numeroClient || '—'}) ${nomClient}`, 18 + wClient, 22);
  doc.setFont('helvetica', 'normal');
  doc.text(`RDV LE, ${fmt(rdv)}`, 18, 28);
  // Séparateur pointillé pleine largeur (ligne de découpe)
  doc.setLineDashPattern([1, 1], 0);
  doc.line(14, 37, 196, 37);
  doc.setLineDashPattern([], 0);

  // ── En-tête enseigne (décalé sous le talon) ────────────────────────────────
  let y = pdfHeader(doc, magasinId, { date: vente.date, offsetY: 34 });

  // ── Bloc client (bandeau gris) ─────────────────────────────────────────────
  doc.setFillColor(233, 233, 233);
  doc.rect(14, y, 182, 22, 'F');
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`(N° ${vente.numeroClient || '—'}) ${nomClient}`, 18, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Téléphone: ${vente.telephone || ''}`, 18, y + 14);
  doc.text(`Email: ${email}`, 18, y + 19);
  doc.setFont('helvetica', 'bold');
  doc.text(`Édité par: ${editePar}`, 192, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Édité le, ${fmtDateHeure(dateEdition)}`, 192, y + 14, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`FACTURE N° ${numFacture}`, 192, y + 20, { align: 'right' });
  y += 30;

  const heading = (label: string, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text(label, 14, yy);
  };

  // ── Section VERRES : prescription (sans prix) ──────────────────────────────
  if (verres.length > 0) {
    heading('VERRES', y);
    verres.forEach((v: any) => {
      const desc = [
        `${v.typeVerre || ''}${v.verre ? ' | ' + v.verre : ''}`,
        v.traitement,
        [v.matiere, v.diametre].filter(Boolean).join(' | '),
      ].filter(Boolean).join('\n');
      const od = v.oeilDroit || {}; const og = v.oeilGauche || {};
      autoTable(doc, {
        startY: y + 3,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [160, 160, 160], lineWidth: 0.1, textColor: 20, halign: 'center', valign: 'middle' },
        head: [[{ content: 'PRESCIPTION', colSpan: 10, styles: { halign: 'left', fillColor: [225, 225, 225], textColor: 0, fontStyle: 'bold' } }]],
        body: [
          [
            { content: desc, rowSpan: 3, styles: { halign: 'left', valign: 'top', fontStyle: 'bold', cellWidth: 62 } },
            { content: '', styles: { fillColor: [244, 244, 244] } },
            { content: 'Sph', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Cyl', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Axe', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Dec', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Add', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'H', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'E V Loin', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'E V Près', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
          ],
          [
            { content: 'Oeil Droit', styles: { halign: 'left', fontStyle: 'bold' } },
            od.sphere || '', od.cylindre || '', od.axe || '', od.dec || '', od.addition || '', od.hauteur || '', od.evLoin || '', od.evPres || '',
          ],
          [
            { content: 'Oeil Gauche', styles: { halign: 'left', fontStyle: 'bold' } },
            og.sphere || '', og.cylindre || '', og.axe || '', og.dec || '', og.addition || '', og.hauteur || '', og.evLoin || '', og.evPres || '',
          ],
        ],
      });
      y = (doc as any).lastAutoTable.finalY;
    });
  }

  // ── Section MONTURES : désignation ─────────────────────────────────────────
  if (articles.length > 0) {
    heading('MONTURES', y + 8);
    autoTable(doc, {
      startY: y + 11,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: [160, 160, 160], lineWidth: 0.1, textColor: 20, halign: 'left' },
      headStyles: { fillColor: [225, 225, 225], textColor: 0, fontStyle: 'bold' },
      head: [['DÉSIGNATION']],
      body: articles.map(a => [a.designation || '—']),
    });
    y = (doc as any).lastAutoTable.finalY;
  }

  // ── Écart Pupillaire (gauche) ──────────────────────────────────────────────
  const blocY = y + 6;
  autoTable(doc, {
    startY: blocY,
    margin: { left: 14 },
    tableWidth: 84,
    styles: { fontSize: 8, cellPadding: 1.5, lineColor: [120, 120, 120], lineWidth: 0.1, halign: 'center', valign: 'middle' },
    head: [
      [{ content: 'Ecart Pupillaire', colSpan: 4, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' } }],
      [{ content: '' }, 'Loin', 'Près', 'H'],
    ],
    headStyles: { fillColor: [240, 240, 240], textColor: 0 },
    body: [
      [{ content: 'Oeil Droit', styles: { halign: 'left' } }, '', '', ''],
      [{ content: 'Oeil Gauche', styles: { halign: 'left' } }, '', '', ''],
    ],
  });
  const epFinal = (doc as any).lastAutoTable.finalY;

  // ── QUALITÉ (droite) ───────────────────────────────────────────────────────
  const qx = 110, qw = 86, qh = 46;
  doc.setDrawColor(120);
  doc.setLineWidth(0.1);
  doc.rect(qx, blocY, qw, qh);
  doc.setFillColor(240, 240, 240);
  doc.rect(qx, blocY, qw, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text('QUALITÉ', qx + qw / 2, blocY + 4, { align: 'center' });
  doc.line(qx + 34, blocY + 6, qx + 34, blocY + qh);
  const qualites = ['Manchons', 'Plaquettes', 'Charnières', 'Monture', 'Verre'];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0);
  qualites.forEach((it, i) => {
    const iy = blocY + 13 + i * 6.5;
    doc.rect(qx + 3, iy - 2.6, 2.6, 2.6);
    doc.text(it, qx + 7.5, iy);
  });
  doc.text('Réalisé et Vérifié par', qx + 34 + (qw - 34) / 2, blocY + 14, { align: 'center' });
  doc.line(qx + 42, blocY + 22, qx + qw - 8, blocY + 22);
  doc.rect(qx + 40, blocY + 32, 2.6, 2.6);
  doc.text('Oeil Droit', qx + 44.5, blocY + 34.4);
  doc.rect(qx + 62, blocY + 32, 2.6, 2.6);
  doc.text('Oeil Gauche', qx + 66.5, blocY + 34.4);

  y = Math.max(epFinal, blocY + qh) + 6;

  // ── Indications spéciales / Assurance ──────────────────────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.rect(14, y, 182, 18);
  doc.line(14, y + 11, 196, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(`FICHE N° (${numFacture})`, 17, y + 5);
  doc.text('INDICATIONS SPÉCIALES:', 17, y + 9.5);
  doc.text(assurance ? assurance.toUpperCase() : '', 17, y + 16);

  doc.save(`Fiche_${vente.numeroClient}_${vente.client}.pdf`);
}

async function telechargerDossierClientPDF(vente: any, magasinId?: string) {
  // Imports paresseux : jsPDF + autoTable chargés uniquement à la génération.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const fmtDateHeure = (d?: string) => (d ? new Date(d) : new Date()).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const clientInfo = vente.clientInfo || {};

  const numFacture = vente.recap?.numFacture || '—';
  const editePar = (vente as any).createdBy || (vente as any).updatedBy || vente.edite_par || '—';
  const dateEdition = (vente as any).createdAt || vente.date;
  const civilite = clientInfo.civilite || vente.civilite || '';
  const nomClient = `${civilite ? civilite + ' ' : ''}${vente.client || ''}`.trim().toUpperCase();
  const email = clientInfo.email || vente.email || '';
  const adresse = clientInfo.adresse || '';
  const profession = clientInfo.profession || '';
  const naissance = [clientInfo.jourNaissance, clientInfo.moisNaissance, clientInfo.anneeNaissance].filter(Boolean).join(' - ');
  const assurance = (vente.bonsAssurance && vente.bonsAssurance[0]?.assurance) || '';
  const verres = vente.verres || [];
  const articles = vente.articles || [];
  // Nom du magasin (le bandeau haut affiche la DIRECTION, le magasin est repris ici).
  const magasinLabel = getEntete(magasinId).nom;
  const directionEntete = getEntete(undefined);

  // « P 1 / 1 » en haut à gauche
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('P 1 / 1', 14, 8);

  // En-tête DIRECTION (siège) + logo
  let y = pdfHeader(doc, undefined, { date: vente.date });

  // ── Bloc infos client (gras, à gauche) ─────────────────────────────────────
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const infos = [
    `DOSSIER CLIENT: (${vente.numeroClient || '—'}) ${nomClient}`,
    `ADRESSE: ${adresse}`,
    `TÉLÉPHONE: ${vente.telephone || ''}`,
    `EMAIL: ${email}`,
    `JOUR DE NAISSANCE: ${naissance}`,
    `PROFESSION: ${profession.toUpperCase()}`,
  ];
  infos.forEach((line, i) => doc.text(line, 14, y + i * 6));
  y += infos.length * 6;

  // ── Magasin (gauche) + Édité par / Facture (droite) ────────────────────────
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(magasinLabel.toUpperCase(), 14, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Édité par: ${editePar}`, 192, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Édité le, ${fmtDateHeure(dateEdition)}`, 192, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`FACTURE N° ${numFacture}`, 192, y + 11, { align: 'right' });
  y += 16;

  const heading = (label: string, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text(label, 14, yy);
  };

  // ── Section VERRES : prescription (sans prix) ──────────────────────────────
  if (verres.length > 0) {
    heading('VERRES', y);
    verres.forEach((v: any) => {
      const desc = [
        `${v.typeVerre || ''}${v.verre ? ' | ' + v.verre : ''}`,
        v.traitement,
        [v.matiere, v.diametre].filter(Boolean).join(' | '),
      ].filter(Boolean).join('\n');
      const od = v.oeilDroit || {}; const og = v.oeilGauche || {};
      autoTable(doc, {
        startY: y + 3,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [160, 160, 160], lineWidth: 0.1, textColor: 20, halign: 'center', valign: 'middle' },
        head: [[{ content: 'PRESCIPTION', colSpan: 10, styles: { halign: 'left', fillColor: [225, 225, 225], textColor: 0, fontStyle: 'bold' } }]],
        body: [
          [
            { content: desc, rowSpan: 3, styles: { halign: 'left', valign: 'top', fontStyle: 'bold', cellWidth: 62 } },
            { content: '', styles: { fillColor: [244, 244, 244] } },
            { content: 'Sph', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Cyl', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Axe', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Dec', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'Add', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'H', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'E V Loin', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
            { content: 'E V Près', styles: { fillColor: [244, 244, 244], fontStyle: 'bold' } },
          ],
          [
            { content: 'Oeil Droit', styles: { halign: 'left', fontStyle: 'bold' } },
            od.sphere || '', od.cylindre || '', od.axe || '', od.dec || '', od.addition || '', od.hauteur || '', od.evLoin || '', od.evPres || '',
          ],
          [
            { content: 'Oeil Gauche', styles: { halign: 'left', fontStyle: 'bold' } },
            og.sphere || '', og.cylindre || '', og.axe || '', og.dec || '', og.addition || '', og.hauteur || '', og.evLoin || '', og.evPres || '',
          ],
        ],
      });
      y = (doc as any).lastAutoTable.finalY;
    });
  }

  // ── Section MONTURES : désignation + Écart Pupillaire (droite) ─────────────
  if (articles.length > 0) {
    heading('MONTURES', y + 8);
    const desY = y + 11;
    autoTable(doc, {
      startY: desY,
      margin: { left: 14 },
      tableWidth: 96,
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: [160, 160, 160], lineWidth: 0.1, textColor: 20, halign: 'left' },
      headStyles: { fillColor: [225, 225, 225], textColor: 0, fontStyle: 'bold' },
      head: [['DÉSIGNATION']],
      body: articles.map(a => [a.designation || '—']),
    });
    y = (doc as any).lastAutoTable.finalY;

    // Écart Pupillaire (sans cadre) à droite
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text('Ecart Pupillaire', 155, desY + 2, { align: 'center' });
    doc.text('Loin', 130, desY + 8);
    doc.text('Près', 152, desY + 8);
    doc.text('H', 182, desY + 8);
    doc.text('Oeil Droit', 118, desY + 15);
    doc.text('Oeil Gauche', 118, desY + 22);
    doc.text('Réalisé et Vérifié par', 118, desY + 31);
    y = Math.max(y, desY + 34);
  }

  // ── Indications spéciales / Assurance ──────────────────────────────────────
  y += 6;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.rect(14, y, 182, 20);
  doc.line(14, y + 12, 196, y + 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(`FICHE N° (${numFacture})`, 17, y + 5);
  doc.text('INDICATIONS SPÉCIALES:', 17, y + 10);
  doc.text(assurance ? assurance.toUpperCase() : '', 17, y + 17);

  // ── Pied de page (coordonnées direction) ───────────────────────────────────
  doc.setDrawColor(210);
  doc.setLineWidth(0.2);
  doc.line(30, 280, 180, 280);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`${directionEntete.telephone} | ${directionEntete.email} | 8 Pool, R.point de la rivera Palmeraie`, 105, 286, { align: 'center' });

  doc.save(`Dossier_Client_${vente.numeroClient}_${vente.client}.pdf`);
}

async function telechargerReglementPDF(reglement: any, vente: any, magasinId?: string) {
  // Import paresseux : jsPDF chargé uniquement à la génération.
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  // Remplace l'espace insécable ( ) du locale fr-FR par un espace normal
  // pour éviter que jsPDF l'affiche comme une barre verticale.
  const fmtF = (n: number) => { const v = Math.round((Number(n) || 0) * 100) / 100; const [int, dec] = v.toFixed(2).split('.'); return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec; };
  const fmtDateTime = (d: string) => {
    const dt = d ? new Date(d) : new Date();
    return `${dt.toLocaleDateString('fr-FR')} ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };
  const dateReg = reglement.date || new Date().toISOString();
  const editePar = reglement.editePar || (vente as any).createdBy || 'LOUISE MARLÈNE';

  // En-tête partagé (style reçu image : nom noir + coordonnées à gauche, logo à droite)
  let y = pdfHeader(doc, magasinId, { date: dateReg });

  // ── Bloc client (gris) ─────────────────────────────────────────────────────
  doc.setFillColor(233, 233, 233);
  doc.rect(14, y, 182, 24, 'F');
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`(N° ${vente.numeroClient || '—'}) ${vente.client || ''}`, 18, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Téléphone: ${vente.telephone || ''}`, 18, y + 15);
  doc.text(`Email: ${(vente.clientInfo && vente.clientInfo.email) || ''}`, 18, y + 20);
  doc.setFont('helvetica', 'bold');
  doc.text(`Édité par: ${editePar}`, 192, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Édité le, ${fmtDateTime(dateReg)}`, 192, y + 14, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`FACTURE N°${vente.recap?.numFacture || '—'} | N° REÇU: ${reglement.recu || '—'}`, 192, y + 20, { align: 'right' });
  y += 30;

  // Totaux
  const totalNet = Number(vente.totalNet) || 0;
  const remisePct = parseFloat(vente.recap?.remisePct) || 0;
  const totalBrut = remisePct > 0 ? Math.round(totalNet / (1 - remisePct / 100)) : totalNet;
  const remiseMontant = totalBrut - totalNet;
  // `acompte` = versement courant ; `totalPaye` = cumul déjà réglé (versement
  // inclus) → alimente la ligne ACOMPTE et le TOTAL RESTE (mise à jour au solde).
  const acompte = Number(reglement.montant) || 0;
  const totalPaye = reglement.totalPaye != null ? Number(reglement.totalPaye) : acompte;
  // La prise en charge assurance doit être retranchée comme sur la facture,
  // sinon le reçu ne se solde jamais pour un client assuré (reste = net − assurance − cumul payé).
  const totalAssurance = Array.isArray(vente.bonsAssurance)
    ? vente.bonsAssurance.reduce((s: number, b: any) => s + (Number(b.montantPrisEnCharge) || 0), 0)
    : 0;
  const reste = totalNet - totalAssurance - totalPaye;

  // ── Tableau INFORMATIONS BON ASSURANCE / ÉDITÉ LE / MONTANT ─────────────────
  // En-tête (filet noir dessous)
  // Colonnes : col1=14..108 (w94), col2=110..158 (w48), col3=160..196 (w36 right-aligned)
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  // Le titre s'adapte : "BON ASSURANCE" seulement s'il y a réellement un bon
  // d'assurance sur cette vente, sinon "RÈGLEMENT" pour un versement classique.
  const titreInfos = (Array.isArray(vente.bonsAssurance) && vente.bonsAssurance.length > 0)
    ? 'INFORMATIONS BON ASSURANCE'
    : 'INFORMATIONS RÈGLEMENT';
  doc.text(titreInfos, 16, y + 5);
  doc.text('ÉDITÉ LE', 110, y + 5);
  doc.text('MONTANT', 194, y + 5, { align: 'right' });
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(14, y + 8, 196, y + 8);
  y += 8;

  // Ligne(s) jaune(s) : bons d'assurance, sinon le versement
  const bons: any[] = Array.isArray(vente.bonsAssurance) ? vente.bonsAssurance : [];
  const lignes = bons.length > 0
    ? bons.map((b: any) => ({
        info: `Bon Assurance N° ${b.numeroBon || '—'} ${b.assurance || ''}\n${b.date ? new Date(b.date).toLocaleDateString('fr-FR') : new Date(dateReg).toLocaleDateString('fr-FR')}`,
        montant: Number(b.montantPrisEnCharge || acompte) || 0,
      }))
    : [{
        info: `Versement N° ${reglement.recu || '—'}\n${reglement.modePaiement || ''}${reglement.compteBanque ? ' — ' + reglement.compteBanque : ''}`,
        montant: acompte,
      }];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  lignes.forEach(l => {
    const infoLines = doc.splitTextToSize(l.info, 92);
    const editLines = doc.splitTextToSize(`${fmtDateTime(dateReg)}\nEdite par: ${editePar}`, 46);
    const rowH = Math.max(14, Math.max(infoLines.length, editLines.length) * 5 + 6);
    doc.setFillColor(255, 255, 0); // jaune
    doc.rect(14, y, 182, rowH, 'F');
    doc.setTextColor(0);
    doc.text(infoLines, 16, y + 6);
    doc.text(editLines, 110, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.text(fmtF(l.montant) + ' F CFA', 194, y + 6, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += rowH;
  });

  // ── Bloc sombre : versement en lettres + QR code ───────────────────────────
  const boxH = 26;
  doc.setFillColor(43, 52, 65);
  doc.rect(14, y, 182, boxH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  const lettres = doc.splitTextToSize(`ARRÊTÉ LE PRÉSENT VERSEMENT À LA SOMME DE: ${montantEnLettres(acompte)}`, 120);
  doc.text(lettres, 18, y + 9);
  // QR code (chargé en dataURL). En cas d'échec réseau, on poursuit sans QR.
  try {
    const qrData = encodeURIComponent(`${TENANT.nom}|Facture:${vente.recap?.numFacture || ''}|Recu:${reglement.recu || ''}|Client:${vente.numeroClient || ''}|Montant:${acompte}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=0&data=${qrData}`;
    const blob = await fetch(qrUrl).then(r => r.blob());
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, 'PNG', 150, y + 3, 20, 20);
    doc.setFontSize(8);
    doc.text(['Scanner et Accéder', 'à votre espace', 'Client.'], 172, y + 9);
  } catch { /* QR indisponible : on garde le reste du reçu */ }
  y += boxH + 12;

  // ── Tableau des totaux (aligné à droite) ───────────────────────────────────
  const rows: Array<[string, string]> = [
    ['TOTAL', fmtF(totalBrut) + ' F CFA'],
    [`REMISE(${remisePct}%)`, fmtF(remiseMontant) + ' F CFA'],
    ['TOTAL NET', fmtF(totalNet) + ' F CFA'],
  ];
  if (totalAssurance > 0) rows.push(['PRISE EN CHARGE', fmtF(totalAssurance) + ' F CFA']);
  rows.push(['ACOMPTE', fmtF(totalPaye) + ' F CFA']);
  rows.push(['TOTAL RESTE', fmtF(reste) + ' F CFA']);
  doc.setTextColor(0);
  doc.setFontSize(11);
  rows.forEach((r, i) => {
    if (i % 2 === 0) { doc.setFillColor(229, 229, 229); doc.rect(110, y - 5, 86, 8, 'F'); }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(r[0], 114, y);
    doc.setFont('helvetica', 'bold');
    if (r[0] === 'TOTAL RESTE') doc.setTextColor(reste > 0 ? 198 : 46, reste > 0 ? 40 : 125, reste > 0 ? 40 : 50);
    doc.text(r[1], 192, y, { align: 'right' });
    y += 9;
  });

  // Badge « Soldée » quand le client vient de solder (reste ≤ 0).
  if (reste <= 0) {
    doc.setFillColor(67, 160, 71);
    doc.roundedRect(150, y - 3, 46, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('✓ SOLDÉE', 173, y + 2.5, { align: 'center' });
    y += 10;
  }

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text('Signature & Cachet', 105, y, { align: 'center' });

  // Pied de page (coordonnées magasin)
  const e = getEntete(magasinId);
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(14, 285, 196, 285);
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(`${e.adresse}  Téléphone: ${e.telephone}  Email: ${e.email}`, 105, 291, { align: 'center' });

  doc.save(`Reglement_${reglement.recu}_${vente.client}.pdf`);
}

function imprimerReglement(reglement: any, vente: any, magasinId?: string) {
  const fmtDateTime = (d: string) => {
    const dt = d ? new Date(d) : new Date();
    return `${dt.toLocaleDateString('fr-FR')} ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };
  // Remplace l'espace insécable du locale fr-FR pour éviter l'affichage comme barre.
  const fmtF = (n: number) => { const v = Math.round((Number(n) || 0) * 100) / 100; const [int, dec] = v.toFixed(2).split('.'); return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec; };
  const editePar = reglement.editePar || (vente as any).createdBy || 'LOUISE MARLÈNE';
  const dateReg = reglement.date || new Date().toISOString();

  // Totaux
  const totalNet = Number(vente.totalNet) || 0;
  const remisePct = parseFloat(vente.recap?.remisePct) || 0;
  const totalBrut = remisePct > 0 ? Math.round(totalNet / (1 - remisePct / 100)) : totalNet;
  const remiseMontant = totalBrut - totalNet;
  // `acompte` = montant du VERSEMENT courant (affiché dans la ligne jaune + en
  // lettres). `totalPaye` = cumul déjà réglé (versement courant inclus) : il
  // alimente la ligne ACOMPTE et le TOTAL RESTE, afin que le reçu se mette à jour
  // quand le client revient solder (reste = net − cumul payé).
  const acompte = Number(reglement.montant) || 0;
  const totalPaye = reglement.totalPaye != null ? Number(reglement.totalPaye) : acompte;
  // Retrait de la prise en charge assurance (comme sur la facture) pour que le
  // reçu se solde correctement : reste = net − assurance − cumul payé.
  const totalAssurance = Array.isArray(vente.bonsAssurance)
    ? vente.bonsAssurance.reduce((s: number, b: any) => s + (Number(b.montantPrisEnCharge) || 0), 0)
    : 0;
  const reste = totalNet - totalAssurance - totalPaye;

  // Lignes « bon assurance » (jaune) — sinon la ligne du versement
  const bons: any[] = Array.isArray(vente.bonsAssurance) ? vente.bonsAssurance : [];
  const lignesInfos = bons.length > 0
    ? bons.map((b: any) => `
      <tr style="background:#ffff00;">
        <td style="padding:10px 8px;vertical-align:top;word-break:break-word;">Bon Assurance N° ${b.numeroBon || '—'} ${b.assurance || ''}<br/>${b.date ? new Date(b.date).toLocaleDateString('fr-FR') : new Date(dateReg).toLocaleDateString('fr-FR')}</td>
        <td style="padding:10px 8px;vertical-align:top;word-break:break-word;">${fmtDateTime(dateReg)}<br/>Édité par: ${editePar}</td>
        <td style="padding:10px 8px;vertical-align:top;text-align:right;white-space:nowrap;">${fmtF(b.montantPrisEnCharge || acompte)} F CFA</td>
      </tr>`).join('')
    : `
      <tr style="background:#ffff00;">
        <td style="padding:10px 8px;vertical-align:top;word-break:break-word;">Versement N° ${reglement.recu || '—'}<br/>${reglement.modePaiement || ''} ${reglement.compteBanque ? '— ' + reglement.compteBanque : ''}</td>
        <td style="padding:10px 8px;vertical-align:top;word-break:break-word;">${fmtDateTime(dateReg)}<br/>Édité par: ${editePar}</td>
        <td style="padding:10px 8px;vertical-align:top;text-align:right;white-space:nowrap;">${fmtF(acompte)} F CFA</td>
      </tr>`;

  const qrData = encodeURIComponent(`${TENANT.nom}|Facture:${vente.recap?.numFacture || ''}|Recu:${reglement.recu || ''}|Client:${vente.numeroClient || ''}|Montant:${acompte}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=0&data=${qrData}`;

  // Même règle que sur le PDF direct : "BON ASSURANCE" seulement s'il y a
  // réellement un bon d'assurance, sinon "RÈGLEMENT" pour un versement classique.
  const titreInfos = bons.length > 0 ? 'INFORMATIONS BON ASSURANCE' : 'INFORMATIONS RÈGLEMENT';

  const totLine = (label: string, val: string, shaded: boolean) => `
    <tr${shaded ? ' style="background:#e5e5e5;"' : ''}>
      <td style="padding:6px 14px;text-align:right;color:#333;">${label}</td>
      <td style="padding:6px 14px;text-align:right;font-weight:700;white-space:nowrap;">${val}</td>
    </tr>`;

  const e = getEntete(magasinId);

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Reçu N° ${reglement.recu || ''}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#111; padding:28px; }
    @media print { body { padding:12px; } .no-print { display:none; } }
    table { border-collapse:collapse; }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#111;color:#fff;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:700;">🖨️ Imprimer</button>

  ${printHeaderHTML(magasinId || '', { date: dateReg })}

  <!-- Bloc client -->
  <div style="background:#e9e9e9;padding:16px 18px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div style="line-height:1.6;">
      <div style="font-weight:700;font-size:15px;">(N° ${vente.numeroClient || '—'}) ${vente.client || ''}</div>
      <div style="margin-top:6px;">Téléphone: ${vente.telephone || ''}</div>
      <div>Email: ${(vente.clientInfo && vente.clientInfo.email) || ''}</div>
    </div>
    <div style="text-align:right;line-height:1.6;">
      <div style="font-weight:700;">Édité par: ${editePar}</div>
      <div>Édité le, ${fmtDateTime(dateReg)}</div>
      <div style="font-weight:700;font-size:15px;">FACTURE N°${vente.recap?.numFacture || '—'} | N° REÇU: ${reglement.recu || '—'}</div>
    </div>
  </div>

  <!-- Tableau infos / montant -->
  <table style="width:100%;margin-top:2px;table-layout:fixed;">
    <colgroup>
      <col style="width:52%"/>
      <col style="width:28%"/>
      <col style="width:20%"/>
    </colgroup>
    <thead>
      <tr style="font-weight:700;border-bottom:2px solid #111;">
        <td style="padding:8px;overflow:hidden;">${titreInfos}</td>
        <td style="padding:8px;overflow:hidden;">ÉDITÉ LE</td>
        <td style="padding:8px;text-align:right;overflow:hidden;">MONTANT</td>
      </tr>
    </thead>
    <tbody>${lignesInfos}</tbody>
  </table>

  <!-- Bloc sombre versement + QR -->
  <div style="background:#2b3441;color:#fff;padding:22px 18px;display:flex;justify-content:space-between;align-items:center;gap:20px;">
    <div style="font-size:15px;max-width:560px;">ARRÊTÉ LE PRÉSENT VERSEMENT À LA SOMME DE:<b> ${montantEnLettres(acompte)}</b></div>
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="${qrUrl}" alt="QR" style="width:100px;height:100px;background:#fff;padding:6px;border-radius:6px;" />
      <div style="font-size:13px;line-height:1.4;">Scanner et Accéder<br/>à votre espace<br/>Client.</div>
    </div>
  </div>

  <!-- Totaux (bloc aligné à droite) -->
  <table style="margin-top:26px;margin-left:auto;width:360px;">
    <tbody>
      ${totLine('TOTAL', fmtF(totalBrut) + ' F CFA', true)}
      ${totLine(`REMISE(${remisePct}%)`, fmtF(remiseMontant) + ' F CFA', false)}
      ${totLine('TOTAL NET', fmtF(totalNet) + ' F CFA', true)}
      ${totalAssurance > 0 ? totLine('PRISE EN CHARGE', fmtF(totalAssurance) + ' F CFA', false) : ''}
      ${totLine('ACOMPTE', fmtF(totalPaye) + ' F CFA', false)}
      ${totLine('TOTAL RESTE', `<span style="color:${reste > 0 ? '#c62828' : '#2e7d32'};">${fmtF(reste)} F CFA</span>`, true)}
    </tbody>
  </table>
  ${reste <= 0 ? `<div style="margin-top:8px;width:360px;margin-left:auto;text-align:right;"><span style="display:inline-block;padding:4px 14px;border-radius:14px;background:#43a047;color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">✓ Soldée</span></div>` : ''}

  <div style="text-align:center;margin-top:40px;color:#111;">Signature &amp; Cachet</div>

  <!-- Pied de page -->
  <div style="margin-top:60px;border-top:1px solid #111;padding-top:14px;text-align:center;font-size:12px;color:#111;">
    ${e.adresse} Téléphone: ${e.telephone} Email: ${e.email}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=800');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}

// ── Auto-ID generators ───────────────────────────────────────────────────────

function genClientId() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

// ── Shared style helpers ─────────────────────────────────────────────────────

const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm bg-white w-full focus:outline-none focus:border-blue-400';
const selCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm bg-white w-full focus:outline-none focus:border-blue-400';
const roCls = 'border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50 w-full';

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-gray-600 mb-1">{children}</div>;
}
function ReqLbl({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-gray-600 mb-1">{children} <span className="text-red-500">*</span></div>;
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { num: 'I-',   title: 'Infos Client & Ophtalmologue', sub: ['* Informations', 'Obligatoires...'] },
  { num: 'II-',  title: 'Infos Verres',                 sub: ['Informations', 'Verres...'] },
  { num: 'III-', title: 'Infos Traitements Montures Accessoires Autres', sub: ['Informations', 'Traitements', 'Montures', 'Accessoires', 'Autres...'] },
  { num: 'IV-',  title: 'Récapitulatif Vente',          sub: ['Récapitulatif', 'Vente...'] },
];

// ════════════════════════════════════════════════════════════════════════════
// STATE TYPES
// ════════════════════════════════════════════════════════════════════════════

interface ClientInfo {
  numeroClient: string;
  civilite: string;
  nom: string;
  telephone1: string;
  telephone2: string;
  email: string;
  adresse: string;
  profession: string;
  jourNaissance: string;
  moisNaissance: string;
  anneeNaissance: string;
  soldeClient: string;
  matriculeAssurance: string;
  entreprise: string;
  ophtalmologue: string;
  telOphtalmologue: string;
  cabinetOphtalmologue: string;
  telCabinet: string;
}

interface VerreInfo {
  datePrescription: string;
  typeVerre: string;
  verre: string;
  traitement: string;
  matiere: string;
  diametre: string;
  oeilDroit: { sphere: string; cylindre: string; axe: string; dec: string; addition: string; hauteur: string; evLoin: string; evPres: string; quantite: string; prix: string; remise: string };
  oeilGauche: { sphere: string; cylindre: string; axe: string; dec: string; addition: string; hauteur: string; evLoin: string; evPres: string; quantite: string; prix: string; remise: string };
  ecartPupillaire: string;
  totalVerres: string;
}

interface ArticleLigne {
  id: string;
  produitId?: string;
  codeBarre: string;
  designation: string;
  type?: 'monture' | 'accessoire' | 'traitement' | 'service' | 'autre';
  stock: string;
  prix: string;
  remise: string;
  quantite: string;
  total: string;
}

interface RecapInfo {
  remisePct: string;
  acompte: string;
  modePaiement: string;
  compteBanque: string;
  details: string;
  rdvRetrait: string;
  numFacture: string;
  numRecu?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// STEP I
// ════════════════════════════════════════════════════════════════════════════

function StepI({ data, onChange, magasinId }: { data: ClientInfo; onChange: (d: ClientInfo) => void; magasinId: string }) {
  const set = (key: keyof ClientInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [key]: e.target.value });
  const professions = useProfessions();
  const ophtalmologues = useOphtalmologues();
  const cabinets = useCabinets();
  const clientsRecords = useClientRecordsMagasin(magasinId);
  const [showClientSug, setShowClientSug] = useState(false);
  const clientBoxRef = useRef<HTMLDivElement>(null);

  const CIVILITES = ['M.', 'Mme', 'Mlle', 'Dr'];

  // Suggestions de clients existants à partir de ce que l'utilisateur tape.
  const clientSuggestions = useMemo(() => {
    const q = (data.nom || '').trim().toLowerCase();
    if (!q) return [];
    return clientsRecords
      .filter(c =>
        (c.nom || '').toLowerCase().includes(q) ||
        (c.telephone || '').toLowerCase().includes(q) ||
        (c.numeroClient || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clientsRecords, data.nom]);

  // Adresses déjà saisies chez d'autres clients — proposées en autocomplétion.
  const adressesConnues = useMemo(() => {
    const quartiers = ['Abobo', 'Adjamé', 'Cocody', 'Koumassi', 'Marcory', 'Plateau', 'Treichville', 'Yopougon', 'Bingerville', 'Port-Bouët', 'Riviera', 'Angré'];
    const fromClients = clientsRecords.map(c => (c.adresse || '').trim()).filter(Boolean);
    return [...new Set([...fromClients, ...quartiers])].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [clientsRecords]);

  // Le nom stocké peut être préfixé de la civilité (« M. Dupont ») : on la sépare.
  const splitCivilite = (nomComplet: string): { civilite: string; nom: string } => {
    const parts = (nomComplet || '').trim().split(' ');
    if (parts.length > 1 && CIVILITES.includes(parts[0])) {
      return { civilite: parts[0], nom: parts.slice(1).join(' ') };
    }
    return { civilite: '', nom: nomComplet || '' };
  };

  const selectClient = (c: ClientRecord) => {
    const { civilite, nom } = splitCivilite(c.nom || '');
    onChange({
      ...data,
      numeroClient: c.numeroClient || data.numeroClient,
      civilite: c.civilite || civilite || data.civilite,
      nom,
      telephone1: c.telephone || '',
      telephone2: c.telephone2 || '',
      email: c.email || '',
      adresse: c.adresse || '',
      profession: c.profession || '',
      jourNaissance: c.jourNaissance || '',
      moisNaissance: c.moisNaissance || '',
      anneeNaissance: c.anneeNaissance || '',
      soldeClient: c.solde != null ? String(c.solde) : data.soldeClient,
      matriculeAssurance: c.matriculeAssurance || '',
      entreprise: c.entreprise || '',
    });
    setShowClientSug(false);
  };

  const handleNomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...data, nom: e.target.value });
    setShowClientSug(e.target.value.trim().length > 0);
  };

  useEffect(() => {
    if (!showClientSug) return;
    const onDocClick = (ev: MouseEvent) => {
      if (clientBoxRef.current && !clientBoxRef.current.contains(ev.target as Node)) {
        setShowClientSug(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showClientSug]);

  return (
    <div className="grid grid-cols-6 gap-x-4 gap-y-3 p-6">
      <div>
        <ReqLbl>N° Client</ReqLbl>
        <input className={roCls + ' font-mono font-semibold text-blue-700'} readOnly value={data.numeroClient} />
      </div>
      <div>
        <Lbl>Civilité</Lbl>
        <select className={selCls} value={data.civilite} onChange={set('civilite')}>
          <option value="">C...</option>
          <option>M.</option><option>Mme</option><option>Mlle</option><option>Dr</option>
        </select>
      </div>
      <div className="relative" ref={clientBoxRef}>
        <ReqLbl>Nom & Prénoms Client</ReqLbl>
        <input
          className={iCls}
          placeholder="Nom complet..."
          value={data.nom}
          onChange={handleNomChange}
          onFocus={() => { if ((data.nom || '').trim()) setShowClientSug(true); }}
          autoComplete="off"
        />
        {showClientSug && clientSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-xl max-h-72 overflow-y-auto">
            {clientSuggestions.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectClient(c)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
              >
                <div className="text-xs font-semibold text-gray-800">{c.nom}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-gray-500">
                  {c.numeroClient && <span>N°&nbsp;: {c.numeroClient}</span>}
                  {c.telephone && <span>Tél.&nbsp;: {c.telephone}</span>}
                  {c.profession && <span>{c.profession}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <ReqLbl>N° Téléphone I</ReqLbl>
        <input className={iCls} placeholder="Ex: 0701234567" value={data.telephone1} onChange={set('telephone1')} />
      </div>
      <div>
        <Lbl>N° Téléphone II</Lbl>
        <input className={iCls} value={data.telephone2} onChange={set('telephone2')} />
      </div>
      <div>
        <Lbl>Email</Lbl>
        <input className={iCls} type="email" placeholder="email@..." value={data.email} onChange={set('email')} />
      </div>

      <div className="col-span-2">
        <Lbl>Adresse</Lbl>
        <input className={iCls} placeholder="Adresse..." list="vf-adresses-list" value={data.adresse} onChange={set('adresse')} />
        <datalist id="vf-adresses-list">
          {adressesConnues.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>
      <div className="col-span-2">
        <Lbl>Profession</Lbl>
        <input className={iCls} placeholder="Profession..." list="vf-professions-list" value={data.profession} onChange={set('profession')} />
        <datalist id="vf-professions-list">
          {professions.map(p => <option key={p} value={p} />)}
        </datalist>
      </div>
      <div className="col-span-1">
        <Lbl>Jour de Naissance</Lbl>
        <div className="flex gap-1">
          <input className={iCls} placeholder="JJ"   maxLength={2} value={data.jourNaissance}  onChange={set('jourNaissance')} />
          <input className={iCls} placeholder="MM"   maxLength={2} value={data.moisNaissance}  onChange={set('moisNaissance')} />
          <input className={iCls} placeholder="AAAA" maxLength={4} value={data.anneeNaissance} onChange={set('anneeNaissance')} />
        </div>
      </div>
      <div className="col-span-1">
        <Lbl>Solde Client</Lbl>
        <input className={iCls} type="number" value={data.soldeClient} onChange={set('soldeClient')} />
      </div>

      <div className="col-span-2">
        <Lbl>Matricule Assurance</Lbl>
        <input className={iCls} style={{ backgroundColor: '#fde8b8' }} value={data.matriculeAssurance} onChange={set('matriculeAssurance')} />
      </div>
      <div className="col-span-2">
        <Lbl>Carte Assuré(e)</Lbl>
        <div className="flex border border-gray-300 rounded overflow-hidden">
          <span className="flex-1 px-3 py-1.5 text-sm text-gray-400 bg-white">Aucun Fichier</span>
          <label className="cursor-pointer px-4 py-1.5 text-sm font-semibold border-l border-gray-300" style={{ backgroundColor: '#fde8b8' }}>
            Charger<input type="file" className="hidden" />
          </label>
        </div>
      </div>
      <div className="col-span-2">
        <Lbl>Entreprise</Lbl>
        <input className={iCls} placeholder="Entreprise..." value={data.entreprise} onChange={set('entreprise')} />
      </div>

      <div className="col-span-6 border-t border-dashed border-gray-300" />

      <div className="col-span-2">
        <Lbl>Ophtalmologue</Lbl>
        <input className={iCls} placeholder="Ophtalmologue..." list="vf-ophtalmo-list" value={data.ophtalmologue} onChange={set('ophtalmologue')} />
        <datalist id="vf-ophtalmo-list">
          {ophtalmologues.map(o => <option key={o} value={o} />)}
        </datalist>
      </div>
      <div className="col-span-1">
        <Lbl>N° Téléphone Ophtalmologue</Lbl>
        <input className={iCls} value={data.telOphtalmologue} onChange={set('telOphtalmologue')} />
      </div>
      <div className="col-span-2">
        <Lbl>Cabinet Ophtalmologue</Lbl>
        <input className={iCls} placeholder="Cabinet..." list="vf-cabinet-list" value={data.cabinetOphtalmologue} onChange={set('cabinetOphtalmologue')} />
        <datalist id="vf-cabinet-list">
          {cabinets.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>
      <div className="col-span-1">
        <Lbl>N° Téléphone Cabinet Ophtalmologue</Lbl>
        <input className={iCls} value={data.telCabinet} onChange={set('telCabinet')} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STEP II
// ════════════════════════════════════════════════════════════════════════════

type OeilKey = keyof VerreInfo['oeilDroit'];
const VERRE_COLS: { key: OeilKey; label: string; w?: number }[] = [
  { key: 'sphere',   label: 'Sphère',    w: 70 },
  { key: 'cylindre', label: 'Cylindre',  w: 70 },
  { key: 'axe',      label: 'Axe',       w: 55 },
  { key: 'dec',      label: 'Dec',       w: 50 },
  { key: 'addition', label: 'Addition',  w: 65 },
  { key: 'hauteur',  label: 'Hauteur',   w: 65 },
  { key: 'evLoin',   label: 'E V Loin',  w: 65 },
  { key: 'evPres',   label: 'E V Près',  w: 65 },
  { key: 'quantite', label: 'Quantité',  w: 65 },
  { key: 'prix',     label: 'Prix',      w: 65 },
  { key: 'remise',   label: 'Remise',    w: 60 },
];

const purpleHdr = 'text-xs font-semibold text-white text-center px-1 py-1 whitespace-nowrap';
const purpleCell = 'border border-purple-400 bg-white px-0.5 py-0.5';
const vInput = 'w-full text-xs text-center border-none outline-none bg-transparent py-1';

function OeilRow({
  label, data, onChange, typeVerre, getRestant,
}: {
  label: string;
  data: VerreInfo['oeilDroit'];
  onChange: (d: VerreInfo['oeilDroit']) => void;
  typeVerre?: string;
  getRestant?: (v: { typeVerre?: string; sphere?: string; cylindre?: string; addition?: string }) => number | null;
}) {
  const set = (key: OeilKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [key]: e.target.value });

  // Disponibilité du stock « Lentilles OPTIC » pour cet œil.
  // vert = disponible (Restant > 0), rouge = indisponible, neutre = pas de case dédiée.
  const aSaisie = (data.sphere || '').trim() !== '' || (data.addition || '').trim() !== '';
  const restant = aSaisie && getRestant
    ? getRestant({ typeVerre, sphere: data.sphere, cylindre: data.cylindre, addition: data.addition })
    : null;
  const dispo = restant == null ? null : restant > 0;

  // Classes de cellule pour les champs « dédiés » au repérage stock.
  const cellClass = (key: OeilKey) => {
    const cible = key === 'sphere' || key === 'cylindre' || key === 'addition';
    if (!cible || dispo == null) return purpleCell;
    return dispo
      ? 'border border-green-500 bg-green-100 px-0.5 py-0.5'
      : 'border border-red-500 bg-red-100 px-0.5 py-0.5';
  };
  const inputColor = (key: OeilKey) => {
    const cible = key === 'sphere' || key === 'cylindre' || key === 'addition';
    if (!cible || dispo == null) return vInput;
    return `${vInput} ${dispo ? 'text-green-800 font-semibold' : 'text-red-800 font-semibold'}`;
  };

  return (
    <tr>
      <td className="border border-purple-400 bg-purple-700 text-white text-xs font-semibold px-2 py-1 whitespace-nowrap">
        {label}
        {dispo != null && (
          <span
            title={dispo ? `Disponible — Restant : ${restant}` : 'Indisponible (rupture)'}
            className={`ml-1 inline-block rounded px-1 ${dispo ? 'bg-green-500' : 'bg-red-600'}`}
          >
            {dispo ? `✓ ${restant}` : '✕ 0'}
          </span>
        )}
      </td>
      {VERRE_COLS.map(({ key }) =>
        key === 'quantite' ? (
          <td key={key} className={purpleCell}>
            <select className="w-full text-xs border-none outline-none bg-white text-center py-1" value={data[key]} onChange={set(key)}>
              {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
            </select>
          </td>
        ) : (
          <td key={key} className={cellClass(key)}>
            <input className={inputColor(key)} value={data[key]} onChange={set(key)} />
          </td>
        )
      )}
    </tr>
  );
}

function VerreBlock({
  data, index, total, onChange, onRemove,
}: {
  data: VerreInfo; index: number; total: number;
  onChange: (d: VerreInfo) => void; onRemove: () => void;
}) {
  const typesVerre = useTypesVerre();
  const verresList = useVerresList();
  const getRestant = useLentillesOpticStock();
  const [showVerreSug, setShowVerreSug] = useState(false);
  const verreBoxRef = useRef<HTMLDivElement>(null);

  // Suggestions filtrées : uniquement à partir de ce que l'utilisateur commence à
  // écrire (pas de liste complète), et restreintes au type de verre choisi.
  const verreSuggestions = useMemo(() => {
    const q = (data.verre || '').trim().toLowerCase();
    if (!q) return [];
    return verresList
      .filter(v => {
        if (data.typeVerre && v.typeVerre && v.typeVerre.toLowerCase() !== data.typeVerre.toLowerCase()) return false;
        return (
          v.verre?.toLowerCase().includes(q) ||
          v.traitement?.toLowerCase().includes(q) ||
          v.matiere?.toLowerCase().includes(q) ||
          v.fournisseur?.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [verresList, data.verre, data.typeVerre]);

  const selectVerre = (v: VerreRecord) => {
    // Le prix du verre se répartit à parts égales dans chaque œil (OD + OG).
    const prixUnitaire = (Number(v.prixVerre) || 0) / 2;
    const prixStr = prixUnitaire ? String(prixUnitaire) : data.oeilDroit.prix;
    const oeilDroit = { ...data.oeilDroit, prix: prixStr };
    const oeilGauche = { ...data.oeilGauche, prix: prixStr };
    onChange({
      ...data,
      verre: v.verre,
      traitement: v.traitement || data.traitement,
      matiere: v.matiere || data.matiere,
      diametre: v.diametre || data.diametre,
      oeilDroit,
      oeilGauche,
      totalVerres: calcTotal(oeilDroit, oeilGauche),
    });
    setShowVerreSug(false);
  };

  // Fermer la liste au clic à l'extérieur.
  useEffect(() => {
    if (!showVerreSug) return;
    const onDocClick = (e: MouseEvent) => {
      if (verreBoxRef.current && !verreBoxRef.current.contains(e.target as Node)) {
        setShowVerreSug(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showVerreSug]);

  const calcTotal = (od: typeof data.oeilDroit, og: typeof data.oeilGauche): string => {
    const lineTotal = (o: typeof od) => {
      const p = parseFloat(o.prix) || 0;
      const q = parseFloat(o.quantite) || 1;
      const r = parseFloat(o.remise) || 0;
      return p * q * (1 - r / 100);
    };
    return String(Math.round(lineTotal(od) + lineTotal(og)));
  };

  const set = (key: keyof VerreInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [key]: e.target.value });

  const handleVerreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const found = findVerreByName(verresList, val);
    setShowVerreSug(val.trim().length > 0);
    // Correspondance exacte : on répartit aussi le prix dans chaque œil.
    const prixUnitaire = found ? (Number(found.prixVerre) || 0) / 2 : 0;
    const oeilDroit = found && prixUnitaire ? { ...data.oeilDroit, prix: String(prixUnitaire) } : data.oeilDroit;
    const oeilGauche = found && prixUnitaire ? { ...data.oeilGauche, prix: String(prixUnitaire) } : data.oeilGauche;
    onChange({
      ...data,
      verre: val,
      traitement: found ? found.traitement : data.traitement,
      matiere: found ? found.matiere : data.matiere,
      diametre: found ? found.diametre : data.diametre,
      oeilDroit,
      oeilGauche,
      totalVerres: calcTotal(oeilDroit, oeilGauche),
    });
  };

  return (
    <div className="rounded-lg p-3 flex flex-col gap-3" style={{ backgroundColor: '#c96fe8' }}>
      {/* Header row: Verre # + remove button */}
      <div className="flex items-center justify-between">
        <span className="text-white text-xs font-bold uppercase tracking-widest">
          Verre {index + 1}
        </span>
        {total > 1 && (
          <button
            onClick={onRemove}
            className="flex items-center gap-1 px-2 py-1 rounded text-white text-xs font-semibold"
            style={{ backgroundColor: '#e05252' }}
          >
            <Trash2 size={12} /> Supprimer
          </button>
        )}
      </div>

      {/* Type / Verre / Traitement / Matière / Diamètre */}
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 grid grid-cols-5 gap-2 min-w-0">
          <div>
            <div className={purpleHdr}>Type Verre</div>
            <select className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.typeVerre} onChange={set('typeVerre')}>
              <option value="">Type Verre</option>
              {typesVerre.length > 0
                ? typesVerre.map(t => <option key={t}>{t}</option>)
                : (<><option>Unifocal</option><option>Bifocal</option><option>Progressif</option></>)
              }
            </select>
          </div>
          <div className="col-span-2 relative" ref={verreBoxRef}>
            <div className={purpleHdr}>Verre</div>
            <input
              className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white"
              placeholder="Commencez à écrire le verre..."
              value={data.verre}
              onChange={handleVerreChange}
              onFocus={() => { if ((data.verre || '').trim()) setShowVerreSug(true); }}
              autoComplete="off"
            />
            {showVerreSug && verreSuggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-purple-300 rounded-lg shadow-xl max-h-72 overflow-y-auto"
              >
                {verreSuggestions.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectVerre(v)}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-purple-100 last:border-0"
                  >
                    <div className="text-xs font-semibold text-purple-900">{v.verre}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-gray-600">
                      {v.typeVerre && <span>Type&nbsp;: {v.typeVerre}</span>}
                      {v.traitement && <span>Traitement&nbsp;: {v.traitement}</span>}
                      {v.matiere && <span>Matière&nbsp;: {v.matiere}</span>}
                      {v.diametre && <span>Ø&nbsp;: {v.diametre}</span>}
                      {v.fournisseur && <span>Fourn.&nbsp;: {v.fournisseur}</span>}
                      {v.garantie && <span>Garantie&nbsp;: {v.garantie}</span>}
                      {v.prixVerre ? <span className="font-semibold text-purple-700">{Number(v.prixVerre).toLocaleString('fr-FR')} F</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className={purpleHdr}>Traitement</div>
            <input className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.traitement} onChange={set('traitement')} />
          </div>
          <div>
            <div className={purpleHdr}>Matière</div>
            <input className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.matiere} onChange={set('matiere')} />
          </div>
        </div>
        <div className="shrink-0" style={{ minWidth: 80 }}>
          <div className={purpleHdr}>Diamètre</div>
          <input className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.diametre} onChange={set('diametre')} />
        </div>
      </div>

      {/* Oeil Droit */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth: 700 }}>
          <thead>
            <tr style={{ backgroundColor: '#b050d0' }}>
              <th className="w-20 px-2 text-white text-xs py-1"></th>
              {VERRE_COLS.map(c => <th key={c.key} className={purpleHdr} style={{ width: c.w }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <OeilRow label="Oeil Droit" data={data.oeilDroit} typeVerre={data.typeVerre} getRestant={getRestant} onChange={(d) => {
              const next = { ...data, oeilDroit: d };
              onChange({ ...next, totalVerres: calcTotal(d, next.oeilGauche) });
            }} />
          </tbody>
        </table>
      </div>

      {/* Oeil Gauche */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth: 700 }}>
          <thead>
            <tr style={{ backgroundColor: '#b050d0' }}>
              <th className="w-20 px-2 text-white text-xs py-1"></th>
              {VERRE_COLS.map(c => <th key={c.key} className={purpleHdr} style={{ width: c.w }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <OeilRow label="Oeil Gauche" data={data.oeilGauche} typeVerre={data.typeVerre} getRestant={getRestant} onChange={(d) => {
              const next = { ...data, oeilGauche: d };
              onChange({ ...next, totalVerres: calcTotal(next.oeilDroit, d) });
            }} />
          </tbody>
        </table>
      </div>

      {/* Ecart Pupillaire + Total */}
      <div className="flex items-center gap-6 px-2 flex-wrap">
        <span className="text-white text-sm tracking-widest font-medium">E c a r t &nbsp; P u p i l l a i r e</span>
        <label className="flex items-center gap-1 text-white text-sm cursor-pointer">
          <input type="radio" name={`ecart-${index}`} value="loin" checked={data.ecartPupillaire === 'loin'} onChange={set('ecartPupillaire')} /> Loin
        </label>
        <label className="flex items-center gap-1 text-white text-sm cursor-pointer">
          <input type="radio" name={`ecart-${index}`} value="pres" checked={data.ecartPupillaire === 'pres'} onChange={set('ecartPupillaire')} /> Près
        </label>
        <div className="flex-1" />
        <div className="flex flex-col items-end gap-1">
          <span className="text-white text-xs font-semibold">Total</span>
          <input className="border border-purple-200 rounded px-2 py-1 text-sm bg-purple-50 w-40 font-semibold text-purple-900 text-right" readOnly value={data.totalVerres ? Number(data.totalVerres).toLocaleString('fr-FR') : '0'} />
        </div>
      </div>
    </div>
  );
}

const emptyVerre = (): VerreInfo => ({
  datePrescription: '', typeVerre: '', verre: '', traitement: '', matiere: '', diametre: '',
  oeilDroit: { ...emptyOeil }, oeilGauche: { ...emptyOeil },
  ecartPupillaire: 'loin', totalVerres: '',
});

function StepII({ data, onChange, client, magasinId }: {
  data: VerreInfo[]; onChange: (d: VerreInfo[]) => void;
  client: ClientInfo; magasinId: string;
}) {
  const [datePrescription, setDatePrescription] = useState('');
  const [showOrdo, setShowOrdo] = useState(false);
  const [loadingOrdo, setLoadingOrdo] = useState(false);
  const [ordoList, setOrdoList] = useState<{ date: string; numero: string; verres: VerreInfo[] }[]>([]);

  // Un même client peut être retrouvé par son numéro, son téléphone ou son nom.
  const matchClient = (v: VenteSupabase): boolean => {
    const nc = (client.numeroClient || '').trim();
    if (nc && (v.numero_client || '').trim() === nc) return true;
    const tel = (client.telephone1 || '').trim();
    if (tel && (v.telephone || '').trim() === tel) return true;
    const nom = (client.nom || '').trim().toLowerCase();
    if (nom && (v.client || '').trim().toLowerCase() === nom) return true;
    return false;
  };

  const buildOrdo = (ventes: VenteSupabase[]) =>
    ventes
      .filter(v => matchClient(v) && Array.isArray(v.verres) && v.verres.length > 0)
      .map(v => ({
        date: v.created_at || v.date || '',
        numero: (v.recap && (v.recap.numFacture || v.recap.numero)) || v.id,
        verres: v.verres as VerreInfo[],
      }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const openOrdonnances = async () => {
    if (!client.numeroClient && !client.nom && !client.telephone1) {
      alert("Veuillez d'abord renseigner le client (onglet Infos Client) pour charger ses anciennes ordonnances.");
      return;
    }
    setShowOrdo(true);
    setLoadingOrdo(true);
    // Cache instantané puis rafraîchissement cloud.
    setOrdoList(buildOrdo(readVentesCache(magasinId)));
    try {
      const fresh = await chargerVentesSupabase(magasinId);
      setOrdoList(buildOrdo(fresh));
    } catch { /* on garde le cache */ }
    setLoadingOrdo(false);
  };

  const applyOrdonnance = (verres: VerreInfo[]) => {
    // Clone (évite de muter l'objet stocké) et complète les champs manquants.
    onChange(verres.map(v => ({ ...emptyVerre(), ...v })));
    setShowOrdo(false);
  };

  const handleAdd = () => {
    onChange([...data, { ...emptyVerre(), datePrescription }]);
  };

  const handleChange = (i: number, v: VerreInfo) => {
    const next = [...data];
    next[i] = v;
    onChange(next);
  };

  const handleRemove = (i: number) => {
    onChange(data.filter((_, idx) => idx !== i));
  };

  return (
    <div className="p-5 flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Date Prescription</span>
        <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white">
          <input
            type="date"
            className="px-3 py-1.5 text-sm outline-none"
            value={datePrescription}
            onChange={e => setDatePrescription(e.target.value)}
          />
          <span className="px-2 text-gray-400"><Calendar size={14} /></span>
        </div>
        <button
          type="button"
          onClick={openOrdonnances}
          className="px-4 py-1.5 rounded text-white text-sm font-semibold"
          style={{ backgroundColor: '#e09a2b' }}
        >
          Dernière Ordonnance
        </button>
        <div className="flex-1" />
        <AddButton
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-1.5 rounded text-white text-sm font-semibold"
          style={{ backgroundColor: '#9b45c7' }}
        >
          <Plus size={14} /> Ajouter Verre
        </AddButton>
      </div>

      {data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 rounded-lg border-2 border-dashed border-purple-300 text-purple-400">
          <span className="text-sm">Aucun verre ajouté — cliquez sur <strong>Ajouter Verre</strong></span>
        </div>
      )}

      {data.map((v, i) => (
        <VerreBlock
          key={i}
          index={i}
          total={data.length}
          data={v}
          onChange={(updated) => handleChange(i, updated)}
          onRemove={() => handleRemove(i)}
        />
      ))}

      {/* Modale : anciennes ordonnances du client */}
      {showOrdo && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowOrdo(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ backgroundColor: '#f5eefb' }}>
              <div>
                <div className="text-sm font-bold text-purple-900">Anciennes ordonnances</div>
                <div className="text-xs text-gray-500">{client.nom || client.numeroClient || client.telephone1 || 'Client'}</div>
              </div>
              <button type="button" onClick={() => setShowOrdo(false)} className="text-gray-500 hover:text-gray-800">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-4 flex flex-col gap-3">
              {loadingOrdo && ordoList.length === 0 && (
                <div className="text-center text-sm text-gray-500 py-8">Chargement des ordonnances…</div>
              )}
              {!loadingOrdo && ordoList.length === 0 && (
                <div className="text-center text-sm text-gray-500 py-8">Aucune ordonnance trouvée pour ce client.</div>
              )}
              {ordoList.map((o, idx) => (
                <div key={`${o.numero}-${idx}`} className="border border-purple-200 rounded-lg p-3 hover:border-purple-400">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-purple-900">
                      {formatDate(o.date)} <span className="text-gray-400">· {o.numero}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyOrdonnance(o.verres)}
                      className="px-3 py-1 rounded text-white text-xs font-semibold"
                      style={{ backgroundColor: '#9b45c7' }}
                    >
                      Charger
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {o.verres.map((v, vi) => (
                      <div key={vi} className="text-[11px] text-gray-600 flex flex-wrap gap-x-3">
                        <span className="font-semibold text-gray-800">{v.verre || v.typeVerre || `Verre ${vi + 1}`}</span>
                        <span>OD&nbsp;: {v.oeilDroit?.sphere || '—'} / {v.oeilDroit?.cylindre || '—'} × {v.oeilDroit?.axe || '—'}</span>
                        <span>OG&nbsp;: {v.oeilGauche?.sphere || '—'} / {v.oeilGauche?.cylindre || '—'} × {v.oeilGauche?.axe || '—'}</span>
                        {v.traitement && <span>{v.traitement}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STEP III
// ════════════════════════════════════════════════════════════════════════════

function StepIII({
  articles, onChange, observation, onObsChange, magasinId,
}: {
  articles: ArticleLigne[];
  onChange: (a: ArticleLigne[]) => void;
  observation: string;
  onObsChange: (v: string) => void;
  magasinId: string;
}) {
  const [search, setSearch] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchMonture, setSearchMonture] = useState('');
  const [searchService, setSearchService] = useState('');
  const products = useVenteProducts(magasinId);

  // Options pour les datalists (libellés + codes-barres). Les articles gérés en
  // stock (monture/accessoire) en rupture (stock ≤ 0) sont exclus : on ne propose
  // que ce qui est réellement disponible dans le magasin. Les verres/services
  // (stock null, non gérés en stock) restent toujours proposés.
  const disponible = (p: VenteProduct) => p.stock == null || p.stock > 0;
  const allOptions = [...new Set(
    products.filter(disponible).flatMap(p => [p.label, p.codeBarre].filter(Boolean))
  )];
  // Montures / accessoires : on ne propose QUE les articles réellement présents
  // dans le magasin (stock reçu par bon de distribution ou de transfert > 0).
  // Un article en rupture n'apparaît plus dans la liste de choix.
  const montureAccOptions = [...new Set(
    products.filter(p => (p.type === 'monture' || p.type === 'accessoire') && (p.stock ?? 0) > 0)
      .flatMap(p => [p.label, p.codeBarre].filter(Boolean))
  )];
  const traitServiceOptions = [...new Set(
    products.filter(p => p.type === 'verre' || p.type === 'service')
      .map(p => p.label).filter(Boolean)
  )];

  // Crée une ligne d'article à partir d'un produit du catalogue
  const productToLigne = (p: VenteProduct): ArticleLigne => ({
    id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7),
    produitId: p.produitId,
    codeBarre: p.codeBarre || genCodeBarre(),
    designation: p.label,
    type: p.type === 'verre' ? 'traitement' : p.type,
    stock: p.stock === null ? '' : String(p.stock),
    prix: String(p.prix ?? ''),
    remise: '0',
    quantite: '1',
    total: String(Math.round(p.prix || 0)),
  });

  // Ajoute une ligne depuis une barre de recherche, si un produit correspond
  const addFromSearch = (
    value: string,
    filter: (p: VenteProduct) => boolean,
    clear: () => void,
  ) => {
    const found = findVenteProduct(products.filter(filter), value);
    if (found) {
      onChange([...articles, productToLigne(found)]);
      clear();
    }
  };

  const addLigne = useCallback(() => {
    const newLigne: ArticleLigne = {
      id: Date.now().toString(),
      codeBarre: genCodeBarre(),
      designation: '',
      stock: '',
      prix: '',
      remise: '0',
      quantite: '1',
      total: '',
    };
    onChange([...articles, newLigne]);
  }, [articles, onChange]);

  const updateLigne = (id: string, key: keyof ArticleLigne, val: string) => {
    onChange(articles.map(a => {
      if (a.id !== id) return a;
      let updated = { ...a, [key]: val };
      if (key === 'designation') {
        const found = findVenteProduct(products, val);
        if (found) {
          updated = {
            ...updated,
            produitId: found.produitId,
            codeBarre: found.codeBarre || updated.codeBarre,
            type: found.type === 'verre' ? 'traitement' : found.type,
            stock: found.stock === null ? updated.stock : String(found.stock),
            prix: String(found.prix ?? ''),
          };
          const p = parseFloat(String(found.prix)) || 0;
          const q = parseFloat(updated.quantite) || 1;
          const r = parseFloat(updated.remise) || 0;
          updated.total = String(Math.round(p * q * (1 - r / 100)));
        }
      }
      if (key === 'prix' || key === 'quantite' || key === 'remise') {
        const p = parseFloat(updated.prix) || 0;
        const q = parseFloat(updated.quantite) || 1;
        const r = parseFloat(updated.remise) || 0;
        updated.total = String(Math.round(p * q * (1 - r / 100)));
      }
      return updated;
    }));
  };

  const removeLigne = (id: string) => onChange(articles.filter(a => a.id !== id));

  return (
    <div className="p-5 flex flex-col gap-4">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-white border border-gray-300">
              <th className="text-left px-3 py-2.5 font-semibold text-gray-800 border border-gray-300">Monture | Accessoire | Traitement | Service</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Code Barre</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Stock</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Prix</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Remise</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Quantité</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Total</th>
              <th className="px-3 py-2.5 border border-gray-300 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-gray-400 text-sm py-6 border border-gray-200">
                  Aucun article — cliquez sur <strong>+ Ajouter</strong>
                </td>
              </tr>
            )}
            {articles.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1 border border-gray-200">
                  <input
                    className={iCls}
                    placeholder="Désignation..."
                    list="produits-datalist"
                    value={a.designation}
                    onChange={e => updateLigne(a.id, 'designation', e.target.value)}
                  />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={roCls + ' font-mono text-xs text-center'} readOnly value={a.codeBarre} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  {(() => {
                    const stockNum = parseFloat(a.stock);
                    const qteNum = parseFloat(a.quantite) || 0;
                    const hasStock = a.stock !== '' && !isNaN(stockNum);
                    const rupture = hasStock && stockNum <= 0;
                    const insuffisant = hasStock && stockNum > 0 && qteNum > stockNum;
                    return (
                      <input
                        className={
                          iCls + ' text-center font-semibold ' +
                          (rupture ? 'text-red-600 bg-red-50' : insuffisant ? 'text-orange-600 bg-orange-50' : 'text-green-700')
                        }
                        title={rupture ? 'Rupture de stock dans ce magasin' : insuffisant ? 'Quantité vendue supérieure au stock disponible' : 'Stock réel du magasin'}
                        value={a.stock}
                        onChange={e => updateLigne(a.id, 'stock', e.target.value)}
                      />
                    );
                  })()}
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls + ' text-center'} type="number" value={a.prix} onChange={e => updateLigne(a.id, 'prix', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls + ' text-center'} type="number" min="0" max="100" value={a.remise} onChange={e => updateLigne(a.id, 'remise', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls + ' text-center'} type="number" min="1" value={a.quantite} onChange={e => updateLigne(a.id, 'quantite', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={roCls + ' text-center font-semibold'} readOnly value={a.total} />
                </td>
                <td className="px-2 py-1 border border-gray-200 text-center">
                  <button onClick={() => removeLigne(a.id)} className="text-red-500 hover:text-red-700"><X size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stock réel de CHAQUE magasin pour les articles saisis : si le magasin
          vendeur est en rupture, le vendeur voit où l'article est disponible et
          peut demander un transfert plutôt que de perdre la vente. */}
      <StockParMagasin lignes={articles} products={products} magasinId={magasinId} />

      <datalist id="produits-datalist">
        {allOptions.map((opt, i) => <option key={i} value={opt} />)}
      </datalist>
      <datalist id="monture-acc-datalist">
        {montureAccOptions.map((opt, i) => <option key={i} value={opt} />)}
      </datalist>
      <datalist id="trait-service-datalist">
        {traitServiceOptions.map((opt, i) => <option key={i} value={opt} />)}
      </datalist>

      <AddButton
        onClick={addLigne}
        className="self-start flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-white"
        style={{ backgroundColor: '#1a7a96' }}
      >
        <Plus size={14} /> Ajouter un Article
      </AddButton>

      {/* Search card */}
      <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
        <div className="flex items-start gap-6 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-blue-500 text-sm font-medium">Recherche...............</span>
            <input
              className={iCls}
              list="produits-datalist"
              placeholder="Recherche libre (tout produit)..."
              value={search}
              onChange={e => {
                const v = e.target.value;
                setSearch(v);
                addFromSearch(v, () => true, () => setSearch(''));
              }}
            />
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4 min-w-0">
            <div>
              <div className="text-sm text-gray-400 mb-1 text-center">Code Barre</div>
              <input
                className={iCls}
                placeholder="Scanner / saisir..."
                value={searchCode}
                onChange={e => {
                  const v = e.target.value;
                  setSearchCode(v);
                  const found = products.find(p => p.codeBarre && p.codeBarre.toLowerCase() === v.trim().toLowerCase());
                  if (found) { onChange([...articles, productToLigne(found)]); setSearchCode(''); }
                }}
              />
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1 text-center">Monture Accessoire</div>
              <input
                className={iCls}
                list="monture-acc-datalist"
                placeholder="Référence ou marque..."
                value={searchMonture}
                onChange={e => {
                  const v = e.target.value;
                  setSearchMonture(v);
                  addFromSearch(v, p => p.type === 'monture' || p.type === 'accessoire', () => setSearchMonture(''));
                }}
              />
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1 text-center">Traitement Service</div>
              <input
                className={iCls}
                list="trait-service-datalist"
                placeholder="Verre, traitement ou service..."
                value={searchService}
                onChange={e => {
                  const v = e.target.value;
                  setSearchService(v);
                  addFromSearch(v, p => p.type === 'verre' || p.type === 'service', () => setSearchService(''));
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200" />

      <div>
        <Lbl>Observation</Lbl>
        <textarea
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 resize-none"
          rows={4}
          value={observation}
          onChange={e => onObsChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// IMPRESSION FACTURE
// ════════════════════════════════════════════════════════════════════════════

interface FactureData {
  numFacture: string;
  numeroClient: string;
  client: string;
  telephone: string;
  date: string;
  modePaiement: string;
  rdvRetrait: string;
  verres?: VerreInfo[];
  articles: ArticleLigne[];
  bonsAssurance: BonAssurance[];
  totalNet: number;
  remisePct: string;
  acompte: string;
  editePar?: string;
  dateEdition?: string;
}

function imprimerFacture(f: FactureData, magasinId?: string) {
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const fmtDateHeure = (d?: string) => {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const editePar = f.editePar || '—';
  const acompte = parseFloat(f.acompte) || 0;
  const totalAssurance = f.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
  const reste = f.totalNet - totalAssurance - acompte;
  const remisePct = parseFloat(f.remisePct) || 0;
  const totalBrutVerres = (f.verres || []).reduce((s, v: any) => s + (parseFloat(v.totalVerres) || 0), 0);
  const totalBrutArticles = f.articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
  const totalBrut = totalBrutVerres + totalBrutArticles;
  const remiseMontant = totalBrut - f.totalNet;

  const verres = f.verres || [];
  const hasVerres = verres.length > 0;
  const hasMontures = f.articles.length > 0;

  // ── Section VERRES (affichée seulement si le client prend des verres) ──────
  const cellV = 'padding:5px 6px;border:1px solid #cfd8dc;text-align:center;';
  const ligneOeil = (label: string, o: any) => `
    <tr style="background:#eaf3f7;">
      <td style="${cellV}text-align:left;font-weight:600;">${label}</td>
      <td style="${cellV}">${o?.sphere || '-'}</td>
      <td style="${cellV}">${o?.cylindre || '-'}</td>
      <td style="${cellV}">${o?.axe || '-'}</td>
      <td style="${cellV}">${o?.dec || '-'}</td>
      <td style="${cellV}">${o?.addition || '-'}</td>
      <td style="${cellV}">${o?.hauteur || '-'}</td>
      <td style="${cellV}">${o?.evLoin || '-'}</td>
      <td style="${cellV}">${o?.evPres || '-'}</td>
      <td style="${cellV}">${o?.quantite || '1'}</td>
      <td style="${cellV}text-align:right;">${parseFloat(o?.prix || '0').toLocaleString('fr-FR')}</td>
      <td style="${cellV}">${o?.remise || '0.00'}</td>
      <td style="${cellV}text-align:right;font-weight:600;">${parseFloat(o?.prix || '0').toLocaleString('fr-FR')}</td>
    </tr>`;
  const verresHTML = verres.map(v => `
    <div style="border:1px solid #cfd8dc;border-radius:6px;overflow:hidden;margin-bottom:10px;">
      <div style="background:#fde8b8;padding:8px 12px;">
        <div style="font-weight:700;">${v.typeVerre || '—'}${v.verre ? ' | ' + v.verre : ''}</div>
        ${v.traitement ? `<div style="font-size:11px;">${v.traitement}</div>` : ''}
        ${v.matiere ? `<div style="font-size:11px;">${v.matiere}</div>` : ''}
        <div style="font-size:11px;font-weight:600;margin-top:2px;">Garantie: 2 ANS</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#1a7a96;color:#fff;">
          <th style="${cellV}color:#fff;border-color:#1a7a96;"></th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Sphère</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Cylindre</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Axe</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Dec</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Addition</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Hauteur</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">E V Loin</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">E V Près</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Qté</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Prix</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Remise</th>
          <th style="${cellV}color:#fff;border-color:#1a7a96;">Total</th>
        </tr></thead>
        <tbody>
          ${ligneOeil('Oeil Droit', v.oeilDroit)}
          ${ligneOeil('Oeil Gauche', v.oeilGauche)}
          <tr><td colspan="12" style="${cellV}text-align:right;font-weight:600;">Total Verres</td>
              <td style="${cellV}text-align:right;font-weight:700;">${parseFloat(v.totalVerres || '0').toLocaleString('fr-FR')}</td></tr>
        </tbody>
      </table>
    </div>`).join('');

  // ── Section MONTURES / ARTICLES (affichée seulement s'il y a des articles) ─
  const lignesArticles = f.articles.map(a => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;">
            <div style="font-weight:600;">${a.designation || '—'}</div>
            <div style="font-size:10px;">Garantie: 2 ANS</div>
          </td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:center;">${a.codeBarre || '—'}</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:center;">${a.quantite}</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right;">${parseFloat(a.prix||'0').toLocaleString('fr-FR')}</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:center;">${a.remise}%</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right;font-weight:600;">${parseFloat(a.total||'0').toLocaleString('fr-FR')}</td>
        </tr>`).join('');

  const lignesBons = f.bonsAssurance.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
        <thead><tr style="background:#fff3e0;">
          <th style="padding:6px 10px;border:1px solid #ffe0b2;text-align:left;">Assurance</th>
          <th style="padding:6px 10px;border:1px solid #ffe0b2;">N° Bon</th>
          <th style="padding:6px 10px;border:1px solid #ffe0b2;">Matricule</th>
          <th style="padding:6px 10px;border:1px solid #ffe0b2;text-align:right;">Montant PC (FCFA)</th>
        </tr></thead>
        <tbody>${f.bonsAssurance.map(b => `
          <tr>
            <td style="padding:5px 10px;border:1px solid #ffe0b2;">${b.assurance}</td>
            <td style="padding:5px 10px;border:1px solid #ffe0b2;text-align:center;">${b.numeroBon}</td>
            <td style="padding:5px 10px;border:1px solid #ffe0b2;text-align:center;">${b.matricule||'—'}</td>
            <td style="padding:5px 10px;border:1px solid #ffe0b2;text-align:right;color:#2e7d32;font-weight:600;">${parseFloat(b.montantPrisEnCharge).toLocaleString('fr-FR')}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p style="color:#999;font-size:12px;margin:4px 0;">Aucun bon d\'assurance</p>';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Facture ${f.numFacture || 'N/A'} — ${TENANT.nomComplet}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 30px; }
    @media print { body { padding: 15px; } .no-print { display: none; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #1a7a96; padding-bottom: 20px; }
    .logo-box { background: #1a7a96; color: white; font-weight: 900; font-size: 22px; padding: 12px 18px; border-radius: 8px; letter-spacing: 1px; }
    .logo-sub { font-size: 10px; font-weight: 400; letter-spacing: 3px; opacity: 0.85; }
    .company-info { text-align: right; font-size: 11px; color: #555; line-height: 1.7; }
    .facture-title { font-size: 20px; font-weight: 700; color: #1a7a96; margin-bottom: 4px; }
    .badge { display: inline-block; background: #e3f2fd; color: #1a7a96; border-radius: 4px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; font-weight: 700; color: #1a7a96; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; border-left: 3px solid #1a7a96; padding-left: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 12px; }
    .info-row { display: flex; gap: 6px; }
    .info-label { color: #777; min-width: 110px; }
    .info-val { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #1a7a96; color: white; }
    thead th { padding: 8px 10px; text-align: left; font-weight: 600; }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }
    .totaux { margin-top: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 13px; }
    .totaux-row { display: flex; justify-content: space-between; width: 280px; }
    .totaux-row.net { font-size: 15px; font-weight: 700; border-top: 2px solid #1a7a96; padding-top: 6px; margin-top: 4px; }
    .totaux-row.reste { font-size: 14px; font-weight: 700; color: ${reste > 0 ? '#c62828' : '#2e7d32'}; }
    .footer { margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 16px; font-size: 11px; color: #888; display: flex; justify-content: space-between; }
    .signature-box { border: 1px dashed #ccc; width: 180px; height: 60px; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 11px; border-radius: 4px; }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #1a7a96; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer</button>

  <!-- EN-TÊTE PARTAGÉ (style reçu image) -->
  ${printHeaderHTML(magasinId || '', { date: f.date })}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
    <div class="facture-title">FACTURE</div>
    <div class="company-info">
      <div class="badge">N° ${f.numFacture || 'N/A'}</div>
      <div style="margin-top:8px;">Date : <strong>${fmt(f.date)}</strong></div>
      <div>N° Client : <strong>${f.numeroClient}</strong></div>
      <div style="margin-top:6px;">Édité par : <strong>${editePar}</strong></div>
      <div>Le : <strong>${fmtDateHeure(f.dateEdition || f.date)}</strong></div>
    </div>
  </div>

  <!-- INFOS CLIENT -->
  <div class="section">
    <div class="section-title">Informations Client</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Nom :</span><span class="info-val">${f.client || '—'}</span></div>
      <div class="info-row"><span class="info-label">Téléphone :</span><span class="info-val">${f.telephone || '—'}</span></div>
      <div class="info-row"><span class="info-label">Date facture :</span><span class="info-val">${fmt(f.date)}</span></div>
      <div class="info-row"><span class="info-label">RDV Retrait :</span><span class="info-val">${f.rdvRetrait ? fmt(f.rdvRetrait) : '—'}</span></div>
      <div class="info-row"><span class="info-label">Mode paiement :</span><span class="info-val">${f.modePaiement || '—'}</span></div>
    </div>
  </div>

  <!-- VERRES (si le client prend des verres) -->
  ${hasVerres ? `
  <div class="section">
    <div class="section-title">Verres</div>
    ${verresHTML}
  </div>` : ''}

  <!-- MONTURES / ARTICLES (si le client prend une monture ou un article) -->
  ${hasMontures ? `
  <div class="section">
    <div class="section-title">Montures &amp; Articles</div>
    <table>
      <thead>
        <tr>
          <th>Désignation</th>
          <th class="center">Code Barre</th>
          <th class="center">Qté</th>
          <th class="right">Prix Unit.</th>
          <th class="center">Remise</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${lignesArticles}</tbody>
    </table>
  </div>` : ''}

  ${!hasVerres && !hasMontures ? '<div class="section"><p style="color:#999;">Aucun article</p></div>' : ''}

  <!-- BONS ASSURANCE -->
  <div class="section">
    <div class="section-title">Bons d'Assurance</div>
    ${lignesBons}
  </div>

  <!-- TOTAUX -->
  <div class="totaux">
    <div class="totaux-row"><span>TOTAL :</span><span>${totalBrut.toLocaleString('fr-FR')} F CFA</span></div>
    ${remiseMontant > 0 ? `<div class="totaux-row"><span>REMISE (${remisePct}%) :</span><span>- ${remiseMontant.toLocaleString('fr-FR')} F CFA</span></div>` : ''}
    <div class="totaux-row net"><span>TOTAL NET :</span><span>${f.totalNet.toLocaleString('fr-FR')} F CFA</span></div>
    ${totalAssurance > 0 ? `<div class="totaux-row" style="color:#2e7d32"><span>Prise en charge assurance :</span><span>- ${totalAssurance.toLocaleString('fr-FR')} F CFA</span></div>` : ''}
    ${acompte > 0 ? `<div class="totaux-row"><span>ACOMPTE :</span><span>- ${acompte.toLocaleString('fr-FR')} F CFA</span></div>` : ''}
    <div class="totaux-row reste"><span>TOTAL RESTE :</span><span>${reste.toLocaleString('fr-FR')} F CFA</span></div>
    ${reste <= 0 ? `<div style="margin-top:8px;text-align:right;"><span style="display:inline-block;padding:4px 14px;border-radius:14px;background:#43a047;color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">✓ Soldée</span></div>` : ''}
  </div>

  <!-- MONTANT EN TOUTES LETTRES -->
  <div style="margin-top:16px;font-size:12px;font-weight:600;text-transform:uppercase;">
    Arrêté la présente facture à la somme de : ${montantEnLettres(f.totalNet)}
  </div>

  <!-- PIED DE PAGE -->
  <div class="footer">
    <div>
      <div>Merci de votre confiance.</div>
      <div style="margin-top:4px;">${TENANT.nomComplet} — Abidjan, Côte d'Ivoire</div>
    </div>
    <div style="text-align:center;">
      <div class="signature-box">Signature & Cachet</div>
      <div style="margin-top:4px;">Gérant / Responsable</div>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}

// ════════════════════════════════════════════════════════════════════════════
// BON D'ASSURANCE — types + modal
// ════════════════════════════════════════════════════════════════════════════

interface BonAssurance {
  id: string;
  assurance: string;
  numeroBon: string;
  montantPrisEnCharge: string;
  matricule: string;
  datebon: string;
}

function emptyBon(): BonAssurance {
  return { id: Date.now().toString(), assurance: '', numeroBon: '', montantPrisEnCharge: '', matricule: '', datebon: '' };
}

function ModalBonAssurance({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (b: BonAssurance) => void;
}) {
  const [bon, setBon] = useState<BonAssurance>(emptyBon());
  const assurancesEnr = useAssurances();
  const set = (k: keyof BonAssurance) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setBon(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = () => {
    if (!bon.assurance || !bon.numeroBon || !bon.montantPrisEnCharge) {
      alert('Veuillez renseigner : Assurance, N° Bon et Montant Pris en Charge.');
      return;
    }
    onSave(bon);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: '#1a7a96' }}>
          <span className="text-white font-semibold text-base">Ajouter un Bon d'Assurance</span>
          <button onClick={onClose} className="text-white hover:text-gray-200"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Lbl>Assurance *</Lbl>
            <select className={selCls} value={bon.assurance} onChange={set('assurance')}>
              <option value="">Choisir l'assurance...</option>
              {assurancesEnr.length > 0
                ? assurancesEnr.map((a, i) => <option key={i} value={a}>{a}</option>)
                : ['CNPS', 'MUGEF-CI', 'SANLAM', 'AXA Assurance', 'NSIA Assurance', 'COLINA'].map((a, i) => <option key={i} value={a}>{a}</option>)}
              <option>Autre</option>
            </select>
          </div>
          <div>
            <Lbl>N° Bon *</Lbl>
            <input className={iCls} placeholder="Ex: BON-2024-0001" value={bon.numeroBon} onChange={set('numeroBon')} />
          </div>
          <div>
            <Lbl>Date du Bon</Lbl>
            <input className={iCls} type="date" value={bon.datebon} onChange={set('datebon')} />
          </div>
          <div>
            <Lbl>Matricule Assuré</Lbl>
            <input className={iCls} placeholder="Matricule..." value={bon.matricule} onChange={set('matricule')} />
          </div>
          <div>
            <Lbl>Montant Pris en Charge (FCFA) *</Lbl>
            <input className={iCls} type="number" min={0} placeholder="0" value={bon.montantPrisEnCharge} onChange={set('montantPrisEnCharge')} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-5 py-2 rounded text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={handleSave} className="px-6 py-2 rounded text-sm font-semibold text-white" style={{ backgroundColor: '#1a7a96' }}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIRMATION DE VENTE — modal succès
// ════════════════════════════════════════════════════════════════════════════

function ModalSucces({ numFacture, numClient, total, onClose, onNouvelle, onImprimer }: {
  numFacture: string; numClient: string; total: string; onClose: () => void; onNouvelle: () => void; onImprimer: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden text-center">
        <div className="px-8 py-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e8f5e9' }}>
            <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="#43a047" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800">Vente enregistrée !</h2>
          <div className="flex flex-col gap-1 text-sm text-gray-600">
            <span>N° Facture : <strong className="text-gray-800">{numFacture || '—'}</strong></span>
            <span>N° Client : <strong className="text-gray-800">{numClient}</strong></span>
            <span>Montant Total : <strong className="text-gray-800">{total} F CFA</strong></span>
          </div>
          <button
            onClick={onImprimer}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-semibold shadow"
            style={{ backgroundColor: '#1a7a96' }}
          >
            <Printer size={15} /> Imprimer le reçu
          </button>
        </div>
        <div className="flex border-t border-gray-100">
          <button onClick={onNouvelle} className="flex-1 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors">
            Nouvelle vente
          </button>
          <div className="w-px bg-gray-100" />
          <button onClick={onClose} className="flex-1 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STEP IV
// ════════════════════════════════════════════════════════════════════════════

function StepIV({
  articles, verreTotal, data, onChange, bonsAssurance, onAddBon, onRemoveBon, onEnregistrer,
}: {
  articles: ArticleLigne[];
  verreTotal: string;
  data: RecapInfo;
  onChange: (d: RecapInfo) => void;
  bonsAssurance: BonAssurance[];
  onAddBon: (b: BonAssurance) => void;
  onRemoveBon: (id: string) => void;
  onEnregistrer: (totalNet: number) => void;
}) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const modesPaiement = useModesPaiement();
  const comptesBanque = useComptesBanque();
  const set = (key: keyof RecapInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [key]: e.target.value });

  const articlesTotal = articles.reduce((sum, a) => sum + (parseFloat(a.total) || 0), 0);
  const verresTot = parseFloat(verreTotal) || 0;
  const totalBrut = articlesTotal + verresTot;
  const remisePct = parseFloat(data.remisePct) || 0;
  const valeurRemise = Math.round(totalBrut * remisePct / 100);
  const totalNet = totalBrut - valeurRemise;
  const totalAssurance = bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
  const acompte = parseFloat(data.acompte) || 0;
  const totalReste = totalNet - totalAssurance - acompte;

  return (
    <>
      {showModal && <ModalBonAssurance onClose={() => setShowModal(false)} onSave={onAddBon} />}

      <div className="p-6 flex flex-col gap-0">
        {/* Row 1 — Totaux */}
        <div className="grid grid-cols-4 gap-4 pb-5 border-b border-dashed border-gray-300">
          <div><Lbl>Total</Lbl><input className={roCls + ' font-semibold'} readOnly value={totalBrut.toLocaleString('fr-FR')} /></div>
          <div>
            <Lbl>Remise %</Lbl>
            <input className={iCls} type="number" min={0} max={100} value={data.remisePct} onChange={set('remisePct')} />
          </div>
          <div><Lbl>Valeur Remise</Lbl><input className={roCls} readOnly value={valeurRemise.toLocaleString('fr-FR')} /></div>
          <div><Lbl>Total Net</Lbl><input className={roCls + ' font-semibold'} readOnly value={totalNet.toLocaleString('fr-FR')} /></div>
        </div>

        {/* Bon Assurance */}
        <div className="py-5 border-b border-dashed border-gray-300 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Bon Assurance</span>
            <AddButton
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded text-white text-sm font-semibold"
              style={{ backgroundColor: '#e09a2b' }}
            >
              <Plus size={14} /> Ajouter Bon Assurance
            </AddButton>
          </div>

          {bonsAssurance.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-orange-50">
                  <th className="text-left px-3 py-2 border border-orange-100 text-xs text-gray-600 font-semibold">Assurance</th>
                  <th className="px-3 py-2 border border-orange-100 text-xs text-gray-600 font-semibold">N° Bon</th>
                  <th className="px-3 py-2 border border-orange-100 text-xs text-gray-600 font-semibold">Matricule</th>
                  <th className="px-3 py-2 border border-orange-100 text-xs text-gray-600 font-semibold">Date</th>
                  <th className="px-3 py-2 border border-orange-100 text-xs text-gray-600 font-semibold text-right">Montant PC (FCFA)</th>
                  <th className="w-8 border border-orange-100"></th>
                </tr>
              </thead>
              <tbody>
                {bonsAssurance.map(b => (
                  <tr key={b.id} className="hover:bg-orange-50">
                    <td className="px-3 py-1.5 border border-orange-100 font-medium text-gray-800">{b.assurance}</td>
                    <td className="px-3 py-1.5 border border-orange-100 text-center">{b.numeroBon}</td>
                    <td className="px-3 py-1.5 border border-orange-100 text-center">{b.matricule}</td>
                    <td className="px-3 py-1.5 border border-orange-100 text-center">{b.datebon}</td>
                    <td className="px-3 py-1.5 border border-orange-100 text-right font-semibold text-green-700">
                      {parseFloat(b.montantPrisEnCharge).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-2 border border-orange-100 text-center">
                      <button onClick={() => onRemoveBon(b.id)} className="text-red-400 hover:text-red-600"><X size={13} /></button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-orange-100">
                  <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-semibold text-gray-700 border border-orange-200">
                    Total pris en charge par assurance :
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-green-800 border border-orange-200">
                    {totalAssurance.toLocaleString('fr-FR')}
                  </td>
                  <td className="border border-orange-200" />
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Paiement */}
        <div className="flex items-end gap-3 py-5 border-b border-dashed border-gray-300 flex-wrap">
          <div style={{ width: 130 }}>
            <Lbl>Acompte</Lbl>
            <input className={iCls} type="number" min={0} value={data.acompte} onChange={set('acompte')} />
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <Lbl>Mode de Paiement</Lbl>
            <input list="vente-modes-paiement" className={iCls} placeholder="Saisir ou choisir..." value={data.modePaiement} onChange={set('modePaiement')} />
            <datalist id="vente-modes-paiement">
              {modesPaiement.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <Lbl>Compte Banque</Lbl>
            <input list="vente-comptes-banque" className={iCls} placeholder="Saisir ou choisir..." value={data.compteBanque} onChange={set('compteBanque')} />
            <datalist id="vente-comptes-banque">
              {comptesBanque.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="flex-1" style={{ minWidth: 120 }}>
            <Lbl>Détails</Lbl>
            <input className={iCls} value={data.details} onChange={set('details')} />
          </div>
          <div>
            <Lbl>Pièce Jointe</Lbl>
            <label className="cursor-pointer flex items-center justify-center border border-gray-300 rounded" style={{ backgroundColor: '#fde8b8', width: 44, height: 38 }}>
              <Download size={16} className="text-gray-700" />
              <input type="file" className="hidden" />
            </label>
          </div>
        </div>

        {/* Total Reste / RDV / Facture */}
        <div className="flex items-end gap-4 pt-5 flex-wrap">
          <div style={{ minWidth: 180 }}>
            <Lbl>Total Reste</Lbl>
            <div
              className="rounded px-3 py-2 text-white font-bold text-sm"
              style={{ backgroundColor: totalReste > 0 ? '#e53935' : '#43a047' }}
            >
              {totalReste.toLocaleString('fr-FR')}
            </div>
          </div>
          <div style={{ minWidth: 170 }}>
            <Lbl>RDV retrait</Lbl>
            <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white">
              <input type="date" className="flex-1 px-2 py-1.5 text-sm outline-none" value={data.rdvRetrait} onChange={set('rdvRetrait')} />
              <span className="px-2 text-gray-400"><Calendar size={14} /></span>
            </div>
          </div>
          <div style={{ minWidth: 160 }}>
            <Lbl>N° Facture</Lbl>
            <input className={roCls + ' font-mono font-semibold text-blue-700'} readOnly value={data.numFacture} />
          </div>
          <div className="flex-1" />
          <button
            onClick={() => onEnregistrer(totalNet)}
            className="px-8 py-2 rounded text-white text-sm font-semibold transition-opacity hover:opacity-90 active:scale-95"
            style={{ backgroundColor: '#1a7a96' }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════════════════════════════════

const emptyOeil = { sphere: '', cylindre: '', axe: '', dec: '', addition: '', hauteur: '', evLoin: '', evPres: '', quantite: '1', prix: '', remise: '' };

// ════════════════════════════════════════════════════════════════════════════
// LISTE DES VENTES
// ════════════════════════════════════════════════════════════════════════════

interface VenteSauvegardee extends AuditInfo {
  id: string;
  date: string;
  numeroClient: string;
  client: string;
  telephone: string;
  telephone2?: string;
  email?: string;
  adresse?: string;
  civilite?: string;
  profession?: string;
  dateNaissance?: string;
  soldeClient?: string;
  matriculeAssurance?: string;
  entreprise?: string;
  ophtalmologue?: string;
  telOphtalmologue?: string;
  cabinetOphtalmologue?: string;
  telCabinet?: string;
  verres?: VerreInfo[];
  articles: ArticleLigne[];
  bonsAssurance: BonAssurance[];
  totalBrut?: number;
  totalNet: number;
  recap: RecapInfo;
  observation?: string;
  clientInfo?: ClientInfo;
  reglements?: Reglement[];
}

function StatutBadge({ reste }: { reste: number }) {
  if (reste <= 0) return <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: '#43a047' }}>Soldée</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: '#e53935' }}>En attente</span>;
}

interface Reglement {
  id: string;
  recu: string;
  modePaiement: string;
  compteBanque: string;
  details: string;
  montant: number;
  date: string;
  editePar: string;
}

// ── Modale d'ajout d'un bon de commande de verre depuis une vente ────────────
const STATUTS_VERRE = ['En cours', 'Commandé', 'Reçu à l\'atelier', 'Retourné magasin', 'Réglé', 'Achevé'];

// Un œil (OD / OG) tel que saisi lors de la vente.
type OeilVals = { sphere: string; cylindre: string; axe: string; dec: string; addition: string; hauteur: string; evLoin: string; evPres: string; quantite: string; prix: string };
const OEIL_VIDE: OeilVals = { sphere: '', cylindre: '', axe: '', dec: '', addition: '', hauteur: '', evLoin: '', evPres: '', quantite: '1', prix: '' };

function oeilDepuisVente(o: any): OeilVals {
  o = o || {};
  return {
    sphere: o.sphere || '', cylindre: o.cylindre || '', axe: o.axe || '', dec: o.dec || '',
    addition: o.addition || '', hauteur: o.hauteur || '', evLoin: o.evLoin || '', evPres: o.evPres || '',
    quantite: o.quantite || '1', prix: o.prix || '',
  };
}

// Champs « verre » d'un bon, pré-remplis depuis une ligne de verre de la vente.
function champsVerre(v: any) {
  return {
    typeVerre: v?.typeVerre || '',
    verre: v?.verre || '',
    traitement: v?.traitement || '',
    matiere: v?.matiere || '',
    diametre: v?.diametre || '',
    od: oeilDepuisVente(v?.oeilDroit),
    og: oeilDepuisVente(v?.oeilGauche),
    ecartPupillaire: v?.ecartPupillaire || '',
  };
}

function CommandeVerreModal({
  vente, magasinId, onClose, onSave,
}: {
  vente: VenteSauvegardee;
  magasinId: string;
  onClose: () => void;
  onSave: (bon: any) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const officine = getMagasinLabel(magasinId);
  const magasinCourt = officine.replace(`${TENANT.nom} `, '');
  const acompteVente = parseFloat(vente.recap?.acompte || '0') || 0;
  // Verres enregistrés lors de la vente : chaque verre peut donner lieu à un bon.
  const verres = vente.verres || [];

  // Verre sélectionné (si la vente en compte plusieurs, un sélecteur permet de
  // choisir celui à commander — cf. bandeau rouge : un bon par verre distinct).
  const [verreIdx, setVerreIdx] = useState(0);

  // Liste des fournisseurs enregistrés (autocomplétion sur le champ Fournisseur).
  const fournisseurs = useFournisseurs();
  const [showFournSug, setShowFournSug] = useState(false);

  // Référence attribuée automatiquement à l'ouverture (00296, 00297…).
  const [form, setForm] = useState(() => ({
    reference: genRefBonCommandeVerre(),
    fournisseur: '',
    numBC: '',
    numBL: '',
    statut: 'En cours',
    date: vente.date ? vente.date.split('T')[0] : today,
    devise: 'F CFA',
    valeurDevise: '1',
    remisePct: '0',
    taxe: '0',
    envoyerFournisseur: false,
    ...champsVerre(verres[0]),
  }));

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const setOeil = (oeil: 'od' | 'og', k: keyof OeilVals, v: string) =>
    setForm(prev => ({ ...prev, [oeil]: { ...prev[oeil], [k]: v } }));

  // Change de verre : recharge les champs verre depuis la vente.
  const choisirVerre = (idx: number) => {
    setVerreIdx(idx);
    setForm(prev => ({ ...prev, ...champsVerre(verres[idx]) }));
  };

  // ── Calculs ────────────────────────────────────────────────────────────────
  const prixOD = parseFloat(form.od.prix) || 0;
  const prixOG = parseFloat(form.og.prix) || 0;
  const total = prixOD + prixOG;
  const valeurRemise = Math.round(total * (parseFloat(form.remisePct) || 0) / 100);
  const totalApresRemise = total - valeurRemise;
  const valeurTaxe = Math.round(totalApresRemise * (parseFloat(form.taxe) || 0) / 100);
  const totalNet = totalApresRemise + valeurTaxe;
  const totalReste = totalNet - acompteVente;

  const handleSubmit = () => {
    if (!form.fournisseur.trim()) { alert('Veuillez renseigner le fournisseur.'); return; }
    const bon = {
      id: `bcv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      numFacture: vente.recap?.numFacture || '',
      numRef: form.reference.trim(),
      numBC: form.numBC.trim(),
      numBL: form.numBL.trim(),
      fournisseur: form.fournisseur.trim(),
      officine,
      magasin: magasinCourt,
      client: vente.client || '',
      totalNet,
      acompte: acompteVente,
      totalReste,
      statut: form.statut,
      date: form.date,
      dateEdition: today,
      // Détails du verre — conservés dans le bon (repris dans Atelier / Règlement verrier).
      verreDetails: {
        typeVerre: form.typeVerre, verre: form.verre, traitement: form.traitement,
        matiere: form.matiere, diametre: form.diametre,
        oeilDroit: form.od, oeilGauche: form.og,
        ecartPupillaire: form.ecartPupillaire,
        devise: form.devise, valeurDevise: form.valeurDevise,
        remisePct: form.remisePct, valeurRemise, taxe: form.taxe, total,
      },
      envoyerFournisseur: form.envoyerFournisseur,
    };
    onSave(bon);
  };

  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  const inp = 'w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';

  // Colonnes d'un œil (label + champ)
  const oeilCols: { key: keyof OeilVals; label: string }[] = [
    { key: 'sphere', label: 'Sphère' }, { key: 'cylindre', label: 'Cylindre' },
    { key: 'axe', label: 'Axe' }, { key: 'dec', label: 'Dec' },
    { key: 'addition', label: 'Addition' }, { key: 'hauteur', label: 'Hauteur' },
    { key: 'evLoin', label: 'E V Loin' }, { key: 'evPres', label: 'E V Près' },
    { key: 'quantite', label: 'Quantité' }, { key: 'prix', label: 'Prix' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-3 rounded-t-xl" style={{ backgroundColor: '#1a7a96' }}>
          <h3 className="text-white text-base font-bold">👓 Bon de Commande de Verre — {vente.recap?.numFacture || ''}</h3>
          <button onClick={onClose} className="text-white hover:opacity-80"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4" style={{ backgroundColor: '#dfe7ee' }}>
          {/* Bandeau d'avertissement */}
          <div className="bg-white rounded px-4 py-2">
            <p className="text-sm font-bold italic" style={{ color: '#c0392b' }}>
              Si vous avez des verres identiques sur votre dossier, veuillez bien les enregistrer sur différents bons de commande !
            </p>
          </div>

          {/* Sélecteur de verre (si plusieurs verres dans la vente) */}
          {verres.length > 1 && (
            <div className="bg-white rounded px-4 py-2 flex items-center gap-3">
              <label className="text-xs font-medium text-gray-600">Verre à commander :</label>
              <select className={inp + ' max-w-xs'} value={verreIdx} onChange={e => choisirVerre(Number(e.target.value))}>
                {verres.map((v: any, i: number) => (
                  <option key={i} value={i}>Verre {i + 1} — {v.verre || v.typeVerre || 'Sans nom'}</option>
                ))}
              </select>
            </div>
          )}

          {/* En-tête : Référence, Fournisseur, N° BC, N° BL */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Référence *</label>
              <input className={inp + ' bg-gray-50'} readOnly value={form.reference} title="Référence attribuée automatiquement" />
            </div>
            <div className="relative">
              <label className={lbl}>Fournisseur *</label>
              <input
                className={inp}
                value={form.fournisseur}
                onChange={e => { set('fournisseur', e.target.value); setShowFournSug(true); }}
                onFocus={() => setShowFournSug(true)}
                onBlur={() => setTimeout(() => setShowFournSug(false), 150)}
                placeholder="Fournisseur..."
                autoComplete="off"
              />
              {showFournSug && (() => {
                const q = form.fournisseur.trim().toLowerCase();
                const sug = fournisseurs.filter(f => !q || f.toLowerCase().includes(q)).slice(0, 8);
                if (sug.length === 0) return null;
                return (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-52 overflow-y-auto">
                    {sug.map(f => (
                      <button
                        key={f}
                        type="button"
                        onMouseDown={() => { set('fournisseur', f); setShowFournSug(false); }}
                        className="block w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div>
              <label className={lbl}>N° Bons de Commande</label>
              <input className={inp} value={form.numBC} onChange={e => set('numBC', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>N° Bons de Livraison</label>
              <input className={inp} value={form.numBL} onChange={e => set('numBL', e.target.value)} />
            </div>
          </div>

          {/* Bloc verre : caractéristiques + OD / OG */}
          <div className="bg-white rounded p-3 space-y-3">
            <div className="grid grid-cols-5 gap-3">
              <div><label className={lbl}>Type Verre</label><input className={inp} value={form.typeVerre} onChange={e => set('typeVerre', e.target.value)} /></div>
              <div><label className={lbl}>Verre</label><input className={inp} value={form.verre} onChange={e => set('verre', e.target.value)} /></div>
              <div><label className={lbl}>Traitement</label><input className={inp} value={form.traitement} onChange={e => set('traitement', e.target.value)} /></div>
              <div><label className={lbl}>Matière</label><input className={inp} value={form.matiere} onChange={e => set('matiere', e.target.value)} /></div>
              <div><label className={lbl}>Diamètre</label><input className={inp} value={form.diametre} onChange={e => set('diametre', e.target.value)} /></div>
            </div>

            {/* Œil Droit */}
            <div>
              <div className="grid grid-cols-10 gap-2 mb-1">
                {oeilCols.map(c => <div key={c.key} className="text-[11px] font-medium text-gray-500">{c.label}</div>)}
              </div>
              <div className="flex items-stretch gap-2">
                <div className="flex items-center justify-center px-3 rounded text-white text-xs font-semibold shrink-0" style={{ backgroundColor: '#5a6b7b', minWidth: 90 }}>Oeil Droit</div>
                <div className="grid grid-cols-10 gap-2 flex-1">
                  {oeilCols.map(c => (
                    <input key={c.key} className={inp} value={form.od[c.key]} onChange={e => setOeil('od', c.key, e.target.value)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Œil Gauche */}
            <div>
              <div className="flex items-stretch gap-2">
                <div className="flex items-center justify-center px-3 rounded text-white text-xs font-semibold shrink-0" style={{ backgroundColor: '#5a6b7b', minWidth: 90 }}>Oeil Gauche</div>
                <div className="grid grid-cols-10 gap-2 flex-1">
                  {oeilCols.map(c => (
                    <input key={c.key} className={inp} value={form.og[c.key]} onChange={e => setOeil('og', c.key, e.target.value)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Écart pupillaire + total verre */}
            <div className="grid grid-cols-3 gap-3 items-end pt-2">
              <div>
                <label className={lbl}>Écart Pupillaire</label>
                <input className={inp} value={form.ecartPupillaire} onChange={e => set('ecartPupillaire', e.target.value)} />
              </div>
              <div />
              <div>
                <label className={lbl}>Total</label>
                <input className={inp + ' text-right font-semibold'} readOnly value={total.toLocaleString('fr-FR')} />
              </div>
            </div>
          </div>

          {/* Ligne devise / remise / taxe */}
          <div className="grid grid-cols-6 gap-3">
            <div>
              <label className={lbl}>Devise *</label>
              <select className={inp} value={form.devise} onChange={e => set('devise', e.target.value)}>
                <option value="F CFA">F CFA</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div><label className={lbl}>Valeur Devise *</label><input type="number" className={inp} value={form.valeurDevise} onChange={e => set('valeurDevise', e.target.value)} /></div>
            <div><label className={lbl}>Remise %</label><input type="number" className={inp} value={form.remisePct} onChange={e => set('remisePct', e.target.value)} /></div>
            <div><label className={lbl}>Valeur Remise</label><input className={inp + ' bg-gray-50'} readOnly value={valeurRemise.toLocaleString('fr-FR')} /></div>
            <div><label className={lbl}>Total</label><input className={inp + ' bg-gray-50 text-right'} readOnly value={totalApresRemise.toLocaleString('fr-FR')} /></div>
            <div>
              <label className={lbl}>Taxe %</label>
              <input type="number" className={inp} value={form.taxe} onChange={e => set('taxe', e.target.value)} />
            </div>
          </div>

          {/* Total net + envoyer */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className={lbl}>Total Net</label>
              <input className={inp + ' bg-gray-50 text-right font-bold'} readOnly value={totalNet.toLocaleString('fr-FR')} />
            </div>
            <label className="flex items-center gap-2 pb-1.5 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={form.envoyerFournisseur} onChange={e => set('envoyerFournisseur', e.target.checked)} />
              Envoyer au fournisseur
            </label>
          </div>
        </div>

        <div className="flex items-center justify-start gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-6 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100">Fermer</button>
          <button onClick={handleSubmit} className="px-6 py-2 rounded-lg text-sm font-semibold text-white shadow hover:opacity-90" style={{ backgroundColor: '#1a7a96' }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ordre d'arrivée : tri chronologique DÉCROISSANT (du plus récent au plus ancien)
 * afin que les nouveaux enregistrements apparaissent EN HAUT de la liste. On se
 * base sur la date de création (createdAt) puis, à défaut, sur la date du document.
 */
function ordreArrivee(a: VenteSauvegardee, b: VenteSauvegardee): number {
  const ka = ((a as any).createdAt || a.date || '') as string;
  const kb = ((b as any).createdAt || b.date || '') as string;
  return kb.localeCompare(ka);
}

function ListeVentes({ ventes, onNouvelle, onModifier, onSupprimer }: { ventes: VenteSauvegardee[]; onNouvelle: () => void; onModifier?: (v: VenteSauvegardee) => void; onSupprimer?: (v: VenteSauvegardee) => void }) {
  const { user } = useAuth();
  // Droits granulaires : l'admin OU un utilisateur explicitement autorisé
  // (case « Peut modifier / Peut supprimer » dans sa fiche) peut agir.
  // Les conseillères et opticiens ne peuvent JAMAIS modifier ni supprimer une vente.
  const roleBloque = ['conseillere', 'opticien'].includes(user?.role || '');
  const peutModifier = !roleBloque && canEdit(user);
  const peutSupprimer = !roleBloque && canDelete(user);
  // La commande de verre est réservée aux opticiens, directeurs, comptables et
  // administrateurs — masquée pour les conseillères (et autres rôles).
  const peutCommanderVerre = ['super_admin', 'admin', 'administrateur', 'directeur', 'comptable', 'opticien'].includes(user?.role || '');
  // Le règlement (encaissement) dans le détail de vente est réservé aux opticiens,
  // directeurs, comptables et administrateurs — la conseillère n'y a PAS accès.
  const peutReglement = ['super_admin', 'admin', 'administrateur', 'directeur', 'comptable', 'opticien'].includes(user?.role || '');
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const [searchFacture, setSearchFacture] = useState('');
  const [searchClient, setSearchClient] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [detail, setDetail] = useState<VenteSauvegardee | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'reglements'>('details');
  const [showAjouterReglement, setShowAjouterReglement] = useState(false);
  const [showBonAssuranceReglement, setShowBonAssuranceReglement] = useState(false);
  const [showBonForm, setShowBonForm] = useState(false);
  const [reglementsSupabase, setReglementsSupabase] = useState<ReglementSupabase[]>([]);
  // Bons de commande de verres (atelier) — partagés avec la page Atelier et le
  // Règlement verrier. La clé et le hook sont identiques pour rester cohérents.
  const [bonsVerres, setBonsVerres] = useLiveData<any>('leclaire_bons_commande_verres', []);
  const [showCommandeVerre, setShowCommandeVerre] = useState(false);

  // Enregistre un nouveau bon de commande de verre à partir de la vente ouverte.
  const handleSaveCommandeVerre = useCallback((bon: any) => {
    setBonsVerres([...(bonsVerres || []), bon]);
    setShowCommandeVerre(false);
    alert(`Bon de commande de verre ${bon.numBC || ''} enregistré. Retrouvez-le dans Atelier.`);
  }, [bonsVerres, setBonsVerres]);

  // Ajoute un bon d'assurance à la vente ouverte (detail) et persiste sur Firestore.
  const handleSaveBonReglement = useCallback(async (b: BonAssurance) => {
    if (!detail) return;
    const nouveauxBons = [...(detail.bonsAssurance || []), b];
    // Mise à jour immédiate de l'UI
    setDetail(prev => prev ? { ...prev, bonsAssurance: nouveauxBons } : prev);
    setShowBonForm(false);
    try {
      await mettreAJourVente(detail.id, { bons_assurance: nouveauxBons });
    } catch (err) {
      logger.error('❌ Enregistrement bon assurance échoué:', err);
      alert("Le bon d'assurance n'a pas pu être enregistré. Réessayez.");
    }
  }, [detail]);

  // Supprime un bon d'assurance de la vente ouverte.
  const handleRemoveBonReglement = useCallback(async (bonId: string) => {
    if (!detail) return;
    const nouveauxBons = (detail.bonsAssurance || []).filter(b => b.id !== bonId);
    setDetail(prev => prev ? { ...prev, bonsAssurance: nouveauxBons } : prev);
    try {
      await mettreAJourVente(detail.id, { bons_assurance: nouveauxBons });
    } catch (err) {
      logger.error('❌ Suppression bon assurance échouée:', err);
    }
  }, [detail]);
  // Seed INSTANTANÉ depuis le cache local → les montants (reste/soldé) corrects
  // s'affichent immédiatement, sans flash des anciennes valeurs.
  const [reglementsParVente, setReglementsParVente] = useState<Record<string, ReglementSupabase[]>>(() => readReglementsCacheMap());
  // Modes de paiement et comptes réellement enregistrés (partagés)
  const modesPaiement = useModesPaiement();
  const comptesBanque = useComptesBanque();

  // État pour le formulaire de règlement
  const [nouveauReglement, setNouveauReglement] = useState({
    acompte: '',
    modePaiement: '',
    compteBanque: '',
    details: ''
  });

  // Réinitialiser viewMode quand on change de détail
  useEffect(() => {
    if (detail) {
      setViewMode('details');
    }
  }, [detail?.id]);

  // Charger les règlements depuis Supabase quand on ouvre les détails
  useEffect(() => {
    if (!detail) {
      setReglementsSupabase([]);
      return;
    }

    // Charger les règlements existants
    const loadReglements = async () => {
      try {
        const reglements = await chargerReglements(detail.id);
        setReglementsSupabase(reglements);
      } catch (error) {
        logger.error('Erreur chargement règlements:', error);
        setReglementsSupabase([]);
      }
    };

    loadReglements();

    // S'abonner aux changements en temps réel
    const channel = subscriberReglementsVente(
      detail.id,
      (newReglement) => {
        setReglementsSupabase(prev => {
          // Éviter les doublons
          const exists = prev.some(r => r.id === newReglement.id);
          if (exists) return prev;
          return [...prev, newReglement];
        });
      },
      (updatedReglement) => {
        setReglementsSupabase(prev =>
          prev.map(r => r.id === updatedReglement.id ? updatedReglement : r)
        );
      },
      (deletedId) => {
        setReglementsSupabase(prev => prev.filter(r => r.id !== deletedId));
      }
    );

    // Cleanup — le subscriber Firebase retourne une fonction de désabonnement
    return () => {
      if (typeof channel === 'function') channel();
      else if (channel && typeof (channel as any).unsubscribe === 'function') (channel as any).unsubscribe();
    };
  }, [detail]);

  // Charger TOUS les règlements en UNE seule requête (au lieu d'une boucle
  // séquentielle d'une requête par vente, qui provoquait un délai de plusieurs
  // secondes avec affichage des anciens montants). Le cache est déjà affiché
  // instantanément ; cette requête ne fait que réconcilier avec le cloud.
  useEffect(() => {
    let cancelled = false;
    chargerTousLesReglements()
      .then(list => {
        if (cancelled) return;
        const map: Record<string, ReglementSupabase[]> = {};
        for (const r of list) { (map[r.vente_id] ||= []).push(r); }
        setReglementsParVente(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // S'abonner aux changements en temps réel de tous les règlements via Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'reglements'), snap => {
      snap.docChanges().forEach(change => {
        const r = { id: change.doc.id, ...change.doc.data() } as ReglementSupabase;
        if (change.type === 'added' || change.type === 'modified') {
          setReglementsParVente(prev => ({
            ...prev,
            [r.vente_id]: change.type === 'added'
              ? [...(prev[r.vente_id] || []).filter(x => x.id !== r.id), r]
              : (prev[r.vente_id] || []).map(x => x.id === r.id ? r : x),
          }));
        } else if (change.type === 'removed') {
          setReglementsParVente(prev => ({
            ...prev,
            [r.vente_id]: (prev[r.vente_id] || []).filter(x => x.id !== r.id),
          }));
        }
      });
    }, err => logNetworkAware('⚠️ subscribe règlements (Firestore)', err));
    return () => unsubscribe();
  }, []);

  const filtered = ventes.filter(v => {
    const matchFacture = !searchFacture ||
      (v.recap.numFacture || '').toLowerCase().includes(searchFacture.toLowerCase());
    const matchClient = !searchClient ||
      v.client.toLowerCase().includes(searchClient.toLowerCase()) ||
      v.numeroClient.includes(searchClient) ||
      (v.telephone || '').includes(searchClient);
    const matchDateDebut = !dateDebut || new Date(v.date) >= new Date(dateDebut);
    const matchDateFin = !dateFin || new Date(v.date) <= new Date(dateFin);

    return matchFacture && matchClient && matchDateDebut && matchDateFin;
  });

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const totalCA = ventes.reduce((s, v) => s + v.totalNet, 0);
  const soldees = ventes.filter(v => {
    const acompte = parseFloat(v.recap.acompte) || 0;
    const totalAssurance = v.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
    const totalReglements = (reglementsParVente[v.id] || []).reduce((s, r) => s + r.montant, 0);
    return (acompte + totalAssurance + totalReglements) >= v.totalNet;
  }).length;

  const handleEnregistrerReglement = async () => {
    if (!detail) return;

    if (!nouveauReglement.acompte || parseFloat(nouveauReglement.acompte) <= 0) {
      alert('Veuillez saisir un montant valide');
      return;
    }

    if (!nouveauReglement.modePaiement) {
      alert('Veuillez choisir un mode de paiement');
      return;
    }

    const userName = user?.nom || user?.prenom || user?.email || 'Utilisateur';

    const nouveauReglementObj: ReglementSupabase = {
      id: Date.now().toString(),
      vente_id: detail.id,
      magasin_id: magasinId,
      recu: genNumRecu(),
      mode_paiement: nouveauReglement.modePaiement,
      compte_banque: nouveauReglement.compteBanque || '',
      details: nouveauReglement.details || '',
      montant: parseFloat(nouveauReglement.acompte),
      date: new Date().toISOString(),
      edite_par: userName
    };

    // Mémoriser le mode de paiement saisi pour le proposer les prochaines fois.
    autoSaveModePaiement(nouveauReglement.modePaiement);

    // Mise à jour OPTIMISTE : on affiche le règlement et on ferme le formulaire
    // immédiatement, sans attendre l'aller-retour réseau. La persistance se fait
    // en arrière-plan ; en cas d'échec on retire la ligne et on prévient.
    setReglementsSupabase(prev => prev.some(r => r.id === nouveauReglementObj.id) ? prev : [...prev, nouveauReglementObj]);
    setReglementsParVente(prev => ({
      ...prev,
      [nouveauReglementObj.vente_id]: [
        ...(prev[nouveauReglementObj.vente_id] || []).filter(r => r.id !== nouveauReglementObj.id),
        nouveauReglementObj,
      ],
    }));
    setNouveauReglement({ acompte: '', modePaiement: '', compteBanque: '', details: '' });
    setShowAjouterReglement(false);

    ajouterReglement(nouveauReglementObj).catch((error) => {
      logger.error('Erreur lors de l\'enregistrement du règlement:', error);
      // Rollback de l'affichage optimiste.
      setReglementsSupabase(prev => prev.filter(r => r.id !== nouveauReglementObj.id));
      setReglementsParVente(prev => ({
        ...prev,
        [nouveauReglementObj.vente_id]: (prev[nouveauReglementObj.vente_id] || []).filter(r => r.id !== nouveauReglementObj.id),
      }));
      alert('Erreur lors de l\'enregistrement du règlement. Veuillez réessayer.');
    });
  };

  return (
    <>
      {/* Modal Ajouter Règlement */}
      {showAjouterReglement && detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 bg-gray-100 border-b border-gray-300">
              <h3 className="text-lg font-bold text-gray-800">Ajouter Règlement</h3>
              <button onClick={() => {
                setShowAjouterReglement(false);
                setNouveauReglement({ acompte: '', modePaiement: '', compteBanque: '', details: '' });
              }} className="text-gray-600 hover:text-gray-800">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Acompte</label>
                  <input
                    type="number"
                    className={iCls}
                    value={nouveauReglement.acompte}
                    onChange={(e) => setNouveauReglement({ ...nouveauReglement, acompte: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mode de Paiement</label>
                  <input
                    list="reglement-modes-paiement"
                    className={iCls}
                    placeholder="Saisir ou choisir..."
                    value={nouveauReglement.modePaiement}
                    onChange={(e) => setNouveauReglement({ ...nouveauReglement, modePaiement: e.target.value })}
                  />
                  <datalist id="reglement-modes-paiement">
                    {modesPaiement.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Compte Banque</label>
                  <select
                    className={selCls}
                    value={nouveauReglement.compteBanque}
                    onChange={(e) => setNouveauReglement({ ...nouveauReglement, compteBanque: e.target.value })}
                  >
                    <option value="">Choisir Compte Banque....</option>
                    {comptesBanque.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Détails</label>
                <textarea
                  className={iCls}
                  rows={3}
                  value={nouveauReglement.details}
                  onChange={(e) => setNouveauReglement({ ...nouveauReglement, details: e.target.value })}
                  placeholder="Détails du règlement..."
                ></textarea>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pièce Jointe</label>
                  <label className="cursor-pointer flex items-center justify-center border-2 border-dashed border-gray-300 rounded px-4 py-8 bg-gray-50 hover:bg-gray-100">
                    <Download size={20} className="text-gray-400" />
                    <input type="file" className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Reste</label>
                  {(() => {
                    const totalReglements = reglementsSupabase.reduce((s, r) => s + r.montant, 0);
                    const acompteInitial = parseFloat(detail.recap.acompte) || 0;
                    const totalAssurance = detail.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
                    // Déduction EN DIRECT de l'acompte en cours de saisie.
                    const acompteEnCours = parseFloat(nouveauReglement.acompte) || 0;
                    const reste = detail.totalNet - acompteInitial - totalAssurance - totalReglements - acompteEnCours;
                    const totalementRegle = reste <= 0;
                    return (
                      <div
                        className="rounded px-4 py-3 text-white text-xl font-bold text-center"
                        style={{ backgroundColor: totalementRegle ? '#16a34a' : '#e53935' }}
                      >
                        {Math.max(0, reste).toLocaleString('fr-FR')}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowAjouterReglement(false);
                  setNouveauReglement({ acompte: '', modePaiement: '', compteBanque: '', details: '' });
                }}
                className="px-6 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Fermer
              </button>
              <button
                onClick={handleEnregistrerReglement}
                className="px-6 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#1a7a96' }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bon Assurance (sur page règlements) */}
      {showBonAssuranceReglement && detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 bg-gray-100 border-b border-gray-300">
              <h3 className="text-lg font-bold text-gray-800">Bons d'Assurance</h3>
              <button onClick={() => setShowBonAssuranceReglement(false)} className="text-gray-600 hover:text-gray-800">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Reste</label>
                <div className="rounded px-4 py-3 text-white text-xl font-bold text-center" style={{ backgroundColor: '#e53935' }}>
                  {(() => {
                    const acompte = parseFloat(detail.recap.acompte) || 0;
                    const totalAssurance = detail.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
                    return (detail.totalNet - acompte - totalAssurance).toLocaleString('fr-FR');
                  })()}
                </div>
              </div>

              {/* Liste des bons enregistrés */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: '#fff3e0' }}>
                      <th className="px-3 py-2 text-left font-semibold border border-orange-200">Assurance</th>
                      <th className="px-3 py-2 text-center font-semibold border border-orange-200">N° Bon</th>
                      <th className="px-3 py-2 text-center font-semibold border border-orange-200">Matricule</th>
                      <th className="px-3 py-2 text-right font-semibold border border-orange-200">Montant PC</th>
                      <th className="px-3 py-2 text-center font-semibold border border-orange-200">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.bonsAssurance.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-400 border border-gray-200 bg-white">
                          Aucun bon d'assurance enregistré
                        </td>
                      </tr>
                    ) : detail.bonsAssurance.map(b => (
                      <tr key={b.id} className="bg-white">
                        <td className="px-3 py-2 border border-gray-200">{b.assurance}</td>
                        <td className="px-3 py-2 text-center border border-gray-200">{b.numeroBon}</td>
                        <td className="px-3 py-2 text-center border border-gray-200">{b.matricule || '—'}</td>
                        <td className="px-3 py-2 text-right border border-gray-200 font-semibold" style={{ color: '#2e7d32' }}>
                          {parseFloat(b.montantPrisEnCharge || '0').toLocaleString('fr-FR')}
                        </td>
                        <td className="px-3 py-2 text-center border border-gray-200">
                          <button
                            onClick={() => handleRemoveBonReglement(b.id)}
                            className="text-red-600 hover:text-red-800"
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-center py-4">
                <AddButton
                  className="px-8 py-3 rounded-lg text-white text-sm font-semibold shadow-lg"
                  style={{ backgroundColor: '#e09a2b' }}
                  onClick={() => setShowBonForm(true)}
                >
                  + Ajouter Bon Assurance
                </AddButton>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowBonAssuranceReglement(false)}
                className="px-6 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Fermer
              </button>
            </div>
          </div>

          {/* Formulaire d'ajout d'un bon (réutilise ModalBonAssurance) */}
          {showBonForm && (
            <ModalBonAssurance
              onClose={() => setShowBonForm(false)}
              onSave={handleSaveBonReglement}
            />
          )}
        </div>
      )}

      {/* Détail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-gray-100 border-b border-gray-300">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-800">
                  Détails Vente | Facture ({detail.recap?.numFacture || 'N/A'})
                </h2>
                <span className="px-3 py-1 rounded text-xs font-semibold" style={{ backgroundColor: viewMode === 'details' ? '#e3f2fd' : '#fff3e0', color: viewMode === 'details' ? '#1976d2' : '#f57c00' }}>
                  {viewMode === 'details' ? 'Vue Détails' : 'Vue Règlements'}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDetail(null);
                  setViewMode('details');
                  setReglementsSupabase([]);
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1" key={`modal-${viewMode}`}>
              {viewMode === 'details' ? (
              <>
                <div className="grid grid-cols-12 gap-4 p-4">
                {/* Left Column - Client Info */}
                <div className="col-span-3 flex flex-col gap-3">
                  {/* Informations Client */}
                  <div className="rounded-lg p-4 text-white text-sm" style={{ backgroundColor: '#1a7a96' }}>
                    <div className="text-xs font-semibold uppercase mb-2 opacity-90">📋 Informations Client | {fmt(detail.date)}</div>
                    <div className="font-bold text-base mb-1">{detail.numeroClient} | {detail.client}</div>
                    <div className="text-sm">{detail.telephone || '—'}</div>
                    {(() => {
                      const venteData = detail as any;
                      const clientInfo = venteData.clientInfo || {};
                      if (clientInfo.jourNaissance || clientInfo.moisNaissance || clientInfo.anneeNaissance) {
                        return (
                          <div className="text-sm mt-1">
                            Jour de Naissance: {clientInfo.jourNaissance}/{clientInfo.moisNaissance}/{clientInfo.anneeNaissance}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Informations Ophtalmologue */}
                  <div className="rounded-lg p-4 text-white text-sm" style={{ backgroundColor: '#1a7a96' }}>
                    <div className="text-xs font-semibold uppercase mb-2 opacity-90">🩺 Informations Ophtalmologue</div>
                    {(() => {
                      const venteData = detail as any;
                      const clientInfo = venteData.clientInfo || {};
                      return (
                        <>
                          <div className="font-bold">{clientInfo.ophtalmologue || 'Non renseigné'}</div>
                          <div className="text-sm mt-1">{clientInfo.cabinetOphtalmologue || ''}</div>
                          {detail.verres && detail.verres[0]?.datePrescription && (
                            <div className="text-sm mt-1">Date Prescription: {fmt(detail.verres[0].datePrescription)}</div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Observation */}
                  <div className="rounded-lg p-4 text-white text-sm" style={{ backgroundColor: '#1a7a96' }}>
                    <div className="text-xs font-semibold uppercase mb-2 opacity-90">📝 Observation</div>
                    {detail.bonsAssurance.length > 0 ? (
                      detail.bonsAssurance.map(b => (
                        <div key={b.id} className="font-semibold text-base mb-2">
                          ASSURANCE {b.assurance.toUpperCase()}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm opacity-70">Aucune observation</div>
                    )}
                  </div>
                </div>

                {/* Center Column - Verres & Articles */}
                <div className="col-span-6 flex flex-col gap-3">
                  {/* Informations Verre */}
                  {detail.verres && detail.verres.length > 0 && detail.verres.map((verre: any, idx: number) => (
                    <div key={idx}>
                      <div className="bg-gray-50 border border-gray-300 rounded-lg overflow-hidden">
                        <div className="text-xs font-semibold uppercase px-3 py-2 bg-white border-b border-gray-300">
                          Informations Verre
                        </div>

                        {/* Verre Header Info */}
                        <div className="px-3 py-2 border-b border-gray-300" style={{ backgroundColor: '#fde8b8' }}>
                          <div className="font-bold text-sm">
                            {verre.typeVerre || 'Progressif'} | {verre.verre || `${TENANT.nom} CONFORT`}
                          </div>
                          <div className="text-xs">{verre.traitement || 'PHOTO AR UV420'}</div>
                          {verre.matiere && <div className="text-xs">{verre.matiere}</div>}
                          <div className="text-xs font-semibold mt-1">Garantie: 2 ANS</div>
                        </div>

                        <div className="px-2 py-2 bg-white">
                          <div className="text-xs font-medium mb-1">Niveau Verre:</div>
                        </div>

                        {/* Tableau Verres */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr style={{ backgroundColor: '#1a7a96' }}>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400"></th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Sphère</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Cylindre</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Axe</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Dec</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Addition</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Hauteur</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">E V Loin</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">E V Pres</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Quantité</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Prix</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Remise</th>
                                <th className="px-2 py-1.5 text-white font-semibold border border-gray-400">Facture</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ backgroundColor: '#b3d9e6' }}>
                                <td className="px-2 py-1.5 font-semibold border border-gray-300">Oeil Droit</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.sphere || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.cylindre || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.axe || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.dec || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.addition || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.hauteur || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.evLoin || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.evPres || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.quantite || '1'}</td>
                                <td className="px-2 py-1.5 text-right border border-gray-300">{parseFloat(verre.oeilDroit?.prix || '0').toLocaleString('fr-FR')}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilDroit?.remise || '0.00'}</td>
                                <td className="px-2 py-1.5 text-right border border-gray-300 font-semibold">{parseFloat(verre.oeilDroit?.prix || '0').toLocaleString('fr-FR')}</td>
                              </tr>
                              <tr style={{ backgroundColor: '#b3d9e6' }}>
                                <td className="px-2 py-1.5 font-semibold border border-gray-300">Oeil Gauche</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.sphere || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.cylindre || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.axe || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.dec || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.addition || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.hauteur || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.evLoin || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.evPres || '-'}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.quantite || '1'}</td>
                                <td className="px-2 py-1.5 text-right border border-gray-300">{parseFloat(verre.oeilGauche?.prix || '0').toLocaleString('fr-FR')}</td>
                                <td className="px-2 py-1.5 text-center border border-gray-300">{verre.oeilGauche?.remise || '0.00'}</td>
                                <td className="px-2 py-1.5 text-right border border-gray-300 font-semibold">{parseFloat(verre.oeilGauche?.prix || '0').toLocaleString('fr-FR')}</td>
                              </tr>
                              <tr className="bg-white">
                                <td colSpan={12} className="px-2 py-1.5 text-right font-semibold border border-gray-300">Facture</td>
                                <td className="px-2 py-1.5 text-right font-bold border border-gray-300">{parseFloat(verre.totalVerres || '0').toLocaleString('fr-FR')}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Informations Traitements Montures Accessoires Autres */}
                  {detail.articles.length > 0 && (
                    <div className="bg-gray-50 border border-gray-300 rounded-lg overflow-hidden">
                      <div className="text-xs font-semibold uppercase px-3 py-2 bg-white border-b border-gray-300">
                        Informations Traitements Montures Accessoires Autres
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ backgroundColor: '#e8e8e8' }}>
                              <th className="px-3 py-1.5 text-left font-semibold border border-gray-300">Désignation</th>
                              <th className="px-3 py-1.5 text-center font-semibold border border-gray-300">Stock</th>
                              <th className="px-3 py-1.5 text-right font-semibold border border-gray-300">Prix</th>
                              <th className="px-3 py-1.5 text-center font-semibold border border-gray-300">Remise</th>
                              <th className="px-3 py-1.5 text-center font-semibold border border-gray-300">Quantité</th>
                              <th className="px-3 py-1.5 text-right font-semibold border border-gray-300">Facture</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.articles.map(a => (
                              <tr key={a.id} className="bg-white">
                                <td className="px-3 py-1.5 border border-gray-300">
                                  <div className="font-semibold">{a.designation || '—'}</div>
                                  <div className="text-xs" style={{ backgroundColor: '#fde8b8', display: 'inline-block', padding: '2px 6px', borderRadius: '3px', marginTop: '2px' }}>
                                    Garantie: 2 ANS
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-center border border-gray-300 font-semibold">
                                  {(() => {
                                    const s = parseFloat(a.stock || '0');
                                    const q = parseFloat(a.quantite || '0');
                                    if (a.stock === '' || a.stock == null) return <span className="text-gray-400">—</span>;
                                    const color = s <= 0 ? '#c62828' : s < q ? '#e65100' : '#2e7d32';
                                    return <span style={{ color }}>{s}</span>;
                                  })()}
                                </td>
                                <td className="px-3 py-1.5 text-right border border-gray-300">{parseFloat(a.prix || '0').toLocaleString('fr-FR')}</td>
                                <td className="px-3 py-1.5 text-center border border-gray-300">{a.remise || '0.00'}</td>
                                <td className="px-3 py-1.5 text-center border border-gray-300">{a.quantite}</td>
                                <td className="px-3 py-1.5 text-right border border-gray-300 font-semibold">{parseFloat(a.total || '0').toLocaleString('fr-FR')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Totaux */}
                  <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#1a7a96' }}>
                    <div className="grid grid-cols-6 gap-px text-white text-xs font-semibold text-center">
                      <div className="p-2">
                        <div className="opacity-80">Total</div>
                        <div className="text-base font-bold">{(() => {
                          const verresTotal = detail.verres?.reduce((s: number, v: any) => s + (parseFloat(v.totalVerres) || 0), 0) || 0;
                          const articlesTotal = detail.articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
                          return (verresTotal + articlesTotal).toLocaleString('fr-FR');
                        })()}</div>
                      </div>
                      <div className="p-2">
                        <div className="opacity-80">Remise ({detail.recap.remisePct}%)</div>
                        <div className="text-base font-bold">{(() => {
                          const verresTotal = detail.verres?.reduce((s: number, v: any) => s + (parseFloat(v.totalVerres) || 0), 0) || 0;
                          const articlesTotal = detail.articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
                          const total = verresTotal + articlesTotal;
                          return Math.round(total * (parseFloat(detail.recap.remisePct) || 0) / 100).toLocaleString('fr-FR');
                        })()}</div>
                      </div>
                      <div className="p-2">
                        <div className="opacity-80">Total Net</div>
                        <div className="text-base font-bold">{detail.totalNet.toLocaleString('fr-FR')}</div>
                      </div>
                      <div className="p-2">
                        <div className="opacity-80">Acompte</div>
                        <div className="text-base font-bold">{parseFloat(detail.recap.acompte || '0').toLocaleString('fr-FR')}</div>
                      </div>
                      {(() => {
                        const acompte = parseFloat(detail.recap.acompte) || 0;
                        const totalAssurance = detail.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
                        const totalReglements = (reglementsSupabase || []).reduce((s, r) => s + (r.montant || 0), 0);
                        const reste = detail.totalNet - acompte - totalAssurance - totalReglements;
                        const solde = reste <= 0;
                        return (
                          <div className="p-2" style={{ backgroundColor: solde ? '#43a047' : '#e53935' }}>
                            <div className="opacity-90">{solde ? 'Soldée ✓' : 'Total Reste'}</div>
                            <div className="text-base font-bold">{reste.toLocaleString('fr-FR')}</div>
                          </div>
                        );
                      })()}
                      <div className="p-2">
                        <div className="opacity-80">AVOIR-CLIENT</div>
                        <div className="text-base font-bold">0.00</div>
                        <div className="text-xs opacity-70">Disponible</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Actions */}
                <div className="col-span-3 flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase mb-1">💼 Actions</div>

                  {peutReglement && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setViewMode('reglements');
                      }}
                      className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                      style={{ backgroundColor: '#1a7a96' }}
                    >
                      💰 Réglement
                    </button>
                  )}

                  <button
                    onClick={() => {
                      // Cumul réglé = acompte initial (recap) + tous les règlements
                      // enregistrés depuis. On tient compte des règlements ajoutés,
                      // même quand l'acompte initial était 0.
                      const acompteInitial = parseFloat(detail.recap.acompte || '0') || 0;
                      const totalReglements = reglementsSupabase.reduce((s, r) => s + (Number(r.montant) || 0), 0);
                      const totalPaye = acompteInitial + totalReglements;
                      if (totalPaye <= 0) {
                        alert('Aucun règlement enregistré pour cette vente');
                        return;
                      }
                      // Dernier règlement enregistré (le plus récent) — sinon l'acompte
                      // initial de la vente. Le reçu utilise le MÊME format que le reçu
                      // de vente (imprimerReglement / telechargerReglementPDF).
                      const dernier = reglementsSupabase.length > 0
                        ? reglementsSupabase[reglementsSupabase.length - 1]
                        : null;
                      telechargerReglementPDF({
                        recu: dernier?.recu || detail.recap.numRecu || '—',
                        modePaiement: dernier?.mode_paiement || detail.recap.modePaiement || 'ESPECE',
                        compteBanque: dernier?.compte_banque || detail.recap.compteBanque || 'CAISSE INTERNE',
                        details: dernier?.details || detail.recap.details || '',
                        // Montant du versement affiché (dernier versement) + cumul payé
                        // pour que le RESTE / badge « Soldée » soit à jour.
                        montant: dernier ? Number(dernier.montant) || 0 : acompteInitial,
                        totalPaye,
                        date: dernier?.date || detail.date,
                        editePar: dernier?.edite_par || (detail as any).createdBy || '—',
                      }, detail, magasinId);
                    }}
                    className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                    style={{ backgroundColor: '#1a7a96' }}
                  >
                    📄 Dernier Réglement PDF
                  </button>

                  {peutCommanderVerre && (
                    <button
                      onClick={() => setShowCommandeVerre(true)}
                      className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                      style={{ backgroundColor: '#1a7a96' }}
                    >
                      👓 Commande Verres
                    </button>
                  )}

                  <button
                    onClick={() => telechargerFacturePDF({
                      numFacture: detail.recap.numFacture,
                      numeroClient: detail.numeroClient,
                      client: detail.client,
                      civilite: (detail as any).clientInfo?.civilite || (detail as any).civilite,
                      telephone: detail.telephone,
                      email: (detail as any).clientInfo?.email || (detail as any).email,
                      date: detail.date,
                      rdvRetrait: detail.recap.rdvRetrait,
                      verres: detail.verres,
                      articles: detail.articles,
                      bonsAssurance: detail.bonsAssurance,
                      totalNet: detail.totalNet,
                      remisePct: detail.recap.remisePct,
                      acompte: detail.recap.acompte,
                      editePar: (detail as any).createdBy || (detail as any).updatedBy || '—',
                      dateEdition: (detail as any).createdAt || detail.date,
                    }, magasinId)}
                    className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                    style={{ backgroundColor: '#1a7a96' }}
                  >
                    📑 Facture PDF
                  </button>

                  <button
                    onClick={() => telechargerFactureExcel({
                      numFacture: detail.recap.numFacture,
                      numeroClient: detail.numeroClient,
                      client: detail.client,
                      telephone: detail.telephone,
                      date: detail.date,
                      articles: detail.articles,
                      bonsAssurance: detail.bonsAssurance,
                      totalNet: detail.totalNet,
                      remisePct: detail.recap.remisePct,
                      acompte: detail.recap.acompte,
                      editePar: (detail as any).createdBy || (detail as any).updatedBy || '—',
                      dateEdition: (detail as any).createdAt || detail.date,
                    }, magasinId)}
                    className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                    style={{ backgroundColor: '#1a7a96' }}
                  >
                    📊 Facture Excel
                  </button>

                  <button
                    onClick={() => imprimerFacture({
                      numFacture: detail.recap.numFacture,
                      numeroClient: detail.numeroClient,
                      client: detail.client,
                      telephone: detail.telephone,
                      date: detail.date,
                      modePaiement: detail.recap.modePaiement,
                      rdvRetrait: detail.recap.rdvRetrait,
                      verres: detail.verres,
                      articles: detail.articles,
                      bonsAssurance: detail.bonsAssurance,
                      totalNet: detail.totalNet,
                      remisePct: detail.recap.remisePct,
                      acompte: detail.recap.acompte,
                      editePar: (detail as any).createdBy || (detail as any).updatedBy || '—',
                      dateEdition: (detail as any).createdAt || detail.date,
                    }, magasinId)}
                    className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                    style={{ backgroundColor: '#1a7a96' }}
                  >
                    📋 Facture PDF | Cachet
                  </button>

                  <button
                    onClick={() => telechargerFichePDF(detail, magasinId)}
                    className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                    style={{ backgroundColor: '#1a7a96' }}
                  >
                    📝 Fiche PDF
                  </button>

                  <button
                    onClick={() => telechargerDossierClientPDF(detail, magasinId)}
                    className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                    style={{ backgroundColor: '#1a7a96' }}
                  >
                    📂 Dossier Client PDF
                  </button>

                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase mb-2 text-green-700">📋 Charger Ordonnance</div>
                    <label className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold shadow cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100">
                      <Download size={16} />
                      Choisir un fichier
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" />
                    </label>
                  </div>
                </div>
              </div>
              </>
              ) : (
                /* Vue Règlements */
                <>
                <div className="p-4">
                  <div className="grid grid-cols-12 gap-4">
                    {/* Left Column - Client Info (same as details) */}
                    <div className="col-span-3 flex flex-col gap-3">
                      {/* Informations Client */}
                      <div className="rounded-lg p-4 text-white text-sm" style={{ backgroundColor: '#1a7a96' }}>
                        <div className="text-xs font-semibold uppercase mb-2 opacity-90">📋 Informations Client | {fmt(detail.date)}</div>
                        <div className="font-bold text-base mb-1">{detail.numeroClient} | {detail.client}</div>
                        <div className="text-sm">{detail.telephone || '—'}</div>
                        {(() => {
                          const venteData = detail as any;
                          const clientInfo = venteData.clientInfo || {};
                          if (clientInfo.jourNaissance || clientInfo.moisNaissance || clientInfo.anneeNaissance) {
                            return (
                              <div className="text-sm mt-1">
                                Jour de Naissance: {clientInfo.jourNaissance}/{clientInfo.moisNaissance}/{clientInfo.anneeNaissance}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {/* Informations Ophtalmologue */}
                      <div className="rounded-lg p-4 text-white text-sm" style={{ backgroundColor: '#1a7a96' }}>
                        <div className="text-xs font-semibold uppercase mb-2 opacity-90">🩺 Informations Ophtalmologue</div>
                        {(() => {
                          const venteData = detail as any;
                          const clientInfo = venteData.clientInfo || {};
                          return (
                            <>
                              <div className="font-bold">{clientInfo.ophtalmologue || 'Non renseigné'}</div>
                              <div className="text-sm mt-1">{clientInfo.cabinetOphtalmologue || ''}</div>
                              {detail.verres && detail.verres[0]?.datePrescription && (
                                <div className="text-sm mt-1">Date Prescription: {fmt(detail.verres[0].datePrescription)}</div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Informations Rendez-vous */}
                      <div className="rounded-lg p-4 text-white text-sm" style={{ backgroundColor: '#1a7a96' }}>
                        <div className="text-xs font-semibold uppercase mb-2 opacity-90">📅 Informations Rendez-vous</div>
                        <div className="flex items-center gap-2 text-green-400 mb-2">
                          <span className="text-lg">✅</span>
                          <span className="font-semibold">Édité le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="text-sm">
                          Édité par: {(detail as any).createdBy || 'LOUISE MARLÈNE'}
                        </div>
                      </div>
                    </div>

                    {/* Center Column - Totaux & Règlements */}
                    <div className="col-span-6 flex flex-col gap-4">
                      {/* Barre de totaux */}
                      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#1a7a96' }}>
                        <div className="grid grid-cols-6 gap-px text-white text-xs font-semibold text-center">
                          <div className="p-3">
                            <div className="opacity-80">Total</div>
                            <div className="text-base font-bold">{(() => {
                              const verresTotal = detail.verres?.reduce((s: number, v: any) => s + (parseFloat(v.totalVerres) || 0), 0) || 0;
                              const articlesTotal = detail.articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
                              return (verresTotal + articlesTotal).toLocaleString('fr-FR');
                            })()}</div>
                          </div>
                          <div className="p-3">
                            <div className="opacity-80">Remise ({detail.recap.remisePct}%)</div>
                            <div className="text-base font-bold">{(() => {
                              const verresTotal = detail.verres?.reduce((s: number, v: any) => s + (parseFloat(v.totalVerres) || 0), 0) || 0;
                              const articlesTotal = detail.articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
                              const total = verresTotal + articlesTotal;
                              return Math.round(total * (parseFloat(detail.recap.remisePct) || 0) / 100).toLocaleString('fr-FR');
                            })()}</div>
                          </div>
                          <div className="p-3">
                            <div className="opacity-80">Total Net</div>
                            <div className="text-base font-bold">{detail.totalNet.toLocaleString('fr-FR')}</div>
                          </div>
                          <div className="p-3">
                            <div className="opacity-80">Acompte</div>
                            <div className="text-base font-bold">{(() => {
                              const acompteInitial = parseFloat(detail.recap.acompte || '0');
                              const totalReglements = reglementsSupabase.reduce((s, r) => s + r.montant, 0);
                              return (acompteInitial + totalReglements).toLocaleString('fr-FR');
                            })()}</div>
                          </div>
                          {(() => {
                            const acompteInitial = parseFloat(detail.recap.acompte) || 0;
                            const totalReglements = reglementsSupabase.reduce((s, r) => s + r.montant, 0);
                            const totalAssurance = detail.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
                            const reste = detail.totalNet - acompteInitial - totalReglements - totalAssurance;
                            const solde = reste <= 0;
                            return (
                              <div className="p-3" style={{ backgroundColor: solde ? '#43a047' : '#e53935' }}>
                                <div className="opacity-90">{solde ? 'Soldée ✓' : 'Total Reste'}</div>
                                <div className="text-base font-bold">{reste.toLocaleString('fr-FR')}</div>
                              </div>
                            );
                          })()}
                          <div className="p-3">
                            <div className="opacity-80">AVOIR-CLIENT</div>
                            <div className="text-base font-bold">0.00</div>
                            <div className="text-xs opacity-70">Disponible</div>
                          </div>
                        </div>
                      </div>

                      {/* Section Détails Règlements */}
                      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#b3d9e6' }}>
                        <div className="px-4 py-2 font-bold text-gray-800" style={{ backgroundColor: '#1a7a96', color: 'white' }}>
                          Détails Règlements
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr style={{ backgroundColor: '#8cc4d9' }}>
                                <th className="px-3 py-2 text-left font-semibold border border-gray-400">REÇU</th>
                                <th className="px-3 py-2 text-left font-semibold border border-gray-400">MODE DE PAIEMENT</th>
                                <th className="px-3 py-2 text-left font-semibold border border-gray-400">DÉTAILS</th>
                                <th className="px-3 py-2 text-left font-semibold border border-gray-400">EDITE LE</th>
                                <th className="px-3 py-2 text-right font-semibold border border-gray-400">MONTANT</th>
                                <th className="px-3 py-2 text-center font-semibold border border-gray-400" style={{ width: '180px' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Règlements ajoutés depuis Supabase — nouveaux EN HAUT
                                  (ordre décroissant). Le cumul reste calculé selon
                                  l'ordre chronologique réel (idx croissant). */}
                              {reglementsSupabase.map((_r, revIdx) => {
                                const idx = reglementsSupabase.length - 1 - revIdx;
                                const reglement = reglementsSupabase[idx];
                                // Cumul déjà réglé À CE STADE = acompte initial (recap)
                                // + somme des versements jusqu'à celui-ci inclus.
                                // Permet au reçu d'afficher le bon ACOMPTE / RESTE
                                // quand le client revient solder.
                                const acompteInitial = parseFloat(detail.recap.acompte || '0') || 0;
                                const totalPaye = acompteInitial
                                  + reglementsSupabase.slice(0, idx + 1).reduce((s, r) => s + (Number(r.montant) || 0), 0);
                                const reglementLocal = {
                                  id: reglement.id,
                                  recu: reglement.recu,
                                  modePaiement: reglement.mode_paiement,
                                  compteBanque: reglement.compte_banque,
                                  details: reglement.details,
                                  montant: reglement.montant,
                                  totalPaye,
                                  date: reglement.date,
                                  editePar: reglement.edite_par
                                };
                                return (
                                  <tr key={reglement.id} className="bg-white">
                                    <td className="px-3 py-2 border border-gray-300">{reglement.recu}</td>
                                    <td className="px-3 py-2 border border-gray-300">
                                      <div className="font-semibold">{reglement.mode_paiement}</div>
                                      <div className="text-xs text-gray-500">{reglement.compte_banque || '—'}</div>
                                    </td>
                                    <td className="px-3 py-2 border border-gray-300">{reglement.details || '—'}</td>
                                    <td className="px-3 py-2 border border-gray-300">
                                      <div>{fmt(reglement.date)} {new Date(reglement.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                      <div className="text-xs text-gray-600">{reglement.edite_par}</div>
                                    </td>
                                    <td className="px-3 py-2 border border-gray-300 text-right font-semibold">{reglement.montant.toLocaleString('fr-FR')}</td>
                                    <td className="px-3 py-2 border border-gray-300">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => telechargerReglementPDF(reglementLocal, detail, magasinId)}
                                          className="px-3 py-1.5 rounded text-white text-xs font-semibold"
                                          style={{ backgroundColor: '#1a7a96' }}
                                          title="Télécharger PDF A4"
                                        >
                                          📄 A4
                                        </button>
                                        <button
                                          onClick={() => imprimerReglement(reglementLocal, detail, magasinId)}
                                          className="px-3 py-1.5 rounded text-white text-xs font-semibold"
                                          style={{ backgroundColor: '#e53935' }}
                                          title="Imprimer B5"
                                        >
                                          📄 B5
                                        </button>
                                        <button
                                          onClick={async () => {
                                            // Import paresseux : xlsx chargé au clic.
                                            const XLSX = await import('xlsx');
                                            const wb = XLSX.utils.book_new();
                                            const wsData = [
                                              ['REÇU DE RÈGLEMENT'],
                                              [],
                                              ['N° Reçu:', reglement.recu],
                                              ['Client:', detail.client],
                                              ['N° Client:', detail.numeroClient],
                                              ['Mode de paiement:', reglement.mode_paiement],
                                              ['Compte:', reglement.compte_banque || '—'],
                                              ['Montant:', reglement.montant],
                                              ['Date:', new Date(reglement.date).toLocaleDateString('fr-FR')]
                                            ];
                                            const ws = XLSX.utils.aoa_to_sheet(wsData);
                                            XLSX.utils.book_append_sheet(wb, ws, 'Règlement');
                                            XLSX.writeFile(wb, `Reglement_${reglement.recu}_${detail.client}.xlsx`);
                                          }}
                                          className="px-3 py-1.5 rounded text-white text-xs font-semibold"
                                          style={{ backgroundColor: '#43a047' }}
                                          title="Télécharger Excel"
                                        >
                                          📊
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* Acompte initial — 1er versement (plus ancien) → EN BAS */}
                              {detail.recap.acompte && parseFloat(detail.recap.acompte) > 0 && (
                                <tr className="bg-white">
                                  <td className="px-3 py-2 border border-gray-300">{detail.recap.numRecu || '—'}</td>
                                  <td className="px-3 py-2 border border-gray-300">
                                    <div className="font-semibold">{detail.recap.modePaiement || 'ESPECE'}</div>
                                    <div className="text-xs text-gray-500">{detail.recap.compteBanque || 'CAISSE INTERNE'}</div>
                                  </td>
                                  <td className="px-3 py-2 border border-gray-300">{detail.recap.details || '—'}</td>
                                  <td className="px-3 py-2 border border-gray-300">
                                    <div>{fmt(detail.date)} {new Date(detail.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                    <div className="text-xs text-gray-600">{(detail as any).createdBy || 'LOUISE MARLÈNE'}</div>
                                  </td>
                                  <td className="px-3 py-2 border border-gray-300 text-right font-semibold">{parseFloat(detail.recap.acompte).toLocaleString('fr-FR')}</td>
                                  <td className="px-3 py-2 border border-gray-300">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => telechargerReglementPDF({
                                          recu: detail.recap.numRecu || '—',
                                          modePaiement: detail.recap.modePaiement || 'ESPECE',
                                          compteBanque: detail.recap.compteBanque || 'CAISSE INTERNE',
                                          details: detail.recap.details || '',
                                          montant: parseFloat(detail.recap.acompte),
                                          date: detail.date
                                        }, detail, magasinId)}
                                        className="px-3 py-1.5 rounded text-white text-xs font-semibold"
                                        style={{ backgroundColor: '#1a7a96' }}
                                        title="Télécharger PDF A4"
                                      >
                                        📄 A4
                                      </button>
                                      <button
                                        onClick={() => imprimerReglement({
                                          recu: detail.recap.numRecu || '—',
                                          modePaiement: detail.recap.modePaiement || 'ESPECE',
                                          compteBanque: detail.recap.compteBanque || 'CAISSE INTERNE',
                                          details: detail.recap.details || '',
                                          montant: parseFloat(detail.recap.acompte),
                                          date: detail.date
                                        }, detail, magasinId)}
                                        className="px-3 py-1.5 rounded text-white text-xs font-semibold"
                                        style={{ backgroundColor: '#e53935' }}
                                        title="Imprimer B5"
                                      >
                                        📄 B5
                                      </button>
                                      <button
                                        onClick={async () => {
                                          // Import paresseux : xlsx chargé au clic.
                                          const XLSX = await import('xlsx');
                                          const wb = XLSX.utils.book_new();
                                          const wsData = [
                                            ['REÇU DE RÈGLEMENT'],
                                            [],
                                            ['N° Reçu:', detail.recap.numRecu || '—'],
                                            ['Client:', detail.client],
                                            ['N° Client:', detail.numeroClient],
                                            ['Mode de paiement:', detail.recap.modePaiement || 'ESPECE'],
                                            ['Compte:', detail.recap.compteBanque || 'CAISSE INTERNE'],
                                            ['Montant:', parseFloat(detail.recap.acompte || '0')],
                                            ['Date:', new Date(detail.date).toLocaleDateString('fr-FR')]
                                          ];
                                          const ws = XLSX.utils.aoa_to_sheet(wsData);
                                          XLSX.utils.book_append_sheet(wb, ws, 'Règlement');
                                          XLSX.writeFile(wb, `Reglement_${detail.recap.numFacture}.xlsx`);
                                        }}
                                        className="px-3 py-1.5 rounded text-white text-xs font-semibold"
                                        style={{ backgroundColor: '#43a047' }}
                                        title="Télécharger Excel"
                                      >
                                        📊
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* Aucun règlement */}
                              {(!detail.recap.acompte || parseFloat(detail.recap.acompte) <= 0) && reglementsSupabase.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-3 py-8 text-center text-gray-400 bg-white border border-gray-300">
                                    Aucun règlement enregistré
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Right Column - Actions */}
                    <div className="col-span-3 flex flex-col gap-2">
                      <div className="text-xs font-semibold uppercase mb-1">💼 Actions</div>

                      {peutReglement && (
                        <>
                          <button
                            onClick={() => setShowAjouterReglement(true)}
                            className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                            style={{ backgroundColor: '#e09a2b' }}
                          >
                            Acompte
                          </button>

                          <button
                            onClick={() => setShowBonAssuranceReglement(true)}
                            className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90"
                            style={{ backgroundColor: '#e09a2b' }}
                          >
                            Bon Assurance
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              {viewMode === 'reglements' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setViewMode('details');
                  }}
                  className="px-6 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  ← Retour aux Détails
                </button>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDetail(null);
                  setViewMode('details');
                  setReglementsSupabase([]);
                }}
                className="px-6 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showCommandeVerre && detail && (
        <CommandeVerreModal
          vente={detail}
          magasinId={magasinId}
          onClose={() => setShowCommandeVerre(false)}
          onSave={handleSaveCommandeVerre}
        />
      )}

      <div className="flex flex-col gap-5 p-6">
        {/* Header - STATISTICS SECTION (kept intact as requested) */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Ventes | Factures ({ventes.length})</h1>
            <p className="text-sm text-gray-500 mt-0.5">Liste de toutes les ventes enregistrées</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: '#e3f2fd' }}>
              <div className="text-lg font-bold text-blue-700">{ventes.length}</div>
              <div className="text-xs text-blue-500">Ventes</div>
            </div>
            <div className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: '#e8f5e9' }}>
              <div className="text-lg font-bold text-green-700">{soldees}</div>
              <div className="text-xs text-green-500">Soldées</div>
            </div>
            <div className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: '#fff3e0' }}>
              <div className="text-base font-bold text-orange-700">{totalCA.toLocaleString('fr-FR')}</div>
              <div className="text-xs text-orange-500">CA (FCFA)</div>
            </div>
            <AddButton
              onClick={onNouvelle}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-semibold text-sm shadow"
              style={{ backgroundColor: '#1a7a96' }}
            >
              <Plus size={16} /> Ventes | Factures
            </AddButton>
          </div>
        </div>

        {/* Filter Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">N°Facture / N°Facture Normalisée</label>
              <input
                className={iCls}
                placeholder="N° Facture..."
                value={searchFacture}
                onChange={e => setSearchFacture(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Infos Client</label>
              <input
                className={iCls}
                placeholder="Nom, N° Client, Téléphone..."
                value={searchClient}
                onChange={e => setSearchClient(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date Début</label>
              <input
                className={iCls}
                type="date"
                value={dateDebut}
                onChange={e => setDateDebut(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date Fin</label>
              <input
                className={iCls}
                type="date"
                value={dateFin}
                onChange={e => setDateFin(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#1a7a96' }}>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300">#</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300">N° Facture</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300">Client</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300 text-right">Total</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300 text-center">Remise</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300 text-right">Total Net</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300">Acompte</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300 text-right">Total Reste</th>
                  <th className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300">Edition</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-gray-400">
                      {ventes.length === 0
                        ? 'Aucune vente enregistrée. Cliquez sur "Ventes | Factures" pour en créer une.'
                        : 'Aucun résultat pour cette recherche.'}
                    </td>
                  </tr>
                ) : (
                  [...filtered].sort(ordreArrivee).map((v, i) => {
                    const acompte = parseFloat(v.recap.acompte) || 0;
                    const totalAssurance = v.bonsAssurance.reduce((s, b) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
                    const totalReglements = (reglementsParVente[v.id] || []).reduce((s, r) => s + r.montant, 0);
                    const reste = v.totalNet - acompte - totalAssurance - totalReglements;
                    const remisePct = parseFloat(v.recap.remisePct) || 0;

                    // Calculate total before discount
                    const totalBrut = v.articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0) +
                      (v.verres?.reduce((s: number, vr: any) => s + (parseFloat(vr.totalVerres) || 0), 0) || 0);

                    // Row color based on payment status
                    const rowBgColor = reste > 0 ? '#fee2e2' : '#dcfce7'; // red if unpaid, green if paid

                    return (
                      <tr key={`${v.id}-${i}`} className="border-b border-gray-200" style={{ backgroundColor: rowBgColor }}>
                        <td className="px-3 py-2 text-center text-sm border border-gray-300">{i + 1}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-blue-700 text-sm border border-gray-300">{v.recap.numFacture || '—'}</td>
                        <td className="px-3 py-2 text-sm border border-gray-300">
                          <div className="font-medium text-gray-800">{v.client || '—'}</div>
                          <div className="text-xs text-gray-500">{v.telephone || ''}</div>
                        </td>
                        <td className="px-3 py-2 text-right text-sm border border-gray-300 font-semibold">{totalBrut.toLocaleString('fr-FR')}</td>
                        <td className="px-3 py-2 text-center text-sm border border-gray-300">{remisePct}%</td>
                        <td className="px-3 py-2 text-right text-sm border border-gray-300 font-semibold">{v.totalNet.toLocaleString('fr-FR')}</td>
                        <td className="px-3 py-2 text-sm border border-gray-300">
                          {acompte > 0 && (
                            <div className="text-xs mb-1">
                              <span className="font-medium">Acompte: </span>
                              <span className="font-semibold">{acompte.toLocaleString('fr-FR')} F</span>
                            </div>
                          )}
                          {v.bonsAssurance.map((b, bi) => (
                            <div key={`${b.id}-${bi}`} className="mb-1 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: '#fef3c7', color: '#78350f' }}>
                              <div>{b.assurance}</div>
                              <div className="font-semibold">{parseFloat(b.montantPrisEnCharge).toLocaleString('fr-FR')} F</div>
                              {b.numeroBon && <div className="text-xs opacity-70">N° {b.numeroBon}</div>}
                            </div>
                          ))}
                          {(reglementsParVente[v.id] || []).map((r, ri) => (
                            <div key={`${r.id}-${ri}`} className="mb-1 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: '#d1fae5', color: '#065f46' }}>
                              <div>{r.mode_paiement}</div>
                              <div className="font-semibold">{r.montant.toLocaleString('fr-FR')} F</div>
                              {r.recu && <div className="text-xs opacity-70">Reçu N° {r.recu}</div>}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-right text-sm border border-gray-300">
                          <span className={`font-bold ${reste > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {reste.toLocaleString('fr-FR')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm border border-gray-300 align-top">
                          {/* Disposition « Édition » calquée sur la maquette :
                              infos d'édition à gauche + boutons d'action empilés à droite. */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <div className="px-2 py-1 rounded text-xs" style={{ backgroundColor: '#eef2ff', color: '#3730a3' }}>
                                <div className="opacity-80">{formatDate((v as any).createdAt || (v as any).date)}</div>
                                <div className="font-semibold truncate">
                                  {resolveUserName((v as any).editePar || (v as any).createdBy || (v as any).edite_par)}
                                </div>
                              </div>
                              <div className="border-t border-dashed border-gray-300" />
                              {/* Jour de RDV du client (retrait) — encadré jaune, comme la maquette. */}
                              <div
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold"
                                style={{ backgroundColor: '#fef08a', color: '#713f12' }}
                              >
                                <Calendar size={12} />
                                <span>RDV: {v.recap.rdvRetrait ? fmt(v.recap.rdvRetrait) : '—'}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => setDetail(v)}
                                title="Voir / Détails"
                                className="flex items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                                style={{ width: 28, height: 28 }}
                              >
                                <MoreHorizontal size={14} />
                              </button>
                              {peutModifier && onModifier && (
                                <button
                                  onClick={() => onModifier(v)}
                                  title="Modifier"
                                  className="flex items-center justify-center rounded text-white"
                                  style={{ width: 28, height: 28, backgroundColor: '#f59e0b' }}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {peutSupprimer && onSupprimer && (
                                <button
                                  onClick={() => onSupprimer(v)}
                                  title="Supprimer"
                                  className="flex items-center justify-center rounded text-white"
                                  style={{ width: 28, height: 28, backgroundColor: '#dc2626' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FORMULAIRE D'ENREGISTREMENT (4 étapes)
// ════════════════════════════════════════════════════════════════════════════

function newClientState(): ClientInfo {
  return {
    numeroClient: genClientId(),
    civilite: '', nom: '', telephone1: '', telephone2: '', email: '',
    adresse: '', profession: '', jourNaissance: '', moisNaissance: '', anneeNaissance: '',
    soldeClient: '', matriculeAssurance: '', entreprise: '',
    ophtalmologue: '', telOphtalmologue: '', cabinetOphtalmologue: '', telCabinet: '',
  };
}

function FormulaireVente({ magasinId, onRetour, onVenteEnregistree, venteInitiale }: { magasinId: string; onRetour: () => void; onVenteEnregistree: () => void; venteInitiale?: VenteSauvegardee }) {
  const { user } = useAuth();
  // Mode ÉDITION : quand une vente existante est fournie, on préremplit tous les
  // champs et on réutilise son id à l'enregistrement (setDoc merge = écrasement).
  const enEdition = !!venteInitiale;
  const [active, setActive] = useState(0);
  const [client, setClient] = useState<ClientInfo>(() => venteInitiale?.clientInfo || newClientState());
  const [verre, setVerre] = useState<VerreInfo[]>(() => venteInitiale?.verres || []);
  const [articles, setArticles] = useState<ArticleLigne[]>(() => venteInitiale?.articles || []);
  const [observation, setObservation] = useState(() => venteInitiale?.observation || '');
  const [bonsAssurance, setBonsAssurance] = useState<BonAssurance[]>(() => venteInitiale?.bonsAssurance || []);
  const [recap, setRecap] = useState<RecapInfo>(() => venteInitiale?.recap || {
    remisePct: '0', acompte: '0', modePaiement: '', compteBanque: '',
    details: '', rdvRetrait: '', numFacture: genNumFacture(),
  });
  const [succes, setSucces] = useState<{ total: string } | null>(null);
  const [derniereVente, setDerniereVente] = useState<any>(null);
  const savingRef = useRef(false);
  // Produits vendables + stock RÉEL du magasin (mouvements distribution/transfert)
  // pour bloquer la vente d'une monture / d'un accessoire en rupture.
  const venteProducts = useVenteProducts(magasinId);

  const handleEnregistrer = async (totalNet: number) => {
    if (!client.nom) { alert('Veuillez renseigner le nom du client (Étape I).'); return; }

    // Contrôle du STOCK : on interdit la validation si une monture (ou un
    // accessoire géré en stock) demandée est en rupture ou en quantité
    // insuffisante dans le magasin. Le stock provient des bons de distribution /
    // transfert reçus (useVenteProducts → useStockMagasin).
    // Logique mutualisée avec la Vente Flash dans `utils/stockVente.ts`.
    const ruptures = verifierStockVente(articles, venteProducts);
    if (ruptures.length > 0) {
      alert(messageRuptures(ruptures));
      return;
    }

    // Garde anti-double : empêche un double enregistrement (double-clic / re-render).
    if (savingRef.current) return;
    savingRef.current = true;

    const userName = user?.nom || user?.prenom || user?.email || 'Utilisateur';

    // Calculer le total brut
    const totalBrut = articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0) +
      verre.reduce((s, v) => s + (parseFloat(v.totalVerres) || 0), 0);

    // Numéro de reçu (versement) : généré UNE fois et conservé sur la vente pour
    // rester stable entre les impressions. Réutilise l'existant en mode édition.
    const recapAvecRecu = { ...recap, numRecu: (venteInitiale?.recap as any)?.numRecu || recap.numRecu || genNumRecu() };

    const vente = {
      id: venteInitiale?.id || Date.now().toString(),
      date: venteInitiale?.date || new Date().toISOString(),
      numeroClient: client.numeroClient,
      client: `${client.civilite} ${client.nom}`.trim(),
      telephone: client.telephone1,
      verres: verre,
      articles,
      bonsAssurance,
      totalNet,
      recap: recapAvecRecu,
      clientInfo: client, // Save full client info for details display
      observation,
    };

    // Ajouter les informations d'audit
    const venteWithAudit = enEdition ? addUpdateAudit({ ...venteInitiale, ...vente }) : addCreateAudit(vente);

    // Sauvegarder dans Supabase
    try {
      const venteSupabase: Omit<VenteSupabase, 'created_at' | 'updated_at'> = {
        id: venteWithAudit.id,
        magasin_id: magasinId,
        type: 'vente',
        date: venteWithAudit.date,

        // Client
        numero_client: client.numeroClient,
        client: `${client.civilite} ${client.nom}`.trim(),
        civilite: client.civilite,
        telephone: client.telephone1,
        telephone2: client.telephone2,
        email: client.email,
        adresse: client.adresse,
        profession: client.profession,
        date_naissance: `${client.anneeNaissance}-${client.moisNaissance}-${client.jourNaissance}`,
        solde_client: client.soldeClient,
        matricule_assurance: client.matriculeAssurance,
        entreprise: client.entreprise,

        // Ophtalmologue
        ophtalmologue: client.ophtalmologue,
        tel_ophtalmologue: client.telOphtalmologue,
        cabinet_ophtalmologue: client.cabinetOphtalmologue,
        tel_cabinet: client.telCabinet,

        // Données
        verres: verre,
        articles: articles,
        bons_assurance: bonsAssurance,
        recap: recap,

        // Totaux
        total_brut: totalBrut,
        total_net: totalNet,

        // Métadonnées
        edite_par: userName,
        statut: 'en_cours',
      };

      // Enregistrement OPTIMISTE : ajouterVente met le cache local à jour
      // immédiatement (avant l'await réseau), donc la confirmation s'affiche
      // aussitôt. L'écriture Firestore se poursuit EN ARRIÈRE-PLAN ; en cas
      // d'échec réseau réel, l'utilisateur est prévenu.
      ajouterVente(venteSupabase)
        .then(() => logger.log('✅ Vente enregistrée sur Firebase'))
        .catch(error => {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('❌ Échec enregistrement Firebase:', error);
          reportFirebaseError('Enregistrement vente', error);
          alert(`⚠️ La vente s'est affichée mais la synchronisation cloud a échoué.\n\nCause :\n${message}\n\nVérifiez votre connexion ; réessayez si elle n'apparaît pas sur les autres appareils.`);
        });

      // Décrémenter le stock réel du magasin (montures / accessoires vendus).
      // Exécuté EN ARRIÈRE-PLAN (pas d'await) : l'écran de succès s'affiche
      // immédiatement après l'enregistrement de la vente au lieu d'attendre la
      // mise à jour du stock, ce qui rend l'enregistrement beaucoup plus rapide.
      const items = articles
        .filter(a => a.type === 'monture' || a.type === 'accessoire')
        .map(a => ({
          id: (a.produitId || a.designation).trim(),
          type: a.type as 'monture' | 'accessoire',
          designation: a.designation.trim(),
          quantite: parseFloat(a.quantite) || 0,
          prixVente: parseFloat(a.prix) || 0,
        }));
      if (items.length > 0) {
        enregistrerVente({ magasinId: magasinId.toUpperCase(), bonReference: recap.numFacture, items })
          .catch(stockErr => logger.error('❌ Décrément stock vente:', stockErr));
      }

      // NB : le stock « Lentilles OPTIC » n'est PLUS décrémenté ici. La sortie de
      // stock est désormais déclenchée à l'atelier, au passage « Montage Reçu →
      // Suivi du Montage » (prise en charge validée), sur la base des données
      // complètes de la vente reportées dans le bon (verreDetails).
    } catch (error) {
      // On affiche la VRAIE cause (l'ancien message « enregistrée localement »
      // était faux : rien n'est sauvé en local, et il masquait l'erreur).
      const message = error instanceof Error ? error.message : String(error);
      logger.error('❌ Échec enregistrement Firebase:', error);
      reportFirebaseError('Enregistrement vente', error);
      alert(`❌ La vente n'a PAS pu être enregistrée sur Firebase.\n\nCause exacte :\n${message}\n\n(Envoyez ce message à votre développeur.)`);
      savingRef.current = false;
      return; // On n'affiche pas la vente comme enregistrée si elle a échoué
    }

    savingRef.current = false;
    setDerniereVente(venteWithAudit);
    setSucces({ total: totalNet.toLocaleString('fr-FR') });

    // Trigger sync event after render completes
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key: `leclaire_ventes_factures_${magasinId}` } }));
    }, 0);

    // Mémoriser un mode de paiement saisi librement pour le proposer ensuite.
    if (recap.modePaiement) autoSaveModePaiement(recap.modePaiement);

    // Auto-enregistrer le client dans la base du magasin
    autoSaveClient({
      numeroClient: client.numeroClient,
      civilite: client.civilite,
      nom: client.nom,
      telephone1: client.telephone1,
      telephone2: client.telephone2,
      email: client.email,
      adresse: client.adresse,
      profession: client.profession,
      jourNaissance: client.jourNaissance,
      moisNaissance: client.moisNaissance,
      anneeNaissance: client.anneeNaissance,
      soldeClient: client.soldeClient,
      matriculeAssurance: client.matriculeAssurance,
      entreprise: client.entreprise,
    }, magasinId);
    // Auto-enregistrer ophtalmologue et cabinet dans Gestion des Acteurs
    if (client.ophtalmologue) autoSaveOphtalmologue(client.ophtalmologue, client.telOphtalmologue);
    if (client.cabinetOphtalmologue) autoSaveCabinet(client.cabinetOphtalmologue, client.telCabinet);
  };

  const handleNouvelle = () => {
    setClient(newClientState());
    setVerre([]);
    setArticles([]); setObservation(''); setBonsAssurance([]);
    setRecap({ remisePct: '0', acompte: '0', modePaiement: '', compteBanque: '', details: '', rdvRetrait: '', numFacture: genNumFacture() });
    setActive(0); setSucces(null);
  };

  const stepContent = [
    <StepI data={client} onChange={setClient} magasinId={magasinId} />,
    <StepII data={verre} onChange={setVerre} client={client} magasinId={magasinId} />,
    <StepIII articles={articles} onChange={setArticles} observation={observation} onObsChange={setObservation} magasinId={magasinId} />,
    <StepIV
      articles={articles}
      verreTotal={verre.reduce((s, v) => s + (parseFloat(v.totalVerres) || 0), 0).toString()}
      data={recap}
      onChange={setRecap}
      bonsAssurance={bonsAssurance}
      onAddBon={(b) => setBonsAssurance(prev => [...prev, b])}
      onRemoveBon={(id) => setBonsAssurance(prev => prev.filter(b => b.id !== id))}
      onEnregistrer={handleEnregistrer}
    />,
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#d6e4ea' }}>
      {succes && (
        <ModalSucces
          numFacture={recap.numFacture}
          numClient={client.numeroClient}
          total={succes.total}
          onClose={() => { setSucces(null); onVenteEnregistree(); onRetour(); }}
          onNouvelle={() => { handleNouvelle(); onVenteEnregistree(); }}
          onImprimer={() => derniereVente && imprimerReglement({
            recu: derniereVente.recap.numRecu,
            montant: Number(derniereVente.recap.acompte) || 0,
            date: (derniereVente as any).createdAt || derniereVente.date,
            modePaiement: derniereVente.recap.modePaiement,
            compteBanque: derniereVente.recap.compteBanque,
            editePar: (derniereVente as any).createdBy || user?.nom || user?.prenom || user?.email || '—',
          }, derniereVente, magasinId)}
        />
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3" style={{ backgroundColor: '#b8cdd6' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={onRetour}
            className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 font-medium"
          >
            <ArrowLeft size={16} /> Retour à la liste
          </button>
          <span className="text-gray-400">|</span>
          <span className="text-lg font-semibold text-gray-800">Nouvelle Vente | Facture</span>
        </div>
        <span className="text-sm font-semibold px-3 py-1 rounded text-white" style={{ backgroundColor: '#1a7a96' }}>
          N° Client : {client.numeroClient}
        </span>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-44 shrink-0 bg-white border-r border-gray-200 flex flex-col">
          {STEPS.map((step, i) => (
            <button
              key={step.num}
              onClick={() => setActive(i)}
              className="text-left px-4 py-4 border-b border-gray-100 hover:bg-blue-50 transition-colors"
              style={{
                borderLeft: active === i ? '4px solid #1a7a96' : '4px solid transparent',
                backgroundColor: active === i ? '#eff8fb' : undefined,
              }}
            >
              <div className="text-sm font-bold text-gray-800 leading-tight">{step.num} {step.title}</div>
              {step.sub.map((s) => (
                <div key={s} className="text-xs text-gray-500 leading-snug mt-0.5">{s}</div>
              ))}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="flex-1 p-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {stepContent[active]}
          </div>
          <div className="flex justify-between mt-4">
            <button
              onClick={() => setActive(p => Math.max(0, p - 1))}
              disabled={active === 0}
              className="px-5 py-2 rounded text-sm font-medium border border-gray-300 bg-white text-gray-700 disabled:opacity-40 hover:bg-gray-50"
            >
              ← Précédent
            </button>
            <span className="text-sm text-gray-500 self-center">Étape {active + 1} / {STEPS.length}</span>
            <button
              onClick={() => setActive(p => Math.min(STEPS.length - 1, p + 1))}
              disabled={active === STEPS.length - 1}
              className="px-5 py-2 rounded text-sm font-medium text-white disabled:opacity-40"
              style={{ backgroundColor: '#1a7a96' }}
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main page — bascule liste ↔ formulaire
// ════════════════════════════════════════════════════════════════════════════

/** Convertit une vente Firestore (snake_case) en VenteSauvegardee (camelCase). */
function venteSupabaseToSauvegardee(v: VenteSupabase): VenteSauvegardee {
  return {
    id: v.id,
    date: v.date,
    numeroClient: v.numero_client || '',
    client: v.client,
    civilite: v.civilite || '',
    telephone: v.telephone || '',
    telephone2: v.telephone2 || '',
    email: v.email || '',
    adresse: v.adresse || '',
    profession: v.profession || '',
    dateNaissance: v.date_naissance || '',
    soldeClient: v.solde_client || '',
    matriculeAssurance: v.matricule_assurance || '',
    entreprise: v.entreprise || '',
    ophtalmologue: v.ophtalmologue || '',
    telOphtalmologue: v.tel_ophtalmologue || '',
    cabinetOphtalmologue: v.cabinet_ophtalmologue || '',
    telCabinet: v.tel_cabinet || '',
    verres: v.verres || [],
    articles: v.articles || [],
    bonsAssurance: v.bons_assurance || [],
    totalBrut: v.total_brut,
    totalNet: v.total_net,
    recap: v.recap || {},
    observation: '',
    createdBy: v.edite_par || '',
    createdAt: v.created_at || v.date,
    clientInfo: {
      numeroClient: v.numero_client || '',
      civilite: v.civilite || '',
      nom: v.client,
      telephone1: v.telephone || '',
      telephone2: v.telephone2 || '',
      email: v.email || '',
      adresse: v.adresse || '',
      profession: v.profession || '',
      jourNaissance: '',
      moisNaissance: '',
      anneeNaissance: '',
      soldeClient: v.solde_client || '',
      matriculeAssurance: v.matricule_assurance || '',
      entreprise: v.entreprise || '',
      ophtalmologue: v.ophtalmologue || '',
      telOphtalmologue: v.tel_ophtalmologue || '',
      cabinetOphtalmologue: v.cabinet_ophtalmologue || '',
      telCabinet: v.tel_cabinet || '',
    },
  };
}

export function VenteFacturePage() {
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const ventesKey = `leclaire_ventes_${magasinId}`;
  const [vue, setVue] = useState<'liste' | 'formulaire'>('liste');
  const [venteEnEdition, setVenteEnEdition] = useState<VenteSauvegardee | null>(null);
  // Affichage INSTANTANÉ depuis le cache, puis rafraîchissement + temps réel.
  // Les devis (type 'devis') restent dans la page Devis | Proforma : on ne les
  // affiche PAS dans la liste des ventes/factures.
  const estVente = (v: VenteSupabase) => v.type !== 'devis';
  const [ventes, setVentes] = useState<VenteSauvegardee[]>(
    () => readVentesCache(magasinId).filter(estVente).map(venteSupabaseToSauvegardee),
  );

  const chargerVentes = async () => {
    try {
      const ventesSupabase = await chargerVentesSupabase(magasinId);
      setVentes(ventesSupabase.filter(estVente).map(venteSupabaseToSauvegardee));
    } catch (error) {
      logger.error('Erreur lors du chargement des ventes:', error);
    }
  };

  useEffect(() => {
    // Re-seed cache immédiat au changement de magasin.
    setVentes(readVentesCache(magasinId).filter(estVente).map(venteSupabaseToSauvegardee));
    chargerVentes();
  }, [magasinId]);

  // Synchronisation en temps réel
  useEffect(() => {
    if (!magasinId) return;

    const convertVenteSupabase = venteSupabaseToSauvegardee;

    const channel = subscriberVentesMagasin(
      magasinId,
      (vente) => {
        // Nouvelle vente ajoutée — dédoublonnage par id (le snapshot initial
        // réémet un "added" pour chaque vente déjà chargée). On ignore les devis.
        if (!estVente(vente)) return;
        setVentes(prev => {
          const conv = convertVenteSupabase(vente);
          if (prev.some(v => v.id === conv.id)) {
            return prev.map(v => v.id === conv.id ? conv : v);
          }
          return [conv, ...prev];
        });
      },
      (vente) => {
        // Vente mise à jour — un devis converti en vente devient visible ici ;
        // un enregistrement resté 'devis' est retiré de la liste.
        if (!estVente(vente)) {
          setVentes(prev => prev.filter(v => v.id !== vente.id));
          return;
        }
        setVentes(prev => {
          const conv = convertVenteSupabase(vente);
          if (prev.some(v => v.id === conv.id)) {
            return prev.map(v => v.id === conv.id ? conv : v);
          }
          return [conv, ...prev];
        });
      },
      (venteId) => {
        // Vente supprimée
        setVentes(prev => prev.filter(v => v.id !== venteId));
      }
    );

    return () => {
      if (typeof channel === 'function') channel();
      else if (channel && typeof (channel as any).unsubscribe === 'function') (channel as any).unsubscribe();
    };
  }, [magasinId]);

  const handleSupprimer = async (vente: VenteSauvegardee) => {
    if (!window.confirm(`Supprimer définitivement la facture ${vente.recap?.numFacture || ''} de ${vente.client} ?`)) return;
    const ok = await supprimerVente(vente.id);
    if (ok) {
      setVentes(prev => prev.filter(v => v.id !== vente.id));
    } else {
      alert('❌ La suppression a échoué. Réessayez.');
    }
  };

  if (vue === 'formulaire') {
    return (
      <FormulaireVente
        magasinId={magasinId}
        venteInitiale={venteEnEdition || undefined}
        onRetour={() => { chargerVentes(); setVenteEnEdition(null); setVue('liste'); }}
        onVenteEnregistree={chargerVentes}
      />
    );
  }

  return (
    <ListeVentes
      ventes={ventes}
      onNouvelle={() => { setVenteEnEdition(null); setVue('formulaire'); }}
      onModifier={(v) => { setVenteEnEdition(v); setVue('formulaire'); }}
      onSupprimer={handleSupprimer}
    />
  );
}
