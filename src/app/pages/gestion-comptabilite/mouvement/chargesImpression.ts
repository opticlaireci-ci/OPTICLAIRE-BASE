/**
 * Documents imprimés de l'onglet « Charges & salaires », présentés comme une
 * facture de vente : en-tête de l'enseigne (nom, adresse, téléphone, e-mail,
 * ville et date, logo), titre avec le mois et l'auteur, tableau, montant en
 * toutes lettres, « Signature & Cachet », pied de page.
 *  - tableau des charges : A4 paysage (comme le tableau Excel) ;
 *  - fiche salariale : A4 portrait.
 * Cases de même largeur et lignes de même hauteur. Imprimés à part, dans un
 * cadre isolé (voir afficherHtml).
 */
import { afficherHtml } from '../../../utils/inAppViewer';
import { TENANT } from '../../../config/tenant';
import { texteSur } from '../../../utils/pointsSemaine';
import { montantEnLettres } from '../../../utils/montantEnLettres';
import { salaireFinal, totauxCharges, totauxSalaires, type ChargesMois, type LigneCharge, type SalairesMois } from '../../../utils/chargesSalaires';
import { echapper as e, fmt } from './pointsCommun';

/** Informations du document (comme le cadre « N° / Date / Édité par » d'une facture). */
export interface InfosDocument {
  /** En-tête de l'enseigne (printHeaderHTML d'OPTICLAIRE : nom, coordonnées, logo). */
  entete: string;
  /** « OCTOBRE 2026 » */
  mois: string;
  editePar: string;
  /** Dernière modification du mois, si connue. */
  modifie?: string;
}

const STYLE = (paysage: boolean) => `
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { margin: ${paysage ? '9mm 11mm' : '10mm 13mm'}; size: A4 ${paysage ? 'landscape' : 'portrait'}; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; }
  .entete { zoom: ${paysage ? '.72' : '.8'}; }
  table.t { border-collapse: collapse; table-layout: fixed; width: 100%; }
  .t td, .t th { border: 1px solid #000; padding: 0 4px; height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .num { text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
  .titre-doc { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: ${paysage ? '10px' : '16px'}; }
  .titre-doc .titre-nom { font-size: 20px; font-weight: 700; color: #1a7a96; }
  .titre-doc .infos { text-align: right; font-size: 11.5px; line-height: 1.55; }
  .badge { display: inline-block; background: #e3f2fd; color: #1a7a96; border-radius: 4px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
  .lettres { margin-top: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
  .signature { margin-top: ${paysage ? '18px' : '30px'}; text-align: center; color: #111; }
  .pied { margin-top: ${paysage ? '14px' : '22px'}; border-top: 1px solid #ccc; padding-top: 6px; font-size: 11px; color: #888; display: flex; justify-content: space-between; break-inside: avoid; }
  .bloc-fin { break-inside: avoid; page-break-inside: avoid; }
`;

function cadre(paysage: boolean, titre: string, i: InfosDocument, corps: string, lettres: string, mentionPied: string): string {
  const ville = TENANT.siege?.ville || 'Abidjan';
  return `<style>${STYLE(paysage)}</style>
  <div class="entete">${i.entete}</div>
  <div class="titre-doc">
    <div class="titre-nom">${e(titre)}</div>
    <div class="infos">
      <div class="badge">MOIS : ${e(i.mois)}</div>
      <div style="margin-top:6px;">Édité par : <strong>${e(i.editePar)}</strong></div>
      <div>Le : <strong>${e(new Date().toLocaleDateString('fr-FR'))} à ${e(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</strong></div>
      ${i.modifie ? `<div>Dernière modification : <strong>${e(i.modifie)}</strong></div>` : ''}
    </div>
  </div>
  ${corps}
  <div class="bloc-fin">
    <div class="lettres">${lettres}</div>
    <div class="signature">Signature &amp; Cachet</div>
    <div class="pied"><div>${e(mentionPied)}</div><div>${e(TENANT.nomComplet)} — ${e(ville)}, Côte d'Ivoire</div></div>
  </div>`;
}

