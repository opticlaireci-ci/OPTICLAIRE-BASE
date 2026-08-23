import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Phone, PhoneCall, PhoneMissed, Timer, CheckCircle2, RotateCcw, Store, Users,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { doc, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { getActiveMagasins, getMagasinLabel, type Magasin } from '../constants/magasins';
import { LOG_KEY, fmtDureeLong, type CallLog } from './magasin/gestion-clientele/CallCenterPage';
import { Combobox } from '../components/Combobox';

const TEAL = '#1a7a96';
const GREEN = '#16a34a';
const PURPLE = '#7c3aed';
const AMBER = '#d97706';
const RED = '#dc2626';
const PIE_COLORS = [GREEN, AMBER, RED, PURPLE, TEAL, '#0891b2', '#db2777', '#65a30d'];

type Granularite = 'jour' | 'semaine' | 'mois';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const isAnswered = (statut: string) => (statut || '').toLowerCase().includes('décroch') && !(statut || '').toLowerCase().includes('pas');

// ── Fenêtres temporelles (buckets) selon la granularité choisie ────────────────
interface Bucket { key: string; label: string; start: number; end: number; }

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function buildBuckets(gran: Granularite): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];
  if (gran === 'jour') {
    for (let i = 29; i >= 0; i--) {
      const d = startOfDay(new Date(now));
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 24 * 3600 * 1000;
      buckets.push({ key: String(start), label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, start, end });
    }
  } else if (gran === 'semaine') {
    // 12 dernières semaines (lundi → dimanche).
    const monday = startOfDay(new Date(now));
    const dow = (monday.getDay() + 6) % 7; // 0 = lundi
    monday.setDate(monday.getDate() - dow);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(monday);
      d.setDate(d.getDate() - i * 7);
      const start = d.getTime();
      const end = start + 7 * 24 * 3600 * 1000;
      buckets.push({ key: String(start), label: `sem. ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, start, end });
    }
  } else {
    // 12 derniers mois.
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.getTime();
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
      buckets.push({ key: String(start), label: `${MOIS_COURTS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, start, end });
    }
  }
  return buckets;
}

interface FlatLog extends CallLog { magasinId: string; }

