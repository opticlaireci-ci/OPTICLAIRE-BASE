# OPTICLAIRE — Maintenance approfondie (2026-11-24)

## Méthode

1. **Vérification des types sur tout le code** (254 fichiers, 82 800 lignes) :
   42 anomalies examinées une par une. Les vrais bugs sont corrigés, les
   autres ne sont que des types trop étroits, sans effet à l'écran.
2. **Ouverture de chaque écran** dans le site compilé, comme en production,
   avec la politique de sécurité active :
   - 126 écrans : ordinateur et téléphone, administrateur et conseillère ;
   - deux passages, base vide puis données de démonstration (ventes, devis,
     règlements, clients, bons, catalogues, cas limites) ;
   - recherche d'erreurs de page, d'erreurs console, d'écrans d'erreur, de
     pages vides et de débordements sur téléphone.

   Résultat : **0 erreur sur les 126 écrans**, dans les deux passages.
3. **Revue ciblée** des motifs à risque : copies locales jamais mises à jour,
   comparaisons de magasins sensibles aux majuscules, calculs de dates et de
   montants, écritures concurrentes entre appareils, doublons de SMS.
4. **Tests ciblés** pour chaque correction importante, lancés aussi sur
   l'ancien code pour vérifier qu'ils reproduisaient bien le bug.

## Bugs corrigés

### Données perdues (les plus graves)

1. **Stock des lentilles effacé à chaque vente.**
   - Cause : la lecture d'un réglage partagé visait une mauvaise clé
     (« undefined:leclaire_… ») et renvoyait toujours « rien ».
   - Effet : chaque vente avec des verres remplaçait TOUT le stock des
     lentilles par les seules cases de la vente, recalculées depuis les
     valeurs de départ. Toutes les autres cases saisies étaient perdues.
   - Le test refait sur l'ancien code donne bien le stock écrasé.
   - Corrigé : la vente ne touche que ses cases.
2. **Grille du stock des lentilles.** Chaque case modifiée envoyait au serveur
   le texte « undefined » à la place du stock, pour tous les appareils. Les
   saisies disparaissaient au rechargement.
   - Corrigé : la mise à jour est calculée correctement.
   - Toute valeur invalide (texte, « undefined », « null ») est maintenant
     refusée, aussi bien à l'affichage qu'à l'envoi au serveur.
3. **Listes partagées écrasées entre appareils.** Les deux enregistrements
   remplaçaient en bloc la liste du serveur :
   - celui de l'écran ;
   - celui de la synchronisation automatique, 1,5 s plus tard.

   Les listes touchées : mouvements de caisse, mouvements de comptabilité,
   demandes de devis, rendez-vous, journal du call center, points de la
   semaine, catalogues…

   Effet : deux personnes qui ajoutaient un élément à quelques secondes
   d'écart, et l'un des deux disparaissait. Au premier ajout, la liste
   pouvait même repartir de zéro.

   Corrigé par une **fusion à trois** à chaque enregistrement :
   - les ajouts, modifications et suppressions des deux côtés sont conservés ;
   - sur un même élément modifié des deux côtés, la modification la plus
     récente l'emporte.

   Testé avec deux caisses qui enregistrent au même instant, et avec une
   suppression sur un poste pendant un ajout sur l'autre.
4. **SMS envoyés en double.** Les marques « déjà envoyé » (anniversaire,
   lunettes prêtes, renouvellement) étaient remplacées en bloc entre les
   postes. Les marques d'un poste effaçaient celles d'un autre, et les mêmes
   SMS repartaient (coût).
   - Corrigé : les marques sont fusionnées entre postes.
   - Une marque retirée exprès (envoi refusé, à retenter) reste retirée.

### Complément (ZIP 47) : enregistrements entre appareils

En revérifiant que rien ne pouvait effacer de données, quatre autres
situations ont été corrigées :

- **Écriture conditionnelle des listes partagées.** Un enregistrement ne passe
  que si la liste du serveur n'a pas changé depuis sa lecture. Sinon, il relit,
  refusionne et recommence. Deux enregistrements à la même milliseconde ne
  s'écrasent plus : vérifié 6 fois de suite.
- **Saisie hors ligne.** Au retour du réseau, la liste mise en attente est
  fusionnée avec celle du serveur au lieu de la remplacer : les ajouts faits
  entre-temps ailleurs restent. Les nouvelles tentatives relisent la liste
  actuelle de l'appareil au lieu d'une copie figée.
- **File d'attente des envois.** Après un refus, les envois suivants étaient
  retirés de la file sans être partis. Les envois ajoutés pendant un renvoi
  pouvaient aussi être perdus. Ils sont maintenant tous conservés.
- **Éléments jamais envoyés.** Un élément présent seulement sur un appareil
  n'est jamais pris pour une suppression faite ailleurs : au pire, un élément
  supprimé ailleurs réapparaît, mais rien n'est perdu.

### Chiffres faux ou vides

