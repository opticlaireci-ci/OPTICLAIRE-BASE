import { useState, useMemo } from 'react';
import { Search, X, Edit, Trash2, Printer, FileUp } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { syncCatalogueToMagasins, removeCatalogueFromMagasins } from '../../utils/syncCataloguesToMagasins';
import { useLiveData } from '../../hooks/useLiveData';
import { printHeaderHTML } from '../../utils/documentHeader';
import { ImportCatalogueCsvDialog } from '../../components/ImportCatalogueCsvDialog';
import { MODELE_TRAITEMENTS } from '../../utils/catalogueCsv';
import { TENANT } from '../../config/tenant';
import { imprimerHtmlDansApp } from '../../utils/printInApp';

interface Traitement extends AuditInfo {
  id: string; designation: string; prix: number; createdAt: string;
}

function ModalTraitement({ initial, onSave, onClose }: { initial?: Traitement; onSave: (t: Traitement) => void; onClose: () => void }) {
  const [form, setForm] = useState<Traitement>(initial ?? {
    id: Date.now().toString(), designation: '', prix: 0, createdAt: new Date().toISOString(),
  });
  const set = (k: keyof Traitement) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));

  const iCls = 'border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const lCls = 'text-xs text-gray-600 mb-1 block';

  const doSave = () => {
    if (!form.designation) { alert('Désignation requise'); return; }
    onSave(form); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100">
          <span className="font-semibold text-gray-800">{initial ? 'Modifier' : 'Ajouter'} Traitement</span>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 font-bold text-lg px-1">×</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>Désignation <span className="text-red-500">*</span></label>
              <input className={iCls} value={form.designation} onChange={set('designation')} />
            </div>
            <div>
              <label className={lCls}>Prix</label>
              <input type="number" className={iCls} value={form.prix} onChange={set('prix')} />
            </div>
          </div>
          <div className="border-t border-dashed border-gray-200" />
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button onClick={doSave} className="px-4 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#2563eb' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function printCatalogueTraitements(traitements: Traitement[]) {
  const html = `
    <html><head><title>Catalogue Traitements — ${TENANT.nom}</title>
    <style>body{font-family:sans-serif;padding:20px}h1{font-size:18px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
    th{background:#f5f5f5;font-size:12px}</style></head><body>
    ${printHeaderHTML()}
    <h1>Catalogue Traitements</h1>
    <table><thead><tr><th>#</th><th>Traitement</th><th>Prix / Verre</th></tr></thead>
    <tbody>${traitements.map((t, i) => `<tr><td>${i + 1}</td><td>${t.designation}</td><td>${t.prix.toLocaleString('fr-FR')} F CFA</td></tr>`).join('')}
    </tbody></table></body></html>`;
  imprimerHtmlDansApp(html);
}

