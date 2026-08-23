# 🌐 Mettre chaque client sur son sous-domaine

> Objectif : chaque client a « son » site, avec UN SEUL domaine payé.
>
> ```
> leclaire.opticlaire.com     →  application de LECLAIRE
> boboptique.opticlaire.com   →  application de BOBOPTIQUE
> ```
>
> Vous payez seulement `opticlaire.com` (~10 000 F/an). Les sous-domaines
> (`leclaire.`, `boboptique.`, …) sont **gratuits et illimités**.

---

## Comment ça marche, en une phrase

Un **sous-domaine** = un mot que vous ajoutez devant votre domaine.
Vous en créez autant que vous voulez, sans rien racheter. Chaque sous-domaine
pointe vers la copie d'application du client correspondant.

```
                    ┌─ leclaire.opticlaire.com   → copie LECLAIRE   → base Supabase LECLAIRE
opticlaire.com  ────┼─ boboptique.opticlaire.com → copie BOBOPTIQUE → base Supabase BOBOPTIQUE
                    └─ (autant que de clients…)
```

---

## Une seule fois : acheter le domaine principal

- [ ] Acheter `opticlaire.com` (ou `.ci`) chez un fournisseur
      (OVH, Namecheap, Gandi, Cloudflare…)

Vous ne le faites **qu'une fois**, pas à chaque client.

---

## Pour CHAQUE nouveau client

### 1. Mettre en ligne sa copie d'application

- [ ] Déployer la copie de l'app du client sur votre hébergeur
      (Vercel, Netlify, Cloudflare Pages… selon ce que vous utilisez)
- [ ] L'hébergeur vous donne une adresse technique du type
      `boboptique-xxxx.vercel.app`

### 2. Créer le sous-domaine

- [ ] Dans l'espace de l'hébergeur : **Domains / Add domain**
- [ ] Saisir `boboptique.opticlaire.com`
- [ ] L'hébergeur vous indique un enregistrement DNS à ajouter (type **CNAME**)

### 3. Pointer le sous-domaine (chez le fournisseur du domaine)

- [ ] Aller dans la zone **DNS** de `opticlaire.com`
- [ ] Ajouter un enregistrement **CNAME** :

| Type  | Nom (Host)  | Valeur (cible)              |
|-------|-------------|-----------------------------|
| CNAME | `boboptique`| `boboptique-xxxx.vercel.app`|

  > « Nom » = juste le mot devant le point. Pas besoin d'écrire tout le domaine.

- [ ] Enregistrer

### 4. Attendre et vérifier

- [ ] Patienter de quelques minutes à quelques heures (propagation DNS)
- [ ] Ouvrir `https://boboptique.opticlaire.com` → l'app du client s'affiche
- [ ] Le certificat HTTPS (le cadenas) se met en place automatiquement

---

## Exemple concret pour trois clients

| Client      | Sous-domaine à créer         | Pointe vers (CNAME)          |
|-------------|------------------------------|------------------------------|
| LECLAIRE    | `leclaire.opticlaire.com`    | `leclaire-xxxx.vercel.app`   |
| BOBOPTIQUE  | `boboptique.opticlaire.com`  | `boboptique-xxxx.vercel.app` |
| VISIONPLUS  | `visionplus.opticlaire.com`  | `visionplus-xxxx.vercel.app` |

Un seul domaine payé (`opticlaire.com`), trois clients en ligne.

---

## Questions fréquentes

**Dois-je racheter un domaine à chaque client ?**
Non. Un sous-domaine est gratuit. Vous n'achetez `opticlaire.com` qu'une fois.

**Un client veut son propre nom de domaine (ex. `boboptique.ci`) ?**
C'est possible : il achète (ou vous achetez pour lui) `boboptique.ci`, puis
même principe qu'à l'étape 3, mais dans la zone DNS de `boboptique.ci` cette
fois. Le reste de l'application ne change pas.

**Les clients peuvent-ils voir les données des autres ?**
Non, jamais. Chaque sous-domaine mène à une copie d'app branchée sur une base
Supabase différente. Les données ne se croisent à aucun moment.

**Puis-je changer un sous-domaine plus tard ?**
Oui, il suffit de modifier ou supprimer l'enregistrement CNAME. Rien dans le
code n'en dépend.
