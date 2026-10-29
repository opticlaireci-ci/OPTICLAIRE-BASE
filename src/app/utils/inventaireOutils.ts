/**
 * INVENTAIRE (Gestion Stocks → Inventaire) : règles et impressions.
 *
 *  - Un inventaire se modifie (continuer les montures sautées) seulement le
 *    JOUR où il a été fait ; une fois la journée passée, il est clôturé.
 *  - Montures / accessoires non inventoriés = stock du magasin moins les
 *    articles déjà comptés.
 *  - Documents imprimables : montures inventoriées, montures non inventoriées
 *    (avec une colonne vide pour noter le comptage à la main).
 */
import type { StockMagasin } from '../services/stockLedger';

export interface ArticleInventorie {
  codeBarre: string;
  produit: string;
  stockTheorique: number;
  stockPhysique: number;
  marge: number;
  /** Heure du comptage (articles ajoutés après la création de l'inventaire). */
  compteLe?: string;
}

export interface InventaireResume {
  magasin: string;
  dateInventaire: string;
  createdAt?: string;
  items: ArticleInventorie[];
}

/** Jour local (AAAA-MM-JJ) d'une date ISO ou « AAAA-MM-JJ » ; '' si illisible. */
export function jourLocal(valeur: string | Date | undefined): string {
  if (!valeur) return '';
  if (typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * L'inventaire peut-il encore être modifié ? Oui le jour où il a été fait
 * (date de création ; à défaut, date de l'inventaire), non les jours suivants.
 */
export function inventaireModifiable(inv: Pick<InventaireResume, 'createdAt' | 'dateInventaire'>, maintenant: Date = new Date()): boolean {
  const jour = jourLocal(inv.createdAt) || jourLocal(inv.dateInventaire);
  return !!jour && jour >= jourLocal(maintenant);
}

/** Articles du stock du magasin qui ne sont pas (encore) dans l'inventaire. */
export function articlesNonInventories(stock: StockMagasin[], items: Array<Pick<ArticleInventorie, 'codeBarre' | 'produit'>>): StockMagasin[] {
  const comptes = new Set<string>();
  for (const i of items) {
    if (i.codeBarre) comptes.add(i.codeBarre);
    if (i.produit) comptes.add(i.produit);
  }
  return stock.filter(s => !comptes.has(s.produitId) && !comptes.has(s.designation));
}

const echapper = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dateFR = (valeur: string) => {
  const j = jourLocal(valeur);
  return j ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : echapper(valeur);
};

function document(titre: string, sousTitre: string, tableau: string, pied: string): string {
  const edite = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  return `<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #111827; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sous { color: #4b5563; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; }
  td.n, th.n { text-align: center; white-space: nowrap; }
  td.vide { min-width: 90px; }
  tr.total td { font-weight: bold; background: #f9fafb; }
  .pied { margin-top: 10px; color: #6b7280; font-size: 11px; }
</style>
<h1>${echapper(titre)}</h1>
<p class="sous">${sousTitre}</p>
${tableau}
<p class="pied">${pied} — Édité le ${echapper(edite)}</p>`;
}

/** Document : montures / accessoires inventoriés (théorique, physique, écart). */
export function htmlArticlesInventories(inv: InventaireResume, magasinNom: string): string {
  const items = inv.items || [];
  const total = (k: 'stockTheorique' | 'stockPhysique' | 'marge') => items.reduce((s, i) => s + (Number(i[k]) || 0), 0);
  const lignes = items.map((i, n) => `<tr>
    <td class="n">${n + 1}</td><td>${echapper(i.codeBarre || '—')}</td><td>${echapper(i.produit)}</td>
    <td class="n">${Number(i.stockTheorique) || 0}</td><td class="n">${Number(i.stockPhysique) || 0}</td>
    <td class="n">${(Number(i.marge) || 0) > 0 ? '+' : ''}${Number(i.marge) || 0}</td></tr>`).join('');
  const tableau = `<table><thead><tr><th class="n">#</th><th>Code barre</th><th>Monture / accessoire</th>
    <th class="n">Stock théorique</th><th class="n">Stock physique</th><th class="n">Écart</th></tr></thead>
    <tbody>${lignes || '<tr><td colspan="6" class="n">Aucun article inventorié</td></tr>'}
    <tr class="total"><td colspan="3">Total (${items.length} article(s))</td><td class="n">${total('stockTheorique')}</td>
    <td class="n">${total('stockPhysique')}</td><td class="n">${total('marge') > 0 ? '+' : ''}${total('marge')}</td></tr></tbody></table>`;
  return document('Montures inventoriées', `Magasin ${echapper(magasinNom)} — inventaire du ${dateFR(inv.dateInventaire)}`,
    tableau, `${items.length} article(s) inventorié(s)`);
}

/** Document : montures / accessoires non inventoriés, avec une colonne pour noter le comptage. */
export function htmlArticlesNonInventories(inv: InventaireResume, magasinNom: string, manquants: StockMagasin[]): string {
  const lignes = manquants.map((s, n) => `<tr>
    <td class="n">${n + 1}</td><td>${echapper(s.codeBarre || s.produitId)}</td><td>${echapper(s.designation)}</td>
    <td>${s.produitType === 'accessoire' ? 'Accessoire' : 'Monture'}</td>
    <td class="n">${Number(s.quantiteDisponible) || 0}</td><td class="vide"></td></tr>`).join('');
  const tableau = `<table><thead><tr><th class="n">#</th><th>Code barre</th><th>Monture / accessoire</th><th>Type</th>
    <th class="n">Stock théorique</th><th class="n">Stock physique compté</th></tr></thead>
    <tbody>${lignes || '<tr><td colspan="6" class="n">Tous les articles ont été inventoriés</td></tr>'}
    <tr class="total"><td colspan="4">Total (${manquants.length} article(s))</td>
    <td class="n">${manquants.reduce((t, s) => t + (Number(s.quantiteDisponible) || 0), 0)}</td><td></td></tr></tbody></table>`;
  return document('Montures non inventoriées', `Magasin ${echapper(magasinNom)} — inventaire du ${dateFR(inv.dateInventaire)}`,
    tableau, `${manquants.length} article(s) non inventorié(s)`);
}