export function TraitementPage() {
  const [traitements, setTraitements] = useLiveData<Traitement>('leclaire_global_traitements');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Traitement } | null>(null);
  const [importModal, setImportModal] = useState(false);

  /**
   * Import ICT.csv : les doublons ont déjà été écartés par le dialogue. On
   * attribue ici l'identifiant et l'audit, puis on propage vers les catalogues
   * de chaque magasin comme le fait la saisie manuelle.
   */
  const handleImportTraitements = (nouvelles: Record<string, any>[]) => {
    const importes: Traitement[] = nouvelles.map((l, i) => addCreateAudit({
      // Date.now() serait identique pour toutes les lignes d'un même import :
      // l'index garantit des identifiants uniques.
      id: `${Date.now()}-${i}`,
      createdAt: new Date().toISOString(),
      ...l,
    }) as Traitement);

    setTraitements([...importes, ...traitements]);
    importes.forEach(t => syncCatalogueToMagasins({ type: 'traitements', item: t, isUpdate: false }));
  };

  const filtered = useMemo(() => traitements.filter(t => {
    if (search && ![t.designation, String(t.prix)].some(v => v.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [traitements, search, date]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => (a.designation || '').localeCompare(b.designation || '', 'fr')),
    [filtered]
  );

  const handleSave = (t: Traitement) => {
    const isUpdate = traitements.find(x => x.id === t.id);
    const traitementWithAudit = isUpdate ? addUpdateAudit(t) : addCreateAudit(t);
    const next = isUpdate ? traitements.map(x => x.id === t.id ? traitementWithAudit : x) : [traitementWithAudit, ...traitements];
    setTraitements(next);

    // Synchroniser vers tous les catalogues de magasins
    syncCatalogueToMagasins({ type: 'traitements', item: traitementWithAudit, isUpdate: !!isUpdate });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer ce traitement ?')) return;
    const next = traitements.filter(t => t.id !== id);
    setTraitements(next);

    // Supprimer également des catalogues de tous les magasins
    removeCatalogueFromMagasins('traitements', id);
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <ModalTraitement initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-4 md:px-5 py-2.5" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-400">👓</span>
          <span className="font-semibold" style={{ fontSize: 'clamp(13px, 3.5vw, 15px)' }}>
            Gestion des Composants: {TENANT.nom}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => printCatalogueTraitements(traitements)} className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
            <Printer size={15} /> Catalogue Traitements
          </button>
          <button onClick={() => setImportModal(true)} className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
            <FileUp size={15} /> Importer Fichier
          </button>
          <button onClick={() => setModal({ mode: 'add' })} className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
            Ajouter Traitement
          </button>
        </div>
      </div>

      {importModal && (
        <ImportCatalogueCsvDialog
          titre="Traitements"
          modele={MODELE_TRAITEMENTS}
          existants={traitements}
          onImporter={handleImportTraitements}
          onClose={() => setImportModal(false)}
        />
      )}

      <div className="bg-white rounded-lg shadow-sm p-4 md:p-5 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-gray-800">Traitements ({traitements.length})</h2>

        <div className="text-xs text-gray-400 hidden md:block">(Traitement, Prix)</div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden flex-1" style={{ minWidth: 180 }}>
            <input className="px-2 py-1.5 text-sm outline-none flex-1 w-full" placeholder="Recherche..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
          </div>
          <div className="hidden md:flex items-center border border-gray-300 rounded bg-white overflow-hidden">
            <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} placeholder="jj/mm/aaaa" value={date} onChange={e => setDate(e.target.value)} />
            {date && <button onClick={() => setDate('')} className="px-1 text-gray-400"><X size={12} /></button>}
          </div>
          <button onClick={() => {}} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
          <div className="flex-1 hidden md:block" />
          <div className="flex items-center gap-0.5 text-xs text-gray-500">
            {['<<', '<', '1', '>', '>>'].map((s, i) => (
              <button key={i} className={`px-1.5 py-0.5 border rounded hover:bg-gray-100 ${s === '1' ? 'border-blue-500 text-blue-600 font-bold' : 'border-gray-300'}`}>{s}</button>
            ))}
          </div>
        </div>

        {/* Table — desktop */}
        <div className="hidden md:block border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b-2 border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="px-3 py-3 w-8"><input type="checkbox" /></th>
                <th className="px-3 py-3 w-8 text-center">#</th>
                <th className="text-left px-3 py-3">Traitement</th>
                <th className="text-left px-3 py-3">Prix / Verre</th>
                <th className="text-left px-3 py-3">Créé par</th>
                <th className="text-left px-3 py-3">Modifié par</th>
                <th className="text-center px-3 py-3">Édition</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0
                ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucun traitement</td></tr>
                : sorted.map((t, idx) => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-center"><input type="checkbox" /></td>
                    <td className="px-3 py-2 text-center text-xs text-gray-400 font-medium">{idx + 1}</td>
                    <td className="px-3 py-2 font-semibold">{t.designation}</td>
                    <td className="px-3 py-2">{t.prix.toLocaleString('fr-FR')} F CFA</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {t.createdBy ? (
                        <div>
                          <div className="font-medium">{t.createdBy}</div>
                          <div className="text-gray-400">{formatDate(t.createdAt)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {t.updatedBy ? (
                        <div>
                          <div className="font-medium">{t.updatedBy}</div>
                          <div className="text-gray-400">{formatDate(t.updatedAt)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setModal({ mode: 'edit', item: t })} className="text-blue-500 hover:text-blue-700 p-1"><Edit size={13} /></button>
                        <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Cards — mobile */}
        <div className="md:hidden flex flex-col gap-2">
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>Aucun traitement</div>
          ) : sorted.map(t => (
            <div key={t.id} style={{
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.designation}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {t.prix.toLocaleString('fr-FR')} F CFA
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setModal({ mode: 'edit', item: t })} style={{ color: '#3b82f6', padding: '4px 6px' }}>
                  <Edit size={15} />
                </button>
                <button onClick={() => handleDelete(t.id)} style={{ color: '#ef4444', padding: '4px 6px' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
