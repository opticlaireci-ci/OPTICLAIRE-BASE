# Scripts SQL Supabase — OPTICLAIRE

Ce dossier contient la configuration base de données (sécurité RLS multi-tenant).
**Lisez ce fichier avant d'exécuter quoi que ce soit dans le SQL Editor.**

## Quel script exécuter ?

### 🆕 Nouveau projet Supabase (base vierge)
Exécuter **une seule fois**, dans l'ordre du fichier :

```
INSTALLATION_NOUVEAU_PROJET.sql
```

Crée toutes les tables, le KV store, les fonctions de sécurité et les policies
RLS **sécurisées par défaut** (isolation par magasin + bootstrap gardé contre
l'élévation de privilège).

### 🔧 Projet EXISTANT (déjà en production)
Exécuter dans cet ordre :

1. `CORRECTIFS_SECURITE.sql` — applique les correctifs de sécurité en tolérant
   les lignes historiques sans `magasin_id` (ne verrouille personne).
2. `ISOLATION_STRICTE.sql` — diagnostic, backfill des `magasin_id` manquants,
   puis bascule en isolation stricte (supprime la tolérance aux NULL).

> Exécuter `ISOLATION_STRICTE.sql` **après** avoir vérifié le diagnostic
> (section A) et corrigé les données. Les deux scripts sont idempotents.

### 🚑 Dépannage (break-glass)
```
promouvoir-admin.sql
```
Outil **manuel** pour promouvoir un compte en administrateur si plus aucun admin
n'a accès. À utiliser ponctuellement, jamais en routine.

## ⛔ Scripts NEUTRALISÉS — NE PAS EXÉCUTER
Ces fichiers réintroduiraient des failles (policies `using(true)` sans isolation,
ou auto-écriture de `user_meta` = élévation de privilège). Ils lèvent
volontairement une exception si on tente de les jouer. Conservés pour l'historique
uniquement :

- `A_EXECUTER_TOUT_EN_UN.sql`
- `FIX_DROITS_AUTHENTICATED.sql`
- `SUPABASE_FIX_ACCES_DIRECT.sql`
- `setup-nouveau-projet.sql`

## Modèle de sécurité (rappel)
- **Isolation par magasin** via RLS et comparaison **normalisée** (`norm_id()`,
  réplique SQL du `normId` de l'edge function).
- **Bootstrap gardé** : l'auto-écriture de `user_meta` / `app_data:initialized`
  n'est autorisée que tant que l'application n'est pas initialisée.
- Les changements de rôle passent uniquement par l'edge function (`/admin/users`,
  service_role), jamais en écriture directe côté client.
