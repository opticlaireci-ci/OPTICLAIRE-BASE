# PDF / Impression — mode direct

Tous les appels à `afficherPdfBlob`, `afficherHtml` et `imprimerPageCourante` lancent maintenant directement le flux d'impression du navigateur.

Il n'y a plus de page/modale de visionnage intermédiaire.

- Bouton PDF → impression directe
- Bouton Imprimer → impression directe
- HTML imprimable → impression directe
- PDF jsPDF → impression directe du PDF original
