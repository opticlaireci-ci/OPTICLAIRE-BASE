/**
 * Objectif de chiffre d'affaires d'un magasin pour un mois donné.
 *
 * « Gérer le magasin » enregistre les objectifs MOIS PAR MOIS dans
 * `leclaire_objectifs_<magasin>` : [{ objectif: '5 000 000', mois: 'Novembre',
 * annee: '2026' }, …]. Les tableaux de bord lisaient une autre clé
 * (`leclaire_objectif_<magasin>`, au singulier) que rien n'écrit : l'objectif
 * saisi n'apparaissait jamais (0 partout, pourcentage réalisé à 0 %).
 * L'ancienne clé reste lue en dernier recours.
 */
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

const sansAccents = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** « 5 000 000 », « 5000000 », « 5.000.000 FCFA » → 5000000. */
export function montantObjectif(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const chiffres = String(v ?? '').replace(/[^\d,.-]/g, '');
  // Les points ou espaces de milliers sont retirés ; une virgule finale = décimales.
  const n = Number(chiffres.replace(/[.](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function lireListe(cle: string): any[] {
  try {
    const liste = JSON.parse(localStorage.getItem(cle) || '[]');
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

/** `mois` : 0 = janvier … 11 = décembre. */
export function objectifDuMois(magasinId: string, mois: number, annee: number): number {
  const id = String(magasinId || '').trim();
  if (!id) return 0;
  const variantes = [...new Set([id, id.toLowerCase(), id.toUpperCase()])];
  for (const v of variantes) {
    const trouves = lireListe(`leclaire_objectifs_${v}`)
      .filter(o => sansAccents(o?.mois) === MOIS[mois] && String(o?.annee ?? '').trim() === String(annee));
    // Plusieurs objectifs pour le même mois : le dernier enregistré l'emporte.
    if (trouves.length) return montantObjectif(trouves[trouves.length - 1].objectif);
  }
  for (const v of variantes) {
    const ancien = Number(localStorage.getItem(`leclaire_objectif_${v}`));
    if (Number.isFinite(ancien) && ancien > 0) return ancien;
  }
  return 0;
}
