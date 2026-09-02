/**
 * Aperçu d'impression intégré à l'application.
 *
 * Aucun nouvel onglet/fenêtre n'est ouvert. Le document est affiché dans une
 * fenêtre modale au-dessus de l'application, puis le bouton « Imprimer » ouvre
 * uniquement la boîte de dialogue d'impression native du navigateur.
 */

interface ViewerOptions {
  titre?: string;
  imprimerAuto?: boolean;
  nomFichier?: string;
}

let activeOverlay: HTMLDivElement | null = null;

function fermerApercu() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

function creerApercu(
  assign: (iframe: HTMLIFrameElement) => void,
  opts: ViewerOptions = {},
  objectUrl?: string,
) {
  fermerApercu();

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(15,23,42,.72)', 'display:flex',
    'flex-direction:column', 'font-family:Arial,sans-serif',
  ].join(';');

  const toolbar = document.createElement('div');
  toolbar.style.cssText = [
    'height:58px', 'min-height:58px', 'background:#fff',
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:0 16px', 'box-sizing:border-box',
    'box-shadow:0 1px 8px rgba(0,0,0,.2)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = opts.titre || 'Aperçu avant impression';
  title.style.cssText = 'font-size:16px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:16px;';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;align-items:center;flex-shrink:0;';

  const button = (label: string, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = primary
      ? 'border:0;border-radius:7px;padding:9px 15px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;'
      : 'border:1px solid #d1d5db;border-radius:7px;padding:9px 15px;background:#fff;color:#374151;font-weight:600;cursor:pointer;';
    return b;
  };

  const fermer = button('Fermer');
  const imprimer = button('Imprimer', true);
  actions.append(fermer, imprimer);
  toolbar.append(title, actions);

  const zone = document.createElement('div');
  zone.style.cssText = 'flex:1;min-height:0;padding:12px;box-sizing:border-box;display:flex;justify-content:center;';

  const iframe = document.createElement('iframe');
  iframe.title = opts.titre || 'Aperçu avant impression';
  iframe.style.cssText = 'width:min(100%,900px);height:100%;border:0;background:#fff;border-radius:4px;box-shadow:0 2px 16px rgba(0,0,0,.25);';
  zone.appendChild(iframe);
  overlay.append(toolbar, zone);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  const cleanup = () => {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
    }
  };

  fermer.onclick = () => { cleanup(); fermerApercu(); };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { cleanup(); fermerApercu(); }
  });

  imprimer.onclick = () => {
    try {
      const win = iframe.contentWindow;
      if (!win) throw new Error('Fenêtre d’aperçu indisponible');
      win.focus();
      win.print();
    } catch (e) {
      console.error('Impression impossible:', e);
    }
  };

  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' && activeOverlay === overlay) {
      document.removeEventListener('keydown', onKey);
      cleanup();
      fermerApercu();
    }
  });

  assign(iframe);
}

/** Affiche un PDF dans un véritable aperçu intégré à l'application.
 *
 * Le PDF est rendu page par page avec pdfjs-dist dans la modale. Cela évite de
 * dépendre du lecteur PDF interne de Chrome/Edge, qui peut être vide ou
 * différent selon le navigateur. Le bouton « Imprimer » imprime toujours le
 * PDF original, sans perte d'information.
 */
export async function afficherPdfBlob(blob: Blob, opts: ViewerOptions = {}): Promise<void> {
  // Comportement volontairement direct : un clic sur « PDF » ou « Imprimer »
  // doit conduire immédiatement à l'impression, sans passer par une page
  // d'aperçu/visionnage intermédiaire.
  const safeBlob = blob.type === 'application/pdf'
    ? blob
    : new Blob([blob], { type: 'application/pdf' });
  const url = URL.createObjectURL(safeBlob);

  try {
    const frame = document.createElement('iframe');
    frame.title = opts.titre || 'Document à imprimer';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = [
      'position:fixed', 'left:-10000px', 'top:0',
      'width:1px', 'height:1px', 'border:0',
      'opacity:0', 'pointer-events:none'
    ].join(';');
    document.body.appendChild(frame);

    let printed = false;
    const print = () => {
      if (printed) return;
      printed = true;
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch (e) {
        console.error('Impression PDF impossible:', e);
      } finally {
        // Laisser au navigateur le temps d'ouvrir sa page/dialogue
        // d'impression avant de nettoyer l'iframe et l'ObjectURL.
        setTimeout(() => {
          try { frame.remove(); } catch { /* ignore */ }
          try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        }, 5000);
      }
    };

    frame.onload = () => setTimeout(print, 350);
    frame.src = url;

    // Filet de sécurité pour certains lecteurs PDF qui ne déclenchent pas
    // correctement l'événement load.
    setTimeout(() => {
      if (!printed) print();
    }, 1800);
  } catch (e) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    console.error('Création de l'impression PDF impossible:', e);
  }
}

/**
 * Imprime directement un document HTML, sans écran d'aperçu intermédiaire.
 * Le document est chargé dans un iframe hors écran puis le navigateur ouvre
 * immédiatement sa page/boîte de dialogue d'impression.
 */
export function afficherHtml(html: string, opts: ViewerOptions = {}): void {
  const frame = document.createElement('iframe');
  frame.title = opts.titre || 'Document à imprimer';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = [
    'position:fixed', 'left:-10000px', 'top:0',
    'width:1px', 'height:1px', 'border:0',
    'opacity:0', 'pointer-events:none'
  ].join(';');

  document.body.appendChild(frame);

  const print = () => {
    try {
      const win = frame.contentWindow;
      if (!win) throw new Error('Fenêtre d’impression indisponible');
      win.focus();
      win.print();
    } catch (e) {
      console.error('Impression HTML impossible:', e);
    } finally {
      setTimeout(() => { try { frame.remove(); } catch { /* ignore */ } }, 5000);
    }
  };

  frame.onload = () => setTimeout(print, 150);
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}"><title>${opts.titre || 'Document'}</title></head><body style="margin:0">${html}</body></html>`;

  setTimeout(() => {
    if (document.body.contains(frame)) print();
  }, 1200);
}

/**
 * Imprime directement la page courante. Il n'y a volontairement aucun écran
 * de visionnage : le clic arrive directement dans le flux d'impression.
 */
export function imprimerPageCourante(titre = 'Document à imprimer'): void {
  const doc = document.documentElement.cloneNode(true) as HTMLElement;
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('[data-print-preview-ignore="true"]').forEach((e) => e.remove());

  const html = doc.outerHTML.replace('</head>', `
    <style>
      @media screen { body { background:#fff !important; } }
      @media print { body { background:#fff !important; } }
    </style></head>`);

  afficherHtml(html, { titre, imprimerAuto: true });
}
