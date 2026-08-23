import { logger } from '../../../utils/logger';
import { useState, useEffect } from 'react';
import { Search, X, Edit, Trash2, Calendar, Download } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { getMagasins } from '../../../constants/magasins';
import { useLiveData } from '../../../hooks/useLiveData';
import { AddButton } from '../../../components/AddButton';
import { useAuth } from '../../../contexts/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { chargerToutesLesVentes, type VenteSupabase } from '../../../services/ventesService';
import { TENANT } from '../../../config/tenant';

const genRef = () => String(Date.now()).slice(-5).padStart(5, '0');

const MAGASINS = getMagasins().map(magasin => magasin.label.replace(`${TENANT.nom} `, ''));
const BENEFICIAIRES = ['BÉNÉFICIAIRE A', 'BÉNÉFICIAIRE B', 'CAISSE', 'FOURNISSEUR', 'AUTRE'];
const TYPES = ['Entrée', 'Sortie'];
const NATURES = ['Vente', 'Achat', 'Remboursement', 'Avance', 'Règlement', 'Autre'];
const MODES_PAIEMENT = ['Espèces', 'Virement bancaire', 'Chèque', 'Mobile Money'];
const COMPTES_BANQUE = ['SGCI - Compte Principal', 'BNI - Compte Courant', 'BIAO - Épargne', 'SIB - Opérations'];
const ANNEES = ['2024', '2025', '2026'];

interface Mouvement extends AuditInfo {
  id: string; reference: string; magasin: string; dateMouvement: string; heure: string;
  beneficiaire: string; type: string; nature: string; montant: number;
  modePaiement: string; compteBanque: string; details: string; commentaire: string;
}

/**
 * Ordre d'arrivée : tri chronologique DÉCROISSANT (du plus récent au plus ancien)
 * → les nouveaux mouvements apparaissent EN HAUT. Clé = date du mouvement + heure ;
 * à défaut, la date de création (createdAt).
 */
function ordreArriveeMvt(list: Mouvement[]): Mouvement[] {
  const key = (m: Mouvement) => `${m.dateMouvement || ''} ${m.heure || ''}`.trim() || ((m as any).createdAt || '');
  return [...list].sort((a, b) => key(b).localeCompare(key(a)));
}

