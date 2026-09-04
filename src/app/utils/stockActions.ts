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
  items?: Array<{
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

/** Imprime directement le bon de distribution sélectionné, dans une mise en page
 * proche du PDF de référence : en-tête LECLAIRE, métadonnées, magasin/client,
 * tableau des montures/accessoires et quantité reçue. */
export function imprimerBonDistribution(bon: BonDistributionPrintData, format: 'A4' | 'A5' | 'B5' = 'A4') {
  const reference = bon.reference || bon.numero || '-';
  const dateValue = bon.dateCreation || bon.createdAt || new Date().toISOString();
  const dateObj = new Date(dateValue);
  const dateText = Number.isNaN(dateObj.getTime()) ? String(dateValue) : dateObj.toLocaleString('fr-FR');
  const dayText = Number.isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const items = Array.isArray(bon.items) ? bon.items : [];
  const totalQte = items.reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
  const rows = items.length ? items.map((item, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${escapePrintHtml(item.designation || '-')}</td>
      <td class="center">${escapePrintHtml(item.type === 'accessoire' ? 'Accessoire' : 'Monture')}</td>
      <td class="center">${Number(item.quantite) || 0}</td>
    </tr>`).join('') : `
    <tr><td colspan="4" class="empty">Aucune monture ou accessoire distribué.</td></tr>`;

  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) {
    alert("L'impression a été bloquée par le navigateur. Autorisez les fenêtres contextuelles puis réessayez.");
    return;
  }

  win.document.open();
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>Bon de Distribution N° ${escapePrintHtml(reference)}</title>
    <style>
      @page { size: ${format}; margin: 9mm; }
      * { box-sizing: border-box; }
      body { margin:0; font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12px; }
      .header { text-align:left; margin-bottom:12px; }
      .brand { font-size:20px; font-weight:700; margin-bottom:2px; }
      .company { line-height:1.35; }
      .date { text-align:right; margin-top:5px; }
      .meta { border:1px solid #222; padding:8px; margin:10px 0 12px; line-height:1.55; }
      .meta-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:18px; }
      .title { font-size:16px; font-weight:700; text-align:center; margin:8px 0 10px; }
      table { width:100%; border-collapse:collapse; }
      th, td { border:1px solid #555; padding:7px 6px; vertical-align:top; }
      th { font-weight:700; text-align:left; background:#f1f1f1; }
      .center { text-align:center; }
      .total { font-weight:700; margin-top:10px; border-top:1px solid #222; padding-top:8px; }
      .signatures { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:55px; }
      .signature { text-align:center; padding-top:7px; border-top:1px solid #777; }
      .footer { margin-top:35px; padding-top:8px; border-top:1px solid #999; text-align:center; font-size:9px; }
      .empty { text-align:center; padding:18px; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
      <div class="header">
        <div class="brand">LECLAIRE</div>
        <div class="company">8 Pool, Rond-point de la Rivera Palmeraie<br>WhatsApp : +225 07 15 15 25 25<br>Email : Leclaire.optic@gmail.com</div>
        <div class="date">Abidjan, Le ${escapePrintHtml(dayText || dateText)}</div>
      </div>
      <div class="meta">
        <div class="meta-grid">
          <div><strong>MAGASIN:</strong> ${escapePrintHtml(bon.magasinRecepteur || bon.magasinDest || '-')}</div>
          <div><strong>Récepteur:</strong> ${escapePrintHtml(bon.responsable || '-')}</div>
          <div><strong>Statut:</strong> ${escapePrintHtml(bon.statut || 'En cours')}</div>
          <div><strong>Édité par:</strong> ${escapePrintHtml(bon.createdBy || bon.responsable || '-')}</div>
          <div><strong>Édité le:</strong> ${escapePrintHtml(dateText)}</div>
        </div>
      </div>
      <div class="title">BON DE DISTRIBUTION N° ${escapePrintHtml(reference)}</div>
      <table>
        <thead><tr><th>#</th><th>Monture | Accessoire</th><th>Type</th><th class="center">QUANTITÉ<br>REÇUE</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Bon de Distribution Total Quantité ${totalQte}</div>
      <div class="signatures"><div class="signature">Émetteur</div><div class="signature">Réception magasin</div></div>
      <div class="footer">+225 07 15 15 25 25 | Leclaire.optic@gmail.com | 8 Pool, R.point de la rivera Palmeraie</div>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},100);});</script>
    </body></html>`);
  win.document.close();
}

