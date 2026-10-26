/**
 * CALCUL DU STOCK RÉEL DE CHAQUE MAGASIN (fonctions pures, sans accès réseau).
 *
 * Le stock d'un magasin n'est jamais saisi à la main : il est rejoué, dans
 * l'ordre chronologique, à partir des mouvements (`mouvements_stock`) :
 *
 *   distribution      : + au magasin qui reçoit
 *   transfert         : − au magasin qui envoie, + au magasin qui reçoit
 *   vente             : − au magasin qui vend
 *   annulation_vente  : + (facture supprimée : ce que la vente avait retiré revient)
 *   retour            : − au magasin qui retourne
 *   inventaire        : le stock de l'article DEVIENT le stock physique compté
 *
 * Règles qui rendent le résultat fiable, quelles que soient les anciennes données :
 *
 *  1. UNE SEULE CLÉ PAR ARTICLE : chaque mouvement est rattaché à l'identifiant
 *     du catalogue (par son id, son code-barre ou l'une de ses désignations :
 *     « MARQUE - RÉF COULEUR TAILLE » des bons, « MARQUE - RÉF » des ventes…).
 *     Avant, une vente et une distribution du même article tombaient parfois
 *     sur deux lignes différentes : la vente ne diminuait pas le stock.
 *  2. UN BON = SON IDENTIFIANT : deux bons portant le même numéro (« 00001 »
 *     par défaut) sont deux bons distincts ; le second n'est plus ignoré.
 *  3. BONS VALIDÉS SANS MOUVEMENT (coupure réseau, ancienne version, retour
 *     validé par l'administration) : ils sont pris en compte quand même.
 *  4. JAMAIS DE STOCK NÉGATIF REPORTÉ : une sortie sans stock (vente d'un
 *     article d'avant l'application) ne « mange » plus les entrées suivantes.
 *  5. MÊME MODÈLE, AUTRE VARIANTE : une sortie enregistrée sur une variante
 *     (couleur, taille) absente du magasin est prise sur une variante du même
 *     modèle présente en stock — c'est le modèle réellement vendu.
 *  6. INVENTAIRE : l'article prend la quantité physique comptée, à la date du
 *     comptage ; les mouvements suivants s'appliquent ensuite normalement.
 */

export interface StockMagasin {
  magasinId: string;
  produitId: string;
  produitType: 'monture' | 'accessoire';
  designation: string;
  quantiteDisponible: number;
  prixVente: number;
  derniereMiseAJour: string;
  /** Code-barre du catalogue (s'il existe). */
  codeBarre?: string;
}

export interface MouvementBrut { id: string; data: any }

/** Texte comparable : majuscules, sans accents, espaces réduits. */
export const normaliser = (v: unknown) => String(v ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toUpperCase().replace(/\s+/g, ' ');

/** Normalise les anciens libellés de magasin (« LECLAIRE ABOBO ») vers l'identifiant. */
export function normaliserMagasin(value: unknown): string {
  return normaliserMagasinParDefaut(value);
}
function normaliserMagasinParDefaut(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
    .replace(/^LECLAIRE\s+/, '').replace(/\s+MAGASIN$/, '');
}

/**
 * Clé de comparaison d'un magasin : lettres et chiffres seulement, sans accents
 * ni « LECLAIRE » devant. « YOPOUGON GANDI », « yopougon-gandi » et
 * « Leclaire Yopougon-Gandi » donnent la même clé ; « BOUAKÉ » et « bouake » aussi.
 */
export const cleMagasin = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '')
  .replace(/^LECLAIRE/, '').replace(/MAGASIN$/, '');

/**
 * Ramène TOUTE écriture d'un magasin à son identifiant configuré, en majuscules :
 * identifiant (« yopougon-gandi »), libellé (« YOPOUGON GANDI », « BOUAKÉ »),
 * ancien identifiant renommé (« cocody » → BOUAKE), « LECLAIRE X »…
 * Avant, seules la casse et le préfixe « LECLAIRE » étaient tolérés : un bon ou
 * une vente rangé sous le libellé, ou sous un ancien nom, était compté pour un
 * AUTRE magasin, et le stock paraissait vide à la vente.
 * Un magasin inconnu garde l'ancienne normalisation (aucune donnée perdue).
 */
