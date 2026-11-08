# SMS « Échec » sur le tableau de bord alors que le test fonctionne — 08/11/2026

## Ce qui se passait

- Le **test** (Configuration SMS → Tester l'envoi) est lancé par un
  administrateur : il part.
- Les **SMS automatiques** (bienvenue d'un nouveau client, remerciement après
  une vente, anniversaires, lunettes prêtes, renouvellement) partent du poste
  qui déclenche l'événement — souvent celui d'une conseillère ou d'un opticien
  en magasin. La fonction serveur n'autorisait l'envoi qu'aux administrateurs,
  managers et responsables du Call Center : elle répondait « Envoi de SMS non
  autorisé pour votre rôle. » et le SMS était noté **Échec**, sans la raison.
- La tournée quotidienne (anniversaires, lunettes prêtes, renouvellements)
  était lancée sur **chaque** poste ouvert, y compris en magasin (refus, risque
  de doublons), tous les SMS en même temps : au-delà du quota horaire, les
  suivants échouaient et n'étaient jamais retentés.

## Ce qui change

1. **Fonction serveur** (`supabase/functions/server/index.tsx`) : tout compte
   rattaché à un magasin peut envoyer les **SMS automatiques**. Le texte
   envoyé est celui de la **Configuration SMS**, relu par le serveur (un poste
   de magasin ne peut pas envoyer un autre texte). Les SMS **au texte libre**
   (SMS personnalisé, test) restent réservés aux administrateurs, managers et
   responsables du Call Center. Quotas : 150 SMS automatiques par heure et par
   compte ; 30 SMS au texte libre (inchangé).
2. **Raison de chaque échec** : enregistrée et affichée sous le statut dans le
   **Rapport SMS**, et dans un nouveau bloc **« Derniers SMS en échec —
   raison »** du tableau de bord (Configuration SMS). Exemples : « Envoi de SMS
   non autorisé pour votre rôle. », « [POL0001] Numéro … refusé » (numéro
   rejeté par Orange), « Numéro invalide », « Quota SMS atteint ».
3. **Tournée quotidienne** : lancée seulement depuis un poste d'encadrement
   (administrateur, manager, responsable Call Center), **un SMS à la fois**.
   En cas de refus temporaire (quota, droits, réseau), le SMS est noté
   **« Reporté »** (et non « Échec »), la tournée s'arrête et il est retenté
   au passage suivant. Les reportés sont comptés à part.
4. Les boutons « Envoyer anniversaires » et « Envoyer relances » du Rapport
   SMS utilisent aussi les textes de la configuration.

## Compteur de SMS : comme Orange les facture (08/11/2026)

- Un message ne compte plus toujours pour 1 : le crédit baisse du **nombre de
  SMS facturés** par Orange (norme GSM des opérateurs) :
  - texte simple (lettres, chiffres, é è à ù É Ç, ponctuation courante) :
    **160 caractères** pour 1 SMS ; au-delà, SMS de **153** ;
  - un seul caractère hors de cet alphabet (ê ô â î û, À, ç minuscule, tiret
    long « — », apostrophe courbe « ’ », émoji…) passe **tout** le message en
    Unicode : **70 caractères** pour 1 SMS, puis SMS de **67** ;
  - € [ ] { } ~ ^ | \ comptent pour 2 caractères en texte simple.
- Sous chaque message de la Configuration SMS (et du test, et du SMS
  personnalisé) : nombre de caractères, **nombre de SMS facturés**, et les
  caractères qui imposent l'Unicode, à remplacer pour revenir à 160.
- Avec les textes actuels : bienvenue 1 SMS, anniversaire 1, lunettes prêtes
  **2** (« ê », « — »), remerciement **2** (« À », « ô »), renouvellement **4**
  (232 caractères avec « ô »).
- Rapport SMS : « · 2 SMS » à côté du statut d'un message qui en compte
  plusieurs ; tableau de bord : « soit N SMS facturés par Orange ».
- Pour un SMS automatique, le compte se fait sur le texte réellement envoyé,
  renvoyé par la fonction serveur.
- Le compteur reste une estimation : il ne lit pas le solde Orange
  (ressaisir le nombre réel de temps en temps).

## À faire : redéployer la fonction serveur (une fois)

La partie 1 se trouve dans la fonction serveur Supabase : **elle ne s'applique
qu'après son redéploiement**. Sans cela, l'application affiche désormais la
raison (« non autorisé pour votre rôle ») mais les SMS déclenchés en magasin
restent refusés.

- **Tableau de bord Supabase** (projet OPTICLAIRE) → **Edge Functions** →
  fonction **`make-server-8ddbb853`** → onglet **Code** → remplacer tout le
  contenu par celui du fichier `supabase/functions/server/index.tsx` du ZIP →
  **Deploy**. Les secrets Orange déjà enregistrés sont conservés.
- Ou, avec la ligne de commande Supabase, depuis le dossier du projet (le
  code est dans `supabase/functions/server`) : déployer ce dossier sous le nom
  `make-server-8ddbb853`, sans vérification JWT (voir `supabase/config.toml`).
- Vérification : Configuration SMS affiche toujours « Orange SMS connecté » ;
  créez un client test depuis un compte de conseillère : le Rapport SMS
  affiche « Envoyé » (puis « Livré »).

Les anciens SMS en échec gardent leur statut (« raison non enregistrée ») :
vous pouvez les supprimer du rapport.

## Vérifications effectuées

- Fonction serveur réelle exécutée avec une base et un Orange simulés : 15/15
  (conseillère et opticien : SMS automatiques acceptés avec le texte
  configuré, texte libre refusé ; administrateur inchangé ; texte par défaut
  si la configuration est vide ; raison Orange lisible ; quotas séparés). Sur
  l'ancienne fonction, la conseillère et l'opticien reçoivent bien « Envoi de
  SMS non autorisé pour votre rôle. ».
- Service SMS de l'application : 14 tests (modèle envoyé, raison enregistrée,
  tournée depuis l'encadrement seulement, un par un, « Reporté » puis renvoi).
- Compteur : 21 tests (limites 160/153 et 70/67, caractères doubles et
  Unicode, émoji, textes actuels, crédit retiré du bon nombre, échec sans
  retrait, jamais sous 0, texte renvoyé par le serveur) ; fonction serveur
  16/16 (texte envoyé renvoyé) ; navigateur 6/6 (compteurs sous les messages,
  SMS facturés, « · 4 SMS » dans le rapport).
- Navigateur : tableau de bord (derniers échecs et raisons, reportés) et
  Rapport SMS (raison sous chaque échec) : 3/3. Compilation de production :
  sans erreur.
