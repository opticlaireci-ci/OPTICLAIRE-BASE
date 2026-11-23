# OPTICLAIRE — La même liste de magasins sur tous les appareils (2026-11-23)

## Le problème

L'iPhone affichait 9 magasins (les 9 de départ), l'ordinateur 12.

La liste des magasins est partagée par le serveur (ligne `leclaire_magasins`
des réglages), et chaque appareil en garde une copie. Trois trous laissaient
des magasins coincés sur un seul appareil :

1. **L'envoi au serveur n'avait lieu que dans certains cas** : en ouvrant
   « Gestion des magasins » ou la sélection du magasin, ou au démarrage, mais
   seulement si la liste existait déjà sur le serveur.
2. **Un envoi raté n'était jamais refait** : en cas de coupure ou de session
   expirée, le magasin restait sur l'appareil où il avait été saisi (le message
   « sera réessayée automatiquement » n'était pas vrai).
3. **Les magasins saisis dans « Configuration de l'enseigne »** s'affichaient
   sur l'appareil où ils avaient été saisis, mais ne partaient jamais dans la
   liste partagée.

Et une vieille copie de la liste gardée dans la file d'envoi (coupure réseau)
pouvait être rejouée plus tard et remplacer une liste plus complète.

## Ce qui change

- **À chaque démarrage, chaque appareil compare sa liste avec celle du
  serveur**, même si le serveur n'a pas encore de liste. Ce que l'appareil
  connaît en plus est envoyé ; ce que le serveur a en plus est ajouté sur
  l'appareil. Rien n'est perdu : les listes sont fusionnées.
- **Tout ajout, modification ou suppression part aussitôt au serveur**, quelle
  que soit la page. En cas d'échec (pas de réseau, session expirée), la
  modification reste marquée « à envoyer » et part toute seule : au retour du
  réseau, à la reconnexion, puis par nouveaux essais (15 s, 30 s… jusqu'à 5 min).
- **Application ouverte : la liste du serveur est relue au moins toutes les
  2 minutes** en plus du suivi en direct. Un magasin ajouté sur l'iPhone
  apparaît sur l'ordinateur sans recharger la page (environ 10 à 20 secondes).
- **Les magasins de « Configuration de l'enseigne » rejoignent la liste
  partagée** et s'affichent sans recharger la page.
- **La liste n'est plus jamais rejouée depuis la file d'envoi** (une ancienne
  copie qui y était restée est retirée).
- **Horloges différentes** : une modification faite sur un appareil est toujours
  datée après la version qu'elle remplace. Une suppression n'est donc plus
  annulée par un autre appareil dont l'horloge avance.
- **Même magasin enregistré deux fois** (par exemple créé sur l'ordinateur ET
  sur l'iPhone sous deux identifiants, quand leurs listes différaient) :
  « Gestion des magasins » l'indique dans un encadré orange. Supprimez celui en
  trop avec la corbeille (gardez celui qui porte les ventes) ; la suppression
  s'applique à tous les appareils. Rien n'est supprimé automatiquement.

## Après le déploiement

1. Ouvrez OPTICLAIRE **sur l'ordinateur qui a les 12 magasins** (connecté).
   Au démarrage, il envoie sa liste complète au serveur.
2. Sur l'iPhone, **fermez complètement l'application puis rouvrez-la** (pour
   charger la nouvelle version) : la liste complète s'affiche.
3. Les magasins ajoutés ensuite, sur n'importe quel appareil, sont présents
   partout, y compris sur un appareil neuf.
4. Si vous aviez ajouté à la main sur l'iPhone des magasins qui existaient déjà
   sur l'ordinateur : regardez « Gestion des magasins ». En cas d'encadré orange,
   supprimez le doublon.

Facultatif (si ce n'est pas déjà fait) : exécutez une fois dans Supabase
`supabase/PROTECTION_LISTE_MAGASINS_2026-10-27.sql`. Il empêche le serveur de
perdre un magasin même si un appareil encore resté sur une ancienne version
renvoie une liste incomplète. Ce script affiche aussi la liste enregistrée
sur le serveur.

## Vérifié

- Test navigateur avec trois appareils séparés partageant la même base (24
  vérifications) :
  - ordinateur à 12 magasins (dont un saisi dans « Configuration de
    l'enseigne »), liste envoyée au serveur ;
  - iPhone neuf : 12 magasins ;
  - ajout sur l'iPhone, visible sur l'ordinateur sans recharger ;
  - ancien appareil renvoyant 9 magasins, avec et sans la protection du
    serveur ;
  - suppression pendant une coupure, renvoyée toute seule au retour de la
    connexion ;
  - appareil neuf identique ;
  - doublon signalé puis supprimé partout.
- Tests unitaires du registre : 13 vérifications.
- Non-régression : points hebdomadaire / Mobile Money et charges & salaires
  (35 + 40 + 29 + 40 + 6 + 9).
