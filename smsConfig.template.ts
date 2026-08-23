/**
 * ⚙️ CONFIGURATION SMS - Africa's Talking
 *
 * 🔐 IMPORTANT - SÉCURITÉ :
 * 1. Copiez ce fichier vers : src/app/config/smsConfig.ts
 * 2. Remplacez 'VOTRE_API_KEY_ICI' par votre vraie API Key
 * 3. Ajoutez src/app/config/smsConfig.ts à .gitignore
 *
 * 📝 COMMENT OBTENIR VOTRE API KEY :
 * 1. Allez sur https://account.africastalking.com/auth/register
 * 2. Créez un compte gratuit
 * 3. Vérifiez votre email
 * 4. Dashboard → Apps → Sandbox → Settings → API Key
 * 5. Copiez votre API Key (commence par atsk_)
 *
 * 💰 COÛT :
 * - Mode Sandbox (username: 'sandbox') : GRATUIT (SMS simulés)
 * - Mode Production : ~$0.01-$0.04 par SMS
 */

export const SMS_CONFIG = {
  // Provider actif : 'africastalking' | 'twilio' | 'simulation'
  activeProvider: 'africastalking',

  // ────────────────────────────────────────────────────────────
  // 📱 AFRICA'S TALKING
  // ────────────────────────────────────────────────────────────
  africastalking: {
    // 👤 USERNAME
    // En mode test : 'sandbox'
    // En mode production : votre vrai username (ex: 'leclaire')
    username: 'sandbox',

    // 🔑 API KEY
    // Obtenez-la ici : https://account.africastalking.com/apps/sandbox/settings/key
    // ⚠️ Remplacez 'VOTRE_API_KEY_ICI' par votre vraie API Key
    apiKey: 'VOTRE_API_KEY_ICI',

    // 📤 SENDER ID (Nom affiché lors de l'envoi)
    // En mode sandbox, ce champ est ignoré
    // En mode production, vous pouvez personnaliser (ex: 'LECLAIRE')
    senderId: 'LECLAIRE',
  },

  // ────────────────────────────────────────────────────────────
  // 📱 TWILIO (Optionnel - Service international)
  // ────────────────────────────────────────────────────────────
  twilio: {
    // Obtenez ces infos sur : https://www.twilio.com/console
    accountSid: '',
    authToken: '',
    phoneNumber: '', // Format : +1234567890
  },
};

// ────────────────────────────────────────────────────────────
// 🔍 FONCTION DE VALIDATION
// ────────────────────────────────────────────────────────────

/**
 * Vérifie si la configuration est valide
 * Affiche des messages d'erreur utiles dans la console
 */
export function isConfigValid(): boolean {
  const provider = SMS_CONFIG.activeProvider;

  if (provider === 'africastalking') {
    const config = SMS_CONFIG.africastalking;

    // Vérifier que l'API Key est définie
    if (!config.apiKey || config.apiKey === 'VOTRE_API_KEY_ICI') {
      console.error('❌ API Key Africa\'s Talking non configurée !');
      console.log('');
      console.log('📋 ÉTAPES POUR CONFIGURER :');
      console.log('1️⃣ Allez sur https://account.africastalking.com/auth/register');
      console.log('2️⃣ Créez un compte gratuit et vérifiez votre email');
      console.log('3️⃣ Dashboard → Apps → Sandbox → Settings → API Key');
      console.log('4️⃣ Copiez votre API Key (commence par atsk_)');
      console.log('5️⃣ Remplacez VOTRE_API_KEY_ICI dans smsConfig.ts');
      console.log('');
      return false;
    }

    // Vérifier le format de l'API Key
    if (!config.apiKey.startsWith('atsk_')) {
      console.warn('⚠️ Votre API Key ne commence pas par "atsk_"');
      console.log('   Assurez-vous d\'avoir copié la bonne clé depuis Africa\'s Talking');
    }

    // Vérifier le username
    if (!config.username) {
      console.error('❌ Username Africa\'s Talking non configuré !');
      return false;
    }

    console.log('✅ Configuration Africa\'s Talking valide');
    console.log(`   Username: ${config.username}`);
    console.log(`   Mode: ${config.username === 'sandbox' ? 'TEST (gratuit)' : 'PRODUCTION (payant)'}`);
    return true;
  }

  if (provider === 'twilio') {
    const config = SMS_CONFIG.twilio;

    if (!config.accountSid || !config.authToken || !config.phoneNumber) {
      console.error('❌ Configuration Twilio incomplète !');
      console.log('👉 Allez sur https://www.twilio.com/console');
      return false;
    }

    console.log('✅ Configuration Twilio valide');
    return true;
  }

  console.warn('⚠️ Mode simulation activé - les SMS ne seront pas réellement envoyés');
  return true;
}

// ────────────────────────────────────────────────────────────
// 📊 INFORMATIONS
// ────────────────────────────────────────────────────────────

/**
 * Affiche les informations de configuration dans la console
 */
export function afficherInfoConfig(): void {
  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('📱 CONFIGURATION SMS');
  console.log('════════════════════════════════════════════');
  console.log('');
  console.log(`Provider actif : ${SMS_CONFIG.activeProvider}`);
  console.log('');

  if (SMS_CONFIG.activeProvider === 'africastalking') {
    const config = SMS_CONFIG.africastalking;
    console.log('🌍 Africa\'s Talking :');
    console.log(`   Username : ${config.username}`);
    console.log(`   API Key : ${config.apiKey.substring(0, 10)}...`);
    console.log(`   Sender ID : ${config.senderId}`);
    console.log(`   Mode : ${config.username === 'sandbox' ? '🧪 TEST' : '🚀 PRODUCTION'}`);
  }

  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('');
}

// Afficher automatiquement les infos au chargement (optionnel)
// Décommentez la ligne ci-dessous pour voir les infos au démarrage
// afficherInfoConfig();
