/**
 * Génère un identifiant unique compatible TOUS navigateurs.
 *
 * `crypto.randomUUID()` n'existe que sur Safari 15.4+ et Firefox 95+. Sur un
 * iPhone un peu ancien ou un Firefox pas à jour, l'appeler lève une erreur qui
 * fait échouer l'enregistrement AVANT l'envoi vers Firebase (alors que
 * Chrome/Opera/Android fonctionnent). Cette fonction utilise randomUUID quand il
 * existe, sinon un repli RFC4122 v4 basé sur getRandomValues, sinon Math.random.
 */
export function safeUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch {
    /* certains navigateurs exposent randomUUID mais lèvent hors contexte sécurisé */
  }

  // Repli : UUID v4 via getRandomValues si disponible
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    }
  } catch {
    /* on tombe sur le dernier repli */
  }

  // Dernier repli : Math.random (suffisant pour un identifiant local unique)
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
