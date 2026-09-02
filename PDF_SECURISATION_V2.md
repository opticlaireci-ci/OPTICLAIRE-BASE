# PDF — sécurisation V2

Correction du problème « Ce contenu a été bloqué ».

Cause : le fallback du lecteur PDF utilisait une URL `blob:` dans un iframe, alors que la Content-Security-Policy Vercel n'autorisait pas `blob:` dans `frame-src`. Le même blocage pouvait toucher l'iframe caché utilisé pour l'impression.

Corrections :
- `frame-src 'self' blob: data:`
- `child-src 'self' blob: data:`
- `object-src 'self' blob: data:`
- normalisation systématique du Blob en `application/pdf`
- vérification explicite de l'API Canvas 2D
- rendu PDF.js page par page conservé
- fallback natif PDF conservé pour les navigateurs où PDF.js échoue
- impression du PDF original conservée
