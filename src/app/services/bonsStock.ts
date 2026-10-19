import { enregistrerRetour, loadStockMagasin } from './inventaireService';

/**
 * Applique un BON DE RETOUR au stock : les montures retournées SORTENT du
 * magasin (et reviennent au stock central). Utilisé par le magasin (« Traiter »)
 * comme par l'administration (« Valider ») : le retour est appliqué une seule
 * fois, quel que soit l'écran qui le valide en premier.
 *
 * Renvoie les articles avec leur identifiant catalogue (les anciens bons n'en
 * avaient pas), pour les conserver dans le bon.
 */
export async function appliquerRetour(bon: {
  id: string; numero: string; magasin: string;
  items: Array<{ id?: string; type?: string; designation: string; quantite: number; prixUnit?: number }>;
}): Promise<{ ok: boolean; items: Array<{ id: string; type: 'monture' | 'accessoire'; designation: string; quantite: number; prixVente: number }> }> {
  const magasin = String(bon.magasin || '').toUpperCase();
  const stockActuel = await loadStockMagasin(magasin);
  const normaliser = (v: unknown) => String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
  const items = (bon.items || []).map(item => {
    const designation = normaliser(item.designation);
    const stock = stockActuel.find(s =>
      (item.id && String(s.produitId) === String(item.id)) ||
      normaliser(s.designation) === designation);
    return {
      id: String(item.id || stock?.produitId || item.designation).trim(),
      type: item.type === 'accessoire' ? 'accessoire' as const : 'monture' as const,
      designation: item.designation,
      quantite: Number(item.quantite) || 0,
      prixVente: Number(item.prixUnit) || stock?.prixVente || 0,
    };
  }).filter(item => item.id && item.quantite > 0);
  if (items.length === 0) return { ok: false, items };
  const ok = await enregistrerRetour({ magasinId: magasin, bonReference: bon.numero, bonId: String(bon.id), items });
  return { ok, items };
}
