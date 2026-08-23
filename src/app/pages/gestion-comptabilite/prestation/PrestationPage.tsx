import { useState, useMemo } from 'react';
import { Search, X, Edit, Trash2, Calendar, Download } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { useLiveData } from '../../../hooks/useLiveData';
import { AddButton } from '../../../components/AddButton';
import { TENANT } from '../../../config/tenant';

const genRef = () => String(Date.now()).slice(-5).padStart(5, '0');

const PRESTATAIRES = ['PRESTATAIRE A', 'PRESTATAIRE B', 'PRESTATAIRE C', 'AUTRE'];
const NATURES = ['Entretien', 'Réparation', 'Maintenance', 'Formation', 'Consultation', 'Transport', 'Autre'];
const ANNEES = ['2024', '2025', '2026'];

interface Prestation extends AuditInfo {
  id: string; reference: string; prestataire: string; nature: string;
  datePrestation: string; montant: number; acompte: number; totalReste: number;
  dateLimite: string; commentaire: string; statut: 'Réglée' | 'Non réglée';
}

// ── Ajouter Prestation modal (Image 6) ────────────────────────────────────────
function AjouterPrestation({ initial, onSave, onClose }: { initial?: Prestation; onSave: (p: Prestation) => void; onClose: () => void }) {
  const [form, setForm] = useState<Prestation>(initial ?? {
    id: Date.now().toString(), reference: genRef(), prestataire: '', nature: '',
    datePrestation: '', montant: 0, acompte: 0, totalReste: 0,
    dateLimite: '', commentaire: '', statut: 'Non réglée',
  });
  const set = (k: keyof Prestation) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const doSave = () => {
    if (!form.prestataire || !form.nature) { alert('Prestataire et Nature requis'); return; }
    onSave(form); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4">
        {/* Dark blue header */}
        <div className="flex items-center justify-between px-5 py-3 rounded-t-xl" style={{ backgroundColor: '#1e3a5f' }}>
          <span className="text-base font-semibold text-white">Ajouter Prestation</span>
          <button onClick={onClose} className="text-white hover:text-gray-300"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {/* Row 1: Référence | Prestataire | Nature | Date Prestation | Montant */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Référence <span className="text-red-500">*</span></label>
              <input className={iCls + ' bg-gray-50'} readOnly value={form.reference} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Prestataire <span className="text-red-500">*</span></label>
              <select className={iCls} value={form.prestataire} onChange={set('prestataire')}>
                <option value="">Prestataire</option>
                {PRESTATAIRES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Nature <span className="text-red-500">*</span></label>
              <select className={iCls} value={form.nature} onChange={set('nature')}>
                <option value=""></option>
                {NATURES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Date Prestation <span className="text-red-500">*</span></label>
              <input type="date" className={iCls} value={form.datePrestation} onChange={set('datePrestation')} placeholder="jj/mm/aaaa" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Montant <span className="text-red-500">*</span></label>
              <input type="number" className={iCls} value={form.montant} onChange={set('montant')} />
            </div>
          </div>
          {/* Row 2: Date Limite | Commentaire | Pièce Jointe */}
          <div className="flex gap-3">
            <div style={{ width: 160, flexShrink: 0 }}>
              <label className="text-xs text-gray-600 mb-1 block">Date Limite <span className="text-red-500">*</span></label>
              <input type="date" className={iCls} value={form.dateLimite} onChange={set('dateLimite')} placeholder="jj/mm/aaaa" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-600 mb-1 block font-semibold">Commentaire</label>
              <textarea className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full resize-none" rows={3} value={form.commentaire} onChange={set('commentaire')} />
            </div>
            <div style={{ width: 80, flexShrink: 0 }}>
              <label className="text-xs text-gray-600 mb-1 block">Pièce Jointe</label>
              <button className="w-full h-12 flex items-center justify-center border border-gray-300 rounded" style={{ backgroundColor: '#fef3c7' }}>
                <Download size={20} className="text-gray-600" />
              </button>
            </div>
          </div>
          {/* Dashed separator */}
          <div className="border-t border-dashed border-gray-300" />
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-5 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button onClick={doSave} className="px-5 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#2563eb' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

export function PrestationPage() {
  const [prestations, setPrestations] = useLiveData<Prestation>('leclaire_prestations');
  const [search, setSearch] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [annee, setAnnee] = useState('2026');
  const [filterPrestataire, setFilterPrestataire] = useState('');
  const [filtered, setFiltered] = useState<Prestation[]>(prestations);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Prestation } | null>(null);

  const recap = useMemo(() => {
    const reg = prestations.filter(p => p.statut === 'Réglée');
    const pas = prestations.filter(p => p.statut !== 'Réglée');
    return {
      total: prestations.length, totalMontant: prestations.reduce((s, p) => s + p.montant, 0),
      regles: reg.length, sumRegles: reg.reduce((s, p) => s + p.montant, 0),
      pasRegles: pas.length, sumPasRegles: pas.reduce((s, p) => s + p.montant, 0),
    };
  }, [prestations]);

  const fmt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} F CFA`;

  const runFilter = () => setFiltered(prestations.filter(p => {
    if (search && ![p.reference, p.prestataire, p.nature].some(v => v.toLowerCase().includes(search.toLowerCase()))) return false;
    if (dateDebut && p.datePrestation < dateDebut) return false;
    if (dateFin && p.datePrestation > dateFin) return false;
    return true;
  }));

  const handleSave = (p: Prestation) => {
    const isUpdate = prestations.find(x => x.id === p.id);
    const prestationWithAudit = isUpdate ? addUpdateAudit(p) : addCreateAudit(p);
    const next = isUpdate ? prestations.map(x => x.id === p.id ? prestationWithAudit : x) : [prestationWithAudit, ...prestations];
    setPrestations(next); setFiltered(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer cette prestation ?')) return;
    const next = prestations.filter(p => p.id !== id);
    setPrestations(next); setFiltered(next);
  };

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <AjouterPrestation initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* Header bar */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center"><Calendar size={15} className="text-gray-600" /></div>
          <span className="text-sm font-semibold text-gray-600">Gestion Comptabilité: {TENANT.nom}</span>
        </div>
        <AddButton onClick={() => setModal({ mode: 'add' })} className="px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#0d9488' }}>
          Ajouter Prestation
        </AddButton>
      </div>

      {/* Left + Right recap */}
      <div className="flex gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2" style={{ minWidth: 170 }}>
          <div className="flex items-center justify-center w-10 h-10 rounded bg-gray-100 mx-auto mb-1">
            <Calendar size={20} className="text-gray-500" />
          </div>
          <div className="flex items-center gap-1">
            <select className="flex-1 text-sm border border-gray-200 rounded px-1.5 py-1 outline-none bg-white" value={annee} onChange={e => setAnnee(e.target.value)}>
              {ANNEES.map(a => <option key={a}>{a}</option>)}
            </select>
            <X size={12} className="text-gray-400 cursor-pointer flex-shrink-0" />
          </div>
          <select className="text-sm border border-gray-200 rounded px-1.5 py-1 outline-none bg-white w-full" value={filterPrestataire} onChange={e => setFilterPrestataire(e.target.value)}>
            <option value="">Prestataire</option>
            {PRESTATAIRES.map(p => <option key={p}>{p}</option>)}
          </select>
          <button onClick={runFilter} className="flex items-center justify-center py-1.5 rounded text-white" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <div className="text-sm font-bold text-gray-700 text-right tracking-wide">
            RÉCAPITULATIF PRESTATIONS ({recap.total}) | ANNÉE: {annee}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: `Total Prestation ${recap.total}`, val: recap.totalMontant, border: '#2563eb' },
              { label: `Total Prestation Réglées ${recap.regles}`, val: recap.sumRegles, border: '#16a34a' },
              { label: `Total Prestation Pas réglées ${recap.pasRegles}`, val: recap.sumPasRegles, border: '#dc2626' },
            ].map(({ label, val, border }) => (
              <div key={label} className="bg-white rounded p-4 border-2" style={{ borderColor: border }}>
                <div className="text-xs font-semibold text-gray-700 mb-2">{label}</div>
                <div className="text-base font-bold text-gray-900">{fmt(val)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table panel */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
        <div className="text-sm font-bold text-gray-800">Prestation ({filtered.length})</div>

        {/* Filter bar */}
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">Infos Prestations</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input className="px-2 py-1.5 text-sm outline-none" style={{ width: 180 }} placeholder="Recherche..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">Date Début</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} value={dateDebut} onChange={e => setDateDebut(e.target.value)} placeholder="jj/mm/aaaa" />
              {dateDebut && <button onClick={() => setDateDebut('')} className="px-1 text-gray-400"><X size={12} /></button>}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">Date Fin</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} value={dateFin} onChange={e => setDateFin(e.target.value)} placeholder="jj/mm/aaaa" />
              {dateFin && <button onClick={() => setDateFin('')} className="px-1 text-gray-400"><X size={12} /></button>}
            </div>
          </div>
          <button onClick={runFilter} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
          <div className="flex-1" />
          <div className="flex items-center gap-0.5 text-xs text-gray-500 self-end">
            {['<<', '<', '1', '>', '>>'].map((s, i) => (
              <button key={i} className={`px-1.5 py-0.5 border rounded hover:bg-gray-100 ${s === '1' ? 'border-blue-500 text-blue-600 font-bold' : 'border-gray-300'}`}>{s}</button>
            ))}
          </div>
        </div>

        <div className="border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="px-2 py-2.5 w-8"><input type="checkbox" /></th>
                <th className="text-left px-2 py-2.5">N° Prestation</th>
                <th className="text-left px-2 py-2.5">Prestataire</th>
                <th className="text-left px-2 py-2.5">Nature</th>
                <th className="text-right px-2 py-2.5">Total Net</th>
                <th className="text-right px-2 py-2.5">Acompte</th>
                <th className="text-right px-2 py-2.5 bg-red-50">Total Reste</th>
                <th className="text-left px-2 py-2.5">Date Limite</th>
                <th className="text-left px-2 py-2.5">Commentaire</th>
                <th className="text-left px-2 py-2.5">Créé par</th>
                <th className="text-left px-2 py-2.5">Modifié par</th>
                <th className="text-center px-2 py-2.5">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={12} className="text-center py-10 text-gray-400">Aucune prestation</td></tr>
                : filtered.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-2 text-center"><input type="checkbox" /></td>
                    <td className="px-2 py-2 font-mono text-blue-700">{p.reference}</td>
                    <td className="px-2 py-2 font-semibold">{p.prestataire}</td>
                    <td className="px-2 py-2 text-gray-600">{p.nature}</td>
                    <td className="px-2 py-2 text-right">{p.montant.toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-right">{p.acompte.toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-right bg-red-50">{p.totalReste.toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-gray-600 text-xs">{p.dateLimite ? new Date(p.dateLimite).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="px-2 py-2 text-gray-500 max-w-xs truncate">{p.commentaire || '—'}</td>
                    <td className="px-2 py-2 text-xs text-gray-600">
                      {p.createdBy ? (
                        <div>
                          <div className="font-medium">{p.createdBy}</div>
                          <div className="text-gray-400">{formatDate(p.createdAt)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">
                      {p.updatedBy ? (
                        <div>
                          <div className="font-medium">{p.updatedBy}</div>
                          <div className="text-gray-400">{formatDate(p.updatedAt)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setModal({ mode: 'edit', item: p })} className="text-blue-500 hover:text-blue-700 p-1"><Edit size={13} /></button>
                        <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
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
