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
