/**
 * CONTRÔLE DE STOCK À LA VENTE + VISIBILITÉ MULTI-MAGASINS.
 *
 * Le stock d'un magasin n'est jamais saisi à la main : il est AGRÉGÉ depuis les
 * mouvements (`mouvements_stock`), c'est-à-dire les bons de distribution reçus,
 * les bons de transfert (entrée côté destination, sortie côté source), les
 * retours et les ventes déjà enregistrées — cf. `inventaireService`.
 *
 * Deux règles y sont implémentées :
 *
 *  1. Un article GÉRÉ EN STOCK (monture / accessoire) dont la quantité disponible
 *     dans le magasin vendeur est à zéro — ou inférieure à la quantité demandée —
 *     BLOQUE l'enregistrement de la vente. Sans cela, on vend un article qui n'a
 *     jamais été distribué au magasin, et le stock part en négatif.
 *     Les verres et les services ne sont pas gérés en stock (`stock === null`) :
 *     ils ne sont jamais bloqués.
 *
 *  2. Quand un article manque, le vendeur doit voir OÙ il est disponible pour
 *     demander un transfert. D'où `useStockTousMagasins`, qui expose la quantité
 *     réelle de chaque magasin.
 *
 * La logique est ici, et non dans les pages, parce que DEUX écrans enregistrent
 * des ventes (Vente/Facture et Vente Flash) : dupliquer le contrôle garantissait
 * qu'un des deux finisse par diverger.
 */

import { useState, useEffect, useMemo } from 'react';
import { loadStocksParMagasin, readStockCache, type StockMagasin } from '../services/inventaireService';
import { rowsToStockMap, type VenteProduct } from './venteLookups';
import { getMagasins } from '../constants/magasins';

/**
 * Forme minimale commune aux lignes d'article des deux écrans de vente. Chaque
 * page a sa propre interface (`ArticleLigne`), avec des champs supplémentaires
 * qui ne concernent pas le stock.
 */
export interface LigneVenteStock {
  produitId?: string;
  codeBarre?: string;
  designation?: string;
  quantite?: string | number;
}

/**
 * Retrouve le produit catalogue correspondant à une ligne de vente.
 * Trois pistes, de la plus fiable à la plus souple : l'id retenu quand le
 * vendeur a choisi dans la liste, le code-barre scanné, puis le libellé saisi.
 */
export function trouverProduitVente(
  products: VenteProduct[],
  ligne: LigneVenteStock,
): VenteProduct | null {
  const designation = (ligne.designation || '').trim().toLowerCase();
  const codeBarre = (ligne.codeBarre || '').trim().toLowerCase();
  return (
    (ligne.produitId ? products.find(p => p.produitId === ligne.produitId) : null) ??
    (codeBarre ? products.find(p => p.codeBarre && p.codeBarre.toLowerCase() === codeBarre) : null) ??
    (designation ? products.find(p => p.label.toLowerCase() === designation) : null) ??
    null
  );
}

/** Une insuffisance de stock détectée sur une ligne de vente. */
export interface RuptureStock {
  designation: string;
  disponible: number;
  demande: number;
  /** true si le magasin n'a AUCUNE unité (jamais distribué, ou tout vendu). */
  epuise: boolean;
}

/**
 * Liste les lignes qui ne peuvent pas être vendues faute de stock.
 * Un tableau vide signifie « vente autorisée ».
 *
 * Une ligne saisie librement (absente du catalogue) n'est pas bloquée : elle
 * n'est pas gérée en stock, et refuser une prestation ponctuelle empêcherait de
 * facturer. Seuls les articles catalogués monture/accessoire sont contrôlés.
 */
export function verifierStockVente(
  lignes: LigneVenteStock[],
  products: VenteProduct[],
): RuptureStock[] {
  const ruptures: RuptureStock[] = [];

  // Une même monture peut figurer sur PLUSIEURS lignes (œil droit / œil gauche,
  // ou deux paires) : on cumule les quantités par produit avant de comparer,
  // sinon 2 lignes de 1 passent alors qu'il ne reste qu'une seule unité.
  const demandes = new Map<string, { prod: VenteProduct; designation: string; total: number }>();

  for (const ligne of lignes) {
    const prod = trouverProduitVente(products, ligne);
    if (!prod || prod.stock == null) continue;
    const demande = Math.max(1, parseInt(String(ligne.quantite ?? '1'), 10) || 1);
    const cumul = demandes.get(prod.produitId);
    if (cumul) cumul.total += demande;
    else demandes.set(prod.produitId, {
      prod,
      designation: (ligne.designation || '').trim() || prod.label,
      total: demande,
    });
  }

  for (const { prod, designation, total } of demandes.values()) {
    const disponible = prod.stock ?? 0;
    if (disponible <= 0) {
      ruptures.push({ designation, disponible: 0, demande: total, epuise: true });
    } else if (disponible < total) {
      ruptures.push({ designation, disponible, demande: total, epuise: false });
    }
  }

  return ruptures;
}

