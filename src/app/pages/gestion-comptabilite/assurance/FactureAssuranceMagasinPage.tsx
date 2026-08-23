import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Search, X, Plus, Edit, Trash2, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { AddButton } from '../../../components/AddButton';
import { useLiveData } from '../../../hooks/useLiveData';

const MAGASIN_LABELS: Record<string, string> = {
  abobo: 'ABOBO', faya: 'FAYA', koumassi: 'KOUMASSI', palmeraie: 'PALMERAIE', yopougon: 'YOPOUGON',
};
const MAGASIN_COLORS: Record<string, string> = {
  abobo: '#2563eb', faya: '#16a34a', koumassi: '#d97706', palmeraie: '#7c3aed', yopougon: '#1a7a96',
};

const LS_KEY = (id: string) => `leclaire_factures_assurance_${id}`;
const genRef = () => `FA-${Date.now().toString().slice(-5)}`;

const ASSURANCES = ['CNPS', 'MUGEFCI', 'PRIMA', 'NSIA', 'SUNU', 'AXA', 'Allianz'];
const STATUTS = ['En attente', 'Payée', 'Rejetée'];

interface FactureAss extends AuditInfo {
  id: string;
  numeroFacture: string;
  assurance: string;
  client: string;
  montant: number;
  dateFacture: string;
  statut: string;
  description: string;
}

