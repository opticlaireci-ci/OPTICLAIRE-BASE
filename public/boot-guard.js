/*
 * GARDIEN DE DÉMARRAGE (script classique, chargé AVANT l'application)
 *
 * Problème réglé : « le site plante, et après actualisation plus rien ne
 * s'affiche tant qu'on n'a pas effacé les données du navigateur ». Le
 * navigateur conserve des copies locales (ventes, clients, stock…) et la
 * session de connexion ; si l'une d'elles devient trop grosse, abîmée ou
 * périmée, chaque rechargement retombe sur le même blocage.
 *
 * Ce gardien fait désormais lui-même ce « nettoyage des données » :
 *   1. Chaque démarrage est noté. L'application le confirme une fois affichée
 *      (window.__opticlaireDemarrageReussi). Si le démarrage PRÉCÉDENT n'a
 *      jamais été confirmé (plantage, page blanche, onglet figé), les copies
 *      locales sont effacées AVANT de lancer l'application ; au 2e échec
 *      consécutif, la session est effacée aussi (reconnexion demandée).
 *   2. Si rien n'a démarré au bout de 20 s : nettoyage puis rechargement
 *      automatique (une fois par minute au plus), sinon bouton « Réparer ».
 *   3. Un fichier de l'application introuvable (mise à jour du site) →
 *      rechargement en contournant le cache.
 *
 * Jamais effacés : les ventes / règlements pas encore envoyés au serveur
 * (file d'attente hors ligne) et les compteurs de numérotation.
 */
