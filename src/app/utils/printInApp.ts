/**
 * IMPRESSION DANS L'APPLICATION — sans ouvrir d'onglet / fenêtre externe.
 *
 * Toutes les impressions (factures, devis, bons, reçus, PDF...) doivent se
 * dérouler à l'intérieur de l'application : on utilise un <iframe> caché,
 * ajouté temporairement à la page courante, pour déclencher la boîte de
 * dialogue d'impression du navigateur. Aucun nouvel onglet ni nouvelle
 * fenêtre n'apparaît — l'utilisateur reste sur la page de l'application.
 */

function creerIframeCache(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
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
 * Certains contenus intègrent déjà leur propre `<script>` qui appelle
 * `window.print()` au chargement (pattern historique de l'app) : dans ce
 * cas on laisse ce script gérer l'impression (il s'exécutera dans l'iframe)
 * et on se contente de nettoyer l'iframe ensuite. Sinon, on déclenche
 * nous-mêmes l'impression.
 */
export function imprimerHtmlDansApp(html: string): void {
  const iframe = creerIframeCache();
  const doc = iframe.contentWindow?.document;

  if (!doc) {
    retirerIframe(iframe);
    return;
  }

  const contientImpressionAutonome = /window\.print\s*\(/.test(html);

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow as Window;

  const lancerImpression = () => {
    try {
      win.focus();
      win.print();
    } catch {
      // Ignoré : certains navigateurs peuvent bloquer l'accès, on nettoie quand même.
    }
  };

  // Si le HTML ne déclenche pas déjà son impression, on s'en charge.
  if (!contientImpressionAutonome) {
    setTimeout(lancerImpression, 300);
  }

  try {
    win.onafterprint = () => retirerIframe(iframe);
  } catch {
    // ignoré
  }
  // Filet de sécurité si `onafterprint` ne se déclenche pas (ex: Safari,
  // ou si le script interne appelle window.close() qui est sans effet ici).
  setTimeout(() => retirerIframe(iframe), 20000);
}

/**
 * Imprime un PDF déjà généré (Blob, typiquement via jsPDF `doc.output('blob')`)
 * sans ouvrir de nouvel onglet. Remplace l'ancien pattern
 * `window.open(url, '_blank')` + `win.print()`.
 */
export function imprimerPdfDansApp(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = creerIframeCache();

  const nettoyer = () => {
    retirerIframe(iframe);
    URL.revokeObjectURL(url);
  };

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow as Window;
      win.focus();
      setTimeout(() => {
        try {
          win.print();
          win.onafterprint = () => nettoyer();
        } catch {
          nettoyer();
        }
      }, 300);
    } catch {
      nettoyer();
    }
  };

  iframe.src = url;

  // Filet de sécurité si l'impression n'est jamais déclenchée / fermée.
  setTimeout(nettoyer, 25000);
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
