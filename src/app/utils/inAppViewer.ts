/**
 * Impression de documents INTÉGRÉE À L'APPLICATION.
 *
 * Objectif : ne plus JAMAIS ouvrir une page/onglet extérieur (window.open) et ne
 * plus afficher d'aperçu intermédiaire. On imprime DIRECTEMENT via un <iframe>
 * caché ajouté au document courant : seule la boîte de dialogue d'impression du
 * navigateur apparaît. Dès qu'elle est fermée (ou l'impression terminée),
 * l'iframe est retiré et l'utilisateur revient exactement à sa page de départ.
 */

interface ViewerOptions {
  /** Titre du document (repris comme titre du document imprimé si fourni). */
  titre?: string;
  /** Conservé pour compatibilité ; l'impression est désormais toujours automatique. */
  imprimerAuto?: boolean;
  /** Nom de fichier (conservé pour compatibilité, non utilisé). */
  nomFichier?: string;
}

/**
 * Crée un iframe caché, y charge le document, ouvre la boîte d'impression puis
 * nettoie tout. `assign` renseigne la source de l'iframe (src pour un blob PDF,
 * srcdoc pour du HTML).
 */
function imprimerViaIframeCache(assign: (iframe: HTMLIFrameElement) => void, objectUrl?: string): void {
  const iframe = document.createElement('iframe');
  // Iframe hors écran (taille nulle) : invisible mais imprimable par le navigateur.
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  } as CSSStyleDeclaration);

  let nettoye = false;
  const nettoyer = () => {
    if (nettoye) return;
    nettoye = true;
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } }
    // Léger différé : laisse le navigateur terminer l'impression avant de retirer l'iframe.
    setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 500);
  };

  iframe.onload = () => {
    // Laisse le document (PDF/HTML) se rendre avant d'ouvrir l'impression.
    setTimeout(() => {
      try {
        const win = iframe.contentWindow;
        if (!win) { nettoyer(); return; }
        win.focus();
        // Retour à la page de départ dès que la boîte d'impression est fermée.
        win.onafterprint = nettoyer;
        win.print();
      } catch {
        nettoyer();
      }
    }, 300);
  };

  document.body.appendChild(iframe);
  assign(iframe);
}

/**
 * Imprime un PDF (Blob) directement, sans aperçu ni fenêtre externe.
 * Remplace `window.open(objectURL, '_blank')`.
 */
export function afficherPdfBlob(blob: Blob, _opts: ViewerOptions = {}): void {
  const url = URL.createObjectURL(blob);
  imprimerViaIframeCache((iframe) => { iframe.src = url; }, url);
}

/**
 * Imprime un document HTML directement, sans aperçu ni fenêtre externe.
 * Remplace `const w = window.open('', '_blank'); w.document.write(html)`.
 */
export function afficherHtml(html: string, _opts: ViewerOptions = {}): void {
  imprimerViaIframeCache((iframe) => { iframe.srcdoc = html; });
}