export function creerNormaliseurMagasins(
  magasins: Array<{ id: string; label?: string }>,
  anciens: Record<string, string> = {},
): (value: unknown) => string {
  const parCle = new Map<string, string>();
  // Les identifiants d'abord : un libellé ne prend jamais la place d'un identifiant.
  for (const champ of ['id', 'label'] as const) {
    for (const m of magasins || []) {
      const id = String(m?.id ?? '').trim().toUpperCase();
      const k = cleMagasin(m?.[champ]);
      if (id && k && !parCle.has(k)) parCle.set(k, id);
    }
  }
  for (const [ancien, nouveau] of Object.entries(anciens || {})) {
    const k = cleMagasin(ancien);
    const id = String(nouveau ?? '').trim().toUpperCase();
    if (k && id) parCle.set(k, id);
  }
  return (value: unknown) => {
    const k = cleMagasin(value);
    if (!k) return '';
    return parCle.get(k) ?? normaliserMagasin(value);
  };
}

// ── Catalogue ────────────────────────────────────────────────────────────────

interface ProduitCatalogue {
  id: string;
  type: 'monture' | 'accessoire';
  designation: string;
  prix: number;
  /** Modèle (marque + référence) : les variantes d'un même modèle le partagent. */
  modele: string;
  codeBarre: string;
}

export interface IndexCatalogue {
  parId: Map<string, ProduitCatalogue>;
  /** Désignation normalisée → identifiant (absent si plusieurs articles la partagent). */
  parLibelle: Map<string, string | null>;
  /** Modèle (« MARQUE - RÉF ») → identifiants de ses variantes. */
  parModele: Map<string, string[]>;
}

/** Préfixe du stock rangé au niveau du MODÈLE (ancien bon sans couleur ni taille). */
export const PREFIXE_MODELE = 'MODELE:';
export const cleModele = (marque: unknown, reference: unknown) => normaliser(`${marque ?? ''} - ${reference ?? ''}`);

/** Désignation d'une monture telle qu'écrite par les bons (marque - réf couleur taille). */
export const designationMonture = (m: any) =>
  `${m?.marque ?? ''} - ${m?.reference ?? ''} ${m?.couleur ?? ''} ${m?.taille ?? ''}`.replace(/\s+/g, ' ').trim();
export const designationAccessoire = (a: any) =>
  `${a?.marque ?? ''} - ${a?.designation ?? ''}`.replace(/\s+/g, ' ').trim();

export function indexerCatalogue(montures: any[] = [], accessoires: any[] = []): IndexCatalogue {
  const parId = new Map<string, ProduitCatalogue>();
  const parLibelle = new Map<string, string | null>();
  const parModele = new Map<string, string[]>();
  const ajouterLibelle = (libelle: unknown, id: string) => {
    const k = normaliser(libelle);
    if (!k || k === '-') return;
    const actuel = parLibelle.get(k);
    if (actuel === undefined) parLibelle.set(k, id);
    else if (actuel !== id) parLibelle.set(k, null); // partagé : ambigu
  };
  for (const m of montures || []) {
    if (m?.id === undefined || m?.id === null) continue;
    const id = String(m.id).trim();
    const modele = cleModele(m.marque, m.reference);
    parId.set(id, { id, type: 'monture', designation: designationMonture(m), prix: Number(m.prix) || 0, modele, codeBarre: String(m.codeBarre ?? '').trim() });
    parModele.set(modele, [...(parModele.get(modele) || []), id]);
    ajouterLibelle(designationMonture(m), id);
    ajouterLibelle(`${m.marque ?? ''} - ${m.reference ?? ''}`, id);
    ajouterLibelle(`${m.marque ?? ''} ${m.reference ?? ''}`, id);
    ajouterLibelle(m.codeBarre, id);
  }
  for (const a of accessoires || []) {
    if (a?.id === undefined || a?.id === null) continue;
    const id = String(a.id).trim();
    const modele = normaliser(designationAccessoire(a));
    parId.set(id, { id, type: 'accessoire', designation: designationAccessoire(a), prix: Number(a.prix) || 0, modele, codeBarre: String(a.codeBarre ?? '').trim() });
    ajouterLibelle(designationAccessoire(a), id);
    ajouterLibelle(a.designation, id);
    if (a.reference) ajouterLibelle(`${a.marque ?? ''} - ${a.reference}`, id);
    ajouterLibelle(a.codeBarre, id);
  }
  // Un identifiant catalogue n'est jamais un libellé ambigu.
  for (const id of parId.keys()) parLibelle.set(normaliser(id), id);
  return { parId, parLibelle, parModele };
}

