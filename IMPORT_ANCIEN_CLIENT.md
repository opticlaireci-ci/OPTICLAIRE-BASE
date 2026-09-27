# Import d'un ancien dossier client

Une nouvelle fonction `Importer ancien dossier client` permet d'intégrer un ancien dossier dans un magasin.

## Ce qui est créé

- un client dans `clients`;
- une vraie vente (`type: vente`) avec la **date d'origine**;
- les articles, verres, ordonnance et bons d'assurance;
- l'acompte initial comme règlement historique;
- les règlements complémentaires avec leurs dates d'origine;
- les pièces du dossier dans `documents_importes`, découpées en morceaux pour éviter la limite de taille Firestore.

Les ventes importées portent `recap.imported=true` et ne déclenchent pas de SMS de remerciement.

## Fichiers reconnus automatiquement

Le dossier peut contenir JSON, CSV, XLSX/XLS, PDF, images et autres pièces.

Pour les JSON/CSV/XLSX, l'importeur tente de reconnaître des champs comme :

- client / customer
- numero_client / numeroClient
- nom / name / full_name
- telephone / phone
- date / date_vente / sale_date / invoice_date
- total_brut / totalBrut / total
- total_net / totalNet / net
- acompte / deposit
- reglements / payments
- bons_assurance / bonsAssurance
- ordonnance / prescription
- articles / items
- verres

Si le logiciel historique a un format différent, les champs peuvent être corrigés manuellement dans l'écran avant l'import.

## Tableau de bord

La vente garde sa date historique. Les règlements importés gardent également leurs dates historiques. Le tableau de bord existant peut donc rattacher la vente à son mois d'origine au lieu de la faire apparaître comme une vente du jour de l'import.
