import { useMemo } from 'react';
import { useLiveData } from '../hooks/useLiveData';
import { getMagasins } from '../constants/magasins';
import { Package, Eye, AlertTriangle, XCircle, Wallet } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';
import type { MontageBon } from './AtelierMontageTab';
import { OPTIC_TABLES, OPTIC_STORAGE_KEY } from './lentillesOpticData';
import type { Cell as OpticCell } from './lentillesOpticData';

type OpticOverrides = Record<string, Record<string, Record<string, OpticCell>>>;

// Agrège le stock « Lentilles OPTIC » (les 4 tableaux) : restant, faibles, ruptures.
function totauxOptic(overrides: OpticOverrides) {
  let restant = 0, faibles = 0, ruptures = 0;
  const alertes: { id: string; type: string; ref: string; stock: number; seuil: number; niveau: string }[] = [];
  for (const table of OPTIC_TABLES) {
    for (const row of table.rows) {
      for (const col of table.cols) {
        const cell: OpticCell = overrides[table.id]?.[row]?.[col] ?? table.seed[row]?.[col] ?? [0, 0];
        const [i, m] = cell;
        const r = i - m;
        restant += Math.max(0, r);
        if (i > 0) {
          if (r <= 0) { ruptures++; alertes.push({ id: `${table.id}-${row}-${col}`, type: 'Lentille', ref: `${table.label} · ${row} / ${col}`, stock: Math.max(0, r), seuil: 2, niveau: 'Rupture' }); }
          else if (r <= 2) { faibles++; alertes.push({ id: `${table.id}-${row}-${col}`, type: 'Lentille', ref: `${table.label} · ${row} / ${col}`, stock: r, seuil: 2, niveau: 'Stock bas' }); }
        }
      }
    }
  }
  return { restant, faibles, ruptures, alertes };
}

/**
 * Tableau de bord du montage / stock atelier.
 *
 * KPI (cartes) : verres en stock, lentilles en stock, articles faibles, articles
 * en rupture, valeur du stock. Graphiques : évolution du stock (6 mois),
 * entrées/sorties du mois, produits les plus vendus, alertes de stock.
 *
 * Toutes les valeurs sont calculées à partir des données réelles de l'app
 * (catalogues verres/lentilles, bons de montage, ventes par magasin).
 */

const VERRES_KEY = 'leclaire_global_verres';

const fmt = (n: number) => n.toLocaleString('fr-FR');
const fmtFCFA = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function moisKey(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Les 6 derniers mois (clés + libellés) du plus ancien au plus récent.
function derniersMois(n = 6): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MOIS_COURTS[d.getMonth()] });
  }
  return out;
}

const card: React.CSSProperties = { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px', borderLeft: `5px solid ${color}` }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937' }}>{value}</div>
      </div>
    </div>
  );
}

const chartTitle: React.CSSProperties = { fontSize: '15px', fontWeight: 700, color: '#2c3e50', marginBottom: '12px' };

// ── Cartes KPI (affichées à côté de la barre latérale) ───────────────────────
export function AtelierMontageKpis({ bons: _bons }: { bons?: MontageBon[] }) {
  const [verres] = useLiveData<any>(VERRES_KEY, []);
  const [optic] = useLiveData<OpticOverrides>(OPTIC_STORAGE_KEY, {} as any);

  const kpis = useMemo(() => {
    const opt = totauxOptic((optic || {}) as OpticOverrides);
    const stockVerres = verres.reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0);
    const stockLentilles = opt.restant;
    let faibles = opt.faibles, ruptures = opt.ruptures, valeur = 0;
    for (const it of verres) {
      const stock = Number(it.stock) || 0;
      const seuil = Number(it.seuil) || 0;
      const prix = Number(it.prix) || 0;
      if (stock <= 0) ruptures++;
      else if (seuil > 0 && stock <= seuil) faibles++;
      valeur += stock * prix;
    }
    return { stockVerres, stockLentilles, faibles, ruptures, valeur };
  }, [verres, optic]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
      <KpiCard icon={<Package size={24} />} label="Verres en stock" value={fmt(kpis.stockVerres)} color="#2563eb" />
      <KpiCard icon={<Eye size={24} />} label="Lentilles en stock" value={fmt(kpis.stockLentilles)} color="#0891b2" />
      <KpiCard icon={<AlertTriangle size={24} />} label="Articles faibles" value={fmt(kpis.faibles)} color="#f39c12" />
      <KpiCard icon={<XCircle size={24} />} label="Articles en rupture" value={fmt(kpis.ruptures)} color="#e74c3c" />
      <KpiCard icon={<Wallet size={24} />} label="Valeur du stock" value={fmtFCFA(kpis.valeur)} color="#16a34a" />
    </div>
  );
}

