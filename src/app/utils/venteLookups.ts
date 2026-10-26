/**
 * Hooks et helpers de lookup pour les formulaires de vente/devis.
 * - Types de verre, verres enregistrés, montures, comptes banque
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { loadStockMagasin, readStockCache, type StockMagasin } from '../services/inventaireService';
import { PREFIXE_MODELE, cleModele, normaliser, designationMonture, designationAccessoire } from '../services/stockLedger';
import { setVisibleInterval, PAGE_POLL_MS } from './visibleInterval';

// ── Hook générique localStorage ──────────────────────────────────────────────
function useLS<T>(key: string): T[] {
  const [items, setItems] = useState<T[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    const read = () => {
      try { setItems(JSON.parse(localStorage.getItem(key) || '[]')); } catch { setItems([]); }
    };
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (!d?.key || d.key === key) read(); };
    window.addEventListener('leclaire-sync-update', h);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener('leclaire-sync-update', h); window.removeEventListener('storage', read); };
  }, [key]);
  return items;
}

// ── Types de verre (enregistrés via bouton T) ────────────────────────────────
export function useTypesVerre(): string[] {
  const items = useLS<any>('leclaire_db_types-verre');
  return items.map(x => x.typeVerre || x.nom || '').filter(Boolean).sort();
}

// ── Verres enregistrés ───────────────────────────────────────────────────────
export interface VerreRecord {
  id: string;
  typeVerre: string;
  verre: string;
  traitement: string;
  matiere: string;
  diametre: string;
  prixVerre: number;
  garantie: string;
  fournisseur: string;
}

export function useVerresList(): VerreRecord[] {
  return useLS<VerreRecord>('leclaire_global_verres');
}

/** Cherche un verre par son nom exact (insensible à la casse) */
export function findVerreByName(verres: VerreRecord[], nom: string): VerreRecord | null {
  if (!nom?.trim()) return null;
  return verres.find(v => v.verre?.toLowerCase() === nom.trim().toLowerCase()) ?? null;
}

/**
 * Suggestions pour le champ libre « Traitement » du bloc Verre (prescription).
 * Combine le catalogue dédié (Gestion des Traitements) ET les traitements déjà
 * utilisés sur des verres enregistrés, pour que TOUT traitement connu de
 * l'enseigne apparaisse — même s'il n'a été saisi que via un verre et jamais
 * ajouté séparément au catalogue.
 */
export function useTraitementOptions(): string[] {
  const traitements = useTraitements();
  const verres = useVerresList();
  return useMemo(() => {
    const noms = new Set<string>();
    for (const t of traitements) if (t.designation) noms.add(t.designation.trim());
    for (const v of verres) if (v.traitement) noms.add(v.traitement.trim());
    return [...noms].filter(Boolean).sort();
  }, [traitements, verres]);
}

// ── Montures enregistrées ────────────────────────────────────────────────────
export interface MontureRecord {
  id: string;
  codeBarre: string;
  marque: string;
  categorie: string;
  famille: string;
  reference: string;
  couleur: string;
  taille: string;
  prix: number;
  stock: number;
  fournisseur?: string;
  garantie?: string;
}

export function useMontures(): MontureRecord[] {
  return useLS<MontureRecord>('leclaire_global_montures');
}

/** Cherche une monture par référence, désignation ou code barre */
export function findMonture(montures: MontureRecord[], query: string): MontureRecord | null {
  if (!query?.trim()) return null;
  const q = query.trim().toLowerCase();
  return (
    montures.find(m => m.reference?.toLowerCase() === q) ??
    montures.find(m => m.codeBarre?.toLowerCase() === q) ??
    montures.find(m => `${m.marque} ${m.reference}`.toLowerCase() === q) ??
    montures.find(m => `${m.marque} - ${m.reference}`.toLowerCase() === q) ??
    montures.find(m => m.reference?.toLowerCase().includes(q) && q.length >= 3) ??
    null
  );
}

