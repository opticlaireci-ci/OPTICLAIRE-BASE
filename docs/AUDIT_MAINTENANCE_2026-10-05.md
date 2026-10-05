# OPTICLAIRE — Audit et maintenance approfondie (5 octobre 2026)

Périmètre : application web (React/Vite, ≈ 68 000 lignes), fonction serveur
Supabase (Edge Function), base de données (règles RLS, scripts SQL),
dépendances, configuration de déploiement (Vercel).

---

## 1. Corrigé dans cette maintenance

| # | Gravité | Problème | Correction | Vérification |
|---|---|---|---|---|
| 1 | **Élevée** | **Faille XSS à l'impression.** Factures, reçus et états sont imprimés via une page HTML contenant les données saisies ou importées (noms de clients…). Cette page n'était pas isolée : un nom piégé (ex. `<img onerror=…>`, par exemple venant d'un PDF importé) s'exécutait avec les droits de l'application, avec accès à la session de l'utilisateur. | La page d'impression est placée dans un bac à sable (`sandbox`) qui interdit tout script. L'impression fonctionne comme avant. | Testé dans Chromium : **sans** correctif, le script s'exécute ; **avec**, il est bloqué et l'impression est bien appelée. |
| 2 | Moyenne | **Faux message « Enregistrement échoué ».** Dans la fiche d'une vente, enregistrer la date de RDV / récupération ou ajouter un SAV appelait une fonction inexistante (`setVentes`). La donnée était bien enregistrée, puis l'écran affichait une erreur. | Appels supprimés ; la liste se met déjà à jour toute seule. | Compilation + l'erreur TypeScript « Cannot find name » a disparu (3 occurrences). |
| 3 | Faible | **Nom du magasin invisible** sur la page « Choisir un magasin » (champ `nom` inexistant). | Affiche `label` (le vrai nom) et le téléphone. | Compilation. |
| 4 | Moyenne | **Dépendances vulnérables** : `react-router` 7.13.0 (avis XSS / redirections), `dompurify` 3.4.14 (XSS, utilisé par jsPDF). | `react-router` → 7.18.4, `dompurify` → 3.4.16. | `npm audit` : ces alertes ont disparu ; build OK. |
| 5 | Faible | **Code mort** : `ModalPortal.tsx`, `config/theme.ts`, `utils/printInApp.ts` (ce dernier contenait la même fenêtre d'impression non protégée). | Fichiers supprimés. | Aucun import ; build OK. |

Corrections des jours précédents (même campagne de maintenance) : connexions
Supabase, lecture paginée au-delà de 1 000 lignes, totaux des anciens dossiers,
doublons, filtrage par magasin, règles RLS accélérées, PDF retirés de la base,
copie locale sans limite (IndexedDB), mini-tableau mensuel, modes de paiement.

---

## 2. Vérifié et conforme

| Domaine | Constat |
|---|---|
| **Fonction serveur** | Toutes les routes de données exigent un vrai jeton utilisateur (`requireUser` / `getScope`) ; routes d'administration réservées aux admins (`requireAdmin`) ; création du propriétaire verrouillée une fois l'application initialisée. |
| **Rôles utilisateurs** | Table `kv_store` : un utilisateur ne lit que ses propres droits ; seuls les administrateurs modifient les rôles. Pas d'escalade de privilèges possible pour un employé. |
| **Isolation par magasin** | Ventes, clients, règlements, assurances, inventaires… : RLS par magasin (un employé ne voit que ses magasins). |
| **Secrets** | Aucune clé `service_role` dans le code de l'application ; seule la clé publique (« anon »), prévue pour ça. |
| **En-têtes de sécurité (Vercel)** | CSP stricte (`script-src 'self'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` : très bon niveau. |
| **Journaux** | Les `console.log` sont coupés en production (`logger`). |
| **Performance du chargement** | Pages chargées à la demande (lazy routes) ; bibliothèques lourdes (PDF, Excel) chargées seulement quand on exporte. |

---

## 3. Points restants et recommandations

| # | Priorité | Sujet | Recommandation |
|---|---|---|---|
| A | **Haute** | Scripts SQL à exécuter (si pas encore fait) : `PERFORMANCE_SUPABASE.sql`, `NETTOYAGE_RESTES.sql` (+ `VACUUM FULL public.app_data;`). | Les lancer dans le SQL Editor. |
| B | Moyenne | **`xlsx` 0.18.5** (lecture/écriture Excel) : 2 vulnérabilités connues (pollution de prototype, ReDoS) **sans correctif sur npm**. Concerne surtout l'**import** de fichiers Excel. | Remplacer par la version officielle corrigée de SheetJS (0.20.3, distribuée sur cdn.sheetjs.com — inaccessible depuis mon environnement). En attendant : n'importer que des fichiers Excel de confiance. |
| C | Moyenne | **`app_data` modifiable par tout utilisateur connecté** (réglages globaux : liste des magasins, paramètres de connexion, catalogues). Un employé mal intentionné pourrait modifier un réglage global. | Restreindre l'écriture des clés sensibles aux administrateurs (chantier à préparer soigneusement pour ne rien bloquer). |
| D | Faible | 389 MB de **fichiers orphelins** laissés par l'incident « disque plein ». Sans effet sur le fonctionnement. | Demander au support Supabase de les supprimer (message prêt dans la conversation). |
| E | Faible | 60 **erreurs de typage** TypeScript restantes : surtout des types imprécis, sans effet à l'exécution (les vraies erreurs ont été corrigées). | Nettoyage progressif. |
| F | Faible | **`VenteFacturePage.tsx` = 5 786 lignes** : difficile à maintenir, risque d'erreurs lors des modifications. | Découper en composants (liste, fiche, formulaire, impressions). |
| G | Faible | **Aucun test automatique.** | Ajouter des tests sur les calculs critiques (totaux, reste à payer, lecture des PDF d'anciens dossiers). |
| H | Info | **Sauvegardes.** | Vérifier dans Supabase → Database → Backups que les sauvegardes quotidiennes sont actives (offre Pro). |
| I | Info | Webhook SMS Orange (`/sms/dr`) public par nature (accusés de réception). | Acceptable ; il n'écrit que des statuts de SMS. |
