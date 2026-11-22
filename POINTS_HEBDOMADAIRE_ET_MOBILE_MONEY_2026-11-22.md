# Point hebdomadaire et Point Mobile Money — 22/11/2026

Deux onglets ajoutés dans **OPTICLAIRE → Gestion comptabilité → Mouvements
Entrée/Sortie**, à côté de la liste des mouvements :

**Mouvements · Point hebdomadaire · Point Mobile Money**

Ces onglets sont visibles par les comptables, les directeurs, les
administrateurs et les responsables. Ils sont modifiables par les mêmes
personnes que le Récap hebdomadaire : super administrateur, administrateur,
directeur, comptable. Les autres les voient en lecture seule. Les
conseillères ne les voient pas.

Aucun script Supabase à exécuter : les points sont enregistrés dans les
données partagées d'OPTICLAIRE (`app_data`), comme les autres réglages. Tout
poste connecté voit les mêmes points.

## Choisir la semaine

Flèches ◀ ▶, « Cette semaine », ou n'importe quel jour dans le calendrier : le
point prend la semaine du lundi au dimanche. La semaine choisie reste la même
d'un onglet à l'autre et après une actualisation (elle est dans l'adresse de
la page).

## Point hebdomadaire (comme le PDF « RAPPORT DU 26 AU 31 OCTOBRE 2026 »)

- **Un tableau par officine** : JOURS / RECETTES, du lundi au dimanche, et le
  TOTAL. Les officines sont dans l'ordre du point papier : Palmeraie,
  Yopougon, Abobo, Bouaké, Faya, Koumassi, Bingerville, Yopougon Gandi, puis
  les autres magasins d'OPTICLAIRE.
- **Seules les recettes y sont enregistrées.** Elles se remplissent seules
  avec les encaissements d'OPTICLAIRE de la semaine : l'acompte de chaque
  vente au jour de la vente, les règlements clients, les entrées de caisse et
  les entrées de la comptabilité générale.
- **Rien de ce qui vient des assurances n'en fait partie** : ni la prise en
  charge ou les bons d'assurance, ni les règlements des assurances, ni une
  entrée dont le mode de paiement, la nature ou la catégorie parle
  d'assurance.
- **Récapitulatif des entrées** :
  - RECETTE TPE/VISA/CHEQUE : encaissements par carte et chèque de la
    semaine. Affichée, mais **non comptée** par défaut, car elle est déjà
    dans les recettes des officines.
  - RECETTES TOTALES OFFICINES : somme des officines.
  - RECETTES ASSURANCES : somme du cadre « Recette assurance ».
  - Frais Wave et OM 1% : 1 % des dépôts Orange Money + Wave du point Mobile
    Money de la même semaine. Ce montant est **retiré**.
  - **MONTANT DÉPOSÉ** = lignes « + ajouté » − lignes « − retiré ».

  Avec les chiffres du PDF : 6 120 000 + 296 000 − 13 000 = **6 403 000**.

  Chaque ligne a un choix « + ajouté / − retiré / non compté ».
- **Recette assurance** (MCI, WILLIS…) et **Sous-traitance** (AXA) : montants
  **tapés à la main**, une case par montant, « + montant » pour en ajouter.
  La case « sous-traitance (non comptée) » met une colonne à part : elle
  apparaît dans le point mais n'entre pas dans les recettes assurances.

## Point Mobile Money (comme le PDF « POIN »)

- **D'abord le tableau global** : un jour par ligne (lundi → samedi ; le
  dimanche s'ajoute seul s'il y a des dépôts, ou avec la case « Dimanche »),
  un magasin par colonne, le TOTAL du jour, puis la part ORANGE MONEY, WAVE
  et TPE VISA. Ligne TOTAL en bas.
- **Puis un tableau par moyen** : Orange Money, Wave, TPE Visa, avec le même
  découpage jours × magasins.
- Les dépôts **se remplissent seuls** avec les encaissements d'OPTICLAIRE de
  la semaine, selon leur mode de paiement :
  - « Orange Money » ou « OM » → Orange ;
  - « Wave » → Wave ;
  - « Carte bancaire », « Carte Visa » ou « TPE » → TPE ;
  - « MTN » et « Moov » ont leur propre tableau s'il y en a.

  Les espèces, les chèques, les virements et tout ce qui vient d'une
  assurance n'y sont pas.
