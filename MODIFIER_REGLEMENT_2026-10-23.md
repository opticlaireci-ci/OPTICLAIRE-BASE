# Modifier un règlement (Détails Vente | Facture → Règlement) — 23/10/2026

## Qui peut modifier un règlement

| Utilisateur | Modifier un règlement |
|---|---|
| **Super administrateur** | oui, toujours |
| **Administrateur** | oui, toujours |
| **Assistante administrative** (nouveau rôle) | oui, toujours |
| Tout autre utilisateur (conseillère, opticien, caissier, comptable, directeur…) | **seulement si la case est cochée** |

La case se trouve dans **Gestion des Utilisateurs → (utilisateur) → Accès aux boutons → « Droits particuliers » → « Modifier un règlement »**.

- Cocher la case donne le droit à l'utilisateur ; la décocher le lui retire.
- Pour l'assistante administrative, les administrateurs et le super administrateur, la case est cochée d'office et grisée (« inclus dans son rôle »).
- La case ne change rien au menu de l'utilisateur.

## Où et comment

1. Ouvrir **Ventes | Factures** dans le magasin, puis le détail d'une facture (bouton « … »).
2. Cliquer sur **« 💰 Réglement »**.
3. Dans « Détails Règlements », chaque ligne a un bouton **« ✏️ Modifier »** :
   - sur un **règlement** : on corrige le montant, le mode de paiement, le compte, les détails et la date (l'heure d'origine est gardée) ;
   - sur l'**acompte versé avec la facture** : on corrige le montant, le mode de paiement, le compte et les détails (sa date reste celle de la facture).
4. Pendant la saisie, la fenêtre affiche le **reste à payer après correction**.
5. Si le total payé dépasserait le total de la facture, une confirmation est demandée.

Ce qui ne change jamais :

- le **numéro de reçu** ;
- la **facture** et le **magasin** du règlement.

## Traçabilité

- Le **journal** (audit) garde chaque correction, avec l'ancienne et la nouvelle valeur. Exemple : « Règlement modifié (reçu 00142) — montant : 45 000 F → 40 000 F ; mode de paiement : Espèce → WAVE ».
- Dans le tableau des règlements, la ligne corrigée indique **« Modifié par … »**.
- Le reste à payer, la caisse, les reçus et les autres écrans prennent la nouvelle valeur.
- **Coupure réseau** pendant l'enregistrement : la correction est gardée sur l'appareil et envoyée automatiquement au retour de la connexion.

## Nouveau rôle « Assistante administrative »

- Il se choisit dans Gestion des Utilisateurs, comme les autres rôles.
- L'assistante travaille dans les magasins auxquels elle est rattachée : après connexion, elle arrive sur l'accueil de son magasin. Elle voit les menus du magasin, sauf si vous les limitez avec les cases « Accès aux boutons ».
- Elle peut **modifier** les règlements. Les boutons « Acompte » et « Bon Assurance » restent réservés aux rôles qui encaissaient déjà. La **suppression** d'un règlement reste réservée aux administrateurs.

## Base de données

Aucune modification n'est nécessaire : les droits déjà en place dans Supabase laissent un utilisateur modifier les règlements de ses magasins. L'application vérifie qui a le droit de les modifier.

## Vérifications

- **25 tests de logique** :
  - qui a le droit, selon le rôle et la case ;
  - la case ne restreint pas le menu ;
  - écriture complète du règlement, « modifié par », journal avant → après ;
  - cache, changement de date, coupure réseau, échec.
- **22 contrôles dans le navigateur** :
  - assistante : correction d'un règlement et de l'acompte, base, journal, tableau ;
  - conseillère sans puis avec la case ;
  - caissier sans puis avec la case ;
  - administrateur et super administrateur ;
  - Gestion des utilisateurs : rôle proposé, case d'office pour l'assistante, case cochée pour une conseillère et enregistrée.
- **Tests des livraisons précédentes**, tous réussis :
  - droits des conseillères et opticiens : 17 ;
  - stock réel : 34 tests de logique et 16 contrôles dans le navigateur.
