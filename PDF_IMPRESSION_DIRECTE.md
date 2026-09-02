# PDF / Impression — mode direct

Tous les appels à `afficherPdfBlob`, `afficherHtml` et `imprimerPageCourante` lancent maintenant directement le flux d'impression du navigateur.

Il n'y a plus de page/modale de visionnage intermédiaire.

- Bouton PDF → impression directe
- Bouton Imprimer → impression directe
- HTML imprimable → impression directe
- PDF jsPDF → impression directe du PDF original

## Correctif 02/09/2026

La méthode précédente chargeait le PDF dans un iframe invisible de 1×1 px puis appelait `contentWindow.print()`. Chrome/Edge peuvent confier ce contenu à leur lecteur PDF interne, qui n'ouvre pas systématiquement la boîte d'impression.

`afficherPdfBlob()` rend désormais les pages PDF avec `pdfjs-dist` dans un document HTML hors écran, puis appelle `window.print()` sur ce document. Cela évite le lecteur PDF natif et fiabilise le déclenchement de la boîte d'impression.

> Limite navigateur : une application web standard peut ouvrir automatiquement la boîte de dialogue d'impression après le clic utilisateur, mais ne peut pas imprimer silencieusement sur l'imprimante sans cette boîte. L'impression silencieuse nécessite un mode kiosque, une extension ou une application locale dédiée.
