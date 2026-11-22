/**
 * Montant en toutes lettres (français), comme sur les factures de vente :
 * 6 990 000 → « SIX MILLIONS NEUF CENT QUATRE-VINGT-DIX MILLE FRANCS CFA ».
 * (Même règle que la facture de vente, VenteFacturePage.)
 */
export function montantEnLettres(nombre: number): string {
  nombre = Math.round(nombre || 0);
  if (nombre === 0) return 'ZÉRO FRANC CFA';
  if (nombre < 0) return `MOINS ${montantEnLettres(-nombre)}`;
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
  const milliards = Math.floor(nombre / 1000000000);
  const millions = Math.floor((nombre % 1000000000) / 1000000);
  const milliers = Math.floor((nombre % 1000000) / 1000);
  const reste = nombre % 1000;
  if (milliards > 0) mots += (milliards > 1 ? centaines(milliards) + ' milliards' : 'un milliard') + ' ';
  if (millions > 0) mots += (millions > 1 ? centaines(millions) + ' millions' : 'un million') + ' ';
  if (milliers > 0) mots += (milliers > 1 ? centaines(milliers) + ' ' : '') + 'mille ';
  if (reste > 0) mots += centaines(reste);
  return (mots.trim() + ' FRANCS CFA').toUpperCase();
}
