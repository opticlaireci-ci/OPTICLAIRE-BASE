/**
 * Numéros ajoutés/importés dans le Call Center qui ne doivent recevoir aucun SMS.
 * Stockage local léger : les numéros sont synchronisés dès que le Call Center
 * charge ou ajoute ses contacts.
 */
export const CALL_CENTER_SMS_EXCLUSION_KEY = 'leclaire_callcenter_sms_exclusions';

export function normaliserNumeroCallCenter(telephone?: string): string {
  const raw = String(telephone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('225') && digits.length >= 12) return digits.slice(3);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(1);
  return digits;
}

export function ajouterNumerosCallCenterAuxExclusions(extras: Array<{ telephone?: string }>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const actuels = JSON.parse(localStorage.getItem(CALL_CENTER_SMS_EXCLUSION_KEY) || '[]');
    const set = new Set<string>(Array.isArray(actuels) ? actuels.map(String) : []);
    for (const extra of extras) {
      const tel = normaliserNumeroCallCenter(extra.telephone);
      if (tel) set.add(tel);
    }
    localStorage.setItem(CALL_CENTER_SMS_EXCLUSION_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function numeroAjouteAuCallCenter(telephone?: string): boolean {
  const tel = normaliserNumeroCallCenter(telephone);
  if (!tel || typeof localStorage === 'undefined') return false;
  try {
    const exclusions = JSON.parse(localStorage.getItem(CALL_CENTER_SMS_EXCLUSION_KEY) || '[]');
    return Array.isArray(exclusions) && exclusions.some(
      (x: unknown) => normaliserNumeroCallCenter(String(x)) === tel,
    );
  } catch {
    return false;
  }
}
