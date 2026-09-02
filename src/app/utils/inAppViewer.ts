/**
 * Impression de documents INTÉGRÉE À L'APPLICATION.
 *
 * Objectif : ne jamais ouvrir de page/onglet extérieur ni d'aperçu
 * intermédiaire quand ce n'est pas nécessaire. On imprime via un <iframe>
 * caché ajouté au document courant : seule la boîte de dialogue d'impression
 * du navigateur apparaît. Dès qu'elle est fermée (ou l'impression terminée),
 * l'iframe est retiré et l'utilisateur revient exactement à sa page de départ.
 *
 * ⚠️ FILET DE SÉCURITÉ : sur certains navigateurs/appareils (notamment
 * mobiles, ou lorsque le PDF est volumineux et met plus de temps à se
 * rendre), l'iframe caché ne parvient pas à déclencher l'impression — le
 * clic ne fait alors RIEN de visible pour l'utilisateur. Dans ce cas, on
 * ouvre automatiquement le document dans un nouvel onglet où le lecteur
 * PDF natif du navigateur (avec son propre bouton Imprimer) prend le relais.
 * Ainsi l'impression aboutit TOUJOURS, d'une façon ou d'une autre.
 */

interface ViewerOptions {
  /** Titre du document (repris comme titre du document imprimé si fourni). */
  titre?: string;
  /** Conservé pour compatibilité ; l'impression est désormais toujours automatique. */
  imprimerAuto?: boolean;
  /** Nom de fichier (conservé pour compatibilité, non utilisé). */
  nomFichier?: string;
}

// Délai laissé au document (PDF/HTML) pour se rendre dans l'iframe avant
// d'ouvrir la boîte d'impression. Augmenté par rapport à la version initiale :
// certains PDF volumineux (longs tableaux jsPDF) ou appareils lents (tablettes
// de magasin) ont besoin de plus de temps pour que le lecteur PDF intégré du
// navigateur finisse de s'initialiser — sans quoi `print()` s'ouvre sur une
// page blanche, voire ne se déclenche pas du tout.
const DELAI_RENDU_MS = 700;
// Si rien ne s'est passé après ce délai (pas de dialogue d'impression
// détectable, plugin PDF absent, navigateur mobile qui ignore `print()` sur
// un iframe…), on bascule sur le repli (nouvel onglet).
const DELAI_SECOURS_MS = 4000;

/**
 * Crée un iframe caché, y charge le document, ouvre la boîte d'impression puis
 * nettoie tout. `assign` renseigne la source de l'iframe (src pour un blob PDF,
 * srcdoc pour du HTML). Si l'impression ne peut pas être déclenchée dans
 * l'iframe, `secours` est appelé pour proposer un repli (ex. nouvel onglet).
 */
function imprimerViaIframeCache(
  assign: (iframe: HTMLIFrameElement) => void,
  objectUrl: string | undefined,
  secours: () => void,
): void {
  const iframe = document.createElement('iframe');
  // Iframe invisible mais de taille NON NULLE : certains navigateurs
  // n'initialisent pas leur lecteur PDF interne dans un iframe 0×0, ce qui
  // empêche `print()` de fonctionner. On le place hors champ visuel via un
  // positionnement fixe hors écran plutôt que via une taille nulle.
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    left: '-10000px',
    width: '800px',
    height: '600px',
    border: '0',
    visibility: 'hidden',
  } as CSSStyleDeclaration);

  let nettoye = false;
  let impressionDeclenchee = false;
  let minuteurSecours: ReturnType<typeof setTimeout> | undefined;

  const nettoyer = () => {
    if (nettoye) return;
    nettoye = true;
    if (minuteurSecours) clearTimeout(minuteurSecours);
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } }
    // Léger différé : laisse le navigateur terminer l'impression avant de retirer l'iframe.
    setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 500);
  };

  const declencherSecours = () => {
    if (impressionDeclenchee) return; // l'impression a bien démarré, pas besoin de repli
    nettoyer();
    secours();
  };

  // Filet de sécurité global : si rien ne s'est produit dans le délai imparti
  // (iframe qui ne charge jamais, plugin PDF absent, navigateur qui bloque
  // silencieusement le `print()` programmatique…), on bascule sur le repli.
  minuteurSecours = setTimeout(declencherSecours, DELAI_SECOURS_MS);

  iframe.onerror = declencherSecours;

  iframe.onload = () => {
    // Laisse le document (PDF/HTML) se rendre avant d'ouvrir l'impression.
    setTimeout(() => {
      try {
        const win = iframe.contentWindow;
        if (!win || typeof win.print !== 'function') { declencherSecours(); return; }
        impressionDeclenchee = true;
        if (minuteurSecours) clearTimeout(minuteurSecours);
        win.focus();
        // Retour à la page de départ dès que la boîte d'impression est fermée.
        win.onafterprint = nettoyer;
        win.print();
        // Certains navigateurs (notamment mobiles) ne déclenchent jamais
        // `onafterprint` : on nettoie quand même après un délai raisonnable
        // pour ne pas laisser l'iframe en mémoire indéfiniment.
        setTimeout(nettoyer, 60_000);
      } catch {
        declencherSecours();
      }
    }, DELAI_RENDU_MS);
  };

  document.body.appendChild(iframe);
  assign(iframe);
}

/**
 * Imprime un PDF (Blob) directement, sans aperçu ni fenêtre externe.
 * Si l'impression intégrée échoue (navigateur/appareil qui ne le permet pas),
 * ouvre automatiquement le PDF dans un nouvel onglet en repli : l'utilisateur
 * peut alors imprimer via le lecteur PDF natif du navigateur.
 */
export function afficherPdfBlob(blob: Blob, _opts: ViewerOptions = {}): void {
  const url = URL.createObjectURL(blob);
  imprimerViaIframeCache(
    (iframe) => { iframe.src = url; },
    url,
    () => {
      // Repli : nouvel onglet avec le PDF. On garde l'URL vivante un moment
      // pour laisser le nouvel onglet le temps de charger le blob.
      try { window.open(url, '_blank'); } finally {
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 60_000);
      }
    },
  );
}

/**
 * Imprime un document HTML directement, sans aperçu ni fenêtre externe.
 * Si l'impression intégrée échoue, ouvre le document dans un nouvel onglet
 * en repli (au lieu de ne rien faire).
 */
export function afficherHtml(html: string, _opts: ViewerOptions = {}): void {
  imprimerViaIframeCache(
    (iframe) => { iframe.srcdoc = html; },
    undefined,
    () => {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      try { window.open(url, '_blank'); } finally {
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 60_000);
      }
    },
  );
}
