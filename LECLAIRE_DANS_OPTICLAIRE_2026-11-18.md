# LECLAIRE dans OPTICLAIRE — 18/11/2026

LECLAIRE (la caisse des ouvertures de magasins, de la caution aux travaux, et
des missions des employés) s'ouvre maintenant **depuis OPTICLAIRE**, avec le
même compte, mais garde **ses propres données** : rien de ce qui est saisi
dans LECLAIRE n'apparaît dans OPTICLAIRE (ventes, caisse « Mouvements
Entrées/Sorties » des magasins, stock…), et inversement.

## Mise en route (dans cet ordre)

1. **Base de données (une fois)** : Supabase, projet **OPTICLAIRE** → SQL
   Editor → New query → coller **tout** le fichier
   `supabase/LECLAIRE_CAISSE_2026-11-18.sql` → **RUN**. Le résultat doit
   afficher : Tables LECLAIRE **6 / 6**, Règles d'accès des tables
   **15 / 15**, Espace des justificatifs **leclaire-justificatifs (privé)**,
   Règles d'accès des justificatifs **4 / 4**. Le script ne modifie aucune
   donnée d'OPTICLAIRE et peut être relancé sans risque.
2. **Déployer le site** avec ce ZIP, comme d'habitude. Aucune fonction serveur
   à redéployer pour LECLAIRE. (Rappel : si ce n'est pas encore fait, la
   fonction serveur du ZIP 33 reste à redéployer pour les SMS.)
