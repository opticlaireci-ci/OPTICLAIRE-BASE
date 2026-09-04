import { afficherHtml } from './inAppViewer';
import { printHeaderHTML } from './documentHeader';

export function imprimerGestionStock(titre = 'Document de gestion de stock') {
  const prev = document.title;
  document.title = titre;
  window.print();
  window.setTimeout(() => { document.title = prev; }, 500);
}

export function imprimerFormatGestionStock(titre: string, format: 'A5' | 'B5' | 'A4' = 'A4') {
  const style = document.createElement('style');
  style.id = '__stock_print_format';
  style.textContent = `@media print { @page { size: ${format}; margin: 8mm; } body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }`;
  document.head.appendChild(style);
  imprimerGestionStock(titre);
  window.setTimeout(() => style.remove(), 1000);
}


export interface BonDistributionPrintData {
  reference?: string;
  numero?: string;
  magasinRecepteur?: string;
  magasinDest?: string;
  responsable?: string;
  createdBy?: string;
  createdAt?: string;
  dateCreation?: string;
  statut?: string;
  recepteur?: string;
  receiver?: string;
  valideePar?: string;
  dateValidation?: string;
  items?: Array<{
    id?: string;
    designation?: string;
    quantite?: number;
    prixUnit?: number;
    prixVente?: number;
    type?: string;
  }>;
}

const escapePrintHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const formatPrintMoney = (value: unknown) =>
  `${Math.round(Number(value) || 0).toLocaleString('fr-FR')} F CFA`;

/**
 * Imprime un bon de distribution dans le même flux d'impression que les
 * règlements : aperçu/iframe interne, en-tête de l'enseigne, métadonnées et
 * tableau complet des montures/accessoires distribués.
 */
export function imprimerBonDistribution(bon: BonDistributionPrintData, format: 'A4' | 'A5' | 'B5' = 'A4') {
  const reference = bon.reference || bon.numero || '-';
  const dateValue = bon.dateCreation || bon.createdAt || new Date().toISOString();
  const dateObj = new Date(dateValue);
  const dateText = Number.isNaN(dateObj.getTime()) ? String(dateValue) : dateObj.toLocaleString('fr-FR');
  const magasin = bon.magasinRecepteur || bon.magasinDest || '-';
  const registeredBy = bon.createdBy || bon.responsable || '-';
  const receiver = bon.recepteur || bon.receiver || bon.valideePar || (bon.statut === 'En attente' ? 'En attente' : '-');
  const items = Array.isArray(bon.items) ? bon.items : [];
  const totalQte = items.reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
  const totalValeur = items.reduce((sum, item) => sum + ((Number(item.prixUnit ?? item.prixVente) || 0) * (Number(item.quantite) || 0)), 0);

  const rows = items.length ? items.map((item, i) => {
    const type = item.type === 'accessoire' ? 'Accessoire' : 'Monture';
    const qty = Number(item.quantite) || 0;
    const prix = Number(item.prixUnit ?? item.prixVente) || 0;
    return `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapePrintHtml(item.designation || '-')}</td>
        <td class="center">${type}</td>
        <td class="center">${qty}</td>
        <td class="right">${formatPrintMoney(prix)}</td>
        <td class="right">${formatPrintMoney(prix * qty)}</td>
      </tr>`;
  }).join('') : `
    <tr><td colspan="6" class="empty">Aucune monture ou accessoire distribué.</td></tr>`;

  const statusClass = bon.statut === 'Validé' ? 'status-ok' : bon.statut === 'Refusé' ? 'status-no' : 'status-wait';
  const statusLabel = bon.statut || 'En attente';
  const pageSize = format === 'A4' ? 'A4' : format;

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Bon de Distribution N° ${escapePrintHtml(reference)}</title>
  <style>
    @page { size: ${pageSize}; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
    body { padding: ${format === 'A4' ? '16mm 14mm 13mm' : '10mm'}; font-size: 12px; }
    .meta { border: 1px solid #222; background: #f7f7f7; padding: 11px 13px; margin-bottom: 15px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 22px; row-gap: 7px; }
    .meta-item { line-height: 1.4; }
    .meta-label { font-weight: 700; }
    .title { text-align: center; font-size: 18px; font-weight: 800; margin: 5px 0 14px; text-transform: uppercase; }
    .status { display: inline-block; padding: 3px 9px; border-radius: 12px; font-weight: 700; }
    .status-ok { background: #d1fae5; color: #166534; }
    .status-no { background: #fee2e2; color: #991b1b; }
    .status-wait { background: #fef3c7; color: #92400e; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #555; padding: 7px 6px; vertical-align: top; word-break: break-word; }
    th { background: #e5e7eb; font-weight: 700; text-align: left; }
    th:nth-child(1) { width: 6%; }
    th:nth-child(2) { width: 37%; }
    th:nth-child(3) { width: 15%; }
    th:nth-child(4) { width: 10%; }
    th:nth-child(5) { width: 16%; }
    th:nth-child(6) { width: 16%; }
    .center { text-align: center; }
    .right { text-align: right; white-space: nowrap; }
    .empty { text-align: center; padding: 20px; }
    .summary { margin-top: 12px; margin-left: auto; width: 320px; border-collapse: collapse; }
    .summary td { border: 0; border-bottom: 1px solid #ddd; padding: 6px 8px; }
    .summary td:first-child { text-align: right; font-weight: 700; }
    .summary td:last-child { text-align: right; white-space: nowrap; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 45px; margin-top: 48px; }
    .signature { text-align: center; padding-top: 7px; border-top: 1px solid #777; font-weight: 600; }
    .footer { margin-top: 30px; padding-top: 8px; border-top: 1px solid #999; text-align: center; font-size: 9px; }
    @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  </style>
</head>
<body>
  ${printHeaderHTML('', { date: dateValue })}

  <div class="meta">
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">N° Bon de Distribution :</span> ${escapePrintHtml(reference)}</div>
      <div class="meta-item"><span class="meta-label">Magasin :</span> ${escapePrintHtml(magasin)}</div>
      <div class="meta-item"><span class="meta-label">Récepteur :</span> ${escapePrintHtml(receiver)}</div>
      <div class="meta-item"><span class="meta-label">Statut :</span> <span class="status ${statusClass}">${escapePrintHtml(statusLabel)}</span></div>
      <div class="meta-item"><span class="meta-label">Enregistré par :</span> ${escapePrintHtml(registeredBy)}</div>
      <div class="meta-item"><span class="meta-label">Édité le :</span> ${escapePrintHtml(dateText)}</div>
    </div>
  </div>

  <div class="title">Bon de Distribution N° ${escapePrintHtml(reference)}</div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Monture / Accessoire</th>
        <th>Type</th>
        <th class="center">Quantité</th>
        <th class="right">Prix unitaire</th>
        <th class="right">Valeur</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="summary">
    <tbody>
      <tr><td>Total articles :</td><td>${items.length}</td></tr>
      <tr><td>Quantité totale :</td><td>${totalQte}</td></tr>
      <tr><td>Valeur totale :</td><td>${formatPrintMoney(totalValeur)}</td></tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="signature">Émetteur</div>
    <div class="signature">Réception magasin</div>
  </div>

  <div class="footer">Document de gestion de stock — Bon de Distribution N° ${escapePrintHtml(reference)}</div>
</body>
</html>`;

  // Même mécanisme que les règlements : impression via iframe interne,
  // sans ouvrir une nouvelle fenêtre/onglet.
  afficherHtml(html, { titre: `Bon de Distribution N° ${reference}`, imprimerAuto: true });
}
