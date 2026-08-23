import { logger } from '../utils/logger';
import { useState, useMemo, useEffect } from 'react';
import { Search, X, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { doc, onSnapshot } from '../utils/firestoreCompat';
import { db } from './../utils/firebaseClient';
import { TENANT } from '../config/tenant';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
const fmt2 = (d: string) => { try { return d ? new Date(d).toLocaleString('fr-FR') : ''; } catch { return d; } };
const PAGE = 20;

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  numFacture, setNumFacture, client, setClient,
  rdv, setRdv, dateRec, setDateRec,
  onSearch, page, totalPages, goPage,
}: {
  numFacture: string; setNumFacture: (v: string) => void;
  client: string; setClient: (v: string) => void;
  rdv: string; setRdv: (v: string) => void;
  dateRec: string; setDateRec: (v: string) => void;
  onSearch: () => void;
  page: number; totalPages: number; goPage: (p: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">N°Facture, N°Facture Normalisée...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input className="px-2 py-1 text-xs outline-none bg-transparent" style={{ width: 190 }}
            placeholder="N°Facture, N°Facture Normalisée..." value={numFacture}
            onChange={e => setNumFacture(e.target.value)} />
          {numFacture && <button onClick={() => setNumFacture('')} className="px-1 text-gray-400"><X size={11} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Infos Client...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input className="px-2 py-1 text-xs outline-none bg-transparent" style={{ width: 150 }}
            placeholder="Infos Client..." value={client}
            onChange={e => setClient(e.target.value)} />
          {client && <button onClick={() => setClient('')} className="px-1 text-gray-400"><X size={11} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Rendez-vous</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1 text-xs outline-none bg-transparent" style={{ width: 130 }}
            value={rdv} onChange={e => setRdv(e.target.value)} />
          {rdv && <button onClick={() => setRdv('')} className="px-1 text-gray-400"><X size={11} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Date Récupération</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1 text-xs outline-none bg-transparent" style={{ width: 130 }}
            value={dateRec} onChange={e => setDateRec(e.target.value)} />
          {dateRec && <button onClick={() => setDateRec('')} className="px-1 text-gray-400"><X size={11} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">...</label>
        <button onClick={onSearch} className="flex items-center justify-center rounded text-white px-3 py-1.5" style={{ backgroundColor: '#1a7a96' }}>
          <Search size={14} />
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5 text-gray-500 self-end">
        <button onClick={() => goPage(1)} disabled={page === 1} className="p-1 disabled:opacity-30"><ChevronFirst size={13} /></button>
        <button onClick={() => goPage(page - 1)} disabled={page === 1} className="p-1 disabled:opacity-30"><ChevronLeft size={13} /></button>
        {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => goPage(p)}
            className={`w-5 h-5 rounded text-xs font-semibold ${page === p ? 'text-white' : 'text-gray-600'}`}
            style={page === p ? { backgroundColor: '#1a7a96' } : {}}>
            {p}
          </button>
        ))}
        <button onClick={() => goPage(page + 1)} disabled={page === totalPages} className="p-1 disabled:opacity-30"><ChevronRight size={13} /></button>
        <button onClick={() => goPage(totalPages)} disabled={page === totalPages} className="p-1 disabled:opacity-30"><ChevronLast size={13} /></button>
      </div>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarView({ ventes }: { ventes: any[] }) {
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState<'mois' | 'semaine' | 'jour' | 'agenda'>('mois');

  const year = current.getFullYear();
  const month = current.getMonth();
  const moisLabel = current.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    ventes.forEach(v => {
      const rdv = v.recap?.rdvRetrait || v.rdvRetrait || '';
      if (!rdv) return;
      try {
        const key = new Date(rdv).toISOString().slice(0, 10);
        (map[key] = map[key] || []).push(v);
      } catch { /* skip invalid dates */ }
    });
    return map;
  }, [ventes]);

  const prev = () => { const d = new Date(current); d.setMonth(d.getMonth() - 1); setCurrent(d); };
  const next = () => { const d = new Date(current); d.setMonth(d.getMonth() + 1); setCurrent(d); };
  const goToday = () => setCurrent(new Date());

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDayOfWeek).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = new Date().toISOString().slice(0, 10);
  const DAYS_HDR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const CAL_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={prev} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"><ChevronLeft size={13} /></button>
          <button onClick={next} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50"><ChevronRight size={13} /></button>
          <button onClick={goToday} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 ml-1">Aujourd'hui</button>
        </div>
        <span className="text-sm font-semibold text-gray-700 capitalize">{moisLabel}</span>
        <div className="flex gap-0.5">
          {(['mois', 'semaine', 'jour', 'agenda'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-2.5 py-1 text-xs rounded font-medium capitalize"
              style={view === v ? { backgroundColor: '#1a7a96', color: '#fff' } : { border: '1px solid #d1d5db', color: '#374151', backgroundColor: '#fff' }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {view === 'mois' && (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-7">
            {DAYS_HDR.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-600 py-1.5 bg-gray-50 border border-gray-200">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-l border-t border-gray-200">
            {cells.map((day, i) => {
              const key = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
              const entries = day ? (byDate[key] || []) : [];
              const isToday = key === todayKey;
              return (
                <div key={i} className="border-r border-b border-gray-200 p-1 min-h-16"
                  style={{ backgroundColor: day ? '#fff' : '#f9fafb' }}>
                  {day && (
                    <>
                      <div className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${isToday ? 'text-white' : 'text-gray-700'}`}
                        style={isToday ? { backgroundColor: '#1a7a96' } : {}}>
                        {day}
                      </div>
                      {entries.slice(0, 2).map((v, ci) => (
                        <div key={v.id} title={v.client} className="text-white rounded px-1 mb-0.5 truncate"
                          style={{ backgroundColor: CAL_COLORS[ci % CAL_COLORS.length], fontSize: 10, lineHeight: '16px' }}>
                          N° Facture:{v.recap?.numFacture || v.numFacture || '—'}
                        </div>
                      ))}
                      {entries.length > 2 && (
                        <div className="text-blue-600 font-semibold" style={{ fontSize: 10 }}>
                          +{entries.length - 2} more
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'agenda' && (
        <div className="flex-1 overflow-auto flex flex-col gap-1 pt-1">
          {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, evts]) => (
            <div key={date} className="mb-2">
              <div className="text-xs font-semibold text-gray-500 mb-1 capitalize">{fmt(date)}</div>
              {evts.map(v => (
                <div key={v.id} className="rounded px-3 py-1.5 text-xs mb-1 border-l-4 border-red-500" style={{ backgroundColor: '#fee2e2' }}>
                  <div className="font-bold text-red-800">N°Facture: {v.recap?.numFacture || v.numFacture}</div>
                  <div className="text-red-700">{v.client} — {v.telephone || ''}</div>
                </div>
              ))}
            </div>
          ))}
          {Object.keys(byDate).length === 0 && (
            <div className="text-center text-gray-400 text-sm py-10">Aucun rendez-vous retrait</div>
          )}
        </div>
      )}

      {(view === 'semaine' || view === 'jour') && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Basculez sur <span className="font-semibold mx-1">Mois</span> ou <span className="font-semibold ml-1">Agenda</span>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function RdvRetraitGlobalPage() {
  const MAGASIN_IDS = ['abobo', 'faya', 'koumassi', 'palmeraie', 'yopougon'];

  // Ventes live par magasin (source de vérité Firestore, partagée entre navigateurs).
  const [byMagasin, setByMagasin] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const unsubs = MAGASIN_IDS.map(magasinId =>
      onSnapshot(
        doc(db, 'app_data', `leclaire_ventes_${magasinId}`),
        snap => {
          const value = (snap.exists() ? (snap.data()?.value ?? []) : []) as any[];
          setByMagasin(prev => ({ ...prev, [magasinId]: value }));
        },
        err => logger.error(`RdvRetraitPage onSnapshot ${magasinId}:`, err),
      ),
    );
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allVentes = useMemo(() => {
    const ventes: any[] = [];
    MAGASIN_IDS.forEach(magasinId => {
      (byMagasin[magasinId] || []).forEach(v => {
        const rdv = v.recap?.rdvRetrait || v.rdvRetrait || '';
        if (rdv && rdv.trim() !== '') {
          ventes.push({ ...v, magasin: `${TENANT.nom} ${magasinId.toUpperCase()}` });
        }
      });
    });
    return ventes;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byMagasin]);

  const [numFacture, setNumFacture] = useState('');
  const [client, setClient] = useState('');
  const [rdv, setRdv] = useState('');
  const [dateRec, setDateRec] = useState('');
  const [page, setPage] = useState(1);
  const [filtered, setFiltered] = useState<any[]>([]);

  // Synchronise la liste affichée avec les données live (avant tout filtrage manuel).
  useEffect(() => { setFiltered(allVentes); }, [allVentes]);

  const runFilter = () => {
    setPage(1);
    setFiltered(allVentes.filter(v => {
      const nf = (v.recap?.numFacture || v.numFacture || '').toLowerCase();
      const cl = (v.client || '').toLowerCase();
      const rdvDate = (v.recap?.rdvRetrait || v.rdvRetrait || '').slice(0, 10);
      return (!numFacture || nf.includes(numFacture.toLowerCase())) &&
        (!client || cl.includes(client.toLowerCase())) &&
        (!rdv || rdvDate === rdv);
    }));
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const goPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));
  const pageData = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="flex gap-0" style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
      {/* Left — list */}
      <div className="flex flex-col p-4 gap-3" style={{ width: 480, minWidth: 380, flexShrink: 0 }}>
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3">
          <h1 className="text-sm font-bold text-gray-800">
            Ventes | Factures | Rendez-vous ({allVentes.length})
          </h1>

          <FilterBar
            numFacture={numFacture} setNumFacture={setNumFacture}
            client={client} setClient={setClient}
            rdv={rdv} setRdv={setRdv}
            dateRec={dateRec} setDateRec={setDateRec}
            onSearch={runFilter}
            page={page} totalPages={totalPages} goPage={goPage}
          />

          {/* Cards */}
          <div className="flex flex-col gap-2" style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
            {pageData.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">Aucun rendez-vous retrait enregistré</div>
            ) : pageData.map(v => {
              const rdvDate = v.recap?.rdvRetrait || v.rdvRetrait || '';
              const acompte = parseFloat(v.recap?.acompte || '0');
              const totalReste = v.totalNet - acompte;
              return (
                <div key={v.id} className="rounded-lg p-3 text-xs" style={{ backgroundColor: '#fca5a5', color: '#7f1d1d' }}>
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 bg-red-800">
                      <span className="text-white text-xs font-bold">···</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-red-900 text-sm">N°Facture: {v.recap?.numFacture || v.numFacture || '—'}</div>
                      <div className="text-red-800">N°({v.numeroClient}) |{v.client}</div>
                      <div className="text-red-700">Téléphone: {v.telephone || '—'}</div>
                      <div className="text-red-700">Magasin: {v.magasin}</div>
                      {totalReste > 0 && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-white font-bold" style={{ backgroundColor: '#dc2626', fontSize: 11 }}>
                          Total Reste: {totalReste.toLocaleString('fr-FR')}
                        </span>
                      )}
                      <div className="mt-1 text-red-700">
                        Édité le: {fmt2(v.dateEdition || '')}
                      </div>
                      <div className="text-red-800 font-semibold">
                        Rendez-vous: {rdvDate ? fmt(rdvDate) + ' 00:00:00' : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <FilterBar
            numFacture={numFacture} setNumFacture={setNumFacture}
            client={client} setClient={setClient}
            rdv={rdv} setRdv={setRdv}
            dateRec={dateRec} setDateRec={setDateRec}
            onSearch={runFilter}
            page={page} totalPages={totalPages} goPage={goPage}
          />
        </div>
      </div>

      {/* Right — Calendar */}
      <div className="flex-1 p-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col" style={{ minHeight: 'calc(100vh - 48px)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-800">RDV retrait</h2>
            <div className="border border-gray-300 rounded px-6 py-1 text-lg font-bold text-gray-700">
              {new Date().getFullYear()}
            </div>
          </div>
          <div className="flex-1">
            <CalendarView ventes={allVentes} />
          </div>
        </div>
      </div>
    </div>
  );
}