export function htmlCharges(c: ChargesMois, lignes: LigneCharge[], infos: InfosDocument): string {
  const tot = totauxCharges(c, lignes);
  const m = (v: number | undefined) => (typeof v === 'number' ? fmt(v) : '');
  const nbSous = c.colonnes.reduce((n, col) => n + (col.reference ? 2 : 1), 0);
  const tete1 = c.colonnes.map(col => `<th colspan="${col.reference ? 2 : 1}" class="grp" style="background:${col.couleur};color:${texteSur(col.couleur)}">${e(col.nom)}</th>`).join('');
  const tete2 = c.colonnes.map(col => (col.reference ? `<th class="st" style="background:${col.couleur}">REFERENCE</th>` : '') + `<th class="st" style="background:${col.couleur}">MONTANT</th>`).join('');
  const corps = lignes.map(l => `<tr><td class="of">${e(l.nom)}</td>${c.colonnes.map(col => {
    const v = c.cases[l.id]?.[col.id];
    return (col.reference ? `<td class="ref" style="background:${col.couleur}">${e(v?.ref || '')}</td>` : '') + `<td class="num" style="background:${col.couleur}">${m(v?.montant)}</td>`;
  }).join('')}</tr>`).join('');
  const total = `<tr class="tot"><td class="of">TOTAL</td>${c.colonnes.map(col => `<td colspan="${col.reference ? 2 : 1}" class="num" style="background:${col.couleur}">${fmt(tot.parColonne[col.id])}</td>`).join('')}</tr>`;
  const tableau = `<style>
      .c-of { width: 128px; }
      .grp { font-size: 12px; font-weight: 700; height: 22px !important; }
      .st { font-size: 8px; font-weight: 400; height: 16px !important; }
      .t td, .t th { height: 18px; }
      .of { font-weight: 700; text-align: center; font-size: 10.5px; background: #F2F2F2; }
      .ref { text-align: center; font-size: 9px; }
      .t td.num { font-size: 10.5px; }
      .tot td { height: 22px !important; border-top: 2px solid #000; font-size: 11.5px !important; }
      .charges-totales { margin: 10px 0 0 auto; border-collapse: collapse; }
      .charges-totales td { border: 1px solid #000; height: 28px; padding: 0 14px; }
      .charges-totales .l { background: #D9D9D9; font-weight: 700; font-size: 12px; }
      .charges-totales .v { background: #D9D9D9; font-size: 17px; font-weight: 800; text-align: center; min-width: 140px; }
    </style>
    <table class="t"><colgroup><col class="c-of">${'<col>'.repeat(nbSous)}</colgroup>
      <thead><tr><th rowspan="2" class="of" style="font-size:12px">OFFICINES</th>${tete1}</tr><tr>${tete2}</tr></thead>
      <tbody>${corps}${total}</tbody>
    </table>
    <table class="charges-totales"><tr><td class="l">CHARGES TOTALES</td><td class="v">${fmt(tot.total)} F CFA</td></tr></table>`;
  return cadre(true, 'CHARGES DU MOIS', infos, tableau, `Arrêtées les charges du mois à la somme de : ${montantEnLettres(tot.total)}`, 'Document interne.');
}

export function htmlSalaires(s: SalairesMois, infos: InfosDocument): string {
  const t = totauxSalaires(s);
  const corps = s.employes.map((x, i) => `<tr><td class="n">${i + 1}</td><td class="nom">${e(x.nom)}</td><td class="fn">${e(x.fonction)}</td><td class="num base">${fmt(x.salaireBase)}</td><td class="num emp">${x.emprunt ? fmt(x.emprunt) : ''}</td><td class="num fin"${salaireFinal(x) < 0 ? ' style="color:#C00000"' : ''}>${fmt(salaireFinal(x))}</td></tr>`).join('');
  const tableau = `<style>
      .t th { font-size: 10.5px; height: 22px; background: #D9D9D9; }
      .t td { height: 18.5px; }
      .n { text-align: center; font-size: 10px; background: #F2F2F2; }
      .nom { background: #D9D9D9; text-align: center; font-size: 11px; }
      .fn { text-align: center; font-size: 10.5px; }
      .t td.num { font-size: 11.5px; }
      .base, th.base { background: #00FF00; }
      .emp, th.emp { background: #F8CBAD; }
      .fin, th.fin { background: #92D050; }
      .tot td { height: 26px !important; border-top: 2px solid #000; font-size: 13px !important; }
      .tot .lib { background: #C00000; color: #fff; font-weight: 700; text-align: center; font-size: 13px; }
    </style>
    <table class="t">
      <colgroup><col style="width:5%"><col style="width:19%"><col style="width:21%"><col style="width:18.3%"><col style="width:18.3%"><col style="width:18.4%"></colgroup>
      <thead><tr><th>N°</th><th>NOM</th><th>FONCTION</th><th class="base">SALAIRE DE BASE</th><th class="emp">EMPRUNT</th><th class="fin">SALAIRE FINAL</th></tr></thead>
      <tbody>${corps}
        <tr class="tot"><td class="lib" colspan="3">TOTAL (${s.employes.length} employé${s.employes.length > 1 ? 's' : ''})</td><td class="num base">${fmt(t.base)}</td><td class="num emp">${fmt(t.emprunt)}</td><td class="num fin">${fmt(t.final)}</td></tr>
      </tbody>
    </table>`;
  return cadre(false, `FICHE SALARIALE ${TENANT.nom}`, infos, tableau, `Arrêtée la présente fiche (total des salaires finaux) à la somme de : ${montantEnLettres(t.final)}`, 'Document confidentiel.');
}

export function imprimerDocument(html: string, titre: string): void {
  afficherHtml(html, { titre: e(titre) });
}
