/**
 * Totaux de vente — source unique de vérité pour toute l'application.
 *
 * Règle métier :
 *   TOTAL = montant brut avant remise
 *   TOTAL NET = TOTAL - remise
 *   Un bon d'assurance est un mode de règlement/prise en charge : il ne
 *   diminue JAMAIS le TOTAL ni le TOTAL NET.
 *
 * Les anciennes données peuvent contenir total_brut < total_net (notamment
 * sur des ventes avec bon d'assurance). Cette fonction répare ces incohérences
 * à la lecture et garantit l'invariant TOTAL >= TOTAL NET >= 0.
 */

const toNumber = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const roundMoney = (n: number): number => Math.max(0, Math.round(toNumber(n)));

export function getRemisePct(vente: any): number {
  const raw = vente?.recap?.remisePct ?? vente?.remisePct ?? 0;
  return Math.min(100, Math.max(0, toNumber(raw)));
}

export function calculerTotalLignesVente(vente: any): number {
  let total = 0;

  for (const v of Array.isArray(vente?.verres) ? vente.verres : []) {
    const ligne = toNumber(v?.totalVerres);
    if (ligne > 0) {
      total += ligne;
      continue;
    }
    const od = v?.oeilDroit || {};
    const og = v?.oeilGauche || {};
    total += toNumber(od.prix) * Math.max(1, toNumber(od.quantite) || 1);
    total += toNumber(og.prix) * Math.max(1, toNumber(og.quantite) || 1);
  }

  for (const a of Array.isArray(vente?.articles) ? vente.articles : []) {
    const ligne = toNumber(a?.total);
    total += ligne > 0
      ? ligne
      : toNumber(a?.prix) * Math.max(1, toNumber(a?.quantite) || 1);
  }

  return roundMoney(total);
}

export interface TotauxVenteNormalises {
  totalBrut: number;
  totalNet: number;
  remisePct: number;
  valeurRemise: number;
}

export function normaliserTotauxVente(vente: any): TotauxVenteNormalises {
  const lignes = calculerTotalLignesVente(vente);
  const brutEnregistre = roundMoney(vente?.total_brut ?? vente?.totalBrut);
  const netEnregistre = roundMoney(vente?.total_net ?? vente?.totalNet);
  const remisePct = getRemisePct(vente);
  const bonsAssurance = Array.isArray(vente?.bonsAssurance)
    ? vente.bonsAssurance
    : (Array.isArray(vente?.bons_assurance) ? vente.bons_assurance : []);
  const aDesBonsAssurance = bonsAssurance.length > 0;

  // SOURCE DE VÉRITÉ : lorsque les lignes de la vente (monture/articles +
  // verres) existent, leur somme détermine TOUJOURS le TOTAL brut — que la
  // vente ait un bon d'assurance ou non. Un bon d'assurance est un mode de
  // règlement / une prise en charge, jamais une ligne de vente : il ne doit
  // JAMAIS se substituer à la somme monture + verres.
  //
  // S'il n'y a aucune ligne exploitable, on conserve le total brut enregistré.
  // En tout dernier recours, on peut réutiliser l'ancien total net — mais
  // UNIQUEMENT si la vente n'a AUCUN bon d'assurance : c'est justement quand
  // un bon d'assurance est présent qu'un ancien enregistrement a pu écraser
  // total_net avec le montant pris en charge (ex: 100 000 F d'assurance alors
  // que la vente elle-même ne valait que 30 000 F, voire 0 F faute de lignes
  // saisies). Dans ce cas précis, on préfère 0 (qui invite à corriger la
  // fiche en y ajoutant la monture/les verres) plutôt que de risquer d'afficher
  // le montant de l'assurance comme s'il s'agissait du total de la vente.
  let totalBrut = lignes > 0
    ? lignes
    : (brutEnregistre > 0
        ? brutEnregistre
        : (aDesBonsAssurance ? 0 : netEnregistre));

  const valeurRemise = roundMoney(totalBrut * remisePct / 100);
  const totalNet = Math.max(0, totalBrut - valeurRemise);

  return { totalBrut, totalNet, remisePct, valeurRemise };
}

/** Retourne une copie de la vente avec des totaux cohérents. */
export function avecTotauxVenteNormalises<T extends Record<string, any>>(vente: T): T {
  const t = normaliserTotauxVente(vente);
  return {
    ...vente,
    total_brut: t.totalBrut,
    total_net: t.totalNet,
    totalBrut: t.totalBrut,
    totalNet: t.totalNet,
  } as T;
}
