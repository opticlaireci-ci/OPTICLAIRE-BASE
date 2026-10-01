# Correctif import PDF — factures sans civilité (2026-10-01)

Cause du rejet « facture PDF non lisible » : le nom client n'était reconnu que s'il commençait par MME/M./MR.
Une facture « (N° 00032) ABDOULAYE ABIBATA » (sans civilité) donnait nom + n° client vides, donc dossier ignoré.

Corrigé dans src/app/utils/legacyClientPdf.ts :
- n° client et nom lus après « (N° xxxxx) », civilité facultative ;
- téléphone/email du client lus jusqu'à « VERRES » (ils sont placés après « Édité par ») ;
- conseillère lue sur sa ligne (n'avale plus l'adresse/quartier placé dessous) ;
- adresse = ligne sous le nom si présente (ex. N`DOTRE) ;
- ordonnance lue PAR COLONNES (Sphère/Cylindre/Axe/Dec/Addition/Hauteur/E V Loin/E V Près) au lieu de l'ordre des nombres :
  avant, un cylindre ou une addition vide décalait les valeurs (ex. écart pupillaire rangé dans « addition ») ;
- prix des lignes de verres (le bloc verres n'était jamais capturé -> prix 0).