3. **Donner l'accès** : Gestion des utilisateurs → fiche de la personne →
   onglet **« Accès aux boutons »** → bloc **LECLAIRE** :
   - **Accès LECLAIRE** : la personne saisit ses entrées et dépenses et ne
     voit que les siennes ;
   - **Administrateur LECLAIRE** : voit et gère tout LECLAIRE (coche aussi
     l'accès).
   Les administrateurs et le super administrateur d'OPTICLAIRE y ont accès
   d'office. Une personne ne peut pas se donner ces droits elle-même.
4. **Reprendre les anciennes données** (administrateur) : menu **LECLAIRE** →
   ☰ → **Reprise des données** → **1. Lire l'ancienne base LECLAIRE** →
   vérifier le compte OPTICLAIRE proposé pour chaque personne (même e-mail,
   sinon même nom) → **3. Lancer la reprise**. Gardez la page ouverte jusqu'au
   rapport.
5. Vérifiez quelques mouvements et justificatifs, puis **arrêtez d'utiliser
   l'ancienne application**. Si des saisies y ont encore été faites entre-temps,
   relancez la reprise : seules les nouvelles sont ajoutées. Une fois tout
   vérifié, mettez l'ancien projet Supabase en pause : sa clé publique permet à
   n'importe qui de modifier ses données.

## La reprise des données

- Repris : mouvements (montants, dates, magasins, catégories, modes de
  paiement, bénéficiaires, commentaires, dates de saisie d'origine),
  **justificatifs** (photos et PDF, rangés dans l'espace privé), magasins,
  catégories, paramètres (case à cocher) et historique.
- **Pas repris : les mots de passe** de l'ancienne application. Chacun se
  connecte avec son compte OPTICLAIRE.
- L'ancienne base est seulement **lue** : rien n'y est modifié ni supprimé.
- **Rejouable sans doublon** : un mouvement déjà repris n'est pas réécrit (les
  corrections faites depuis dans OPTICLAIRE sont gardées) ; seul un
  justificatif qui n'avait pas pu être repris est retenté.
- Une ancienne personne **sans compte OPTICLAIRE** est reprise avec ses
  mouvements, visibles par l'administration. Pour les lui rendre visibles :
  créez-lui un compte, cochez « Accès LECLAIRE », puis LECLAIRE →
  Utilisateurs → **Rattacher à un compte**.
- Un mouvement sans auteur va au premier administrateur de l'ancienne
  application ; un mouvement d'un utilisateur supprimé est repris sous
  « Ancien utilisateur… ». Un mouvement illisible (type inconnu) ou un
  justificatif de format non accepté est signalé dans le rapport.
- Si l'ancienne base ne répond pas (projet en pause) : la redémarrer dans
  Supabase, ou utiliser le **fichier de secours** (lien « Adresse de l'ancienne
  base / fichier de secours » : exécuter
  `select json_agg(t) from kv_store_7bfd382c t;` dans l'ancien projet et
  enregistrer le résultat dans un fichier .json).

## Ce qui ne change pas

Les mêmes écrans que l'application LECLAIRE : tableau de bord, mouvements
(filtres, export Excel/CSV, impression), magasins LECLAIRE (liste propre à
LECLAIRE), statistiques, catégories, justificatifs, historique, paramètres
(devise, découvert, justificatif obligatoire, nom). Les mêmes règles :

- un utilisateur ne voit que ses mouvements et ne peut ni les modifier ni les
  supprimer ; l'administration voit tout, modifie, réaffecte, supprime et peut
  « voir les données de » chaque personne ;
- **découvert interdit** (si le paramètre est sur « interdit ») : un employé ne
  peut enregistrer une dépense que si son solde (ses entrées moins ses
  sorties) le permet — l'administration lui affecte d'abord l'avance de
  mission (entrée affectée à la personne), comme avant ;
- justificatif : photo ou PDF de 3 Mo au plus.

## Ce qui change

- Plus d'écran de connexion LECLAIRE ni de mots de passe enregistrés en clair :
  le compte OPTICLAIRE suffit. **« ← OPTICLAIRE »** (en haut) ramène à
  OPTICLAIRE.
- L'écran **Utilisateurs** de LECLAIRE ne crée plus de comptes : il liste les
  personnes, leurs chiffres, « Voir données », et permet de rattacher une
  ancienne personne à un compte. Les accès se donnent dans Gestion des
  utilisateurs.
- Le bouton **« Réinitialiser l'application »** (qui effaçait tout, comptes
  compris) a été retiré.
- Les droits sont vérifiés par la **base de données** (et non plus seulement
  par l'écran) : même en contournant l'écran, un utilisateur ne peut lire que
  ses mouvements et justificatifs.
- Chaque mouvement est enregistré séparément : deux personnes qui saisissent
  en même temps ne s'écrasent plus. Les autres postes voient les nouveautés
  toutes les 2 minutes, ou en revenant sur la page.
- Une action refusée (droits) affiche un message au lieu d'un faux « succès ».

## Affichage sur ordinateur et sur téléphone (correctif du 18/11/2026)

- **Ordinateur** : LECLAIRE occupe toute la largeur de l'écran, avec le menu
  toujours affiché à gauche (Tableau de bord, Mouvements, Magasins,
  Statistiques, Catégories, Justificatifs, et pour l'administration :
  Historique, Utilisateurs, Reprise des données, Paramètres ; en bas : Retour à
  OPTICLAIRE, Déconnexion). Avant, l'application LECLAIRE affichait une colonne
  de téléphone au milieu de l'écran : les cartes du tableau de bord y étaient
  trop étroites et leurs textes disparaissaient.
- **Téléphone** : présentation de l'application LECLAIRE (menu par ☰, barre du
  bas). Les règles d'adaptation au téléphone propres aux écrans d'OPTICLAIRE
  (grilles sur une colonne, en-tête qui passe à la ligne, fenêtres collées en
  haut, titres agrandis, mots coupés) ne s'appliquent plus à l'intérieur de
  LECLAIRE ; les écrans d'OPTICLAIRE ne changent pas. Les petites cartes du
  tableau de bord affichent leur texte en entier (icône au-dessus du texte).
- Vérifié sur tous les écrans LECLAIRE, à 1 440 px (ordinateur) et 390 px
  (téléphone) : aucun débordement, menu et barre du bas comme prévu, aucune
  violation de la politique de sécurité (26/26).

## Importer un fichier de mouvements (19/11/2026)

Administration LECLAIRE : menu **Importer un fichier**, ou bouton
**« ↑ Importer »** à côté de « Excel / CSV » dans Mouvements.

1. **Choisir le fichier** : CSV (comme l'export « Excel / CSV » de LECLAIRE,
   par exemple `leclaire_mouvements_2026-08-23.csv`) ou tableau Excel (.xlsx,
   .xls). Colonnes reconnues par leur titre, dans n'importe quel ordre :
   Date, Type, Description, Catégorie, Mode de paiement,
   Bénéficiaire/Source, Entrée, Sortie (ou Montant), Commentaire, et si
   elles existent Magasin et Personne. Dates jj/mm/aaaa ou aaaa-mm-jj,
   montants « 1 200 000 », « 1.200.000 » ou « 15000 FCFA » ; un CSV
   réenregistré par Excel garde ses accents.
2. **Ce que LECLAIRE a reconnu** : rien à créer ni à choisir avant. LECLAIRE
   trouve seul le magasin de chaque ligne (voir « Reconnaissance automatique »
   ci-dessous) et la personne : colonne « Personne » du fichier, sinon la
   personne habituelle du magasin, sinon vous. Pour le fichier d'un
   employé, choisir l'employé dans la liste **Personne**. Les
   magasins reconnus qui n'existent pas encore dans LECLAIRE sont listés
   (« LECLAIRE BOUAKÉ (76 lignes) ») et **créés automatiquement à l'import**
   (case cochée par défaut). Un magasin par défaut reste possible pour les
   lignes où rien n'est reconnu.
3. **Vérifier les lignes** : chaque ligne indique son magasin et pourquoi
   (« cité dans la ligne », « même période (ligne 12) », « colonne
   Magasin »). Le magasin de chaque ligne reste modifiable. Une ligne déjà
   dans LECLAIRE est **décochée** (« Déjà dans LECLAIRE ») ; une ligne déjà
   dans LECLAIRE **avec un autre montant** (ligne corrigée depuis) est
   signalée avec l'ancien montant et décochée ; une ligne illisible est
   signalée avec la raison. Deux lignes identiques du fichier (deux taxis le
   même jour) restent deux mouvements.
4. **Importer** : rapport par magasin. Les catégories nouvelles du fichier
   sont ajoutées. **Le même fichier importé deux fois n'ajoute rien la
   seconde fois.**

L'export **« Excel / CSV »** ajoute maintenant les colonnes **Magasin** (et
**Personne** pour l'administration) : un fichier exporté se réimporte dans le
bon magasin.

Avec le fichier `leclaire_mouvements_2026-08-23_2.csv` : 77 mouvements lus
(4 entrées pour 840 000 FCFA, 73 sorties pour 34 981 600 FCFA), aucune ligne
illisible ; sans rien préparer : **76 à LECLAIRE BOUAKÉ** (dont la caution de
7 700 000), **1 à LECLAIRE BINGERVILLE** (la caution de 15 000 000), les deux
magasins créés à l'import.

Avec le fichier `leclaire_mouvements_2026-09-02.csv` (89 mouvements, 1 040 000
FCFA d'entrées, 35 237 700 FCFA de sorties) : **88 à LECLAIRE BOUAKÉ** (dont
« Achats de tickets retour Abidjan » du 24 août, fin de mission), **1 à
LECLAIRE BINGERVILLE**. Importé après le premier : 76 lignes déjà dans
LECLAIRE, **12 nouvelles**, et 1 ligne corrigée signalée (« ACHAT DE CIMENT
SUPLEMENTAIRE » du 23/08 : 20 000 dans LECLAIRE, 22 500 dans le fichier ;
décochée, à cocher si le nouveau montant doit s'ajouter).

## Reconnaissance automatique des magasins (19/11/2026)

**Comment LECLAIRE trouve le magasin d'une dépense**, dans cet ordre :

1. **Le magasin cité dans la ligne** : « CAUTION MAGASIN BINGERVILLE »,
   « LOYER MAGASIN DE BOUAKE », « boutique de Yopougon Gandi »… Description,
   commentaire et bénéficiaire sont lus **séparément** (« …au magasin » suivi
   du bénéficiaire « TAXI MOTO » ne crée pas de magasin « TAXI MOTO »).
   Accents et majuscules ignorés ; le nom le plus précis gagne (YOPOUGON GANDI
   plutôt que YOPOUGON) ; deux magasins cités dans la même ligne : rien n'est
   décidé seul. Abidjan n'est jamais un magasin.
2. **Le nom d'une ville ou d'un magasin connu** : magasins LECLAIRE, puis
   magasins d'OPTICLAIRE, puis villes de Côte d'Ivoire.
3. **La période** : une dépense qui ne cite aucun magasin (taxi, repas,
   ciment…) va dans le magasin cité le plus près dans le temps **par la même
   personne** (45 jours au plus). Tout le chantier de Bouaké du fichier
   d'août est ainsi rangé à Bouaké.

**Nom des magasins créés** : comme dans OPTICLAIRE (« LECLAIRE BOUAKÉ »,
« LECLAIRE MAN ») ; une ville qui n'est pas encore un magasin d'OPTICLAIRE
suit la même règle (« LECLAIRE YAMOUSSOUKRO »). Un magasin LECLAIRE qui
existe déjà (même s'il s'appelle « Bouaké » ou « Magasin de Bouaké ») est
réutilisé, jamais doublé.

**Où c'est utilisé** :

- **Import d'un fichier** (ci-dessus).
- **Écran Magasins (administration)** : un cadre **« Classement automatique »**
  apparaît s'il existe des mouvements sans magasin. Il propose un magasin
  pour chacun, avec la raison (« cité dans le mouvement », « même personne,
  même période ») ; « Voir le détail » pour décocher ce qui ne convient pas,
  puis **« Classer N mouvements »** : les magasins manquants sont créés et
  les mouvements rangés (inscrit au journal).
- **Saisie d'une entrée ou d'une sortie** : le magasin est rempli seul avec
  celui du **dernier mouvement de la personne** ; si la description, le
  commentaire ou le bénéficiaire cite un autre magasin LECLAIRE, il est pris
  à la place (petit texte vert sous la liste). Un magasin choisi à la main
  n'est **jamais** remplacé.
- **Dépenses par utilisateur dans chaque magasin** : le détail d'un magasin
  (« Voir les dépenses ») montre **« Par personne »** : nombre de mouvements,
  sorties et entrées de chacun.

## Logos des fêtes allégés (19/11/2026)

Les 7 logos des fêtes (Pâques, Indépendance, fin d'année, Tabaski, Carême,
Noël, Noël de l'enseigne) passent de 1 254 à 512 pixels de côté (affichés au
plus à 124 pixels) : **10,4 Mo → 2,0 Mo**, sans différence visible. Mêmes noms
de fichiers, aucun autre changement.

## Technique

- `supabase/LECLAIRE_CAISSE_2026-11-18.sql` : tables `leclaire_caisse_*`
  (mouvements, utilisateurs, magasins, catégories, réglages, journal), règles
  d'accès, fonctions `leclaire_caisse_role/entree/comptes/rattacher`, espace
  privé `leclaire-justificatifs` (chemin `<personne>/<mouvement>/<fichier>`).
- `src/app/leclaire/` : écrans repris de LECLAIRE (styles limités à LECLAIRE),
  `leclaireService.ts` (lecture / écriture), `reprise.ts` (reprise des
  données), `components/Reprise.tsx`, `components/Fichier.tsx`
  (justificatifs chargés à la demande), `reconnaissance.ts` (reconnaissance
  des magasins), `classement.ts` + `components/ClassementAuto.tsx`
  (classement des mouvements sans magasin), `importFichier.ts` +
  `components/ImportFichier.tsx` (import de fichier).
- `src/app/pages/LeclairePage.tsx`, route `/leclaire`, entrée « LECLAIRE » des
  menus (OPTICLAIRE et magasin), cases de Gestion des utilisateurs
  (`droit:leclaire`, `droit:leclaire-admin`, `src/app/utils/actionRights.ts`).
- Aucune clé du navigateur commençant par `leclaire_` n'est créée : rien n'est
  envoyé par la synchronisation d'OPTICLAIRE.

## Vérifications effectuées

- Base de test reproduisant Supabase (comptes, droits OPTICLAIRE, stockage) :
  script exécuté deux fois sans erreur ; **59/59** contrôles de droits
  (utilisateur, administrateur LECLAIRE par la case, administrateur
  OPTICLAIRE, compte sans accès, accès anonyme, données OPTICLAIRE intactes).
- Code réel de LECLAIRE (service + reprise) contre cette base, avec les vraies
  requêtes de la bibliothèque Supabase : **63/63** (saisie avec justificatif,
  refus signalés, réaffectation, suppression avec le fichier, reprise
  complète, reprise relancée sans doublon, corrections gardées, personne sans
  compte rattachée ensuite).
- Navigateur, site de production avec sa politique de sécurité : **22/22**
  (menu, ouverture, lecture de l'ancienne base, reprise, photo affichée,
  nouvelle dépense avec photo, utilisateurs, retour à OPTICLAIRE, cases de
  Gestion des utilisateurs, conseillère avec et sans accès), aucune violation
  de la politique de sécurité. Compilation de production : sans erreur.
- Corrigé pendant les tests : photos « image/jpg » refusées par le stockage,
  reprise bloquée par une personne sans date de création, actions refusées
  affichées comme réussies, justificatifs gardés en mémoire d'un compte à
  l'autre sur le même poste.
- Import de fichier (19/11/2026) : **29/29** (fichier réel de 77 lignes,
  totaux, magasin cité dans la ligne, doublons, montants et dates, Excel,
  CSV réenregistré par Excel, export avec colonne Magasin, import réel puis
  réimport sans doublon, refus pour un utilisateur simple) ; navigateur avec
  la politique de sécurité : **12/12** (bouton « ↑ Importer », création des
  magasins, ligne Bingerville détectée, 76 / 1 mouvements par magasin, écran
  Magasins, réimport « 0 à importer », export avec colonnes Magasin et
  Personne). Tous les contrôles précédents repassés sur cette version.
- Reconnaissance automatique (19/11/2026) : **42/42** (les deux fichiers
  réels : 76 / 1 puis 88 / 1, période, nom le plus précis, deux magasins
  cités, champs lus séparément, Abidjan ignoré, magasins existants
  réutilisés, ligne corrigée signalée, 12 nouvelles lignes, classement des
  mouvements sans magasin, magasin proposé à la saisie, noms « LECLAIRE X »)
  ; navigateur avec la politique de sécurité : **17/17** (premier fichier
  sans rien préparer, magasins créés seuls, second fichier sans doublon,
  classement automatique avec création de LECLAIRE MAN, détail par
  personne, saisie avec magasin automatique, choix manuel jamais remplacé)
  et l'import repassé : **12/12**. Tous les contrôles précédents repassés :
  59/59, 63/63, 29/29, 22/22, 26/26.
- Non testé ici : la vraie ancienne base (inaccessible depuis l'environnement
  de travail) ; elle est lue de la même façon depuis le navigateur.