/**
 * Résolveur d'articles : identifiant catalogue si possible, sinon désignation
 * rattachée à un identifiant vu dans un autre mouvement, sinon la désignation.
 */
export function resolveurArticles(index: IndexCatalogue, mouvements: Array<{ data: any }>) {
  const alias = new Map<string, string>();
  for (const { data: r } of mouvements) {
    if (!r?.article_id || !r?.designation) continue;
    const id = String(r.article_id).trim();
    const des = normaliser(r.designation);
    if (normaliser(id) !== des && !alias.has(des)) alias.set(des, id);
  }
  const parLibelle = (v: unknown) => {
    const id = index.parLibelle.get(normaliser(v));
    return id || null;
  };
  return (r: any): string => {
    const brut = String(r?.article_id ?? '').trim();
    const des = String(r?.designation ?? '').trim();
    if (brut && index.parId.has(brut)) return brut;
    const viaCatalogue = parLibelle(brut) || parLibelle(des);
    if (viaCatalogue) return viaCatalogue;
    // « MARQUE - RÉF » sans couleur ni taille, pour un modèle à plusieurs
    // variantes : stock du MODÈLE, dans lequel puisent ses variantes.
    for (const v of [des, brut]) {
      const k = normaliser(v);
      if ((index.parModele.get(k) || []).length > 1) return PREFIXE_MODELE + k;
    }
    const viaAlias = alias.get(normaliser(des || brut)) || (brut ? alias.get(normaliser(brut)) : undefined);
    if (viaAlias) return index.parId.has(viaAlias) ? viaAlias : (parLibelle(viaAlias) || viaAlias);
    return brut || des;
  };
}

// ── Bons validés ─────────────────────────────────────────────────────────────

const STATUTS_ACCEPTES = new Set([
  'VALIDE', 'VALIDEE', 'ACCEPTE', 'ACCEPTEE', 'RECU', 'TERMINE', 'TRAITE', 'TRAITEE',
]);
export const bonAccepte = (statut: unknown) => STATUTS_ACCEPTES.has(normaliser(statut));

// ── Calcul ───────────────────────────────────────────────────────────────────

interface Mouvement {
  type: string;
  article: string;
  designation: string;
  produitType: 'monture' | 'accessoire';
  quantite: number;
  /** Inventaire : quantité physique comptée. */
  physique: number;
  source: string;
  destination: string;
  magasin: string;
  bon: string;
  date: string;
  prix: number;
  ordre: number;
}

/**
 * Date comparable (ISO). Une date sans heure (« 2026-10-19 », « 19/10/2026 »)
 * prend l'heure d'enregistrement du même jour si on la connaît, sinon midi :
 * une vente du jour d'un inventaire n'est pas placée avant le comptage.
 */
