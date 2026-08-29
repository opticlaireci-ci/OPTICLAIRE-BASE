import { useState, useMemo } from 'react';
import { Search, X, Edit, Calendar } from 'lucide-react';
import { useLiveData } from '../../../hooks/useLiveData';

const FOURNISSEURS = ['SAFILO', 'LUXOTTICA', 'MARCOLIN', 'SILHOUETTE', 'INDO', 'CHARMANT'];
const STATUTS_OPTS = ['En attente', 'Réglé', 'Partiellement réglé'];
const ANNEES = ['2024', '2025', '2026'];

interface BonCommande {
  id: string; numBC: string; fournisseur: string; remise: number;
  total: number; taxe: number; totalNet: number; totalPaiement: number;
  totalReste: number; statut: string; date: string;
}

function FilterBar({ search, setSearch, date, setDate, statut, setStatut, onSearch }: {
  search: string; setSearch: (v: string) => void;
  date: string; setDate: (v: string) => void;
  statut: string; setStatut: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">(N° Bon de Commande, Fournisseur)</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input className="px-2 py-1.5 text-sm outline-none" style={{ width: 200 }} placeholder="Recherche..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">&nbsp;</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} placeholder="jj/mm/aaaa" value={date} onChange={e => setDate(e.target.value)} />
          {date && <button onClick={() => setDate('')} className="px-1 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">&nbsp;</label>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white" style={{ width: 170 }} value={statut} onChange={e => setStatut(e.target.value)}>
          <option value="">Choisir Statut...</option>
          {STATUTS_OPTS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <button onClick={onSearch} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5 text-xs text-gray-500 self-end">
        {['<<', '<', '>', '>>'].map((s, i) => <button key={i} className="px-1.5 py-0.5 border border-gray-300 rounded hover:bg-gray-100">{s}</button>)}
      </div>
    </div>
  );
}

export function ReglementFournisseurPage() {
  const [bons] = useLiveData<BonCommande>('leclaire_bons_commande_montures');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [statut, setStatut] = useState('');
  const [annee, setAnnee] = useState('2026');
  const [filterFourn, setFilterFourn] = useState('');
  const [filtered, setFiltered] = useState<BonCommande[]>(bons);

  const recap = useMemo(() => {
    const reg = bons.filter(b => b.statut === 'Réglé');
    const pas = bons.filter(b => b.statut !== 'Réglé');
    return { total: bons.length, totalNet: bons.reduce((s, b) => s + b.totalNet, 0), regles: reg.length, sumRegles: reg.reduce((s, b) => s + b.totalNet, 0), pasRegles: pas.length, sumPasRegles: pas.reduce((s, b) => s + b.totalReste, 0) };
  }, [bons]);

  const fmt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} F CFA`;

  const runFilter = () => setFiltered(bons.filter(b => {
    if (search && ![b.numBC, b.fournisseur].some(v => v.toLowerCase().includes(search.toLowerCase()))) return false;
    if (date && b.date !== date) return false;
    if (statut && b.statut !== statut) return false;
    return true;
  }));

  const statusColor = (s: string) => ({ 'Réglé': '#16a34a', 'En attente': '#d97706', 'Partiellement réglé': '#2563eb' }[s] ?? '#6b7280');
  const fbProps = { search, setSearch, date, setDate, statut, setStatut, onSearch: runFilter };

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {/* Left + Right recap */}
      <div className="flex gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2" style={{ minWidth: 160 }}>
          <div className="flex items-center justify-center w-10 h-10 rounded bg-gray-100 mx-auto mb-1">
            <Calendar size={20} className="text-gray-500" />
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
            BONS DE COMMANDE MONTURES | ACCESSOIRES ({recap.total}) | ANNÉE: {annee}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: `Total Bons de Commande ${recap.total}`, val: recap.totalNet, border: '#2563eb' },
              { label: `Total Bons de Commande Réglés ${recap.regles}`, val: recap.sumRegles, border: '#16a34a' },
              { label: `Total Bons de Commande Pas réglés ${recap.pasRegles}`, val: recap.sumPasRegles, border: '#dc2626' },
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
        <div className="text-sm font-bold text-gray-800">Bons de Commande Montures | Accessoires ({filtered.length})</div>
        <FilterBar {...fbProps} />
        {/* Desktop table */}
        <div className="hidden md:block border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="text-left px-3 py-2.5">N° Bon de Commande</th>
                <th className="text-left px-3 py-2.5">Fournisseur</th>
                <th className="text-right px-3 py-2.5">Remise</th>
                <th className="text-right px-3 py-2.5">Total</th>
                <th className="text-right px-3 py-2.5">Taxe</th>
                <th className="text-right px-3 py-2.5">Total Net</th>
                <th className="text-right px-3 py-2.5">Total Paiement</th>
                <th className="text-right px-3 py-2.5">Total Reste</th>
                <th className="text-left px-3 py-2.5">Statut</th>
                <th className="text-center px-3 py-2.5">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={10} className="text-center py-10 text-gray-400">Aucun bon de commande montures/accessoires</td></tr>
                : filtered.map(b => (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-blue-700">{b.numBC}</td>
                    <td className="px-3 py-2 font-semibold">{b.fournisseur}</td>
                    <td className="px-3 py-2 text-right">{b.remise}%</td>
                    <td className="px-3 py-2 text-right">{b.total.toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-right">{b.taxe}%</td>
                    <td className="px-3 py-2 text-right">{b.totalNet.toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-right">{b.totalPaiement.toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-right">{b.totalReste.toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: statusColor(b.statut) }}>{b.statut}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button className="text-blue-500 hover:text-blue-700 p-1"><Edit size={13} /></button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Aucun bon de commande montures/accessoires</div>
          ) : filtered.map(b => (
            <div key={b.id} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: '#1d4ed8' }}>{b.numBC}</span>
                <span style={{ backgroundColor: statusColor(b.statut), color: '#fff', borderRadius: '10px', padding: '2px 10px', fontSize: '11px', fontWeight: 600 }}>{b.statut}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Fournisseur</span>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{b.fournisseur}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Date</span>
                  <div style={{ color: '#374151' }}>{b.date ? new Date(b.date).toLocaleDateString('fr-FR') : '—'}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Total Net</span>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{b.totalNet.toLocaleString('fr-FR')} F CFA</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Reste</span>
                  <div style={{ fontWeight: 600, color: b.totalReste > 0 ? '#dc2626' : '#16a34a' }}>{b.totalReste.toLocaleString('fr-FR')} F CFA</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Remise / Taxe</span>
                  <div style={{ color: '#374151' }}>{b.remise}% / {b.taxe}%</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Paiement</span>
                  <div style={{ color: '#374151' }}>{b.totalPaiement.toLocaleString('fr-FR')} F CFA</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', border: '1px solid #bfdbfe', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '12px', cursor: 'pointer' }}><Edit size={13} /> Modifier</button>
              </div>
            </div>
          ))}
        </div>
        <FilterBar {...fbProps} />
      </div>
    </div>
  );
}
