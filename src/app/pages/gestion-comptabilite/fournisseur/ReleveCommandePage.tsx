import { useState, useMemo } from 'react';
import { Search, X, Plus, Edit, Trash2, Calendar } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { useLiveData } from '../../../hooks/useLiveData';
import { AddButton } from '../../../components/AddButton';
import { TENANT, libellesMagasins } from '../../../config/tenant';

const genRef = () => String(Date.now()).slice(-5).padStart(5, '0');

// Direction + tous les magasins configurés (voir src/app/config/tenant.ts).
const OFFICINES = [TENANT.nom, ...libellesMagasins()];
const FOURNISSEURS = ['BBGR', 'ESSILOR', 'HOYA', 'NIKON', 'ZEISS', 'RODENSTOCK'];
const ANNEES = ['2024', '2025', '2026'];

interface Releve extends AuditInfo {
  id: string; reference: string; officine: string; fournisseur: string;
  edition: string; totalNet: number; acompte: number; totalReste: number;
  statut: 'Réglé' | 'Non réglé';
}

function NouveauReleve({ initial, onSave, onClose }: { initial?: Releve; onSave: (r: Releve) => void; onClose: () => void }) {
  const [form, setForm] = useState<Releve>(initial ?? {
    id: Date.now().toString(), reference: genRef(), officine: TENANT.nom,
    fournisseur: '', edition: new Date().toISOString().slice(0, 10),
    totalNet: 0, acompte: 0, totalReste: 0, statut: 'Non réglé',
  });
  const set = (k: keyof Releve) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const doSave = () => { if (!form.fournisseur) { alert('Fournisseur requis'); return; } onSave(form); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-semibold text-gray-600">Gestion Comptabilité: {TENANT.nom}</span>
          <div className="flex items-center gap-3">
            <button onClick={doSave} className="px-4 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#0d9488' }}>
              Nouveau Relevé Verriers
            </button>
            <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto flex-1 min-h-0 flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Référence <span className="text-red-500">*</span></label>
              <input className={iCls + ' bg-gray-50'} readOnly value={form.reference} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Officine <span className="text-red-500">*</span></label>
              <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white">
                <select className="px-2 py-1.5 text-sm outline-none bg-white flex-1" value={form.officine} onChange={set('officine')}>
                  {OFFICINES.map(o => <option key={o}>{o}</option>)}
                </select>
                <button onClick={() => setForm(f => ({ ...f, officine: '' }))} className="px-1.5 text-gray-400 hover:text-gray-700"><X size={12} /></button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Fournisseur <span className="text-red-500">*</span></label>
              <select className={iCls} value={form.fournisseur} onChange={set('fournisseur')}>
                <option value="">Fournisseur</option>
                {FOURNISSEURS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Édition</label>
              <input type="date" className={iCls} value={form.edition} onChange={set('edition')} />
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-800 mb-2">Bons de Commande Verres</div>
            <div className="border border-blue-400 rounded overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-50 border-b border-blue-300 text-gray-700 text-xs font-semibold">
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">N° Référence</th>
                    <th className="text-left px-3 py-2.5">N° Bon</th>
                    <th className="text-left px-3 py-2.5">Magasin</th>
                    <th className="text-left px-3 py-2.5">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">Aucun bon de commande verres associé</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['totalNet', 'acompte', 'totalReste'] as const).map(k => (
              <div key={k}>
                <label className="text-xs text-gray-600 mb-1 block capitalize">{k === 'totalNet' ? 'Total Net' : k === 'acompte' ? 'Acompte' : 'Total Reste'}</label>
                <input type="number" className={iCls} value={form[k] as number} onChange={set(k)} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button onClick={doSave} className="px-5 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#2563eb' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function FilterBar({ officine, setOfficine, fournisseur, setFournisseur, numReleve, setNumReleve, date, setDate, onSearch }: {
  officine: string; setOfficine: (v: string) => void; fournisseur: string; setFournisseur: (v: string) => void;
  numReleve: string; setNumReleve: (v: string) => void; date: string; setDate: (v: string) => void; onSearch: () => void;
}) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Officine...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <select className="px-2 py-1.5 text-sm outline-none bg-white" style={{ width: 170 }} value={officine} onChange={e => setOfficine(e.target.value)}>
            <option value="">Toutes les Officines</option>
            {OFFICINES.map(o => <option key={o}>{o}</option>)}
          </select>
          {officine && <button onClick={() => setOfficine('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Fournisseur...</label>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white" style={{ width: 150 }} value={fournisseur} onChange={e => setFournisseur(e.target.value)}>
          <option value="">Fournisseur</option>
          {FOURNISSEURS.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">N° Relevé...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input className="px-2 py-1.5 text-sm outline-none" style={{ width: 120 }} placeholder="N° Relevé..." value={numReleve} onChange={e => setNumReleve(e.target.value)} />
          {numReleve && <button onClick={() => setNumReleve('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Date</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} value={date} onChange={e => setDate(e.target.value)} />
          {date && <button onClick={() => setDate('')} className="px-1 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <button onClick={onSearch} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
      <div className="flex-1" />
      <div className="flex items-center gap-1 text-gray-500 self-end text-xs">
        {['<<', '<', '>', '>>'].map(s => <button key={s} className="px-1.5 py-0.5 border border-gray-300 rounded hover:bg-gray-100">{s}</button>)}
      </div>
    </div>
  );
}

export function ReleveCommandePage() {
  const [releves, setReleves] = useLiveData<Releve>('leclaire_releves_verriers');
  const [officine, setOfficine] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [numReleve, setNumReleve] = useState('');
  const [date, setDate] = useState('');
  const [annee, setAnnee] = useState('2026');
  const [filterFourn, setFilterFourn] = useState('');
  const [filtered, setFiltered] = useState<Releve[]>(releves);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Releve } | null>(null);

  const recap = useMemo(() => {
    const reg = releves.filter(r => r.statut === 'Réglé');
    const pas = releves.filter(r => r.statut !== 'Réglé');
    return { total: releves.length, totalNet: releves.reduce((s, r) => s + r.totalNet, 0), regles: reg.length, sumRegles: reg.reduce((s, r) => s + r.totalNet, 0), pasRegles: pas.length, sumPasRegles: pas.reduce((s, r) => s + r.totalReste, 0) };
  }, [releves]);

  const fmt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} F CFA`;

  const runFilter = () => setFiltered(releves.filter(r => {
    if (officine && r.officine !== officine) return false;
    if (fournisseur && r.fournisseur !== fournisseur) return false;
    if (numReleve && !r.reference.includes(numReleve)) return false;
    if (date && r.edition !== date) return false;
    return true;
  }));

  const handleSave = (r: Releve) => {
    const isUpdate = releves.find(x => x.id === r.id);
    const releveWithAudit = isUpdate ? addUpdateAudit(r) : addCreateAudit(r);
    const next = isUpdate ? releves.map(x => x.id === r.id ? releveWithAudit : x) : [releveWithAudit, ...releves];
    setReleves(next); setFiltered(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer ce relevé ?')) return;
    const next = releves.filter(r => r.id !== id);
    setReleves(next); setFiltered(next);
  };

  const fbProps = { officine, setOfficine, fournisseur, setFournisseur, numReleve, setNumReleve, date, setDate, onSearch: runFilter };

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <NouveauReleve initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* Header bar */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center"><Calendar size={15} className="text-gray-600" /></div>
          <span className="text-sm font-semibold text-gray-600">Gestion Comptabilité: {TENANT.nom}</span>
        </div>
        <AddButton onClick={() => setModal({ mode: 'add' })} className="px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#0d9488' }}>
          Ajouter Relevé Verriers
        </AddButton>
      </div>

      {/* Left + Right recap */}
      <div className="flex gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2" style={{ minWidth: 180 }}>
          <div className="flex items-center justify-center w-10 h-10 rounded bg-gray-100 mx-auto mb-1">
            <Calendar size={20} className="text-gray-500" />
          </div>
          <div className="flex items-center gap-1">
            <select className="flex-1 text-sm border border-gray-200 rounded px-1.5 py-1 outline-none bg-white text-xs">
              <option>Toutes les ...</option>
            </select>
            <X size={12} className="text-gray-400 cursor-pointer flex-shrink-0" />
          </div>
          <div className="flex items-center gap-1">
            <select className="flex-1 text-sm border border-gray-200 rounded px-1.5 py-1 outline-none bg-white" value={annee} onChange={e => setAnnee(e.target.value)}>
              {ANNEES.map(a => <option key={a}>{a}</option>)}
            </select>
            <X size={12} className="text-gray-400 cursor-pointer flex-shrink-0" />
          </div>
          <select className="text-sm border border-gray-200 rounded px-1.5 py-1 outline-none bg-white w-full" value={filterFourn} onChange={e => setFilterFourn(e.target.value)}>
            <option value="">Fournisseur</option>
            {FOURNISSEURS.map(f => <option key={f}>{f}</option>)}
          </select>
          <button onClick={runFilter} className="flex items-center justify-center py-1.5 rounded text-white" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <div className="text-sm font-bold text-gray-700 text-right tracking-wide">
            RÉCAPITULATIF RELEVÉS VERRIERS ({recap.total}) | ANNÉE: {annee}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: `Total Relevés ${recap.total}`, val: recap.totalNet, border: '#2563eb' },
              { label: `Total Relevés Réglés ${recap.regles}`, val: recap.sumRegles, border: '#16a34a' },
              { label: `Total Relevés Pas réglés ${recap.pasRegles}`, val: recap.sumPasRegles, border: '#dc2626' },
            ].map(({ label, val, border }) => (
              <div key={label} className="bg-white rounded p-4 border-2" style={{ borderColor: border }}>
                <div className="text-xs font-semibold text-gray-700 mb-2">{label}</div>
                <div className="text-base font-bold text-gray-900">{fmt(val)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
        <div className="text-sm font-bold text-gray-800">RELEVÉS VERRIERS ({filtered.length})</div>
        <FilterBar {...fbProps} />
        <div className="border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 720 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="px-3 py-2.5 w-8"><input type="checkbox" /></th>
                <th className="text-left px-3 py-2.5">N° Relevé</th>
                <th className="text-left px-3 py-2.5">Officine</th>
                <th className="text-left px-3 py-2.5">Fournisseur</th>
                <th className="text-right px-3 py-2.5">Total Net</th>
                <th className="text-right px-3 py-2.5">Acompte</th>
                <th className="text-right px-3 py-2.5">Total Reste</th>
                <th className="text-left px-3 py-2.5">Créé par</th>
                <th className="text-left px-3 py-2.5">Modifié par</th>
                <th className="text-center px-3 py-2.5">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={10} className="text-center py-10 text-gray-400">Aucun relevé verrier</td></tr>
                : filtered.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-center"><input type="checkbox" /></td>
                    <td className="px-3 py-2 font-mono text-blue-700">{r.reference}</td>
                    <td className="px-3 py-2 text-gray-700">{r.officine}</td>
                    <td className="px-3 py-2 font-semibold">{r.fournisseur}</td>
                    <td className="px-3 py-2 text-right">{r.totalNet.toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-right">{r.acompte.toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-right">{r.totalReste.toLocaleString('fr-FR')}</td>
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
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setModal({ mode: 'edit', item: r })} className="text-blue-500 hover:text-blue-700 p-1"><Edit size={13} /></button>
                        <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <FilterBar {...fbProps} />
      </div>
    </div>
  );
}
