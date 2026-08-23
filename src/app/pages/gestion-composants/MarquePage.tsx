import { useState, useMemo } from 'react';
import { AddButton } from '../../components/AddButton';
import { Search, X, Edit, Trash2 } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';

interface Marque extends AuditInfo {
  id: string;
  marque: string;
}

function ModalMarque({ initial, onSave, onClose }: { initial?: Marque; onSave: (c: Marque) => void; onClose: () => void }) {
  const [form, setForm] = useState<Marque>(initial ?? {
    id: Date.now().toString(),
    marque: '',
  });

  const iCls = 'border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const lCls = 'text-xs text-gray-600 mb-1 block';

  const doSave = () => {
    if (!form.marque) {
      alert('Veuillez remplir la marque');
      return;
    }
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100">
          <span className="font-semibold text-gray-800">{initial ? 'Modifier' : 'Ajouter'} Marque</span>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 font-bold text-lg px-1">×</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className={lCls}>Marque <span className="text-red-500">*</span></label>
            <input className={iCls} value={form.marque} onChange={e => setForm(f => ({ ...f, marque: e.target.value }))} />
          </div>

          {initial && (initial.createdBy || initial.updatedBy) && (
            <div className="border-t border-gray-200 pt-3 mt-2">
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
                {initial.createdBy && (
                  <div>
                    <span className="font-semibold text-gray-600">Créé par:</span>
                    <div>{initial.createdBy} le {formatDate(initial.createdAt)}</div>
                  </div>
                )}
                {initial.updatedBy && (
                  <div>
                    <span className="font-semibold text-gray-600">Modifié par:</span>
                    <div>{initial.updatedBy} le {formatDate(initial.updatedAt)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button onClick={doSave} className="px-4 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#2563eb' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

export function MarquePage() {
  const [marques, setMarques] = useLiveData<Marque>('leclaire_db_marques');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Marque } | null>(null);

  const filtered = useMemo(() => marques.filter(c => {
    if (search && !c.marque?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [marques, search, dateFilter]);

  const handleSave = (c: Marque) => {
    const isUpdate = marques.find(x => x.id === c.id);

    // Vérifier les doublons (seulement pour les nouvelles marques)
    if (!isUpdate) {
      const duplicate = marques.find(x =>
        x.marque.toLowerCase().trim() === c.marque.toLowerCase().trim()
      );
      if (duplicate) {
        alert(`La marque "${c.marque}" existe déjà dans le système.`);
        return;
      }
    }

    const marqueWithAudit = isUpdate ? addUpdateAudit(c) : addCreateAudit(c);
    const next = isUpdate
      ? marques.map(x => x.id === c.id ? marqueWithAudit : x)
      : [marqueWithAudit, ...marques];
    setMarques(next);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer cette marque ?')) return;
    const next = marques.filter(c => c.id !== id);
    setMarques(next);
  };

  return (
    <div className="flex flex-col gap-5 p-6" style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {modal && <ModalMarque initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-6 py-4 border border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-gray-400">👓</span>
          <span className="font-semibold text-gray-800">Gestion des Composants: {TENANT.nom}</span>
        </div>
        <AddButton onClick={() => setModal({ mode: 'add' })} className="px-5 py-2.5 rounded text-white text-sm font-semibold shadow" style={{ backgroundColor: '#0e7490' }}>
          Ajouter Marque
        </AddButton>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-5">Marques ({marques.length})</h2>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden" style={{ width: 380 }}>
            <input
              className="px-3 py-2 text-sm outline-none flex-1"
              placeholder="Recherche Marque..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch('')} className="px-2 text-gray-400"><X size={14} /></button>}
          </div>
          <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
            <input
              type="text"
              className="px-3 py-2 text-sm outline-none"
              placeholder="jj/mm/aaaa"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              style={{ width: 200 }}
            />
            <span className="px-2 text-gray-400">📅</span>
            {dateFilter && <button onClick={() => setDateFilter('')} className="px-2 text-gray-400"><X size={14} /></button>}
          </div>
          <button onClick={() => {}} className="px-4 py-2 rounded text-white text-sm flex items-center gap-2" style={{ backgroundColor: '#3b82f6' }}>
            <Search size={16} />
          </button>
          <div className="flex-1"></div>
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <button className="px-2 py-1 border border-gray-300 rounded text-gray-400">{'<<'}</button>
            <button className="px-2 py-1 border border-gray-300 rounded text-gray-400">{'<'}</button>
            <button className="px-3 py-1 border border-gray-300 rounded text-white font-semibold" style={{ backgroundColor: '#3b82f6' }}>1</button>
            <button className="px-2 py-1 border border-gray-300 rounded text-gray-400">{'>'}</button>
            <button className="px-2 py-1 border border-gray-300 rounded text-gray-400">{'>>'}</button>
          </div>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-200">
                <th className="px-4 py-3 w-10"><input type="checkbox" /></th>
                <th className="px-4 py-3 w-10 text-center font-semibold text-gray-700">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Marque</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Créé par</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Modifié par</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Aucune marque</td></tr>
              ) : [...filtered].sort((a, b) => (a.marque || '').localeCompare(b.marque || '', 'fr')).map((c, idx) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-center"><input type="checkbox" /></td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">{idx + 1}</td>
                  <td className="px-4 py-2.5 text-gray-800">{c.marque}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {c.createdBy ? (<><div className="font-semibold text-gray-700">{c.createdBy}</div><div className="text-gray-400">{formatDate(c.createdAt)}</div></>) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {c.updatedBy ? (<><div className="font-semibold text-gray-700">{c.updatedBy}</div><div className="text-gray-400">{formatDate(c.updatedAt)}</div></>) : '-'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setModal({ mode: 'edit', item: c })} className="text-blue-500 hover:text-blue-700 p-1"><Edit size={14} /></button>
                      <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
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
