import { logger } from '../../utils/logger';
import { AddButton } from '../../components/AddButton';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Edit, Trash2, FileUp, Printer, ChevronDown } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { syncCatalogueToMagasins, removeCatalogueFromMagasins } from '../../utils/syncCataloguesToMagasins';
import { useLiveData } from '../../hooks/useLiveData';
import { getMagasins } from '../../constants/magasins';
import { printHeaderHTML } from '../../utils/documentHeader';
import { ImportCatalogueCsvDialog } from '../../components/ImportCatalogueCsvDialog';
import { MODELE_VERRES } from '../../utils/catalogueCsv';
import { TENANT } from '../../config/tenant';
import { imprimerHtmlDansApp } from '../../utils/printInApp';

function ComboBox({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputVal(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(inputVal.toLowerCase()));

  const handleInput = (v: string) => {
    setInputVal(v);
    onChange(v);
    setOpen(true);
  };

  const handleSelect = (o: string) => {
    setInputVal(o);
    onChange(o);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full">
      <div className="flex items-center border border-gray-200 rounded bg-white">
        <input
          className="flex-1 px-2 py-1.5 text-sm outline-none bg-transparent"
          value={inputVal}
          placeholder={placeholder}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        <button type="button" className="px-1.5 text-gray-400" onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}>
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded shadow-lg mt-0.5 max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Aucun résultat — valeur libre acceptée</div>
          ) : (
            filtered.map(o => (
              <div
                key={o}
                className="px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50"
                onMouseDown={e => { e.preventDefault(); handleSelect(o); }}
              >
                {o}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


const GARANTIES_V = ['6 mois', '1 an', '2 ans'];

function useRefList(lsKey: string, field: string): string[] {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    const read = () => {
      try {
        const data = JSON.parse(localStorage.getItem(lsKey) || '[]');
        setItems(data.map((x: any) => x[field]).filter(Boolean).sort());
      } catch { setItems([]); }
    };
    read();
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.key === lsKey) read(); };
    window.addEventListener('leclaire-sync-update', h);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener('leclaire-sync-update', h); window.removeEventListener('storage', read); };
  }, [lsKey, field]);
  return items;
}

interface Verre extends AuditInfo {
  id: string; fournisseur: string; typeVerre: string; verre: string;
  traitement: string; matiere: string; diametre: string;
  prixVerre: number; garantie: string; marge: number; createdAt: string;
}

function formatDT(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`,
    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`,
  };
}

// ── Hook : ventes réelles par verre ──────────────────────────────────────────
// Parcourt les ventes de tous les magasins (leclaire_ventes_* et vente flash) et
// additionne les quantités et montants des verres correspondants (par nom).
function useVentesVerre(nomVerre: string) {
  const compute = useCallback(() => {
    const cible = (nomVerre || '').toLowerCase().trim();
    let qte = 0;
    let total = 0;
    if (!cible) return { qte, total };
    const magasins = getMagasins();
    for (const mag of magasins) {
      const ventes: any[] = [];
      try { ventes.push(...JSON.parse(localStorage.getItem(`leclaire_ventes_${mag.id}`) || '[]')); } catch {}
      try { ventes.push(...JSON.parse(localStorage.getItem(`leclaire_vente_flash_${mag.id}`) || '[]')); } catch {}
      for (const v of ventes) {
        for (const verre of (v.verres || [])) {
          if ((verre.verre || '').toLowerCase().trim() !== cible) continue;
          const qD = parseFloat(verre?.oeilDroit?.quantite) || 0;
          const qG = parseFloat(verre?.oeilGauche?.quantite) || 0;
          qte += (qD + qG) || 1;
          const t = parseFloat(verre.totalVerres);
          if (!isNaN(t)) {
            total += t;
          } else {
            const pD = (parseFloat(verre?.oeilDroit?.prix) || 0) * qD;
            const pG = (parseFloat(verre?.oeilGauche?.prix) || 0) * qG;
            total += pD + pG;
          }
        }
      }
    }
    return { qte, total };
  }, [nomVerre]);

  const [stats, setStats] = useState(compute);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setStats(compute()), 250);
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('leclaire-sync-update', refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('leclaire-sync-update', refresh);
    };
  }, [compute]);

  return stats;
}

