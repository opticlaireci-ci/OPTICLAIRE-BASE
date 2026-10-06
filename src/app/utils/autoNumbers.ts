// ── Numérotation automatique séquentielle ────────────────────────────────────

function getNextCounter(key: string): number {
  const current = parseInt(localStorage.getItem(key) || '0', 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return next;
}

function pad(n: number, digits = 4): string {
  return String(n).padStart(digits, '0');
}

/** Numéro de vente flash : VF-0001, VF-0002… */
export function genNumVenteFlash(): string {
  return `VF-${pad(getNextCounter('leclaire_counter_vente_flash'))}`;
}

/** Numéro de facture normalisée : FA-0001, FA-0002… */
export function genNumFacture(): string {
  return `FA-${pad(getNextCounter('leclaire_counter_facture'))}`;
}

/**
 * Numéro de facture / vente flash / reçu / bon de commande verre COMMUN À TOUS
 * LES MAGASINS.
 *
 * Le numéro est attribué par la base (fonction `prochain_numero`, script
 * supabase/NUMEROTATION_FACTURES.sql) au moment de l'ENREGISTREMENT : PALMERAIE
 * fait FA-0001, YOPOUGON enchaîne FA-0002, FA-0003… même depuis des appareils
 * différents et même pour deux ventes simultanées.
 * Repli (script pas encore installé / hors ligne) : ancien compteur local.
 */
const FORMATS_NUMERO = {
  facture:            { prefixe: 'FA-', chiffres: 4, cleLocale: 'leclaire_counter_facture' },
  vente_flash:        { prefixe: 'VF-', chiffres: 4, cleLocale: 'leclaire_counter_vente_flash' },
  recu:               { prefixe: '',    chiffres: 5, cleLocale: 'leclaire_counter_recu' },
  bon_commande_verre: { prefixe: '',    chiffres: 5, cleLocale: 'leclaire_counter_bcv' },
} as const;
export type TypeNumero = keyof typeof FORMATS_NUMERO;

export async function attribuerNumero(type: TypeNumero): Promise<string> {
  const { prefixe, chiffres, cleLocale } = FORMATS_NUMERO[type];
  try {
    const { supabase } = await import('./supabaseClient');
    const { data, error } = await supabase.rpc('prochain_numero', { p_nom: type });
    const n = Number(data);
    if (!error && Number.isFinite(n) && n > 0) {
      // Garde le compteur local aligné (utile si la base devient injoignable).
      try {
        if (n > parseInt(localStorage.getItem(cleLocale) || '0', 10)) localStorage.setItem(cleLocale, String(n));
      } catch { /* ignore */ }
      return `${prefixe}${pad(n, chiffres)}`;
    }
    console.warn('Numérotation commune indisponible (exécutez NUMEROTATION_FACTURES.sql) :', error?.message);
  } catch (err) {
    console.warn('Numérotation commune indisponible :', err);
  }
  return `${prefixe}${pad(getNextCounter(cleLocale), chiffres)}`;
}

/** Numéro de devis/proforma : DV-0001, DV-0002… */
export function genNumDevis(): string {
  return `DV-${pad(getNextCounter('leclaire_counter_devis'))}`;
}

/** Référence de bon de commande de verre : 00296, 00297… (5 chiffres) */
export function genRefBonCommandeVerre(): string {
  return pad(getNextCounter('leclaire_counter_bcv'), 5);
}

/** Numéro de reçu (versement/règlement) : 01325, 01326… (5 chiffres) */
export function genNumRecu(): string {
  return pad(getNextCounter('leclaire_counter_recu'), 5);
}

// ── Réinitialisation des compteurs ───────────────────────────────────────────

/** Toutes les clés de compteurs séquentiels de l'application. */
export const COUNTER_KEYS = [
  'leclaire_counter_facture',
  'leclaire_counter_devis',
  'leclaire_counter_vente_flash',
] as const;

/**
 * Remet TOUS les compteurs à zéro (la prochaine facture/devis/vente flash
 * repartira à 0001). La remise à zéro est propagée au cloud pour que tous les
 * appareils repartent du même point.
 */
export async function resetAllCounters(): Promise<void> {
  const { saveToSupabase } = await import('../services/supabaseRealtime');
  for (const key of COUNTER_KEYS) {
    localStorage.setItem(key, '0');
    try { await saveToSupabase(key, 0); } catch { /* le cache local reste à 0 */ }
    window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key } }));
  }
}

// ── Code-barres aléatoire ────────────────────────────────────────────────────

/** Code-barres 13 chiffres (format EAN-13 simplifié) */
export function genCodeBarre(): string {
  const base = String(Math.floor(1000000000000 + Math.random() * 9000000000000));
  return base.slice(0, 13);
}

/** Code court 8 chiffres pour montures/accessoires */
export function genCodeCourt(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}
