# 🏥 OPTICLAIRE - Gestion Optique

Application de gestion pour les magasins LECLAIRE en Côte d'Ivoire.

---

## ⚡ DÉMARRAGE RAPIDE

### 🔑 Connexion

**Email** : `admin@leclaire.ci`  
**Mot de passe** : `admin123`

### 🆘 Problème de connexion ?

Console (F12) → Tapez : `fixLogin()`

---

## 🏪 MAGASINS

1. LECLAIRE ABOBO
2. LECLAIRE FAYA
3. LECLAIRE KOUMASSI
4. LECLAIRE PALMERAIE
5. LECLAIRE YOPOUGON
6. LECLAIRE BINGERVILLE
7. LECLAIRE MAN

---

## 👥 COMPTES UTILISATEURS

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| admin@leclaire.ci | admin123 | Administrateur |
| marie@leclaire.ci | marie123 | Conseillère (Abobo) |
| fatou@leclaire.ci | fatou123 | Conseillère (Faya) |
| jean@leclaire.ci | jean123 | Directeur |
| ange@leclaire.ci | ange123 | Comptable |

---

## 📚 DOCUMENTATION

### 🆕 Déployer un nouveau client (OPTICLAIRE multi-enseignes)

- **[docs/AJOUTER-UN-CLIENT.md](docs/AJOUTER-UN-CLIENT.md)** — check-list pas-à-pas
  pour ajouter une nouvelle enseigne (ex. BOBOPTIQUE), à cocher à chaque fois.
- **[docs/SOUS-DOMAINES.md](docs/SOUS-DOMAINES.md)** — mettre chaque client sur son
  sous-domaine (`leclaire.opticlaire.com`, `boboptique.opticlaire.com`…) avec un
  seul domaine payé.

> 💡 **Obtenir ces fiches en PDF** : ouvrez le fichier `.md` sur GitHub (ou dans
> l'aperçu de votre éditeur), puis `Ctrl/Cmd + P` → « Enregistrer au format PDF ».

### Guides principaux

- **LIRE_MOI_IMPORTANT.md** - Infos essentielles
- **SOLUTION_FINALE.md** - État actuel de l'application
- **GUIDE_ACTIVATION_MULTI_NAVIGATEURS.md** - Partage entre navigateurs

### Guides techniques

- **GUIDE_RAPIDE_MULTI_NAVIGATEURS.md** - Utilisation multi-navigateurs
- **CONNEXION_AUTOMATIQUE_SUPABASE.md** - Détails techniques Supabase
- **START_MULTI_NAVIGATEURS.md** - Démarrage rapide

---

## ⚙️ CONFIGURATION ACTUELLE

- ✅ **Mode** : localStorage (local)
- ✅ **Erreurs** : Aucune
- ✅ **Connexion** : Fonctionnelle
- ⚙️ **Multi-navigateurs** : Désactivé (optionnel)

---

## 🔒 SÉCURITÉ

- Expiration automatique : **15 minutes**
- Persistance session : **Oui** (survit F5)
- Données : **localStorage** (navigateur local)

---

## 🌐 MULTI-NAVIGATEURS (OPTIONNEL)

Pour activer le partage automatique entre navigateurs :

1. Consultez **GUIDE_ACTIVATION_MULTI_NAVIGATEURS.md**
2. Configurez Supabase Storage (10 minutes)
3. Activez le système dans `src/app/App.tsx`

Sans activation, l'application fonctionne très bien en mode local.

---

## 🛠️ DÉVELOPPEMENT

```bash
# Installer les dépendances
pnpm install

# Démarrer le serveur de développement
pnpm dev

# Note: Build non supporté (Figma Make)
```

---

## 📊 FONCTIONNALITÉS

- Gestion clients et ventes
- Gestion stocks et inventaires
- Gestion comptabilité
- Gestion personnel
- Dashboard analytics
- Multi-magasins
- Système de rendez-vous
- Géolocalisation
- Historique et visualisation

---

## ✅ STATUT

**Application prête à l'emploi !**

- ✅ 7 magasins configurés
- ✅ 5 comptes utilisateurs
- ✅ Connexion fonctionnelle
- ✅ Aucune erreur console
- ✅ Interface complète

---

**🚀 PROFITEZ DE VOTRE APPLICATION !**

## CORRECTION RLS — MOUVEMENTS DE STOCK

Si Supabase affiche : `new row violates row-level security policy for table "mouvements_stock"`, exécuter une seule fois dans **Supabase → SQL Editor** :

`supabase/FIX_RLS_MOUVEMENTS_STOCK_DEFINITIF.sql`

Cette correction rend `mouvements_stock` compatible avec les anciennes et nouvelles structures (`magasin_id`, `magasin_source`, `magasin_destination` et `data`), migre les anciennes valeurs JSONB et recrée les policies RLS. L'application renseigne désormais aussi `magasin_id` sur chaque mouvement et conserve les colonnes source/destination lorsque disponibles.


## CORRECTION DÉFINITIVE — TOTAL / TOTAL NET / BONS D’ASSURANCE

Le fichier `supabase/FIX_TOTAUX_VENTES_ASSURANCE_DEFINITIF.sql` corrige les anciennes ventes où `TOTAL < TOTAL NET` (notamment les ventes avec bons d’assurance) et installe un trigger + une contrainte pour empêcher que cette incohérence réapparaisse.

À exécuter une seule fois dans **Supabase → SQL Editor** sur la base existante. Le bon d’assurance reste un mode de prise en charge/règlement et ne diminue jamais le TOTAL ni le TOTAL NET.
