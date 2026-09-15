import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Calendar, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Edit, Search, Store, X } from 'lucide-react';
import { subscriberVentesMagasin, chargerVentes, readVentesCache, VenteSupabase } from '../../../services/ventesService';
import { normaliserTotauxVente } from '../../../utils/venteTotals';
import { getMagasins } from '../../../constants/magasins';
import { TENANT } from '../../../config/tenant';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#1a7a96', '#dc2626', '#ea580c', '#ca8a04'];
const allMagasins = getMagasins();
const MAGASINS = allMagasins.map((magasin, index) => ({
  id: magasin.id,
  label: magasin.label.replace(`${TENANT.nom} `, ''),
  color: COLORS[index % COLORS.length],
}));

const MAGASIN_LABELS: Record<string, string> = Object.fromEntries(MAGASINS.map(m => [m.id, m.label]));
const MAGASIN_COLORS: Record<string, string> = Object.fromEntries(MAGASINS.map(m => [m.id, m.color]));

interface BonAssuranceRow {
  rowId: string;
  venteId: string;
  assurance: string;
  numeroFacture: string;
  numeroBon: string;
  client: string;
  total: number;
  remise: number;
  remisePct: number;
  totalNet: number;
  acompte: number;
  totalAssurance: number;
  totalReste: number;
  date: string;
  matricule: string;
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtMoney = (v: number) => `${Math.round(v || 0).toLocaleString('fr-FR')} F`;
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('fr-FR') : '—';

function bonsDeVente(vente: VenteSupabase): BonAssuranceRow[] {
  if (vente.type === 'devis') return [];
  const bons = Array.isArray(vente.bons_assurance)
    ? vente.bons_assurance
    : (Array.isArray((vente as any).bonsAssurance) ? (vente as any).bonsAssurance : []);
  if (!bons.length) return [];

  const totaux = normaliserTotauxVente(vente);
  const recap = vente.recap || {};
  const acompte = num(recap.acompte);
  const totalAssurance = bons.reduce((s: number, b: any) => s + num(
    b?.montantPrisEnCharge ?? b?.montant ?? b?.total ?? b?.montantAssurance
  ), 0);
  const totalReste = Math.max(0, totaux.totalNet - acompte - totalAssurance);

  return bons.map((b: any, index: number) => {
    const montantBon = num(b?.montantPrisEnCharge ?? b?.montant ?? b?.total ?? b?.montantAssurance);
    const date = b?.datebon || b?.dateBon || vente.date || vente.created_at || '';
    return {
      rowId: `${vente.id}-${b?.id || index}`,
      venteId: vente.id,
      assurance: String(b?.assurance || '—'),
      numeroFacture: String(recap.numFacture || recap.numero || vente.id || '—'),
      numeroBon: String(b?.numeroBon || b?.numBon || '—'),
      client: String(vente.client || '—'),
      total: totaux.totalBrut,
      remise: totaux.valeurRemise,
      remisePct: totaux.remisePct,
      totalNet: totaux.totalNet,
      acompte,
      totalAssurance: montantBon,
      totalReste,
      date,
      matricule: String(b?.matricule || vente.matricule_assurance || '—'),
    };
  });
}

function readCachedBons(magasinId: string): BonAssuranceRow[] {
  return readVentesCache(magasinId).flatMap(bonsDeVente);
}

export function FactureAssurancePage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(MAGASINS.map(m => [m.id, readCachedBons(m.id).length]))
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(MAGASINS.map(async m => {
      try {
        const ventes = await chargerVentes(m.id);
        return [m.id, ventes.flatMap(bonsDeVente).length] as const;
      } catch {
        return [m.id, readCachedBons(m.id).length] as const;
      }
    })).then(values => {
      if (!cancelled) setCounts(Object.fromEntries(values));
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      <div>
        <h1 className="text-xl font-bold text-gray-800">Factures Assurance</h1>
        <p className="text-sm text-gray-500 mt-0.5">Sélectionnez un magasin pour consulter tous les bons d’assurance enregistrés.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {MAGASINS.map(magasin => {
          const count = counts[magasin.id] ?? 0;
          return (
            <button
              key={magasin.id}
              onClick={() => navigate(`/comptabilite/assurance/factures/${magasin.id}`)}
              className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center gap-4 border-t-4 hover:shadow-md transition-shadow text-left w-full"
              style={{ borderColor: magasin.color }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: magasin.color + '18' }}>
                <Store size={28} style={{ color: magasin.color }} />
              </div>
              <div className="text-center">
                <div className="text-base font-bold" style={{ color: magasin.color }}>{magasin.label}</div>
                <div className="text-sm text-gray-500 mt-1">{count} bon{count !== 1 ? 's' : ''} d’assurance</div>
              </div>
              <div className="mt-auto w-full text-center py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: magasin.color }}>
                Voir les bons
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FactureAssuranceMagasinPage() {
  const navigate = useNavigate();
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const label = MAGASIN_LABELS[magasinId] ?? magasinId.toUpperCase();
  const color = MAGASIN_COLORS[magasinId] ?? '#1a7a96';

  const [ventes, setVentes] = useState<VenteSupabase[]>(() => readVentesCache(magasinId));
  const [search, setSearch] = useState('');
  const [assurance, setAssurance] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = async () => {
    if (!magasinId) return;
    try {
      const fresh = await chargerVentes(magasinId);
      setVentes(fresh);
    } catch { /* cache déjà affiché */ }
  };

  useEffect(() => {
    setVentes(readVentesCache(magasinId));
    load();
  }, [magasinId]);

  useEffect(() => {
    if (!magasinId) return;
    const unsub = subscriberVentesMagasin(
      magasinId,
      v => setVentes(prev => prev.some(x => x.id === v.id) ? prev.map(x => x.id === v.id ? v : x) : [v, ...prev]),
      v => setVentes(prev => prev.some(x => x.id === v.id) ? prev.map(x => x.id === v.id ? v : x) : [v, ...prev]),
      id => setVentes(prev => prev.filter(v => v.id !== id)),
    );
    return () => unsub?.();
  }, [magasinId]);

  const rows = useMemo(() => {
    const all = ventes.flatMap(bonsDeVente);
    const q = search.trim().toLowerCase();
    return all
      .filter(r => !q || [r.assurance, r.numeroFacture, r.numeroBon, r.client, r.matricule].some(v => v.toLowerCase().includes(q)))
      .filter(r => !assurance || r.assurance === assurance)
      .filter(r => !date || r.date.slice(0, 10) === date)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [ventes, search, assurance, date]);

  useEffect(() => setPage(1), [search, assurance, date]);

  const assurances = useMemo(() => Array.from(new Set(rows.map(r => r.assurance).filter(Boolean))).sort(), [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const totalPrisEnCharge = rows.reduce((s, r) => s + r.totalAssurance, 0);

  const clearFilters = () => { setSearch(''); setAssurance(''); setDate(''); };
  const inputCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';

  return (
    <div className="flex flex-col gap-5 p-6" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/comptabilite/assurance/factures')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Retour">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Bons d’Assurance — <span style={{ color }}>{label}</span></h1>
          <p className="text-sm text-gray-500 mt-0.5">Tous les bons enregistrés dans ce magasin • {rows.length} résultat(s)</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Liste des bons d’assurance</h2>
            <p className="text-xs text-gray-500 mt-0.5">Montant total pris en charge : <strong className="text-gray-700">{fmtMoney(totalPrisEnCharge)}</strong></p>
          </div>
          <div className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ color, backgroundColor: color + '15' }}>
            {rows.length} bon{rows.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className="text-xs text-gray-600">Recherche</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <Search size={14} className="ml-2 text-gray-400" />
              <input className="px-2 py-1.5 text-sm outline-none flex-1" placeholder="Assurance, client, N° facture, N° bon..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="px-2 text-gray-400"><X size={13} /></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Assurance</label>
            <select className={inputCls} style={{ width: 170 }} value={assurance} onChange={e => setAssurance(e.target.value)}>
              <option value="">Toutes</option>
              {assurances.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Date</label>
            <div className="flex items-center gap-1">
              <Calendar size={14} className="text-gray-400" />
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          {(search || assurance || date) && <button onClick={clearFilters} className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Réinitialiser</button>}
        </div>

        <div className="border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 1180, tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="text-left px-2 py-2.5" style={{ width: 42 }}>#</th>
                <th className="text-left px-2 py-2.5" style={{ width: 105 }}>Assurance</th>
                <th className="text-left px-2 py-2.5" style={{ width: 85 }}>N° Facture</th>
                <th className="text-left px-2 py-2.5" style={{ width: 95 }}>N° Bon</th>
                <th className="text-left px-2 py-2.5" style={{ width: 230 }}>Client</th>
                <th className="text-right px-2 py-2.5" style={{ width: 105 }}>Total</th>
                <th className="text-right px-2 py-2.5" style={{ width: 85 }}>Remise</th>
                <th className="text-right px-2 py-2.5" style={{ width: 105 }}>Total Net</th>
                <th className="text-right px-2 py-2.5" style={{ width: 95 }}>Acompte</th>
                <th className="text-right px-2 py-2.5" style={{ width: 110 }}>Total Reste</th>
                <th className="text-left px-2 py-2.5" style={{ width: 105 }}>Édition</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">Aucun bon d’assurance enregistré dans ce magasin.</td></tr>
              ) : visible.map((r, i) => (
                <tr key={r.rowId} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-2 py-2.5 text-gray-500">{(safePage - 1) * pageSize + i + 1}</td>
                  <td className="px-2 py-2.5 font-semibold break-words">{r.assurance}</td>
                  <td className="px-2 py-2.5 font-mono text-blue-700 break-all">{r.numeroFacture}</td>
                  <td className="px-2 py-2.5 font-mono font-semibold break-all">{r.numeroBon}</td>
                  <td className="px-2 py-2.5 break-words whitespace-normal leading-5">{r.client}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">{fmtMoney(r.total)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap"><div>{fmtMoney(r.remise)}</div><div className="text-[10px] text-gray-400">({r.remisePct || 0}%)</div></td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap font-semibold">{fmtMoney(r.totalNet)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">{fmtMoney(r.acompte)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap font-bold" style={{ backgroundColor: '#ef8888' }}>{fmtMoney(r.totalReste)}</td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => navigate(`/magasin/${magasinId}/commercial/vente-facture?venteId=${encodeURIComponent(r.venteId)}`)}
                      className="inline-flex items-center justify-center rounded px-3 py-2 text-white hover:opacity-90"
                      style={{ backgroundColor: '#4caf50' }}
                      title="Modifier la facture et le bon d’assurance"
                    >
                      <Edit size={15} />
                    </button>
                    <div className="text-[10px] text-gray-400 mt-1">{fmtDate(r.date)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500">
          <span>Affichage {rows.length ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, rows.length)}` : '0'} sur {rows.length}</span>
          <div className="flex items-center gap-1">
            <button disabled={safePage <= 1} onClick={() => setPage(1)} className="p-1 disabled:opacity-30"><ChevronFirst size={16} /></button>
            <button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="p-1 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="px-2">Page {safePage} / {totalPages}</span>
            <button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="p-1 disabled:opacity-30"><ChevronRight size={16} /></button>
            <button disabled={safePage >= totalPages} onClick={() => setPage(totalPages)} className="p-1 disabled:opacity-30"><ChevronLast size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
