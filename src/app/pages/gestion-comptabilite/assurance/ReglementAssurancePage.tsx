import { useState, useMemo } from 'react';
import { Search, X, Plus, Edit, Trash2, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Filter, Download } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { useLiveData } from '../../../hooks/useLiveData';
import { AddButton } from '../../../components/AddButton';
import { libellesMagasins, TENANT } from '../../../config/tenant';

// ── helpers ───────────────────────────────────────────────────────────────────
const genRef = () => String(Date.now()).slice(-5).padStart(5, '0');

const ASSURANCES = ['CNPS', 'MUGEFCI', 'PRIMA', 'NSIA', 'SUNU', 'AXA', 'Allianz'];
// Tous les magasins configurés (voir src/app/config/tenant.ts).
const OFFICINES = libellesMagasins();
const MODES_PAIEMENT = ['Virement bancaire', 'Chèque', 'Espèces', 'Mobile Money'];
const COMPTES_BANQUE = ['SGCI - Compte Principal', 'BNI - Compte Courant', 'BIAO - Épargne', 'SIB - Opérations'];
const ANNEES = ['2024', '2025', '2026'];

interface Reglement extends AuditInfo {
  id: string;
  numReglement: string;
  numReleve: string;
  totalNet: number;
  totalReste: number;
  montant: number;
  modePaiement: string;
  compteBanque: string;
  details: string;
  officine: string;
  assurance: string;
  entreprise: string;
  date: string;
}

