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
 *  2. Quand un article manque, l'administration voit OÙ il est disponible pour
 *     organiser un transfert. D'où `useStockTousMagasins`, qui expose la quantité
 *     réelle de chaque magasin (réservé à l'administration : une vendeuse ne
 *     reçoit que les lignes de stock de son magasin).
 *
 * La logique est ici, et non dans les pages, parce que DEUX écrans enregistrent
 * des ventes (Vente/Facture et Vente Flash) : dupliquer le contrôle garantissait
 * qu'un des deux finisse par diverger.
 */

import { useState, useEffect, useMemo } from 'react';
import { loadStocksParMagasin, readStockCache, lireStockMagasinFrais, type StockMagasin } from '../services/inventaireService';
import { rowsToStockMap, construireProduitsVente, lireCatalogueVenteLocal, type VenteProduct } from './venteLookups';
import { normaliser } from '../services/stockLedger';
import { getMagasins } from '../constants/magasins';
import { setVisibleInterval, PAGE_POLL_MS } from './visibleInterval';

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
  /**
   * Facture MODIFIÉE : ses articles déjà enregistrés. Leur sortie de stock est
   * déjà comptée : ils restent disponibles pour cette même facture. Avant, la
   * modification d'une facture portant la dernière monture était refusée.
   */
  dejaVendus: LigneVenteStock[] = [],
): RuptureStock[] {
  const ruptures: RuptureStock[] = [];
  const rendus = new Map<string, number>();
  for (const ligne of dejaVendus || []) {
    const prod = trouverProduitVente(products, ligne);
    if (!prod || prod.stock == null) continue;
    const q = Math.max(0, parseFloat(String(ligne.quantite ?? '1')) || 0);
    rendus.set(prod.produitId, (rendus.get(prod.produitId) || 0) + q);
  }

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
    const disponible = (prod.stock ?? 0) + (rendus.get(prod.produitId) || 0);
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
    `Le stock vient d'être relu dans la base. Si l'article est pourtant dans le ` +
    `magasin, vérifiez que son bon de distribution ou de transfert a bien été ` +
    `validé (reçu) par le magasin.\n\nSinon, demandez un bon de distribution ou de ` +
    `transfert pour réapprovisionner le magasin.`;
}

/** Résultat du contrôle final d'une vente. */
export interface ControleStockVente {
  ruptures: RuptureStock[];
  /**
   * true : le stock a été confirmé par la base à l'instant (ou n'avait pas
   * besoin de l'être). false : la base n'a pas répondu, les ruptures viennent du
   * dernier stock connu sur ce poste.
   */
  verifie: boolean;
}

/**
 * Contrôle final au moment d'enregistrer une vente.
 *
 * Le stock affiché à l'écran peut dater (rafraîchi toutes les 30 s, bon validé
 * il y a un instant, poste resté hors connexion…). Avant, une rupture sur ce
 * stock affiché bloquait la vente, même quand l'article était bien en stock.
 * Désormais, avant de refuser, le stock du magasin est RELU dans la base et
 * recontrôlé. Si la base ne répond pas, le résultat le dit (`verifie: false`)
 * pour que l'écran laisse le vendeur décider au lieu de bloquer sans preuve.
 */
export async function controlerStockVente(
  lignes: LigneVenteStock[],
  products: VenteProduct[],
  magasinId: string,
  dejaVendus: LigneVenteStock[] = [],
): Promise<ControleStockVente> {
  const ruptures = verifierStockVente(lignes, products, dejaVendus);
  if (ruptures.length === 0) return { ruptures, verifie: true };
  let frais: StockMagasin[];
  try {
    frais = await lireStockMagasinFrais(magasinId);
  } catch {
    return { ruptures, verifie: false };
  }
  const produitsFrais = construireProduitsVente(lireCatalogueVenteLocal(), frais);
  // Les lignes gardent l'article choisi à l'écran : on le retrouve dans la liste
  // recalculée par son identifiant, son code-barre ou son libellé.
  return { ruptures: verifierStockVente(lignes, produitsFrais, dejaVendus), verifie: true };
}

/** Message de confirmation quand le stock n'a pas pu être relu dans la base. */
export function messageStockNonVerifie(ruptures: RuptureStock[]): string {
  const details = ruptures
    .map(r => r.epuise
      ? `• ${r.designation} : 0 d'après le dernier stock connu`
      : `• ${r.designation} : ${r.disponible} d'après le dernier stock connu, ${r.demande} demandé(s)`)
    .join('\n');
  return `⚠️ Le stock n'a pas pu être vérifié dans la base (connexion).\n\n${details}\n\n` +
    `Si l'article est bien dans le magasin, cliquez sur OK pour enregistrer la vente ` +
    `quand même. Sinon, cliquez sur Annuler.`;
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
 * partitionne en mémoire : afficher les 9 magasins ne coûte donc pas plus cher
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
    const stopPolling = setVisibleInterval(charger, PAGE_POLL_MS);
    window.addEventListener('leclaire-sync-update', charger);
    window.addEventListener('leclaire-stock-updated', charger);
    window.addEventListener('storage', charger);
    return () => {
      annule = true;
      stopPolling();
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
  const variante = entree.quantites.get(prod.produitId)
    ?? (prod.labelComplet ? entree.quantites.get(normaliser(prod.labelComplet)) : undefined)
    ?? entree.quantites.get(prod.label.toLowerCase().trim())
    ?? entree.quantites.get(normaliser(prod.label))
    ?? (prod.codeBarre ? entree.quantites.get(prod.codeBarre.toLowerCase().trim()) : undefined)
    ?? 0;
  // + stock d'un ancien bon rangé au niveau du modèle (même calcul qu'à la vente).
  return variante + (prod.cleStockModele ? entree.quantites.get(prod.cleStockModele) ?? 0 : 0);
}
