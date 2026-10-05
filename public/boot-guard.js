/*
 * GARDIEN DE DÉMARRAGE (script classique, chargé AVANT l'application)
 *
 * Si l'application ne démarre pas — typiquement un navigateur qui a gardé en
 * mémoire l'ancienne version du site après une mise à jour et réclame des
 * fichiers qui n'existent plus — l'écran resterait indéfiniment sur
 * « Chargement d’OPTICLAIRE… ». Ce gardien :
 *   1. détecte l'échec de chargement d'un fichier de l'application → recharge ;
 *   2. si rien n'a démarré au bout de 15 s → recharge une fois (en contournant
 *      le cache) puis, si cela ne suffit pas, affiche un bouton « Recharger ».
 * Un seul rechargement automatique par minute : aucune boucle possible.
 */
(function () {
  var CLE = 'opticlaire_boot_recharge_a';
  function peutRecharger() {
    try {
      var t = Number(sessionStorage.getItem(CLE) || 0);
      if (Date.now() - t < 60000) return false;
      sessionStorage.setItem(CLE, String(Date.now()));
      return true;
    } catch (e) { return false; }
  }
  function rechargerSansCache() {
    var u = new URL(window.location.href);
    u.searchParams.set('_v', String(Date.now()));
    window.location.replace(u.toString());
  }
  function demarree() {
    var r = document.getElementById('root');
    return !!r && !r.querySelector('[data-boot-placeholder]');
  }
  function afficherBouton() {
    var r = document.getElementById('root');
    if (!r || demarree()) return;
    r.innerHTML = '<div data-boot-placeholder style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#d6e4ea;color:#1a6f8c;font:14px system-ui,sans-serif;text-align:center;padding:24px">'
      + '<div style="font-size:17px;font-weight:700">Le chargement prend trop de temps</div>'
      + '<div>Vérifiez la connexion internet puis rechargez.</div>'
      + '<button id="boot-recharger" style="padding:10px 24px;border-radius:8px;border:0;background:#1a7a96;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Recharger</button></div>';
    var b = document.getElementById('boot-recharger');
    if (b) b.onclick = rechargerSansCache;
  }
  // 1) Un fichier JS/CSS de l'application n'a pas pu être chargé.
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK') && !demarree() && peutRecharger()) rechargerSansCache();
  }, true);
  // 2) Rien n'a démarré au bout de 15 s.
  setTimeout(function () {
    if (demarree()) return;
    if (peutRecharger()) rechargerSansCache(); else afficherBouton();
  }, 15000);
})();
