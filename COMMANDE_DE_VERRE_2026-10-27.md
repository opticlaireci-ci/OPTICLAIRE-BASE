# Commande de verre (Atelier) — 27/10/2026

## Où la trouver

- **Dans chaque magasin** : menu **Atelier** → bouton **Commande de verre**
  (premier bouton, avant « Bon Verre »). Les conseillères et opticiens n'y
  voient que « Commande de verre » ; bons de verre, fournisseurs et montage
  restent réservés aux monteurs et à l'administration.
- **Dans le tableau de bord général** : menu **Atelier** → **Commande de verre**.

Deux sous-onglets : **Passer commande** et **Réception commande**. Chacun ne
voit que sa partie (voir « Droits » ci-dessous).

## Le parcours

| Étape | Qui | Ce qu'il fait | Ce que voit le magasin |
|---|---|---|---|
| 1 | Conseillère / opticien | Atelier → Commande de verre (arrive sur **Passer commande**) → **NOUVELLE COMMANDE** → verres (OD / OG : verre, type, traitement, matière, sphère, cylindre, axe, addition, diamètre, quantité), client, fournisseur, observations → **Télécharger l'ordonnance** → **COMMANDER** | « Envoyée (à confirmer) » ; la commande part dans **Réception commande** |
| 2 | Assistante administrative | Atelier → Commande de verre (arrive directement sur **Réception commande**) → **CONFIRMER LA COMMANDE** | **« En attente »** |
| 3 | Assistante administrative | **VERRE ARRIVÉ** | **« Commande arrivée »** + message en haut de l'écran du magasin + **icône qui clignote** dans la barre d'icônes (comme les bons de distribution) |
| 4 | Magasin | Clique sur l'icône ou sur le message → ses commandes s'ouvrent | Le message disparaît et l'icône cesse de clignoter (pour tout le magasin) |

- Côté administration, une icône **« Commandes de verre à confirmer »**
  clignote aussi dans la barre du haut tant qu'une commande attend sa
  confirmation.
- L'ordonnance est **obligatoire** : bouton **Prendre une photo** (l'appareil
  photo du téléphone ou de la tablette s'ouvre directement) ou **Télécharger
  l'ordonnance** (photo ou PDF). Les photos sont réduites automatiquement
  (environ 1 400 px, quelques centaines de Ko) ; PDF : 1,5 Mo au plus. Elle
  s'ouvre depuis chaque commande (bouton ordonnance) ; la fiche détaillée
  reprend les verres et l'historique (commandée, confirmée, arrivée : date et
  personne).
- Réception : filtres **À traiter / À confirmer / En attente / Arrivées /
  Toutes** et recherche (client, numéro, magasin).
- Numéro de commande : **CV-0001, CV-0002…**, suivi par la base pour tous les
  magasins (fonction de numérotation de NUMEROTATION_FACTURES.sql, compteur
  propre aux commandes de verre ; sans elle, compteur de chaque poste).

## Droits (28/10/2026)

| Compte | Passer commande | Réception commande | Cases explicatives (1-2-3) |
|---|---|---|---|
| Conseillère, opticien et autres comptes de magasin | ✅ | — | — |
| Assistante administrative | — | ✅ | — |
| Administrateurs, super administrateur | ✅ | ✅ | ✅ |

- **Donner la main plus tard** : Gestion des utilisateurs → modifier
  l'utilisateur → onglet **Accès aux boutons** → bloc **« Atelier → Commande
  de verre : ce que l'utilisateur voit »** → cocher « Passer commande »,
  « Réception commande » et/ou « Les cases explicatives en haut » →
  Enregistrer. La partie donnée par le rôle est cochée et grisée « (inclus dans
  son rôle) ». L'utilisateur voit le changement à sa prochaine connexion.
