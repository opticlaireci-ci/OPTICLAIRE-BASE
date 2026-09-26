# Correction — Récapitulatif hebdomadaire des entrées

## Problème
Les sorties étaient correctement reprises comme dépenses dans le Récapitulatif Hebdomadaire, mais certaines entrées enregistrées dans la comptabilité générale n'étaient pas reprises comme recettes.

## Correction
Le calcul du Récapitulatif Hebdomadaire normalise désormais les types de mouvement (`Entrée`/`entrée`/`entree` et `Sortie`/`sortie`) et prend en compte les deux sources :
- `leclaire_mouvements_caisse`
- `leclaire_mouvements`

Les mouvements de la comptabilité générale sont associés au magasin via son identifiant ou son libellé, puis répartis selon leur date dans la semaine sélectionnée.

Les sorties continuent d'être comptées comme dépenses.
