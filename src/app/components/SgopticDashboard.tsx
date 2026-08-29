import { useMemo, useState, type ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from 'recharts';

// ── Type minimal attendu pour une vente / un règlement ────────────────────────
export interface SgopticVente {
  type?: string; date?: string; total_net?: number; totalNet?: number;
  total_brut?: number; total?: number; recap?: any; bons_assurance?: any[]; statut?: string;
}
export interface SgopticReglement { montant?: number; date?: string }

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
const MONTHS_FR_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const C_CA = '#5b9bd5';
const C_PAY = '#4caf82';
const C_BONS = '#f0ad4e';
const C_RESTANT = '#d9534f';
const C_OBJECTIF = '#9b30d6';
const C_TEAL = '#2b8fb0';

const fmtMoney = (n: number) =>
  'F CFA ' + (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => (Number(n) || 0).toLocaleString('fr-FR');
const fmtAxis = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
const fmtPct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;

const venteAmount = (v: any) => Number(v?.total_net ?? v?.totalNet ?? v?.total_brut ?? v?.total ?? 0) || 0;
const bonsAmount = (v: any) =>
  Array.isArray(v?.bons_assurance)
    ? v.bons_assurance.reduce((s: number, b: any) => s + (Number(b?.montant ?? b?.total ?? b?.montantAssurance ?? 0) || 0), 0)
    : 0;

function Sparkline({ data, color = '#ffffff' }: { data: number[]; color?: string }) {
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={rows} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function KpiCard({ square, value, label }: { square?: string; value: string; label: string }) {
  return (
    <div className="bg-white rounded shadow-sm px-4 py-3 flex items-center gap-3 border border-gray-100">
      {square && <div className="w-11 h-11 rounded flex-shrink-0" style={{ backgroundColor: square }} />}
      <div className="min-w-0">
        <div className="font-bold text-gray-800 leading-tight break-words">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

function SideStat({ title, pct, value, spark }: { title: string; pct: string; value: string; spark: number[] }) {
  return (
    <div className="rounded p-4 text-white" style={{ backgroundColor: C_TEAL }}>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{title}</span>
        <span className="text-xs opacity-90">{pct}</span>
      </div>
      <div className="flex items-end justify-between gap-2 mt-1">
        <span className="text-lg font-bold">{value}</span>
        <div className="w-24"><Sparkline data={spark} /></div>
      </div>
    </div>
  );
}

interface Props {
  title: string;
  ventes: SgopticVente[];
  reglements: SgopticReglement[];
  objectif?: number;
  tauxMarge?: number;
  /** Contrôles additionnels (ex : filtre magasin) rendus à droite du bandeau STATISTIQUES. */
  headerControls?: ReactNode;
}

export function SgopticDashboard({ title, ventes, reglements, objectif = 0, tauxMarge = 0.4, headerControls }: Props) {
  const now = new Date();
  const [selYear, setSelYear] = useState<number>(now.getFullYear());
  const [selMonth, setSelMonth] = useState<number>(now.getMonth());

  const data = useMemo(() => {
    const dateOf = (s: any) => { const d = new Date(s || 0); return isNaN(d.getTime()) ? null : d; };
    const today = new Date();
    const isToday = (d: Date | null) =>
      !!d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

    const realSales = ventes.filter(v => (v.type || 'vente') === 'vente');
    const devis = ventes.filter(v => v.type === 'devis');

    // ── STATISTIQUES DU JOUR ──────────────────────────────────────────────────
    let caToday = 0, bonsToday = 0, payToday = 0, factToday = 0, devisToday = 0;
    for (const v of realSales) {
      if (!isToday(dateOf(v.date))) continue;
      caToday += venteAmount(v); bonsToday += bonsAmount(v); factToday += 1;
    }
    for (const v of devis) { if (isToday(dateOf(v.date))) devisToday += 1; }
    for (const r of reglements) { if (isToday(dateOf(r.date))) payToday += Number(r.montant) || 0; }
    const pctRealiseToday = objectif > 0 ? (caToday / objectif) * 100 : 0;

    // ── Agrégats mensuels sur l'année sélectionnée ────────────────────────────
    const zero = () => Array.from({ length: 12 }, () => 0);
    const caM = zero(), payM = zero(), bonsM = zero(), factCountM = zero(), devisCountM = zero();
    for (const v of realSales) {
      const d = dateOf(v.date); if (!d || d.getFullYear() !== selYear) continue;
      const m = d.getMonth(); caM[m] += venteAmount(v); bonsM[m] += bonsAmount(v); factCountM[m] += 1;
    }
    for (const v of devis) {
      const d = dateOf(v.date); if (!d || d.getFullYear() !== selYear) continue;
      devisCountM[d.getMonth()] += 1;
    }
    for (const r of reglements) {
      const d = dateOf(r.date); if (!d || d.getFullYear() !== selYear) continue;
      payM[d.getMonth()] += Number(r.montant) || 0;
    }
    const restantM = caM.map((ca, i) => Math.max(ca - payM[i] - bonsM[i], 0));

    // ── Données journalières du mois sélectionné ──────────────────────────────
    const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
    const dayData = Array.from({ length: daysInMonth }, (_, i) => ({ jour: i + 1, ca: 0, paiements: 0, bons: 0, restant: 0 }));
    for (const v of realSales) {
      const d = dateOf(v.date); if (!d || d.getFullYear() !== selYear || d.getMonth() !== selMonth) continue;
      const idx = d.getDate() - 1;
      if (dayData[idx]) { dayData[idx].ca += venteAmount(v); dayData[idx].bons += bonsAmount(v); }
    }
    for (const r of reglements) {
      const d = dateOf(r.date); if (!d || d.getFullYear() !== selYear || d.getMonth() !== selMonth) continue;
      const idx = d.getDate() - 1;
      if (dayData[idx]) dayData[idx].paiements += Number(r.montant) || 0;
    }
    dayData.forEach(dd => { (dd as any).restant = Math.max(dd.ca - dd.paiements - dd.bons, 0); });

    // ── Cumuls annuels + variations ───────────────────────────────────────────
    const caYear = caM.reduce((a, b) => a + b, 0);
    const payYear = payM.reduce((a, b) => a + b, 0);
    const bonsYear = bonsM.reduce((a, b) => a + b, 0);
    const restantYear = Math.max(caYear - payYear - bonsYear, 0);
    const avoirPlusYear = Math.max(0, payYear + bonsYear - caYear);
    const avoirMoinsYear = restantYear;
    const prevCA = selMonth > 0 ? caM[selMonth - 1] : 0;
    const caMonth = caM[selMonth];
    const payMonth = payM[selMonth];
    const bonsMonth = bonsM[selMonth];
    const caChange = prevCA > 0 ? ((caMonth - prevCA) / prevCA) * 100 : (caMonth > 0 ? 100 : 0);
    const payPct = caYear > 0 ? (payYear / caYear) * 100 : 0;
    const restantPct = caYear > 0 ? (restantYear / caYear) * 100 : 0;
    const avoirPlusMonth = Math.max(0, payMonth + bonsMonth - caMonth);
    const avoirMoinsMonth = Math.max(0, caMonth - payMonth - bonsMonth);
    const monthPctRealise = objectif > 0 ? (caMonth / objectif) * 100 : 0;
    const sparkUpTo = (arr: number[]) => arr.slice(Math.max(0, selMonth - 5), selMonth + 1);

    // ── Activité annuelle ─────────────────────────────────────────────────────
    const annualData = MONTHS_FR.map((mois, i) => ({ mois, ca: caM[i], paiements: payM[i], bons: bonsM[i], restant: restantM[i] }));
    const annualTable = MONTHS_FR_LONG
      .map((mois, i) => ({ mois, ca: caM[i], marge: Math.round(caM[i] * tauxMarge) }))
      .sort((a, b) => b.ca - a.ca);

    // ── Informations devis ────────────────────────────────────────────────────
    const inSel = (v: any) => { const d = dateOf(v.date); return d && d.getFullYear() === selYear && d.getMonth() === selMonth; };
    const devisMonthList = devis.filter(inSel);
    const factMonthList = realSales.filter(inSel);
    const abandons = devisMonthList.filter(v => String(v.statut || '').toLowerCase().includes('abandon')).length;
    const devisCount = devisMonthList.length;
    const factCount = factMonthList.length;
    const totalDevisInfo = devisCount + factCount + abandons;
    const devisPie = [
      { name: 'Factures', value: factCount, color: '#2ecc40' },
      { name: 'Devis', value: devisCount, color: '#d4d400' },
      { name: 'Abandons', value: abandons, color: '#e11d48' },
    ].filter(d => d.value > 0);

    const workloadData = MONTHS_FR.map((mois, i) => ({ mois, factures: factCountM[i], devis: devisCountM[i] }));
    const totalDevisYear = devisCountM.reduce((a, b) => a + b, 0);
    const totalFactYear = factCountM.reduce((a, b) => a + b, 0);

    return {
      dayData, annualData, annualTable, devisPie, workloadData,
      caToday, payToday, bonsToday, factToday, devisToday, pctRealiseToday,
      caYear, payYear, bonsYear, restantYear, avoirPlusYear, avoirMoinsYear,
      caMonth, payMonth, bonsMonth, avoirPlusMonth, avoirMoinsMonth,
      caChange, payPct, restantPct, monthPctRealise,
      sparkCA: sparkUpTo(caM), sparkPay: sparkUpTo(payM), sparkRestant: sparkUpTo(restantM),
      totalDevisInfo, factCount, devisCount, abandons, totalDevisYear, totalFactYear,
    };
  }, [ventes, reglements, selYear, selMonth, objectif, tauxMarge]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const todayStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const panel = 'bg-white rounded-lg shadow-sm border border-gray-100';

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
      {/* ═══════ SECTION 1 : STATISTIQUES + ACTIVITÉ MENSUELLE ═══════ */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h1 className="font-bold text-gray-800">STATISTIQUES {title} : {todayStr} (chiffres du jour)</h1>
          {headerControls}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard square={C_OBJECTIF} value={fmtMoney(objectif)} label="Objectif" />
          <KpiCard square={C_CA} value={fmtMoney(data.caToday)} label="Chiffre d'Affaires (jour)" />
          <KpiCard value="Pourcentage Réalisé" label={fmtPct(data.pctRealiseToday)} />
          <KpiCard value={`Facture (${data.factToday})`} label={`Devis | Proforma (${data.devisToday})`} />
          <KpiCard square={C_PAY} value={fmtMoney(data.payToday)} label="Règlements (jour)" />
          <KpiCard square={C_BONS} value={fmtMoney(data.bonsToday)} label="Bon Assurance (jour)" />
        </div>
      </div>

      <div className={`${panel} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-gray-700 uppercase tracking-wide">Activité Mensuelle</h2>
          <div className="flex items-center gap-2">
            <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
              {MONTHS_FR_LONG.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={data.dayData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="jour" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} allowDecimals={false} domain={[0, (dm: number) => Math.max(dm, 1)]} />
                <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ca" name="Chiffre d'Affaires" fill={C_CA} />
                <Bar dataKey="paiements" name="Paiements Clients" fill={C_PAY} />
                <Bar dataKey="bons" name="Bons Assurance" fill={C_BONS} />
                <Bar dataKey="restant" name="Montant Restant" fill={C_RESTANT} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3">
            <SideStat title="Objectif" pct={fmtPct(data.monthPctRealise)} value={fmtInt(objectif)} spark={data.sparkCA} />
            <SideStat title="Chiffre d'Affaires" pct={`${data.caChange >= 0 ? '+' : ''}${data.caChange.toFixed(2)}%`} value={fmtInt(data.caYear)} spark={data.sparkCA} />
            <SideStat title="Total Paiements" pct={fmtPct(data.payPct)} value={fmtInt(data.payYear)} spark={data.sparkPay} />
            <SideStat title="Montant Restant" pct={fmtPct(data.restantPct)} value={fmtInt(data.restantYear)} spark={data.sparkRestant} />
            <SideStat title="AVOIR CLIENT +" pct="" value={fmtInt(data.avoirPlusYear)} spark={[]} />
            <SideStat title="AVOIR CLIENT −" pct="" value={fmtInt(data.avoirMoinsYear)} spark={[]} />
          </div>
        </div>
      </div>

      {/* ═══════ SECTION 2 : ACTIVITÉ ANNUELLE ═══════ */}
      <div className={`${panel} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-gray-700 uppercase tracking-wide">Activité Annuelle</h2>
          <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={data.annualData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} allowDecimals={false} domain={[0, (dm: number) => Math.max(dm, 1)]} />
                <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ca" name="Chiffre d'Affaires" fill={C_CA} />
                <Bar dataKey="paiements" name="Paiements Clients" fill={C_PAY} />
                <Bar dataKey="bons" name="Bons Assurance" fill={C_BONS} />
                <Bar dataKey="restant" name="Montant Restant" fill={C_RESTANT} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#e9eef2' }}>
                  <th className="text-left px-3 py-2 text-gray-600 font-semibold">Mois</th>
                  <th className="text-right px-3 py-2 text-gray-600 font-semibold">Chiffre d'Affaires</th>
                  <th className="text-right px-3 py-2 text-gray-600 font-semibold">Marge est.</th>
                </tr>
              </thead>
              <tbody>
                {data.annualTable.map((row, i) => (
                  <tr key={row.mois} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f6f9fb' }}>
                    <td className="px-3 py-2 font-medium text-gray-700">{row.mois}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmtInt(row.ca)}</td>
                    <td className="px-3 py-2 text-right text-green-600">{fmtInt(row.marge)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════ SECTION 3 : INFORMATIONS DEVIS + RAPPROCHEMENT ═══════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={`${panel} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-gray-700 uppercase tracking-wide">Informations Devis</h2>
            <div className="flex items-center gap-2">
              <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
                className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
                {MONTHS_FR_LONG.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
                className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              { n: data.totalDevisInfo, l: 'Total' },
              { n: data.factCount, l: 'Factures' },
              { n: data.devisCount, l: 'Devis' },
              { n: data.abandons, l: 'Abandons' },
            ].map(c => (
              <div key={c.l} className="bg-gray-50 border border-gray-200 rounded text-center py-2">
                <div className="font-bold text-gray-800">{c.n}</div>
                <div className="text-xs text-gray-500">{c.l}</div>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.devisPie.length ? data.devisPie : [{ name: 'Aucune donnée', value: 1, color: '#cbd5e1' }]}
                cx="50%" cy="50%" outerRadius={95} dataKey="value" isAnimationActive={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`} labelLine={false}>
                {(data.devisPie.length ? data.devisPie : [{ name: 'Aucune donnée', value: 1, color: '#cbd5e1' }])
                  .map((e, i) => <Cell key={`devis-${i}`} fill={(e as any).color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={`${panel} p-4`}>
          <h2 className="font-semibold text-gray-700 uppercase tracking-wide mb-4">
            (Évaluation Charge de Travail) Rapprochement Vente / Devis — {selYear}
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="border border-gray-200 rounded px-3 py-2">
              <div className="font-bold text-gray-800">{data.totalDevisYear}</div>
              <div className="text-xs text-gray-500">Devis</div>
            </div>
            <div className="border border-gray-200 rounded px-3 py-2">
              <div className="font-bold text-gray-800">{data.totalFactYear}</div>
              <div className="text-xs text-gray-500">Factures</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.workloadData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, (dm: number) => Math.max(dm, 1)]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="factures" name="Factures" stroke="#2ecc40" fill="#2ecc40" fillOpacity={0.25} />
              <Area type="monotone" dataKey="devis" name="Devis" stroke="#c9c400" fill="#d4d400" fillOpacity={0.35} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
