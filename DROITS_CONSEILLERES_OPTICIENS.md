# Conseillères et opticiens : entrées et activités masquées (avec cases à cocher)

## Ce qui change

Pour une **conseillère** ou un **opticien** :

- **Mouvements Entrées et Sorties (magasin)** :
  - la page devient « Sorties de caisse » ;
  - elle n'affiche **plus aucune entrée** : ventes, règlements clients ou entrées saisies à la main ;
  - le bouton « Nouvelle Sortie » n'enregistre **que des sorties** : le type est imposé et seules les catégories de sortie sont proposées ;
  - les entrées ne sont même plus chargées dans cette page.
- **Tableau de bord du magasin** : les panneaux « Activité mensuelle » et « Activité annuelle » sont masqués. Les chiffres du jour, les informations devis et le rapprochement restent affichés.

Les autres rôles (administrateur, directeur, comptable…) voient tout, comme avant.

## Rendre l'accès plus tard : il suffit de cocher

**Gestion des Utilisateurs** → modifier l'utilisateur → onglet **Accès aux boutons** → encadré violet « Conseillères et opticiens : ce qu'ils peuvent voir » :

- ☐ Voir les entrées (Mouvements Entrées et Sorties)
- ☐ Voir l'activité mensuelle (tableau de bord du magasin)
- ☐ Voir l'activité annuelle (tableau de bord du magasin)

Chaque case est indépendante. Elle s'applique à la prochaine connexion de l'utilisateur, ou au plus tard quand il actualise la page.

Ces cases ne changent pas son menu. Si aucun bouton n'est coché, il garde le menu de son rôle.

## Déploiement

Seul le site change : il suffit de le republier.
- Aucune modification de la fonction Supabase.
- Aucun script SQL à exécuter.

Les cases sont enregistrées avec les accès aux boutons déjà existants (`menuAccess`, clés `voir:…`).

## Vérification

Un test dans le navigateur, sur le site compilé, a vérifié **17 points, tous réussis** :
- **Conseillère et opticien, sans case cochée** :
  - aucune entrée dans la liste, la sortie est affichée ;
  - le type « Sortie » est imposé dans le formulaire et une sortie s'enregistre ;
  - le tableau de bord n'affiche ni l'activité mensuelle ni l'activité annuelle.
- **Conseillère avec des cases cochées** :
  - les entrées réapparaissent ;
  - l'activité mensuelle cochée s'affiche, l'activité annuelle non cochée reste masquée ;
  - son menu n'est pas réduit.
- **Administrateur** :
  - il voit tout ;
  - les trois cases s'affichent dans Gestion des Utilisateurs et sont bien enregistrées.
