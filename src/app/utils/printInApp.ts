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
 * bloque silencieusement l'impression.
 *
 * DEUX PROBLÈMES CONNUS ET LEURS CORRECTIFS DANS CE FICHIER :
 *
 * 1) « Ça ne sort pas en couleur » — La plupart des navigateurs
 *    n'impriment PAS les couleurs de fond par défaut (économie d'encre),
 *    sauf si :
 *      a) le CSS force `print-color-adjust: exact` (fait ci-dessous, sur
 *         TOUS les éléments, avec !important) ET
 *      b) l'option "Graphiques d'arrière-plan" / "Background graphics" de
 *         la boîte de dialogue d'impression du navigateur n'est pas
 *         décochée manuellement par l'utilisateur, ET
 *      c) l'imprimante elle-même n'est pas réglée en mode "Noir et blanc"
 *         / "Économie d'encre" au niveau du pilote — ce réglage matériel
 *         est hors de portée du code de l'application.
 *    On force donc le CSS le plus largement possible, et on affiche un
 *    petit rappel visuel dans l'aperçu pour guider l'utilisateur si malgré
 *    tout rien ne sort en couleur.
 *
 * 2) « Le PDF ne s'imprime pas toujours » — `iframe.contentWindow.print()`
 *    sur une visionneuse PDF intégrée (Chrome PDFium, etc.) est connu pour
 *    être capricieux : il peut échouer silencieusement si l'appel se
 *    produit avant que la visionneuse ait fini de s'initialiser, ou ne
 *    fonctionne pas du tout sur certains navigateurs mobiles. On attend
 *    donc un signal de chargement réel (évènement `load`) avant de tenter
 *    l'impression, ET on fournit toujours un bouton "Télécharger" qui,
 *    lui, fonctionne dans 100 % des cas (l'utilisateur peut alors imprimer
 *    depuis sa visionneuse PDF native, où le bouton natif est fiable).
 */

interface Apercu {
  iframe: HTMLIFrameElement;
  fermer: () => void;
  imprimer: () => void;
}

function creerApercuVisible(
  titre: string,
  onFermer?: () => void,
  onTelecharger?: () => void,
): Apercu {
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
    gap: '12px',
    flexWrap: 'wrap',
  } as Partial<CSSStyleDeclaration>);

  const titreEl = document.createElement('span');
  titreEl.textContent = titre;

  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '8px';
  btnGroup.style.flexWrap = 'wrap';

  const faireBouton = (label: string, primaire: boolean) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '7px 16px',
      borderRadius: '6px',
      border: primaire ? 'none' : '1px solid rgba(255,255,255,0.7)',
      background: primaire ? '#fff' : 'transparent',
      color: primaire ? '#1a7a96' : '#fff',
      fontWeight: primaire ? '700' : '600',
      cursor: 'pointer',
      fontSize: '13px',
    } as Partial<CSSStyleDeclaration>);
    return btn;
  };

  const btnImprimer = faireBouton('🖨️ Imprimer', true);
  const btnTelecharger = faireBouton('⬇️ Télécharger', false);
  const btnFermer = faireBouton('Fermer', false);

  btnGroup.appendChild(btnImprimer);
  if (onTelecharger) btnGroup.appendChild(btnTelecharger);
  btnGroup.appendChild(btnFermer);
  toolbar.appendChild(titreEl);
  toolbar.appendChild(btnGroup);

  // Rappel discret : aide au diagnostic si les couleurs ne sortent pas à
  // l'impression malgré le CSS forcé (réglage propre au navigateur / à
  // l'imprimante, hors de portée du code).
  const astuce = document.createElement('div');
  astuce.textContent = "Astuce : si l'impression sort sans couleur, activez « Graphiques d'arrière-plan » dans les options d'impression du navigateur (ou téléchargez le fichier et imprimez-le depuis votre visionneuse PDF).";
  Object.assign(astuce.style, {
    padding: '6px 16px',
    background: '#eef7fa',
    color: '#0f4c5c',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '11.5px',
    flexShrink: '0',
    borderBottom: '1px solid #d8ecf1',
  } as Partial<CSSStyleDeclaration>);

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    flex: '1',
    width: '100%',
    border: '0',
    background: '#525659',
  } as Partial<CSSStyleDeclaration>);

  panel.appendChild(toolbar);
  panel.appendChild(astuce);
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
      iframe.focus();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Ignoré : on laisse l'utilisateur réessayer via le bouton, ou
      // utiliser le bouton "Télécharger" qui fonctionne toujours.
    }
  };

  btnFermer.addEventListener('click', fermer);
  btnImprimer.addEventListener('click', imprimer);
  if (onTelecharger) btnTelecharger.addEventListener('click', onTelecharger);
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
 * explicite dans le CSS). Appliqué avec la plus large spécificité possible
 * (sélecteur universel + !important) pour ne rien laisser passer, y
 * compris les couleurs posées en `style="..."` inline.
 */