/** Retourne toutes les désignations de montures pour la datalist */
export function getMontureOptions(montures: MontureRecord[]): string[] {
  const opts: string[] = [];
  for (const m of montures) {
    if (m.reference) opts.push(m.reference);
    if (m.marque && m.reference) opts.push(`${m.marque} - ${m.reference}`);
    if (m.codeBarre) opts.push(m.codeBarre);
  }
  return [...new Set(opts)].filter(Boolean);
}

/** Génère le label d'affichage d'une monture */
export function getMontureLabel(m: MontureRecord): string {
  return m.marque ? `${m.marque} - ${m.reference}` : m.reference;
}

// ── Accessoires enregistrés ──────────────────────────────────────────────────
export interface AccessoireRecord {
  id: string;
  codeBarre?: string;
  designation?: string;
  marque?: string;
  reference?: string;
  categorie?: string;
  prix: number;
  stock?: number;
}

export function useAccessoires(): AccessoireRecord[] {
  return useLS<AccessoireRecord>('leclaire_global_accessoires');
}

// ── Services enregistrés ─────────────────────────────────────────────────────
export interface ServiceRecord {
  id: string;
  codeBarre?: string;
  designation?: string;
  service?: string;
  nom?: string;
  prix: number;
}

export function useServices(): ServiceRecord[] {
  return useLS<ServiceRecord>('leclaire_global_services');
}

// ── Traitements enregistrés (catalogue « Gestion des Traitements ») ─────────
// Jusqu'ici, ce catalogue (leclaire_global_traitements, géré depuis
// TraitementPage) n'était PAS repris dans useVenteProducts : un traitement
// créé là-bas n'apparaissait donc jamais dans la liste « Monture | Accessoire
// | Traitement | Service » de la Vente/Devis, alors que l'en-tête du tableau
// l'annonce. On l'ajoute au même titre que montures/accessoires/services.
export interface TraitementRecord {
  id: string;
  designation: string;
  prix: number;
}

export function useTraitements(): TraitementRecord[] {
  return useLS<TraitementRecord>('leclaire_global_traitements');
}

// ── Stock RÉEL d'un magasin (mouvements Firestore) ───────────────────────────
/** Texte comparable d'une désignation : sans accents, majuscules, espaces réduits. */
const cleTexte = (v: unknown) => normaliser(v);

/**
 * Indexe des lignes de stock par produitId, par désignation (minuscules, et sans
 * accents ni espaces doublés) et par code-barre.
 * Exporté pour `stockVente.ts`, qui applique EXACTEMENT la même indexation aux
 * autres magasins : les deux vues doivent s'accorder sur les mêmes clés, sinon
 * un article compté ici serait introuvable là-bas.
 */
export function rowsToStockMap(rows: StockMagasin[]): Map<string, number> {
  const m = new Map<string, number>();
  const ajouter = (k: string, q: number) => { if (k) m.set(k, (m.get(k) || 0) + q); };
  for (const r of rows) {
    ajouter(r.produitId, r.quantiteDisponible);
    const cles = new Set<string>();
    if (r.designation) {
      cles.add(r.designation.toLowerCase().trim());
      cles.add(cleTexte(r.designation));
    }
    if (r.codeBarre) cles.add(r.codeBarre.toLowerCase().trim());
    cles.delete(r.produitId);
    for (const k of cles) ajouter(k, r.quantiteDisponible);
  }
  return m;
}

/**
 * Lignes du stock réel du magasin : affichage immédiat depuis le dernier stock
 * connu, puis recalcul depuis la base, rafraîchi automatiquement.
 */
