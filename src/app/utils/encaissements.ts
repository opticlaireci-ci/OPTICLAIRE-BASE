import { estPaiementAssurance } from './venteTotals';

/**
 * RÈGLEMENTS DU JOUR = argent réellement encaissé ce jour-là.
 *
 * Même règle que les Mouvements de caisse et le Récap hebdomadaire :
 *   • l'acompte versé à l'enregistrement d'une vente faite ce jour-là ;
 *   • + tous les règlements PAYÉS ce jour-là, quelle que soit la date de la
 *     facture (un client qui vient solder une ancienne facture, y compris un
 *     ancien dossier importé, compte le jour où il paie) ;
 *   • jamais la part assurance (mode de paiement « Assurance ») : ce n'est pas
 *     de l'argent encaissé par le magasin.
 * Le chiffre d'affaires, lui, reste rattaché à la date de la facture.
 */
export function encaissementsDuJour(ventes: any[], reglements: any[], jour: Date): number {
  const memeJour = (s: any) => {
    const d = new Date(s || 0);
    return !isNaN(d.getTime()) && d.getFullYear() === jour.getFullYear()
      && d.getMonth() === jour.getMonth() && d.getDate() === jour.getDate();
  };
  let total = 0;
  for (const v of ventes) {
    if ((v?.type || 'vente') !== 'vente' || !memeJour(v?.date)) continue;
    if (estPaiementAssurance(v?.recap?.modePaiement)) continue;
    total += Number(v?.recap?.acompte ?? 0) || 0;
  }
  for (const r of reglements) {
    if (!memeJour(r?.date)) continue;
    if (estPaiementAssurance(r?.mode_paiement ?? r?.modePaiement)) continue;
    // Ligne technique des anciennes importations (acompte déjà dans la vente).
    if (String(r?.details || '').trim().toLowerCase() === 'acompte importé') continue;
    total += Number(r?.montant) || 0;
  }
  return total;
}
