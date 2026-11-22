/**
 * Documents imprimés des points (mêmes tableaux et couleurs que les points
 * papier). Imprimés à part, dans un cadre isolé (voir afficherHtml) : rien
 * d'autre de la page n'apparaît et aucun texte saisi ne peut s'exécuter.
 */
import { afficherHtml } from '../../../utils/inAppViewer';
import { JOURS_POINT, COULEURS_COLONNES, texteSur, type VueHebdo, type VueMobile } from '../../../utils/pointsSemaine';
import { echapper as e, fmt } from './pointsCommun';

const STYLE_COMMUN = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; color: #000; margin: 0; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 8px; letter-spacing: .3px; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 2px 4px; }
  .num { text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pied { margin-top: 10px; font-size: 9px; color: #555; text-align: right; }
`;

/**
 * Point hebdomadaire : A4 portrait, 4 officines par rangée. Seules les
 * officines qui ont des recettes dans la semaine sont imprimées (une officine
 * à 0 tous les jours n'apparaît pas sur la page ; elle reste à l'écran).
 */
export function htmlPointHebdo(vue: VueHebdo, titre: string, pied: string): string {
  const bloc = (b: VueHebdo['blocs'][number]) => `
    <table class="bloc"><colgroup><col style="width:44%"><col style="width:56%"></colgroup>
      <tr><th colspan="2" class="titre"${b.bloc.nom.length > 26 ? ' style="font-size:8.5px"' : b.bloc.nom.length > 22 ? ' style="font-size:9.5px"' : ''}>${e(b.bloc.nom)}</th></tr>
      <tr><th class="jour-t">JOURS</th><th class="rec-t">RECETTES</th></tr>
      ${JOURS_POINT.map((j, i) => `<tr><td class="jour">${j}</td><td class="num rec">${fmt(b.cases[i].valeur)}</td></tr>`).join('')}
      <tr><td class="total">TOTAL</td><td class="num rec total-v">${fmt(b.total)}</td></tr>
    </table>`;
  const avecDonnees = vue.blocs.filter(b => b.cases.some(c => c.valeur !== 0));
  const rangees: string[] = [];
  if (!avecDonnees.length) rangees.push('<tr><td class="case aucune" colspan="4">Aucune recette enregistrée pour cette semaine.</td></tr>');
  for (let i = 0; i < avecDonnees.length; i += 4) {
    const cellules = avecDonnees.slice(i, i + 4).map(b => `<td class="case case-of">${bloc(b)}</td>`);
    while (cellules.length < 4) cellules.push('<td class="case case-of"></td>');
    rangees.push(`<tr>${cellules.join('')}</tr>`);
  }
  const recap = `
    <table class="recap"><colgroup><col style="width:66%"><col style="width:34%"></colgroup>
      <tr><th colspan="2" class="recap-t">RECAPITULATIF DES ENTREES</th></tr>
      ${vue.recap.map(r => `<tr><td class="lib">${e(r.ligne.libelle)}</td><td class="num">${fmt(r.valeur)}</td></tr>`).join('')}
      <tr><td class="vide" colspan="2"></td></tr>
      <tr><td class="lib depose-l">MONTANT DEPOSE</td><td class="num depose">${fmt(vue.montantDepose)}</td></tr>
    </table>`;
  const normales = vue.assurances.filter(a => !a.colonne.sousTraitance);
  const sous = vue.assurances.filter(a => a.colonne.sousTraitance);
  const nbLignes = Math.max(1, ...vue.assurances.map(a => a.lignes.length));
  const colonne = (a: VueHebdo['assurances'][number], st: boolean) => {
    const lignes: string[] = a.lignes.map(l => `<tr><td class="num">${fmt(l.valeur)}</td></tr>`);
    while (lignes.length < nbLignes) lignes.push('<tr><td class="num"></td></tr>');
    return `<td class="case case-ass"><table class="ass">
      <tr><th class="${st ? 'st-n' : 'ass-n'}">${e(a.colonne.nom)}</th></tr>
      ${lignes.join('')}
      ${st ? '' : `<tr><td class="num ass-tot">${fmt(a.total)}</td></tr>`}
    </table></td>`;
  };
  const assurances = `
    <table class="grille-ass"><tr>
      ${normales.length ? `<td class="case" colspan="${normales.length}"><div class="bandeau ass-b">RECETTE ASSURANCE</div></td>` : ''}
      ${sous.length ? `<td class="case" colspan="${sous.length}"><div class="bandeau st-b">SOUS-TRAITANCE</div></td>` : ''}
    </tr><tr>
      ${normales.map(a => colonne(a, false)).join('')}${sous.map(a => colonne(a, true)).join('')}
    </tr></table>`;
  return `<style>${STYLE_COMMUN}
    @page { size: A4 portrait; margin: 10mm; }
    .grille { width: 100%; border: 0; border-spacing: 10px 8px; border-collapse: separate; table-layout: fixed; }
    .case { border: 0; padding: 0; vertical-align: top; }
    .case-of { width: 25%; }
    .bloc, .recap, .ass { table-layout: fixed; }
    .bloc td, .bloc th, .recap td, .ass td, .ass th { height: 21px; padding-top: 0; padding-bottom: 0; white-space: nowrap; overflow: hidden; }
    .bloc .titre { height: 24px; }
    .aucune { text-align: center; font-size: 12px; color: #555; padding: 20px 0; }
    .bloc { width: 100%; border: 2px solid #000; }
    .bloc .titre { font-size: 11px; background: #fff; }
    .jour-t, .jour { font-size: 9px; text-align: center; }
    .jour-t, .rec-t { font-size: 9px; }
    .rec-t, .rec { background: #8EA9DB; }
    .rec { font-size: 12px; }
    .total { font-weight: 700; font-size: 11px; text-align: center; border-top: 2px solid #000; }
    .total-v { font-size: 13px; border-top: 2px solid #000; }
    .bas { width: 100%; border: 0; margin-top: 14px; }
    .bas > tbody > tr > td { border: 0; vertical-align: top; padding: 0 10px; }
    .recap { width: 100%; }
    .recap-t { background: #D6DCE4; border: 0; font-size: 12px; }
    .recap .lib { background: #D0CECE; font-weight: 700; font-size: 10px; text-align: center; }
    .recap .num { font-size: 12px; }
    .recap .vide { height: 14px; border-left: 0; border-right: 0; }
    .depose-l { font-size: 13px !important; }
    .depose { background: #00B0F0; font-size: 15px !important; }
    .grille-ass { border: 0; border-spacing: 8px 0; border-collapse: separate; table-layout: fixed; }
    .case-ass { width: 92px; }
    .bandeau { font-weight: 700; font-size: 11px; text-align: center; padding: 3px 6px; }
    .ass-b { background: #4472C4; color: #000; }
    .st-b { background: #ED7D31; color: #000; font-size: 9px; }
    .ass { width: 100%; }
    .ass-n { background: #E7E6E6; font-size: 10px; }
    .st-n { font-size: 10px; }
    .ass .num { font-size: 12px; }
    .ass-tot { background: #2F5597; color: #fff; }
  </style>
  <h1>${e(titre)}</h1>
  <table class="grille">${rangees.join('')}</table>
  <table class="bas"><tr><td style="width:50%">${recap}</td><td>${assurances}</td></tr></table>
  <div class="pied">${e(pied)}</div>`;
}

/** Point Mobile Money : A4 paysage, tableau global puis un tableau par moyen. */
export function htmlPointMobile(vue: VueMobile, titre: string, pied: string): string {
  const coul = (i: number) => COULEURS_COLONNES[i % COULEURS_COLONNES.length];
  const tete = (fond: string, texte: string) => `<th style="background:${fond};color:${texteSur(fond)}">${e(texte)}</th>`;
  const cols = (n: number) => `<colgroup><col class="c-jour">${'<col>'.repeat(n)}</colgroup>`;
  const global = `
    <table class="t">${cols(vue.colonnes.length + 1 + vue.moyens.length)}
      <tr>${tete('#D9D9D9', 'JOUR')}${vue.colonnes.map((c, i) => tete(coul(i), c.nom)).join('')}${tete('#00B0F0', 'TOTAL')}${vue.moyens.map(m => tete(m.moyen.couleur, m.moyen.nom)).join('')}</tr>
      ${vue.jours.map(j => `<tr><td class="jour">${JOURS_POINT[j]}</td>${vue.colonnes.map((_, ci) => `<td class="num" style="background:${coul(ci)}">${fmt(vue.global[ci][j])}</td>`).join('')}<td class="num" style="background:#00B0F0">${fmt(vue.totauxJour[j])}</td>${vue.moyens.map(m => `<td class="num" style="background:${m.moyen.couleur};color:${texteSur(m.moyen.couleur)}">${fmt(m.totauxJour[j])}</td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td class="jour">TOTAL</td>${vue.totauxColonne.map(t => `<td class="num">${fmt(t)}</td>`).join('')}<td class="num">${fmt(vue.total)}</td>${vue.moyens.map(m => `<td class="num">${fmt(m.total)}</td>`).join('')}</tr>
    </table>`;
  const parMoyen = vue.moyens.map(m => `
    <div class="moyen">
      <div class="bandeau" style="background:${m.moyen.couleur};color:${texteSur(m.moyen.couleur)}">${e(m.moyen.nom)}</div>
      <table class="t">${cols(vue.colonnes.length + 1)}
        <tr>${tete('#D9D9D9', 'JOUR')}${vue.colonnes.map((c, i) => tete(coul(i), c.nom)).join('')}${tete(m.moyen.couleur, 'TOTAL')}</tr>
        ${vue.jours.map(j => `<tr><td class="jour">${JOURS_POINT[j]}</td>${m.colonnes.map((c, ci) => `<td class="num" style="background:${coul(ci)}">${fmt(c.cases[j].valeur)}</td>`).join('')}<td class="num" style="background:${m.moyen.couleur};color:${texteSur(m.moyen.couleur)}">${fmt(m.totauxJour[j])}</td></tr>`).join('')}
        <tr class="tot"><td class="jour">TOTAL</td>${m.colonnes.map(c => `<td class="num">${fmt(c.total)}</td>`).join('')}<td class="num">${fmt(m.total)}</td></tr>
      </table>
    </div>`).join('');
  return `<style>${STYLE_COMMUN}
    @page { size: A4 landscape; margin: 8mm; }
    .t { width: 100%; table-layout: fixed; }
    .t .c-jour { width: 68px; }
    .t th { font-size: 8.5px; text-align: center; font-weight: 400; height: 24px; line-height: 1.1; overflow-wrap: anywhere; }
    .t td { font-size: 10.5px; height: 19px; padding-top: 0; padding-bottom: 0; white-space: nowrap; overflow: hidden; }
    .jour { font-size: 9px; text-align: center; background: #D9D9D9; }
    .tot td { font-size: 12px; font-weight: 700; border-top: 2px solid #000; }
    .tot .jour { font-size: 11px; }
    .moyen { margin-top: 12px; page-break-inside: avoid; break-inside: avoid; }
    .bandeau { font-weight: 700; font-size: 11px; padding: 3px 6px; border: 1px solid #000; border-bottom: 0; }
  </style>
  <h1>${e(titre)}</h1>
  ${global}
  ${parMoyen}
  <div class="pied">${e(pied)}</div>`;
}

export function imprimer(html: string, titre: string): void {
  afficherHtml(html, { titre });
}
