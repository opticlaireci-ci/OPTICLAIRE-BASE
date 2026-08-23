import { useMemo, useState } from 'react';
import { useLiveData } from '../hooks/useLiveData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, RadialBarChart, RadialBar,
} from 'recharts';
import type { VenteSupabase } from '../services/ventesService';
import type { ReglementSupabase } from '../services/reglementsService';
import { LOGIN_SETTINGS_KEY, DEFAULT_LOGIN_SETTINGS } from '../constants/loginSettings';
import type { LoginSettings } from '../constants/loginSettings';
import { ModeFestifPanel } from './ModeFestifPanel';
import { TENANT } from '../config/tenant';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MagasinRef { id: string; label: string }
interface Props {
  ventes: VenteSupabase[];
  reglements: ReglementSupabase[];
  magasins: MagasinRef[];
  objectifGlobal: number;
  objectifDe: (magasinId: string) => number;
  tauxMarge: number;
}

// ── Constantes visuelles (alignées sur sgoptic.net) ───────────────────────────
const MOIS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_SHORT = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sept', 'Oct', 'Nov', 'Dec'];

const C_OBJECTIF = '#9b30d6';
const C_CA = '#5b9bd5';
const C_PAY = '#4caf82';
const C_BONS = '#f0ad4e';
const C_AVOIR_P = '#8fd18f';
const C_AVOIR_M = '#ef8a6d';
const C_RESTANT = '#d9534f';
const C_NAVY = '#1e3a52';
const C_VERRE = '#ef8a6d';
const C_TRAIT = '#2ecc40';
const C_MONT = '#5c1f1f';
const C_ACC = '#0e7c9e';
const C_SERV = '#e01e8a';

const fmtInt = (n: number) => Math.round(Number(n) || 0).toLocaleString('fr-FR');
const fmtMoney = (n: number) => 'F CFA ' + (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAxis = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(0)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n));
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

const dateOf = (s: any) => { const d = new Date(s || 0); return isNaN(d.getTime()) ? null : d; };
const venteBrut = (v: any) => Number(v?.total_brut ?? v?.total_net ?? 0) || 0;
const venteNet = (v: any) => Number(v?.total_net ?? v?.total_brut ?? 0) || 0;
const bonsAmount = (v: any) =>
  Array.isArray(v?.bons_assurance)
    ? v.bons_assurance.reduce((s: number, b: any) =>
        s + (Number(b?.montantPrisEnCharge ?? b?.montant ?? b?.total ?? b?.montantAssurance ?? 0) || 0), 0)
    : 0;

function productTotals(v: any) {
  let verres = 0, montures = 0, accessoires = 0, traitements = 0, services = 0;
  for (const vv of v?.verres || []) {
    const od = vv?.oeilDroit || {}, og = vv?.oeilGauche || {};
    const ligne = Number(vv?.totalVerres) || 0;
    if (ligne > 0) { verres += ligne; continue; }
    verres += (Number(od.prix) || 0) * (Number(od.quantite) || 1) + (Number(og.prix) || 0) * (Number(og.quantite) || 1);
  }
  for (const a of v?.articles || []) {
    const t = Number(a?.total) || (Number(a?.prix) || 0) * (Number(a?.quantite) || 1);
    const type = String(a?.type || '').toLowerCase();
    if (type.includes('accessoire')) accessoires += t;
    else if (type.includes('traitement')) traitements += t;
    else if (type.includes('service')) services += t;
    else montures += t; // monture / autre
  }
  return { verres, montures, accessoires, traitements, services };
}

// Quantités vendues par type (pour les tableaux détaillés du Rapport Marge).
function productQtys(v: any) {
  let verres = 0, montures = 0, accessoires = 0;
  for (const vv of v?.verres || []) {
    const od = vv?.oeilDroit || {}, og = vv?.oeilGauche || {};
    const qd = Number(od.quantite) || (od.prix ? 1 : 0);
    const qg = Number(og.quantite) || (og.prix ? 1 : 0);
    verres += qd + qg;
    if (qd + qg === 0 && Number(vv?.totalVerres) > 0) verres += 1;
  }
  for (const a of v?.articles || []) {
    const q = Number(a?.quantite) || 1;
    const type = String(a?.type || '').toLowerCase();
    if (type.includes('accessoire')) accessoires += q;
    else if (type.includes('traitement') || type.includes('service')) { /* non compté ici */ }
    else montures += q; // monture / autre
  }
  return { verres, montures, accessoires };
}

