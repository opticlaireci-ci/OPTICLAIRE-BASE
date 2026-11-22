# Charges du mois et salaires des employés — 23/11/2026

Nouveau bouton **« Charges & salaires »** dans **OPTICLAIRE → Gestion
comptabilité → Mouvements Entrée/Sortie**, à côté de « Mouvements », « Point
hebdomadaire » et « Point Mobile Money ».

## À faire une fois avant d'utiliser

Supabase (projet OPTICLAIRE) → SQL Editor → New query → coller **tout**
`supabase/CHARGES_SALAIRES_2026-11-23.sql` → RUN.

Le résultat doit afficher :

- « Table des charges et salaires : protégée » ;
- « Règle d'accès : 1 / 1 ».

Le script peut être relancé sans risque. Tant qu'il n'est pas exécuté,
l'onglet affiche un message qui le rappelle.

## Qui y a accès

Les salaires sont des données sensibles : ils ont **leur propre table,
protégée**. Ils ne sont pas rangés avec les données partagées d'OPTICLAIRE,
et rien n'est gardé dans le navigateur.

- **Voient et modifient** : super administrateur, administrateur, directeur,
  comptable (rôle de la fiche utilisateur).
- **N'ont pas accès** : conseillères, responsables (rôle « manager »),
  opticiens, caissiers… Ils ne voient pas le bouton, et la base refuse
  même une demande directe.

## Choisir le mois

Flèches ◀ ▶, « Ce mois-ci » ou le calendrier. Le mois choisi reste après une
actualisation de la page.

Deux vues : **Charges du mois** et **Salaires des employés**.

## Charges du mois (comme le tableau en image)

