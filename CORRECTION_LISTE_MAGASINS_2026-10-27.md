# Liste des magasins — un magasin ajouté n'en disparaît plus (27/10/2026)

## Le problème signalé

« J'avais enregistré 12 magasins mais je me retrouve toujours avec 9 ; souvent
cela affiche 12 et après 9. »

Reproduit à l'identique avant correction (test navigateur) : un magasin est
ajouté (13 magasins, enregistrés sur le serveur), puis, après un passage d'un
autre poste ou une déconnexion, la liste retombe à 9 — sur le serveur et sur
tous les postes.

## Pourquoi la liste retombait à 9

La liste est rangée dans `app_data` (clé `leclaire_magasins`) et chaque poste en
garde une copie. Toute copie remplaçait l'autre, sans comparaison :

| # | Cause | Effet |
|---|---|---|
| 1 | À la **déconnexion**, toutes les données locales étaient effacées, la liste des magasins comprise | Au démarrage suivant, le poste repartait sur les **9 magasins de départ** |
| 2 | Au démarrage, l'application **réécrivait ces 9 magasins** dans la copie locale… | …et cette copie partait vers le serveur, **écrasant** les magasins ajoutés |
| 3 | Un second service de synchronisation **recopiait la valeur du serveur telle quelle** toutes les 30 s, et renvoyait toutes les clés locales | Une liste de 9 reçue remplaçait la liste de 12 du poste |
| 4 | Plusieurs écrans lisaient la liste **une seule fois** à leur chargement ; trois écrans (relevés et règlements d'assurance, relevés de commande) lisaient la **liste fixe de l'enseigne** (9) | Ces écrans restaient sur 9, même avec 12 magasins enregistrés |
| 5 | La suppression d'un magasin ne pouvait pas aboutir (la fusion le faisait revenir) | — |

## Ce qui a été corrigé

### Une liste qui ne perd jamais un magasin

- **Fusion sans perte** (`fusionnerMagasins`, `src/app/constants/magasins.ts`) :
  les copies sont réunies ; un magasin connu d'une seule copie est gardé ; pour
  un même magasin, la modification la plus récente l'emporte.
- **Suppression explicite** : « Supprimer » dans *Gestion des magasins* inscrit
  le magasin comme supprimé ; il ne revient plus depuis un autre poste. Le
  recréer (même identifiant) le fait revenir.
- **Plus jamais d'envoi automatique de la liste** : elle n'est envoyée au serveur
  que par `synchroniserMagasins` (`src/app/services/supabaseRealtime.ts`), qui
  relit le serveur, fusionne, puis écrit. Les deux services de synchronisation
  passent désormais par elle.
- **Plus d'écriture des 9 magasins au démarrage** : les magasins de la
  configuration sont lus à la volée, rien n'est réécrit.
- **La déconnexion ne l'efface plus** (ni l'identité de l'enseigne : ce ne sont
  pas des données personnelles).
- Si un poste reçoit une liste incomplète, il renvoie aussitôt la liste complète.
- Les magasins saisis dans *Configuration de l'enseigne* rejoignent aussi la
  liste partagée.

### Tous les écrans suivent la même liste, à jour

Nouveau crochet `useMagasins` (`src/app/hooks/useMagasins.ts`) : la liste est
relue à chaque changement, sans recharger l'application. Écrans corrigés :
choix du magasin, gestion des utilisateurs (attribution des magasins),
factures / relevés / règlements d'assurance, relevés de commande, règlement
verrier, mouvements, atelier, emplois du temps, géolocalisation, gérer un
magasin, inventaire, bons de distribution et de transfert, rendez-vous en ligne,
messages SMS.

### Gestion des magasins

- Identifiant du nouveau magasin nettoyé (minuscules, sans accents ni espaces).
- Les fiches « mobile » ne s'affichent plus en double sur ordinateur.
- Texte d'information mis à jour.

### Base de données — `supabase/PROTECTION_LISTE_MAGASINS_2026-10-27.sql`

À exécuter une fois (Supabase → SQL Editor → coller **tout** le fichier → RUN).
Idempotent.

- Diagnostic : liste enregistrée sur le serveur, et magasins utilisés dans les
  ventes, bons ou comptes utilisateurs mais **absents de la liste** (à recréer
  dans *Gestion des magasins* avec le même identifiant si besoin).
- Protection : toute écriture de la liste est fusionnée par la base elle-même ;
  une copie de 9 envoyée par un poste resté sur l'ancienne version ne retire
  plus rien. La ligne ne peut plus être supprimée.

## Vérifications effectuées

- PostgreSQL 16 local : sans protection, une liste de 9 écrase la liste de 12
  (reproduit) ; avec la protection, la liste reste à 12, la suppression
  explicite et le renommage récent s'appliquent, une suppression n'est pas
  annulée par un ancien poste, la ligne ne peut plus être supprimée, les autres
  réglages ne sont pas touchés ; script relancé deux fois sans erreur.
- Registre et synchronisation : 28 tests (fusion, suppression, ancien poste à
  9, déconnexion, nouveau poste, serveur injoignable).
- Tests du stock (lots 16 et 18) : 34 + 47, toujours réussis.
- Navigateur : version 18 3/8 (retombe à 9 après un ancien poste, après la
  déconnexion et sur un nouveau poste) ; version corrigée 8/8.
- Compilation de production et vérification des types : sans nouvelle erreur.
