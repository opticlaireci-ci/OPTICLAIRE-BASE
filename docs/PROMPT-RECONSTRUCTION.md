# 🧬 Prompt maître — Reconstruire OPTICLAIRE de A à Z

> À copier-coller dans un **nouveau projet Figma Make** pour régénérer l'application.
> C'est une description fonctionnelle complète : adaptez le nom du client si besoin.

---

## PROMPT (à copier tel quel)

Construis une application web complète de **gestion pour une chaîne de magasins d'optique**, nommée **OPTICLAIRE**. C'est un logiciel de back-office multi-magasins utilisé par une enseigne d'optique (direction + magasins). Interface **en français**, responsive, orientée bureau (desktop) car c'est un outil de gestion.

### Pile technique
- **React 18 + TypeScript + Vite**, routage avec **react-router v7** (createBrowserRouter, routes en lazy-loading).
- **Tailwind CSS v4** pour le style, avec en complément **Material UI (@mui/material + @mui/icons-material)** pour la barre de navigation, les menus latéraux et certains composants.
- Icônes : **lucide-react** (et @mui/icons-material pour le menu).
- Graphiques : **recharts**. Export PDF : **jspdf + jspdf-autotable**. Export Excel/CSV : **xlsx**.
- Backend : **Supabase** (connexion via la carte Supabase de Figma Make). Les données sont stockées dans un **magasin clé/valeur** (table `kv_store_*`) via une **edge function** Supabase, avec une couche de compatibilité type Firestore (`collection`, `doc`, `getDocs`, `query`, `where`). L'authentification utilise **Supabase Auth**.