- **Une ligne par officine** (les magasins d'OPTICLAIRE), et BUREAU en
  dernier.
- **Les colonnes** :
  - UNITÉ, FIBRE OPTIQUE, CIE, SODECI, SALAIRES : RÉFÉRENCE et MONTANT ;
  - LOYER, PRIMES : MONTANT.
- **TOTAL de chaque charge** et **CHARGES TOTALES**. Avec le tableau
  d'octobre : **5 490 665**.
- **Modifier, ajouter, retirer** :
  - toute case se modifie ;
  - « + Ajouter une ligne » (ANGRÉ, KORHOGO…) ;
  - « + Ajouter une charge » (une colonne ; case « réf. » pour une colonne
    RÉFÉRENCE) ;
  - renommer, déplacer (◀ ▶ ▲), retirer (✕).

## Salaires des employés (comme la fiche salariale PDF)

Colonnes **NOM · FONCTION · SALAIRE DE BASE · EMPRUNT · SALAIRE FINAL** :

- « SALAIRE » s'appelle maintenant **SALAIRE DE BASE** ;
- **EMPRUNT** : le montant retenu ce mois-ci ;
- **SALAIRE FINAL = SALAIRE DE BASE − EMPRUNT**, calculé tout seul. Il
  s'affiche en rouge s'il devient négatif.

La ligne TOTAL donne les trois totaux. Avec la fiche d'octobre :

- salaires de base : **7 090 000** (33 employés) ;
- avec un emprunt de 100 000 pour Michel : salaire final **6 990 000**.

Pour remplir la liste :

- « + Ajouter un employé » ;
- « Importer (Excel / CSV) » ;
- « Coller depuis Excel » : sélectionnez NOM, FONCTION, SALAIRE (et EMPRUNT)
  dans Excel, copiez, collez.

Un employé déjà dans la liste (même nom) est mis à jour, jamais doublé.

## Chaque mois : tout est repris, vous ne modifiez que ce qui change

Un mois pas encore enregistré **reprend tout le dernier mois enregistré** :

- officines et colonnes ;
- références **et montants** des charges ;
- employés, fonctions, salaires de base **et emprunts**.

Il suffit de modifier les cases qui changent (une facture CIE, un nouvel
employé, un emprunt terminé…).

- Le bouton « **Remettre les emprunts à 0** » remet tous les emprunts du mois
  à 0 en un clic, quand les emprunts sont terminés. Pour un seul emprunt
  terminé, tapez 0 dans sa case.
- Chaque mois est enregistré à part : corriger novembre ne change pas
  octobre.

## Vos données d'octobre 2026

Les employés et salaires (fiche salariale) et toutes les charges (tableau en
image) d'octobre 2026 sont dans un petit script fourni **à part**, pas dans le
ZIP ni dans le dépôt, car il contient les salaires :
`DONNEES_OCTOBRE_2026_charges_salaires.sql`.

À exécuter **une fois**, **après** `CHARGES_SALAIRES_2026-11-23.sql`
(Supabase → SQL Editor → coller → RUN). Ensuite :

- octobre est enregistré (33 employés, 7 090 000 ; charges 5 490 665) ;
- novembre et les mois suivants reprennent ces informations tout seuls.

Le script est sans risque : un mois déjà enregistré dans l'application n'est
jamais remplacé.

Sinon, les deux fichiers Excel (`…_a_importer.xlsx`) s'importent avec le
bouton « ↑ Importer (Excel / CSV) ».

## Importer, exporter, imprimer

- **Importer (Excel / CSV)** :
  - Charges : le fichier peut avoir la présentation de votre tableau (titres
    « UNITE, FIBRE OPTIQUE… » puis « REFERECE, MONTANT ») ou celle du bouton
    « ↓ Excel ».
  - Officines et charges sont reconnues par leur nom (« YOP GANDHI » =
    YOPOUGON GANDI) ; celles qui manquent sont ajoutées.
- **↓ Excel** : le tableau du mois en fichier Excel.
- **Imprimer** : présenté **comme une facture de vente** :
  - en-tête de l'enseigne : nom, adresse, téléphone, e-mail, « Abidjan, le … »
    et **logo** à droite ;
  - titre (CHARGES DU MOIS / FICHE SALARIALE) avec le mois, « Édité par », la
    date d'impression et la dernière modification ;
  - le tableau aux couleurs de vos documents, cases de même taille ;
  - la **somme en toutes lettres** (charges totales / total des salaires
    finaux), « Signature & Cachet » et le pied de page (« Document interne » /
    « Document confidentiel », nom complet de l'enseigne).

  Les charges tiennent sur une page A4 paysage, la fiche salariale de 33
  employés sur une page A4 portrait. Une liste plus longue continue sur la
  page suivante, avec les titres du tableau répétés.

## Technique

- `supabase/CHARGES_SALAIRES_2026-11-23.sql` :
  - table `charges_salaires_mois` : une ligne par mois (`2026-10`), plus la
    ligne `modele` (dernier mois enregistré) ;
  - fonction `peut_gerer_salaires()` et règle d'accès.
- `src/app/utils/montantEnLettres.ts` : somme en toutes lettres (même règle
  que la facture de vente).
- `src/app/utils/chargesSalaires.ts` : calculs (totaux, salaire final,
  nouveau mois, import, export).
- `src/app/services/chargesSalairesService.ts` : lecture et enregistrement.
  Les charges et les salaires s'enregistrent séparément : deux personnes ne
  s'écrasent pas.
- `src/app/pages/gestion-comptabilite/mouvement/` :
  - `ChargesSalaires.tsx` : écran ;
  - `chargesImpression.ts` : documents imprimés ;
  - `MouvementPage.tsx` : le bouton.
- Aucune autre table, aucune autre page ne change.

## Vérifications effectuées

- **Base de test reproduisant Supabase** : script exécuté deux fois sans
  erreur, **18/18** contrôles de droits :
  - administrateur, comptable, directeur : accès ;
  - conseillère, responsable, administrateur LECLAIRE par la case,
    personne sans connexion : aucun accès ;
  - mois mal écrit refusé ;
  - enregistrer les salaires ne touche pas aux charges.
- **Calculs : 23/23**, avec la fiche salariale et le tableau des charges
  d'octobre importés depuis Excel :
  - totaux 7 090 000 et 5 490 665 ;
  - salaire final = base − emprunt ;
  - réimport sans doublon, copier-coller, export puis réimport ;
  - mois suivant qui reprend tout (montants et emprunts compris), sans
    toucher au mois précédent.
- **Navigateur, site de production avec sa politique de sécurité : 37/37 + 6/6** :
  - le bouton ;
  - l'import des deux fichiers et les totaux ;
  - case modifiée, charge ajoutée puis retirée ;
  - emprunt (600 000 − 100 000 = 500 000), copier-coller, employé ajouté
    puis retiré ;
  - l'enregistrement dans la table protégée, rien dans le navigateur ;
  - les impressions comme une facture (logo affiché, coordonnées, somme en
    lettres, signature, une seule page chacune) ;
  - novembre qui reprend tout d'octobre sans rien retaper, un seul montant
    modifié, octobre intact, décembre repris de novembre, « Remettre les
    emprunts à 0 » ;
  - le script des données d'octobre : passé deux fois sans doublon, puis
    l'application montre les 33 employés et toutes les charges sans aucun
    import ;
  - l'actualisation, le téléphone ;
  - comptable : accès et modification ; conseillère : rien.
- **Corrigé pendant les tests** : une modification pouvait être perdue si la
  page se rechargeait juste après une confirmation.
- Tous les contrôles précédents repassés : points 40/40 et 35/35, LECLAIRE
  59/59, 63/63, 22/22, 26/26.
