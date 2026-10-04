/**
 * ÉVÉNEMENTS REGROUPÉS
 *
 * Chaque écriture dans un cache local (ventes, clients…) émettait
 * immédiatement un événement ('ventes-updated', 'clients-updated'…) qui fait
 * RECHARGER depuis Supabase toutes les pages ouvertes. Pendant un import de
 * plusieurs anciens dossiers, cela déclenchait des dizaines de rechargements
 * complets en rafale (lenteur + pics de connexions Supabase).
 *
 * `emettreGroupe` regroupe ces événements : au plus UN par nom + magasin et par
 * fenêtre de `delaiMs`, émis avec le dernier détail reçu.
 */
const enAttente = new Map<string, { timer: ReturnType<typeof setTimeout>; detail: any }>();

export function emettreGroupe(nom: string, detail: any, cle = '', delaiMs = 800): void {
  if (typeof window === 'undefined') return;
  const k = `${nom}|${cle}`;
  const existant = enAttente.get(k);
  if (existant) {
    existant.detail = detail;
    return;
  }
  const entree = {
    detail,
    timer: setTimeout(() => {
      enAttente.delete(k);
      try { window.dispatchEvent(new CustomEvent(nom, { detail: entree.detail })); } catch { /* isolé */ }
    }, delaiMs),
  };
  enAttente.set(k, entree);
}