function MargeVerre({ nomVerre, prixVerre }: { nomVerre: string; prixVerre: number }) {
  const { qte, total } = useVentesVerre(nomVerre);
  const row = 'flex items-center gap-1.5 px-2 py-1 border-b border-gray-100 text-xs';
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cout = prixVerre * qte;
  const marge = total - cout;
  const pct = total > 0 ? Math.round((marge / total) * 100) : 0;
  return (
    <div style={{ minWidth: 220 }}>
      <div className={row}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f44336', flexShrink: 0, display: 'inline-block' }} />
        <span className="flex-1 text-xs">Commande</span>
        <span className="text-xs w-8 text-right">0.00</span>
        <span className="text-xs text-gray-400 px-1">Qte 0</span>
        <span className="text-xs w-8 text-right">0.00</span>
      </div>
      <div className={row}>
        <span style={{ width: 9, height: 9, background: '#4caf50', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, fontSize: 8, color: 'white', fontWeight: 700 }}>+</span>
        <span className="flex-1 text-xs">Vente</span>
        <span className="text-xs w-8 text-right" style={{ fontWeight: qte > 0 ? 700 : 400, color: qte > 0 ? '#1a237e' : 'inherit' }}>{fmt(total)}</span>
        <span className="text-xs px-1" style={{ color: qte > 0 ? '#1976d2' : '#9ca3af', fontWeight: qte > 0 ? 700 : 400 }}>Qte {qte}</span>
        <span className="text-xs w-8 text-right">{fmt(prixVerre)}</span>
      </div>
      <div className="flex justify-between px-2 py-1 border-b border-gray-100">
        <span className="text-xs font-bold" style={{ color: marge > 0 ? '#2e7d32' : marge < 0 ? '#c62828' : 'inherit' }}>{fmt(marge)}</span>
        <span className="text-xs font-bold">{pct}% / Verre</span>
      </div>
      <div className="flex justify-between px-2 py-1">
        <span className="text-xs font-bold" style={{ color: marge > 0 ? '#2e7d32' : marge < 0 ? '#c62828' : 'inherit' }}>{fmt(marge)}</span>
        <span className="text-xs font-bold">{pct}% / Total</span>
      </div>
    </div>
  );
}

