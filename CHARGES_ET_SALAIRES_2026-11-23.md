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

## Informations fixes chaque mois, corrections reportées sur les mois suivants

Les **noms, fonctions et salaires de base** des employés, et **toutes les
charges** (officines, références, montants) sont **fixes** : ils apparaissent
tels quels chaque mois, même en allant directement en décembre.

- **Quel mois est montré** : un mois pas encore enregistré montre le **mois
  enregistré le plus proche avant lui**. L'écran l'indique : « Informations
  fixes reprises d'octobre 2026 ».
- **Les emprunts** sont propres à chaque mois : ils sont à 0 dans un nouveau
  mois. Tapez ceux du mois ; le bouton « Remettre les emprunts à 0 » les
  efface tous en un clic.
- **Une correction vaut pour ce mois et les suivants** :
  - les mois suivants pas encore enregistrés la montrent d'eux-mêmes ;
  - elle est aussi **reportée sur les mois suivants déjà enregistrés**, sauf
    là où une autre valeur y avait été mise exprès. Exemple : Michel passe
    à 650 000 en octobre, donc novembre passe aussi à 650 000 ; mais si
    novembre avait déjà Yves à 170 000, il le garde.
  - L'écran l'indique : « correction reportée sur novembre 2026 ».
- **Un mois déjà passé n'est jamais modifié** par une correction faite plus
  tard dans l'année : corriger décembre ne change pas octobre.

## Vos données d'octobre 2026 : un seul fichier à exécuter

Les employés et salaires (fiche salariale) et toutes les charges (tableau en
image) d'octobre 2026 sont dans un fichier fourni **à part** :
`DONNEES_OCTOBRE_2026_charges_salaires.sql`. Il n'est ni dans le ZIP ni dans
le dépôt, car il contient les salaires.

Supabase → SQL Editor → coller **tout** le fichier → RUN. **Ce seul fichier
suffit** :

- il crée la table protégée si elle n'existe pas encore ;
- il remplit octobre 2026.

Le résultat affiche :

- « Table des charges et salaires : protégée » ;
- « Employés d'octobre 2026 : 33 » ;
- « Salaires de base d'octobre 2026 : 7090000 » ;
- « Lignes de charges d'octobre 2026 : 13 ».

Ensuite, novembre, décembre et tous les mois suivants sont **préremplis** avec
les employés, fonctions, salaires de base et charges.

Le fichier est sans risque et peut être relancé :

- un octobre déjà rempli dans l'application n'est jamais remplacé ;
- un octobre enregistré vide est rempli.

## Mois enregistré vide

Un mois enregistré sans aucune donnée (par exemple avant que les données
d'octobre existent) est ignoré : il montre les informations du mois rempli
précédent. Cliquer dans une case puis repartir sans rien taper n'enregistre
plus rien.

Quand il n'existe encore aucune donnée, l'écran le dit et indique quoi faire.

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
  - table `charges_salaires_mois` : une ligne par mois (`2026-10`) ;
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
- **Calculs : 29/29**, avec la fiche salariale et le tableau des charges
  d'octobre importés depuis Excel :
  - totaux 7 090 000 et 5 490 665 ;
  - salaire final = base − emprunt ;
  - réimport sans doublon, copier-coller, export puis réimport ;
  - mois suivants qui montrent les informations fixes (emprunts à 0) ;
  - correction reportée sur un mois suivant déjà enregistré, sauf sur une
    valeur changée exprès ;
  - employé ajouté ou retiré, montant, référence et ligne renommée
    reportés.
- **Navigateur, site de production avec sa politique de sécurité : 40/40 + 6/6** :
  - le bouton ;
  - l'import des deux fichiers et les totaux ;
  - case modifiée, charge ajoutée puis retirée ;
  - emprunt (600 000 − 100 000 = 500 000), copier-coller, employé ajouté
    puis retiré ;
  - l'enregistrement dans la table protégée, rien dans le navigateur ;
  - les impressions comme une facture (logo affiché, coordonnées, somme en
    lettres, signature, une seule page chacune) ;
  - novembre qui montre noms, fonctions, salaires de base et charges
    d'octobre sans rien retaper ;
  - un seul montant modifié, octobre intact ;
  - décembre repris de novembre ;
  - correction de Michel en octobre reportée sur novembre et visible en
    décembre ; Yves, changé exprès en novembre, gardé ;
  - le fichier des données d'octobre :
    - sur une base neuve, il crée la table et remplit octobre ;
    - relancé, il ne crée pas de doublon ;
    - il remplit un octobre enregistré vide, et ne remplace pas un octobre
      modifié ;
  - novembre enregistré vide : il montre octobre, et un clic sans rien taper
    n'enregistre rien ;
  - préremplissage jusqu'en février 2027 ;
  - message clair quand il n'y a aucune donnée ;
  - l'actualisation, le téléphone ;
  - comptable : accès et modification ; conseillère : rien.
- **Corrigé pendant les tests** : une modification pouvait être perdue si la
  page se rechargeait juste après une confirmation.
- Tous les contrôles précédents repassés : points 40/40 et 35/35, LECLAIRE
  59/59, 63/63, 22/22, 26/26.