- Avec « Réception commande » cochée, l'utilisateur **confirme** et signale
  **verre arrivé** (et voit l'icône « Commandes de verre à confirmer »), pour
  les magasins rattachés à son compte.
- Un lien vers une partie non permise (icône, message) ouvre l'autre partie.
- Chaque magasin ne voit que **ses** commandes.
- L'assistante administrative voit les commandes des magasins auxquels son
  compte est rattaché : dans **Gestion des utilisateurs**, choisissez **« Tous
  les magasins »** pour son compte (et ajoutez-y tout nouveau magasin).

## Ordonnances dans le stockage de fichiers Supabase (28/10/2026)

Les photos et PDF d'ordonnance vont dans le **stockage de fichiers** Supabase
(espace privé **« ordonnances »**), et non dans la base de données : la base
reste légère et rapide, les fichiers ne sont téléchargés qu'à l'ouverture.

- **À faire une fois** : Supabase (projet OPTICLAIRE) → SQL Editor → coller tout
  `supabase/STOCKAGE_ORDONNANCES_2026-10-28.sql` → RUN. Le résultat affiche
  « ordonnances (privé) » et « Règles d'accès 4 / 4 ». Le script refuse de
  s'exécuter dans une base qui n'est pas celle d'OPTICLAIRE.
- Règles : un magasin dépose et consulte les ordonnances de ses commandes ;
  l'administration (et les comptes rattachés au magasin, comme l'assistante)
  les consulte ; seule l'administration peut supprimer ; aucun accès sans
  connexion ni lien public.
- Rangement : `<MAGASIN>/<commande>/ordonnance.jpg` (ou `.pdf`).
- **Tant que le script n'est pas exécuté**, rien n'est bloqué : l'ordonnance
  est gardée dans la base, comme avant (l'administration en est avertie après
  chaque commande). Les commandes passées avant l'installation gardent leur
  ordonnance dans la base et s'ouvrent normalement.

## Technique

- Les commandes sont enregistrées dans la table `bons` (type
  `commande_verre`, magasin dans `magasin_source`), avec les mêmes règles
  d'accès que les bons de distribution. Ordonnance : stockage de fichiers
  (ci-dessus), sinon ligne à part (type `ordonnance_verre`), lue seulement à
  l'ouverture.
- Les listes de bons et le calcul du stock ne lisent plus que leurs propres
  types : les commandes de verre et les ordonnances ne les alourdissent pas.
- Fichiers : `src/app/services/commandesVerreService.ts`,
  `src/app/hooks/useCommandesVerre.ts`, `src/app/pages/CommandeVerreTab.tsx`,
  `src/app/pages/AtelierPage.tsx`, `src/app/layouts/MagasinLayout.tsx`
  (message + icône), `src/app/layouts/MainLayout.tsx` (icône « à confirmer »),
  route `/magasin/:magasinId/atelier`.

## Vérifications effectuées

- 27 tests du service (commande, champs obligatoires, ordonnance dans le
  stockage ou, à défaut, dans la base, relecture des deux, listes par magasin,
  confirmation, arrivée, icône, « vue », autres magasins non prévenus, listes
  de bons et stock non touchés) ; tests précédents (34 + 47 + 28) toujours
  réussis.
- Script de stockage testé sur PostgreSQL 16 (stockage simulé) : refus d'une
  mauvaise base, installation relancée deux fois, dépôt accepté dans son
  magasin et refusé dans un autre, lecture limitée à ses magasins (assistante :
  ses magasins ; administration : tout), suppression réservée à
  l'administration, aucun accès sans connexion.
- Navigateur, parcours complet à trois comptes (conseillère de BOUAKÉ,
  assistante administrative, conseillère d'ABOBO), avec stockage puis sans
  stockage installé, plus les droits (conseillère : Passer commande seule ;
  assistante : Réception seule, même par lien direct ; administrateur : tout ;
  cases de Gestion des utilisateurs ; main donnée à une conseillère qui
  confirme ; assistante avec Passer commande cochée) : 38/38.
- Droits par rôle et par case : 15 tests.
- Compilation de production et vérification des types : sans nouvelle erreur.