- Un paiement noté seulement **« Mobile Money »** (sans dire Orange ou Wave)
  est mis dans un tableau « MOBILE MONEY (opérateur non précisé) », avec un
  message. Pour le ranger, tapez le montant dans le bon tableau, puis 0 dans
  la case « non précisé ».
- Le tableau global se calcule à partir des tableaux par moyen : une
  correction dans le tableau Wave se voit tout de suite dans le global.

## Modifier, ajouter des cases

- **Toute case est modifiable** : cliquez sur un montant, tapez, puis appuyez
  sur Entrée ou cliquez ailleurs. Les espaces sont acceptés (« 1 200 000 »).
- Une case changée à la main passe **en jaune**. Le montant calculé reste
  visible en survolant la case. **Videz la case** pour revenir au calcul
  automatique.
- **Ajouter des cases** :
  - « + Ajouter une officine » ;
  - « + Ajouter une ligne » dans le récapitulatif ;
  - « + Ajouter une assurance » et « + montant » ;
  - « + Ajouter une colonne » et « + Ajouter un moyen de paiement » dans le
    point Mobile Money.
- **Modifier la présentation** :
  - renommer : cliquez sur le nom d'une officine, d'une colonne, d'une ligne
    ou d'un tableau ;
  - ◀ ▶ ▲ : déplacer ;
  - ✕ : retirer. Un magasin retiré peut être remis (« remettre ») ;
  - ✎ : modifier le titre.
- Les officines, colonnes, lignes et assurances ajoutées sont **reprises les
  semaines suivantes**. Les montants tapés restent propres à leur semaine.
- Sous le titre : « Modifié par … le … à … ».

## Imprimer

Bouton **Imprimer** : document A4 aux couleurs du point papier, sans le
reste de l'écran.

- Point hebdomadaire : A4 portrait. Quatre officines par rangée, puis le
  récapitulatif et les assurances.
- Point Mobile Money : A4 paysage. Tableau global, puis un tableau par moyen.

Pour un PDF, choisissez « Enregistrer au format PDF » dans la fenêtre
d'impression.

## Technique

- `src/app/utils/pointsSemaine.ts` : calculs (semaines, encaissements par
  mode de paiement, cases modifiées, totaux, montant déposé).
- `src/app/pages/gestion-comptabilite/mouvement/` :
  - `PointHebdomadaire.tsx` et `PointMobileMoney.tsx` : écrans ;
  - `pointsCommun.tsx` : case de montant, semaine, données ;
  - `pointsImpression.ts` : document imprimé, dans un cadre isolé ;
  - `MouvementPage.tsx` : les onglets.
- Clés partagées :
  - `leclaire_point_hebdo_<lundi>` et `leclaire_point_mobile_<lundi>` : une
    clé par semaine, seulement si quelque chose a été modifié ;
  - `leclaire_point_hebdo_modele` et `leclaire_point_mobile_modele` : la
    présentation reprise les semaines suivantes.
- Les pages Récap hebdomadaire, Mouvements et LECLAIRE ne changent pas.

## Vérifications effectuées

- **Calculs : 35/35**, avec les chiffres des deux PDF :
  - officines 1 301 000 / 1 515 000 / 547 500 / 506 500 / 719 000 /
    471 000 / 1 060 000 ;
  - recettes totales 6 120 000, assurances 296 000, montant déposé
    6 403 000 ;
  - Mobile Money 1 332 500 au total, Orange 51 000, Wave 1 141 500,
    TPE 140 000, et le total de chaque jour.
  - Contrôlé aussi : modes de paiement, entrées « assurance » exclues,
    semaines à cheval sur deux mois ou deux années, dimanche, cases
    modifiées et ajoutées, données anciennes ou abîmées relues sans erreur.
- **Navigateur, site de production avec sa politique de sécurité : 37/37** :
  - les onglets, le remplissage seul et les chiffres des PDF ;
  - les règlements d'assurance enregistrés (5 000 000) non repris ;
  - la recette assurance tapée et les frais tapés → 6 403 000 ;
  - case en jaune, case vidée → retour au calcul, cases ajoutées, titre
    modifié ;
  - l'enregistrement partagé, la semaine suivante, l'actualisation, la même
    semaine d'un onglet à l'autre ;
  - le Point Mobile Money modifié et complété, le lien frais ↔ Mobile Money ;
  - les impressions A4, l'affichage sur téléphone sans débordement ;
  - un responsable en lecture seule, une conseillère sans les onglets.
- Tous les contrôles précédents repassés sur cette version : 22/22, 63/63,
  26/26.