### Configuration centrale de l'enseigne (multi-clients)
- Créer un fichier `src/app/config/tenant.ts` exportant un objet `TENANT` : `nom`, `nomComplet`, `siege { adresse, telephone, email, ville }`, `emailProprietaire`, `magasins: [{ id, label }]`, `devise` (ex. `'FCFA'`), `visuels { logo, accueil, logoNoel }`.
- Toute l'interface (menus, factures, reçus, PDF, écran de connexion) affiche le nom via `TENANT` — jamais de nom écrit en dur.
- Fonctions utilitaires : `nomMagasin(id)` → « OPTICLAIRE ABOBO », `sansEnseigne(label)`, `libellesMagasins()`.
- Prévoir un override runtime : `TENANT` peut être remplacé par une config enregistrée dans le localStorage (édité depuis un écran d'administration), appliqué au rechargement.

### Authentification & rôles
- Écran de connexion (email + mot de passe) avec logo + grande photo d'ambiance, session Supabase persistante (survit à F5), expiration ~15 min.
- Premier lancement : un écran de configuration crée le **compte administrateur** (email = `OWNER_EMAIL` côté edge function).
- Rôles hiérarchiques : `super_admin`, `admin`, `manager`, `employee`, `caissier`, `guest`. Chaque utilisateur est rattaché à un ou plusieurs magasins avec un rôle. Permissions fines par bouton/menu (`menuAccess`).
- Comptes de démonstration (administrateur, conseillère, directeur, comptable).

### Structure de navigation (menu latéral, layout principal `MainLayout`)
Barre supérieure avec raccourcis (Emploi du temps, compteur SMS, badges), indicateur de synchronisation. Menu latéral repliable en accordéon avec ces sections :

1. **Accueil** — page d'accueil personnalisable par l'admin (titre + message + blocs d'annonces, synchronisés pour tous).
2. **Tableau de Bord** — analytics (chiffres clés, graphiques recharts).
3. **Espace Administrateur** :
   - Accès Magasins (grille des magasins, entrer dans chacun)
   - Ajouter/Modifier Magasins
   - RDV Retrait, RDV En Ligne (rendez-vous globaux)
   - Géolocalisation des magasins
   - Base de Données Client (globale, import/export CSV)
   - Gestion Utilisateurs, Gestion Profils
   - Synchronisation
   - Paramétrage : Configuration, **Configuration de l'enseigne** (renommer l'enseigne + réinitialiser + effacer cache/session), Condition Commerciale, Message SMS
4. **Gestion Comptabilité** :
   - Assurance : Facture, Relevé, Règlement
   - Fournisseur : Relevé de Commande, Règlement Verrier, Règlement Fournisseur
   - Prestation
   - Mouvement : Entrée/Sortie, Récap Hebdomadaire
   - Caisse Tous Magasins : Mouvements Caisse Global
5. **Gestion Composants** (catalogue produit) : Montures, Accessoires, Services, Verres, Traitements, + Catégories, Marques, Couleurs, Tailles, Familles, Types de verre, Matières, Diamètres.
6. **Gestion Stocks** : Bon de Commande, de Livraison, de Distribution, de Transfert, de Retour, de Péremption-Casse, Inventaire Montures, Inventaire Lentilles, État de Stock.
7. **Recherche Monture et Accessoire**.
8. **Gestion des Acteurs** : Fournisseurs, Assurances, Prestataires, Ophtalmologues, Cabinets d'ophtalmologie, Modes de paiement, Comptes bancaires.
9. **Atelier** (montage), **Emploi du temps**, **Visualisation PDF et Excel**, **Historique**.

### Espace magasin (layout `MagasinLayout`, routes `/magasin/:magasinId/...`)
Chaque magasin a son propre espace :
- Accueil, Dashboard magasin
- **Gestion Commercial** : Demande de devis, Devis/Proforma, Vente Flash, Vente Facture, Recouvrement, Fiche de montage
- **Gestion Clientèle** : Clients (fiche complète : nom, téléphones, email, adresse, profession, date de naissance, assurance/matricule, entreprise, solde ; import/export CSV ; SMS de bienvenue/anniversaire/retrait), RDV Retrait, RDV En Ligne, Call Center
- **Gestion de Stock** (par magasin) : Bon de Distribution, de Transfert, de Retour, État de Stock
- **Mouvements de Caisse**

### Fonctionnalités transversales
- **Ventes/Factures et Devis/Proforma** partagés (même collection), avec règlements associés, recouvrement, calcul de soldes.
- **Impression PDF** (factures, reçus, relevés) avec en-tête reprenant les coordonnées du siège depuis `TENANT`.
- **Export/Import CSV** (séparateur `;`, UTF-8 avec BOM) pour clients, fournisseurs, assurances, ophtalmologues, cabinets — moteur générique de colonnes.
- **SMS** : messages types configurables (bienvenue, anniversaire, retrait, vente) avec variables ; compteur de crédits SMS.
- **Synchronisation temps réel** entre navigateurs/appareils via Supabase, avec hydratation au démarrage et **garde anti-perte de données** : si le serveur renvoie vide mais que le cache local contient des données, on préserve le cache local.
- **Réinitialisation** (admin) : purge ventes / règlements / clients, par magasin ou global, avec confirmation par mot-clé.

### Style & tokens
- Palette bleutée/clinique (bleus `#1a6f8c`, `#3b82f6`, fonds clairs `#d6e4ea`, blanc), accents verts/violets pour badges. Cartes à bord noir marqué dans l'espace admin. Interface dense et professionnelle.
- Centraliser les couleurs dans les tokens CSS du thème.

### Contraintes importantes
- Ne jamais écrire le nom du client en dur : tout vient de `TENANT`.
- Ne pas exposer la clé `service_role` ni l'objet auth Supabase sur `window`.
- Créer des données d'exemple réalistes (magasins, catalogue montures/verres, quelques clients et ventes) pour que l'app soit démontrable.

Construis l'application complète, fonctionnelle et navigable, en respectant cette structure.

---

## Notes d'utilisation

- Ce prompt régénère **une nouvelle application** proche de l'originale, mais Figma Make ne reproduira jamais **au pixel/à la ligne près** votre code actuel. Pour une copie **identique**, dupliquez plutôt le projet existant (voir `docs/AJOUTER-UN-CLIENT.md`).
- Après génération : connectez Supabase, puis renseignez `tenant.ts` (ou l'écran « Configuration de l'enseigne »).
