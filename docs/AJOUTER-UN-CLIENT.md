# ✅ Fiche « Nouveau client » — OPTICLAIRE

> Imprimez cette page. Cochez chaque case à chaque nouveau client.
> Comptez **30 à 45 minutes** la première fois, moins ensuite.

Exemple utilisé ici : le nouveau client s'appelle **BOBOPTIQUE**.

---

## Avant de commencer — ce qu'il vous faut sous la main

- [ ] Le **nom** du client (ex. BOBOPTIQUE) et son nom complet (ex. BOBOPTIQUE OPTIQUE)
- [ ] L'**adresse, le téléphone et l'e-mail** de son siège
- [ ] La **liste de ses magasins** (ville par ville)
- [ ] L'**e-mail du patron** (il servira de compte administrateur)
- [ ] Son **logo** (et éventuellement une photo d'accueil)

---

## ÉTAPE 1 — Copier l'application

- [ ] Dupliquer le projet OPTICLAIRE actuel (nouvelle copie complète)
- [ ] Renommer la copie, par ex. « OPTICLAIRE — BOBOPTIQUE »

> C'est le même logiciel. On ne réécrit rien.

---

## ÉTAPE 2 — Créer la base de données du client

- [ ] Aller sur **supabase.com** → créer un **nouveau projet**
- [ ] Noter le mot de passe de la base **en lieu sûr** (ne me le communiquez jamais)
- [ ] Ouvrir **SQL Editor** dans ce nouveau projet
- [ ] Coller **tout** le contenu du fichier `supabase/setup-nouveau-projet.sql`
- [ ] Cliquer sur **Run**
- [ ] Vérifier le message de succès (la table `kv_store_...` est créée, vide)

---

## ÉTAPE 3 — Brancher l'application sur cette base

- [ ] Dans le projet Supabase : **Settings → API**
- [ ] Copier l'**URL du projet** et la **clé anon (public)**
- [ ] Les coller dans le fichier `utils/supabase/info.tsx` de la copie de l'app
      (au même endroit que les valeurs de LECLAIRE)
- [ ] Déployer l'**edge function** (même nom que pour LECLAIRE)

> ⚠️ Ne collez JAMAIS la clé « service_role » dans le code de l'application.
> Elle ne va QUE dans les réglages de l'edge function (étape 5).

---

## ÉTAPE 4 — Remplir la fiche du client

Il y a **deux façons** de le faire. La plus simple est dans l'application.

### Option A (recommandée) — Depuis l'application, sans toucher au code

- [ ] Ouvrir la copie de l'app, se connecter en administrateur
- [ ] Menu **Espace Administrateur → Paramétrage → « Configuration de l'enseigne »**
- [ ] Saisir : nom (`BOBOPTIQUE`), nom complet, siège, e-mail du patron, devise, magasins
- [ ] Cliquer **« Enregistrer et appliquer »** → l'app se recharge sous le nouveau nom
- [ ] Cliquer **« Réinitialiser toutes les données »** pour partir d'une base vierge

> ⚠️ À faire UNIQUEMENT sur la copie destinée à BOBOPTIQUE, jamais sur l'app de
> LECLAIRE (le bouton « Rétablir l'origine » annule si vous testez par erreur).

### Option B — En modifiant le code (`src/app/config/tenant.ts`)

- [ ] `nom` → `'BOBOPTIQUE'`
- [ ] `nomComplet` → `'BOBOPTIQUE OPTIQUE'`
- [ ] `siege` → adresse, téléphone, e-mail, ville
- [ ] `emailProprietaire` → e-mail du patron
- [ ] `magasins` → la liste (voir modèle ci-dessous)
- [ ] `devise` → en général `'FCFA'`

Modèle pour les magasins (l'`id` en minuscules, sans accent ni espace) :

```ts
magasins: [
  { id: 'cocody',  label: 'COCODY' },
  { id: 'marcory', label: 'MARCORY' },
],
```

### Les logos (dans les deux cas — passe par le code)

- [ ] Déposer les images du client dans `src/imports/`
- [ ] En haut de `tenant.ts`, changer les 3 lignes `import ... logo / accueil / logoNoel`

---

## ÉTAPE 5 — Régler le compte propriétaire (côté Supabase)

Dans le projet Supabase → **Edge Functions → Secrets** (ou Settings → Functions) :

- [ ] Ajouter `OWNER_EMAIL` = l'e-mail du patron (identique à `emailProprietaire`)
- [ ] Ajouter `OWNER_MAGASINS` = les `id` des magasins séparés par des virgules
      Exemple : `cocody,marcory`

> Ces deux valeurs doivent correspondre EXACTEMENT à ce que vous avez mis
> dans `tenant.ts` à l'étape 4.

---

## ÉTAPE 6 — Première ouverture

- [ ] Ouvrir l'application du client
- [ ] L'écran de configuration apparaît → il crée le compte administrateur
- [ ] Se connecter avec l'e-mail du patron
- [ ] Vérifier : le nom du client s'affiche partout (menus, factures, reçus)
- [ ] Vérifier : les bons magasins apparaissent

---

## ÉTAPE 7 — Mettre en ligne (voir la fiche SOUS-DOMAINES)

- [ ] Choisir l'adresse (ex. `boboptique.opticlaire.com`)
- [ ] Suivre `docs/SOUS-DOMAINES.md`

---

## 🚫 À NE JAMAIS FAIRE

- ❌ Ne pas renommer les clés internes `leclaire_*` dans le code
      (elles sont invisibles pour le client ; les toucher casse la synchronisation)
- ❌ Ne pas mettre plusieurs clients dans la même base Supabase
- ❌ Ne pas mettre la clé « service_role » dans le code de l'application
- ❌ Ne pas modifier les pages, factures ou menus pour changer le nom :
      tout vient automatiquement de `tenant.ts`

---

## Récapitulatif express (pour les fois suivantes)

1. Copier l'app
2. Nouveau projet Supabase + coller le SQL
3. Coller URL + clé anon dans `info.tsx`, déployer la fonction
4. Remplir `tenant.ts` (nom, siège, magasins, logos)
5. Poser `OWNER_EMAIL` et `OWNER_MAGASINS` dans Supabase
6. Ouvrir → l'admin se crée tout seul
7. Brancher le sous-domaine