// ── Graphiques (affichés en pleine largeur, sous la barre latérale) ──────────
export function AtelierMontageCharts({ bons }: { bons: MontageBon[] }) {
  const [verres] = useLiveData<any>(VERRES_KEY, []);
  const [optic] = useLiveData<OpticOverrides>(OPTIC_STORAGE_KEY, {} as any);

  const opt = useMemo(() => totauxOptic((optic || {}) as OpticOverrides), [optic]);

  const kpis = useMemo(() => {
    const stockVerres = verres.reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0);
    const stockLentilles = opt.restant;
    return { stockVerres, stockLentilles };
  }, [verres, opt]);

  // ── Entrées / sorties par mois (à partir des bons) ──────────────────────────
  const mouvementsMensuels = useMemo(() => {
    const mois = derniersMois(6);
    const map = new Map(mois.map(m => [m.key, { mois: m.label, entrees: 0, sorties: 0 }]));
    for (const b of bons) {
      const kIn = moisKey(b.dateEntreeAtelier);
      const kOut = moisKey(b.dateRetourMagasin);
      if (kIn && map.has(kIn)) map.get(kIn)!.entrees++;
      if (kOut && map.has(kOut)) map.get(kOut)!.sorties++;
    }
    return mois.map(m => map.get(m.key)!);
  }, [bons]);

  // Mois courant (pour les deux KPI graphiques dédiés).
  const moisCourant = mouvementsMensuels[mouvementsMensuels.length - 1] || { entrees: 0, sorties: 0 };

  // ── Évolution du stock (cumul net des mouvements, ancré sur le stock actuel) ─
  const evolutionStock = useMemo(() => {
    const stockActuel = kpis.stockVerres + kpis.stockLentilles;
    // On part du stock actuel et on remonte le temps : stock(mois) = stock(mois+1) - net(mois+1).
    const net = mouvementsMensuels.map(m => m.entrees - m.sorties);
    const series = mouvementsMensuels.map(m => ({ mois: m.mois, stock: 0 }));
    let running = stockActuel;
    for (let i = series.length - 1; i >= 0; i--) {
      series[i].stock = Math.max(0, running);
      running -= net[i];
    }
    return series;
  }, [mouvementsMensuels, kpis.stockVerres, kpis.stockLentilles]);

  // ── Produits les plus vendus (ventes réelles tous magasins) ─────────────────
  const topProduits = useMemo(() => {
    const magasins = getMagasins();
    const parProduit = new Map<string, number>();
    for (const mag of magasins) {
      const lots: any[] = [];
      try { lots.push(...JSON.parse(localStorage.getItem(`leclaire_ventes_${mag.id}`) || '[]')); } catch {}
      try { lots.push(...JSON.parse(localStorage.getItem(`leclaire_vente_flash_${mag.id}`) || '[]')); } catch {}
      for (const v of lots) {
        for (const art of (v.articles || [])) {
          const nom = (art.designation || '').trim();
          if (!nom) continue;
          parProduit.set(nom, (parProduit.get(nom) || 0) + (parseFloat(art.quantite) || 1));
        }
      }
    }
    return Array.from(parProduit.entries())
      .map(([nom, qte]) => ({ nom: nom.length > 22 ? nom.slice(0, 22) + '…' : nom, qte }))
      .sort((a, b) => b.qte - a.qte)
      .slice(0, 6);
  }, []);

  // ── Alertes (articles faibles / rupture) ────────────────────────────────────
  const alertes = useMemo(() => {
    const verresAlertes = verres
      .map((it: any) => {
        const stock = Number(it.stock) || 0;
        const seuil = Number(it.seuil) || 0;
        const niveau = stock <= 0 ? 'Rupture' : seuil > 0 && stock <= seuil ? 'Stock bas' : null;
        return niveau ? { id: it.id, type: 'Verre', ref: it.reference || it.designation || it.codeBarre || '-', stock, seuil, niveau } : null;
      })
      .filter(Boolean) as any[];
    return [...verresAlertes, ...opt.alertes]
      .sort((a: any, b: any) => (a.niveau === 'Rupture' ? -1 : 1) - (b.niveau === 'Rupture' ? -1 : 1))
      .slice(0, 12);
  }, [verres, opt]);

  const PIE_COLORS = ['#2563eb', '#16a34a', '#f39c12', '#8e44ad', '#e74c3c', '#0891b2'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Évolution du stock */}
      <div style={card}>
        <div style={chartTitle}>Évolution du stock (6 derniers mois)</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={evolutionStock} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" />
            <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Line type="monotone" dataKey="stock" name="Stock" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Entrées / sorties du mois */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <div style={card}>
          <div style={chartTitle}>Entrées du mois : {moisCourant.entrees}</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mouvementsMensuels} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" />
              <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="entrees" name="Entrées" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <div style={chartTitle}>Sorties du mois : {moisCourant.sorties}</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mouvementsMensuels} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" />
              <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="sorties" name="Sorties" fill="#e74c3c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Produits les plus vendus + Alertes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <div style={card}>
          <div style={chartTitle}>Produits les plus vendus</div>
          {topProduits.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucune vente enregistrée</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={topProduits} dataKey="qte" nameKey="nom" cx="50%" cy="50%" outerRadius={90} label={(e: any) => e.qte}>
                  {topProduits.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${fmt(v)} unités`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={card}>
          <div style={chartTitle}>Alertes de stock ({alertes.length})</div>
          {alertes.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>✅ Aucune alerte — stocks OK</div>
          ) : (
            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              {alertes.map((a: any) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ backgroundColor: a.niveau === 'Rupture' ? '#e74c3c' : '#f39c12', color: '#fff', borderRadius: '10px', padding: '2px 10px', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{a.niveau}</span>
                  <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>{a.type}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.ref}</span>
                  <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>Stock {a.stock} / Seuil {a.seuil}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
