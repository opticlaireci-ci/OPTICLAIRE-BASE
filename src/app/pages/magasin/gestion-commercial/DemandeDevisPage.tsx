import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Search, X, Plus, Edit, Trash2, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { useSupabaseSync } from '../../../hooks/useSupabaseSync';
import { useLiveData } from '../../../hooks/useLiveData';
import { useAuth } from '../../../contexts/AuthContext';
import { AddButton } from '../../../components/AddButton';

// ── helpers ───────────────────────────────────────────────────────────────────
const genRef = () => `DD-${Date.now().toString().slice(-5)}`;
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '';

// ── types ──────────────────────────────────────────────────────────────────────
interface DemandeDevis extends AuditInfo {
  id: string;
  numReference: string;
  client: string;
  commentaire: string;
  statut: string;
  date: string;
}

// ── styles ───────────────────────────────────────────────────────────────────
const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
const selCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';

const STATUTS = ['En cours', 'Enregistré', 'Traité', 'En attente', 'Annulé'];

// ── Modal nouvelle demande ────────────────────────────────────────────────────
function ModalDemande({ initial, onSave, onClose }: { initial?: DemandeDevis; onSave: (d: DemandeDevis) => void; onClose: () => void }) {
  const [form, setForm] = useState<DemandeDevis>(initial ?? {
    id: Date.now().toString(), numReference: genRef(), client: '', commentaire: '', statut: 'En cours', date: new Date().toISOString().slice(0, 10),
  });
  const set = (k: keyof DemandeDevis) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-800">{initial ? 'Modifier' : 'Nouvelle'} Demande de Devis</span>
          <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">N° Référence</label>
            <input className={iCls + ' w-full bg-gray-50'} readOnly value={form.numReference} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Client <span className="text-red-500">*</span></label>
            <input className={iCls + ' w-full'} placeholder="Nom du client..." value={form.client} onChange={set('client')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Date</label>
            <input type="date" className={iCls + ' w-full'} value={form.date} onChange={set('date')} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Statut</label>
            <select className={selCls + ' w-full'} value={form.statut} onChange={set('statut')}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Commentaire</label>
            <textarea className={iCls + ' w-full resize-none'} rows={3} value={form.commentaire} onChange={set('commentaire')} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
          <button onClick={() => { if (!form.client) { alert('Client requis'); return; } onSave(form); onClose(); }}
            className="px-4 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#1a7a96' }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Barre de filtre ───────────────────────────────────────────────────────────
function FilterBar({ search, setSearch, statut, setStatut, date, setDate, onSearch }: {
  search: string; setSearch: (v: string) => void;
  statut: string; setStatut: (v: string) => void;
  date: string; setDate: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Infos Client Demande Devis...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input className="px-2 py-1.5 text-sm outline-none flex-1" style={{ width: 220 }} placeholder="Infos Client  Demande Devis..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="px-2 text-gray-400 hover:text-gray-700"><X size={13} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Statut</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <select className="px-2 py-1.5 text-sm outline-none flex-1 bg-white" value={statut} onChange={e => setStatut(e.target.value)} style={{ width: 140 }}>
            {STATUTS.map(s => <option key={s}>{s}</option>)}
          </select>
          {statut !== STATUTS[0] && <button onClick={() => setStatut(STATUTS[0])} className="px-2 text-gray-400 hover:text-gray-700"><X size={13} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Date</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1.5 text-sm outline-none bg-white" value={date} onChange={e => setDate(e.target.value)} style={{ width: 140 }} />
          {date && <button onClick={() => setDate('')} className="px-2 text-gray-400 hover:text-gray-700"><X size={13} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">...</label>
        <button onClick={onSearch} className="px-4 py-1.5 rounded text-white text-sm font-semibold flex items-center gap-1" style={{ backgroundColor: '#1a7a96' }}>
          <Search size={14} />
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1 text-gray-400 self-end pb-0.5">
        <button className="p-1 hover:text-gray-700"><ChevronFirst size={16} /></button>
        <button className="p-1 hover:text-gray-700"><ChevronLeft size={16} /></button>
        <button className="p-1 hover:text-gray-700"><ChevronRight size={16} /></button>
        <button className="p-1 hover:text-gray-700"><ChevronLast size={16} /></button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DemandeDevisPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Seul l'admin peut supprimer une demande de devis.
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  // Lecture + écriture DIRECTES Firestore (partagé entre navigateurs), 1 doc par magasin.
  const [demandes, setDemandes] = useLiveData<DemandeDevis>(`leclaire_demande_devis_${magasinId}`, []);
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState(STATUTS[0]);
  const [date, setDate] = useState('');
  const [filtered, setFiltered] = useState<DemandeDevis[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: DemandeDevis } | null>(null);

  // Le filtre suit la source de vérité Firestore (mise à jour temps réel).
  useEffect(() => {
    setFiltered(demandes);
  }, [demandes]);

  const runFilter = () => {
    setFiltered(demandes.filter(d => {
      const matchSearch = !search || [d.client, d.numReference, d.commentaire].some(v => v.toLowerCase().includes(search.toLowerCase()));
      const matchStatut = d.statut === statut;
      const matchDate = !date || d.date === date;
      return matchSearch && matchStatut && matchDate;
    }));
  };

  const handleSave = (d: DemandeDevis) => {
    const existing = demandes.find(x => x.id === d.id);
    // Ajouter les informations d'audit
    const demandeWithAudit = existing ? addUpdateAudit(d) : addCreateAudit(d);
    const next = existing ? demandes.map(x => x.id === d.id ? demandeWithAudit : x) : [demandeWithAudit, ...demandes];
    setDemandes(next);
    setFiltered(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer cette demande ?')) return;
    const next = demandes.filter(d => d.id !== id);
    setDemandes(next);
    setFiltered(next);
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { 'En cours': '#2563eb', 'Enregistré': '#7c3aed', 'Traité': '#16a34a', 'En attente': '#d97706', 'Annulé': '#dc2626' };
    return map[s] ?? '#6b7280';
  };

  return (
    <div className="flex flex-col gap-6 p-6" style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
      {modal && (
        <ModalDemande
          initial={modal.item}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-5">
        {/* Titre */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">Demandes Devis ({demandes.length})</h1>
          <AddButton
            onClick={() => navigate(`/magasin/${magasinId}/commercial/devis-proforma`)}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold"
            style={{ backgroundColor: '#1a7a96' }}
          >
            <Plus size={15} /> Nouvelle demande
          </AddButton>
        </div>

        {/* Filtre */}
        <FilterBar search={search} setSearch={setSearch} statut={statut} setStatut={setStatut} date={date} setDate={setDate} onSearch={runFilter} />

        {/* Tableau */}
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-semibold">
                <th className="text-left px-4 py-2.5 w-10">#</th>
                <th className="text-left px-4 py-2.5">N° Référence</th>
                <th className="text-left px-4 py-2.5">Client</th>
                <th className="text-left px-4 py-2.5">Commentaire</th>
                <th className="text-left px-4 py-2.5">Statut</th>
                <th className="text-left px-4 py-2.5">Créé par</th>
                <th className="text-left px-4 py-2.5">Modifié par</th>
                <th className="text-left px-4 py-2.5">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">Aucune demande de devis</td></tr>
              ) : filtered.map((d, i) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-blue-700">{d.numReference}</td>
                  <td className="px-4 py-2 font-semibold text-gray-800">{d.client}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-xs truncate">{d.commentaire || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: statusColor(d.statut) }}>
                      {d.statut}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {d.createdBy ? (
                      <div>
                        <div className="font-medium">{d.createdBy}</div>
                        <div className="text-gray-400">{formatDate(d.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {d.updatedBy ? (
                      <div>
                        <div className="font-medium">{d.updatedBy}</div>
                        <div className="text-gray-400">{formatDate(d.updatedAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setModal({ mode: 'edit', item: d })} className="text-blue-500 hover:text-blue-700 p-1" title="Modifier">
                        <Edit size={14} />
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDelete(d.id)} className="text-red-500 hover:text-red-700 p-1" title="Supprimer">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Deuxième barre de filtre (pagination basse) */}
        <FilterBar search={search} setSearch={setSearch} statut={statut} setStatut={setStatut} date={date} setDate={setDate} onSearch={runFilter} />
      </div>
    </div>
  );
}
