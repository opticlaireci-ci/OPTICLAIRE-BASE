# Stock visible à la vente dans chaque magasin — audit et correction (26/10/2026)

## Le problème signalé

« Le stock est disponible mais ne s'affiche pas lors des ventes, on ne peut pas
enregistrer la vente » — souvent, et seulement dans certains magasins.

Reproduit à l'identique avant correction (test navigateur, magasin BOUAKÉ) :
la page **État du stock** affichait la monture, la **Vente** ne la proposait
pas, et l'enregistrement était refusé avec « stock épuisé dans ce magasin ».

## Règle de visibilité (confirmée)

**Chaque vendeuse ne voit que le stock de SON magasin** : ce qu'il a reçu par
bon de distribution ou de transfert, moins ce qu'il a vendu, transféré ou
retourné. Seuls les administrateurs voient le stock de tous les magasins
(tableau « Stock réel par magasin » sous les articles de la vente).

## Les causes trouvées

| # | Cause | Effet |
|---|---|---|
| 1 | La **liste de vente** ne proposait que les articles du **catalogue enregistré sur le poste** | Un article reçu par bon mais absent ou écrit autrement dans ce catalogue (poste pas encore synchronisé, article saisi au bon, fiche modifiée depuis) était dans « État du stock » mais **jamais proposé à la vente** |
| 2 | Le **nom du magasin** n'était reconnu que par sa casse : « YOPOUGON GANDI » ≠ « yopougon-gandi », « BOUAKÉ » ≠ « bouake », ancien « COCODY » ≠ BOUAKÉ | Un bon ou un mouvement écrit sous le libellé, avec l'accent ou sous l'ancien nom était compté pour un magasin **inexistant** |
| 3 | Dans la base, la comparaison des magasins (`norm_id`) **supprimait les lettres accentuées** (« BOUAKÉ » → « bouak ») | La vendeuse de BOUAKÉ n'avait **pas le droit de lire** les bons et mouvements écrits « BOUAKÉ » |
| 4 | Selon le script de sécurité exécuté en dernier, la règle d'accès des mouvements ne regardait que `data`, alors que l'application écrit les magasins dans les colonnes | Un **transfert reçu** n'était pas visible du magasin qui le reçoit |
| 5 | À la **réception d'un transfert**, le magasin qui reçoit vérifiait le stock du magasin qui envoie, qu'il n'a pas le droit de lire | Transfert refusé à tort pour « stock insuffisant » |
| 6 | Le **contrôle au moment d'enregistrer** utilisait le stock affiché, qui peut dater (rafraîchi toutes les 30 s, connexion coupée, poste au stockage plein) | Vente refusée alors que l'article était en stock |
| 7 | **Facture modifiée** : la quantité déjà vendue sur cette facture n'était pas rendue disponible | Impossible de modifier une facture portant la dernière monture |
| 8 | Pages des bons du magasin : comparaison exacte du nom du magasin | Bon écrit autrement (libellé, accent) absent de la liste du magasin |

## Ce qui a été corrigé

### Application

- **Liste de vente construite à partir du stock réel du magasin**
  (`construireProduitsVente`, `src/app/utils/venteLookups.ts`) : chaque ligne
  de stock est proposée **une fois**, rattachée à la fiche du poste de même
  identifiant, sinon de même désignation (sans tenir compte des accents,
  majuscules, espaces) ou de même code-barre, sinon **proposée telle quelle**.
  La vente sort alors l'article sous la clé exacte du stock.
- **Un seul nom par magasin** partout (`magasinCanonique`, `memeMagasin`,
  `src/app/constants/magasins.ts`) : identifiant, libellé, accent, ancien nom
  (COCODY → BOUAKÉ, MARCORY → YOPOUGON GANDI), « LECLAIRE X ».
- **Contrôle final de la vente** (`controlerStockVente`,
  `src/app/utils/stockVente.ts`), Vente/Facture et Vente Flash : avant de
  refuser, le stock du magasin est **relu dans la base**. Si la base ne répond
  pas, un message explique que le stock n'a pas pu être vérifié et laisse la
  vendeuse confirmer (au lieu de bloquer sans preuve).
- **Facture modifiée** : ses articles déjà vendus restent disponibles pour elle.
- **Dernier stock gardé en mémoire** quand le stockage du poste est plein.
- **Réception d'un transfert** : le stock de l'expéditeur n'est revérifié que
  par l'expéditeur lui-même ou l'administration (il est déjà contrôlé à la
  création du bon, où seuls les articles en stock peuvent être choisis).
- **Tableau « Stock réel par magasin »** : réservé aux administrateurs.
- Bons de distribution, transfert et retour du magasin : reconnaissance du
  magasin quelle que soit son écriture.

### Base de données — `supabase/CORRECTION_STOCK_MAGASINS_2026-10-26.sql`

À exécuter une fois (Supabase → SQL Editor → coller tout le fichier → RUN).
Idempotent : peut être relancé sans risque.

- A. Diagnostic : liste des noms de magasins trouvés dans les bons et mouvements.
- B. `norm_id` insensible aux accents et aux anciens noms (aussi mis à jour dans
  `INSTALLATION_NOUVEAU_PROJET.sql` et `CORRECTIFS_SECURITE.sql`, pour qu'une
  ré-exécution ne réintroduise pas le défaut).
- C. Magasins rangés seulement dans `data` recopiés dans les colonnes.
- D. Règles d'accès de `mouvements_stock` et `bons` sur **tous** les champs
  magasin (colonnes, `magasin_id`, `data`), en conservant le mode actuel
  (strict ou tolérant).
- E. Fonction `stock_lignes` lue par l'application pour le calcul du stock :
  **uniquement les lignes des magasins du compte** (toutes pour
  l'administration), et uniquement les champs utiles au stock (ni client, ni
  montant, ni utilisateur). Refusée aux visiteurs non connectés et aux comptes
  sans magasin.

Sans ce script, l'application corrigée fonctionne déjà (lecture directe des
tables, causes 1, 2, 6, 7, 8 corrigées) ; le script corrige en plus les causes
3, 4 et 5 côté base.

## Vérifications effectuées

- Base PostgreSQL 16 locale avec les vrais scripts (`INSTALLATION_NOUVEAU_PROJET`,
  `ISOLATION_STRICTE`, `FIX_RLS_MOUVEMENTS_STOCK_DEFINITIF`, puis ce script) :
  avant, la vendeuse de BOUAKÉ ne lisait aucune ligne « BOUAKÉ » ni « COCODY »
  et celle de YOPOUGON GANDI ne voyait pas le transfert reçu ; après, chacune
  lit exactement les lignes de son magasin, l'administrateur toutes ; mode
  strict et mode tolérant conservés ; script relancé deux fois sans erreur ;
  stock recalculé depuis la fonction = stock attendu pour chaque vendeuse.
- Calcul du stock et liste de vente : 47 nouveaux tests + 34 tests du lot 16.
- Lecture paginée de la fonction côté application : 9 tests.
- Navigateur (Vente Flash, vendeuse de BOUAKÉ) : ancienne version 2/9
  (aucun article proposé, vente refusée « stock épuisé ») ; version corrigée
  9/9 (articles proposés, vente enregistrée, stock diminué, stock d'ABOBO non
  visible, tableau des autres magasins seulement pour l'administrateur).
- Compilation de production (`npm run build`) et vérification des types : sans
  nouvelle erreur.