export function useStockLignesMagasin(magasinId: string): StockMagasin[] {
  const [lignes, setLignes] = useState<StockMagasin[]>(() => readStockCache(magasinId));
  useEffect(() => {
    if (!magasinId) { setLignes([]); return; }
    let cancelled = false;
    // Re-seed cache immédiat (changement de magasin).
    setLignes(readStockCache(magasinId));
    const load = async () => {
      try {
        const rows = await loadStockMagasin(magasinId);
        if (!cancelled) setLignes(rows);
      } catch { /* on garde le cache */ }
    };
    load();
    // Rafraîchissement AUTOMATIQUE : périodique + événements.
    const stopPolling = setVisibleInterval(load, PAGE_POLL_MS);
    const onStockUpdated = () => { if (!cancelled) setLignes(readStockCache(magasinId)); };
    window.addEventListener('leclaire-sync-update', load);
    window.addEventListener('storage', load);
    window.addEventListener('leclaire-stock-updated', onStockUpdated);
    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener('leclaire-sync-update', load);
      window.removeEventListener('storage', load);
      window.removeEventListener('leclaire-stock-updated', onStockUpdated);
    };
  }, [magasinId]);
  return lignes;
}

export function useStockMagasin(magasinId: string): Map<string, number> {
  const lignes = useStockLignesMagasin(magasinId);
  return useMemo(() => rowsToStockMap(lignes), [lignes]);
}

// ── Index unifié des produits vendables (avec stock réel du magasin) ──────────
export interface VenteProduct {
  produitId: string;
  type: 'monture' | 'accessoire' | 'verre' | 'service' | 'traitement';
  label: string;
  codeBarre: string;
  prix: number;
  /** Quantité réelle en magasin, ou null si non gérée en stock (verre/service/traitement). */
  stock: number | null;
  /** Monture / accessoire : libellé avec couleur et taille (distingue les variantes). */
  labelComplet?: string;
  /** Monture : clé du stock rangé au niveau du MODÈLE (anciens bons sans couleur ni taille). */
  cleStockModele?: string;
}

/** Catalogues du poste utilisés pour la vente (montures, accessoires, verres…). */
export interface CatalogueVente {
  montures: MontureRecord[];
  accessoires: AccessoireRecord[];
  verres: VerreRecord[];
  services: ServiceRecord[];
  traitements: TraitementRecord[];
}

