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

/** Imprime le contenu du bon de distribution sélectionné, et non la page courante. */
export function imprimerBonDistribution(bon: BonDistributionPrintData, format: 'A4' | 'A5' | 'B5' = 'A4') {
  const reference = bon.reference || bon.numero || '-';
  const date = bon.dateCreation || bon.createdAt || new Date().toISOString();
  const items = Array.isArray(bon.items) ? bon.items : [];
  const totalQte = items.reduce((sum, item) => sum + (Number(item.quantite) || 0), 0);
  const totalValeur = items.reduce((sum, item) => sum + (Number(item.quantite) || 0) * (Number(item.prixUnit ?? item.prixVente) || 0), 0);
  const rows = items.length ? items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapePrintHtml(item.designation || '-')}</td>
      <td>${escapePrintHtml(item.type || 'Monture / Accessoire')}</td>
      <td class="num">${Number(item.quantite) || 0}</td>
      <td class="num">${(Number(item.prixUnit ?? item.prixVente) || 0).toLocaleString('fr-FR')}</td>
      <td class="num">${((Number(item.quantite) || 0) * (Number(item.prixUnit ?? item.prixVente) || 0)).toLocaleString('fr-FR')}</td>
    </tr>`).join('') : `
    <tr><td colspan="6" class="empty">Aucune monture ou accessoire distribué.</td></tr>`;

  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) {
    alert("L'impression a été bloquée par le navigateur. Autorisez les fenêtres contextuelles puis réessayez.");
    return;
  }
  win.document.open();
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de Distribution ${escapePrintHtml(reference)}</title>
    <style>
      @page { size: ${format}; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 12px; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; }
      h1 { font-size: 20px; margin:0 0 5px; } .meta { line-height:1.55; }
      .box { border:1px solid #aaa; padding:10px; margin-bottom:14px; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; }
      table { width:100%; border-collapse:collapse; margin-top:8px; }
      th { background:#eeeeee; font-weight:700; text-align:left; }
      th, td { border:1px solid #999; padding:7px; }
      td.num, th.num { text-align:right; } .empty { text-align:center; padding:20px; }
      .totals { margin-top:12px; display:flex; justify-content:flex-end; gap:24px; font-weight:700; }
      .signatures { margin-top:45px; display:grid; grid-template-columns:1fr 1fr; gap:50px; }
      .signature { border-top:1px solid #777; padding-top:6px; text-align:center; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="header"><div><h1>BON DE DISTRIBUTION N° ${escapePrintHtml(reference)}</h1><div class="meta">Date : ${escapePrintHtml(new Date(date).toLocaleString('fr-FR'))}</div></div><div class="meta"><strong>Statut :</strong> ${escapePrintHtml(bon.statut || 'En attente')}<br><strong>Enregistré par :</strong> ${escapePrintHtml(bon.createdBy || bon.responsable || '-')}</div></div>
    <div class="box"><div class="grid"><div><strong>Magasin récepteur :</strong> ${escapePrintHtml(bon.magasinRecepteur || bon.magasinDest || '-')}</div><div><strong>Responsable :</strong> ${escapePrintHtml(bon.responsable || '-')}</div></div></div>
    <table><thead><tr><th>#</th><th>Monture / Accessoire</th><th>Type</th><th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><span>Quantité totale : ${totalQte}</span><span>Valeur totale : ${totalValeur.toLocaleString('fr-FR')} F CFA</span></div>
    <div class="signatures"><div class="signature">Émetteur</div><div class="signature">Réception magasin</div></div>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>
    </body></html>`);
  win.document.close();
}