export function CallCenterDashboardPage() {
  const navigate = useNavigate();
  const [magasins, setMagasins] = useState<Magasin[]>(() => getActiveMagasins());
  useEffect(() => {
    const refresh = () => setMagasins(getActiveMagasins());
    window.addEventListener('storage', refresh);
    window.addEventListener('leclaire-sync-update', refresh);
    window.addEventListener('supabase-realtime-update', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('leclaire-sync-update', refresh);
      window.removeEventListener('supabase-realtime-update', refresh);
    };
  }, []);

  // Journaux d'appels de tous les magasins (temps réel).
  const [logsByMag, setLogsByMag] = useState<Record<string, CallLog[]>>({});
  useEffect(() => {
    const unsubs = magasins.map(m =>
      onSnapshot(
        doc(db, 'app_data', LOG_KEY(m.id)),
        snap => {
          const value = (snap.exists() ? (snap.data()?.value ?? []) : []) as CallLog[];
          setLogsByMag(prev => ({ ...prev, [m.id]: value }));
        },
        () => {},
      ),
    );
    return () => unsubs.forEach(u => u());
  }, [magasins]);

  const [selectedMag, setSelectedMag] = useState<string>('ALL');
  const [gran, setGran] = useState<Granularite>('jour');

  // Tous les logs à plat, filtrés par magasin sélectionné.
  const allLogs = useMemo<FlatLog[]>(() => {
    const out: FlatLog[] = [];
    for (const [magasinId, logs] of Object.entries(logsByMag)) {
      if (selectedMag !== 'ALL' && magasinId !== selectedMag) continue;
      for (const l of logs) out.push({ ...l, magasinId });
    }
    return out;
  }, [logsByMag, selectedMag]);

  const buckets = useMemo(() => buildBuckets(gran), [gran]);

  // Série d'évolution : total + décrochés par fenêtre temporelle.
  const evolution = useMemo(() => {
    const rows = buckets.map(b => ({ ...b, total: 0, decroches: 0 }));
    for (const l of allLogs) {
      const t = new Date(l.debut).getTime();
      if (Number.isNaN(t)) continue;
      const b = rows.find(r => t >= r.start && t < r.end);
      if (!b) continue;
      b.total++;
      if (isAnswered(l.statut)) b.decroches++;
    }
    return rows.map(r => ({ label: r.label, Appels: r.total, Décrochés: r.decroches }));
  }, [allLogs, buckets]);

  // Logs sur la période affichée (bornes des buckets) pour les KPI/répartitions.
  const periodLogs = useMemo(() => {
    if (buckets.length === 0) return allLogs;
    const min = buckets[0].start;
    const max = buckets[buckets.length - 1].end;
    return allLogs.filter(l => {
      const t = new Date(l.debut).getTime();
      return !Number.isNaN(t) && t >= min && t < max;
    });
  }, [allLogs, buckets]);

  const kpis = useMemo(() => {
    const total = periodLogs.length;
    const decroches = periodLogs.filter(l => isAnswered(l.statut)).length;
    const temps = periodLogs.filter(l => isAnswered(l.statut)).reduce((s, l) => s + (l.duree || 0), 0);
    const aRappeler = periodLogs.filter(l => l.resultat === 'À rappeler' || (!isAnswered(l.statut))).length;
    const today = new Date().toDateString();
    const aujourdhui = allLogs.filter(l => new Date(l.debut).toDateString() === today).length;
    const taux = total > 0 ? Math.round((decroches / total) * 100) : 0;
    return { total, decroches, temps, aRappeler, aujourdhui, taux };
  }, [periodLogs, allLogs]);

  const parStatut = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of periodLogs) {
      const k = l.statut || 'Non renseigné';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [periodLogs]);

  const parResultat = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of periodLogs) {
      const k = l.resultat || 'Non renseigné';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [periodLogs]);

  const parMagasin = useMemo(() => {
    const map = new Map<string, { total: number; decroches: number }>();
    for (const l of periodLogs) {
      const cur = map.get(l.magasinId) || { total: 0, decroches: 0 };
      cur.total++;
      if (isAnswered(l.statut)) cur.decroches++;
      map.set(l.magasinId, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ name: getMagasinLabel(id), Appels: v.total, Décrochés: v.decroches }))
      .sort((a, b) => b.Appels - a.Appels);
  }, [periodLogs]);

  const parConseillere = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of periodLogs) {
      const k = l.conseillere || 'Non renseigné';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, Appels: value }))
      .sort((a, b) => b.Appels - a.Appels)
      .slice(0, 8);
  }, [periodLogs]);

  const granOptions = [
    { value: 'jour', label: '30 derniers jours' },
    { value: 'semaine', label: '12 dernières semaines' },
    { value: 'mois', label: '12 derniers mois' },
  ];

  return (
    <div className="p-4 lg:p-6 flex flex-col gap-5">
      {/* En-tête + filtres */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg text-white" style={{ backgroundColor: TEAL }}><PhoneCall size={20} /></div>
          <div>
            <h1 className="text-base font-bold text-gray-800">Tableau de bord — Call Center</h1>
            <p className="text-xs text-gray-500">Évolution des appels et performance sur la période</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Combobox
            value={selectedMag}
            onChange={setSelectedMag}
            options={[{ value: 'ALL', label: 'Tous les magasins' }, ...magasins.map(m => ({ value: m.id, label: m.label }))]}
            placeholder="Magasin…"
            width={200}
          />
          <Combobox
            value={gran}
            onChange={v => setGran(v as Granularite)}
            options={granOptions}
            placeholder="Période…"
            width={190}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Phone size={18} />} value={String(kpis.total)} label="Appels (période)" color={TEAL} onClick={() => navigate('/call-center?tab=historique')} />
        <KpiCard icon={<CheckCircle2 size={18} />} value={String(kpis.decroches)} label="Décrochés" color={GREEN} onClick={() => navigate('/call-center?tab=decroches')} />
        <KpiCard icon={<PhoneMissed size={18} />} value={`${kpis.taux}%`} label="Taux de décroché" color={PURPLE} />
        <KpiCard icon={<Timer size={18} />} value={fmtDureeLong(kpis.temps)} label="Temps au téléphone" color="#0891b2" />
        <KpiCard icon={<RotateCcw size={18} />} value={String(kpis.aRappeler)} label="À rappeler" color={AMBER} onClick={() => navigate('/call-center?tab=rappeler')} />
        <KpiCard icon={<PhoneCall size={18} />} value={String(kpis.aujourdhui)} label="Appels aujourd'hui" color={RED} onClick={() => navigate('/call-center?tab=decroches')} />
      </div>

      {/* Évolution des appels */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><PhoneCall size={16} style={{ color: TEAL }} /> Évolution des appels</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={evolution} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={TEAL} stopOpacity={0.35} />
                <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gDec" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={GREEN} stopOpacity={0.35} />
                <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="Appels" stroke={TEAL} fill="url(#gTotal)" strokeWidth={2} />
            <Area type="monotone" dataKey="Décrochés" stroke={GREEN} fill="url(#gDec)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Répartitions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-bold text-gray-800 mb-3">Répartition par statut</h2>
          {parStatut.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={parStatut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {parStatut.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-bold text-gray-800 mb-3">Résultats des appels</h2>
          {parResultat.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={parResultat} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="value" name="Appels" fill={PURPLE} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Store size={16} style={{ color: TEAL }} /> Appels par magasin</h2>
          {parMagasin.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={parMagasin} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Appels" fill={TEAL} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Décrochés" fill={GREEN} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Users size={16} style={{ color: TEAL }} /> Top conseillères</h2>
          {parConseillere.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={parConseillere} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="Appels" fill={AMBER} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, value, label, color, onClick }: { icon: React.ReactNode; value: string; label: string; color: string; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Voir la liste : ${label}`}
        className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 text-left w-full transition hover:shadow-sm hover:ring-2"
        style={{ ['--tw-ring-color' as any]: color }}>
        <div className="p-2 rounded-lg text-white shrink-0" style={{ backgroundColor: color }}>{icon}</div>
        <div className="min-w-0">
          <div className="text-lg font-bold text-gray-800 truncate">{value}</div>
          <div className="text-xs text-gray-500 truncate">{label}</div>
        </div>
      </button>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      <div className="p-2 rounded-lg text-white shrink-0" style={{ backgroundColor: color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-800 truncate">{value}</div>
        <div className="text-xs text-gray-500 truncate">{label}</div>
      </div>
    </div>
  );
}

function Empty() {
  return <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">Aucune donnée sur la période</div>;
}
