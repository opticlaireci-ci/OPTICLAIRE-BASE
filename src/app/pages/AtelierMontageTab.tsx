import { useState, useMemo } from 'react';
import { Save, Search, X, LayoutDashboard, Glasses, Eye, ArrowLeftRight, ClipboardList, CheckCircle2, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { useLiveData } from '../hooks/useLiveData';
import { useAuth } from '../contexts/AuthContext';
import { AtelierMontageKpis, AtelierMontageCharts } from './AtelierMontageDashboard';
import { LentillesOpticGrid, LentillesOpticKpis } from './LentillesOpticGrid';
import { OPTIC_STORAGE_KEY } from './lentillesOpticData';
import type { Cell as OpticCell } from './lentillesOpticData';
import { trouverCase } from '../services/lentillesOpticStock';
import type { LentilleVendue } from '../services/lentillesOpticStock';

// Overrides du stock lentilles OPTIC : { tableId: { ligne: { colonne: [initial, monté] } } }
type OpticOverrides = Record<string, Record<string, Record<string, OpticCell>>>;

// Extrait les nombres signés d'une chaîne (SPH, CYL, AXE… dans cet ordre).
function parseNums(s?: string): number[] {
  if (!s) return [];
  const m = s.replace(/,/g, '.').match(/[+-]?\d+(?:\.\d+)?/g);
  return m ? m.map(parseFloat) : [];
}

// Verres (OD + OG) consommés par un montage. La SALLE DE MONTAGE tire ses
// éléments UNIQUEMENT de la fiche de montage : c'est le document de référence
// de l'atelier, celui que le magasin a effectivement transmis. Les données de
// la vente (`verreDetails`) ne sont plus consultées, même en repli — un bon
// sans fiche de montage ne consomme aucun verre.
function lentillesDuBon(b: MontageBon): LentilleVendue[] {
  const fiche = (b as any).ficheMontage;
  if (!fiche) return [];
  const depuisLigne = (ligne?: string, addStr?: string): LentilleVendue => {
    const n = parseNums(ligne);
    return { typeVerre: fiche.typeVerre, sphere: n[0], cylindre: n[1], addition: parseNums(addStr)[0], quantite: 1 };
  };
  return [depuisLigne(fiche.od?.ligne, fiche.od?.add), depuisLigne(fiche.og?.ligne, fiche.og?.add)];
}

// Applique la sortie de stock (incrémente « Monté ») pour un montage et renvoie
// de nouveaux overrides (immuable). Les verres hors tableaux OPTIC sont ignorés.
function consommerMontage(ov: OpticOverrides, b: MontageBon): OpticOverrides {
  let next = ov;
  for (const vendue of lentillesDuBon(b)) {
    const c = trouverCase(vendue);
    if (!c) continue;
    const qte = Math.max(0, Math.round(vendue.quantite ?? 1));
    if (!qte) continue;
    const cur: OpticCell = next[c.tableId]?.[c.row]?.[c.col] ?? c.table.seed[c.row]?.[c.col] ?? [0, 0];
    const nc: OpticCell = [cur[0], cur[1] + qte];
    next = {
      ...next,
      [c.tableId]: {
        ...(next[c.tableId] || {}),
        [c.row]: { ...((next[c.tableId] || {})[c.row] || {}), [c.col]: nc },
      },
    };
  }
  return next;
}

/**
 * Sous-onglet MONTAGE de la page Atelier.
 *
 * Il est lui-même divisé en 5 sous-onglets :
 *   - Tableau de bord   : suivi de montage des bons + compteurs par statut
 *   - Stock Verres      : catalogue global des verres (stock / seuil)
 *   - Stock Lentilles   : catalogue global des lentilles (stock / seuil)
 *   - Entrées / Sorties : mouvements dérivés des dates d'atelier des bons
 *   - Inventaire        : inventaires enregistrés
 *
 * La salle de montage ne reçoit QUE les fiches de montage envoyées par les
 * magasins (Commercial → Fiche de montage) : le filtrage est fait par la page
 * parente, qui ne transmet ici que les bons portant `source: 'fiche-montage'`
 * ou un bloc `ficheMontage`. Les bons de commande fournisseur de l'onglet
 * « Bon Verre » n'apparaissent donc pas. Toutes les modifications de montage
 * sont persistées via le `onUpdate` fourni par la page parente.
 */

export interface MontageBon {
  id: string;
  numFacture?: string;
  numRef?: string;
  numBC?: string;
  fournisseur?: string;
  client?: string;
  officine?: string;
  magasin?: string;
  date?: string;
  dateEntreeAtelier?: string;
  dateRetourMagasin?: string;
  monteur?: string;
  statutMontage?: string;
  dateMontage?: string;
  valide?: boolean;
  // Traçabilité — qui fait quoi et quand
  prisEnChargePar?: string;
  prisEnChargeLe?: string;
  validePar?: string;
  valideLe?: string;
  stockDecremente?: boolean; // évite une double sortie de stock
}

export type SubTab = 'dashboard' | 'mes-montages' | 'stock-lentilles' | 'mouvements' | 'inventaire';

const SUB_TABS: { key: SubTab; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard size={16} /> },
  { key: 'mes-montages', label: 'Mes Montages', icon: <Glasses size={16} /> },
  { key: 'stock-lentilles', label: 'Stock Lentilles', icon: <Eye size={16} /> },
  { key: 'mouvements', label: 'Entrées / Sorties', icon: <ArrowLeftRight size={16} /> },
  { key: 'inventaire', label: 'Inventaire', icon: <ClipboardList size={16} /> },
];

