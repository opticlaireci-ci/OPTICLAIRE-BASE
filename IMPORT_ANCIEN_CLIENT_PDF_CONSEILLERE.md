# Import ancien dossier client — PDF + conseillère

- Les dossiers peuvent contenir un ou plusieurs PDF de facture/proforma.
- Le PDF est analysé avec pdf.js quand il contient du texte exploitable.
- Le nom de la conseillère/vendeur est recherché notamment après `Édité par`, `Conseillère`, `Conseiller`, `Vendeur` ou `Commercial`.
- Le nom détecté est enregistré dans la vente (`conseillere`, `vendeur`) et `edite_par` pour que la vente reste attribuée à la bonne conseillère.
- Le PDF original est également conservé comme pièce du dossier importé.
- La date et les montants détectés servent à la vente historique et donc aux tableaux de bord du mois d'origine.
- Si le PDF est une simple image/scanné sans couche texte, l'analyse automatique des champs peut ne pas fonctionner ; le fichier reste néanmoins importé comme pièce jointe et les champs peuvent être complétés manuellement.