/** Lecture directe des catalogues du poste (contrôle final d'une vente). */
export function lireCatalogueVenteLocal(): CatalogueVente {
  const lire = (key: string) => {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  return {
    montures: lire('leclaire_global_montures'),
    accessoires: lire('leclaire_global_accessoires'),
    verres: lire('leclaire_global_verres'),
    services: lire('leclaire_global_services'),
    traitements: lire('leclaire_global_traitements'),
  };
}

/**
 * Produits vendables du magasin.
 *
 * Le STOCK RÉEL fait foi : chaque ligne de stock du magasin est proposée à la
 * vente, une seule fois. Une ligne est d'abord rattachée à l'article du
 * catalogue du poste qui porte le même identifiant ; sinon à celui qui porte la
 * même désignation (sans tenir compte des accents, des majuscules ni des
 * espaces) ou le même code-barre ; sinon elle est proposée telle quelle.
 * Avant, seuls les articles du catalogue ENREGISTRÉ SUR LE POSTE étaient
 * proposés : un article reçu par bon mais absent ou écrit autrement dans ce
 * catalogue (poste pas encore synchronisé, article saisi au bon, catalogue
 * modifié depuis) apparaissait dans « État du stock » mais jamais à la vente,
 * qui le déclarait épuisé.
 */
export function construireProduitsVente(catalogue: CatalogueVente, lignes: StockMagasin[]): VenteProduct[] {
  const { montures, accessoires, verres, services, traitements } = catalogue;
  const list: VenteProduct[] = [];

  // Lignes de stock du magasin, par identifiant, désignation et code-barre.
  const parId = new Map<string, StockMagasin>();
  const parTexte = new Map<string, StockMagasin[]>();
  const indexer = (k: string, l: StockMagasin) => {
    if (!k) return;
    const liste = parTexte.get(k) || [];
    if (!liste.includes(l)) liste.push(l);
    parTexte.set(k, liste);
  };
  for (const l of lignes) {
    if (!l?.produitId) continue;
    parId.set(l.produitId, l);
    indexer(cleTexte(l.designation), l);
    indexer(cleTexte(l.produitId), l);
    if (l.codeBarre) indexer(cleTexte(l.codeBarre), l);
  }
  const rattachees = new Set<string>();

  // Articles du catalogue gérés en stock, avec leurs clés de rapprochement.
  interface Candidat { produit: VenteProduct; id: string; textes: string[] }
  const candidats: Candidat[] = [];
  for (const m of montures || []) {
    if (!m) continue;
    // Désignation telle qu'écrite par le bon de distribution (modal).
    const modalDesig = designationMonture(m);
    const cleModeleStock = PREFIXE_MODELE + cleModele(m.marque, m.reference);
    candidats.push({
      id: String(m.id ?? ''),
      textes: [m.id, modalDesig, m.codeBarre].map(cleTexte).filter(Boolean),
      produit: {
        produitId: String(m.id ?? ''),
        type: 'monture',
        label: getMontureLabel(m),
        labelComplet: modalDesig,
        codeBarre: m.codeBarre || '',
        prix: Number(m.prix) || 0,
        stock: 0,
        cleStockModele: cleModeleStock,
      },
    });
  }
  for (const a of accessoires || []) {
    if (!a) continue;
    const label =
      a.designation ||
      [a.marque, a.reference].filter(Boolean).join(' - ') ||
      a.reference ||
      '';
    const modalDesig = designationAccessoire(a);
    candidats.push({
      id: String(a.id ?? ''),
      textes: [a.id, modalDesig, a.codeBarre].map(cleTexte).filter(Boolean),
      produit: {
        produitId: String(a.id ?? ''),
        type: 'accessoire',
        label,
        labelComplet: modalDesig,
        codeBarre: a.codeBarre || '',
        prix: Number(a.prix) || 0,
        stock: 0,
      },
    });
  }

  // 1. Même identifiant (d'abord, pour qu'aucune autre fiche ne prenne la ligne).
  const stockTrouve = new Map<Candidat, number>();
  for (const c of candidats) {
    const l = c.id ? parId.get(c.id) : undefined;
    if (!l || rattachees.has(l.produitId)) continue;
    rattachees.add(l.produitId);
    stockTrouve.set(c, l.quantiteDisponible);
  }
  // 2. Même désignation ou même code-barre, parmi les lignes encore libres.
  //    La vente sortira alors l'article sous la clé de la ligne de stock.
  for (const c of candidats) {
    if (stockTrouve.has(c)) continue;
    const libres = [...new Set(c.textes.flatMap(t => parTexte.get(t) || []))]
      .filter(l => !rattachees.has(l.produitId) && !l.produitId.startsWith(PREFIXE_MODELE));
    if (libres.length === 0) continue;
    // La ligne la mieux fournie ; les autres restent proposées séparément (étape 4).
    const l = libres.sort((x, y) => y.quantiteDisponible - x.quantiteDisponible)[0];
    rattachees.add(l.produitId);
    stockTrouve.set(c, l.quantiteDisponible);
    c.produit.produitId = l.produitId;
  }
  // 3. Stock rangé au niveau du MODÈLE (ancien bon sans couleur ni taille) :
  //    chaque variante du modèle peut y puiser.
  for (const c of candidats) {
    const cle = c.produit.cleStockModele;
    const modele = cle ? parId.get(cle) : undefined;
    if (modele) rattachees.add(modele.produitId);
    c.produit.stock = (stockTrouve.get(c) ?? 0) + (modele?.quantiteDisponible ?? 0);
    list.push(c.produit);
  }
  // 4. Lignes de stock rattachées à aucune fiche du poste : proposées telles quelles.
  for (const l of lignes) {
    if (!l?.produitId || rattachees.has(l.produitId) || !(l.quantiteDisponible > 0)) continue;
    rattachees.add(l.produitId);
    const designation = String(l.designation || '').trim()
      || (l.produitId.startsWith(PREFIXE_MODELE) ? l.produitId.slice(PREFIXE_MODELE.length) : l.produitId);
    list.push({
      produitId: l.produitId,
      type: l.produitType === 'accessoire' ? 'accessoire' : 'monture',
      label: designation,
      labelComplet: designation,
      codeBarre: l.codeBarre || '',
      prix: Number(l.prixVente) || 0,
      stock: l.quantiteDisponible,
    });
  }

  for (const v of verres || []) {
    list.push({
      produitId: v.id,
      type: 'verre',
      label: v.verre || '',
      codeBarre: '',
      prix: Number(v.prixVerre) || 0,
      stock: null,
    });
  }

  for (const s of services || []) {
    const label = s.designation || s.service || s.nom || '';
    list.push({
      produitId: s.id,
      type: 'service',
      label,
      codeBarre: s.codeBarre || '',
      prix: Number(s.prix) || 0,
      stock: null,
    });
  }

  for (const t of traitements || []) {
    list.push({
      produitId: t.id,
      type: 'traitement',
      label: t.designation || '',
      codeBarre: '',
      prix: Number(t.prix) || 0,
      stock: null,
    });
  }

  return list.filter(p => p.label);
}

export function useVenteProducts(magasinId: string): VenteProduct[] {
  const montures = useMontures();
  const accessoires = useAccessoires();
  const verres = useVerresList();
  const services = useServices();
  const traitements = useTraitements();
  const lignes = useStockLignesMagasin(magasinId);

  return useMemo(
    () => construireProduitsVente({ montures, accessoires, verres, services, traitements }, lignes),
    [montures, accessoires, verres, services, traitements, lignes],
  );
}

/**
 * Cherche un produit par libellé exact, libellé complet (avec couleur et
 * taille) ou code-barre (insensible à la casse).
 *
 * Plusieurs variantes d'un même modèle (couleurs, tailles) partagent le libellé
 * « MARQUE - RÉF ». Avant, la PREMIÈRE variante du catalogue était retenue,
 * même absente du magasin : la vente sortait alors une variante qui n'était
 * pas en stock, et la monture réellement vendue restait en stock. Désormais la
 * variante PRÉSENTE dans le magasin est toujours préférée.
 */
export function findVenteProduct(products: VenteProduct[], query: string): VenteProduct | null {
  if (!query?.trim()) return null;
  const q = query.trim().toLowerCase();
  const enStock = (p: VenteProduct) => p.stock == null || p.stock > 0;
  const meilleur = (liste: VenteProduct[]) =>
    liste.length ? (liste.find(enStock) ?? liste[0]) : undefined;
  return (
    meilleur(products.filter(p => (p.labelComplet || '').toLowerCase() === q)) ??
    meilleur(products.filter(p => p.label.toLowerCase() === q)) ??
    meilleur(products.filter(p => p.codeBarre && p.codeBarre.toLowerCase() === q)) ??
    (q.length >= 3 ? meilleur(products.filter(p => p.label.toLowerCase().includes(q) || (p.labelComplet || '').toLowerCase().includes(q))) : undefined) ??
    null
  );
}

// ── Comptes Banque (API Supabase) ────────────────────────────────────────────
export function useComptesBanque(): string[] {
  const [comptes, setComptes] = useState<string[]>([]);
  useEffect(() => {
    api.getAll<any>('comptes-banque')
      .then(items => setComptes(items.map((c: any) => c.nomCompte || c.nom || '').filter(Boolean)))
      .catch(() => {});
    const h = () => {
      api.getAll<any>('comptes-banque')
        .then(items => setComptes(items.map((c: any) => c.nomCompte || c.nom || '').filter(Boolean)))
        .catch(() => {});
    };
    window.addEventListener('leclaire-acteurs-update', h);
    return () => window.removeEventListener('leclaire-acteurs-update', h);
  }, []);
  return comptes;
}

// ── Ophtalmologues (API Supabase) ─────────────────────────────────────────────
export function useOphtalmologues(): string[] {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    const load = () => {
      api.getAll<any>('ophtalmologues')
        .then(data => setItems(data.map((i: any) => i.ophtalmologue || i.nom || '').filter(Boolean).sort()))
        .catch(() => {});
    };
    load();
    window.addEventListener('leclaire-acteurs-update', load);
    return () => window.removeEventListener('leclaire-acteurs-update', load);
  }, []);
  return items;
}