export function dateTri(valeur: unknown, enregistrement?: unknown): string {
  let v = String(valeur ?? '').trim();
  const fr = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) v = `${fr[3]}-${fr[2]}-${fr[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const e = String(enregistrement ?? '').trim();
    return e.startsWith(v) ? e : `${v}T12:00:00.000Z`;
  }
  return v || String(enregistrement ?? '');
}

/** Ordre d'application à date égale : inventaire, puis entrées, puis sorties. */
const RANG: Record<string, number> = { inventaire: 0, distribution: 1, transfert: 2, annulation_vente: 1, vente: 3, retour: 3 };

/**
 * Stock de chaque magasin demandé, à partir des mouvements, des bons et du
 * catalogue. `bons` : lignes de la table `bons` (type, statut, items…).
 */
export function calculerStocks(
  mouvementsBruts: MouvementBrut[],
  bons: any[],
  catalogue: { montures?: any[]; accessoires?: any[] },
  magasins: string[],
  options: { magasin?: (value: unknown) => string } = {},
): Record<string, StockMagasin[]> {
  const normaliserMagasin = options.magasin ?? normaliserMagasinParDefaut;
  const index = indexerCatalogue(catalogue.montures, catalogue.accessoires);
  const cle = resolveurArticles(index, mouvementsBruts);
  const modeleDe = (article: string) =>
    article.startsWith(PREFIXE_MODELE) ? article.slice(PREFIXE_MODELE.length) : index.parId.get(article)?.modele;
  const voulus = new Set(magasins.map(normaliserMagasin).filter(Boolean));

  // 1. Mouvements enregistrés (un mouvement logique compté une seule fois).
  const mouvements: Mouvement[] = [];
  const vus = new Set<string>();
  // Mouvements « à l'ancienne » (sans identifiant de bon), utilisables par UN bon.
  const anciens = new Map<string, number>();
  const parBonUid = new Set<string>();
  let ordre = 0;
  for (const { id, data: r } of mouvementsBruts) {
    if (!r || r.annule) continue;
    const type = String(r.type || '').toLowerCase();
    if (!RANG.hasOwnProperty(type)) continue;
    const article = cle(r);
    if (!article) continue;
    const source = normaliserMagasin(r.magasin_source);
    const destination = normaliserMagasin(r.magasin_destination);
    const magasin = normaliserMagasin(r.magasin_id) || destination || source;
    const bonUid = String(r.bon_uid || '').trim();
    const bonRef = String(r.bon_id || r.reference || id || '').trim();
    const logique = `${type}|${bonUid ? `uid:${bonUid}` : `ref:${normaliser(bonRef)}`}|${normaliser(article)}|${type === 'inventaire' ? magasin : `${source}>${destination}`}`;
    if (vus.has(logique)) continue;
    vus.add(logique);
    if (bonUid) parBonUid.add(`${type}|${bonUid}|${normaliser(article)}`);
    else {
      const k = `${type}|${normaliser(bonRef)}|${normaliser(article)}|${source}>${destination}`;
      anciens.set(k, (anciens.get(k) || 0) + 1);
    }
    const produit = index.parId.get(article);
    mouvements.push({
      type, article,
      designation: produit?.designation || String(r.designation || r.article_id || article),
      produitType: produit?.type || (r.produit_type === 'accessoire' ? 'accessoire' : 'monture'),
      quantite: Math.max(0, Number(r.quantite) || 0),
      physique: Math.max(0, Number(r.stock_physique ?? r.physique) || 0),
      source, destination, magasin,
      bon: bonUid || bonRef,
      date: dateTri(r.date_mouvement, r.created_at),
      prix: Number(r.prix_vente) || 0,
      ordre: ordre++,
    });
  }

  // 2. Bons validés dont le mouvement manque : pris en compte quand même.
  const dateBon = (b: any) => dateTri(b?.data?.dateValidation || b?.date, b?.created_at);
  const bonsTries = [...(bons || [])].sort((a, b) => dateBon(a).localeCompare(dateBon(b)));
  for (const b of bonsTries) {
    const type = normaliser(b?.type).toLowerCase();
    if (!['distribution', 'transfert', 'retour'].includes(type) || !bonAccepte(b?.statut)) continue;
    const source = type === 'distribution' ? '' : normaliserMagasin(b.magasin_source);
    const destination = type === 'retour' ? '' : normaliserMagasin(b.magasin_destination);
    if (!voulus.has(source) && !voulus.has(destination)) continue;
    // Quantités par article (un même article sur deux lignes : additionnées).
    const lignes = new Map<string, { quantite: number; item: any }>();
    for (const item of Array.isArray(b.items) ? b.items : []) {
      const article = cle({ article_id: item?.id || item?.article_id || item?.produitId || item?.designation, designation: item?.designation });
      if (!article) continue;
      const l = lignes.get(article) || { quantite: 0, item };
      l.quantite += Number(item?.quantite) || 0;
      lignes.set(article, l);
    }
    for (const [article, { quantite, item }] of lignes) {
      if (quantite <= 0) continue;
      if (parBonUid.has(`${type}|${String(b.id)}|${normaliser(article)}`)) continue;
      const k = `${type}|${normaliser(b.numero || b.id)}|${normaliser(article)}|${source}>${destination}`;
      const reste = anciens.get(k) || 0;
      if (reste > 0) { anciens.set(k, reste - 1); continue; }
      const produit = index.parId.get(article);
      mouvements.push({
        type, article,
        designation: produit?.designation || String(item?.designation || article),
        produitType: produit?.type || (item?.type === 'accessoire' ? 'accessoire' : 'monture'),
        quantite, physique: 0, source, destination, magasin: destination || source,
        bon: String(b.id), date: dateBon(b),
        prix: Number(item?.prixUnit ?? item?.prixVente) || 0, ordre: ordre++,
      });
    }
  }

  // 3. Rejeu chronologique, magasin par magasin.
  mouvements.sort((a, b) => a.date.localeCompare(b.date) || (RANG[a.type] - RANG[b.type]) || (a.ordre - b.ordre));
  const resultat: Record<string, StockMagasin[]> = {};
  for (const magasin of voulus) {
    const solde = new Map<string, number>();
    const infos = new Map<string, { designation: string; produitType: 'monture' | 'accessoire'; prix: number; date: string }>();
    // Ce que chaque vente a réellement retiré (pour la remettre si la facture est supprimée).
    const retiresParVente = new Map<string, Array<[string, number]>>();
    const noter = (m: Mouvement) => {
      const i = infos.get(m.article);
      infos.set(m.article, {
        designation: i?.designation && index.parId.has(m.article) ? i.designation : m.designation,
        produitType: m.produitType,
        prix: m.prix || i?.prix || index.parId.get(m.article)?.prix || 0,
        date: m.date > (i?.date || '') ? m.date : (i?.date || ''),
      });
    };
    const ajouter = (article: string, q: number) => solde.set(article, (solde.get(article) || 0) + q);
    /** Sortie : jamais en dessous de zéro ; prise sur une variante du même modèle si besoin. */
    const retirer = (article: string, q: number): Array<[string, number]> => {
      const pris: Array<[string, number]> = [];
      let reste = q;
      const dispo = Math.min(reste, Math.max(0, solde.get(article) || 0));
      if (dispo > 0) { solde.set(article, (solde.get(article) || 0) - dispo); pris.push([article, dispo]); reste -= dispo; }
      const modele = modeleDe(article);
      if (reste > 0 && modele) {
        const variantes = [...solde.entries()]
          .filter(([a, s]) => a !== article && s > 0 && modeleDe(a) === modele)
          .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
        for (const [a, s] of variantes) {
          if (reste <= 0) break;
          const n = Math.min(reste, s);
          solde.set(a, s - n); pris.push([a, n]); reste -= n;
        }
      }
      return pris; // le reste (sortie sans stock connu) est ignoré
    };
    for (const m of mouvements) {
      const entre = m.destination === magasin && ['distribution', 'transfert', 'annulation_vente'].includes(m.type);
      const sort = m.source === magasin && ['vente', 'retour', 'transfert'].includes(m.type);
      const inventaire = m.type === 'inventaire' && m.magasin === magasin;
      if (!entre && !sort && !inventaire) continue;
      noter(m);
      if (inventaire) { solde.set(m.article, m.physique); continue; }
      if (sort) {
        const pris = retirer(m.article, m.quantite);
        if (m.type === 'vente') retiresParVente.set(`${normaliser(m.bon)}|${normaliser(m.article)}`, pris);
      }
      if (entre) {
        if (m.type === 'annulation_vente') {
          // On remet exactement ce que la vente avait retiré (rien de plus).
          const k = `${normaliser(m.bon)}|${normaliser(m.article)}`;
          for (const [a, n] of retiresParVente.get(k) || []) ajouter(a, n);
          retiresParVente.delete(k);
        } else ajouter(m.article, m.quantite);
      }
    }
    resultat[magasin] = [...solde.entries()]
      .filter(([, q]) => q > 0)
      .map(([article, q]) => {
        const i = infos.get(article);
        const produit = index.parId.get(article);
        return {
          magasinId: magasin,
          produitId: article,
          produitType: produit?.type || i?.produitType || 'monture',
          designation: produit?.designation || i?.designation || article,
          quantiteDisponible: q,
          prixVente: produit?.prix || i?.prix || 0,
          derniereMiseAJour: i?.date || '',
          ...(produit?.codeBarre ? { codeBarre: produit.codeBarre } : {}),
        };
      })
      .sort((a, b) => a.designation.localeCompare(b.designation, 'fr'));
  }
  return resultat;
}
