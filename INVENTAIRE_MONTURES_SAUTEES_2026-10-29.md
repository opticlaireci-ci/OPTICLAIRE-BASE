# Inventaire : montures sautées, clôture le soir, impressions — 29/10/2026

Gestion Stocks → Inventaire.

## Continuer l'inventaire des montures sautées

- **Pas Inventorier** (sur la ligne de l'inventaire) affiche les montures et
  accessoires du magasin qui n'ont pas encore été comptés. Deux boutons :
  **Imprimer cette liste** et **Continuer l'inventaire**.
- **Continuer l'inventaire** (ou le crayon ✏️ de la ligne) ouvre « Modifier
  Inventaire ». En bas, le bloc **« Montures non inventoriées »** liste les
  montures sautées : saisir le **stock physique compté** (0 si absente) puis
  **Ajouter** (ou Entrée). La monture passe dans l'inventaire et disparaît du
  bloc. Une recherche permet de trouver vite une monture. On peut aussi
  toujours passer par le champ « Monture / Accessoire » du haut.
- **Mettre à jour** enregistre : le stock du magasin prend le stock physique
  compté de chaque monture ajoutée, **à l'heure où elle a été comptée** — une
  vente faite entre le début de l'inventaire et ce comptage n'est pas retirée
  deux fois.
- Correction : en « Modifier Inventaire », le stock du magasin ne se chargeait
  pas (identifiant du magasin en majuscules), la liste des montures était donc
  vide ; la date de l'inventaire s'affichait vide et le magasin par son code.

## Clôture une fois la journée passée

- Un inventaire se modifie **seulement le jour où il a été fait** (jusqu'à
  minuit). Le lendemain, la ligne affiche **🔒 Clôturé** à la place du crayon,
  et « Pas Inventorier » indique « Inventaire clôturé (journée passée) » sans
  bouton « Continuer ». Il reste consultable et imprimable.
- Un enregistrement commencé avant minuit et validé après est refusé avec un
  message.
- La suppression d'un inventaire (corbeille) n'est pas concernée.

## Impressions

- Bouton **imprimante** de chaque ligne : choisir **Montures inventoriées** ou
  **Montures non inventoriées**.
- Aussi dans « Modifier Inventaire » (deux boutons en haut, d'après la saisie
  en cours) et dans « Pas Inventorier » (Imprimer cette liste).
- Montures inventoriées : code barre, monture, stock théorique, stock
  physique, écart, totaux. Montures non inventoriées : code barre, monture,
  type, stock théorique, et une colonne vide **« Stock physique compté »**
  pour noter le comptage à la main.

## Technique

- `src/app/utils/inventaireOutils.ts` : règle du jour (`inventaireModifiable`),
  montures non inventoriées, documents imprimés (textes neutralisés).
- `src/app/services/inventaireService.ts` : `enregistrerInventaire` accepte
  une heure de comptage par article (`date`), utilisée pour l'ajustement.
- `src/app/pages/gestion-stocks/InventairePage.tsx` : bloc des montures
  sautées, heure de comptage (`compteLe`) des articles ajoutés en
  modification, verrou, menus et boutons d'impression.
- Aucun script SQL à exécuter.

## Vérifications effectuées

- 18 tests (règle du jour : avant / après minuit, sans date de création ;
  montures non inventoriées ; documents ; monture sautée comptée après une
  vente : stock juste, alors que l'ancien calcul retirait la vente deux fois) ;
  tests du stock précédents (34 + 47) toujours réussis.
- Navigateur avec la politique de sécurité du site : 17/17 (inventaire
  d'hier clôturé, montures sautées, impression, reprise et enregistrement avec
  heure de comptage, stock ajusté, inventaire d'hier imprimable mais non
  modifiable). Sur l'ancienne version : ni clôture, ni bouton « Continuer ».