// ── Assurances enregistrées (API Supabase) ───────────────────────────────────
export function useAssurances(): string[] {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    const load = () => {
      api.getAll<any>('assurances')
        .then(data => setItems(data.map((i: any) => i.raisonSociale || i.nom || '').filter(Boolean).sort()))
        .catch(() => {});
    };
    load();
    window.addEventListener('leclaire-acteurs-update', load);
    return () => window.removeEventListener('leclaire-acteurs-update', load);
  }, []);
  return items;
}

// ── Fournisseurs / Verriers (API Supabase) ───────────────────────────────────
export function useFournisseurs(): string[] {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    const load = () => {
      api.getAll<any>('fournisseurs')
        .then(data => setItems(data.map((i: any) => i.raisonSociale || i.nom || '').filter(Boolean).sort()))
        .catch(() => {});
    };
    load();
    window.addEventListener('leclaire-acteurs-update', load);
    return () => window.removeEventListener('leclaire-acteurs-update', load);
  }, []);
  return items;
}

// ── Cabinets Ophtalmologiques (API Supabase) ──────────────────────────────────
export function useCabinets(): string[] {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    const load = () => {
      api.getAll<any>('cabinets')
        .then(data => setItems(data.map((i: any) => i.cabinetOphtalmologue || i.nom || '').filter(Boolean).sort()))
        .catch(() => {});
    };
    load();
    window.addEventListener('leclaire-acteurs-update', load);
    return () => window.removeEventListener('leclaire-acteurs-update', load);
  }, []);
  return items;
}

