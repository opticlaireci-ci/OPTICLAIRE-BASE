/**
 * Tableau du stock RÉEL de chaque magasin pour les articles de la vente en cours.
 *
 * Objectif : quand un article manque dans le magasin vendeur, le vendeur voit
 * immédiatement s'il est disponible ailleurs et peut demander un transfert, au
 * lieu de perdre la vente ou de téléphoner aux autres magasins.
 *
 * Les quantités proviennent des mouvements (bons de distribution, transferts,
 * retours, ventes) — jamais d'une saisie manuelle.
 */

import { useMemo } from 'react';
import {
  useStockTousMagasins,
  trouverProduitVente,
  quantiteDansMagasin,
  type LigneVenteStock,
} from '../utils/stockVente';
import type { VenteProduct } from '../utils/venteLookups';

interface Props {
  /** Lignes d'article de la vente en cours. */
  lignes: LigneVenteStock[];
  /** Index des produits vendables (avec le stock du magasin courant). */
  products: VenteProduct[];
  /** Magasin vendeur, mis en évidence dans le tableau. */
  magasinId: string;
}

function couleurQuantite(q: number): string {
  if (q <= 0) return '#ef4444';   // rupture
  if (q <= 5) return '#f59e0b';   // alerte
  return '#10b981';               // disponible
}

export function StockParMagasin({ lignes, products, magasinId }: Props) {
  const stocks = useStockTousMagasins();
  const courant = (magasinId || '').toUpperCase();

  // Seuls les articles GÉRÉS EN STOCK ont un intérêt ici : un verre ou un
  // service (stock null) n'est pas détenu en magasin.
  const articles = useMemo(() => {
    const vus = new Set<string>();
    const out: { prod: VenteProduct; designation: string }[] = [];
    for (const ligne of lignes) {
      const prod = trouverProduitVente(products, ligne);
      if (!prod || prod.stock == null) continue;
      if (vus.has(prod.produitId)) continue;
      vus.add(prod.produitId);
      out.push({ prod, designation: (ligne.designation || '').trim() || prod.label });
    }
    return out;
  }, [lignes, products]);

  if (articles.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-x-auto">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">
          Stock réel par magasin
        </span>
        <span className="ml-2 text-xs text-gray-500">
          issu des bons de distribution et de transfert
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">
              Article
            </th>
            {stocks.map(s => (
              <th
                key={s.magasinId}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{
                  color: s.magasinId === courant ? '#1d4ed8' : '#374151',
                  background: s.magasinId === courant ? '#eff6ff' : undefined,
                }}
                title={s.magasinId === courant ? 'Magasin vendeur' : undefined}
              >
                {s.label}
                {s.magasinId === courant && ' •'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {articles.map(({ prod, designation }) => (
            <tr key={prod.produitId} className="border-t border-gray-100">
              <td className="px-3 py-2 text-gray-800">{designation}</td>
              {stocks.map(s => {
                const q = quantiteDansMagasin(s, prod);
                return (
                  <td
                    key={s.magasinId}
                    className="px-3 py-2 text-center font-semibold"
                    style={{
                      color: couleurQuantite(q),
                      background: s.magasinId === courant ? '#eff6ff' : undefined,
                    }}
                  >
                    {q}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
