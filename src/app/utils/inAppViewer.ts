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
  const url = URL.createObjectURL(blob);
  fermerApercu();

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:2147483647','background:rgba(15,23,42,.72)',
    'display:flex','flex-direction:column','font-family:Arial,sans-serif'
  ].join(';');

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'height:58px;min-height:58px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;box-sizing:border-box;box-shadow:0 1px 8px rgba(0,0,0,.2);';

  const title = document.createElement('div');
  title.textContent = opts.titre || 'Aperçu PDF avant impression';
  title.style.cssText = 'font-size:16px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:16px;';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;align-items:center;flex-shrink:0;';
  const makeButton = (label: string, primary = false) => {
    const b = document.createElement('button'); b.type='button'; b.textContent=label;
    b.style.cssText = primary
      ? 'border:0;border-radius:7px;padding:9px 15px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;'
      : 'border:1px solid #d1d5db;border-radius:7px;padding:9px 15px;background:#fff;color:#374151;font-weight:600;cursor:pointer;';
    return b;
  };
  const fermer = makeButton('Fermer');
  const imprimer = makeButton('Imprimer', true);
  actions.append(fermer, imprimer); toolbar.append(title, actions);

  const zone = document.createElement('div');
  zone.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:20px;box-sizing:border-box;background:#e5e7eb;';
  const pages = document.createElement('div');
  pages.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:20px;min-height:100%;';
  zone.appendChild(pages); overlay.append(toolbar, zone); document.body.appendChild(overlay); activeOverlay=overlay;

  const cleanup = () => { try { URL.revokeObjectURL(url); } catch {} };
  const close = () => { cleanup(); if (activeOverlay===overlay) { overlay.remove(); activeOverlay=null; } };
  fermer.onclick=close;
  overlay.addEventListener('click', e => { if(e.target===overlay) close(); });

  // Impression du PDF original via un iframe caché : aucune nouvelle fenêtre.
  imprimer.onclick = () => {
    const frame=document.createElement('iframe');
    frame.style.cssText='position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0;';
    frame.src=url; document.body.appendChild(frame);
    frame.onload=()=>setTimeout(()=>{ try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } finally { setTimeout(()=>frame.remove(),1500); } },300);
  };

  const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape' && activeOverlay===overlay){ document.removeEventListener('keydown',onKey); close(); } };
  document.addEventListener('keydown',onKey);

  try {
    // pdfjs-dist est déjà présent dans le projet. Le worker est désactivé pour
    // rendre le composant fiable avec Vite et éviter toute URL de worker externe.
    const pdfjs = await import('pdfjs-dist');
    const data = new Uint8Array(await blob.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;

    const info = document.createElement('div');
    info.textContent = `${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''} — aperçu complet`;
    info.style.cssText='width:min(900px,100%);font-size:13px;color:#4b5563;text-align:center;';
    pages.appendChild(info);

    for (let pageNo=1; pageNo<=pdf.numPages; pageNo++) {
      const page=await pdf.getPage(pageNo);
      const base=page.getViewport({scale:1});
      const maxWidth=Math.min(900, Math.max(320, zone.clientWidth-40));
      const scale=maxWidth/base.width;
      const viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
      canvas.style.cssText='display:block;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.22);max-width:100%;height:auto;';
      pages.appendChild(canvas);
      await page.render({canvas, viewport}).promise;
    }
  } catch (e) {
    console.error('Aperçu PDF impossible:', e);
    pages.innerHTML='';
    const msg=document.createElement('div');
    msg.style.cssText='margin:auto;padding:24px;background:#fff;border-radius:10px;color:#b91c1c;font-weight:600;';
    msg.textContent='Impossible d’afficher l’aperçu PDF. Vous pouvez néanmoins cliquer sur « Imprimer ».';
    pages.appendChild(msg);
  }
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