/** Message d'alerte prêt à afficher pour un refus de vente. */
export function messageRuptures(ruptures: RuptureStock[]): string {
  const details = ruptures
    .map(r => r.epuise
      ? `• ${r.designation} : stock épuisé dans ce magasin`
      : `• ${r.designation} : ${r.disponible} en stock, ${r.demande} demandé(s)`)
    .join('\n');
  return `❌ Vente impossible — stock insuffisant dans ce magasin :\n\n${details}\n\n` +
    `Consultez le stock des autres magasins affiché sous les articles, puis ` +
    `effectuez un bon de transfert ou de distribution pour réapprovisionner.`;
}

// ── Stock réel de TOUS les magasins ──────────────────────────────────────────

export interface StockMagasinVente {
  magasinId: string;
  label: string;
  /** Quantités indexées par produitId ET par désignation en minuscules. */
  quantites: Map<string, number>;
}

/**
 * Stock réel de chaque magasin de l'enseigne.
 *
 * `loadStocksParMagasin` ne télécharge `mouvements_stock` QU'UNE fois puis
 * partitionne en mémoire : afficher les 7 magasins ne coûte donc pas plus cher
 * qu'en afficher un seul. L'affichage démarre sur le cache localStorage (aucune
 * attente réseau) et se rafraîchit ensuite.
 */
export function useStockTousMagasins(): StockMagasinVente[] {
  // Les mouvements stockent le magasin en MAJUSCULES (`magasin_destination`),
  // alors que les ids de configuration sont en minuscules : sans cette
  // normalisation, aucune ligne ne correspondrait et tout paraîtrait à zéro.
  const magasins = useMemo(
    () => getMagasins().map(m => ({ id: m.id.toUpperCase(), label: m.label })),
    [],
  );

  const seed = () => magasins.map(m => ({
    magasinId: m.id,
    label: m.label,
    quantites: rowsToStockMap(readStockCache(m.id)),
  }));

  const [stocks, setStocks] = useState<StockMagasinVente[]>(seed);

  useEffect(() => {
    let annule = false;
    const ids = magasins.map(m => m.id);
    if (ids.length === 0) return;

    setStocks(seed());

    const charger = async () => {
      try {
        const parMagasin: Record<string, StockMagasin[]> = await loadStocksParMagasin(ids);
        if (annule) return;
        setStocks(magasins.map(m => ({
          magasinId: m.id,
          label: m.label,
          quantites: rowsToStockMap(parMagasin[m.id] || []),
        })));
      } catch {
        /* on conserve l'affichage précédent (cache) */
      }
    };
    charger();

    // Même cadence et mêmes déclencheurs que `useStockMagasin`, pour que les deux
    // affichages (magasin courant / autres magasins) ne se contredisent pas.
    const interval = setInterval(charger, 8000);
    window.addEventListener('leclaire-sync-update', charger);
    window.addEventListener('leclaire-stock-updated', charger);
    window.addEventListener('storage', charger);
    return () => {
      annule = true;
      clearInterval(interval);
      window.removeEventListener('leclaire-sync-update', charger);
      window.removeEventListener('leclaire-stock-updated', charger);
      window.removeEventListener('storage', charger);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasins]);

  return stocks;
}

/**
 * Quantité d'un produit dans un magasin donné. Un produit absent de l'index vaut
 * 0 : `loadStockMagasin` élague les lignes retombées à zéro, donc « absent » et
 * « épuisé » désignent la même réalité côté vente.
 */
export function quantiteDansMagasin(entree: StockMagasinVente, prod: VenteProduct): number {
  return (
    entree.quantites.get(prod.produitId)
    ?? entree.quantites.get(prod.label.toLowerCase().trim())
    ?? (prod.codeBarre ? entree.quantites.get(prod.codeBarre.toLowerCase().trim()) : undefined)
    ?? 0
  );
}
