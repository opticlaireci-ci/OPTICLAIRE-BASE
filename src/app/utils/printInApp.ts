/**
 * IMPRESSION DANS L'APPLICATION — sans ouvrir d'onglet / fenêtre externe.
 *
 * Toutes les impressions (factures, devis, bons, reçus, PDF...) doivent se
 * dérouler à l'intérieur de l'application : on utilise un <iframe> ajouté
 * temporairement à la page courante, positionné hors de l'écran, pour
 * déclencher la boîte de dialogue d'impression du navigateur. Aucun nouvel
 * onglet ni nouvelle fenêtre n'apparaît — l'utilisateur reste sur la page
 * de l'application.
 *
 * IMPORTANT : l'iframe ne doit PAS avoir une taille de 0×0 ni
 * `visibility:hidden`. Sur de nombreux navigateurs (Chrome en particulier),
 * un iframe de taille nulle ou invisible empêche le lecteur PDF interne de
 * s'initialiser et bloque silencieusement l'impression. On le positionne
 * donc hors du champ visible de l'écran (coordonnées négatives) tout en lui
 * gardant une taille réelle.
 */

function creerIframeHorsEcran(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '800px';
  iframe.style.height = '1000px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  return iframe;
}

function retirerIframe(iframe: HTMLIFrameElement) {
  if (iframe.parentNode) {
    iframe.parentNode.removeChild(iframe);
  }
}

/**
 * Imprime un contenu HTML (facture, devis, bon, reçu, état de stock...) sans
 * ouvrir de nouvel onglet. Remplace l'ancien pattern
 * `window.open(...).document.write(html)`.
 *
 * L'impression est toujours déclenchée explicitement par cette fonction
 * (après un court délai pour laisser le temps au contenu — styles, images,
 * QR codes — de se charger), plutôt que de dépendre d'un éventuel script
 * interne au HTML ou de l'événement `load` de l'iframe, dont le déclenchement
 * n'est pas garanti de façon fiable dans un iframe selon les navigateurs.
 */
export function imprimerHtmlDansApp(html: string): void {
  const iframe = creerIframeHorsEcran();
  const doc = iframe.contentWindow?.document;

  if (!doc) {
    retirerIframe(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow as Window;
  let dejaNettoye = false;
  const nettoyer = () => {
    if (dejaNettoye) return;
    dejaNettoye = true;
    retirerIframe(iframe);
  };

  const lancerImpression = () => {
    try {
      win.focus();
      win.print();
    } catch {
      // Ignoré : certains navigateurs peuvent bloquer l'accès, on nettoie quand même.
    }
  };

  // On laisse le temps aux styles/images/QR codes de se charger avant d'imprimer.
  setTimeout(lancerImpression, 500);

  try {
    win.onafterprint = () => nettoyer();
  } catch {
    // ignoré
  }
  // Filet de sécurité si `onafterprint` ne se déclenche pas (ex: Safari).
  setTimeout(nettoyer, 30000);
}

/**
 * Imprime un PDF déjà généré (Blob, typiquement via jsPDF `doc.output('blob')`)
 * sans ouvrir de nouvel onglet. Remplace l'ancien pattern
 * `window.open(url, '_blank')` + `win.print()`.
 */
export function imprimerPdfDansApp(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = creerIframeHorsEcran();

  let dejaNettoye = false;
  const nettoyer = () => {
    if (dejaNettoye) return;
    dejaNettoye = true;
    retirerIframe(iframe);
    URL.revokeObjectURL(url);
  };

  let impressionLancee = false;
  const lancerImpression = () => {
    if (impressionLancee) return;
    impressionLancee = true;
    try {
      const win = iframe.contentWindow as Window;
      win.focus();
      win.print();
      try {
        win.onafterprint = () => nettoyer();
      } catch {
        // ignoré
      }
    } catch {
      nettoyer();
    }
  };

  // Le lecteur PDF interne du navigateur a besoin d'un court délai après le
  // chargement du blob avant d'accepter l'impression — on tente donc au
  // `load` de l'iframe, avec un filet de sécurité si l'événement ne se
  // déclenche pas comme attendu.
  iframe.onload = () => setTimeout(lancerImpression, 500);
  iframe.src = url;
  setTimeout(lancerImpression, 1500);

  // Filet de sécurité final si l'impression n'est jamais déclenchée / fermée.
  setTimeout(nettoyer, 30000);
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
