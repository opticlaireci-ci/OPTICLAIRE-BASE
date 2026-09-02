/**
 * Impression de documents INTÉGRÉE À L'APPLICATION.
 *
 * Objectif : ne plus JAMAIS ouvrir une page/onglet extérieur (window.open) et ne
 * plus afficher d'aperçu intermédiaire. On imprime DIRECTEMENT via un <iframe>
 * caché ajouté au document courant : seule la boîte de dialogue d'impression du
 * navigateur apparaît. Dès qu'elle est fermée (ou l'impression terminée),
 * l'iframe est retiré et l'utilisateur revient exactement à sa page de départ.
 *
 * IMPORTANT (fiabilité en production) :
 *  - Un iframe de taille NULLE (0×0) n'est pas rendu de façon fiable par tous les
 *    navigateurs : le PDF n'est alors jamais « prêt » et `print()` ne fait rien
 *    (cas constaté après déploiement, alors que ça marchait dans l'aperçu Figma).
 *    On lui donne donc une vraie taille, mais on le place HORS ÉCRAN.
 *  - Le rendu d'un PDF dans l'iframe est asynchrone : on attend l'événement
 *    `load`, puis on laisse un délai au lecteur PDF avant d'appeler `print()`.
 *  - Filet de sécurité : si l'impression échoue (bloqueur, lecteur PDF absent),
 *    on ouvre le document dans un nouvel onglet en dernier recours.
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
 * Crée un iframe caché (hors écran mais de taille réelle), y charge le document,
 * ouvre la boîte d'impression puis nettoie tout. `assign` renseigne la source de
 * l'iframe (src pour un blob PDF, srcdoc pour du HTML).
 */
function imprimerViaIframeCache(
  assign: (iframe: HTMLIFrameElement) => void,
  opts: { objectUrl?: string; fallbackUrl?: string } = {},
): void {
  const iframe = document.createElement('iframe');
  // Hors écran mais AVEC une taille réelle : invisible pour l'utilisateur tout
  // en étant réellement rendu (indispensable pour imprimer un PDF de façon fiable).
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '794px',   // ~ A4 à 96 dpi
    height: '1123px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
  iframe.setAttribute('aria-hidden', 'true');

  let nettoye = false;
  const nettoyer = () => {
    if (nettoye) return;
    nettoye = true;
    if (opts.objectUrl) { try { URL.revokeObjectURL(opts.objectUrl); } catch { /* ignore */ } }
    // Léger différé : laisse le navigateur terminer l'impression avant de retirer l'iframe.
    setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 1000);
  };

  let aImprime = false;
  const lancerImpression = () => {
    if (aImprime) return;
    try {
      const win = iframe.contentWindow;
      if (!win) throw new Error('contentWindow indisponible');
      win.focus();
      win.onafterprint = nettoyer;
      win.print();
      aImprime = true;
    } catch {
      // Dernier recours : ouvrir le document (nouvel onglet) pour que l'utilisateur
      // puisse imprimer manuellement, plutôt que de ne rien afficher du tout.
      if (opts.fallbackUrl) { try { window.open(opts.fallbackUrl, '_blank'); } catch { /* ignore */ } }
      nettoyer();
    }
  };

  iframe.onload = () => {
    // Laisse le lecteur PDF/HTML finir son rendu avant d'ouvrir l'impression.
    // Délai plus généreux qu'en préversion : les lecteurs PDF natifs sont lents.
    setTimeout(lancerImpression, 600);
  };

  document.body.appendChild(iframe);
  assign(iframe);

  // Filet de sécurité : si `load` n'est jamais émis (certains lecteurs PDF ne le
  // déclenchent pas), on tente quand même l'impression après un délai plus long.
  setTimeout(lancerImpression, 1800);
}

/**
 * Imprime un PDF (Blob) directement, sans aperçu ni fenêtre externe.
 * Remplace `window.open(objectURL, '_blank')`.
 */
export function afficherPdfBlob(blob: Blob, _opts: ViewerOptions = {}): void {
  const url = URL.createObjectURL(blob);
  imprimerViaIframeCache((iframe) => { iframe.src = url; }, { objectUrl: url, fallbackUrl: url });
}

/**
 * Imprime un document HTML directement, sans aperçu ni fenêtre externe.
 * Remplace `const w = window.open('', '_blank'); w.document.write(html)`.
 */
export function afficherHtml(html: string, _opts: ViewerOptions = {}): void {
  imprimerViaIframeCache((iframe) => { iframe.srcdoc = html; });
}
