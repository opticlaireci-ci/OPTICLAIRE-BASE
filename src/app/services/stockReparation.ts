import { logger } from '../utils/logger';
import { chargerVentes } from './ventesService';
import { reparerSortiesVentes, recalculerStockMagasin } from './inventaireService';

/**
 * Une fois par session et par magasin : les ventes déjà enregistrées SANS
 * sortie de stock (devis converti en facture avec une ancienne version,
 * coupure réseau…) reçoivent leur sortie manquante. Sans risque : jamais deux
 * fois la même vente, et le stock ne descend jamais sous zéro.
 */
export async function reparerStockMagasinSiBesoin(magasinId: string): Promise<void> {
  const mag = String(magasinId || '').trim();
  if (!mag) return;
  const cle = `opticlaire_reparation_stock_${mag.toUpperCase()}`;
  try { if (sessionStorage.getItem(cle)) return; sessionStorage.setItem(cle, String(Date.now())); } catch { /* ignore */ }
  try {
    const ventes = await chargerVentes(mag.toLowerCase());
    const reparees = await reparerSortiesVentes(mag, ventes);
    if (reparees > 0) await recalculerStockMagasin(mag);
  } catch (err) {
    try { sessionStorage.removeItem(cle); } catch { /* ignore */ }
    logger.warn('Réparation des sorties de stock impossible:', err);
  }
}