5. **Objectif du magasin jamais affiché** (tableau de bord global et tableau
   de bord du magasin).
   - Cause : « Gérer le magasin » enregistre l'objectif sous un nom, les
     tableaux de bord en lisaient un autre.
   - Effet : objectif à 0, pourcentage réalisé à 0 %.
   - Corrigé : l'objectif du mois et de l'année choisis s'affiche.
6. **Comptes banque : entrées toujours à 0.** La page lisait la copie des
   ventes sous un nom en minuscules au lieu de majuscules, et dans des champs
   de montant qui n'existent pas.
   - Désormais : argent réellement reçu, par compte, lu depuis la base.
   - L'acompte de la vente compte sur le compte de la vente ; chaque
     règlement sur son propre compte.
   - Hors part assurance et hors devis.
7. **« Quantité / total vendus » des montures et des verres, et « produits les
   plus vendus » de l'atelier : toujours vides.** Même erreur de nom de copie
   locale.
   - Corrigé, sans les devis.
   - Lecture faite une seule fois pour toutes les lignes, donc rapide.
8. **Boutons « État de stock disponible »** (Gestion Stocks, impression et
   Excel) : états toujours vides. Ils lisaient d'anciennes copies locales que
   l'application n'écrit plus.
   - Ils utilisent maintenant le stock réel de chaque magasin, le même calcul
     que « État de Stock ».
   - L'export Excel s'ouvre correctement dans Excel en français (colonnes
     séparées, accents corrects).
9. **Prix des verres tapés avec des espaces.** « 45 000 » ou « 45.000 » dans
   le prix d'un œil valait 45, et le total des verres tombait à 90 F au lieu
   de 90 000 F.
   - Corrigé à la saisie et dans le calcul commun des totaux.
10. **Magasin écrit autrement** (« ABOBO », « LECLAIRE ABOBO », ancien nom) :
    ventes, règlements et clients étaient écartés du tableau de bord par
    magasin, de la base clients et des copies par magasin.
    - Corrigé : la comparaison accepte toutes les écritures d'un même magasin.

### Affichage et impression

11. **Reçus de règlement.** Quand l'auteur manquait, un nom écrit en dur
    (« LOUISE MARLÈNE ») s'imprimait sur les reçus de tous les magasins.
    - Désormais : l'auteur réel, sinon « — ».
    - Le reçu imprimé utilise la virgule décimale, comme le reçu PDF.
12. **Calendriers des rendez-vous de retrait.** Depuis un 29, 30 ou 31,
    « mois suivant » sautait un mois (31 octobre → décembre).
13. **Rappel de renouvellement des verres.** En fin de mois, il partait
    quelques jours trop tôt (31 mars − 1 mois donnait le 3 mars).

### Sécurité des données

- **Les réglages partagés ne sont jamais supprimés depuis un appareil.**
  Effacer les copies locales (déconnexion, réparation) ne touche pas le
  serveur. C'était déjà le cas de fait, à cause de la clé erronée ; c'est
  maintenant explicite. La lecture, elle, est corrigée.
- **Reprise des anciens bons** (ancienne liste vers table des bons) : elle
  n'avait jamais fonctionné, à cause de la même clé. Elle est limitée à une
  table encore vide de ce type de bon, pour ne pas faire revenir des bons
  supprimés depuis.

## Vérifié

- Parcours des 126 écrans : base vide 126/126, avec données 126/126.
- Tests ajoutés :

  | Domaine | Vérifications |
  | --- | --- |
  | Fusion des listes partagées | 22 |
  | Stock lentilles | 4 |
  | Deux caisses en même temps | 10 |

  La fusion des listes compte 22 vérifications avec les objectifs mensuels,
  les montants saisis et les marques SMS.

  Le test des deux caisses couvre l'enregistrement simultané, une suppression
  pendant un ajout, et une coupure réseau avec ajout ailleurs. Il a réussi
  6 fois de suite.
- Non-régression :

  | Domaine | Vérifications |
  | --- | --- |
  | Magasins sur tous les appareils | 24 + 13 |
  | Points | 35 + 40 |
  | Charges & salaires | 29 + 40 + 6 + 9 |

## Ce correctif n'efface rien dans votre base

- Les changements de lecture, d'affichage et d'impression n'écrivent rien
  dans la base : tableaux de bord, comptes banque, boutons de stock,
  statistiques, reçus, calendriers.
- Plusieurs corrections ARRÊTENT au contraire des effacements :
  - le stock des lentilles ;
  - le texte « undefined » ;
  - les listes écrasées entre appareils ;
  - la file d'attente des envois.
- Rien n'est supprimé depuis un appareil : les réglages partagés restent sur
  le serveur, même quand un appareil vide ses copies locales.
- La seule écriture nouvelle est la reprise des anciens bons. Elle n'AJOUTE
  des bons que dans une table encore vide pour ce type de bon, et ne supprime
  rien.
- Les données déjà perdues avant ce correctif ne peuvent pas être recréées.
  C'est le cas des cases du stock des lentilles écrasées lors des ventes
  passées : refaites un inventaire des lentilles si les quantités vous
  semblent fausses.

## Rien à faire dans Supabase

Aucun script à exécuter. Déployez simplement cette version.
