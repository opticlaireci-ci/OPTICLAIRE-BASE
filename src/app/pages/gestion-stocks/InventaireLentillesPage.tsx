import { logger } from '../../utils/logger';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Save, X, Pencil, Package, Trash2, Eye, ListChecks } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatAuditInfo, logDeletion, showAuditNotification } from '../../utils/auditUtils';
import { replaceInventaires, chargerInventaires, rowToInventaire } from '../../services/inventairesService';
import { OPTIC_TABLES, OPTIC_STORAGE_KEY } from '../lentillesOpticData';
import type { Cell as OpticCell } from '../lentillesOpticData';
import { useLiveData } from '../../hooks/useLiveData';
import { safeUuid } from '../../utils/safeId';
import { TENANT } from '../../config/tenant';
import { useAuth } from '../../contexts/AuthContext';
import { getMagasins, getAllMagasinIds } from '../../constants/magasins';

// ─── types ────────────────────────────────────────────────────────────────────

type OpticOverrides = Record<string, Record<string, Record<string, OpticCell>>>;

interface LentilleItem {
  id: string;
  tableId: string;
  tableLabel: string;
  sph: string;
  cyl: string;
  stockTheorique: number;
  stockPhysique: number;
  marge: number;
}

interface InventaireLentilles {
  id: string;
  type: 'lentilles';
  // Rattachement au magasin : indispensable pour l'isolation RLS. Sans lui,
  // `inventaireToRow` produit magasin_id=null → l'écriture est REJETÉE par la
  // politique de sécurité et la ligne est filtrée au rechargement.
  magasin: string;
  magasinId: string;
  dateInventaire: string;
  items: LentilleItem[];
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

// Clé localStorage séparée pour ne pas mélanger avec l'inventaire montures.
const INV_LENTILLES_KEY = 'leclaire_inventaires_lentilles';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

function today() { return new Date().toISOString().split('T')[0]; }

// ─── composant principal ──────────────────────────────────────────────────────

export function InventaireLentillesPage() {
  // Un inventaire physique appartient à un MAGASIN RÉEL (pas au tenant global
  // « LECLAIRE » qui, une fois normalisé par la RLS, vaut chaîne vide → rejeté).
  //
  // On calque exactement la page inventaire montures (qui, elle, fonctionne) :
  //   • CHARGEMENT : on interroge TOUS les magasins du tenant et on laisse la
  //     RLS filtrer ceux que l'utilisateur a le droit de voir. Le filtre inclut
  //     donc forcément le magasin sur lequel on vient d'écrire → la ligne
  //     s'affiche (contrairement à un filtre figé sur [TENANT.nom]).
  //   • ÉCRITURE : magasin courant de l'utilisateur, avec repli sur le premier
  //     magasin du tenant (cas d'un admin sans magasin nominatif) — garantit un
  //     magasin_id réel, jamais vide.
  const { user } = useAuth();
  const loadMagasinIds = getAllMagasinIds();
  const magasinCourant =
    user?.magasinActuel || user?.magasinIds?.[0] || getMagasins()[0]?.id || '';

  // Stock actuel (overrides OPTIC) pour pré-remplir le stock théorique.
  const [opticData] = useLiveData<OpticOverrides>(OPTIC_STORAGE_KEY, [] as any);
  const overrides: OpticOverrides = (opticData as any)?.[0] ?? (opticData as any) ?? {};

  // Liste des inventaires persistée dans Supabase (même entité que montures,
  // filtrée par { type:'lentilles' }).
  const [inventaires, setInventaires] = useState<InventaireLentilles[]>([]);
  const loadingRef = useRef(false);
  const lastLoadRef = useRef(0);

  // Vues
  const [vue, setVue] = useState<'liste' | 'form' | 'detail'>('liste');
  const [editing, setEditing] = useState<InventaireLentilles | null>(null);

  // Formulaire
  const [dateInv, setDateInv] = useState(today());
  const [items, setItems] = useState<LentilleItem[]>([]);
  const [searchForm, setSearchForm] = useState('');

  // Filtre tableau OPTIC sélectionné pour ajouter des lignes
  const [tableIdx, setTableIdx] = useState(0);
  const [selSph, setSelSph] = useState('');
  const [selCyl, setSelCyl] = useState('');
  const [stockPhysique, setStockPhysique] = useState(0);

  // Filtres liste
  const [filterDate, setFilterDate] = useState('');
  const [searchListe, setSearchListe] = useState('');

  // Vue détail
  const [detailInv, setDetailInv] = useState<InventaireLentilles | null>(null);

  // Références en stock PAS ENCORE inventoriées (comme la page montures).
  const [showManquants, setShowManquants] = useState(false);
  const [manquants, setManquants] = useState<
    { tableId: string; tableLabel: string; sph: string; cyl: string; theorique: number }[]
  >([]);
  const [manquantsLabel, setManquantsLabel] = useState('');

  // ── chargement ──────────────────────────────────────────────────────────────

  const charger = () => {
    const now = Date.now();
    if (loadingRef.current || now - lastLoadRef.current < 1200) return;
    lastLoadRef.current = now;

    try {
      const c = localStorage.getItem(INV_LENTILLES_KEY);
      if (c) { const p = JSON.parse(c); if (Array.isArray(p)) setInventaires(p); }
    } catch {}

    loadingRef.current = true;
    chargerInventaires(loadMagasinIds)
      .then(rows => {
        const lentilles = rows
          .map(rowToInventaire)
          .filter((r: any) => r.type === 'lentilles') as InventaireLentilles[];
        setInventaires(lentilles);
        try { localStorage.setItem(INV_LENTILLES_KEY, JSON.stringify(lentilles)); } catch {}
      })
      .catch(e => logger.error('❌ Chargement inventaires lentilles:', e))
      .finally(() => { loadingRef.current = false; });
  };

  // Se relance quand les magasins autorisés arrivent (auth asynchrone) : sans
  // ça, le premier chargement partirait avec une liste vide et n'afficherait
  // jamais les inventaires.
  const magasinKey = loadMagasinIds.join(',');
  useEffect(() => {
    if (!loadMagasinIds.length) return;
    lastLoadRef.current = 0; // annule le throttle pour ce (re)chargement
    charger();
    window.addEventListener('inventaires-updated', charger);
    const poll = setInterval(charger, 30_000);
    return () => { window.removeEventListener('inventaires-updated', charger); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinKey]);

  // ── persistance ─────────────────────────────────────────────────────────────

  const sauvegarder = async (list: InventaireLentilles[]): Promise<boolean> => {
    setInventaires(list);
    try { localStorage.setItem(INV_LENTILLES_KEY, JSON.stringify(list)); } catch {}
    try {
      // On charge les inventaires montures existants pour ne pas les écraser.
      const allRows = await chargerInventaires(loadMagasinIds);
      const montures = allRows.map(rowToInventaire).filter((r: any) => r.type !== 'lentilles');
      await replaceInventaires([...montures, ...list]);
      const { setItemWithoutSync } = await import('../../services/autoSync');
      setItemWithoutSync(INV_LENTILLES_KEY, JSON.stringify(list));
      charger();
      return true;
    } catch (e: any) {
      logger.error('❌ Enregistrement inventaire lentilles:', e);
      alert(`Échec de l'enregistrement :\n${e?.message || e}`);
      charger();
      return false;
    }
  };

  // ── table OPTIC courante ────────────────────────────────────────────────────

  const table = OPTIC_TABLES[tableIdx];

  const getTheorique = (tId: string, row: string, col: string): number => {
    const cell: OpticCell = overrides[tId]?.[row]?.[col]
      ?? OPTIC_TABLES.find(t => t.id === tId)?.seed[row]?.[col]
      ?? [0, 0];
    return Math.max(0, cell[0] - cell[1]);
  };

  // ── formulaire : ajout ligne ────────────────────────────────────────────────

  const theorique = selSph && selCyl ? getTheorique(table.id, selSph, selCyl) : 0;
  const marge = stockPhysique - theorique;

  const handleAjouter = () => {
    if (!selSph || !selCyl) return;
    const newItem: LentilleItem = {
      id: safeUuid(),
      tableId: table.id,
      tableLabel: table.label,
      sph: selSph,
      cyl: selCyl,
      stockTheorique: theorique,
      stockPhysique,
      marge: stockPhysique - theorique,
    };
    setItems(prev => [...prev, newItem]);
    setSelSph('');
    setSelCyl('');
    setStockPhysique(0);
  };

  const handleSupprimerItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  // ── sauvegarde formulaire ───────────────────────────────────────────────────

  const handleSave = async () => {
    if (!magasinCourant) {
      alert("Impossible d'enregistrer : aucun magasin associé à votre compte.\nReconnectez-vous ou contactez l'administrateur.");
      return;
    }
    if (editing) {
      const updated = inventaires.map(inv =>
        inv.id === editing.id
          ? addUpdateAudit({
              ...inv,
              magasin: inv.magasin || magasinCourant,
              magasinId: inv.magasinId || magasinCourant,
              dateInventaire: dateInv,
              items,
            })
          : inv
      );
      const ok = await sauvegarder(updated);
      if (ok) { showAuditNotification('update', 'Inventaire lentilles'); setVue('liste'); }
    } else {
      const newInv = addCreateAudit({
        id: safeUuid(),
        type: 'lentilles' as const,
        magasin: magasinCourant,
        magasinId: magasinCourant,
        dateInventaire: dateInv,
        items,
      });
      const ok = await sauvegarder([...inventaires, newInv]);
      if (ok) { showAuditNotification('create', 'Inventaire lentilles'); setVue('liste'); }
    }
  };

  const ouvrirNouvel = () => {
    setEditing(null);
    setDateInv(today());
    setItems([]);
    setSearchForm('');
    setTableIdx(0);
    setSelSph(''); setSelCyl(''); setStockPhysique(0);
    setVue('form');
  };

  const ouvrirEdition = (inv: InventaireLentilles) => {
    setEditing(inv);
    setDateInv(inv.dateInventaire?.split('T')[0] ?? today());
    setItems([...inv.items]);
    setSearchForm('');
    setTableIdx(0);
    setSelSph(''); setSelCyl(''); setStockPhysique(0);
    setVue('form');
  };

  const handleSupprimer = async (inv: InventaireLentilles) => {
    if (!window.confirm(`Supprimer l'inventaire du ${fmt(inv.dateInventaire)} ?`)) return;
    const updated = inventaires.filter(i => i.id !== inv.id);
    const ok = await sauvegarder(updated);
    if (ok) { logDeletion('inventaire_lentilles', inv.id, inv); showAuditNotification('delete', 'Inventaire lentilles'); }
  };

  // ── références non inventoriées ──────────────────────────────────────────────
  // Univers = toutes les cases SPH×CYL des tables OPTIC qui ont du stock
  // théorique (> 0). « Non inventorié » = case en stock absente de l'inventaire.
  const handleVoirManquants = (inv: InventaireLentilles) => {
    const inventories = new Set(inv.items.map(it => `${it.tableId}|${it.sph}|${it.cyl}`));
    const missing: typeof manquants = [];
    for (const t of OPTIC_TABLES) {
      for (const sph of t.rows) {
        for (const cyl of t.cols) {
          const theo = getTheorique(t.id, sph, cyl);
          if (theo > 0 && !inventories.has(`${t.id}|${sph}|${cyl}`)) {
            missing.push({ tableId: t.id, tableLabel: t.label, sph, cyl, theorique: theo });
          }
        }
      }
    }
    setManquants(missing);
    setManquantsLabel(`${fmt(inv.dateInventaire)} — ${inv.items.length} référence(s) inventoriée(s)`);
    setShowManquants(true);
  };

  // ── filtres ─────────────────────────────────────────────────────────────────

  const filteredListe = useMemo(() => inventaires
    .filter(inv => {
      if (filterDate && !fmt(inv.dateInventaire).includes(filterDate)) return false;
      if (searchListe) {
        const q = searchListe.toLowerCase();
        return fmt(inv.dateInventaire).includes(q) || inv.items.some(it =>
          it.sph.includes(q) || it.cyl.includes(q) || it.tableLabel.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => (b.dateInventaire || '').localeCompare(a.dateInventaire || '')),
  [inventaires, filterDate, searchListe]);

  const filteredItems = useMemo(() => items.filter(it => {
    if (!searchForm) return true;
    const q = searchForm.toLowerCase();
    return it.sph.includes(q) || it.cyl.includes(q) || it.tableLabel.toLowerCase().includes(q);
  }), [items, searchForm]);

  // ── totaux formulaire ──────────────────────────────────────────────────────

  const totalEcarts = items.reduce((s, it) => s + it.marge, 0);
  const nbNegatifs = items.filter(it => it.marge < 0).length;

  // ════════════════════════════════════════════════════════════════════════════
  // MODAL RÉFÉRENCES NON INVENTORIÉES
  // ════════════════════════════════════════════════════════════════════════════
  if (showManquants) {
    return (
      <div style={{ padding: 24, backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>Références non inventoriées</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>{manquantsLabel}</p>
          </div>
          <button onClick={() => setShowManquants(false)} style={{ padding: '9px 22px', backgroundColor: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            ← Retour
          </button>
        </div>

        {manquants.length === 0 ? (
          <div style={{ backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 24, textAlign: 'center', color: '#065f46', fontSize: 14, fontWeight: 600 }}>
            ✅ Toutes les références en stock ont été inventoriées.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14, backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', color: '#92400e', fontSize: 13, fontWeight: 600 }}>
              ⚠️ {manquants.length} référence(s) en stock non inventoriée(s)
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['#', 'Table', 'SPH', 'CYL / Addition', 'Stock Théorique'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {manquants.map((m, idx) => (
                    <tr key={`${m.tableId}|${m.sph}|${m.cyl}`} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '9px 14px', fontSize: 13, color: '#9ca3af' }}>{idx + 1}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12 }}>
                        <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{m.tableLabel}</span>
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600 }}>{m.sph}</td>
                      <td style={{ padding: '9px 14px', fontSize: 13 }}>{m.cyl}</td>
                      <td style={{ padding: '9px 14px', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{m.theorique}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VUE FORMULAIRE
  // ════════════════════════════════════════════════════════════════════════════
  if (vue === 'form') {
    return (
      <div style={{ padding: 24, backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={20} color="#6b7280" />
            <span style={{ fontSize: 15, color: '#6b7280', fontWeight: 500 }}>Inventaire Lentilles</span>
          </div>
          <button
            onClick={() => setVue('liste')}
            style={{ padding: '9px 22px', backgroundColor: '#0369a1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            ← Inventaires
          </button>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 6 }}>
          {editing ? 'Modifier l\'inventaire lentilles' : 'Nouvel inventaire lentilles'}
        </h2>

        <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb' }}>

          {/* Date */}
          <div style={{ marginBottom: 24, maxWidth: 260 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              Date Inventaire <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="date" value={dateInv} onChange={e => setDateInv(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
            />
          </div>

          {/* Sélecteur table OPTIC */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Table de lentilles</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {OPTIC_TABLES.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => { setTableIdx(i); setSelSph(''); setSelCyl(''); setStockPhysique(0); }}
                  style={{
                    padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: tableIdx === i ? '2px solid #2563eb' : '1px solid #d1d5db',
                    backgroundColor: tableIdx === i ? '#eff6ff' : '#fff',
                    color: tableIdx === i ? '#1d4ed8' : '#374151',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ligne d'ajout */}
          <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>

              {/* SPH */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  {table.rowLabel} (SPH)
                </label>
                <select
                  value={selSph} onChange={e => setSelSph(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${selSph ? '#059669' : '#d1d5db'}`, borderRadius: 6, fontSize: 14 }}
                >
                  <option value="">— Choisir —</option>
                  {table.rows.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* CYL / Addition */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  {table.colLabel}
                </label>
                <select
                  value={selCyl} onChange={e => setSelCyl(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${selCyl ? '#059669' : '#d1d5db'}`, borderRadius: 6, fontSize: 14 }}
                >
                  <option value="">— Choisir —</option>
                  {table.cols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Stock théorique auto */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Stock Théorique</label>
                <input
                  type="number" value={theorique} readOnly
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, backgroundColor: '#f9fafb', cursor: 'default', boxSizing: 'border-box' }}
                />
              </div>

              {/* Stock physique */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Stock Physique</label>
                <input
                  type="number" value={stockPhysique} min={0}
                  onChange={e => setStockPhysique(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              {/* Bouton ajouter */}
              <button
                onClick={handleAjouter}
                disabled={!selSph || !selCyl}
                title="Ajouter la ligne"
                style={{ padding: '9px 16px', backgroundColor: selSph && selCyl ? '#0369a1' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, cursor: selSph && selCyl ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Save size={18} />
              </button>
            </div>

            {/* Marge prévisuelle */}
            {selSph && selCyl && (
              <div style={{ marginTop: 8, fontSize: 13, color: marge < 0 ? '#dc2626' : marge > 0 ? '#059669' : '#6b7280' }}>
                Marge prévisionnelle : <strong>{marge > 0 ? `+${marge}` : marge}</strong>
              </div>
            )}
          </div>

          {/* Barre de recherche + résumé */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text" placeholder="Rechercher SPH / CYL / table…"
                value={searchForm} onChange={e => setSearchForm(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{items.length} ligne(s)</span>
            {nbNegatifs > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', backgroundColor: '#fef2f2', padding: '3px 10px', borderRadius: 10 }}>
                ⚠️ {nbNegatifs} écart(s) négatif(s)
              </span>
            )}
            {totalEcarts !== 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: totalEcarts < 0 ? '#dc2626' : '#059669', backgroundColor: totalEcarts < 0 ? '#fef2f2' : '#d1fae5', padding: '3px 10px', borderRadius: 10 }}>
                Écart total : {totalEcarts > 0 ? `+${totalEcarts}` : totalEcarts}
              </span>
            )}
          </div>

          {/* Tableau des lignes — desktop */}
          <div className="hidden md:block" style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {['#', 'Table', 'SPH', 'CYL / Addtion', 'Stock Théo.', 'Stock Phys.', 'Marge', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                    Aucune ligne ajoutée — sélectionnez un SPH et un CYL puis cliquez sur le bouton d'ajout.
                  </td></tr>
                ) : filteredItems.map((item, idx) => {
                  const neg = item.marge < 0;
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: '#9ca3af' }}>{idx + 1}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13 }}>
                        <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                          {item.tableLabel}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>{item.sph}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13 }}>{item.cyl}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'center' }}>{item.stockTheorique}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{item.stockPhysique}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 12, backgroundColor: neg ? '#fef2f2' : item.marge > 0 ? '#d1fae5' : '#f3f4f6', color: neg ? '#dc2626' : item.marge > 0 ? '#059669' : '#374151' }}>
                          {item.marge > 0 ? `+${item.marge}` : item.marge}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <button onClick={() => handleSupprimerItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', padding: 2 }} title="Supprimer">
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cartes lignes — mobile */}
          <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 20 }}>
            {filteredItems.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                Aucune ligne ajoutée — sélectionnez un SPH et un CYL puis cliquez sur le bouton d'ajout.
              </div>
            ) : filteredItems.map((item) => {
              const neg = item.marge < 0;
              return (
                <div key={item.id} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{item.tableLabel}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 12, backgroundColor: neg ? '#fef2f2' : item.marge > 0 ? '#d1fae5' : '#f3f4f6', color: neg ? '#dc2626' : item.marge > 0 ? '#059669' : '#374151' }}>
                        {item.marge > 0 ? `+${item.marge}` : item.marge}
                      </span>
                      <button onClick={() => handleSupprimerItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', padding: 2 }} title="Supprimer">
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '6px' }}>
                    <div style={{ textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: 4, padding: '6px' }}>
                      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>SPH</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{item.sph}</div>
                    </div>
                    <div style={{ textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: 4, padding: '6px' }}>
                      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>CYL</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{item.cyl}</div>
                    </div>
                    <div style={{ textAlign: 'center', backgroundColor: '#f3f4f6', borderRadius: 4, padding: '6px' }}>
                      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Théo.</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>{item.stockTheorique}</div>
                    </div>
                    <div style={{ textAlign: 'center', backgroundColor: '#eff6ff', borderRadius: 4, padding: '6px' }}>
                      <div style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 600 }}>Phys.</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>{item.stockPhysique}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button onClick={() => setVue('liste')} style={{ padding: '9px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={items.length === 0}
              style={{ padding: '9px 28px', backgroundColor: items.length > 0 ? '#3b82f6' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, cursor: items.length > 0 ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600 }}
            >
              {editing ? 'Mettre à jour' : "Enregistrer l'inventaire"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VUE DÉTAIL
  // ════════════════════════════════════════════════════════════════════════════
  if (vue === 'detail' && detailInv) {
    const neg = detailInv.items.filter(i => i.marge < 0);
    const pos = detailInv.items.filter(i => i.marge > 0);
    return (
      <div style={{ padding: 24, backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>Inventaire lentilles — {fmt(detailInv.dateInventaire)}</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>{detailInv.items.length} référence(s)</p>
          </div>
          <button onClick={() => setVue('liste')} style={{ padding: '9px 22px', backgroundColor: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            ← Retour
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total lignes', val: detailInv.items.length, bg: '#eff6ff', c: '#1d4ed8' },
            { label: 'Écarts négatifs', val: neg.length, bg: '#fef2f2', c: '#dc2626' },
            { label: 'Écarts positifs', val: pos.length, bg: '#d1fae5', c: '#059669' },
            { label: 'Écart total', val: detailInv.items.reduce((s, i) => s + i.marge, 0), bg: '#f3f4f6', c: '#374151' },
          ].map(k => (
            <div key={k.label} style={{ backgroundColor: k.bg, borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: k.c, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
              <div style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 800, color: k.c }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Tableau détail — desktop */}
        <div className="hidden md:block" style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['#', 'Table', 'SPH', 'CYL / Addition', 'Théorique', 'Physique', 'Marge'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailInv.items.map((item, idx) => {
                const n = item.marge < 0;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: '#9ca3af' }}>{idx + 1}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12 }}>
                      <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{item.tableLabel}</span>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600 }}>{item.sph}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13 }}>{item.cyl}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, textAlign: 'center' }}>{item.stockTheorique}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{item.stockPhysique}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 12, backgroundColor: n ? '#fef2f2' : item.marge > 0 ? '#d1fae5' : '#f3f4f6', color: n ? '#dc2626' : item.marge > 0 ? '#059669' : '#374151' }}>
                        {item.marge > 0 ? `+${item.marge}` : item.marge}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cartes détail — mobile */}
        <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {detailInv.items.map((item) => {
            const n = item.marge < 0;
            return (
              <div key={item.id} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                  <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{item.tableLabel}</span>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 12, backgroundColor: n ? '#fef2f2' : item.marge > 0 ? '#d1fae5' : '#f3f4f6', color: n ? '#dc2626' : item.marge > 0 ? '#059669' : '#374151' }}>
                    {item.marge > 0 ? `+${item.marge}` : item.marge}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>SPH</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{item.sph}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>CYL</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{item.cyl}</div>
                  </div>
                  <div style={{ backgroundColor: '#f3f4f6', borderRadius: 4, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Théo.</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>{item.stockTheorique}</div>
                  </div>
                  <div style={{ backgroundColor: '#eff6ff', borderRadius: 4, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 600, textTransform: 'uppercase' }}>Phys.</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4ed8' }}>{item.stockPhysique}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VUE LISTE
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: 24, backgroundColor: '#f9fafb', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Package size={20} color="#6b7280" />
          <span style={{ fontSize: 15, color: '#6b7280', fontWeight: 500 }}>Gestion Stocks: {TENANT.nom}</span>
        </div>
        <button
          onClick={ouvrirNouvel}
          style={{ padding: '9px 24px', backgroundColor: '#0369a1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
        >
          + Inventaire lentilles
        </button>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>
        Inventaires Lentilles ({inventaires.length})
      </h2>

      {/* Filtres */}
      <div style={{ marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="jj-mm-aaaa"
          value={filterDate} onChange={e => setFilterDate(e.target.value)}
          style={{ padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 140 }}
        />
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text" placeholder="Rechercher…"
            value={searchListe} onChange={e => setSearchListe(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 30px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Tableau — desktop */}
      <div className="hidden md:block" style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600, width: 40 }}>#</th>
              <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>Date inventaire</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Lignes</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Écarts −</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Écart total</th>
              <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>Traçabilité</th>
              <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600 }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredListe.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                Aucun inventaire de lentilles trouvé
              </td></tr>
            ) : filteredListe.map((inv, idx) => {
              const audit = formatAuditInfo(inv);
              const negs = inv.items.filter(i => i.marge < 0).length;
              const ecart = inv.items.reduce((s, i) => s + i.marge, 0);
              return (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                >
                  <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>{idx + 1}</td>
                  <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#111827' }}>
                    🔬 {fmt(inv.dateInventaire)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13 }}>
                    <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>{inv.items.length}</span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    {negs > 0
                      ? <span style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '2px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12 }}>{negs} ⚠️</span>
                      : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: ecart < 0 ? '#dc2626' : ecart > 0 ? '#059669' : '#6b7280' }}>
                      {ecart > 0 ? `+${ecart}` : ecart}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
                      {audit.created !== '-' && <div><span style={{ color: '#059669', fontWeight: 600 }}>Créé :</span> {audit.created}</div>}
                      {audit.updated !== '-' && audit.updated !== audit.created && <div><span style={{ color: '#f59e0b', fontWeight: 600 }}>Modifié :</span> {audit.updated}</div>}
                      {audit.created === '-' && audit.updated === '-' && <span style={{ color: '#d1d5db' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button onClick={() => { setDetailInv(inv); setVue('detail'); }} title="Voir le détail" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center' }}>
                        <Eye size={15} />
                      </button>
                      <button onClick={() => handleVoirManquants(inv)} title="Voir les références non inventoriées" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', color: '#0369a1', display: 'flex', alignItems: 'center' }}>
                        <ListChecks size={15} />
                      </button>
                      <button onClick={() => ouvrirEdition(inv)} title="Modifier" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleSupprimer(inv)} title="Supprimer" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cartes lentilles — mobile */}
      <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredListe.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px', backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            Aucun inventaire de lentilles trouvé
          </div>
        ) : filteredListe.map((inv) => {
          const audit = formatAuditInfo(inv);
          const negs = inv.items.filter(i => i.marge < 0).length;
          const ecart = inv.items.reduce((s, i) => s + i.marge, 0);
          return (
            <div key={inv.id} style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px' }}>
                <span style={{ fontSize: 'clamp(13px, 3.5vw, 15px)', fontWeight: 700, color: '#111827' }}>
                  🔬 {fmt(inv.dateInventaire)}
                </span>
                <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  {inv.items.length} lignes
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                <div style={{ backgroundColor: negs > 0 ? '#fef2f2' : '#f3f4f6', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: negs > 0 ? '#dc2626' : '#6b7280', textTransform: 'uppercase' }}>Écarts −</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: negs > 0 ? '#dc2626' : '#374151' }}>{negs > 0 ? `${negs} ⚠️` : '—'}</div>
                </div>
                <div style={{ backgroundColor: ecart < 0 ? '#fef2f2' : ecart > 0 ? '#d1fae5' : '#f3f4f6', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: ecart < 0 ? '#dc2626' : ecart > 0 ? '#059669' : '#6b7280', textTransform: 'uppercase' }}>Écart total</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ecart < 0 ? '#dc2626' : ecart > 0 ? '#059669' : '#374151' }}>
                    {ecart > 0 ? `+${ecart}` : ecart}
                  </div>
                </div>
              </div>
              {(audit.created !== '-' || audit.updated !== '-') && (
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: '10px' }}>
                  {audit.created !== '-' && <div><span style={{ color: '#059669', fontWeight: 600 }}>Créé :</span> {audit.created}</div>}
                  {audit.updated !== '-' && audit.updated !== audit.created && <div><span style={{ color: '#f59e0b', fontWeight: 600 }}>Modifié :</span> {audit.updated}</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => { setDetailInv(inv); setVue('detail'); }} title="Voir le détail" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  <Eye size={15} />
                </button>
                <button onClick={() => handleVoirManquants(inv)} title="Références manquantes" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', color: '#0369a1', display: 'flex', alignItems: 'center' }}>
                  <ListChecks size={15} />
                </button>
                <button onClick={() => ouvrirEdition(inv)} title="Modifier" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleSupprimer(inv)} title="Supprimer" style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