// ── Bandeau de cellules colorées (répété dans plusieurs sections) ─────────────
function Band({ cells }: { cells: { value: string; label: string; bg: string; fg?: string }[] }) {
  return (
    <div className="flex flex-wrap rounded overflow-hidden mb-4">
      {cells.map((c, i) => (
        <div key={i} className="flex-1 min-w-[130px] px-4 py-3" style={{ backgroundColor: c.bg, color: c.fg || '#fff' }}>
          <div className="font-bold">{c.value}</div>
          <div className="text-sm font-semibold opacity-95">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children, controls }: { title: string; children: React.ReactNode; controls?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-bold text-gray-800 uppercase tracking-wide text-sm">{title}</h2>
        {controls}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ square, value, label }: { square?: string; value: string; label: string }) {
  return (
    <div className="bg-gray-50 rounded shadow-sm px-4 py-3 flex items-center gap-3 border border-gray-200">
      {square && <div className="w-10 h-10 rounded flex-shrink-0" style={{ backgroundColor: square }} />}
      <div className="min-w-0">
        <div className="font-bold text-gray-800 leading-tight break-words">{value}</div>
        <div className="text-xs text-gray-500 whitespace-pre-line">{label}</div>
      </div>
    </div>
  );
}

// ── Panneau : personnalisation de la page de connexion ───────────────────────
function LoginSettingsPanel() {
  const [arr, save] = useLiveData<LoginSettings>(LOGIN_SETTINGS_KEY, [DEFAULT_LOGIN_SETTINGS] as any);
  const current: LoginSettings = { ...DEFAULT_LOGIN_SETTINGS, ...(arr?.[0] || {}) };
  const [draft, setDraft] = useState<LoginSettings | null>(null);
  const val = draft ?? current;
  const set = (patch: Partial<LoginSettings>) => setDraft({ ...val, ...patch });

  const enregistrer = () => { save([val] as any); setDraft(null); };
  const toggleNoel = () => { const next = { ...val, noelActif: !val.noelActif }; save([next] as any); setDraft(draft ? next : null); };

  const field = (label: string, key: keyof LoginSettings) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <input
        type="text"
        value={String(val[key] ?? '')}
        onChange={e => set({ [key]: e.target.value } as any)}
        className="px-3 py-2 rounded border border-gray-300 text-sm outline-none focus:border-blue-500"
      />
    </label>
  );

  return (
    <Panel title="Page de connexion — Personnalisation">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {field('Titre', 'titre')}
        {field('Sous-titre', 'sousTitre')}
        {field('Slogan', 'slogan')}
        {field('Pied de page', 'piedDePage')}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={enregistrer}
          disabled={!draft}
          className="px-4 py-2 rounded text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: '#1a56db' }}
        >
          Enregistrer les modifications
        </button>

        {/* Bouton Mode Noël : chapeau sur le logo + neige sur toute la page */}
        <button
          onClick={toggleNoel}
          className="px-4 py-2 rounded text-sm font-bold text-white flex items-center gap-2"
          style={{ backgroundColor: val.noelActif ? '#e11d2a' : '#6b7280' }}
        >
          {val.noelActif ? '🎅 Mode Noël : ACTIVÉ (cliquer pour désactiver)' : '🎄 Mode Noël : désactivé (cliquer pour activer)'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Le mode Noël ajoute un chapeau de Père Noël sur le logo et fait tomber la neige sur toute la page de connexion.
      </p>
    </Panel>
  );
}

// Tableau détaillé Commande / Vente d'un type de produit (Rapport Marge).
function MargeTable({ titre, cmdQte, cmdMontant, venteQte, venteMontant }: { titre: string; cmdQte: number; cmdMontant: number; venteQte: number; venteMontant: number }) {
  const total = venteMontant - cmdMontant;
  const margePct = venteMontant > 0 ? pct(total, venteMontant) : 0;
  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <div className="px-3 py-2 font-bold text-gray-700 border-b border-gray-200 uppercase text-sm">{titre}</div>
      {/* Ligne Commande */}
      <div className="flex items-center border-b border-gray-200">
        <div className="flex items-center gap-2 px-3 py-3 flex-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-white font-bold" style={{ backgroundColor: C_RESTANT, lineHeight: 1 }}>−</span>
          <span className="font-bold text-gray-700">Commande</span>
        </div>
        <div className="px-3 py-3 text-gray-700 whitespace-nowrap">Qte {fmtInt(cmdQte)}</div>
        <div className="px-3 py-3 text-right text-gray-700 w-24">{fmtInt(cmdMontant)}</div>
      </div>
      {/* Ligne Vente */}
      <div className="flex items-center border-b border-gray-200">
        <div className="flex items-center gap-2 px-3 py-3 flex-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-white font-bold" style={{ backgroundColor: C_TRAIT, lineHeight: 1 }}>+</span>
          <span className="font-bold text-gray-700">Vente</span>
        </div>
        <div className="px-3 py-3 text-gray-700 whitespace-nowrap">Qte {fmtInt(venteQte)}</div>
        <div className="px-3 py-3 text-right text-gray-700 w-24">{fmtInt(venteMontant)}</div>
      </div>
      {/* Pied : total + % */}
      <div className="flex items-center">
        <div className="px-3 py-3 flex-1 text-gray-700">{fmtInt(total)}</div>
        <div className="px-3 py-3 text-right text-gray-600 font-semibold whitespace-nowrap">{margePct.toFixed(0)} % / Total</div>
      </div>
    </div>
  );
}

export function AdminDashboard({ ventes, reglements, magasins, objectifGlobal, objectifDe, tauxMarge }: Props) {
  const now = new Date();
  const [commandes] = useLiveData<any>('leclaire_bons_commande');
  const [magasin, setMagasin] = useState<string>('__TOUS__');
  const [mois, setMois] = useState<number>(now.getMonth());
  const [annee, setAnnee] = useState<number>(now.getFullYear());
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const magSel = (
    <select value={magasin} onChange={e => setMagasin(e.target.value)}
      className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white font-medium">
      <option value="__TOUS__">Tous les Magasins</option>
      {magasins.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
    </select>
  );
  const moisSel = (
    <select value={mois} onChange={e => setMois(Number(e.target.value))}
      className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
      {MOIS_LONG.map((m, i) => <option key={m} value={i}>{m}</option>)}
    </select>
  );
  const anneeSel = (
    <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
      className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  const d = useMemo(() => {
    const filt = (v: any) => magasin === '__TOUS__' || v.magasin_id === magasin;
    const filtR = (r: any) => magasin === '__TOUS__' || r.magasin_id === magasin;
    const objectif = magasin === '__TOUS__' ? objectifGlobal : objectifDe(magasin);

    const ventesA = ventes.filter(filt);
    const reglementsA = reglements.filter(filtR);
    const realSales = ventesA.filter(v => (v.type || 'vente') === 'vente');
    const devisAll = ventesA.filter(v => v.type === 'devis');

    const today = now;
    const isToday = (x: Date | null) => !!x && x.getFullYear() === today.getFullYear() && x.getMonth() === today.getMonth() && x.getDate() === today.getDate();
    const inYear = (x: Date | null, y: number) => !!x && x.getFullYear() === y;
    const inMonth = (x: Date | null) => !!x && x.getFullYear() === annee && x.getMonth() === mois;

    // ── STATISTIQUES DU JOUR ──────────────────────────────────────────────────
    let caToday = 0, bonsToday = 0, payToday = 0, factToday = 0, devisToday = 0;
    for (const v of realSales) { if (isToday(dateOf(v.date))) { caToday += venteNet(v); bonsToday += bonsAmount(v); factToday++; } }
    for (const v of devisAll) { if (isToday(dateOf(v.date))) devisToday++; }
    for (const r of reglementsA) { if (isToday(dateOf(r.date))) payToday += Number(r.montant) || 0; }

    // ── Séries mensuelles (année sélectionnée) ────────────────────────────────
    const z = () => Array.from({ length: 12 }, () => 0);
    const caM = z(), payM = z(), bonsM = z(), factCntM = z(), devisCntM = z();
    for (const v of realSales) { const x = dateOf(v.date); if (inYear(x, annee)) { const m = x!.getMonth(); caM[m] += venteNet(v); bonsM[m] += bonsAmount(v); factCntM[m]++; } }
    for (const v of devisAll) { const x = dateOf(v.date); if (inYear(x, annee)) devisCntM[x!.getMonth()]++; }
    for (const r of reglementsA) { const x = dateOf(r.date); if (inYear(x, annee)) payM[x!.getMonth()] += Number(r.montant) || 0; }
    const restantM = caM.map((c, i) => Math.max(c - payM[i], 0));

    // ── Journalier (mois sélectionné) ─────────────────────────────────────────
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const dayData = Array.from({ length: nbJours }, (_, i) => ({ jour: i + 1, ca: 0, paiements: 0, bons: 0, restant: 0 }));
    for (const v of realSales) { const x = dateOf(v.date); if (inMonth(x)) { const i = x!.getDate() - 1; if (dayData[i]) { dayData[i].ca += venteNet(v); dayData[i].bons += bonsAmount(v); } } }
    for (const r of reglementsA) { const x = dateOf(r.date); if (inMonth(x)) { const i = x!.getDate() - 1; if (dayData[i]) dayData[i].paiements += Number(r.montant) || 0; } }
    dayData.forEach(dd => { dd.restant = Math.max(dd.ca - dd.paiements, 0); });

    // ── Cumuls année ──────────────────────────────────────────────────────────
    const caYear = caM.reduce((a, b) => a + b, 0);
    const payYear = payM.reduce((a, b) => a + b, 0);
    const bonsYear = bonsM.reduce((a, b) => a + b, 0);
    const restantYear = Math.max(caYear - payYear, 0);

    // ── Bandeau mensuel ───────────────────────────────────────────────────────
    const caMonth = caM[mois], payMonth = payM[mois], bonsMonth = bonsM[mois], restantMonth = restantM[mois];
    const annualMonths = MOIS_SHORT.map((m, i) => ({ mois: m, ca: caM[i], paiements: payM[i], bons: bonsM[i], restant: restantM[i], objectif: 0 }));

    // ── RAPPORT MARGE + produits (mois sélectionné) ───────────────────────────
    let brutMonth = 0, netMonth = 0, prod = { verres: 0, montures: 0, accessoires: 0, traitements: 0, services: 0 };
    const qteVente = { verres: 0, montures: 0, accessoires: 0 };
    for (const v of realSales) { const x = dateOf(v.date); if (!inMonth(x)) continue; brutMonth += venteBrut(v); netMonth += venteNet(v); const p = productTotals(v); prod.verres += p.verres; prod.montures += p.montures; prod.accessoires += p.accessoires; prod.traitements += p.traitements; prod.services += p.services; const q = productQtys(v); qteVente.verres += q.verres; qteVente.montures += q.montures; qteVente.accessoires += q.accessoires; }
    const remiseMonth = Math.max(brutMonth - netMonth, 0);
    const margeMonth = Math.round(netMonth * tauxMarge);
    const totalProduits = prod.verres + prod.montures + prod.accessoires + prod.traitements + prod.services;

    // ── COMMANDES (bons de commande fournisseur) du mois sélectionné ───────────
    // Les bons de commande ne portent pas d'identifiant magasin : ils sont donc
    // pris en compte quel que soit le magasin filtré. On agrège quantités et
    // coût d'achat par type d'article (monture / accessoire ; les verres ne sont
    // pas commandés via ce module → 0).
    const qteCmd = { verres: 0, montures: 0, accessoires: 0 };
    const coutCmd = { verres: 0, montures: 0, accessoires: 0 };
    for (const c of (Array.isArray(commandes) ? commandes : [])) {
      const x = dateOf(c?.dateCreation || c?.date);
      if (!inMonth(x)) continue;
      for (const it of (c?.items || [])) {
        const q = Number(it?.quantite) || 0;
        const montant = Number(it?.total) || (Number(it?.prixAchat) || 0) * q;
        const type = String(it?.type || '').toLowerCase();
        if (type.includes('accessoire')) { qteCmd.accessoires += q; coutCmd.accessoires += montant; }
        else { qteCmd.montures += q; coutCmd.montures += montant; } // monture / autre
      }
    }
    const coutMonth = coutCmd.verres + coutCmd.montures + coutCmd.accessoires;
    const margePct = brutMonth > 0 ? pct(brutMonth - coutMonth, brutMonth) : 0;

    // ── Objectif | CA : table marge (année) ───────────────────────────────────
    const margeTable = MOIS_LONG
      .map((m, i) => ({ mois: m, ca: caM[i], marge: Math.round(caM[i] * tauxMarge) }))
      .sort((a, b) => b.ca - a.ca);
    const objCA = MOIS_SHORT.map((m, i) => ({ mois: m, objectif: objectif / 12, ca: caM[i] }));

    // ── ACTIVITÉ ANNUELLE | Magasin (année) ───────────────────────────────────
    const byMag: Record<string, { ca: number; paiements: number; bons: number; restant: number }> = {};
    for (const m of magasins) byMag[m.id] = { ca: 0, paiements: 0, bons: 0, restant: 0 };
    for (const v of ventes.filter(v => (v.type || 'vente') === 'vente')) {
      const x = dateOf(v.date); if (!inYear(x, annee)) continue;
      const b = byMag[v.magasin_id]; if (!b) continue; b.ca += venteNet(v); b.bons += bonsAmount(v);
    }
    for (const r of reglements) { const x = dateOf(r.date); if (!inYear(x, annee)) continue; const b = byMag[r.magasin_id]; if (b) b.paiements += Number(r.montant) || 0; }
    const magData = magasins
      .map(m => ({ mag: m.label.replace(new RegExp(`^${TENANT.nom}\\s*`, 'i'), `${TENANT.nom} `), ...byMag[m.id], restant: Math.max(byMag[m.id].ca - byMag[m.id].paiements, 0) }))
      .filter(m => m.ca > 0 || m.paiements > 0)
      .sort((a, b) => b.ca - a.ca);
    const caGlobalYear = magasins.reduce((s, m) => s + byMag[m.id].ca, 0);
    const payGlobalYear = magasins.reduce((s, m) => s + byMag[m.id].paiements, 0);
    const bonsGlobalYear = magasins.reduce((s, m) => s + byMag[m.id].bons, 0);

    // ── Produit pie (mois) ────────────────────────────────────────────────────
    const prodPie = [
      { name: 'Verre', value: prod.verres, color: C_VERRE },
      { name: 'Traitement', value: prod.traitements, color: C_TRAIT },
      { name: 'Monture', value: prod.montures, color: C_MONT },
      { name: 'Accessoire', value: prod.accessoires, color: C_ACC },
      { name: 'Service', value: prod.services, color: C_SERV },
    ].filter(p => p.value > 0);

    // ── Évolution CA par année (5 ans) ────────────────────────────────────────
    const allReal = ventes.filter(v => (v.type || 'vente') === 'vente' && filt(v));
    const yearMap: Record<number, number> = {};
    for (const v of allReal) { const x = dateOf(v.date); if (x) yearMap[x.getFullYear()] = (yearMap[x.getFullYear()] || 0) + venteNet(v); }
    const yList = Object.keys(yearMap).map(Number).sort();
    const evolData = yList.map(y => ({ annee: String(y), ca: yearMap[y] }));
    const evolVals = evolData.map(e => e.ca);
    const evMin = evolVals.length ? Math.min(...evolVals) : 0;
    const evMax = evolVals.length ? Math.max(...evolVals) : 0;
    const evMoy = evolVals.length ? evolVals.reduce((a, b) => a + b, 0) / evolVals.length : 0;

    // ── Informations / Entreprise (année) ─────────────────────────────────────
    const entMap: Record<string, { clients: Set<string>; ca: number }> = {};
    for (const v of realSales) { const x = dateOf(v.date); if (!inYear(x, annee)) continue; const ent = (v.entreprise || '').trim(); if (!ent) continue; if (!entMap[ent]) entMap[ent] = { clients: new Set(), ca: 0 }; entMap[ent].clients.add(v.client || v.numero_client || ''); entMap[ent].ca += venteNet(v); }
    const entTable = Object.entries(entMap).map(([ent, o]) => ({ ent, clients: o.clients.size, ca: o.ca })).sort((a, b) => b.ca - a.ca).slice(0, 20);

    // ── Rapport Utilisateur (mois) ────────────────────────────────────────────
    const userMap: Record<string, { devisEnCours: number; devisFacture: number; devisAbandon: number; devisTotal: number; propositions: number; factures: number; valeurFactures: number }> = {};
    const getU = (name: string) => (userMap[name] ||= { devisEnCours: 0, devisFacture: 0, devisAbandon: 0, devisTotal: 0, propositions: 0, factures: 0, valeurFactures: 0 });
    for (const v of devisAll) { const x = dateOf(v.date); if (!inMonth(x)) continue; const u = getU(v.edite_par || 'Inconnu'); const st = String(v.statut || '').toLowerCase(); u.devisTotal++; u.propositions += venteNet(v); if (st.includes('abandon')) u.devisAbandon++; else if (st.includes('factur') || st.includes('valid')) u.devisFacture++; else u.devisEnCours++; }
    for (const v of realSales) { const x = dateOf(v.date); if (!inMonth(x)) continue; const u = getU(v.edite_par || 'Inconnu'); u.factures++; u.valeurFactures += venteNet(v); }
    const userTable = Object.entries(userMap).map(([nom, o]) => ({ nom, ...o })).sort((a, b) => b.valeurFactures - a.valeurFactures);

    const factCountMonth = realSales.filter(v => inMonth(dateOf(v.date))).length;
    const devisCountMonth = devisAll.filter(v => inMonth(dateOf(v.date))).length;
    const abandonMonth = devisAll.filter(v => inMonth(dateOf(v.date)) && String(v.statut || '').toLowerCase().includes('abandon')).length;
    const factDevisPie = [
      { name: 'Factures', value: factCountMonth, color: '#2ecc40' },
      { name: 'Devis', value: devisCountMonth, color: '#d4d400' },
      { name: 'Abandons', value: abandonMonth, color: '#e11d48' },
    ].filter(p => p.value > 0);
    const valeurFacturesMonth = realSales.filter(v => inMonth(dateOf(v.date))).reduce((s, v) => s + venteNet(v), 0);
    const propositionsMonth = devisAll.filter(v => inMonth(dateOf(v.date))).reduce((s, v) => s + venteNet(v), 0);

    return {
      objectif,
      caToday, bonsToday, payToday, factToday, devisToday,
      dayData, annualMonths, caMonth, payMonth, bonsMonth, restantMonth,
      caYear, payYear, bonsYear, restantYear,
      brutMonth, netMonth, remiseMonth, margeMonth, prod, totalProduits, coutMonth, margePct, qteVente, qteCmd, coutCmd,
      margeTable, objCA,
      magData, caGlobalYear, payGlobalYear, bonsGlobalYear,
      prodPie,
      evolData, evMin, evMax, evMoy,
      entTable, userTable,
      factCountMonth, devisCountMonth, abandonMonth, factDevisPie, valeurFacturesMonth, propositionsMonth,
    };
  }, [ventes, reglements, commandes, magasins, magasin, mois, annee, objectifGlobal, objectifDe, tauxMarge]);

  const todayStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const pctRealiseToday = pct(d.caToday, d.objectif).toFixed(0);
  const restantGlobal = Math.max(d.caYear - d.payYear, 0);
  const gaugeData = [
    { name: 'Objectif', value: d.objectif, fill: C_OBJECTIF },
    { name: "Chiffre d'Affaires", value: d.caYear, fill: C_CA },
    { name: 'Paiements', value: d.payYear, fill: C_PAY },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" style={{ backgroundColor: '#eef2f4', minHeight: '100vh' }}>
      {/* 0 ── PAGE DE CONNEXION (personnalisation) ─────────────────────────── */}
      <LoginSettingsPanel />

      {/* 0bis ── MODE FESTIF (moments de l'année) ───────────────────────────── */}
      <ModeFestifPanel />

      {/* 1 ── STATISTIQUES ─────────────────────────────────────────────────── */}
      <Panel title={`STATISTIQUES : ${todayStr} (chiffres du jour)`} controls={magSel}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard square={C_OBJECTIF} value={fmtMoney(d.objectif)} label="Objectif" />
          <KpiCard square={C_CA} value={fmtMoney(d.caToday)} label="Chiffre d'Affaires" />
          <KpiCard value="Pourcentage Réalisé" label={`${pctRealiseToday}%`} />
          <KpiCard value={`Facture (${d.factToday})`} label={`Devis | Proforma (${d.devisToday})`} />
          <KpiCard square={C_PAY} value={fmtMoney(d.payToday)} label="Règlements" />
          <KpiCard square={C_BONS} value={fmtMoney(d.bonsToday)} label="Bon Assurance" />
        </div>
      </Panel>

      {/* 2 ── ACTIVITÉ MENSUELLE ───────────────────────────────────────────── */}
      <Panel title="Activité Mensuelle" controls={<div className="flex gap-2">{magSel}{moisSel}{anneeSel}</div>}>
        <Band cells={[
          { value: fmtInt(d.objectif), label: 'Objectif', bg: C_OBJECTIF },
          { value: fmtInt(d.caMonth), label: "Chiffre d'Affaires", bg: C_CA },
          { value: fmtInt(d.payMonth), label: 'Paiements Clients', bg: C_PAY },
          { value: fmtInt(d.bonsMonth), label: 'Bons Assurance', bg: C_BONS },
          { value: '0', label: 'AVOIR-CLIENT +', bg: C_AVOIR_P, fg: '#1e3a52' },
          { value: '0', label: 'AVOIR-CLIENT -', bg: C_AVOIR_M },
          { value: fmtInt(d.restantMonth), label: 'Montant Restant', bg: C_RESTANT },
        ]} />
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={d.dayData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="jour" tick={{ fontSize: 10 }} interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />
            <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar key="ca" dataKey="ca" name="Chiffre d'Affaires" fill={C_CA} />
            <Bar key="paiements" dataKey="paiements" name="Paiements Clients" fill={C_PAY} />
            <Bar key="bons" dataKey="bons" name="Bons Assurance" fill={C_BONS} />
            <Bar key="restant" dataKey="restant" name="Montant Restant" fill={C_RESTANT} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* 3 ── RAPPORT MARGE ────────────────────────────────────────────────── */}
      <Panel title="Rapport Marge" controls={<div className="flex gap-2">{magSel}{moisSel}{anneeSel}</div>}>
        <p className="text-sm text-gray-600 italic mb-4 max-w-3xl">
          Veuillez noter que le rapport sur les marges est généré en utilisant la moyenne du prix d'achat pour chaque
          Monture ou Accessoire, dans les cas où celui-ci a plusieurs prix d'achat.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Carte coût / marge / remise */}
          <div className="lg:col-span-6">
            <div className="flex rounded-t overflow-hidden">
              <div className="flex-1 px-4 py-8 font-bold" style={{ backgroundColor: C_RESTANT, color: '#1a1a1a' }}>{fmtInt(d.coutMonth)}</div>
              <div className="flex-1 px-4 py-8 font-bold" style={{ backgroundColor: C_PAY, color: '#1a1a1a' }}>{fmtInt(d.brutMonth)}</div>
            </div>
            <div className="px-4 py-6 text-white font-bold rounded-b" style={{ backgroundColor: C_NAVY }}>REMISE {fmtInt(d.remiseMonth)}</div>
          </div>
          {/* Colonne centrale : pourcentage + total net */}
          <div className="lg:col-span-3 text-center">
            <div className="font-bold text-gray-800 text-lg">{d.margePct.toFixed(0)} %</div>
            <div className="border-t border-gray-300 my-4" />
            <div className="font-bold text-gray-800">= {fmtInt(d.netMonth)}</div>
          </div>
          {/* Colonne droite : répartition par type de produit */}
          <div className="lg:col-span-3 space-y-2">
            {[
              { l: 'VERRES', v: pct(d.prod.verres, d.totalProduits) },
              { l: 'MONTURES', v: pct(d.prod.montures, d.totalProduits) },
              { l: 'ACCESSOIRES', v: pct(d.prod.accessoires, d.totalProduits) },
            ].map(r => (
              <div key={r.l}>
                <div className="flex justify-between text-xs font-semibold text-gray-600"><span>{r.l}</span><span>{r.v.toFixed(0)}%</span></div>
                <div className="h-1.5 bg-gray-200 rounded"><div className="h-1.5 rounded" style={{ width: `${Math.min(r.v, 100)}%`, backgroundColor: C_CA }} /></div>
              </div>
            ))}
            <div className="flex justify-between text-xs font-semibold text-gray-600 pt-3 border-t border-gray-200 mt-3"><span>TRAITEMENTS</span><span>{fmtInt(d.prod.traitements)}</span></div>
            <div className="flex justify-between text-xs font-semibold text-gray-600 pt-3 border-t border-gray-200"><span>SERVICES</span><span>{fmtInt(d.prod.services)}</span></div>
          </div>
        </div>

        {/* Tableaux détaillés Commande / Vente par type de produit */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {[
            { t: 'VERRES', cmdQte: d.qteCmd.verres, cmdMontant: d.coutCmd.verres, qte: d.qteVente.verres, vente: d.prod.verres },
            { t: 'MONTURES', cmdQte: d.qteCmd.montures, cmdMontant: d.coutCmd.montures, qte: d.qteVente.montures, vente: d.prod.montures },
            { t: 'ACCESSOIRES', cmdQte: d.qteCmd.accessoires, cmdMontant: d.coutCmd.accessoires, qte: d.qteVente.accessoires, vente: d.prod.accessoires },
          ].map(c => (
            <MargeTable key={c.t} titre={c.t} cmdQte={c.cmdQte} cmdMontant={c.cmdMontant} venteQte={c.qte} venteMontant={c.vente} />
          ))}
        </div>
      </Panel>

      {/* 4 ── OBJECTIF | CHIFFRE D'AFFAIRES ─────────────────────────────────── */}
      <Panel title="Objectif | Chiffre d'Affaires" controls={<div className="flex gap-2">{magSel}{anneeSel}</div>}>
        <div className="flex rounded overflow-hidden mb-4">
          <div className="flex-1 px-4 py-4 text-white" style={{ backgroundColor: C_OBJECTIF }}>
            <div className="font-bold">{fmtInt(d.objectif)}</div><div className="text-sm font-semibold">Objectif</div>
          </div>
          <div className="flex-1 px-4 py-4 text-white" style={{ backgroundColor: C_CA }}>
            <div className="font-bold">{fmtInt(d.caYear)}</div><div className="text-sm font-semibold">Chiffre d'Affaires</div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={d.objCA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />
                <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area key="objectif" type="monotone" dataKey="objectif" name="Objectif" stroke={C_OBJECTIF} fill={C_OBJECTIF} fillOpacity={0.15} />
                <Area key="ca" type="monotone" dataKey="ca" name="Chiffre d'Affaires" stroke={C_CA} fill={C_CA} fillOpacity={0.35} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-auto max-h-[360px]">
            <table className="w-full text-sm border-collapse">
              <thead><tr style={{ backgroundColor: '#e9eef2' }}>
                <th className="text-left px-3 py-2 text-gray-600">Mois</th>
                <th className="text-right px-3 py-2 text-gray-600">Chiffre d'Affaires</th>
                <th className="text-right px-3 py-2 text-gray-600">Marge est.</th>
              </tr></thead>
              <tbody>
                {d.margeTable.map((r, i) => (
                  <tr key={r.mois} style={{ backgroundColor: i < 7 ? '#5b9bd5' : '#fff', color: i < 7 ? '#fff' : '#374151' }}>
                    <td className="px-3 py-2 font-semibold">{r.mois}</td>
                    <td className="px-3 py-2 text-right">{fmtInt(r.ca)}</td>
                    <td className="px-3 py-2 text-right">{fmtInt(r.marge)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {/* 5 ── ACTIVITÉ ANNUELLE | MAGASIN ───────────────────────────────────── */}
      <Panel title="Activité Annuelle | Magasin" controls={anneeSel}>
        <Band cells={[
          { value: fmtInt(d.objectif), label: 'Objectif', bg: C_OBJECTIF },
          { value: fmtInt(d.caGlobalYear), label: "Chiffre d'Affaires", bg: C_CA },
          { value: fmtInt(d.payGlobalYear), label: 'Paiements Clients', bg: C_PAY },
          { value: fmtInt(d.bonsGlobalYear), label: 'Bons Assurance', bg: C_BONS },
          { value: '0', label: 'AVOIR-CLIENT +', bg: C_AVOIR_P, fg: '#1e3a52' },
          { value: '0', label: 'AVOIR-CLIENT -', bg: C_AVOIR_M },
          { value: fmtInt(Math.max(d.caGlobalYear - d.payGlobalYear, 0)), label: 'Montant Restant', bg: C_RESTANT },
        ]} />
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={d.magData} margin={{ bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mag" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={70} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />
            <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar key="ca" dataKey="ca" name="Chiffre d'Affaires" fill={C_CA} />
            <Bar key="paiements" dataKey="paiements" name="Paiements Clients" fill={C_PAY} />
            <Bar key="bons" dataKey="bons" name="Bons Assurance" fill={C_BONS} />
            <Bar key="restant" dataKey="restant" name="Montant Restant" fill={C_RESTANT} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* 6 ── OPÉRATIONS PÉRIODIQUES DES VENTES ─────────────────────────────── */}
      <Panel title="Opérations Périodique des Ventes" controls={<div className="flex gap-2">{magSel}{moisSel}{anneeSel}</div>}>
        <Band cells={[
          { value: fmtInt(d.prod.verres), label: 'Verres', bg: C_VERRE },
          { value: fmtInt(d.prod.traitements), label: 'Traitements', bg: C_TRAIT },
          { value: fmtInt(d.prod.montures), label: 'Montures', bg: C_MONT },
          { value: fmtInt(d.prod.accessoires), label: 'Accessoires', bg: C_ACC },
          { value: fmtInt(d.prod.services), label: 'Services', bg: C_SERV },
        ]} />
        <Band cells={[
          { value: fmtInt(d.brutMonth), label: 'Total', bg: C_NAVY },
          { value: fmtInt(d.remiseMonth), label: 'Remise', bg: C_NAVY },
          { value: fmtInt(d.netMonth), label: "Chiffre d'Affaires", bg: C_CA },
        ]} />
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={d.prodPie.length ? d.prodPie : [{ name: 'Aucune donnée', value: 1, color: '#cbd5e1' }]}
              cx="50%" cy="50%" outerRadius={120} dataKey="value" isAnimationActive={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`} labelLine={false}>
              {(d.prodPie.length ? d.prodPie : [{ name: 'Aucune donnée', value: 1, color: '#cbd5e1' }]).map((e, i) => <Cell key={i} fill={(e as any).color} />)}
            </Pie>
            <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </Panel>

      {/* 7 ── RAPPORT UTILISATEUR ───────────────────────────────────────────── */}
      <Panel title="Rapport Utilisateur" controls={<div className="flex gap-2">{magSel}{moisSel}{anneeSel}</div>}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 overflow-auto max-h-[420px]">
            <table className="w-full text-sm border-collapse">
              <thead><tr style={{ backgroundColor: '#e9eef2' }}>
                <th className="text-left px-3 py-2 text-gray-600">Utilisateur</th>
                <th className="text-right px-3 py-2 text-gray-600">Devis en cours</th>
                <th className="text-right px-3 py-2 text-gray-600">Devis → Facture</th>
                <th className="text-right px-3 py-2 text-gray-600">Abandons</th>
                <th className="text-right px-3 py-2 text-gray-600">Total Devis</th>
                <th className="text-right px-3 py-2 text-gray-600">Factures</th>
                <th className="text-right px-3 py-2 text-gray-600">Valeur Factures</th>
              </tr></thead>
              <tbody>
                {d.userTable.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">Aucune donnée sur la période</td></tr>}
                {d.userTable.map((u, i) => (
                  <tr key={u.nom} style={{ backgroundColor: i % 2 ? '#f6f9fb' : '#fff' }}>
                    <td className="px-3 py-2 font-semibold text-gray-700">{u.nom}</td>
                    <td className="px-3 py-2 text-right">{u.devisEnCours}</td>
                    <td className="px-3 py-2 text-right">{u.devisFacture}</td>
                    <td className="px-3 py-2 text-right">{u.devisAbandon}</td>
                    <td className="px-3 py-2 text-right">{u.devisTotal}</td>
                    <td className="px-3 py-2 text-right">{u.factures}</td>
                    <td className="px-3 py-2 text-right text-green-600 font-semibold">{fmtInt(u.valeurFactures)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="rounded border-2 p-3 mb-3" style={{ borderColor: C_ACC }}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800">{d.factCountMonth} FACTURES</span>
                <span className="px-2 py-1 rounded text-white text-sm font-semibold" style={{ backgroundColor: C_PAY }}>{fmtInt(d.valeurFacturesMonth)}</span>
              </div>
            </div>
            <div className="rounded border-2 p-3 mb-3 space-y-2" style={{ borderColor: C_ACC }}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800">{d.devisCountMonth} DEVIS</span>
                <span className="px-2 py-1 rounded text-white text-sm font-semibold" style={{ backgroundColor: C_CA }}>{fmtInt(d.propositionsMonth)}</span>
              </div>
            </div>
            <div className="rounded border-2 p-3" style={{ borderColor: C_ACC }}>
              <div className="flex justify-around text-center mb-2">
                <div><div className="font-bold">{d.factCountMonth}</div><div className="text-xs text-gray-500">Factures</div></div>
                <div><div className="font-bold">{d.devisCountMonth}</div><div className="text-xs text-gray-500">Devis</div></div>
                <div><div className="font-bold">{d.abandonMonth}</div><div className="text-xs text-gray-500">Abandons</div></div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={d.factDevisPie.length ? d.factDevisPie : [{ name: 'Aucune donnée', value: 1, color: '#cbd5e1' }]}
                    cx="50%" cy="50%" outerRadius={80} dataKey="value" isAnimationActive={false}
                    label={({ percent }) => `${(percent * 100).toFixed(1)}%`} labelLine={false}>
                    {(d.factDevisPie.length ? d.factDevisPie : [{ name: 'Aucune donnée', value: 1, color: '#cbd5e1' }]).map((e, i) => <Cell key={i} fill={(e as any).color} />)}
                  </Pie>
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Panel>

      {/* 8 ── ÉVOLUTION DU CHIFFRE D'AFFAIRE (par année) ────────────────────── */}
      <Panel title="Évolution du Chiffre d'Affaire" controls={magSel}>
        <Band cells={[
          { value: fmtInt(d.evMin), label: 'Minimum', bg: C_NAVY },
          { value: d.evMoy.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), label: 'Moyenne', bg: C_NAVY },
          { value: fmtInt(d.evMax), label: 'Maximum', bg: C_NAVY },
        ]} />
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={d.evolData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="annee" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />
            <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar key="ca" dataKey="ca" name="Chiffre d'Affaires" fill={C_CA} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* 9 ── RÉCAPITULATIF + ENTREPRISES ───────────────────────────────────── */}
      <Panel title="Récapitulatif Activité" controls={<div className="flex gap-2">{magSel}{anneeSel}</div>}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={260}>
              <RadialBarChart innerRadius="45%" outerRadius="100%" data={gaugeData} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" background cornerRadius={6}>
                  {gaugeData.map(g => <Cell key={g.name} fill={g.fill} />)}
                </RadialBar>
                <Tooltip formatter={(v: number) => fmtInt(v) + ' F CFA'} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="text-center -mt-6">
              <div className="text-gray-400 font-semibold">Résultat</div>
              <div className="text-gray-500">{d.caYear - restantGlobal >= 0 ? '+' : ''}{fmtInt(d.payYear)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 content-start">
            <div className="px-4 py-6 text-white rounded" style={{ backgroundColor: C_OBJECTIF }}><div className="font-bold">{fmtInt(d.objectif)}</div><div className="text-sm">Objectif</div></div>
            <div className="px-4 py-6 text-white rounded" style={{ backgroundColor: C_CA }}><div className="font-bold">{fmtInt(d.caYear)}</div><div className="text-sm">Chiffre d'Affaires</div></div>
            <div className="px-4 py-6 text-white rounded" style={{ backgroundColor: C_PAY }}><div className="font-bold">{fmtInt(d.payYear)}</div><div className="text-sm">Paiements Clients</div></div>
            <div className="px-4 py-6 text-white rounded" style={{ backgroundColor: C_RESTANT }}><div className="font-bold">{fmtInt(restantGlobal)}</div><div className="text-sm">Montant Restant</div></div>
          </div>
          <div className="overflow-auto max-h-[360px]">
            <div className="font-bold text-gray-700 mb-2">Informations / Entreprise</div>
            <table className="w-full text-sm border-collapse">
              <thead><tr style={{ backgroundColor: '#e9eef2' }}>
                <th className="text-left px-3 py-2 text-gray-600">Entreprise</th>
                <th className="text-center px-3 py-2 text-gray-600">Total Clients</th>
                <th className="text-right px-3 py-2 text-gray-600">Chiffre d'Affaires</th>
              </tr></thead>
              <tbody>
                {d.entTable.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">Aucune entreprise</td></tr>}
                {d.entTable.map((e, i) => (
                  <tr key={e.ent} style={{ backgroundColor: i % 2 ? '#f6f9fb' : '#fff' }}>
                    <td className="px-3 py-2 font-semibold text-gray-700">{e.ent}</td>
                    <td className="px-3 py-2 text-center">{e.clients}</td>
                    <td className="px-3 py-2 text-right">{fmtInt(e.ca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
}
