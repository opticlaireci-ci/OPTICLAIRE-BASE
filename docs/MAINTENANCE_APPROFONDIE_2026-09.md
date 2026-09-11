# Maintenance approfondie — OPTICLAIRE

## Correction principale

Le flux de vente enregistrait d'abord la vente puis créait la sortie de stock. Les mouvements utilisaient des identifiants comme `vte_FA-0004_ARTICLE`. Sur une base où `mouvements_stock.id` est de type UUID, Postgres pouvait refuser cette écriture alors que la vente était déjà enregistrée.

### Correctif livré

- Les mouvements utilisent désormais des UUID déterministes et stables.
- Le même mouvement est réutilisé lors des retries : pas de doublon après coupure réseau ou double-clic.
- La session Supabase est résolue avant l'écriture du stock.
- Chaque mouvement est relu après écriture pour confirmer sa présence côté serveur.
- Les distributions, transferts, ventes et retours utilisent tous la même stratégie d'identifiant.
- Les retries passent de 3 à 4 tentatives avec backoff progressif.
- Les alertes techniques internes du service stock ne doublonnent plus les alertes métier de l'écran.

## Maintenance base de données

Exécuter une seule fois :

`supabase/MAINTENANCE_STOCK_VENTES_2026-09.sql`

Ce script est non destructif : il ne supprime aucune vente ni aucun mouvement. Il remet le schéma/RLS/index en cohérence et affiche les anciennes sorties de vente incomplètes à contrôler.

## Points contrôlés dans le projet

- Authentification Supabase et résolution de session.
- Déconnexion après 10 minutes d'inactivité, y compris retour d'un onglet/mobile suspendu.
- Synchronisation et file d'attente des écritures réseau.
- Totaux vente : assurance exclue du total brut/net.
- Stock calculé à partir des mouvements et déduplication logique.
- Liste des magasins centralisée sur 9 magasins par défaut et migration des anciens identifiants.
- Synchronisation des ventes et cache local.
- Protection contre les doubles écritures.

## Vérification avant mise en production

1. Exécuter le SQL de maintenance dans Supabase SQL Editor.
2. Publier cette version du projet.
3. Tester une vente avec une monture.
4. Tester une vente avec plusieurs articles.
5. Tester une vente Flash.
6. Couper/rétablir le réseau pendant une vente et vérifier qu'aucun mouvement en double n'est créé.
7. Vérifier le stock sur mobile et desktop.
8. Vérifier que les 9 magasins apparaissent dans les écrans concernés.
9. Vérifier la déconnexion automatique après 10 minutes sans activité.
