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

  // On ne laisse jamais un ancien total brut inférieur au net enregistré.
  // Lorsque le montant des lignes existe, il est également pris en compte.
  let totalBrut = Math.max(lignes, brutEnregistre, netEnregistre);

  // Si un ancien TOTAL NET a été conservé avec une remise, le brut minimal
  // compatible avec ce net est recalculé afin de ne pas inverser les totaux.
  if (remisePct > 0 && remisePct < 100 && netEnregistre > 0) {
    totalBrut = Math.max(totalBrut, roundMoney(netEnregistre / (1 - remisePct / 100)));
  }

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
