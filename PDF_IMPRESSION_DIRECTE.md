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

## Correctif SMS — Delivery Receipt Orange

Le rapport SMS distingue désormais :
- **Envoyé** : Orange a accepté la demande d'envoi et a fourni un `resourceId`.
- **Livré** : Orange a reçu un Delivery Receipt `DeliveredToTerminal`.
- **En cours** : Orange indique `MessageWaiting`.
- **Échec** : Orange indique `DeliveryImpossible` ou le serveur refuse l'envoi.
- **Incertain** : Orange indique `DeliveryUncertain`.

Le serveur expose l'endpoint public `POST /make-server-8ddbb853/sms/dr` pour recevoir les Delivery Receipts Orange et `GET /make-server-8ddbb853/sms/dr-status` pour que l'application synchronise le rapport.

### Activation du Delivery Receipt Orange
Orange doit connaître l'URL HTTPS publique de l'endpoint et l'activer/whitelister dans l'application Orange Developer. Pour ce projet, l'URL à déclarer est :
`https://<DOMAINE_SUPABASE>/functions/v1/make-server-8ddbb853/sms/dr`

Une fois cette URL déclarée côté Orange, les statuts `DeliveredToTerminal`, `MessageWaiting`, etc. remontent automatiquement dans le rapport.

Le bouton **Supprimer** retire un SMS du rapport de l'application. Il ne peut pas effacer un SMS déjà reçu sur le téléphone du client.
