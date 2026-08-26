import { useState, useMemo } from 'react';
import { Search, X, Plus, Edit, Trash2, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { useLiveData } from '../../../hooks/useLiveData';
import { AddButton } from '../../../components/AddButton';
import { libellesMagasins, TENANT } from '../../../config/tenant';

// ── helpers ───────────────────────────────────────────────────────────────────
const genRef = () => String(Date.now()).slice(-5).padStart(5, '0');
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
const fmtMoney = (n: number) => `${n.toLocaleString('fr-FR')} F CFA`;

const ASSURANCES = ['CNPS', 'MUGEFCI', 'PRIMA', 'NSIA', 'SUNU', 'AXA', 'Allianz'];
// Tous les magasins configurés (voir src/app/config/tenant.ts).
const OFFICINES = libellesMagasins();
const TAXES = ['0%', '5%', '10%', '18%'];
const ANNEES = ['2024', '2025', '2026'];

interface Releve extends AuditInfo {
  id: string;
  reference: string;
  officine: string;
  assurance: string;
  entreprise: string;
  edition: string;
  remise: number;
  taxe: string;
  totalNet: number;
  acompte: number;
  totalReste: number;
  statut: 'Réglé' | 'Non réglé';
}

// ── Nouveau Relevé (Image 2) ──────────────────────────────────────────────────
function NouveauReleve({ initial, onSave, onClose }: { initial?: Releve; onSave: (r: Releve) => void; onClose: () => void }) {
  const [form, setForm] = useState<Releve>(initial ?? {
    id: Date.now().toString(),
    reference: genRef(),
    officine: OFFICINES[0],
    assurance: '',
    entreprise: '',
    edition: new Date().toISOString().slice(0, 10),
    remise: 0,
    taxe: '0%',
    totalNet: 0,
    acompte: 0,
    totalReste: 0,
    statut: 'Non réglé',
  });

  const set = (k: keyof Releve) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));

  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const selCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const lCls = 'text-xs text-gray-600 mb-1 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200" style={{ backgroundColor: '#f8fafc' }}>
          <span className="text-sm font-semibold text-gray-600">Gestion Comptabilité: {TENANT.nom}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (!form.assurance) { alert('Assurance requise'); return; }
                onSave(form);
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-white text-sm font-semibold"
              style={{ backgroundColor: '#0d9488' }}
            >
              <Plus size={14} /> Nouveau Relevé Assurance
            </button>
            <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 min-h-0 flex flex-col gap-5">
          {/* Row 1 fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className={lCls}>Référence <span className="text-red-500">*</span></label>
              <input className={iCls + ' bg-gray-50'} readOnly value={form.reference} />
            </div>
            <div className="lg:col-span-2">
              <label className={lCls}>Officine <span className="text-red-500">*</span></label>
              <div className="flex items-center border border-gray-300 rounded overflow-hidden">
                <select className="px-2 py-1.5 text-sm outline-none bg-white flex-1" value={form.officine} onChange={set('officine')}>
                  {OFFICINES.map(o => <option key={o}>{o}</option>)}
                </select>
                <button onClick={() => setForm(f => ({ ...f, officine: '' }))} className="px-1.5 text-gray-400 hover:text-gray-700"><X size={13} /></button>
              </div>
            </div>
            <div>
              <label className={lCls}>Assurance <span className="text-red-500">*</span></label>
              <select className={selCls} value={form.assurance} onChange={set('assurance')}>
                <option value="">-- Choisir --</option>
                {ASSURANCES.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Entreprise | Garant</label>
              <input className={iCls} value={form.entreprise} onChange={set('entreprise')} placeholder="Entreprise..." />
            </div>
            <div>
              <label className={lCls}>Édition</label>
              <input type="date" className={iCls} value={form.edition} onChange={set('edition')} />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:col-span-1">
              <div>
                <label className={lCls}>Remise %</label>
                <input type="number" className={iCls} value={form.remise} onChange={set('remise')} min={0} max={100} />
              </div>
              <div>
                <label className={lCls}>Taxe</label>
                <select className={selCls} value={form.taxe} onChange={set('taxe')}>
                  {TAXES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Factures Assurance table */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-1">Factures Assurance</div>
            <div className="border border-blue-300 rounded overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-50 border-b border-blue-200 text-gray-700">
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">N° Bon</th>
                    <th className="text-left px-3 py-2">N° Facture</th>
                    <th className="text-left px-3 py-2">Assuré(e)</th>
                    <th className="text-left px-3 py-2">Entreprise | Garant</th>
                    <th className="text-left px-3 py-2">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">Aucune facture assurance associée</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary totals */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lCls}>Total Net</label>
              <input type="number" className={iCls} value={form.totalNet} onChange={set('totalNet')} />
            </div>
            <div>
              <label className={lCls}>Acompte</label>
              <input type="number" className={iCls} value={form.acompte} onChange={set('acompte')} />
            </div>
            <div>
              <label className={lCls}>Total Reste</label>
              <input type="number" className={iCls} value={form.totalReste} onChange={set('totalReste')} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button
            onClick={() => {
              if (!form.assurance) { alert('Assurance requise'); return; }
              onSave(form);
              onClose();
            }}
            className="px-5 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#2563eb' }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filter bar (reusable) ────────────────────────────────────────────────────
function FilterBar({
  officine, setOfficine, assurance, setAssurance,
  numReleve, setNumReleve, entreprise, setEntreprise,
  date, setDate, onSearch,
}: {
  officine: string; setOfficine: (v: string) => void;
  assurance: string; setAssurance: (v: string) => void;
  numReleve: string; setNumReleve: (v: string) => void;
  entreprise: string; setEntreprise: (v: string) => void;
  date: string; setDate: (v: string) => void;
  onSearch: () => void;
}) {
  const selCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Officine</label>
        <select className={selCls} style={{ width: 160 }} value={officine} onChange={e => setOfficine(e.target.value)}>
          <option value="">Toutes</option>
          {OFFICINES.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Assurance</label>
        <select className={selCls} style={{ width: 130 }} value={assurance} onChange={e => setAssurance(e.target.value)}>
          <option value="">Toutes</option>
          {ASSURANCES.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">N° Relevé</label>
        <input className={iCls} style={{ width: 110 }} value={numReleve} onChange={e => setNumReleve(e.target.value)} placeholder="N° Relevé..." />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Entreprise | Garant</label>
        <select className={selCls} style={{ width: 150 }} value={entreprise} onChange={e => setEntreprise(e.target.value)}>
          <option value="">Tous</option>
          <option>Privé</option>
          <option>CNPS</option>
          <option>FNH</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Date</label>
        <input type="date" className={iCls} style={{ width: 140 }} value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <button onClick={onSearch} className="px-3 py-1.5 rounded text-white text-sm font-semibold flex items-center gap-1" style={{ backgroundColor: '#1a7a96' }}>
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
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function ReleveAssurancePage() {
  const [releves, setReleves] = useLiveData<Releve>('leclaire_releves_assurance');
  const [officine, setOfficine] = useState('');
  const [assurance, setAssurance] = useState('');
  const [numReleve, setNumReleve] = useState('');
  const [entreprise, setEntreprise] = useState('');
  const [date, setDate] = useState('');
  const [annee, setAnnee] = useState('2026');
  const [filterAssurance, setFilterAssurance] = useState('');
  const [filtered, setFiltered] = useState<Releve[]>(releves);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Releve } | null>(null);

  const recap = useMemo(() => {
    const total = releves.length;
    const regles = releves.filter(r => r.statut === 'Réglé');
    const pasRegles = releves.filter(r => r.statut !== 'Réglé');
    const sumRegles = regles.reduce((s, r) => s + r.totalNet, 0);
    const sumPasRegles = pasRegles.reduce((s, r) => s + r.totalReste, 0);
    return { total, regles: regles.length, sumRegles, pasRegles: pasRegles.length, sumPasRegles, totalNet: releves.reduce((s,r)=>s+r.totalNet,0) };
  }, [releves]);

  const runFilter = () => {
    setFiltered(releves.filter(r => {
      if (officine && r.officine !== officine) return false;
      if (assurance && r.assurance !== assurance) return false;
      if (numReleve && !r.reference.includes(numReleve)) return false;
      if (entreprise && !r.entreprise.toLowerCase().includes(entreprise.toLowerCase())) return false;
      if (date && r.edition !== date) return false;
      return true;
    }));
  };

  const handleSave = (r: Releve) => {
    const exists = releves.find(x => x.id === r.id);
    const releveWithAudit = exists ? addUpdateAudit(r) : addCreateAudit(r);
    const next = exists ? releves.map(x => x.id === r.id ? releveWithAudit : x) : [releveWithAudit, ...releves];
    setReleves(next); setFiltered(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer ce relevé ?')) return;
    const next = releves.filter(r => r.id !== id);
    setReleves(next); setFiltered(next);
  };

  const filterBarProps = { officine, setOfficine, assurance, setAssurance, numReleve, setNumReleve, entreprise, setEntreprise, date, setDate, onSearch: runFilter };

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <NouveauReleve initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* Top filter + recap layout */}
      <div className="flex gap-4">
        {/* Left panel */}
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3" style={{ minWidth: 220 }}>
          <div className="flex items-center gap-2 text-gray-700">
            <Filter size={18} style={{ color: '#1a7a96' }} />
            <select className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 outline-none bg-white">
              <option>Toutes les officines...</option>
              {OFFICINES.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 outline-none bg-white" value={annee} onChange={e => setAnnee(e.target.value)}>
              {ANNEES.map(a => <option key={a}>{a}</option>)}
            </select>
            <button className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
          </div>
          <div>
            <select className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none bg-white" value={filterAssurance} onChange={e => setFilterAssurance(e.target.value)}>
              <option value="">Assurance...</option>
              {ASSURANCES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <button onClick={runFilter} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
            <Search size={14} /> Rechercher
          </button>
        </div>

        {/* Right: recap + title + add button */}
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                RÉCAPITULATIF RELEVÉS ASSURANCES ({recap.total}) | ANNÉE: {annee}
              </div>
            </div>
            <AddButton
              onClick={() => setModal({ mode: 'add' })}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold"
              style={{ backgroundColor: '#0d9488' }}
            >
              <Plus size={15} /> Ajouter Relevé Assurance
            </AddButton>
          </div>

          {/* 3 recap boxes */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderColor: '#2563eb' }}>
              <div className="text-xs text-gray-500 mb-1">Total Relevés</div>
              <div className="text-2xl font-bold text-gray-800">{recap.total}</div>
              <div className="text-sm text-blue-600 font-semibold mt-1">{fmtMoney(recap.totalNet)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderColor: '#16a34a' }}>
              <div className="text-xs text-gray-500 mb-1">Total Réglés</div>
              <div className="text-2xl font-bold text-gray-800">{recap.regles}</div>
              <div className="text-sm text-green-600 font-semibold mt-1">{fmtMoney(recap.sumRegles)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderColor: '#dc2626' }}>
              <div className="text-xs text-gray-500 mb-1">Pas réglés</div>
              <div className="text-2xl font-bold text-gray-800">{recap.pasRegles}</div>
              <div className="text-sm text-red-600 font-semibold mt-1">{fmtMoney(recap.sumPasRegles)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Table panel */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">RELEVÉS ASSURANCES ({filtered.length})</h2>
        </div>

        <FilterBar {...filterBarProps} />

        <div className="border border-gray-200 rounded overflow-hidden overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="px-3 py-2 w-8"><input type="checkbox" /></th>
                <th className="text-left px-3 py-2">N° Relevé</th>
                <th className="text-left px-3 py-2">Officine</th>
                <th className="text-left px-3 py-2">Assurance</th>
                <th className="text-left px-3 py-2">Entreprise | Garant</th>
                <th className="text-right px-3 py-2">Remise</th>
                <th className="text-right px-3 py-2">Taxe</th>
                <th className="text-right px-3 py-2">Total Net</th>
                <th className="text-right px-3 py-2">Acompte</th>
                <th className="text-right px-3 py-2">Total Reste</th>
                <th className="text-left px-3 py-2">Créé par</th>
                <th className="text-left px-3 py-2">Modifié par</th>
                <th className="text-center px-3 py-2">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-10 text-gray-400">Aucun relevé assurance</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-center"><input type="checkbox" /></td>
                  <td className="px-3 py-2 font-mono text-blue-700">{r.reference}</td>
                  <td className="px-3 py-2 text-gray-700">{r.officine}</td>
                  <td className="px-3 py-2 font-semibold">{r.assurance}</td>
                  <td className="px-3 py-2 text-gray-600">{r.entreprise || '—'}</td>
                  <td className="px-3 py-2 text-right">{r.remise}%</td>
                  <td className="px-3 py-2 text-right">{r.taxe}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.totalNet.toLocaleString('fr-FR')}</td>
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

        <FilterBar {...filterBarProps} />
      </div>
    </div>
  );
}
