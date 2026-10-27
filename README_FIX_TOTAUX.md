# Correction définitive TOTAL / TOTAL NET / Assurance

Le fichier `FIX_TOTAUX_VENTES_ASSURANCE_DEFINITIF.sql` est compatible avec les deux schémas utilisés par Opticlaire :

- colonnes PostgreSQL `total_brut`, `total_net`, `recap` ;
- ou stockage JSONB dans la colonne `data`.

**Ne pas exécuter l'ancien SQL qui référence directement `total_net` si cette colonne n'existe pas dans votre table.**

Le calcul est basé en priorité sur les lignes `articles` et `verres`. Un bon d'assurance n'est jamais ajouté au TOTAL ou au TOTAL NET.