const STATUTS_MONTAGE = ['En attente', 'En cours', 'Monté', 'Contrôlé', 'Livré au magasin'];
const STATUT_COLORS: Record<string, string> = {
  'En attente': '#e74c3c',
  'En cours': '#f39c12',
  'Monté': '#2980b9',
  'Contrôlé': '#8e44ad',
  'Livré au magasin': '#16a34a',
};

const VERRES_KEY = 'leclaire_global_verres';
const LENTILLES_KEY = 'leclaire_global_lentilles';
const INVENTAIRES_KEY = 'leclaire_inventaires';

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try { return new Date(dateStr).toLocaleDateString('fr-FR'); } catch { return dateStr; }
};

const th: React.CSSProperties = { padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50', fontSize: '13px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 8px', fontSize: '13px', color: '#2c3e50', verticalAlign: 'top' };
const cellInput: React.CSSProperties = { width: '100%', padding: '5px 6px', border: '1px solid #b7c6d3', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff' };
const cardWrap: React.CSSProperties = { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };

interface Props {
  bons: MontageBon[];
  onUpdate: (id: string, patch: Partial<MontageBon>) => void;
}

// Le composant est rendu deux fois par la page parente :
//   region="beside" → barre de sous-onglets + KPI, à droite de la barre latérale
//   region="full"   → graphiques + tableaux, pleine largeur sous la barre latérale
export const MONTAGE_SUB_TABS = SUB_TABS;

interface TabProps extends Props {
  subTab: SubTab;
  setSubTab: (t: SubTab) => void;
  region: 'beside' | 'full';
}

// ── Section repliable (accordéon) : titre cliquable qui déroule/enroule ──────
function Collapsible({ title, count, icon, defaultOpen = true, children }: {
  title: string; count?: number; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={cardWrap}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', marginBottom: open ? '16px' : 0 }}
      >
        {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        {icon}
        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#2c3e50' }}>{title}{typeof count === 'number' ? ` (${count})` : ''}</span>
      </button>
      {open && children}
    </div>
  );
}

// ── Barre de recherche réutilisable ──────────────────────────────────────────
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', maxWidth: '420px' }}>
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff' }}>
        <span style={{ padding: '0 8px', color: '#9ca3af' }}><Search size={16} /></span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, padding: '8px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent' }}
        />
        {value && (
          <button onClick={() => onChange('')} style={{ padding: '0 8px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tableau de stock générique (verres / lentilles) ──────────────────────────
function StockTable({ storageKey, labelSingulier }: { storageKey: string; labelSingulier: string }) {
  const [items] = useLiveData<any>(storageKey, []);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it: any) =>
      [it.reference, it.marque, it.categorie, it.famille, it.codeBarre, it.designation]
        .some(v => (v || '').toString().toLowerCase().includes(s)),
    );
  }, [items, q]);

  return (
    <div style={cardWrap}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
        Stock {labelSingulier} ({filtered.length})
      </h2>
      <SearchBar value={q} onChange={setQ} placeholder="Référence, marque, catégorie…" />
      <div style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
          <thead>
            <tr style={{ backgroundColor: '#8ba9bd' }}>
              <th style={{ ...th, width: '50px' }}>N°</th>
              <th style={th}>Référence</th>
              <th style={th}>Marque</th>
              <th style={th}>Catégorie</th>
              <th style={th}>Prix</th>
              <th style={{ ...th, textAlign: 'center' }}>Stock</th>
              <th style={{ ...th, textAlign: 'center' }}>Seuil</th>
              <th style={{ ...th, textAlign: 'center' }}>État</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucun {labelSingulier.toLowerCase()} en stock</td></tr>
            ) : (
              filtered.map((it: any, idx: number) => {
                const stock = Number(it.stock ?? 0);
                const seuil = Number(it.seuil ?? 0);
                const rupture = stock <= 0;
                const bas = !rupture && seuil > 0 && stock <= seuil;
                const couleur = rupture ? '#e74c3c' : bas ? '#f39c12' : '#16a34a';
                const etat = rupture ? 'Rupture' : bas ? 'Stock bas' : 'OK';
                return (
                  <tr key={it.id || idx} style={{ backgroundColor: '#dbe6ee', borderBottom: '2px solid #fff' }}>
                    <td style={td}><span style={{ backgroundColor: '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{idx + 1}</span></td>
                    <td style={{ ...td, fontWeight: 600 }}>{it.reference || it.designation || it.codeBarre || '-'}</td>
                    <td style={td}>{it.marque || '-'}</td>
                    <td style={td}>{it.categorie || it.famille || '-'}</td>
                    <td style={td}>{it.prix != null ? Number(it.prix).toLocaleString('fr-FR') : '-'}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{stock}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{seuil}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ backgroundColor: couleur, color: '#fff', borderRadius: '10px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>{etat}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AtelierMontageTab({ bons, onUpdate, subTab, setSubTab, region }: TabProps) {
  // ── Région « beside » : barre de sous-onglets + KPI (à droite de la sidebar) ──
  if (region === 'beside') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Barre de sous-onglets */}
        <div style={{ ...cardWrap, padding: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {SUB_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                backgroundColor: subTab === t.key ? '#2563eb' : 'transparent',
                color: subTab === t.key ? '#fff' : '#2c3e50',
                fontWeight: subTab === t.key ? 600 : 500, fontSize: '14px',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Le tableau de bord garde ses KPI à côté de la barre latérale. */}
        {subTab === 'dashboard' && <AtelierMontageKpis bons={bons} />}
        {/* Mes Montages : compteurs (total, restants, par statut) à gauche. */}
        {subTab === 'mes-montages' && <MesMontagesKpis bons={bons} />}
        {/* Stock Lentilles : totaux « disponibles » à gauche, la grille reste en bas. */}
        {subTab === 'stock-lentilles' && <LentillesOpticKpis />}
      </div>
    );
  }

  // ── Région « full » : contenu des sous-onglets en pleine largeur (bas de page) ─
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {subTab === 'dashboard' && <AtelierMontageCharts bons={bons} />}
      {subTab === 'mes-montages' && (
        <>
          <MontagesRecus bons={bons} onUpdate={onUpdate} />
          <MontageTable bons={bons} onUpdate={onUpdate} />
          <MontagesValides bons={bons} />
        </>
      )}
      {subTab === 'stock-lentilles' && <LentillesOpticGrid />}
      {subTab === 'mouvements' && <MouvementsAtelier bons={bons} />}
      {subTab === 'inventaire' && <InventaireList />}
    </div>
  );
}

// ── Tableau de suivi du montage ──────────────────────────────────────────────
// ── KPI « Mes Montages » (affichés à côté de la barre latérale) ──────────────
function MesMontagesKpis({ bons }: { bons: MontageBon[] }) {
  const stats = useMemo(() => {
    const parStatut: Record<string, number> = {};
    for (const s of STATUTS_MONTAGE) parStatut[s] = 0;
    for (const b of bons) { const s = b.statutMontage || 'En attente'; parStatut[s] = (parStatut[s] || 0) + 1; }
    const total = bons.length;
    const livres = parStatut['Livré au magasin'] || 0;
    const restants = total - livres; // montages non encore livrés
    const enCours = parStatut['En cours'] || 0;
    const enAttente = parStatut['En attente'] || 0;
    const montes = (parStatut['Monté'] || 0) + (parStatut['Contrôlé'] || 0) + livres;
    return { total, restants, livres, enCours, enAttente, montes, parStatut };
  }, [bons]);

  const card = (label: string, value: number, color: string, hint?: string) => (
    <div style={{ backgroundColor: '#fff', border: `1px solid ${color}33`, borderLeft: `5px solid ${color}`, borderRadius: '8px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: '13px', color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>{value.toLocaleString('fr-FR')}</div>
      {hint && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#2c3e50' }}>Mes Montages — synthèse</div>
      {card('Nombre de montages', stats.total, '#2563eb', 'Tous statuts confondus')}
      {card('Montages restants', stats.restants, '#f39c12', 'Pas encore livrés au magasin')}
      {card('En attente', stats.enAttente, '#e74c3c')}
      {card('En cours', stats.enCours, '#f39c12')}
      {card('Montés / contrôlés', stats.montes, '#8e44ad')}
      {card('Livrés au magasin', stats.livres, '#16a34a')}
    </div>
  );
}

// ── Montages Reçus : bons arrivés des différents magasins, pas encore pris en
//    charge à l'atelier (aucune date d'entrée). C'est ici qu'atterrissent les
//    nouveaux montages avant de basculer dans le « Suivi du Montage ».
function MontagesRecus({ bons, onUpdate }: Props) {
  const [recherche, setRecherche] = useState('');
  const [optic, saveOptic] = useLiveData<OpticOverrides>(OPTIC_STORAGE_KEY, {} as any);
  const { user } = useAuth();
  const acteur = user?.name || user?.prenom || user?.email || 'Utilisateur inconnu';

  const recus = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return bons
      .filter(b => !b.dateEntreeAtelier) // pas encore entré à l'atelier
      .filter(b => {
        if (!q) return true;
        return (
          (b.numBC || '').toLowerCase().includes(q) ||
          (b.numRef || '').toLowerCase().includes(q) ||
          (b.client || '').toLowerCase().includes(q) ||
          (b.magasin || b.officine || '').toLowerCase().includes(q)
        );
      });
  }, [bons, recherche]);

  const prendreEnCharge = (b: MontageBon) => {
    // Le passage « Reçu → Suivi du Montage » doit être VALIDÉ : c'est seulement
    // à cette validation que le stock de lentilles diminue.
    if (!window.confirm(`Valider le passage au suivi du montage ?\n\nCela déduira les verres du stock lentilles (OD + OG).\n\nOpérateur : ${acteur}`)) return;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Sortie de stock lentilles (une seule fois) : les corrections viennent
    // exclusivement de la fiche de montage transmise par le magasin.
    if (!b.stockDecremente) {
      const ov = consommerMontage((optic as OpticOverrides) || {}, b);
      saveOptic(ov as any);
    }

    onUpdate(b.id, {
      dateEntreeAtelier: today,
      statutMontage: 'En cours',
      stockDecremente: true,
      // Traçabilité : qui a pris en charge et quand.
      prisEnChargePar: acteur,
      prisEnChargeLe: now.toISOString(),
    });
  };

  return (
    <Collapsible title="Montages Reçus" count={recus.length} icon={<ArrowLeftRight size={18} />}>
      <SearchBar value={recherche} onChange={setRecherche} placeholder="N° BC, client, magasin…" />

      <div style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
          <thead>
            <tr style={{ backgroundColor: '#8ba9bd' }}>
              <th style={{ ...th, width: '50px' }}>N°</th>
              <th style={th}>N° BC</th>
              <th style={th}>Magasin</th>
              <th style={th}>Client</th>
              <th style={th}>Fournisseur</th>
              <th style={th}>Date réception</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {recus.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucun montage reçu en attente</td></tr>
            ) : (
              recus.map((bon, idx) => (
                <tr key={bon.id} style={{ backgroundColor: '#dbe6ee', borderBottom: '2px solid #fff' }}>
                  <td style={td}><span style={{ backgroundColor: '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{idx + 1}</span></td>
                  <td style={td}>{bon.numBC || bon.numRef || '-'}</td>
                  <td style={td}><span style={{ backgroundColor: '#1a5a72', color: '#fff', padding: '3px 8px', borderRadius: '3px', fontSize: '12px' }}>{bon.magasin || bon.officine || '-'}</span></td>
                  <td style={td}>{bon.client || '-'}</td>
                  <td style={td}>{bon.fournisseur || '-'}</td>
                  <td style={td}>{formatDate(bon.date)}</td>
                  <td style={td}>
                    <button onClick={() => prendreEnCharge(bon)} title="Envoyer au suivi du montage" style={{ backgroundColor: '#16a34a', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                      <ArrowLeftRight size={16} /> Prendre en charge
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}

// ── Liste de suivi : montages validés, non modifiables (lecture seule) ───────
function MontagesValides({ bons }: { bons: MontageBon[] }) {
  const [recherche, setRecherche] = useState('');

  const valides = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return bons
      .filter(b => b.valide)
      .filter(b => {
        if (!q) return true;
        return (
          (b.numBC || '').toLowerCase().includes(q) ||
          (b.numRef || '').toLowerCase().includes(q) ||
          (b.client || '').toLowerCase().includes(q) ||
          (b.monteur || '').toLowerCase().includes(q) ||
          (b.magasin || b.officine || '').toLowerCase().includes(q)
        );
      });
  }, [bons, recherche]);

  return (
    <Collapsible title="Montages Validés" count={valides.length} icon={<Lock size={18} />} defaultOpen={false}>
      <SearchBar value={recherche} onChange={setRecherche} placeholder="N° BC, client, monteur, magasin…" />

      <div style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
          <thead>
            <tr style={{ backgroundColor: '#8ba9bd' }}>
              <th style={{ ...th, width: '50px' }}>N°</th>
              <th style={th}>N° BC</th>
              <th style={th}>Client</th>
              <th style={th}>Magasin</th>
              <th style={th}>Monteur</th>
              <th style={th}>Statut</th>
              <th style={th}>Pris en charge par</th>
              <th style={th}>Validé par</th>
              <th style={th}>Entrée atelier</th>
              <th style={th}>Retour magasin</th>
            </tr>
          </thead>
          <tbody>
            {valides.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucun montage validé</td></tr>
            ) : (
              valides.map((bon, idx) => {
                const couleur = STATUT_COLORS[bon.statutMontage || 'En attente'] || '#6b7280';
                return (
                  <tr key={bon.id} style={{ backgroundColor: '#eef4f8', borderBottom: '2px solid #fff' }}>
                    <td style={td}><span style={{ backgroundColor: '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{idx + 1}</span></td>
                    <td style={td}>{bon.numBC || bon.numRef || '-'}</td>
                    <td style={td}>{bon.client || '-'}</td>
                    <td style={td}>{bon.magasin || bon.officine || '-'}</td>
                    <td style={td}>{bon.monteur || '-'}</td>
                    <td style={td}><span style={{ backgroundColor: couleur, color: '#fff', borderRadius: '10px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>{bon.statutMontage || 'En attente'}</span></td>
                    <td style={td}>{bon.prisEnChargePar || '-'}{bon.prisEnChargeLe ? <div style={{ fontSize: '11px', color: '#6b7280' }}>{formatDate(bon.prisEnChargeLe)}</div> : null}</td>
                    <td style={td}>{bon.validePar || '-'}{bon.valideLe ? <div style={{ fontSize: '11px', color: '#6b7280' }}>{formatDate(bon.valideLe)}</div> : null}</td>
                    <td style={td}>{formatDate(bon.dateEntreeAtelier)}</td>
                    <td style={td}>{formatDate(bon.dateRetourMagasin)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}

function MontageTable({ bons, onUpdate }: Props) {
  const [recherche, setRecherche] = useState('');
  const [statutFiltre, setStatutFiltre] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Partial<MontageBon>>>({});
  const { user } = useAuth();
  const acteur = user?.name || user?.prenom || user?.email || 'Utilisateur inconnu';

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return bons.filter(b => {
      if (!b.dateEntreeAtelier) return false; // encore dans « Montages Reçus »
      if (b.valide) return false; // déjà validé → liste de suivi (non modifiable)
      if (statutFiltre && (b.statutMontage || 'En attente') !== statutFiltre) return false;
      if (!q) return true;
      return (
        (b.numBC || '').toLowerCase().includes(q) ||
        (b.numRef || '').toLowerCase().includes(q) ||
        (b.client || '').toLowerCase().includes(q) ||
        (b.fournisseur || '').toLowerCase().includes(q) ||
        (b.monteur || '').toLowerCase().includes(q)
      );
    });
  }, [bons, recherche, statutFiltre]);

  const draftOf = (b: MontageBon) => ({
    monteur: drafts[b.id]?.monteur ?? b.monteur ?? '',
    statutMontage: drafts[b.id]?.statutMontage ?? b.statutMontage ?? 'En attente',
    dateEntreeAtelier: drafts[b.id]?.dateEntreeAtelier ?? b.dateEntreeAtelier ?? '',
    dateMontage: drafts[b.id]?.dateMontage ?? b.dateMontage ?? '',
    dateRetourMagasin: drafts[b.id]?.dateRetourMagasin ?? b.dateRetourMagasin ?? '',
  });
  const setDraft = (id: string, patch: Partial<MontageBon>) => setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const saveDraft = (b: MontageBon) => {
    onUpdate(b.id, draftOf(b));
    setDrafts(prev => { const n = { ...prev }; delete n[b.id]; return n; });
  };
  // Valider = enregistrer + verrouiller : le montage bascule dans la liste de suivi.
  const validerDraft = (b: MontageBon) => {
    if (!window.confirm(`Valider ce montage ? Il ne sera plus modifiable.\n\nValidé par : ${acteur}`)) return;
    onUpdate(b.id, { ...draftOf(b), valide: true, validePar: acteur, valideLe: new Date().toISOString() });
    setDrafts(prev => { const n = { ...prev }; delete n[b.id]; return n; });
  };

  const compteurs = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUTS_MONTAGE) c[s] = 0;
    for (const b of bons) { const s = b.statutMontage || 'En attente'; c[s] = (c[s] || 0) + 1; }
    return c;
  }, [bons]);

  return (
    <Collapsible title="Suivi du Montage" count={filtered.length} icon={<Glasses size={18} />}>
      <SearchBar value={recherche} onChange={setRecherche} placeholder="N° BC, client, fournisseur, monteur…" />

      <div style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1100px' }}>
          <thead>
            <tr style={{ backgroundColor: '#8ba9bd' }}>
              <th style={{ ...th, width: '50px' }}>N°</th>
              <th style={th}>N° BC</th>
              <th style={th}>Client / Fournisseur</th>
              <th style={th}>Officine</th>
              <th style={{ ...th, minWidth: '150px' }}>Monteur</th>
              <th style={{ ...th, minWidth: '150px' }}>Entrée atelier</th>
              <th style={{ ...th, minWidth: '160px' }}>Statut montage</th>
              <th style={{ ...th, minWidth: '150px' }}>Date montage</th>
              <th style={{ ...th, minWidth: '150px' }}>Retour magasin</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucun bon à monter</td></tr>
            ) : (
              filtered.map((bon, idx) => {
                const d = draftOf(bon);
                const couleur = STATUT_COLORS[d.statutMontage || 'En attente'] || '#6b7280';
                return (
                  <tr key={bon.id} style={{ backgroundColor: '#dbe6ee', borderBottom: '2px solid #fff' }}>
                    <td style={td}><span style={{ backgroundColor: '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{idx + 1}</span></td>
                    <td style={td}>{bon.numBC || bon.numRef || '-'}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{bon.fournisseur || '-'}</div>
                      {bon.client && (
                        <div style={{ marginTop: '6px', backgroundColor: '#1a5a72', color: '#fff', padding: '3px 8px', borderRadius: '3px', display: 'inline-block', fontSize: '12px' }}>Client: {bon.client}</div>
                      )}
                    </td>
                    <td style={td}>{bon.officine || bon.magasin || '-'}</td>
                    <td style={td}>
                      <input type="text" placeholder="Nom du monteur" value={d.monteur} onChange={e => setDraft(bon.id, { monteur: e.target.value })} style={cellInput} />
                    </td>
                    <td style={td}>
                      <input type="date" value={d.dateEntreeAtelier} onChange={e => setDraft(bon.id, { dateEntreeAtelier: e.target.value })} style={cellInput} />
                    </td>
                    <td style={td}>
                      <select value={d.statutMontage} onChange={e => setDraft(bon.id, { statutMontage: e.target.value })} style={{ ...cellInput, borderLeft: `4px solid ${couleur}`, fontWeight: 600 }}>
                        {STATUTS_MONTAGE.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <input type="date" value={d.dateMontage} onChange={e => setDraft(bon.id, { dateMontage: e.target.value })} style={cellInput} />
                    </td>
                    <td style={td}>
                      <input type="date" value={d.dateRetourMagasin} onChange={e => setDraft(bon.id, { dateRetourMagasin: e.target.value })} style={cellInput} />
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button onClick={() => saveDraft(bon)} title="Enregistrer le montage" style={{ backgroundColor: '#5b9bd5', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                          <Save size={16} /> Enregistrer
                        </button>
                        <button onClick={() => validerDraft(bon)} title="Valider et verrouiller le montage" style={{ backgroundColor: '#16a34a', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                          <CheckCircle2 size={16} /> Valider
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}

// ── Entrées / Sorties : mouvements dérivés des dates d'atelier ───────────────
function MouvementsAtelier({ bons }: { bons: MontageBon[] }) {
  const [q, setQ] = useState('');

  const mouvements = useMemo(() => {
    const evts: { id: string; type: 'Entrée' | 'Sortie'; date: string; libelle: string; monteur?: string }[] = [];
    for (const b of bons) {
      const libelle = `${b.numBC || b.numRef || 'Bon'}${b.client ? ' — ' + b.client : ''}`;
      if (b.dateEntreeAtelier) evts.push({ id: `${b.id}-in`, type: 'Entrée', date: b.dateEntreeAtelier, libelle, monteur: b.monteur });
      if (b.dateRetourMagasin) evts.push({ id: `${b.id}-out`, type: 'Sortie', date: b.dateRetourMagasin, libelle, monteur: b.monteur });
    }
    evts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const s = q.trim().toLowerCase();
    return s ? evts.filter(e => e.libelle.toLowerCase().includes(s) || (e.monteur || '').toLowerCase().includes(s)) : evts;
  }, [bons, q]);

  const nbEntrees = mouvements.filter(m => m.type === 'Entrée').length;
  const nbSorties = mouvements.filter(m => m.type === 'Sortie').length;

  return (
    <div style={cardWrap}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Entrées / Sorties atelier ({mouvements.length})</h2>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#e8f5e9', border: '1px solid #16a34a', fontWeight: 600, color: '#166534' }}>Entrées : {nbEntrees}</div>
        <div style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #e74c3c', fontWeight: 600, color: '#991b1b' }}>Sorties : {nbSorties}</div>
      </div>
      <SearchBar value={q} onChange={setQ} placeholder="Bon, client, monteur…" />
      <div style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
          <thead>
            <tr style={{ backgroundColor: '#8ba9bd' }}>
              <th style={{ ...th, width: '50px' }}>N°</th>
              <th style={th}>Type</th>
              <th style={th}>Date</th>
              <th style={th}>Bon / Client</th>
              <th style={th}>Monteur</th>
            </tr>
          </thead>
          <tbody>
            {mouvements.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucun mouvement (renseignez les dates d'entrée atelier / retour magasin dans le Tableau de bord)</td></tr>
            ) : (
              mouvements.map((m, idx) => (
                <tr key={m.id} style={{ backgroundColor: '#dbe6ee', borderBottom: '2px solid #fff' }}>
                  <td style={td}><span style={{ backgroundColor: '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{idx + 1}</span></td>
                  <td style={td}>
                    <span style={{ backgroundColor: m.type === 'Entrée' ? '#16a34a' : '#e74c3c', color: '#fff', borderRadius: '10px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>{m.type}</span>
                  </td>
                  <td style={td}>{formatDate(m.date)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{m.libelle}</td>
                  <td style={td}>{m.monteur || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Inventaire ────────────────────────────────────────────────────────────────
function InventaireList() {
  const [inventaires] = useLiveData<any>(INVENTAIRES_KEY, []);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return inventaires;
    return inventaires.filter((inv: any) =>
      [inv.reference, inv.libelle, inv.magasin, inv.statut].some(v => (v || '').toString().toLowerCase().includes(s)),
    );
  }, [inventaires, q]);

  return (
    <div style={cardWrap}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Inventaires ({filtered.length})</h2>
      <SearchBar value={q} onChange={setQ} placeholder="Référence, magasin, statut…" />
      <div style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
          <thead>
            <tr style={{ backgroundColor: '#8ba9bd' }}>
              <th style={{ ...th, width: '50px' }}>N°</th>
              <th style={th}>Référence</th>
              <th style={th}>Libellé</th>
              <th style={th}>Magasin</th>
              <th style={th}>Date</th>
              <th style={th}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucun inventaire enregistré</td></tr>
            ) : (
              filtered.map((inv: any, idx: number) => (
                <tr key={inv.id || idx} style={{ backgroundColor: '#dbe6ee', borderBottom: '2px solid #fff' }}>
                  <td style={td}><span style={{ backgroundColor: '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{idx + 1}</span></td>
                  <td style={{ ...td, fontWeight: 600 }}>{inv.reference || inv.numero || inv.id || '-'}</td>
                  <td style={td}>{inv.libelle || inv.description || '-'}</td>
                  <td style={td}>{inv.magasin || inv.magasinId || '-'}</td>
                  <td style={td}>{formatDate(inv.date || inv.createdAt)}</td>
                  <td style={td}>{inv.statut || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
