import { logger } from '../../utils/logger';
import { AddButton } from '../../components/AddButton';
import { useState, useEffect, useRef } from 'react';
import { Search, Save, ChevronDown, X, Pencil, Printer, Package, Trash2 } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, formatAuditInfo, logDeletion, showAuditNotification, AuditInfo } from '../../utils/auditUtils';
import { getMagasins } from '../../constants/magasins';
import { replaceInventaires, chargerInventaires, rowToInventaire } from '../../services/inventairesService';
import { loadStockMagasin, readStockCache, type StockMagasin } from '../../services/inventaireService';
import { safeUuid } from '../../utils/safeId';
import { TENANT, nomMagasin } from '../../config/tenant';

interface InventaireItem {
  id: string;
  codeBarre: string;
  produit: string;
  stockTheorique: number;
  stockPhysique: number;
  marge: number;
}

interface Inventaire extends AuditInfo {
  id: string;
  magasin: string;
  magasinId: string;
  dateInventaire: string;
  items: InventaireItem[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

const ALL_MAGASINS = getMagasins();

function magasinLabel(label: string) {
  return nomMagasin(label);
}

function formatDateFR(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// ─── main component ──────────────────────────────────────────────────────────

export function InventairePage() {
  const [inventaires, setInventaires] = useState<Inventaire[]>([]);

  // Garde-fous contre la boucle de chargement (anti-rafale + anti-concurrence)
  const loadingRef = useRef(false);
  const lastLoadRef = useRef(0);

  // Selection magasin en ligne (pas de modal overlay)
  const [showMagasinSelector, setShowMagasinSelector] = useState(false);

  // Edition inventaire
  const [showInventaireModal, setShowInventaireModal] = useState(false);
  const [editingInventaire, setEditingInventaire] = useState<Inventaire | null>(null);
  const [selectedMagasin, setSelectedMagasin] = useState('');
  const [selectedMagasinId, setSelectedMagasinId] = useState('');

  // "Pas inventorié" — articles manquants
  const [showManquantsModal, setShowManquantsModal] = useState(false);
  const [manquants, setManquants] = useState<StockMagasin[]>([]);
  const [manquantsInventaireLabel, setManquantsInventaireLabel] = useState('');

  // Filtres liste
  const [filterDate, setFilterDate] = useState('');
  const [filterMagasin, setFilterMagasin] = useState('');

  // Formulaire article dans le modal d'inventaire
  const [dateInventaire, setDateInventaire] = useState(new Date().toISOString().split('T')[0]);
  const [codeBarre, setCodeBarre] = useState('');
  const [selectedProduit, setSelectedProduit] = useState('');
  const [selectedProduitData, setSelectedProduitData] = useState<StockMagasin | null>(null);
  const [stockTheorique, setStockTheorique] = useState(0);
  const [stockPhysique, setStockPhysique] = useState(0);
  const [items, setItems] = useState<InventaireItem[]>([]);
  const [searchRecherche, setSearchRecherche] = useState('');

  // Autocomplete
  const [stockMagasin, setStockMagasin] = useState<StockMagasin[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [produitInput, setProduitInput] = useState('');
  const [suggestions, setSuggestions] = useState<StockMagasin[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Marge calculée automatiquement
  const margeCalculee = stockPhysique - stockTheorique;
  const margeNegative = margeCalculee < 0;

  // ── chargement réactif des inventaires ────────────────────────────────────
  // loadInventaires lit depuis cloudMemoryCache (via l'intercepteur autoSync).
  // On s'abonne à TOUS les signaux qui indiquent une mise à jour du cache :
  //   • inventaires-updated  → hydratation initiale depuis Supabase terminée
  //   • leclaire-sync-update → Realtime a reçu un changement d'un autre navigateur
  //   • storage              → write dans le même onglet / tab voisin
  // Sans ces listeners, la page ne voit jamais les données après le refresh
  // (cache vide au montage) ni les sauvegardes des autres navigateurs.

  const loadInventaires = () => {
    // Supabase est la SOURCE DE VÉRITÉ. IMPORTANT : cette fonction NE DOIT PAS
    // écrire dans localStorage — sinon setItemWithoutSync émet un événement
    // `storage`/`leclaire-sync-update` qui re-déclenche loadInventaires → boucle
    // infinie (ERR_INSUFFICIENT_RESOURCES, page qui tremble). L'alimentation du
    // cache est faite UNIQUEMENT par hydrateInventaires. Ici on ne fait que lire.

    // Garde anti-rafale : ignore les appels rapprochés (<1,2 s) et empêche les
    // requêtes concurrentes de s'empiler.
    const now = Date.now();
    if (loadingRef.current) return;
    if (now - lastLoadRef.current < 1200) return;
    lastLoadRef.current = now;

    // Affichage instantané depuis le cache (sans écrire).
    try {
      const cached = localStorage.getItem('leclaire_inventaires');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setInventaires(parsed);
      }
    } catch { /* cache illisible : ignoré */ }

    loadingRef.current = true;
    const magasinIds = ALL_MAGASINS.map(m => m.id);
    chargerInventaires(magasinIds)
      .then(rows => setInventaires(rows.map(rowToInventaire)))
      .catch(e => logger.error('❌ Chargement Supabase inventaires:', e))
      .finally(() => { loadingRef.current = false; });
  };

  useEffect(() => {
    loadInventaires();

    const onSyncUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.key || detail.key === 'leclaire_inventaires') {
        loadInventaires();
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'leclaire_inventaires') loadInventaires();
    };

    window.addEventListener('inventaires-updated', loadInventaires);
    window.addEventListener('leclaire-sync-update', onSyncUpdate);
    window.addEventListener('storage', onStorage);

    const poll = setInterval(loadInventaires, 30_000);

    return () => {
      window.removeEventListener('inventaires-updated', loadInventaires);
      window.removeEventListener('leclaire-sync-update', onSyncUpdate);
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  // Ferme l'autocomplete si clic en dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Écrit la liste dans Supabase (source de vérité) puis recharge depuis la base
  // pour confirmer. On AWAIT le RPC et on remonte toute erreur à l'utilisateur :
  // sans ça l'échec était silencieux et la donnée « revenait » au refresh car la
  // page relit toujours Supabase. On écrit le cache local SANS re-déclencher la
  // sync (setItemWithoutSync) pour éviter le double appel concurrent à replaceInventaires.
  const saveInventaires = async (list: Inventaire[]): Promise<boolean> => {
    setInventaires(list); // affichage optimiste immédiat
    try {
      await replaceInventaires(list);
      const { setItemWithoutSync } = await import('../../services/autoSync');
      setItemWithoutSync('leclaire_inventaires', JSON.stringify(list));
      // Confirme depuis la base : garantit que tous les navigateurs convergent
      loadInventaires();
      return true;
    } catch (e: any) {
      logger.error('❌ Enregistrement inventaire Supabase:', e);
      alert(`Échec de l'enregistrement dans Supabase :\n${e?.message || e}\n\nLes données n'ont PAS été sauvegardées. Réessayez ou vérifiez la connexion.`);
      // Recharge l'état réel de la base (annule l'affichage optimiste)
      loadInventaires();
      return false;
    }
  };

  // ── sélection magasin ──────────────────────────────────────────────────────

  const handleSelectMagasin = async (magasin: { id: string; label: string }) => {
    setSelectedMagasin(magasin.label);
    setSelectedMagasinId(magasin.id);
    setShowMagasinSelector(false);
    setEditingInventaire(null);
    setItems([]);
    setDateInventaire(new Date().toISOString().split('T')[0]);
    setShowInventaireModal(true);
    await chargerStockMagasin(magasin.id);
  };

  const chargerStockMagasin = async (magasinId: string) => {
    // Affichage INSTANTANÉ depuis le cache, puis rafraîchissement réseau.
    const cached = readStockCache(magasinId);
    if (cached.length) setStockMagasin(cached);
    setLoadingStock(true);
    try {
      const stock = await loadStockMagasin(magasinId.toUpperCase());
      setStockMagasin(stock);
    } catch (e) {
      logger.error('❌ Stock magasin:', e);
      setStockMagasin([]);
    } finally {
      setLoadingStock(false);
    }
  };

  // ── édition inventaire existant ────────────────────────────────────────────

  const handleEditerInventaire = async (inv: Inventaire) => {
    const mag = ALL_MAGASINS.find(m => m.label === inv.magasin || m.id === inv.magasinId);
    setSelectedMagasin(inv.magasin);
    setSelectedMagasinId(inv.magasinId || mag?.id || '');
    setEditingInventaire(inv);
    setDateInventaire(inv.dateInventaire);
    setItems([...inv.items]);
    setShowInventaireModal(true);
    if (mag?.id) await chargerStockMagasin(mag.id);
  };

  // ── autocomplete ───────────────────────────────────────────────────────────

  const handleProduitInputChange = (value: string) => {
    setProduitInput(value);
    setSelectedProduit(value);
    setSelectedProduitData(null);
    const q = value.toLowerCase().trim();
    const filtered = q
      ? stockMagasin.filter(s =>
          s.designation.toLowerCase().includes(q) ||
          s.produitId.toLowerCase().includes(q)
        )
      : stockMagasin;
    setSuggestions(filtered);
    setShowSuggestions(true);
  };

  const handleSelectSuggestion = (item: StockMagasin) => {
    setProduitInput(item.designation);
    setSelectedProduit(item.designation);
    setSelectedProduitData(item);
    setCodeBarre(item.produitId);
    setStockTheorique(item.quantiteDisponible);
    setStockPhysique(0);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleClearProduit = () => {
    setProduitInput('');
    setSelectedProduit('');
    setSelectedProduitData(null);
    setCodeBarre('');
    setStockTheorique(0);
    setStockPhysique(0);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ── ajout article ──────────────────────────────────────────────────────────

  const handleAddItem = () => {
    if (!selectedProduit) return;
    const marge = stockPhysique - stockTheorique;
    const newItem: InventaireItem = {
      id: safeUuid(),
      codeBarre,
      produit: selectedProduit,
      stockTheorique,
      stockPhysique,
      marge,
    };
    setItems(prev => [...prev, newItem]);
    handleClearProduit();
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // ── sauvegarde ─────────────────────────────────────────────────────────────

  const handleSaveInventaire = async () => {
    let ok = false;
    if (editingInventaire) {
      const updated = inventaires.map(inv =>
        inv.id === editingInventaire.id
          ? addUpdateAudit({ ...inv, dateInventaire, items })
          : inv
      );
      ok = await saveInventaires(updated);
      if (ok) showAuditNotification('update', 'Inventaire');
    } else {
      const newInv: Inventaire = {
        id: safeUuid(),
        magasin: selectedMagasin,
        magasinId: selectedMagasinId,
        dateInventaire,
        items,
      };
      const withAudit = addCreateAudit(newInv);
      ok = await saveInventaires([...inventaires, withAudit]);
      if (ok) showAuditNotification('create', 'Inventaire');
    }
    if (ok) handleCloseInventaireModal();
  };

  const handleSupprimerInventaire = async (inv: Inventaire) => {
    if (!window.confirm(`Supprimer l'inventaire du magasin ${inv.magasin} (${formatDateFR(inv.dateInventaire)}) ?`)) return;
    const updated = inventaires.filter(i => i.id !== inv.id);
    const ok = await saveInventaires(updated);
    if (ok) {
      logDeletion('inventaire', inv.id, inv);
      showAuditNotification('delete', 'Inventaire');
    }
  };

  const handleCloseInventaireModal = () => {
    setShowInventaireModal(false);
    setEditingInventaire(null);
    setSelectedMagasin('');
    setSelectedMagasinId('');
    setDateInventaire(new Date().toISOString().split('T')[0]);
    setItems([]);
    setSearchRecherche('');
    setStockMagasin([]);
    handleClearProduit();
  };

  // ── articles non inventoriés ───────────────────────────────────────────────

  const handleVoirManquants = async (inv: Inventaire) => {
    const mag = ALL_MAGASINS.find(m => m.label === inv.magasin || m.id === inv.magasinId);
    const magasinId = inv.magasinId || mag?.id || '';
    const stock = await loadStockMagasin(magasinId.toUpperCase());
    const inventoriesIds = new Set(inv.items.map(i => i.codeBarre || i.produit));
    const missing = stock.filter(s => !inventoriesIds.has(s.produitId) && !inventoriesIds.has(s.designation));
    setManquants(missing);
    setManquantsInventaireLabel(`${inv.magasin} — ${formatDateFR(inv.dateInventaire)}`);
    setShowManquantsModal(true);
  };

  // ── filtres ────────────────────────────────────────────────────────────────

  const filteredInventaires = inventaires.filter(inv => {
    const matchMagasin = !filterMagasin || inv.magasin === filterMagasin;
    return matchMagasin;
  }).sort((a, b) => new Date(b.dateInventaire).getTime() - new Date(a.dateInventaire).getTime());

  const filteredItems = items.filter(i =>
    !searchRecherche || i.produit.toLowerCase().includes(searchRecherche.toLowerCase())
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL INVENTAIRE (nouveau ou édition)
  // ══════════════════════════════════════════════════════════════════════════
  if (showInventaireModal) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Package size={22} color="#6b7280" />
            <span style={{ fontSize: '15px', color: '#6b7280' }}>Gestion Stocks: {TENANT.nom}</span>
          </div>
          <button
            onClick={handleCloseInventaireModal}
            style={{ padding: '9px 22px', backgroundColor: '#0369a1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
          >
            ← Inventaires
          </button>
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '6px' }}>
          {editingInventaire ? 'Modifier Inventaire' : 'Nouveau Inventaire'}
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
          Magasin : <strong>{selectedMagasin}</strong>
        </p>

        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>

          {/* Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>
                Date Inventaire <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="date"
                value={dateInventaire}
                onChange={e => setDateInventaire(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>
                Code Barre
              </label>
              <input
                type="text"
                value={codeBarre}
                onChange={e => setCodeBarre(e.target.value)}
                placeholder="Scan ou saisie"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
          </div>

          {/* Formulaire article */}
          <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>

              {/* Autocomplete monture/accessoire */}
              <div ref={autocompleteRef} style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>
                  Monture / Accessoire
                  {!loadingStock && stockMagasin.length > 0 && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: '#059669', fontWeight: 400 }}>
                      {stockMagasin.length} disponible(s)
                    </span>
                  )}
                  {loadingStock && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6b7280', fontWeight: 400 }}>Chargement…</span>
                  )}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={produitInput}
                    onChange={e => handleProduitInputChange(e.target.value)}
                    onFocus={() => { setSuggestions(produitInput.trim() ? suggestions : stockMagasin); setShowSuggestions(true); }}
                    placeholder={loadingStock ? 'Chargement…' : 'Tapez pour rechercher…'}
                    disabled={loadingStock}
                    style={{
                      width: '100%',
                      padding: '9px 34px 9px 12px',
                      border: `1px solid ${selectedProduitData ? '#059669' : '#d1d5db'}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {produitInput ? (
                    <button onClick={handleClearProduit} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 0 }}>
                      <X size={15} />
                    </button>
                  ) : (
                    <button onClick={() => { setSuggestions(stockMagasin); setShowSuggestions(v => !v); }} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', padding: 0 }} tabIndex={-1}>
                      <ChevronDown size={15} />
                    </button>
                  )}
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: '240px', overflowY: 'auto', marginTop: '3px' }}>
                    {suggestions.length === 0 ? (
                      <div style={{ padding: '12px 14px', color: '#9ca3af', fontSize: '13px' }}>
                        {produitInput.trim() ? `Aucun résultat pour « ${produitInput} »` : 'Aucun article dans ce magasin'}
                      </div>
                    ) : suggestions.map((s, i) => (
                      <div
                        key={s.produitId + i}
                        onClick={() => handleSelectSuggestion(s)}
                        style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#eff6ff')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                      >
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.designation}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>
                            {s.produitType === 'monture' ? '🕶️ Monture' : '🎯 Accessoire'}
                          </div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: s.quantiteDisponible > 0 ? '#059669' : '#dc2626', backgroundColor: s.quantiteDisponible > 0 ? '#d1fae5' : '#fee2e2', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                          Stock: {s.quantiteDisponible}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stock théorique */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>Stock Théorique</label>
                <input
                  type="number"
                  value={stockTheorique}
                  onChange={e => setStockTheorique(parseFloat(e.target.value) || 0)}
                  min={0}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Stock physique */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>Stock Physique</label>
                <input
                  type="number"
                  value={stockPhysique}
                  onChange={e => setStockPhysique(parseFloat(e.target.value) || 0)}
                  min={0}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Marge — calculée automatiquement, rouge si négative */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>Marge</label>
                <input
                  type="number"
                  value={margeCalculee}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    border: `1px solid ${margeNegative ? '#dc2626' : '#d1d5db'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: margeNegative ? '#fef2f2' : '#f9fafb',
                    color: margeNegative ? '#dc2626' : '#374151',
                    fontWeight: margeNegative ? '700' : '400',
                    cursor: 'default',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Bouton ajouter */}
              <AddButton
                onClick={handleAddItem}
                disabled={!selectedProduit}
                style={{ padding: '9px 16px', backgroundColor: selectedProduit ? '#0369a1' : '#9ca3af', color: '#fff', border: 'none', borderRadius: '6px', cursor: selectedProduit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Ajouter l'article"
              >
                <Save size={18} />
              </AddButton>
            </div>
          </div>

          {/* Barre de recherche dans la liste */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Rechercher dans cet inventaire…"
                value={searchRecherche}
                onChange={e => setSearchRecherche(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{items.length} article(s)</span>
          </div>

          {/* Tableau des articles */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {['#', 'Code Barre', 'Monture / Accessoire', 'Stock Théorique', 'Stock Physique', 'Marge', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                      Aucun article ajouté
                    </td>
                  </tr>
                ) : filteredItems.map((item, idx) => {
                  const neg = item.marge < 0;
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: '#9ca3af' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px' }}>{item.codeBarre || '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 500 }}>{item.produit}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center' }}>{item.stockTheorique}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center' }}>{item.stockPhysique}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontWeight: 600, fontSize: '12px', backgroundColor: neg ? '#fef2f2' : item.marge > 0 ? '#d1fae5' : '#f3f4f6', color: neg ? '#dc2626' : item.marge > 0 ? '#059669' : '#374151' }}>
                          {item.marge > 0 ? `+${item.marge}` : item.marge}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={() => handleRemoveItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', padding: '2px' }} title="Supprimer">
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Actions bas */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={handleCloseInventaireModal} style={{ padding: '9px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
              Annuler
            </button>
            <button
              onClick={handleSaveInventaire}
              style={{ padding: '9px 28px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
            >
              {editingInventaire ? 'Mettre à jour' : "Enregistrer l'Inventaire"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL ARTICLES NON INVENTORIÉS
  // ══════════════════════════════════════════════════════════════════════════
  if (showManquantsModal) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Articles non inventoriés</h2>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0' }}>{manquantsInventaireLabel}</p>
          </div>
          <button onClick={() => setShowManquantsModal(false)} style={{ padding: '9px 22px', backgroundColor: '#6b7280', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            ← Retour
          </button>
        </div>

        {manquants.length === 0 ? (
          <div style={{ backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
            <p style={{ color: '#065f46', fontWeight: 600, fontSize: '16px', margin: 0 }}>Tous les articles ont été inventoriés !</p>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', backgroundColor: '#fef3c7', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <span style={{ fontWeight: 600, color: '#92400e' }}>{manquants.length} article(s) non inventorié(s)</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {['#', 'Article', 'Type', 'Stock Théorique', 'Prix Vente'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manquants.map((s, i) => (
                  <tr key={s.produitId} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: i % 2 === 0 ? '#fff' : '#fffbeb' }}>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: '#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 500 }}>{s.designation}</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                      {s.produitType === 'monture' ? '🕶️ Monture' : '🎯 Accessoire'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: s.quantiteDisponible > 0 ? '#059669' : '#dc2626' }}>
                        {s.quantiteDisponible}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', color: '#6b7280' }}>
                      {s.prixVente.toLocaleString('fr-FR')} FCFA
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE PRINCIPALE — liste des inventaires
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Package size={20} color="#6b7280" />
          <span style={{ fontSize: '15px', color: '#6b7280', fontWeight: 500 }}>Gestion Stocks: {TENANT.nom}</span>
        </div>
        <button
          onClick={() => setShowMagasinSelector(v => !v)}
          style={{ padding: '9px 24px', backgroundColor: '#0369a1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
        >
          {showMagasinSelector ? '✕ Fermer' : 'Éditer Inventaire'}
        </button>
      </div>

      {/* Sélecteur de magasin inline */}
      {showMagasinSelector && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(3,105,161,0.08)' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', marginBottom: '14px', margin: '0 0 14px' }}>
            Choisir le magasin à inventorier :
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
            {ALL_MAGASINS.map(m => (
              <button
                key={m.id}
                onClick={() => handleSelectMagasin(m)}
                style={{ padding: '12px 16px', backgroundColor: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '6px', fontSize: '13px', fontWeight: '700', color: '#1e40af', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.color = '#1e40af'; }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
        Dates Inventaires ({inventaires.length})
      </h2>

      {/* Filtres */}
      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>Date</label>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="jj/mm/aaaa"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            style={{ padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', minWidth: '160px' }}
          />
          <select
            value={filterMagasin}
            onChange={e => setFilterMagasin(e.target.value)}
            style={{ padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', minWidth: '200px' }}
          >
            <option value="">-- Tous les magasins --</option>
            {ALL_MAGASINS.map(m => <option key={m.id} value={m.label}>{m.label}</option>)}
          </select>
          <button style={{ padding: '9px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Search size={16} /> Rechercher
          </button>
        </div>
      </div>

      {/* Tableau inventaires */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px 14px', width: '40px', textAlign: 'center', fontSize: '13px', fontWeight: '600' }}>#</th>
              <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Emplacement</th>
              <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Date Inventaire</th>
              <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Traçabilité</th>
              <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: '13px', fontWeight: '600' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredInventaires.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                  Aucun inventaire trouvé
                </td>
              </tr>
            ) : filteredInventaires.map((inv, idx) => {
              const audit = formatAuditInfo(inv);
              return (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                >
                  <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>{idx + 1}</td>
                  <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                    Magasin {magasinLabel(inv.magasin)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '14px', color: '#374151' }}>
                    {formatDateFR(inv.dateInventaire)}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.6' }}>
                      {audit.created !== '-' && (
                        <div><span style={{ color: '#059669', fontWeight: 600 }}>Créé :</span> {audit.created}</div>
                      )}
                      {audit.updated !== '-' && audit.updated !== audit.created && (
                        <div><span style={{ color: '#f59e0b', fontWeight: 600 }}>Modifié :</span> {audit.updated}</div>
                      )}
                      {audit.created === '-' && audit.updated === '-' && (
                        <span style={{ color: '#d1d5db' }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {/* Imprimer */}
                      <button
                        title="Imprimer"
                        style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '5px', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center' }}
                      >
                        <Printer size={15} />
                      </button>

                      {/* Pas inventorié */}
                      <button
                        onClick={() => handleVoirManquants(inv)}
                        title="Voir les articles non inventoriés"
                        style={{ padding: '6px 12px', backgroundColor: '#f59e0b', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#fff', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <span>Pas Inventorier</span>
                        <span style={{ backgroundColor: '#dc2626', color: '#fff', borderRadius: '50%', width: '17px', height: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '900', flexShrink: 0 }}>✕</span>
                      </button>

                      {/* Modifier */}
                      <button
                        onClick={() => handleEditerInventaire(inv)}
                        title="Modifier l'inventaire"
                        style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '5px', cursor: 'pointer', color: '#f59e0b', display: 'flex', alignItems: 'center' }}
                      >
                        <Pencil size={15} />
                      </button>

                      {/* Supprimer */}
                      <button
                        onClick={() => handleSupprimerInventaire(inv)}
                        title="Supprimer l'inventaire"
                        style={{ padding: '6px 10px', backgroundColor: '#fff', border: '1px solid #fca5a5', borderRadius: '5px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}
                      >
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

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '14px' }}>
        {['<<', '<', '1', '>', '>>'].map((label, i) => (
          <button key={i} style={{ padding: '6px 11px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: label === '1' ? '#3b82f6' : '#fff', color: label === '1' ? '#fff' : '#374151', cursor: 'pointer', fontSize: '13px' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