// ── Nouveau Règlement (Image 4) ───────────────────────────────────────────────
function NouveauReglement({ initial, onSave, onClose }: { initial?: Reglement; onSave: (r: Reglement) => void; onClose: () => void }) {
  const [releves] = useLiveData<any>('leclaire_releves_assurance');
  const [form, setForm] = useState<Reglement>(initial ?? {
    id: Date.now().toString(),
    numReglement: genRef(),
    numReleve: '',
    totalNet: 0,
    totalReste: 0,
    montant: 0,
    modePaiement: MODES_PAIEMENT[0],
    compteBanque: COMPTES_BANQUE[0],
    details: '',
    officine: OFFICINES[0],
    assurance: '',
    entreprise: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const set = (k: keyof Reglement) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));

  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const selCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const lCls = 'text-xs text-gray-600 mb-1 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200" style={{ backgroundColor: '#f8fafc' }}>
          <span className="text-sm font-semibold text-gray-600">Gestion Comptabilité: {TENANT.nom}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">Nouveau Règlement</span>
            <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Row 1: N°Règlement | N°Relevé | Total Net | Total Reste */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lCls}>N° Règlement <span className="text-red-500">*</span></label>
              <input className={iCls + ' bg-gray-50'} readOnly value={form.numReglement} />
            </div>
            <div>
              <label className={lCls}>N° Relevé <span className="text-red-500">*</span></label>
              <select className={selCls} value={form.numReleve} onChange={set('numReleve')}>
                <option value="">-- Choisir --</option>
                {releves.map((r: any) => <option key={r.id} value={r.reference}>{r.reference}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Total Net <span className="text-red-500">*</span></label>
              <input type="number" className={iCls} value={form.totalNet} onChange={set('totalNet')} />
            </div>
            <div>
              <label className={lCls}>Total Reste <span className="text-red-500">*</span></label>
              <input type="number" className={iCls} value={form.totalReste} onChange={set('totalReste')} />
            </div>
          </div>

          {/* Row 2: Montant | Mode Paiement | Compte Banque | Détails | Pièce Jointe */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className={lCls}>Montant <span className="text-red-500">*</span></label>
              <input type="number" className={iCls} value={form.montant} onChange={set('montant')} />
            </div>
            <div>
              <label className={lCls}>Mode de Paiement <span className="text-red-500">*</span></label>
              <select className={selCls} value={form.modePaiement} onChange={set('modePaiement')}>
                {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Compte Banque <span className="text-red-500">*</span></label>
              <select className={selCls} value={form.compteBanque} onChange={set('compteBanque')}>
                {COMPTES_BANQUE.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Détails</label>
              <input className={iCls} value={form.details} onChange={set('details')} placeholder="Détails..." />
            </div>
            <div>
              <label className={lCls}>Pièce Jointe</label>
              <button className="w-full flex items-center justify-center gap-1.5 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50" style={{ backgroundColor: '#fef3c7' }}>
                <Download size={14} /> Télécharger
              </button>
            </div>
          </div>

          {/* Hidden fields for officine/assurance */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lCls}>Officine</label>
              <select className={selCls} value={form.officine} onChange={set('officine')}>
                {OFFICINES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Assurance</label>
              <select className={selCls} value={form.assurance} onChange={set('assurance')}>
                <option value="">-- Choisir --</option>
                {ASSURANCES.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Date</label>
              <input type="date" className={iCls} value={form.date} onChange={set('date')} />
            </div>
          </div>

          {/* Dashed separator */}
          <div className="border-t border-dashed border-gray-300" />
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-5 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button
            onClick={() => {
              if (!form.numReleve || !form.montant) { alert('N° Relevé et Montant requis'); return; }
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

// ── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({
  officine, setOfficine, assurance, setAssurance,
  numReleve, setNumReleve, numReglement, setNumReglement,
  date, setDate, onSearch,
}: {
  officine: string; setOfficine: (v: string) => void;
  assurance: string; setAssurance: (v: string) => void;
  numReleve: string; setNumReleve: (v: string) => void;
  numReglement: string; setNumReglement: (v: string) => void;
  date: string; setDate: (v: string) => void;
  onSearch: () => void;
}) {
  const selCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Officine</label>
        <select className={selCls} style={{ width: 150 }} value={officine} onChange={e => setOfficine(e.target.value)}>
          <option value="">Toutes</option>
          {OFFICINES.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">Assurance</label>
        <select className={selCls} style={{ width: 120 }} value={assurance} onChange={e => setAssurance(e.target.value)}>
          <option value="">Toutes</option>
          {ASSURANCES.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">N° Relevé</label>
        <input className={iCls} style={{ width: 100 }} value={numReleve} onChange={e => setNumReleve(e.target.value)} placeholder="N° Relevé..." />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-600">N° Règlement</label>
        <input className={iCls} style={{ width: 110 }} value={numReglement} onChange={e => setNumReglement(e.target.value)} placeholder="N° Règl..." />
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
export function ReglementAssurancePage() {
  const [reglements, setReglements] = useLiveData<Reglement>('leclaire_reglements_assurance');
  const [officine, setOfficine] = useState('');
  const [assurance, setAssurance] = useState('');
  const [numReleve, setNumReleve] = useState('');
  const [numReglement, setNumReglement] = useState('');
  const [date, setDate] = useState('');
  const [annee, setAnnee] = useState('2026');
  const [filtered, setFiltered] = useState<Reglement[]>(reglements);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Reglement } | null>(null);

  const recap = useMemo(() => {
    const total = reglements.length;
    const totalMontant = reglements.reduce((s, r) => s + r.montant, 0);
    const totalReste = reglements.reduce((s, r) => s + r.totalReste, 0);
    return { total, totalMontant, totalReste };
  }, [reglements]);

  const runFilter = () => {
    setFiltered(reglements.filter(r => {
      if (officine && r.officine !== officine) return false;
      if (assurance && r.assurance !== assurance) return false;
      if (numReleve && !r.numReleve.includes(numReleve)) return false;
      if (numReglement && !r.numReglement.includes(numReglement)) return false;
      if (date && r.date !== date) return false;
      return true;
    }));
  };

  const handleSave = (r: Reglement) => {
    const exists = reglements.find(x => x.id === r.id);
    const reglementWithAudit = exists ? addUpdateAudit(r) : addCreateAudit(r);
    const next = exists ? reglements.map(x => x.id === r.id ? reglementWithAudit : x) : [reglementWithAudit, ...reglements];
    setReglements(next); setFiltered(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer ce règlement ?')) return;
    const next = reglements.filter(r => r.id !== id);
    setReglements(next); setFiltered(next);
  };

  const filterBarProps = { officine, setOfficine, assurance, setAssurance, numReleve, setNumReleve, numReglement, setNumReglement, date, setDate, onSearch: runFilter };

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <NouveauReglement initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

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
            <select className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none bg-white">
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
                RÉCAPITULATIF RÈGLEMENTS ASSURANCES ({recap.total}) | ANNÉE: {annee}
              </div>
            </div>
            <AddButton
              onClick={() => setModal({ mode: 'add' })}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold"
              style={{ backgroundColor: '#0d9488' }}
            >
              <Plus size={15} /> Ajouter Règlement
            </AddButton>
          </div>

          {/* 3 recap boxes */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderColor: '#2563eb' }}>
              <div className="text-xs text-gray-500 mb-1">Total Règlements</div>
              <div className="text-2xl font-bold text-gray-800">{recap.total}</div>
              <div className="text-sm text-blue-600 font-semibold mt-1">{recap.totalMontant.toLocaleString('fr-FR')} F CFA</div>
            </div>
            <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderColor: '#16a34a' }}>
              <div className="text-xs text-gray-500 mb-1">Total Réglé</div>
              <div className="text-2xl font-bold text-gray-800">{recap.total}</div>
              <div className="text-sm text-green-600 font-semibold mt-1">{recap.totalMontant.toLocaleString('fr-FR')} F CFA</div>
            </div>
            <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderColor: '#dc2626' }}>
              <div className="text-xs text-gray-500 mb-1">Total Reste</div>
              <div className="text-2xl font-bold text-gray-800">0</div>
              <div className="text-sm text-red-600 font-semibold mt-1">{recap.totalReste.toLocaleString('fr-FR')} F CFA</div>
            </div>
          </div>
        </div>
      </div>

      {/* Table panel */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">RÈGLEMENTS RELEVÉS ASSURANCES ({filtered.length})</h2>
        </div>

        <FilterBar {...filterBarProps} />

        <div className="border border-gray-200 rounded overflow-hidden overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="px-3 py-2 w-8"><input type="checkbox" /></th>
                <th className="text-left px-3 py-2">N° Relevé</th>
                <th className="text-left px-3 py-2">N° Règlement</th>
                <th className="text-left px-3 py-2">Officine</th>
                <th className="text-left px-3 py-2">Assurance</th>
                <th className="text-left px-3 py-2">Entreprise | Garant</th>
                <th className="text-left px-3 py-2">Compte Banque</th>
                <th className="text-left px-3 py-2">Mode de Paiement</th>
                <th className="text-right px-3 py-2">Montant</th>
                <th className="text-left px-3 py-2">Détails</th>
                <th className="text-left px-3 py-2">Créé par</th>
                <th className="text-left px-3 py-2">Modifié par</th>
                <th className="text-center px-3 py-2">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-10 text-gray-400">Aucun règlement assurance</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-center"><input type="checkbox" /></td>
                  <td className="px-3 py-2 font-mono text-blue-700">{r.numReleve}</td>
                  <td className="px-3 py-2 font-mono text-blue-700">{r.numReglement}</td>
                  <td className="px-3 py-2 text-gray-700">{r.officine}</td>
                  <td className="px-3 py-2 font-semibold">{r.assurance}</td>
                  <td className="px-3 py-2 text-gray-600">{r.entreprise || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.compteBanque}</td>
                  <td className="px-3 py-2 text-gray-600">{r.modePaiement}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.montant.toLocaleString('fr-FR')}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-xs truncate">{r.details || '—'}</td>
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