function ModalFacture({ initial, onSave, onClose }: { initial?: FactureAss; onSave: (f: FactureAss) => void; onClose: () => void }) {
  const [form, setForm] = useState<FactureAss>(initial ?? {
    id: Date.now().toString(), numeroFacture: genRef(), assurance: '', client: '',
    montant: 0, dateFacture: new Date().toISOString().slice(0, 10), statut: 'En attente', description: '',
  });
  const set = (k: keyof FactureAss) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-800">{initial ? 'Modifier' : 'Nouvelle'} Facture Assurance</span>
          <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">N° Facture</label>
            <input className={iCls + ' bg-gray-50'} readOnly value={form.numeroFacture} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Assurance <span className="text-red-500">*</span></label>
            <select className={iCls} value={form.assurance} onChange={set('assurance')}>
              <option value="">-- Choisir --</option>
              {ASSURANCES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Client <span className="text-red-500">*</span></label>
            <input className={iCls} value={form.client} onChange={set('client')} placeholder="Nom du client..." />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Montant (F CFA)</label>
            <input type="number" className={iCls} value={form.montant} onChange={set('montant')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Date de Facture</label>
            <input type="date" className={iCls} value={form.dateFacture} onChange={set('dateFacture')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Statut</label>
            <select className={iCls} value={form.statut} onChange={set('statut')}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Description</label>
            <textarea className={iCls + ' resize-none'} rows={3} value={form.description} onChange={set('description')} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
          <button onClick={() => { if (!form.assurance || !form.client) { alert('Assurance et Client requis'); return; } onSave(form); onClose(); }}
            className="px-4 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#1a7a96' }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

export function FactureAssuranceMagasinPage() {
  const navigate = useNavigate();
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const label = MAGASIN_LABELS[magasinId] ?? magasinId.toUpperCase();
  const color = MAGASIN_COLORS[magasinId] ?? '#1a7a96';

  // Source de vérité Firestore (lecture + écriture directes, temps réel).
  const [factures, setFactures] = useLiveData<FactureAss>(LS_KEY(magasinId), []);
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [date, setDate] = useState('');
  const [filtered, setFiltered] = useState<FactureAss[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: FactureAss } | null>(null);

  // Garde la liste filtrée alignée sur la donnée temps réel.
  useEffect(() => {
    setFiltered(factures);
  }, [factures]);

  const runFilter = () => {
    setFiltered(factures.filter(f => {
      if (search && ![f.client, f.numeroFacture, f.assurance].some(v => v.toLowerCase().includes(search.toLowerCase()))) return false;
      if (statut && f.statut !== statut) return false;
      if (date && f.dateFacture !== date) return false;
      return true;
    }));
  };

  const handleSave = (f: FactureAss) => {
    const exists = factures.find(x => x.id === f.id);
    const factureWithAudit = exists ? addUpdateAudit(f) : addCreateAudit(f);
    const next = exists ? factures.map(x => x.id === f.id ? factureWithAudit : x) : [factureWithAudit, ...factures];
    setFactures(next); setFiltered(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer cette facture ?')) return;
    const next = factures.filter(f => f.id !== id);
    setFactures(next); setFiltered(next);
  };

  const statusColor = (s: string) => ({ 'En attente': '#d97706', 'Payée': '#16a34a', 'Rejetée': '#dc2626' }[s] ?? '#6b7280');
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';

  return (
    <div className="flex flex-col gap-6 p-6" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <ModalFacture initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/comptabilite/assurance/factures')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Factures Assurance — <span style={{ color }}>{label}</span></h1>
          <p className="text-sm text-gray-500 mt-0.5">{factures.length} facture(s) enregistrée(s)</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Liste des Factures</h2>
          <AddButton onClick={() => setModal({ mode: 'add' })} className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
            <Plus size={15} /> Nouvelle Facture
          </AddButton>
        </div>

        {/* Filter bar */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Recherche</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input className="px-2 py-1.5 text-sm outline-none flex-1" style={{ width: 220 }} placeholder="Client, N° Facture, Assurance..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="px-2 text-gray-400"><X size={13} /></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Statut</label>
            <select className={iCls} style={{ width: 140 }} value={statut} onChange={e => setStatut(e.target.value)}>
              <option value="">Tous</option>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Date</label>
            <input type="date" className={iCls} style={{ width: 140 }} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <button onClick={runFilter} className="px-3 py-1.5 rounded text-white text-sm font-semibold flex items-center gap-1" style={{ backgroundColor: '#1a7a96' }}>
            <Search size={14} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1 text-gray-400 self-end">
            <button className="p-1 hover:text-gray-700"><ChevronFirst size={15} /></button>
            <button className="p-1 hover:text-gray-700"><ChevronLeft size={15} /></button>
            <button className="p-1 hover:text-gray-700"><ChevronRight size={15} /></button>
            <button className="p-1 hover:text-gray-700"><ChevronLast size={15} /></button>
          </div>
        </div>

        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="text-left px-4 py-2.5 w-10">#</th>
                <th className="text-left px-4 py-2.5">N° Facture</th>
                <th className="text-left px-4 py-2.5">Assurance</th>
                <th className="text-left px-4 py-2.5">Client</th>
                <th className="text-right px-4 py-2.5">Montant</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Statut</th>
                <th className="text-left px-4 py-2.5">Créé par</th>
                <th className="text-left px-4 py-2.5">Modifié par</th>
                <th className="text-center px-4 py-2.5">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">Aucune facture assurance</td></tr>
              ) : filtered.map((f, i) => (
                <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-blue-700">{f.numeroFacture}</td>
                  <td className="px-4 py-2 font-semibold">{f.assurance}</td>
                  <td className="px-4 py-2 text-gray-800">{f.client}</td>
                  <td className="px-4 py-2 text-right font-semibold">{f.montant.toLocaleString('fr-FR')} F CFA</td>
                  <td className="px-4 py-2 text-gray-600">{f.dateFacture ? new Date(f.dateFacture).toLocaleDateString('fr-FR') : '—'}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: statusColor(f.statut) }}>{f.statut}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {f.createdBy ? (
                      <div>
                        <div className="font-medium">{f.createdBy}</div>
                        <div className="text-gray-400">{formatDate(f.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {f.updatedBy ? (
                      <div>
                        <div className="font-medium">{f.updatedBy}</div>
                        <div className="text-gray-400">{formatDate(f.updatedAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setModal({ mode: 'edit', item: f })} className="text-blue-500 hover:text-blue-700 p-1"><Edit size={13} /></button>
                      <button onClick={() => handleDelete(f.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
