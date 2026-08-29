import { useState, useMemo } from 'react';
import { useParams } from 'react-router';
import { Search, X, Edit, Trash2, Plus, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { useLiveData } from '../../../hooks/useLiveData';
import { AddButton } from '../../../components/AddButton';

// ── types ─────────────────────────────────────────────────────────────────────
interface RdvEnLigne extends AuditInfo {
  id: string;
  numRef: string;
  client: string;
  telephone: string;
  motif: string;
  commentaire: string;
  rendezVous: string;
  date: string;
  statut: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const LS_KEY = (id: string) => `leclaire_rdv_enligne_${id}`;
const genRef = () => `RDV-${Date.now().toString().slice(-5)}`;
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const STATUTS = ['En attente', 'Confirmé', 'Annulé', 'Effectué'];
const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white focus:border-blue-400 w-full';
const selCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white focus:border-blue-400 w-full';

const statusColor = (s: string) => {
  const map: Record<string, string> = { 'Confirmé': '#16a34a', 'Annulé': '#dc2626', 'En attente': '#d97706', 'Effectué': '#2563eb' };
  return map[s] ?? '#6b7280';
};

const PAGE = 20;

// ── Modal ─────────────────────────────────────────────────────────────────────
function ModalRdv({ initial, onSave, onClose }: { initial?: RdvEnLigne; onSave: (d: RdvEnLigne) => void; onClose: () => void }) {
  const [form, setForm] = useState<RdvEnLigne>(initial ?? {
    id: Date.now().toString(), numRef: genRef(), client: '', telephone: '', motif: '',
    commentaire: '', rendezVous: '', date: new Date().toISOString().slice(0, 10), statut: 'En attente',
  });
  const set = (k: keyof RdvEnLigne) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-800">{initial ? 'Modifier' : 'Nouveau'} RDV En Ligne</span>
          <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">N° Référence</label>
            <input className={iCls + ' bg-gray-50'} readOnly value={form.numRef} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Client <span className="text-red-500">*</span></label>
            <input className={iCls} placeholder="Nom du client..." value={form.client} onChange={set('client')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Téléphone</label>
            <input type="tel" className={iCls} placeholder="Ex : 07 00 00 00 00" value={form.telephone} onChange={set('telephone')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Motif</label>
            <input className={iCls} placeholder="Motif du RDV..." value={form.motif} onChange={set('motif')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Rendez-vous</label>
            <input type="date" className={iCls} value={form.rendezVous} onChange={set('rendezVous')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Statut</label>
            <select className={selCls} value={form.statut} onChange={set('statut')}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Commentaire</label>
            <textarea className={iCls + ' resize-none'} rows={3} value={form.commentaire} onChange={set('commentaire')} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
          <button
            onClick={() => { if (!form.client) { alert('Client requis'); return; } onSave(form); onClose(); }}
            className="px-4 py-2 rounded text-sm text-white font-semibold"
            style={{ backgroundColor: '#1a7a96' }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  infos, setInfos, date, setDate, rdv, setRdv, onSearch,
  page, totalPages, goPage,
}: {
  infos: string; setInfos: (v: string) => void;
  date: string; setDate: (v: string) => void;
  rdv: string; setRdv: (v: string) => void;
  onSearch: () => void;
  page: number; totalPages: number; goPage: (p: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Infos Client...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input className="px-2 py-1.5 text-sm outline-none bg-transparent" style={{ width: 240 }}
            placeholder="Infos Client..." value={infos} onChange={e => setInfos(e.target.value)} />
          {infos && <button onClick={() => setInfos('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Date</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1.5 text-sm outline-none bg-transparent" style={{ width: 155 }}
            value={date} onChange={e => setDate(e.target.value)} />
          {date && <button onClick={() => setDate('')} className="px-1 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Rendez-vous</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1.5 text-sm outline-none bg-transparent" style={{ width: 155 }}
            value={rdv} onChange={e => setRdv(e.target.value)} />
          {rdv && <button onClick={() => setRdv('')} className="px-1 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">...</label>
        <button onClick={onSearch} className="px-4 py-1.5 rounded text-white flex items-center gap-1" style={{ backgroundColor: '#1a7a96' }}>
          <Search size={14} />
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1 text-gray-500 self-end">
        <button onClick={() => goPage(1)} disabled={page === 1} className="p-1 disabled:opacity-30"><ChevronFirst size={14} /></button>
        <button onClick={() => goPage(page - 1)} disabled={page === 1} className="p-1 disabled:opacity-30"><ChevronLeft size={14} /></button>
        <button onClick={() => goPage(page + 1)} disabled={page === totalPages} className="p-1 disabled:opacity-30"><ChevronRight size={14} /></button>
        <button onClick={() => goPage(totalPages)} disabled={page === totalPages} className="p-1 disabled:opacity-30"><ChevronLast size={14} /></button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function RdvEnLigneMagasinPage() {
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const [rdvs, setRdvs] = useLiveData<RdvEnLigne>(LS_KEY(magasinId), []);
  const [infos, setInfos] = useState('');
  const [date, setDate] = useState('');
  const [rdv, setRdv] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ item?: RdvEnLigne } | null>(null);

  const filtered = useMemo(() => rdvs.filter(r => {
    const matchInfos = !infos || [r.client, r.numRef, r.telephone, r.motif, r.commentaire].some(v => (v || '').toLowerCase().includes(infos.toLowerCase()));
    const matchDate = !date || r.date === date;
    const matchRdv = !rdv || r.rendezVous === rdv;
    return matchInfos && matchDate && matchRdv;
  }), [rdvs, infos, date, rdv]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const goPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));
  const pageData = filtered.slice((page - 1) * PAGE, page * PAGE);

  const handleSave = (item: RdvEnLigne) => {
    const isUpdate = rdvs.find(r => r.id === item.id);
    const rdvWithAudit = isUpdate ? addUpdateAudit(item) : addCreateAudit(item);
    const next = isUpdate
      ? rdvs.map(r => r.id === item.id ? rdvWithAudit : r)
      : [rdvWithAudit, ...rdvs];
    setRdvs(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer ce RDV ?')) return;
    const next = rdvs.filter(r => r.id !== id);
    setRdvs(next);
  };

  return (
    <div className="flex flex-col gap-4 p-6" style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
      {modal && (
        <ModalRdv
          initial={modal.item}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
        {/* Title + Add */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 style={{ fontSize: 'clamp(14px,3.5vw,18px)' }} className="font-bold text-gray-800">RDV En Ligne ({rdvs.length})</h1>
          <AddButton onClick={() => setModal({})}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-white text-sm font-semibold"
            style={{ backgroundColor: '#1a7a96' }}>
            <Plus size={14} /> Nouveau RDV
          </AddButton>
        </div>

        {/* Top filter bar */}
        <FilterBar
          infos={infos} setInfos={setInfos}
          date={date} setDate={setDate}
          rdv={rdv} setRdv={setRdv}
          onSearch={() => setPage(1)}
          page={page} totalPages={totalPages} goPage={goPage}
        />

        {/* Table — desktop */}
        <div className="hidden md:block border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700 w-10">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700" style={{ minWidth: 120 }}>N° Référence</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700" style={{ minWidth: 140 }}>Client</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700" style={{ minWidth: 120 }}>Téléphone</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700" style={{ minWidth: 120 }}>Motif</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700" style={{ minWidth: 180 }}>Commentaire</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700" style={{ minWidth: 110 }}>Rendez-vous</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700" style={{ minWidth: 100 }}>Statut</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Créé par</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Modifié par</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700 w-24">Édition</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">Aucun RDV en ligne enregistré</td></tr>
              ) : pageData.map((r, i) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 text-xs">{(page - 1) * PAGE + i + 1}</td>
                  <td className="px-3 py-2 font-mono text-blue-700 text-xs">{r.numRef}</td>
                  <td className="px-3 py-2 font-semibold text-gray-800">{r.client}</td>
                  <td className="px-3 py-2 text-gray-700">{r.telephone ? <a href={`tel:${r.telephone}`} className="text-blue-600 hover:underline">{r.telephone}</a> : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.motif || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{r.commentaire || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.rendezVous ? fmt(r.rendezVous) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: statusColor(r.statut) }}>
                      {r.statut}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {r.createdBy ? (
                      <div>
                        <div className="font-medium">{r.createdBy}</div>
                        <div className="text-gray-400">{formatDate(r.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {r.updatedBy ? (
                      <div>
                        <div className="font-medium">{r.updatedBy}</div>
                        <div className="text-gray-400">{formatDate(r.updatedAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setModal({ item: r })} className="p-1 rounded border border-gray-300 text-amber-500 hover:bg-amber-50"><Edit size={11} /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-1 rounded border border-gray-300 text-red-400 hover:bg-red-50"><Trash2 size={11} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cartes — mobile */}
        <div className="md:hidden flex flex-col gap-3">
          {pageData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: '#9ca3af', fontSize: 14 }}>Aucun RDV en ligne enregistré</div>
          ) : pageData.map((r) => (
            <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }}>
              {/* Card header: date RDV + client + téléphone */}
              <div style={{ padding: '10px 14px', backgroundColor: '#f0f9ff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{r.client}</div>
                  {r.telephone ? (
                    <a href={`tel:${r.telephone}`} style={{ fontSize: 13, fontWeight: 700, color: '#1a7a96', textDecoration: 'none' }}>{r.telephone}</a>
                  ) : (
                    <span style={{ fontSize: 13, color: '#6b7280' }}>—</span>
                  )}
                </div>
                <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#fff', backgroundColor: statusColor(r.statut) }}>
                  {r.statut}
                </span>
              </div>
              {/* Card body */}
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>Réf : {r.numRef}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: '#374151' }}>Date : {r.date ? fmt(r.date) : '—'}</div>
                  <div style={{ fontSize: 12, color: '#374151' }}>RDV : {r.rendezVous ? fmt(r.rendezVous) : '—'}</div>
                </div>
                {r.motif && <div style={{ fontSize: 12, color: '#374151' }}>Motif : {r.motif}</div>}
                {r.commentaire && <div style={{ fontSize: 12, color: '#6b7280' }}>{r.commentaire}</div>}
              </div>
              {/* Card actions */}
              <div style={{ padding: '8px 14px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
                <button onClick={() => setModal({ item: r })} className="p-1.5 rounded border border-amber-300 text-amber-600 flex items-center gap-1" style={{ fontSize: 12 }}>
                  <Edit size={12} /> Modifier
                </button>
                <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded border border-red-300 text-red-500 flex items-center gap-1" style={{ fontSize: 12 }}>
                  <Trash2 size={12} /> Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom filter bar */}
        <FilterBar
          infos={infos} setInfos={setInfos}
          date={date} setDate={setDate}
          rdv={rdv} setRdv={setRdv}
          onSearch={() => setPage(1)}
          page={page} totalPages={totalPages} goPage={goPage}
        />
      </div>
    </div>
  );
}
