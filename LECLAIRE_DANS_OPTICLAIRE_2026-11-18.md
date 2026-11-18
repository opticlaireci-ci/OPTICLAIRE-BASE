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

## Technique

- `supabase/LECLAIRE_CAISSE_2026-11-18.sql` : tables `leclaire_caisse_*`
  (mouvements, utilisateurs, magasins, catégories, réglages, journal), règles
  d'accès, fonctions `leclaire_caisse_role/entree/comptes/rattacher`, espace
  privé `leclaire-justificatifs` (chemin `<personne>/<mouvement>/<fichier>`).
- `src/app/leclaire/` : écrans repris de LECLAIRE (styles limités à LECLAIRE),
  `leclaireService.ts` (lecture / écriture), `reprise.ts` (reprise des
  données), `components/Reprise.tsx`, `components/Fichier.tsx`
  (justificatifs chargés à la demande).
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
- Non testé ici : la vraie ancienne base (inaccessible depuis l'environnement
  de travail) ; elle est lue de la même façon depuis le navigateur.