function ModalVerre({ initial, onSave, onClose }: { initial?: Verre; onSave: (v: Verre) => void; onClose: () => void }) {
  const [form, setForm] = useState<Verre>(initial ?? {
    id: Date.now().toString(), fournisseur: '', typeVerre: '', verre: '',
    traitement: '', matiere: '', diametre: '', prixVerre: 0, garantie: '', marge: 0,
    createdAt: new Date().toISOString(),
  });
  const set = (k: keyof Verre) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value }));

  const typeVerreList = useRefList('leclaire_db_types-verre', 'typeVerre');
  const traitementsList = useRefList('leclaire_db_traitements', 'traitement');
  const matieresList = useRefList('leclaire_db_matieres', 'matiere');
  const diametresList = useRefList('leclaire_db_diametres', 'diametre');
  const [fournisseursList, setFournisseursList] = useState<string[]>([]);
  useEffect(() => {
    import('../../services/api').then(({ api }) =>
      api.getAll<any>('fournisseurs').then(items =>
        setFournisseursList(items.map((f: any) => f.raisonSociale || f.nom).filter(Boolean).sort())
      ).catch(() => {})
    );
  }, []);

  const iCls = 'border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const selCls = 'border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const lCls = 'text-xs text-gray-600 mb-1 block';

  const doSave = () => {
    if (!form.typeVerre || !form.verre || !form.traitement || !form.matiere || !form.diametre) {
      alert('Type Verre, Verre, Traitement, Matière et Diamètre sont requis'); return;
    }
    onSave(form); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded shadow-2xl w-full max-w-3xl mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100">
          <span className="font-semibold text-gray-800">{initial ? 'Modifier' : 'Ajouter'} Verre</span>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 font-bold text-lg px-1">×</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lCls}>Fournisseur</label>
              <ComboBox value={form.fournisseur} onChange={v => setForm(f => ({ ...f, fournisseur: v }))} options={fournisseursList} placeholder="Fournisseur...." />
            </div>
            <div>
              <label className={lCls}>Type Verre <span className="text-red-500">*</span></label>
              <ComboBox value={form.typeVerre} onChange={v => setForm(f => ({ ...f, typeVerre: v }))} options={typeVerreList} placeholder="Type Verre...." />
            </div>
            <div>
              <label className={lCls}>Verre <span className="text-red-500">*</span></label>
              <input className={iCls} value={form.verre} onChange={set('verre')} />
            </div>
          </div>
          <div className="border-t border-dashed border-gray-200" />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lCls}>Traitement <span className="text-red-500">*</span></label>
              <ComboBox value={form.traitement} onChange={v => setForm(f => ({ ...f, traitement: v }))} options={traitementsList} placeholder="Traitement...." />
            </div>
            <div>
              <label className={lCls}>Matière <span className="text-red-500">*</span></label>
              <ComboBox value={form.matiere} onChange={v => setForm(f => ({ ...f, matiere: v }))} options={matieresList} placeholder="Matière...." />
            </div>
            <div>
              <label className={lCls}>Diamètre <span className="text-red-500">*</span></label>
              <ComboBox value={form.diametre} onChange={v => setForm(f => ({ ...f, diametre: v }))} options={diametresList} placeholder="Diamètre...." />
            </div>
          </div>
          <div className="border-t border-dashed border-gray-200" />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lCls}>Prix Verre</label>
              <input type="number" className={iCls} value={form.prixVerre} onChange={set('prixVerre')} />
            </div>
            <div className="col-span-2">
              <label className={lCls}>Garantie</label>
              <select className={selCls} value={form.garantie} onChange={set('garantie')}>
                <option value=""></option>
                {GARANTIES_V.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="border-t border-dashed border-gray-200 mx-5 mb-4" />
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button onClick={doSave} className="px-4 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#2563eb' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function printCatalogueVerres(verres: Verre[]) {
  const html = `
    <html><head><title>Catalogue Verres — ${TENANT.nom}</title>
    <style>body{font-family:sans-serif;padding:20px}h1{font-size:18px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}
    th{background:#f5f5f5;font-size:12px}</style></head><body>
    ${printHeaderHTML()}
    <h1>Catalogue Verres</h1>
    <table><thead><tr><th>#</th><th>Fournisseur</th><th>Type Verre</th><th>Verre</th><th>Traitement</th><th>Matière</th><th>Diamètre</th><th>Prix / Verre</th></tr></thead>
    <tbody>${verres.map((v, i) => `<tr><td>${i + 1}</td><td>${v.fournisseur}</td><td>${v.typeVerre}</td><td>${v.verre}</td><td>${v.traitement}</td><td>${v.matiere}</td><td>${v.diametre}</td><td>${v.prixVerre.toLocaleString('fr-FR')} F CFA</td></tr>`).join('')}
    </tbody></table></body></html>`;
  imprimerHtmlDansApp(html);
}

