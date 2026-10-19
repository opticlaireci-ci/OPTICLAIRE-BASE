# Stock réel des magasins — correction définitive (19/10/2026)

## Ce que fait chaque opération sur le stock d'un magasin

| Opération | Magasin concerné | Stock central |
|---|---|---|
| **Vente** (facture, vente flash, devis converti en facture) | le stock de la monture / de l'accessoire vendu **diminue** | inchangé |
| **Facture supprimée** | ce que la vente avait retiré **revient** (une seule fois) | inchangé |
| **Facture modifiée** | la nouvelle quantité remplace l'ancienne ; un article retiré de la facture **revient** | inchangé |
| **Bon de distribution** (validé par le magasin) | le stock de la monture distribuée **augmente** | diminue |
| **Bon de retour** (traité par le magasin ou validé par l'administration) | le stock de la monture retournée **diminue** | augmente |
| **Bon de transfert** (validé) | **diminue** chez le magasin qui transfère, **augmente** chez le magasin qui reçoit | inchangé |
| **Inventaire** | chaque article compté **prend la quantité physique** trouvée | inchangé |

Le stock d'un magasin n'est jamais saisi à la main : il est recalculé, dans
l'ordre des dates, à partir de ces opérations (`src/app/services/stockLedger.ts`).

## Pourquoi la vente ne diminuait pas toujours le stock

1. **Deux noms pour le même article.** Le bon de distribution rangeait la
   monture sous « MARQUE - RÉF COULEUR TAILLE » ou sous son identifiant, la
   vente sous « MARQUE - RÉF » ou sous l'identifiant d'une autre variante :
   la vente tombait sur une autre ligne et le stock réel ne bougeait pas.
   → Chaque mouvement est désormais rattaché à **l'article du catalogue** (par
   son identifiant, son code-barre ou l'une de ses désignations).
2. **Mauvaise variante choisie à la vente** (même modèle, autre couleur) :
   → la sortie est prise sur une variante **du même modèle** présente dans le
   magasin ; la liste de vente propose en priorité la variante en stock.
3. **Devis converti en facture** : aucune sortie de stock n'était écrite.
   → corrigé ; et les factures déjà enregistrées sans sortie sont **réparées
   automatiquement** à l'ouverture de l'état du stock ou du tableau de bord du
   magasin (jamais deux fois ; les ventes importées de l'ancien logiciel et
   les devis sont ignorés).
4. **Stock négatif reporté** : une vente d'un article jamais distribué
   « mangeait » la distribution suivante. → une sortie ne descend plus jamais
   sous zéro.
5. **Même article sur deux lignes** d'une facture ou d'un bon : la seconde
   ligne écrasait la première. → les quantités sont additionnées.

## Distributions qui disparaissaient de la liste

- Chaque page enregistrait **toute la liste** des bons dans un seul
  enregistrement partagé : quand un magasin validait son bon, il réécrivait la
  liste avec ses seuls bons et les distributions des autres magasins
  disparaissaient de la liste de l'administration.
  → Les bons de distribution, de transfert et de retour sont lus et écrits
  **un par un** dans la table `bons` (`src/app/hooks/useBons.ts`) : plus rien
  ne peut être écrasé. Les bons qui n'existaient que dans l'ancienne liste
  sont remis automatiquement dans la table à l'ouverture de la page de
  l'administration.
- **Numéro « 00001 » par défaut** : un deuxième bon portant le même numéro
  était pris pour un doublon et son stock ignoré. → le numéro suivant est
  proposé automatiquement, un numéro déjà utilisé est refusé, et le stock est
  rattaché à l'identifiant unique du bon (plus à son numéro).
- La liste est triée **du plus récent au plus ancien**, avec une vraie
  pagination (20 bons par page, total affiché) et une recherche par numéro
  **ou par magasin**. Les anciens boutons « 1 2 3 » ne faisaient rien.

## Inventaire

À l'enregistrement d'un inventaire, chaque article compté prend, à la date de
l'inventaire, **la quantité physique** comptée dans le magasin (vitrine +
réserve additionnées si l'article est compté sur deux lignes). Les ventes et
bons enregistrés **après** l'inventaire s'appliquent ensuite normalement.

- Inventaire **modifié** : les nouvelles quantités remplacent les anciennes ;
  un article retiré de l'inventaire n'est plus ajusté.
- Inventaire **supprimé** : ses ajustements sont annulés (le stock redevient
  celui calculé par les opérations).

## Vérifications effectuées

- 34 tests du calcul (`stockLedger` + `inventaireService`) : deux bons
  « 00001 », double clic, vente sur la mauvaise variante, vente sous la
  désignation ou par code-barre, vente sans stock, facture supprimée deux fois,
  transfert, retour validé par l'administration sans mouvement puis par le
  magasin, inventaire (création, vente après, modification, suppression,
  inventaire ancien), lignes en double, facture modifiée, anciens bons au
  niveau du modèle, réparation des ventes sans sortie, liste des bons, dates
  sans heure.
- 16 contrôles dans le navigateur : réception d'un bon par un magasin
  (mouvement écrit, stock central diminué, bon « Validé »), état du stock du
  magasin, liste de l'administration complète (y compris l'ancienne liste),
  numéro suivant proposé, 20 bons par page, recherche par magasin.

Aucune modification de la base n'est nécessaire (mêmes tables :
`mouvements_stock`, `bons`, `inventaires`).
