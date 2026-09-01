/**
 * IMPRESSION DANS L'APPLICATION — sans ouvrir d'onglet / fenêtre externe.
 *
 * Toutes les impressions (factures, devis, bons, reçus, PDF, états de
 * stock...) se déroulent à l'intérieur de l'application, dans une fenêtre
 * d'aperçu superposée (modal) avec un bouton "Imprimer". Aucun nouvel
 * onglet ni nouvelle fenêtre de navigateur ne s'ouvre — l'utilisateur reste
 * sur la page de l'application du début à la fin.
 *
 * IMPORTANT : l'aperçu doit être RÉELLEMENT VISIBLE (pas un iframe caché ou
 * placé hors de l'écran). Sur de nombreux navigateurs, un iframe invisible
 * ou hors-champ empêche la visionneuse PDF interne de s'initialiser et
 * bloque silencieusement l'impression — c'est pour cette raison que
 * l'impression des PDF ne fonctionnait pas avec la version précédente.
 */

interface Apercu {
  iframe: HTMLIFrameElement;
  fermer: () => void;
  imprimer: () => void;
}

function creerApercuVisible(titre: string, onFermer?: () => void): Apercu {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-apercu-impression', 'true');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '999999',
    background: 'rgba(15,23,32,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as Partial<CSSStyleDeclaration>);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: '#fff',
    width: 'min(950px, 96vw)',
    height: '94vh',
    borderRadius: '10px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
  } as Partial<CSSStyleDeclaration>);

  const toolbar = document.createElement('div');
  Object.assign(toolbar.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: '#1a7a96',
    color: '#fff',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    flexShrink: '0',
  } as Partial<CSSStyleDeclaration>);

  const titreEl = document.createElement('span');
  titreEl.textContent = titre;

  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '8px';

  const btnImprimer = document.createElement('button');
  btnImprimer.type = 'button';
  btnImprimer.textContent = '🖨️ Imprimer';
  Object.assign(btnImprimer.style, {
    padding: '7px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#fff',
    color: '#1a7a96',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '13px',
  } as Partial<CSSStyleDeclaration>);

  const btnFermer = document.createElement('button');
  btnFermer.type = 'button';
  btnFermer.textContent = 'Fermer';
  Object.assign(btnFermer.style, {
    padding: '7px 16px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.7)',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  } as Partial<CSSStyleDeclaration>);

  btnGroup.appendChild(btnImprimer);
  btnGroup.appendChild(btnFermer);
  toolbar.appendChild(titreEl);
  toolbar.appendChild(btnGroup);

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    flex: '1',
    width: '100%',
    border: '0',
    background: '#525659',
  } as Partial<CSSStyleDeclaration>);

  panel.appendChild(toolbar);
  panel.appendChild(iframe);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let fermee = false;
  const fermer = () => {
    if (fermee) return;
    fermee = true;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    onFermer?.();
  };

  const imprimer = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Ignoré : on laisse l'utilisateur réessayer via le bouton.
    }
  };

  btnFermer.addEventListener('click', fermer);
  btnImprimer.addEventListener('click', imprimer);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fermer();
  });
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      fermer();
      document.removeEventListener('keydown', onEsc);
    }
  };
  document.addEventListener('keydown', onEsc);

  return { iframe, fermer, imprimer };
}

/**
 * Force l'impression des couleurs et fonds (beaucoup de navigateurs
 * n'impriment pas les couleurs de fond par défaut, sauf indication
 * explicite dans le CSS).
 */
function injecterCssImpressionCouleur(html: string): string {
  const styleForce = `<style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  </style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleForce}</head>`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${styleForce}</head>`);
  }
  return styleForce + html;
}

/**
 * Affiche un aperçu (facture, devis, bon, reçu, état de stock...) dans une
 * fenêtre superposée à l'intérieur de l'application, avec un bouton
 * "Imprimer" — sans jamais ouvrir de nouvel onglet. Remplace l'ancien
 * pattern `window.open(...).document.write(html)`.
 *
 * L'impression est aussi tentée automatiquement après le chargement, pour
 * ne pas ajouter de clic supplémentaire dans le cas courant ; le bouton
 * "Imprimer" reste disponible si l'utilisateur doit relancer la boîte de
 * dialogue (par ex. après l'avoir annulée).
 */
export function imprimerHtmlDansApp(html: string, titre = 'Aperçu avant impression'): void {
  const { iframe, imprimer } = creerApercuVisible(titre);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(injecterCssImpressionCouleur(html));
  doc.close();

  // On laisse le temps aux styles/images/QR codes de se charger avant
  // de proposer l'impression automatiquement.
  setTimeout(imprimer, 500);
}

/**
 * Affiche et imprime un PDF déjà généré (Blob, typiquement via jsPDF
 * `doc.output('blob')`) dans une fenêtre superposée à l'intérieur de
 * l'application — sans jamais ouvrir de nouvel onglet. Remplace l'ancien
 * pattern `window.open(url, '_blank')` + `win.print()`.
 */
export function imprimerPdfDansApp(blob: Blob, titre = 'Aperçu avant impression'): void {
  const url = URL.createObjectURL(blob);
  const nettoyerUrl = () => URL.revokeObjectURL(url);
  const { iframe, imprimer } = creerApercuVisible(titre, nettoyerUrl);

  let tente = false;
  const tenterImpression = () => {
    if (tente) return;
    tente = true;
    setTimeout(imprimer, 500);
  };

  iframe.onload = tenterImpression;
  iframe.src = url;
  // Filet de sécurité si l'événement `load` ne se déclenche pas comme
  // attendu (certains navigateurs, gros PDF...).
  setTimeout(tenterImpression, 1500);
}

/**
 * Télécharge un PDF (Blob) sous forme de fichier — utilisé pour les boutons
 * "Télécharger" qui ne doivent pas ouvrir de nouvel onglet non plus.
 */
export function telechargerPdfDansApp(blob: Blob, nomFichier: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