// ── Clients d'un magasin (localStorage) ──────────────────────────────────────
export function useClientsMagasin(magasinId: string): string[] {
  const [items, setItems] = useState<string[]>(() => {
    try {
      const data = JSON.parse(localStorage.getItem(`leclaire_clients_magasin_${magasinId}`) || '[]');
      return data.map((c: any) => c.nom || '').filter(Boolean).sort();
    } catch { return []; }
  });
  useEffect(() => {
    const read = () => {
      try {
        const data = JSON.parse(localStorage.getItem(`leclaire_clients_magasin_${magasinId}`) || '[]');
        setItems(data.map((c: any) => c.nom || '').filter(Boolean).sort());
      } catch { setItems([]); }
    };
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (!d?.magasinId || d.magasinId === magasinId) read(); };
    window.addEventListener('leclaire-clients-update', h);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener('leclaire-clients-update', h); window.removeEventListener('storage', read); };
  }, [magasinId]);
  return items;
}

// ── Enregistrements CLIENTS complets d'un magasin (localStorage) ─────────────
export interface ClientRecord {
  id: string;
  numeroClient?: string;
  civilite?: string;
  nom?: string;
  telephone?: string;
  telephone2?: string;
  email?: string;
  adresse?: string;
  profession?: string;
  jourNaissance?: string;
  moisNaissance?: string;
  anneeNaissance?: string;
  matriculeAssurance?: string;
  entreprise?: string;
  solde?: number;
  [k: string]: any;
}

