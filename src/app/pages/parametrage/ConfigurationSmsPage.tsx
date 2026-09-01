import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { loadConfigSms, saveConfigSms, type ConfigSms, getStatistiquesSms, envoyerSmsReel, isSmsConfigure, loadCreditsSms, setCreditsSms, etatCreditSms, SMS_CREDITS_EVENT } from '../../services/smsService';

export function ConfigurationSmsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ConfigSms>(loadConfigSms());
  const [stats, setStats] = useState(getStatistiquesSms());
  const [credits, setCredits] = useState(loadCreditsSms());
  const [creditsInput, setCreditsInput] = useState(String(loadCreditsSms().total || ''));
  const [saved, setSaved] = useState(false);

  // Test SMS
  const [testTelephone, setTestTelephone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testEnvoye, setTestEnvoye] = useState(false);
  const [testErreur, setTestErreur] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  // État de connexion Infobip
  const [infobip, setInfobip] = useState<{ configured: boolean; sender?: string } | null>(null);

  useEffect(() => {
    rafraichirStats();
    isSmsConfigure().then(setInfobip);
    // Rafraîchit le compteur de SMS en direct (baisse à chaque envoi).
    const majCredits = () => setCredits(loadCreditsSms());
    window.addEventListener(SMS_CREDITS_EVENT, majCredits);
    window.addEventListener('storage', majCredits);
    return () => {
      window.removeEventListener(SMS_CREDITS_EVENT, majCredits);
      window.removeEventListener('storage', majCredits);
    };
  }, []);

  function handleSaveCredits() {
    const n = Math.max(0, parseInt(creditsInput, 10) || 0);
    setCreditsSms(n);
    setCredits(loadCreditsSms());
  }

  function rafraichirStats() {
    setStats(getStatistiquesSms());
  }

  function handleSave() {
    saveConfigSms(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleTestSms() {
    if (!testTelephone || !testMessage) {
      alert('Veuillez remplir le numéro de téléphone et le message');
      return;
    }
    setEnvoiEnCours(true);
    setTestErreur('');
    setTestEnvoye(false);
    const res = await envoyerSmsReel({
      client: 'Test SMS',
      telephone: testTelephone,
      message: testMessage,
      nature: 'Test Configuration',
    });
    setEnvoiEnCours(false);
    rafraichirStats();
    if (res.success) {
      setTestEnvoye(true);
      setTestTelephone('');
      setTestMessage('');
      setTimeout(() => setTestEnvoye(false), 4000);
    } else {
      setTestErreur(res.error || "Échec de l'envoi");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/parametrage/configuration')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
          >
            <ArrowLeft size={18} />
            Retour
          </button>
          <h1 className="text-2xl font-bold text-gray-800">⚙️ Configuration SMS Automatique</h1>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          <Save size={18} />
          {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* État de connexion Infobip */}
      {infobip && (
        <div className={`mb-6 rounded-lg p-4 border ${infobip.configured ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          {infobip.configured ? (
            <div className="text-sm text-green-800">
              ✅ <strong>Orange SMS connecté</strong>{infobip.sender ? ` — expéditeur : ${infobip.sender}` : ''}. Les SMS sont envoyés réellement.
            </div>
          ) : (
            <div className="text-sm text-red-800">
              ⚠️ <strong>Orange SMS non configuré.</strong> Définissez les secrets <code>ORANGE_SMS_AUTH_HEADER</code> et <code>ORANGE_SENDER_ADDRESS</code> dans Supabase, puis redéployez la fonction serveur. Les SMS ne partiront pas tant que ce n'est pas fait.
            </div>
          )}
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-sm text-gray-600">SMS Total</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-3xl font-bold text-green-600">{stats.envoyes}</div>
          <div className="text-sm text-gray-600">SMS Envoyés</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-3xl font-bold text-red-600">{stats.echecs}</div>
          <div className="text-sm text-gray-600">SMS Échecs</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-700">Dernier envoi</div>
          <div className="text-xs text-gray-600 mt-1">
            {stats.dernierEnvoi ? (
              <>
                <div>{stats.dernierEnvoi.client}</div>
                <div className="text-gray-400">
                  {new Date(stats.dernierEnvoi.date).toLocaleString('fr-FR')}
                </div>
              </>
            ) : (
              'Aucun'
            )}
          </div>
        </div>
      </div>

      {/* Compteur / crédit de SMS disponibles */}
      {(() => {
        const etat = etatCreditSms();
        const restant = credits.restant;
        const total = credits.total;
        const pct = total > 0 ? Math.round((restant / total) * 100) : 0;
        const couleur =
          etat === 'danger' ? { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', bar: 'bg-red-500' }
          : etat === 'warn' ? { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', bar: 'bg-yellow-400' }
          : etat === 'ok' ? { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', bar: 'bg-green-500' }
          : { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', bar: 'bg-gray-400' };
        return (
          <div className={`mb-6 rounded-lg p-6 border ${couleur.bg} ${couleur.border}`}>
            <h2 className="text-xl font-bold mb-1 text-gray-800">📶 Crédit de SMS disponibles</h2>
            <p className="text-sm text-gray-600 mb-4">
              Saisissez le nombre réel de SMS dont vous disposez. Ce compteur diminue à chaque SMS envoyé,
              passe en <span className="font-semibold text-yellow-600">jaune</span> quand il est presque épuisé,
              puis en <span className="font-semibold text-red-600">rouge</span> quand il est terminé.
            </p>

            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de SMS disponibles</label>
                <input
                  type="number"
                  min={0}
                  value={creditsInput}
                  onChange={(e) => setCreditsInput(e.target.value)}
                  className="w-40 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Ex : 1000"
                />
              </div>
              <button
                onClick={handleSaveCredits}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Enregistrer le crédit
              </button>
            </div>

            {total > 0 ? (
              <>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-4xl font-extrabold ${couleur.text}`}>{restant}</span>
                  <span className="text-gray-500">/ {total} SMS restants</span>
                  {etat === 'danger' && <span className="ml-2 font-semibold text-red-600">— Crédit épuisé !</span>}
                  {etat === 'warn' && <span className="ml-2 font-semibold text-yellow-600">— Bientôt épuisé</span>}
                </div>
                <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-gray-200">
                  <div className={`h-full ${couleur.bar} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500">Aucun crédit configuré. Saisissez un nombre pour activer le suivi.</div>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-6">
        {/* Configuration SMS Bienvenue */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">📤 SMS de Bienvenue</h2>
          <p className="text-sm text-gray-600 mb-4">
            Envoyer automatiquement un message de bienvenue à chaque nouveau client enregistré.
          </p>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.envoyerBienvenue}
                onChange={(e) => setConfig({ ...config, envoyerBienvenue: e.target.checked })}
                className="w-5 h-5"
              />
              <span className="font-medium text-gray-700">Activer l'envoi automatique</span>
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message de bienvenue
            </label>
            <textarea
              value={config.messageBienvenue}
              onChange={(e) => setConfig({ ...config, messageBienvenue: e.target.value })}
              rows={4}
              disabled={!config.envoyerBienvenue}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Votre message de bienvenue..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.messageBienvenue.length} caractères
            </p>
          </div>

          {config.envoyerBienvenue && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-sm font-medium text-green-800">✅ Activé</div>
              <div className="text-xs text-green-700 mt-1">
                Un SMS sera automatiquement envoyé à chaque nouveau client
              </div>
            </div>
          )}
          {!config.envoyerBienvenue && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-700">⏸️ Désactivé</div>
              <div className="text-xs text-gray-600 mt-1">
                Aucun SMS ne sera envoyé automatiquement
              </div>
            </div>
          )}
        </div>

        {/* Configuration SMS Anniversaire */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">🎂 SMS d'Anniversaire</h2>
          <p className="text-sm text-gray-600 mb-4">
            Envoyer automatiquement un message d'anniversaire à vos clients.
          </p>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.envoyerAnniversaire}
                onChange={(e) => setConfig({ ...config, envoyerAnniversaire: e.target.checked })}
                className="w-5 h-5"
              />
              <span className="font-medium text-gray-700">Activer l'envoi automatique</span>
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message d'anniversaire
            </label>
            <textarea
              value={config.messageAnniversaire}
              onChange={(e) => setConfig({ ...config, messageAnniversaire: e.target.value })}
              rows={4}
              disabled={!config.envoyerAnniversaire}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Votre message d'anniversaire..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.messageAnniversaire.length} caractères
            </p>
          </div>

          {config.envoyerAnniversaire && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-sm font-medium text-green-800">✅ Activé</div>
              <div className="text-xs text-green-700 mt-1">
                Envoyé automatiquement chaque jour aux clients dont c'est l'anniversaire
              </div>
            </div>
          )}
          {!config.envoyerAnniversaire && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-700">⏸️ Désactivé</div>
              <div className="text-xs text-gray-600 mt-1">
                Les messages d'anniversaire ne seront pas envoyés
              </div>
            </div>
          )}
        </div>

        {/* Configuration SMS Retrait (lunettes prêtes) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">👓 SMS de Retrait (lunettes prêtes)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Prévenir automatiquement le client lorsque sa commande de verres est prête à être récupérée.
          </p>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.envoyerRetrait}
                onChange={(e) => setConfig({ ...config, envoyerRetrait: e.target.checked })}
                className="w-5 h-5"
              />
              <span className="font-medium text-gray-700">Activer l'envoi automatique</span>
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message de retrait
            </label>
            <textarea
              value={config.messageRetrait}
              onChange={(e) => setConfig({ ...config, messageRetrait: e.target.value })}
              rows={4}
              disabled={!config.envoyerRetrait}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Votre message de retrait..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.messageRetrait.length} caractères
            </p>
          </div>

          {config.envoyerRetrait ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-sm font-medium text-green-800">✅ Activé</div>
              <div className="text-xs text-green-700 mt-1">
                Un SMS est envoyé (une seule fois) quand un bon de commande verres passe au statut « prêt / disponible »
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-700">⏸️ Désactivé</div>
              <div className="text-xs text-gray-600 mt-1">
                Aucune notification de retrait ne sera envoyée
              </div>
            </div>
          )}
        </div>

        {/* Configuration SMS Remerciement (après vente/facture) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">🙏 SMS de Remerciement (après vente)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Remercier automatiquement le client après chaque vente / facture enregistrée.
          </p>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.envoyerVente}
                onChange={(e) => setConfig({ ...config, envoyerVente: e.target.checked })}
                className="w-5 h-5"
              />
              <span className="font-medium text-gray-700">Activer l'envoi automatique</span>
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message de remerciement
            </label>
            <textarea
              value={config.messageVente}
              onChange={(e) => setConfig({ ...config, messageVente: e.target.value })}
              rows={4}
              disabled={!config.envoyerVente}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Votre message de remerciement..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.messageVente.length} caractères
            </p>
          </div>

          {config.envoyerVente ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-sm font-medium text-green-800">✅ Activé</div>
              <div className="text-xs text-green-700 mt-1">
                Un SMS est envoyé (une seule fois) à chaque vente / facture enregistrée
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-700">⏸️ Désactivé</div>
              <div className="text-xs text-gray-600 mt-1">
                Aucun remerciement ne sera envoyé après une vente
              </div>
            </div>
          )}
        </div>

        {/* Configuration SMS Renouvellement des verres */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">🔁 SMS de Renouvellement des verres</h2>
          <p className="text-sm text-gray-600 mb-4">
            Rappeler automatiquement aux clients ayant acheté des verres de penser à les renouveler,
            un certain temps après leur achat (par défaut 1 an et 8 mois).
          </p>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.envoyerRenouvellement}
                onChange={(e) => setConfig({ ...config, envoyerRenouvellement: e.target.checked })}
                className="w-5 h-5"
              />
              <span className="font-medium text-gray-700">Activer l'envoi automatique</span>
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Délai après achat (en mois)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={config.delaiRenouvellementMois}
              onChange={(e) => setConfig({ ...config, delaiRenouvellementMois: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              disabled={!config.envoyerRenouvellement}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              20 mois = 1 an et 8 mois. Le SMS part une seule fois par vente, une fois ce délai atteint.
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message de renouvellement
            </label>
            <textarea
              value={config.messageRenouvellement}
              onChange={(e) => setConfig({ ...config, messageRenouvellement: e.target.value })}
              rows={4}
              disabled={!config.envoyerRenouvellement}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Votre message de rappel de renouvellement..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.messageRenouvellement.length} caractères
            </p>
          </div>

          {config.envoyerRenouvellement ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-sm font-medium text-green-800">✅ Activé</div>
              <div className="text-xs text-green-700 mt-1">
                Un SMS de rappel est envoyé (une seule fois) aux clients {config.delaiRenouvellementMois} mois après l'achat de leurs verres
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-700">⏸️ Désactivé</div>
              <div className="text-xs text-gray-600 mt-1">
                Aucun rappel de renouvellement ne sera envoyé
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test SMS */}
      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">🧪 Tester l'envoi de SMS</h2>
        <p className="text-sm text-gray-600 mb-4">
          Envoyez un SMS de test pour vérifier que tout fonctionne correctement.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Numéro de téléphone
            </label>
            <input
              type="tel"
              value={testTelephone}
              onChange={(e) => setTestTelephone(e.target.value)}
              placeholder="+225 XX XX XX XX XX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message de test
            </label>
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Votre message de test..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleTestSms}
            disabled={envoiEnCours}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-60"
          >
            <Send size={18} />
            {envoiEnCours ? 'Envoi en cours…' : 'Envoyer SMS de Test'}
          </button>
          {testEnvoye && (
            <div className="text-green-600 font-medium">✓ SMS de test envoyé avec succès !</div>
          )}
          {testErreur && (
            <div className="text-red-600 font-medium">✗ {testErreur}</div>
          )}
        </div>

        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-sm font-medium text-blue-800">ℹ️ Envoi réel via Orange SMS</div>
          <div className="text-xs text-blue-700 mt-1">
            Utilisez un numéro au format international (ex : <code>2250700000000</code>). Le résultat réel (Envoyé / Échec) s'affiche ci-dessus et dans la page « Rapport SMS ».
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Comment ça fonctionne ?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>SMS de Bienvenue :</strong> Envoyé automatiquement à chaque nouveau client enregistré</li>
          <li>• <strong>SMS d'Anniversaire :</strong> Envoyé automatiquement chaque jour aux clients dont c'est l'anniversaire</li>
          <li>• <strong>SMS de Retrait :</strong> Envoyé quand une commande de verres passe au statut « prêt / disponible »</li>
          <li>• <strong>SMS de Remerciement :</strong> Envoyé automatiquement après chaque vente / facture enregistrée</li>
          <li>• <strong>SMS de Renouvellement :</strong> Envoyé une seule fois aux clients ayant acheté des verres, une fois le délai configuré atteint (par défaut 1 an et 8 mois)</li>
          <li>• <strong>Numéros :</strong> Ils sont automatiquement mis au format international (Côte d'Ivoire +225)</li>
          <li>• <strong>Personnalisation :</strong> Vous pouvez modifier les messages à tout moment</li>
          <li>• <strong>Rapport :</strong> Tous les SMS envoyés sont enregistrés dans la page "Rapport SMS"</li>
        </ul>
      </div>
    </div>
  );
}