// ── Ajouter Mouvement modal (Image 8) ─────────────────────────────────────────
function AjouterMouvement({ initial, onSave, onClose }: { initial?: Mouvement; onSave: (m: Mouvement) => void; onClose: () => void }) {
  const now = new Date();
  const [form, setForm] = useState<Mouvement>(initial ?? {
    id: Date.now().toString(), reference: genRef(), magasin: '',
    dateMouvement: now.toISOString().slice(0, 10),
    heure: now.toTimeString().slice(0, 5),
    beneficiaire: '', type: '', nature: '', montant: 0,
    modePaiement: '', compteBanque: '', details: '', commentaire: '',
  });
  const set = (k: keyof Mouvement) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => {
      const val = e.target.type === 'number' ? +e.target.value : e.target.value;
      const updated = { ...f, [k]: val };
      // Toutes les ventes sont des Entrées : forcer le type si nature = Vente.
      if (k === 'nature' && val === 'Vente') updated.type = 'Entrée';
      return updated;
    });
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const doSave = () => {
    if (!form.beneficiaire || !form.type || !form.nature || !form.montant) {
      alert('Bénéficiaire, Type, Nature et Montant requis'); return;
    }
    onSave(form); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4">
        {/* Dark blue header */}
        <div className="flex items-center justify-between px-5 py-3 rounded-t-xl" style={{ backgroundColor: '#1e3a5f' }}>
          <span className="text-base font-semibold text-white">Ajouter Mouvement</span>
          <button onClick={onClose} className="text-white hover:text-gray-300"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {/* Row 1: Référence | Magasin | Date Mouvement (+heure) | Bénéficiaire | Type | Nature */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Référence <span className="text-red-500">*</span></label>
              <input className={iCls + ' bg-gray-50'} readOnly value={form.reference} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Magasin</label>
              <select className={iCls} value={form.magasin} onChange={set('magasin')}>
                <option value="">-- Choisir Magasin --</option>
                {MAGASINS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Date Mouvement <span className="text-red-500">*</span></label>
              <input type="date" className={iCls} value={form.dateMouvement} onChange={set('dateMouvement')} />
              <input type="time" className={iCls + ' mt-1'} value={form.heure} onChange={set('heure')} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Bénéficiaire <span className="text-red-500">*</span></label>
              <input list="mvt-beneficiaires" className={iCls} placeholder="Saisir ou choisir..." value={form.beneficiaire} onChange={set('beneficiaire')} />
              <datalist id="mvt-beneficiaires">
                {BENEFICIAIRES.map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Type <span className="text-red-500">*</span></label>
              <select className={iCls} value={form.type} onChange={set('type')}>
                <option value="">-- Type Mouvement --</option>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Nature <span className="text-red-500">*</span></label>
              <input list="mvt-natures" className={iCls} placeholder="Saisir ou choisir..." value={form.nature} onChange={set('nature')} />
              <datalist id="mvt-natures">
                {NATURES.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
          </div>

          {/* Row 2: Montant | Mode de Paiement | Compte Banque | Détails | Commentaire | Pièce Jointe */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Montant <span className="text-red-500">*</span></label>
              <input type="number" className={iCls} value={form.montant} onChange={set('montant')} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Mode de Paiement <span className="text-red-500">*</span></label>
              <input list="mvt-modes-paiement" className={iCls} placeholder="Saisir ou choisir..." value={form.modePaiement} onChange={set('modePaiement')} />
              <datalist id="mvt-modes-paiement">
                {MODES_PAIEMENT.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Compte Banque <span className="text-red-500">*</span></label>
              <input list="mvt-comptes-banque" className={iCls} placeholder="Saisir ou choisir..." value={form.compteBanque} onChange={set('compteBanque')} />
              <datalist id="mvt-comptes-banque">
                {COMPTES_BANQUE.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Détails</label>
              <input className={iCls} value={form.details} onChange={set('details')} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block font-semibold">Commentaire</label>
              <textarea className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full resize-none" rows={3} value={form.commentaire} onChange={set('commentaire')} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Pièce Jointe</label>
              <button className="w-full h-12 flex items-center justify-center border border-gray-300 rounded" style={{ backgroundColor: '#fef3c7' }}>
                <Download size={20} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Dashed separator */}
          <div className="border-t border-dashed border-gray-300" />

          {/* Solde Compte Banque */}
          <div className="text-center font-semibold text-gray-700 text-sm py-2">Solde Compte Banque</div>
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

export function MouvementPage() {
  const { user } = useAuth();
  const estConseillere = user?.role === 'conseillere';
  // Récap des entrées/sorties réservé aux comptables, directeurs et administrateurs.
  const peutVoirRecap = hasPermission(user, 'comptabilite.read');
  const [mouvements, setMouvements] = useLiveData<Mouvement>('leclaire_mouvements');
  const [search, setSearch] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [annee, setAnnee] = useState('2026');
  const [filtered, setFiltered] = useState<Mouvement[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: Mouvement } | null>(null);
  const [allMouvements, setAllMouvements] = useState<Mouvement[]>([]);
  // Toutes les ventes (tous magasins) chargées EN DIRECT depuis Firestore, afin
  // que le comptable / directeur / administrateur voient CHAQUE vente comme une
  // entrée, même sans avoir ouvert la page d'un magasin (cache local vide).
  const [ventesAll, setVentesAll] = useState<VenteSupabase[]>([]);

  useEffect(() => {
    let annule = false;
    const load = () => chargerToutesLesVentes()
      .then(rows => { if (!annule) setVentesAll(rows); })
      .catch(() => {});
    load();
    const interval = setInterval(load, 15000);
    const onUpdate = () => load();
    window.addEventListener('ventes-updated', onUpdate);
    return () => { annule = true; clearInterval(interval); window.removeEventListener('ventes-updated', onUpdate); };
  }, []);

  useEffect(() => {
    // Combiner mouvements manuels (gérés par useLiveData) + ventes de tous les magasins
    const mouvementsFromVentes: Mouvement[] = [];

    const labelParId = new Map(getMagasins().map(m => [m.id, m.label.replace(`${TENANT.nom} `, '')]));
    ventesAll
      .filter(vente => (vente.type || 'vente') === 'vente')
      .forEach(vente => {
        const recap: any = vente.recap || {};
        const dateVente = vente.date || vente.created_at;
        mouvementsFromVentes.push({
          id: `vente-${vente.id || Date.now()}`,
          reference: recap.numFacture || `V-${vente.id}`,
          magasin: labelParId.get(vente.magasin_id) || vente.magasin_id || '',
          dateMouvement: dateVente ? new Date(dateVente).toISOString().slice(0, 10) : '',
          heure: dateVente ? new Date(dateVente).toTimeString().slice(0, 5) : '',
          beneficiaire: vente.numero_client || vente.client || 'Client',
          type: 'Entrée',
          nature: 'Vente',
          montant: vente.total_net ?? vente.total_brut ?? 0,
          modePaiement: recap.modePaiement || 'Espèces',
          compteBanque: recap.compteBanque || '',
          details: `Vente ${recap.numFacture || ''}`.trim(),
          commentaire: (vente as any).observations || '',
        });
      });

    // Dépenses du Récap Hebdomadaire → considérées comme des Sorties.
    const mouvementsFromDepenses: Mouvement[] = [];
    try {
      const recaps = JSON.parse(localStorage.getItem('leclaire_recap_hebdo') || '[]');
      recaps.forEach((r: any) => {
        const depense = Number(r.depenses) || 0;
        if (depense <= 0) return;
        const mag = getMagasins().find(m => m.id === r.magasinId);
        mouvementsFromDepenses.push({
          id: `depense-${r.id}`,
          reference: `DEP-${r.jour}`,
          magasin: (mag?.label || r.magasinId || '').replace(`${TENANT.nom} `, ''),
          dateMouvement: r.semaine || '',
          heure: '',
          beneficiaire: 'CAISSE',
          type: 'Sortie',
          nature: 'Autre',
          montant: depense,
          modePaiement: 'Espèces',
          compteBanque: '',
          details: `Dépense hebdomadaire ${r.jour || ''} (semaine du ${r.semaine || ''})`,
          commentaire: '',
        });
      });
    } catch (error) {
      logger.error('Erreur chargement dépenses hebdomadaires:', error);
    }

    const combined = ordreArriveeMvt([...mouvements, ...mouvementsFromVentes, ...mouvementsFromDepenses]);
    setAllMouvements(combined);
    setFiltered(combined);
  }, [mouvements, ventesAll]);

  const runFilter = () => setFiltered(ordreArriveeMvt(allMouvements.filter(m => {
    if (search && ![m.reference, m.beneficiaire, m.type, m.nature, m.magasin].some(v => v?.toLowerCase().includes(search.toLowerCase()))) return false;
    if (dateDebut && m.dateMouvement < dateDebut) return false;
    if (dateFin && m.dateMouvement > dateFin) return false;
    return true;
  })));

  const handleSave = (m: Mouvement) => {
    const isUpdate = mouvements.find(x => x.id === m.id);
    const mouvementWithAudit = isUpdate ? addUpdateAudit(m) : addCreateAudit(m);
    const next = isUpdate ? mouvements.map(x => x.id === m.id ? mouvementWithAudit : x) : [mouvementWithAudit, ...mouvements];
    setMouvements(next);
  };

  const handleDelete = (id: string) => {
    // Ne permettre la suppression que des mouvements manuels (pas des ventes)
    if (id.startsWith('vente-')) {
      alert('Les ventes ne peuvent pas être supprimées depuis cette page. Veuillez supprimer la vente dans le magasin concerné.');
      return;
    }
    if (id.startsWith('depense-')) {
      alert('Les dépenses proviennent du Récap Hebdomadaire. Modifiez-les depuis la page Récap Hebdomadaire.');
      return;
    }
    if (!window.confirm('Supprimer ce mouvement ?')) return;
    const next = mouvements.filter(m => m.id !== id);
    setMouvements(next);
  };

  const typeColor = (t: string) => t === 'Entrée' ? '#16a34a' : '#dc2626';

  // Calculer les statistiques
  const totalEntrees = filtered.filter(m => m.type === 'Entrée').reduce((sum, m) => sum + (m.montant || 0), 0);
  const totalSorties = filtered.filter(m => m.type === 'Sortie').reduce((sum, m) => sum + (m.montant || 0), 0);
  const solde = totalEntrees - totalSorties;
  const nombreVentes = filtered.filter(m => m.nature === 'Vente').length;

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <AjouterMouvement initial={modal.item} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* Header bar */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center"><Calendar size={15} className="text-gray-600" /></div>
          <span className="text-sm font-semibold text-gray-600">Mouvements Entrées/Sorties - Tous les Magasins</span>
        </div>
        {!estConseillere && (
          <AddButton onClick={() => setModal({ mode: 'add' })} className="px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#0d9488' }}>
            Ajouter Mouvement
          </AddButton>
        )}
      </div>

      {/* Récap — visible uniquement pour comptables, directeurs et administrateurs */}
      {peutVoirRecap && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
            <div className="text-xs text-gray-500 mb-1">Total Entrées</div>
            <div className="text-2xl font-bold text-green-600">{totalEntrees.toLocaleString('fr-FR')} F</div>
            <div className="text-xs text-gray-400 mt-1">{filtered.filter(m => m.type === 'Entrée').length} mouvement(s)</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500">
            <div className="text-xs text-gray-500 mb-1">Total Sorties</div>
            <div className="text-2xl font-bold text-red-600">{totalSorties.toLocaleString('fr-FR')} F</div>
            <div className="text-xs text-gray-400 mt-1">{filtered.filter(m => m.type === 'Sortie').length} mouvement(s)</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-blue-500">
            <div className="text-xs text-gray-500 mb-1">Solde</div>
            <div className={`text-2xl font-bold ${solde >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              {solde.toLocaleString('fr-FR')} F
            </div>
            <div className="text-xs text-gray-400 mt-1">{solde >= 0 ? 'Positif' : 'Négatif'}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-purple-500">
            <div className="text-xs text-gray-500 mb-1">Ventes (Entrées)</div>
            <div className="text-2xl font-bold text-purple-600">{nombreVentes}</div>
            <div className="text-xs text-gray-400 mt-1">Tous magasins</div>
          </div>
        </div>
      )}

      {/* Table panel */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
        <div className="text-sm font-bold text-gray-800">Mouvements Entrées / Sorties ({filtered.length})</div>

        {/* Filter bar (Image 7 layout) */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <div className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center flex-shrink-0"><Calendar size={14} className="text-gray-600" /></div>
              <select className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white" style={{ width: 90 }} value={annee} onChange={e => setAnnee(e.target.value)}>
                {ANNEES.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-500">Date Fin</label>
              <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
                <input type="date" className="px-2 py-1.5 text-sm outline-none" style={{ width: 140 }} value={dateFin} onChange={e => setDateFin(e.target.value)} placeholder="jj/mm/aaaa" />
                {dateFin && <button onClick={() => setDateFin('')} className="px-1 text-gray-400"><X size={12} /></button>}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">Infos Mouvements</label>
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
          <div className="self-end">
            <button onClick={runFilter} className="px-3 py-1.5 rounded text-white text-sm" style={{ backgroundColor: '#2563eb' }}><Search size={14} /></button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-0.5 text-xs text-gray-500 self-end">
            {['<<', '<', '1', '2', '3', '>', '>>'].map((s, i) => (
              <button key={i} className={`px-1.5 py-0.5 border rounded hover:bg-gray-100 ${s === '1' ? 'border-blue-500 text-blue-600 font-bold' : 'border-gray-300'}`}>{s}</button>
            ))}
          </div>
        </div>

        <div className="border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold text-xs">
                <th className="px-2 py-2.5 w-8"><input type="checkbox" /></th>
                <th className="text-left px-2 py-2.5">N° Mouvement</th>
                <th className="text-left px-2 py-2.5">Emplacement</th>
                <th className="text-left px-2 py-2.5">Bénéficiaire</th>
                <th className="text-left px-2 py-2.5 bg-green-50">Type</th>
                <th className="text-left px-2 py-2.5">Nature</th>
                <th className="text-right px-2 py-2.5">Montant</th>
                <th className="text-left px-2 py-2.5">Mode de Paiement</th>
                <th className="text-left px-2 py-2.5">Compte Banque</th>
                <th className="text-left px-2 py-2.5">Commentaire</th>
                <th className="text-left px-2 py-2.5">Créé par</th>
                <th className="text-left px-2 py-2.5">Modifié par</th>
                <th className="text-center px-2 py-2.5">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={13} className="text-center py-10 text-gray-400">Aucun mouvement</td></tr>
                : filtered.map(m => (
                  <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-2 text-center"><input type="checkbox" /></td>
                    <td className="px-2 py-2 font-mono text-blue-700">{m.reference}</td>
                    <td className="px-2 py-2 text-gray-600">{m.magasin || '—'}</td>
                    <td className="px-2 py-2 font-semibold">{m.beneficiaire}</td>
                    <td className="px-2 py-2 bg-green-50">
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: typeColor(m.type) }}>{m.type}</span>
                    </td>
                    <td className="px-2 py-2 text-gray-600">{m.nature}</td>
                    <td className="px-2 py-2 text-right font-semibold">{m.montant.toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-gray-600">{m.modePaiement}</td>
                    <td className="px-2 py-2 text-gray-600 text-xs">{m.compteBanque}</td>
                    <td className="px-2 py-2 text-gray-500 max-w-xs truncate">{m.commentaire || '—'}</td>
                    <td className="px-2 py-2 text-xs text-gray-600">
                      {m.createdBy ? (
                        <div>
                          <div className="font-medium">{m.createdBy}</div>
                          <div className="text-gray-400">{formatDate(m.createdAt)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">
                      {m.updatedBy ? (
                        <div>
                          <div className="font-medium">{m.updatedBy}</div>
                          <div className="text-gray-400">{formatDate(m.updatedAt)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {m.id.startsWith('vente-') ? (
                          <span className="text-xs text-gray-400 italic">Vente</span>
                        ) : m.id.startsWith('depense-') ? (
                          <span className="text-xs text-gray-400 italic">Dépense</span>
                        ) : (
                          <>
                            <button onClick={() => setModal({ mode: 'edit', item: m })} className="text-blue-500 hover:text-blue-700 p-1"><Edit size={13} /></button>
                            <button onClick={() => handleDelete(m.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                          </>
                        )}
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
