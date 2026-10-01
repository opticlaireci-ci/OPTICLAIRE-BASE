# Correction — Distribution → Stock magasin

Date : 2026-10-01

## Problème corrigé
Un bon de distribution pouvait être marqué « Validé » avant que le mouvement de stock soit confirmé sur le serveur. En cas de coupure réseau ou d'erreur Firestore, le magasin pouvait donc voir un bon validé alors que son stock n'était pas réellement alimenté.

## Corrections
- Le mouvement de stock est maintenant confirmé **avant** le passage du bon à « Validé ».
- En cas d'échec, le bon reste **En attente** et peut être réessayé.
- L'enregistrement d'une distribution est désormais fortement idempotent : un retry ou un double-clic ne redéduit pas le stock central.
- Les mêmes règles sont appliquées à tous les magasins, car elles sont centralisées dans `inventaireService.ts`.
- Le mécanisme existant de récupération des bons validés sans mouvement reste actif pour réparer les anciennes données.

## Fichiers modifiés
- `src/app/pages/magasin/gestion-stocks/BonDistributionMagasinPage.tsx`
- `src/app/services/inventaireService.ts`

## Validation
Le build n'a pas pu être exécuté dans cet environnement car les dépendances npm (`vite`) ne sont pas installées dans l'archive.
