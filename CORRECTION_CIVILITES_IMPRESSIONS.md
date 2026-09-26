# Correction des civilités répétées sur les impressions

Correction appliquée aux impressions de devis/proforma et de documents de vente/bon d'exécution.

Les anciennes données peuvent contenir la civilité deux fois : dans le champ `civilite` et déjà au début du champ `client`.
La nouvelle fonction `formatNomClient()` retire les civilités initiales répétées avant de préfixer la civilité une seule fois.

Exemples corrigés :
- `Mme` + `Mme ADJ...` → `Mme ADJ...`
- `M.` + `M. DJABOU...` → `M. DJABOU...`

La donnée enregistrée n'est pas supprimée ni modifiée : le correctif agit au moment de l'impression, afin de rester compatible avec les anciennes fiches.