export function VerrePage() {
  const [verres, setVerres] = useLiveData<Verre>('leclaire_global_verres');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Verre } | null>(null);
  const [importModal, setImportModal] = useState(false);

  // Liste affichée dérivée : montre tout par défaut, filtre en direct sur la recherche
  const filtered = verres.filter(v => {
    if (search) {
      const q = search.toLowerCase();
      if (![v.typeVerre, v.verre, v.traitement, v.matiere, v.diametre, String(v.prixVerre)].some(s => (s || '').toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const runFilter = () => {}; // filtrage en direct via `search`

  // Auto-enregistrer les types de verre, traitements, matières et diamètres
  const autoRegisterVerreFields = (verre: Verre) => {
    // 1. Enregistrer le Type de Verre (T)
    if (verre.typeVerre && verre.typeVerre.trim()) {
      try {
        const typesVerreLS = JSON.parse(localStorage.getItem('leclaire_db_types-verre') || '[]');
        const exists = typesVerreLS.some((t: any) =>
          t.typeVerre && t.typeVerre.toLowerCase().trim() === verre.typeVerre.toLowerCase().trim()
        );
        if (!exists) {
          const newTypeVerre = addCreateAudit({
            id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
            typeVerre: verre.typeVerre.trim(),
          });
          typesVerreLS.push(newTypeVerre);
          localStorage.setItem('leclaire_db_types-verre', JSON.stringify(typesVerreLS));
          window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key: 'leclaire_db_types-verre' } }));
        }
      } catch (err) { logger.error('Erreur auto-enregistrement type verre:', err); }
    }

    // 2. Enregistrer le Traitement
    if (verre.traitement && verre.traitement.trim()) {
      try {
        const traitementsLS = JSON.parse(localStorage.getItem('leclaire_db_traitements') || '[]');
        const exists = traitementsLS.some((t: any) =>
          t.traitement && t.traitement.toLowerCase().trim() === verre.traitement.toLowerCase().trim()
        );
        if (!exists) {
          const newTraitement = addCreateAudit({
            id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
            traitement: verre.traitement.trim(),
          });
          traitementsLS.push(newTraitement);
          localStorage.setItem('leclaire_db_traitements', JSON.stringify(traitementsLS));
          window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key: 'leclaire_db_traitements' } }));
        }
      } catch (err) { logger.error('Erreur auto-enregistrement traitement:', err); }
    }

    // 3. Enregistrer la Matière (M)
    if (verre.matiere && verre.matiere.trim()) {
      try {
        const matieresLS = JSON.parse(localStorage.getItem('leclaire_db_matieres') || '[]');
        const exists = matieresLS.some((m: any) =>
          m.matiere && m.matiere.toLowerCase().trim() === verre.matiere.toLowerCase().trim()
        );
        if (!exists) {
          const newMatiere = addCreateAudit({
            id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
            matiere: verre.matiere.trim(),
          });
          matieresLS.push(newMatiere);
          localStorage.setItem('leclaire_db_matieres', JSON.stringify(matieresLS));
          window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key: 'leclaire_db_matieres' } }));
        }
      } catch (err) { logger.error('Erreur auto-enregistrement matière:', err); }
    }

    // 4. Enregistrer le Diamètre (D)
    if (verre.diametre && verre.diametre.trim()) {
      try {
        const diametresLS = JSON.parse(localStorage.getItem('leclaire_db_diametres') || '[]');
        const exists = diametresLS.some((d: any) =>
          d.diametre && d.diametre.toLowerCase().trim() === verre.diametre.toLowerCase().trim()
        );
        if (!exists) {
          const newDiametre = addCreateAudit({
            id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
            diametre: verre.diametre.trim(),
          });
          diametresLS.push(newDiametre);
          localStorage.setItem('leclaire_db_diametres', JSON.stringify(diametresLS));
          window.dispatchEvent(new CustomEvent('leclaire-sync-update', { detail: { key: 'leclaire_db_diametres' } }));
        }
      } catch (err) { logger.error('Erreur auto-enregistrement diamètre:', err); }
    }
  };

  const handleSave = (v: Verre) => {
    const isUpdate = verres.find(x => x.id === v.id);
    const verreWithAudit = isUpdate ? addUpdateAudit(v) : addCreateAudit(v);
    const next = isUpdate ? verres.map(x => x.id === v.id ? verreWithAudit : x) : [verreWithAudit, ...verres];
    setVerres(next);

    // Auto-enregistrer les types de verre, traitements, matières et diamètres dans leurs boutons (T, M, D)
    autoRegisterVerreFields(v);

    // Synchroniser vers tous les catalogues de magasins
    syncCatalogueToMagasins({ type: 'verres', item: verreWithAudit, isUpdate: !!isUpdate });
  };

  /**
   * Import ICG.csv : les doublons ont déjà été écartés par le dialogue, il reste
   * à compléter les champs absents du fichier (identifiant, marge) puis à
   * appliquer les mêmes effets que la saisie manuelle.
   */
  const handleImportVerres = (nouvelles: Record<string, any>[]) => {
    const verresImportes: Verre[] = nouvelles.map((l, i) => addCreateAudit({
      // Date.now() serait identique pour toutes les lignes d'un même import :
      // l'index garantit des identifiants uniques.
      id: `${Date.now()}-${i}`,
      marge: 0,
      createdAt: new Date().toISOString(),
      ...l,
    }) as Verre);

    setVerres([...verresImportes, ...verres]);
    verresImportes.forEach(v => {
      autoRegisterVerreFields(v);
      syncCatalogueToMagasins({ type: 'verres', item: v, isUpdate: false });
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Supprimer ce verre ?')) return;
    const next = verres.filter(v => v.id !== id);
    setVerres(next);

    // Supprimer également des catalogues de tous les magasins
    removeCatalogueFromMagasins('verres', id);
  };

  const FilterBar = () => (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
        <input className="px-2 py-1.5 text-sm outline-none" style={{ width: 220 }} placeholder="Recherche..." value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
      </div>
      <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
        <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} placeholder="jj/mm/aaaa" value={date} onChange={e => setDate(e.target.value)} />
        {date && <button onClick={() => setDate('')} className="px-1 text-gray-400"><X size={12} /></button>}
      </div>
      <button onClick={runFilter} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5 text-xs text-gray-500">
        {['<<', '<', '1', '>', '>>'].map((s, i) => (
          <button key={i} className={`px-1.5 py-0.5 border rounded hover:bg-gray-100 ${s === '1' ? 'border-blue-500 text-blue-600 font-bold' : 'border-gray-300'}`}>{s}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {importModal && (
        <ImportCatalogueCsvDialog
          titre="Verres"
          modele={MODELE_VERRES}
          existants={verres}
          onImporter={handleImportVerres}
          onClose={() => setImportModal(false)}
        />
      )}
      {modal && <ModalVerre initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-5 py-2.5" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-400">👓</span>
          <span className="font-semibold" style={{ fontSize: 'clamp(0.82rem, 3vw, 0.9rem)' }}>Gestion des Composants: {TENANT.nom}</span>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => printCatalogueVerres(verres)} className="flex items-center gap-1.5 px-4 py-2 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
            <Printer size={15} /> Catalogue Verres
          </button>
          <button onClick={() => setImportModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#22c55e' }}>
            <FileUp size={15} /> Importer Fichier
          </button>
          <AddButton onClick={() => setModal({ mode: 'add' })} className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
            Ajouter Verre
          </AddButton>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-gray-800">Verres ({verres.length})</h2>

        <div className="text-xs text-gray-400">(Type Verre, Verre, Traitement, Matière, Diamètre, Prix)</div>
        <FilterBar />

        <div className="border border-gray-200 rounded overflow-x-auto hidden md:block">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200 text-gray-700 font-bold text-xs">
                <th className="px-2 py-2.5 w-8"><input type="checkbox" /></th>
                <th className="px-2 py-2.5 w-10 text-center">
                  <button className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: '#f44336' }}>
                    <Trash2 size={11} color="white" />
                  </button>
                </th>
                <th className="text-left px-2 py-2.5">Fournisseur</th>
                <th className="text-left px-2 py-2.5">Type Verre</th>
                <th className="text-left px-2 py-2.5">Verre</th>
                <th className="text-left px-2 py-2.5">Traitement</th>
                <th className="text-left px-2 py-2.5">Matière</th>
                <th className="text-left px-2 py-2.5">Diamètre</th>
                <th className="text-right px-2 py-2.5">Prix / Verre</th>
                <th className="px-0 py-2.5" style={{ minWidth: 220 }}>Marge</th>
                <th className="text-left px-2 py-2.5" style={{ minWidth: 150 }}>Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={11} className="text-center py-10 text-gray-400">Aucun verre</td></tr>
                : [...filtered].sort((a, b) => (a.verre || '').localeCompare(b.verre || '', 'fr')).map((v, idx) => {
                    const { date, time } = formatDT(v.updatedAt || v.createdAt);
                    const user = v.updatedBy || v.createdBy || '—';
                    const td = 'px-2 py-2 text-xs align-top';
                    return (
                      <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-2 text-center align-top"><input type="checkbox" /></td>
                        <td className="px-2 py-2 text-center text-gray-400 align-top text-xs">{idx + 1}</td>
                        <td className={td + ' text-gray-600'}>{v.fournisseur || '—'}</td>
                        <td className={td + ' font-semibold'}>{v.typeVerre}</td>
                        <td className={td}>
                          <div className="font-medium text-gray-800">{v.verre}</div>
                          {v.garantie && (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-white font-semibold"
                              style={{ backgroundColor: '#ff9800', fontSize: '0.65rem' }}>
                              Garantie: {v.garantie}
                            </span>
                          )}
                        </td>
                        <td className={td + ' text-gray-600'}>{v.traitement}</td>
                        <td className={td + ' text-gray-600'}>{v.matiere}</td>
                        <td className={td + ' text-gray-600'}>{v.diametre}</td>
                        <td className={td + ' text-right font-semibold'}>{v.prixVerre.toLocaleString('fr-FR')}</td>
                        <td className="p-0 align-top border-l border-r border-gray-100">
                          <MargeVerre nomVerre={v.verre} prixVerre={v.prixVerre ?? 0} />
                        </td>
                        <td className={td}>
                          <div className="font-semibold text-gray-800" style={{ fontSize: '0.7rem', lineHeight: 1.4 }}>{date}</div>
                          <div style={{ fontSize: '0.68rem', color: '#666', lineHeight: 1.4 }}>{time}</div>
                          <div style={{ fontSize: '0.68rem', color: '#333', lineHeight: 1.4, marginBottom: 4 }}>{user}</div>
                          <div className="flex gap-1">
                            <button onClick={() => setModal({ mode: 'edit', item: v })}
                              className="p-1 rounded border" style={{ background: '#fffde7', borderColor: '#ffe082' }}>
                              <Edit size={11} color="#f57f17" />
                            </button>
                            <button onClick={() => handleDelete(v.id)}
                              className="p-1 rounded" style={{ background: '#f44336' }}>
                              <Trash2 size={11} color="white" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden">
          {[...filtered].sort((a, b) => (a.verre || '').localeCompare(b.verre || '', 'fr')).map(v => (
            <div key={v.id} style={{
              background: 'white',
              borderRadius: 8,
              border: '1px solid #e0e0e0',
              padding: '12px 14px',
              marginBottom: 10,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {/* Card header: verre name + garantie badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'clamp(0.88rem, 3.5vw, 1rem)', color: '#1a237e' }}>{v.verre}</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', marginTop: 2 }}>{v.typeVerre}</div>
                </div>
                {v.garantie && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600,
                    background: '#fff3e0', color: '#e65100', flexShrink: 0,
                  }}>
                    {v.garantie}
                  </span>
                )}
              </div>
              {/* Info grid: traitement + matière/indice + diamètre + prix */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Traitement</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{v.traitement || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Matière / Indice</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{v.matiere || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Diamètre</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{v.diametre || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Prix / Verre</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1565c0' }}>{v.prixVerre.toLocaleString('fr-FR')} F</div>
                </div>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                <button onClick={() => setModal({ mode: 'edit', item: v })} style={{
                  flex: 1, padding: '7px 0', border: '1px solid #ffe082', borderRadius: 4,
                  background: '#fffde7', color: '#f57f17', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                }}>
                  Modifier
                </button>
                <button onClick={() => handleDelete(v.id)} style={{
                  flex: 1, padding: '7px 0', border: 'none', borderRadius: 4,
                  background: '#f44336', color: 'white', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                }}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa', fontSize: '0.9rem' }}>Aucun verre</div>
          )}
        </div>
      </div>
    </div>
  );
}
