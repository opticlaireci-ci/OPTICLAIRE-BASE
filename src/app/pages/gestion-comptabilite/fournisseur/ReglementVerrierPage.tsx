import { useState, useMemo } from 'react';
import { Search, X, Edit, Calendar } from 'lucide-react';
import { useLiveData } from '../../../hooks/useLiveData';

import { getMagasins } from '../../../constants/magasins';
import { TENANT } from '../../../config/tenant';

const allMagasins = getMagasins();
const OFFICINES = allMagasins.map(magasin => magasin.label);
const MAGASINS = allMagasins.map(magasin => magasin.label.replace(`${TENANT.nom} `, ''));
const FOURNISSEURS = ['BBGR', 'ESSILOR', 'HOYA', 'NIKON', 'ZEISS', 'RODENSTOCK'];
const STATUTS = ['En attente', 'Réglé', 'Partiellement réglé'];
const ANNEES = ['2024', '2025', '2026'];

interface BonCommande {
  id: string; numFacture: string; numRef: string; numBC: string; numBL: string;
  fournisseur: string; officine: string; magasin: string;
  totalNet: number; acompte: number; totalReste: number; statut: string; date: string;
}

function FilterBar({ officine, setOfficine, magasin, setMagasin, search, setSearch, date, setDate, onSearch }: {
  officine: string; setOfficine: (v: string) => void;
  magasin: string; setMagasin: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  date: string; setDate: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Officine...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <select className="px-2 py-1.5 text-sm outline-none bg-white" style={{ width: 150 }} value={officine} onChange={e => setOfficine(e.target.value)}>
            <option value="">Toutes les ...</option>
            {OFFICINES.map(o => <option key={o}>{o}</option>)}
          </select>
          {officine && <button onClick={() => setOfficine('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Magasin...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <select className="px-2 py-1.5 text-sm outline-none bg-white" style={{ width: 160 }} value={magasin} onChange={e => setMagasin(e.target.value)}>
            <option value="">-- Choisir Magasin --</option>
            {MAGASINS.map(m => <option key={m}>{m}</option>)}
          </select>
          {magasin && <button onClick={() => setMagasin('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Infos Bon de Commande...</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input className="px-2 py-1.5 text-sm outline-none" style={{ width: 180 }} placeholder="Infos Bon de Commande..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Date</label>
        <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
          <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} placeholder="jj/mm/aaaa" value={date} onChange={e => setDate(e.target.value)} />
          {date && <button onClick={() => setDate('')} className="px-1 text-gray-400"><X size={12} /></button>}
        </div>
      </div>
      <button onClick={onSearch} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5 text-xs text-gray-500 self-end">
        {['<<', '<', '1', '2', '3', '>', '>>'].map((s, i) => (
          <button key={i} className={`px-1.5 py-0.5 border rounded hover:bg-gray-100 ${s === '1' ? 'border-blue-500 text-blue-600 font-bold' : 'border-gray-300'}`}>{s}</button>
        ))}
      </div>
    </div>
  );
}

export function ReglementVerrierPage() {
  const [bons] = useLiveData<BonCommande>('leclaire_bons_commande_verres');
  const [officine, setOfficine] = useState('');
  const [magasin, setMagasin] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
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
    if (officine && b.officine !== officine) return false;
    if (magasin && b.magasin !== magasin) return false;
    if (search && ![b.numBC, b.numRef, b.fournisseur].some(v => v.toLowerCase().includes(search.toLowerCase()))) return false;
    if (date && b.date !== date) return false;
    return true;
  }));

  const statusColor = (s: string) => ({ 'Réglé': '#16a34a', 'En attente': '#d97706', 'Partiellement réglé': '#2563eb' }[s] ?? '#6b7280');

  const fbProps = { officine, setOfficine, magasin, setMagasin, search, setSearch, date, setDate, onSearch: runFilter };

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
            BONS DE COMMANDE VERRES ({recap.total}) | ANNÉE: {annee}
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
        <div className="text-sm font-bold text-gray-800">Bons de Commande Verre ({filtered.length})</div>
        <FilterBar {...fbProps} />
        {/* Desktop table */}
        <div className="hidden md:block border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="px-2 py-2.5 w-8"><input type="checkbox" /></th>
                <th className="text-left px-2 py-2.5">N° Facture</th>
                <th className="text-left px-2 py-2.5">N° Ref</th>
                <th className="text-left px-2 py-2.5">N° BC</th>
                <th className="text-left px-2 py-2.5">N° BL</th>
                <th className="text-left px-2 py-2.5">Fournisseur</th>
                <th className="text-right px-2 py-2.5">Total Net</th>
                <th className="text-right px-2 py-2.5">Acompte</th>
                <th className="text-right px-2 py-2.5 bg-green-50">Total Reste</th>
                <th className="text-left px-2 py-2.5">Statut</th>
                <th className="text-center px-2 py-2.5">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={11} className="text-center py-10 text-gray-400">Aucun bon de commande verres</td></tr>
                : filtered.map(b => (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-2 text-center"><input type="checkbox" /></td>
                    <td className="px-2 py-2 font-mono text-blue-700 text-xs">{b.numFacture}</td>
                    <td className="px-2 py-2 text-gray-600 text-xs">{b.numRef}</td>
                    <td className="px-2 py-2 text-gray-600 text-xs">{b.numBC}</td>
                    <td className="px-2 py-2 text-gray-600 text-xs">{b.numBL}</td>
                    <td className="px-2 py-2 font-semibold">{b.fournisseur}</td>
                    <td className="px-2 py-2 text-right">{b.totalNet.toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-right">{b.acompte.toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-right bg-green-50">{b.totalReste.toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2">
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: statusColor(b.statut) }}>{b.statut}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
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
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Aucun bon de commande verres</div>
          ) : filtered.map(b => (
            <div key={b.id} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>{b.fournisseur}</span>
                <span style={{ backgroundColor: statusColor(b.statut), color: '#fff', borderRadius: '10px', padding: '2px 10px', fontSize: '11px', fontWeight: 600 }}>{b.statut}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>N° BC</span>
                  <div style={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 600 }}>{b.numBC || '—'}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Date</span>
                  <div style={{ color: '#374151' }}>{b.date ? new Date(b.date).toLocaleDateString('fr-FR') : '—'}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Montant</span>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{b.totalNet.toLocaleString('fr-FR')} F CFA</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Reste</span>
                  <div style={{ fontWeight: 600, color: b.totalReste > 0 ? '#16a34a' : '#374151' }}>{b.totalReste.toLocaleString('fr-FR')} F CFA</div>
                </div>
                {b.numFacture && (
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '11px' }}>N° Facture</span>
                    <div style={{ fontFamily: 'monospace', color: '#1d4ed8', fontSize: '12px' }}>{b.numFacture}</div>
                  </div>
                )}
                <div>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>Acompte</span>
                  <div style={{ color: '#374151' }}>{b.acompte.toLocaleString('fr-FR')} F CFA</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', border: '1px solid #bfdbfe', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '12px', cursor: 'pointer' }}><Edit size={13} /> Modifier</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