export function useClientRecordsMagasin(magasinId: string): ClientRecord[] {
  const key = `leclaire_clients_magasin_${magasinId}`;
  const [items, setItems] = useState<ClientRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    const read = () => {
      try { setItems(JSON.parse(localStorage.getItem(key) || '[]')); } catch { setItems([]); }
    };
    read();
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (!d?.magasinId || d.magasinId === magasinId) read(); };
    window.addEventListener('leclaire-clients-update', h);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener('leclaire-clients-update', h); window.removeEventListener('storage', read); };
  }, [magasinId, key]);
  return items;
}

// ── Professions (référentiel global) ─────────────────────────────────────────
export function useProfessions(): string[] {
  const items = useLS<any>('leclaire_db_professions');
  const registered = items.map(x => x.profession || '').filter(Boolean);
  const defaults = ['Commerçant(e)', 'Enseignant(e)', 'Étudiant(e)', 'Fonctionnaire', 'Infirmier(ère)', 'Médecin', 'Retraité(e)', 'Sans emploi'];
  return [...new Set([...registered, ...defaults])].sort();
}

/**
 * Mémorise un mode de paiement saisi librement s'il n'est pas déjà connu, afin
 * qu'il soit proposé lors des prochaines saisies (datalist).
 */
export function autoSaveModePaiement(mode: string): void {
  const trimmed = (mode || '').trim();
  if (!trimmed) return;
  const key = 'leclaire_db_modes-paiement';
  try {
    const existing: any[] = JSON.parse(localStorage.getItem(key) || '[]');
    const dejaConnu = existing.some(x => (x.modePaiement || x.nom || '').toLowerCase() === trimmed.toLowerCase());
    if (!dejaConnu) {
      existing.push({ id: Date.now().toString(), modePaiement: trimmed });
      localStorage.setItem(key, JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key } }));
    }
  } catch { /* silencieux */ }
  // Persistance PARTAGÉE : on enregistre aussi le mode dans « Gestion des Acteurs »
  // (collection Firestore `modes-paiement`) pour qu'il soit disponible partout et
  // sur tous les postes — et réciproquement les modes créés là-bas remontent ici.
  (async () => {
    try {
      const rows = await api.getAll<any>('modes-paiement');
      const connu = rows.some(x => (x.modePaiement || x.nom || '').toLowerCase() === trimmed.toLowerCase());
      if (!connu) {
        await api.create('modes-paiement', { modePaiement: trimmed });
        window.dispatchEvent(new CustomEvent('leclaire-acteurs-update', { detail: { entityType: 'modes-paiement' } }));
      }
    } catch { /* hors-ligne : le cache localStorage prend le relais */ }
  })();
}

// ── Modes de paiement ────────────────────────────────────────────────────────
// Fusionne TROIS sources pour que TOUS les modes soient proposés partout
// (Vente, Devis, Règlement, filtres) :
//   1. les modes saisis à la volée (cache localStorage) ;
//   2. les modes enregistrés dans « Gestion des Acteurs » (Firestore) ;
//   3. les modes par défaut.
export function useModesPaiement(): string[] {
  const items = useLS<any>('leclaire_db_modes-paiement');
  const [remote, setRemote] = useState<string[]>([]);
  useEffect(() => {
    let annule = false;
    const charger = () => {
      api.getAll<any>('modes-paiement')
        .then(rows => {
          if (!annule) setRemote(rows.map(r => r.modePaiement || r.nom || '').filter(Boolean));
        })
        .catch(() => { /* hors-ligne : on garde les modes locaux */ });
    };
    charger();
    const h = () => charger();
    window.addEventListener('leclaire-acteurs-update', h);
    window.addEventListener('leclaire-sync-update', h);
    return () => {
      annule = true;
      window.removeEventListener('leclaire-acteurs-update', h);
      window.removeEventListener('leclaire-sync-update', h);
    };
  }, []);
  const registered = items.map(x => x.modePaiement || x.nom || '').filter(Boolean);
  const defaults = ['Espèces', 'Mobile Money', 'Carte bancaire', 'Chèque', 'Virement'];
  const all = [...new Set([...registered, ...remote, ...defaults])];
  return all;
}