function injecterCssImpressionCouleur(html: string): string {
  const styleForce = `<style>
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    @media print {
      html, body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
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
 * Attend que toutes les images du document (logo, QR code...) soient
 * réellement chargées avant de déclencher l'impression, avec un plafond de
 * sécurité pour ne jamais bloquer indéfiniment (ex. image externe qui ne
 * répond pas).
 */
function attendreImages(doc: Document, delaiMaxMs = 2500): Promise<void> {
  const images = Array.from(doc.images || []);
  if (images.length === 0) return Promise.resolve();

  const attentes = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  });

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, delaiMaxMs));
  return Promise.race([Promise.all(attentes).then(() => undefined), timeout]);
}

/**
 * Affiche un aperçu (facture, devis, bon, reçu, état de stock...) dans une
 * fenêtre superposée à l'intérieur de l'application, avec un bouton
 * "Imprimer" — sans jamais ouvrir de nouvel onglet. Remplace l'ancien
 * pattern `window.open(...).document.write(html)`.
 *
 * L'impression est aussi tentée automatiquement une fois les images (logo,
 * QR code...) réellement chargées, pour ne pas ajouter de clic
 * supplémentaire dans le cas courant ; le bouton "Imprimer" reste
 * disponible si l'utilisateur doit relancer la boîte de dialogue (par ex.
 * après l'avoir annulée).
 */
export function imprimerHtmlDansApp(html: string, titre = 'Aperçu avant impression'): void {
  const htmlAvecCouleurs = injecterCssImpressionCouleur(html);

  const telecharger = () => {
    const blob = new Blob([htmlAvecCouleurs], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titre.replace(/[^\w\- ]+/g, '').trim() || 'document'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const { iframe, imprimer } = creerApercuVisible(titre, undefined, telecharger);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(htmlAvecCouleurs);
  doc.close();

  attendreImages(doc).then(imprimer);
}

/**
 * Affiche et imprime un PDF déjà généré (Blob, typiquement via jsPDF
 * `doc.output('blob')`) dans une fenêtre superposée à l'intérieur de
 * l'application — sans jamais ouvrir de nouvel onglet. Remplace l'ancien
 * pattern `window.open(url, '_blank')` + `win.print()`.
 *
 * `iframe.contentWindow.print()` sur une visionneuse PDF intégrée peut
 * échouer silencieusement (voir note en tête de fichier) : le bouton
 * "Télécharger", lui, fonctionne toujours et permet d'imprimer depuis la
 * visionneuse PDF native de l'appareil si l'impression automatique ne se
 * déclenche pas.
 */
export function imprimerPdfDansApp(blob: Blob, titre = 'Aperçu avant impression'): void {
  const url = URL.createObjectURL(blob);
  const nettoyerUrl = () => URL.revokeObjectURL(url);
  const telecharger = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titre.replace(/[^\w\- ]+/g, '').trim() || 'document'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const { iframe, imprimer } = creerApercuVisible(titre, nettoyerUrl, telecharger);

  let tente = false;
  const tenterImpression = () => {
    if (tente) return;
    tente = true;
    setTimeout(imprimer, 600);
  };

  iframe.onload = tenterImpression;
  iframe.src = url;
  // Filet de sécurité si l'événement `load` ne se déclenche pas comme
  // attendu (certains navigateurs, gros PDF, visionneuse interne lente...).
  setTimeout(tenterImpression, 2000);
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
