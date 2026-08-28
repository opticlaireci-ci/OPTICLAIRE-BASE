/**
 * Hooks et helpers de lookup pour les formulaires de vente/devis.
 * - Types de verre, verres enregistrés, montures, comptes banque
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { loadStockMagasin, readStockCache, type StockMagasin } from '../services/inventaireService';

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

// ── Stock RÉEL d'un magasin (mouvements Firestore) ───────────────────────────
/**
 * Retourne le stock réel disponible du magasin, agrégé depuis les mouvements
 * (distribution/transfert/retour). Map indexée par `produitId` ET par
 * désignation en minuscules pour retrouver la quantité côté vente.
 */
/**
 * Indexe des lignes de stock par produitId ET par désignation (minuscules).
 * Exporté pour `stockVente.ts`, qui applique EXACTEMENT la même indexation aux
 * autres magasins : les deux vues doivent s'accorder sur les mêmes clés, sinon
 * un article compté ici serait introuvable là-bas.
 */
export function rowsToStockMap(rows: StockMagasin[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.produitId, (m.get(r.produitId) || 0) + r.quantiteDisponible);
    if (r.designation) {
      const k = r.designation.toLowerCase().trim();
      m.set(k, (m.get(k) || 0) + r.quantiteDisponible);
    }
  }
  return m;
}

export function useStockMagasin(magasinId: string): Map<string, number> {
  // Seed INSTANTANÉ depuis le cache — plus d'attente réseau avant l'affichage.
  const [map, setMap] = useState<Map<string, number>>(() => rowsToStockMap(readStockCache(magasinId)));
  useEffect(() => {
    if (!magasinId) { setMap(new Map()); return; }
    let cancelled = false;
    // Re-seed cache immédiat (changement de magasin).
    setMap(rowsToStockMap(readStockCache(magasinId)));
    const load = async () => {
      try {
        const rows = await loadStockMagasin(magasinId.toUpperCase());
        if (!cancelled) setMap(rowsToStockMap(rows));
      } catch { /* on garde le cache */ }
    };
    load();
    // Rafraîchissement AUTOMATIQUE : périodique + événements.
    const interval = setInterval(load, 8000);
    const onStockUpdated = () => { if (!cancelled) setMap(rowsToStockMap(readStockCache(magasinId))); };
    window.addEventListener('leclaire-sync-update', load);
    window.addEventListener('storage', load);
    window.addEventListener('leclaire-stock-updated', onStockUpdated);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('leclaire-sync-update', load);
      window.removeEventListener('storage', load);
      window.removeEventListener('leclaire-stock-updated', onStockUpdated);
    };
  }, [magasinId]);
  return map;
}

// ── Index unifié des produits vendables (avec stock réel du magasin) ──────────
export interface VenteProduct {
  produitId: string;
  type: 'monture' | 'accessoire' | 'verre' | 'service';
  label: string;
  codeBarre: string;
  prix: number;
  /** Quantité réelle en magasin, ou null si non gérée en stock (verre/service). */
  stock: number | null;
  /** Renseignés uniquement pour les montures (impression devis/facture). */
  fournisseur?: string;
  garantie?: string;
  detailMonture?: string;
}

export function useVenteProducts(magasinId: string): VenteProduct[] {
  const montures = useMontures();
  const accessoires = useAccessoires();
  const verres = useVerresList();
  const services = useServices();
  const stockMap = useStockMagasin(magasinId);

    // Le stock (mouvements) peut être indexé par l'id catalogue OU par la
    // désignation (selon l'ancienneté du bon de distribution). On tente donc
    // toutes les clés plausibles pour retrouver la quantité réelle disponible.
    const lookupStock = (...keys: (string | undefined)[]): number | null => {
      for (const k of keys) {
        if (!k) continue;
        const direct = stockMap.get(k);
        if (direct != null) return direct;
        const lower = stockMap.get(k.toLowerCase().trim());
        if (lower != null) return lower;
      }
      return null;
    };

  return useMemo(() => {
    const list: VenteProduct[] = [];

    for (const m of montures) {
      // Désignation telle qu'écrite par le bon de distribution (modal).
      const modalDesig = `${m.marque} - ${m.reference} ${(m as any).couleur ?? ''} ${(m as any).taille ?? ''}`.replace(/\s+/g, ' ').trim();
      // Ligne détaillée façon devis/facture imprimé : Marque - Catégorie - Famille - Référence - Couleur - Taille
      const detailMonture = [m.marque, (m as any).categorie, (m as any).famille, m.reference, (m as any).couleur, (m as any).taille]
        .filter(Boolean).join(' - ');
      list.push({
        produitId: m.id,
        type: 'monture',
        label: getMontureLabel(m),
        codeBarre: m.codeBarre || '',
        prix: Number(m.prix) || 0,
        stock: lookupStock(m.id, modalDesig, getMontureLabel(m)) ?? 0,
        fournisseur: m.fournisseur || '',
        garantie: m.garantie || '',
        detailMonture,
      });
    }

    for (const a of accessoires) {
      const label =
        a.designation ||
        [a.marque, a.reference].filter(Boolean).join(' - ') ||
        a.reference ||
        '';
      const modalDesig = `${a.marque ?? ''} - ${a.designation ?? ''}`.replace(/\s+/g, ' ').trim();
      list.push({
        produitId: a.id,
        type: 'accessoire',
        label,
        codeBarre: a.codeBarre || '',
        prix: Number(a.prix) || 0,
        stock: lookupStock(a.id, modalDesig, label) ?? 0,
      });
    }

    for (const v of verres) {
      list.push({
        produitId: v.id,
        type: 'verre',
        label: v.verre || '',
        codeBarre: '',
        prix: Number(v.prixVerre) || 0,
        stock: null,
      });
    }

    for (const s of services) {
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

    return list.filter(p => p.label);
  }, [montures, accessoires, verres, services, stockMap]);
}

/** Cherche un produit par libellé exact ou code-barre (insensible à la casse). */
export function findVenteProduct(products: VenteProduct[], query: string): VenteProduct | null {
  if (!query?.trim()) return null;
  const q = query.trim().toLowerCase();
  return (
    products.find(p => p.label.toLowerCase() === q) ??
    products.find(p => p.codeBarre && p.codeBarre.toLowerCase() === q) ??
    products.find(p => p.label.toLowerCase().includes(q) && q.length >= 3) ??
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
    if (dejaConnu) return;
    existing.push({ id: Date.now().toString(), modePaiement: trimmed });
    localStorage.setItem(key, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key } }));
  } catch { /* silencieux */ }
}

// ── Modes de paiement ────────────────────────────────────────────────────────
export function useModesPaiement(): string[] {
  const items = useLS<any>('leclaire_db_modes-paiement');
  const registered = items.map(x => x.modePaiement || x.nom || '').filter(Boolean);
  const defaults = ['Espèces', 'Mobile Money', 'Carte bancaire', 'Chèque', 'Virement'];
  const all = [...new Set([...registered, ...defaults])];
  return all;
}
