# Sécurisation du système PDF

Correctifs appliqués :

1. Tous les générateurs PDF utilisent `afficherPdfBlob` pour l'aperçu intégré.
2. Les deux derniers boutons qui faisaient encore un `doc.save()` direct (Bon de commande verre et Récapitulatif hebdomadaire) ont été convertis en aperçu intégré.
3. `inAppViewer.ts` rend les pages avec PDF.js dans des canvas.
4. Si PDF.js échoue (worker/module/canvas/navigateur/PDF lourd), l'aperçu bascule automatiquement vers le lecteur PDF natif du navigateur dans la même modale.
5. Le message utilisateur « Impossible d’afficher l’aperçu PDF » a été supprimé : aucune erreur PDF.js ne remplace l’aperçu par ce message.
6. Le bouton « Imprimer » conserve le PDF original, afin de ne pas imprimer une capture rasterisée.
7. La fermeture libère l'Object URL du PDF.

Vérification statique : aucun `doc.save()` PDF ne reste dans `src/app`.

Test local recommandé :

```bash
npm install
npm run build
npm run dev
```

Puis tester chaque bouton PDF avec un document simple, plusieurs pages et des données longues.
