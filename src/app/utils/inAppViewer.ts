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

/** Affiche un PDF dans l'aperçu intégré à l'application. */
export function afficherPdfBlob(blob: Blob, opts: ViewerOptions = {}): void {
  const url = URL.createObjectURL(blob);
  creerApercu((iframe) => { iframe.src = url; }, opts, url);
}

/** Affiche un document HTML dans l'aperçu intégré à l'application. */
export function afficherHtml(html: string, opts: ViewerOptions = {}): void {
  creerApercu((iframe) => {
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}"></head><body style="margin:0">${html}</body></html>`;
  }, opts);
}

/**
 * Capture la page courante dans l'aperçu intégré. Les règles @media print
 * existantes de l'application restent disponibles dans la copie de la page.
 */
export function imprimerPageCourante(titre = 'Aperçu avant impression'): void {
  const doc = document.documentElement.cloneNode(true) as HTMLElement;
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('[data-print-preview-ignore="true"]').forEach((e) => e.remove());

  const html = doc.outerHTML.replace('</head>', `
    <style>
      @media screen { body { background:#fff !important; } }
      @media print { body { background:#fff !important; } }
    </style></head>`);

  afficherHtml(html, { titre });
}
