import { createPortal } from 'react-dom';

/**
 * Rend son contenu directement dans <body>, en dehors de toute la hiérarchie
 * de composants (menu latéral, barre du haut, animations de page...).
 *
 * Pourquoi c'est nécessaire : une fenêtre modale en `position: fixed` avec un
 * grand `z-index` peut malgré tout s'afficher DERRIÈRE le menu latéral ou la
 * barre du haut si un élément parent (ex : le conteneur de transition entre
 * pages) crée involontairement un nouveau "contexte d'empilement" CSS. Dans
 * ce cas, le z-index de la modale n'est comparé qu'aux autres éléments à
 * l'intérieur de ce même parent, jamais au menu qui vit ailleurs dans le
 * DOM — aucune valeur de z-index, aussi grande soit-elle, ne peut alors la
 * faire passer au-dessus. Utiliser <ModalPortal> résout ce problème une fois
 * pour toutes, sur tous les appareils et navigateurs.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