(function () {
  var CLE_ETAT = 'opticlaire_boot_etat';
  var CLE_RECHARGE = 'opticlaire_boot_recharge_a';
  var CLE_SESSION = 'opticlaire_supabase_auth';
  var IDB_CACHE = 'opticlaire-cache-secours';
  // Données qu'aucun nettoyage ne doit perdre.
  var A_GARDER = [
    CLE_ETAT,
    CLE_RECHARGE,                        // anti-boucle de rechargement
    'opticlaire_erreur_rechargee_a',     // anti-boucle (ErreurGlobale)
    'leclaire_pending_cloud_writes_v2', // écritures pas encore envoyées
    'leclaire_sync_v5_cloud_first_migrated', // évite de rejouer la migration
    'leclaire_callcenter_appel_en_cours',   // fiche d'appel à rouvrir au retour du téléphone
  ];
  var PREFIXES_A_GARDER = ['leclaire_counter_']; // n° de reçu, etc.

  function lireEtat() {
    try { return JSON.parse(localStorage.getItem(CLE_ETAT) || 'null') || {}; } catch (e) { return {}; }
  }
  function ecrireEtat(etat) {
    try { localStorage.setItem(CLE_ETAT, JSON.stringify(etat)); } catch (e) { /* stockage plein : le nettoyage ci-dessous libère la place */ }
  }
  function aGarder(cle, avecSession) {
    if (A_GARDER.indexOf(cle) >= 0) return true;
    if (avecSession && cle === CLE_SESSION) return true;
    for (var i = 0; i < PREFIXES_A_GARDER.length; i++) if (cle.indexOf(PREFIXES_A_GARDER[i]) === 0) return true;
    return false;
  }

  /**
   * Efface les copies locales. niveau 'caches' : tout sauf la session et les
   * données à garder ; niveau 'complet' : la session aussi (reconnexion).
   * Renvoie une promesse résolue quand IndexedDB est effacé.
   */
  function reparer(niveau) {
    var avecSession = niveau !== 'complet';
    try {
      var cles = [];
      for (var i = 0; i < localStorage.length; i++) cles.push(localStorage.key(i));
      for (var j = 0; j < cles.length; j++) {
        if (cles[j] && !aGarder(cles[j], avecSession)) {
          try { localStorage.removeItem(cles[j]); } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* localStorage inaccessible */ }
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    try {
      if (window.caches && caches.keys) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
    } catch (e) { /* ignore */ }
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); });
      }
    } catch (e) { /* ignore */ }
    return new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve();
        var req = indexedDB.deleteDatabase(IDB_CACHE);
        req.onsuccess = req.onerror = req.onblocked = function () { resolve(); };
        setTimeout(resolve, 2000);
      } catch (e) { resolve(); }
    });
  }

  function peutRecharger() {
    try {
      var t = Number(localStorage.getItem(CLE_RECHARGE) || 0);
      if (Date.now() - t < 60000) return false;
      localStorage.setItem(CLE_RECHARGE, String(Date.now()));
      return true;
    } catch (e) { return false; }
  }
  function rechargerSansCache() {
    var u = new URL(window.location.href);
    u.searchParams.set('_v', String(Date.now()));
    window.location.replace(u.toString());
  }

  // ── 1) Le démarrage précédent a-t-il échoué ? ─────────────────────────────
  var etat = lireEtat();
  var echecs = etat.debut ? (Number(etat.echecs) || 0) + 1 : 0;
  var reparation = null;
  if (echecs >= 1) {
    // 1er et 2e échec : copies locales ; 3e échec consécutif : session aussi.
    var niveau = echecs >= 3 ? 'complet' : 'caches';
    reparation = reparer(niveau);
    try { console.warn('[OPTICLAIRE] Démarrage précédent non abouti : copies locales nettoyées (' + niveau + ').'); } catch (e) { /* ignore */ }
  }
  // L'application attend ce nettoyage avant d'ouvrir sa base locale.
  window.__opticlaireReparationEnCours = reparation || Promise.resolve();
  ecrireEtat({ debut: Date.now(), echecs: Math.min(echecs, 3) });

  var confirme = false;
  window.__opticlaireDemarrageReussi = function () {
    if (confirme) return;
    confirme = true;
    try { localStorage.removeItem(CLE_ETAT); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(CLE_RECHARGE); } catch (e) { /* ignore */ }
  };
  // Page quittée volontairement (actualisation, fermeture) alors que
  // l'application était bien affichée : ce n'est pas un échec de démarrage.
  // (Un onglet planté ou figé ne déclenche pas cet événement.)
  window.addEventListener('pagehide', function () {
    if (window.__opticlaireAffichee && !confirme) window.__opticlaireDemarrageReussi();
  });

  /** Appelé par l'application quand elle détecte un état local incohérent. */
  window.__opticlaireReparer = function (niveau) {
    try { localStorage.removeItem(CLE_ETAT); } catch (e) { /* ignore */ }
    return reparer(niveau || 'caches');
  };

  // ── 2) Fichier introuvable (site mis à jour pendant la navigation) ─────────
  function demarree() {
    var r = document.getElementById('root');
    return !!r && !r.querySelector('[data-boot-placeholder]');
  }
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK') && !demarree() && peutRecharger()) rechargerSansCache();
  }, true);

  // ── 3) Rien n'a abouti au bout de 20 s ────────────────────────────────────
  function afficherBouton() {
    var r = document.getElementById('root');
    if (!r) return;
    r.innerHTML = '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#d6e4ea;color:#1a6f8c;font:14px system-ui,sans-serif;text-align:center;padding:24px">'
      + '<div style="font-size:17px;font-weight:700">Le chargement n’aboutit pas</div>'
      + '<div style="max-width:420px">Vérifiez la connexion internet. Le bouton ci-dessous nettoie les données du site sur cet appareil puis recharge (vos ventes non envoyées sont conservées).</div>'
      + '<button id="boot-reparer" style="padding:10px 24px;border-radius:8px;border:0;background:#1a7a96;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Réparer et recharger</button></div>';
    var b = document.getElementById('boot-reparer');
    if (b) b.onclick = function () { reparer('complet').then(rechargerSansCache); };
  }
  var debutAttente = Date.now();
  function surveiller() {
    if (confirme) return;
    // Code de l'application pas encore téléchargé (connexion lente) : ce n'est
    // pas un état local abîmé, on patiente (bouton au bout de 90 s).
    if (!window.__opticlaireCodeCharge) {
      if (Date.now() - debutAttente < 90000) { setTimeout(surveiller, 10000); return; }
      afficherBouton();
      return;
    }
    if (peutRecharger()) {
      reparer('caches').then(rechargerSansCache);
    } else {
      afficherBouton();
    }
  }
  setTimeout(surveiller, 20000);
})();
