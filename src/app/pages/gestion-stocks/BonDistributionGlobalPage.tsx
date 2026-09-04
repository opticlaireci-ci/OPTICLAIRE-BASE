import { logger } from '../../utils/logger';
import { AddButton } from '../../components/AddButton';
import { useState } from 'react';
import { Search, Trash2, Edit2 } from 'lucide-react';
import { addCreateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { getMagasins } from '../../constants/magasins';
import { SelectionMonturesAccessoiresModal } from '../../components/SelectionMonturesAccessoiresModal';
import { enregistrerDistribution } from '../../services/inventaireService';
import { upsertBon, supprimerBon, distributionToRow } from '../../services/bonsService';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';
import { imprimerGestionStock, imprimerFormatGestionStock, imprimerBonDistribution } from '../../utils/stockActions';

interface BonDistribution extends AuditInfo {
  id: string;
  reference: string;
  magasinRecepteur: string;
  items: Array<{
    id: string;
    type: 'monture' | 'accessoire';
    designation: string;
    stockInitial: number;
    quantite: number;
    prixVente: number;
  }>;
  statut: string;
  dateCreation: string;
}

const MAGASINS = getMagasins().map(magasin => magasin.label);

const getStatutColor = (statut: string) => {
  switch (statut) {
    case 'Validé': return '#10b981';
    case 'Livré': return '#3b82f6';
    case 'En attente': return '#f59e0b';
    default: return '#9ca3af';
  }
};

export function BonDistributionGlobalPage() {
  const [bons, setBons] = useLiveData<BonDistribution>('leclaire_db_bon-distribution');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Form state
  const [reference, setReference] = useState('00001');
  const [magasinRecepteur, setMagasinRecepteur] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [searchProduit, setSearchProduit] = useState('');
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  const handleSave = () => {
    if (!magasinRecepteur) {
      alert('Veuillez sélectionner un magasin récepteur');
      return;
    }

    if (items.length === 0) {
      alert('Veuillez ajouter au moins un produit');
      return;
    }

    // Trouver l'ID du magasin à partir du label
    const magasins = getMagasins();
    const magasin = magasins.find(m => m.label === magasinRecepteur);

    if (!magasin) {
      alert('Magasin non trouvé');
      return;
    }

    // Créer le bon avec le format attendu par la page magasin
    const newBon: any = {
      id: editingId || Date.now().toString(),
      reference,
      numero: reference,
      dateCreation: new Date().toISOString(),
      date: new Date().toISOString(),
      magasinRecepteur,
      magasinDest: magasin.id,
      responsable: localStorage.getItem('leclaire_current_user') || 'Administrateur',
      items: items.map(item => ({
        id: item.id, // id catalogue : clé stable du stock (évite les décalages de désignation)
        designation: item.designation,
        quantite: item.quantite,
        prixUnit: item.prixVente,
      })),
      statut: editingId ? (bons.find(b => b.id === editingId)?.statut || 'En attente') : 'En attente',
    };

    const bonWithAudit = addCreateAudit(newBon);
    const updatedBons = editingId ? bons.map(b => b.id === editingId ? { ...b, ...bonWithAudit, id: editingId } : b) : [...bons, bonWithAudit];
    setBons(updatedBons);
    upsertBon(distributionToRow(bonWithAudit)).catch(e => logger.error('❌ upsertBon distribution:', e));

    // NE PAS enregistrer la distribution maintenant
    // Le stock sera mis à jour SEULEMENT quand le magasin ACCEPTE le bon
    logger.log(`✅ Bon de distribution créé pour le magasin ${magasinRecepteur}`);
    alert(`Bon de distribution créé avec succès !\n${items.length} produit(s) pour ${magasinRecepteur}\n\nLe magasin doit ACCEPTER le bon pour mettre à jour son stock.`);

    handleClose();
  };

  const handleEdit = (bon: BonDistribution) => {
    setEditingId(bon.id);
    setReference(bon.reference || '00001');
    setMagasinRecepteur(bon.magasinRecepteur || '');
    setItems((bon.items || []).map(i => ({ ...i, prixVente: i.prixVente || 0 })));
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingId(null);
    setReference('00001');
    setMagasinRecepteur('');
    setItems([]);
    setSearchProduit('');
  };

  const handleDelete = (id: string) => {
    const updatedBons = bons.filter(b => b.id !== id);
    setBons(updatedBons);
    supprimerBon(id).catch(e => logger.error('❌ supprimerBon distribution:', e));
  };

  const handleSelectItems = (selectedItems: any[]) => {
    setItems(selectedItems);
  };

  const handleUpdateQuantite = (itemId: string, quantite: number) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, quantite: Math.max(0, quantite) } : item
    ));
  };

  const handleUpdatePrix = (itemId: string, prixVente: number) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, prixVente: Math.max(0, prixVente) } : item
    ));
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const filteredBons = bons.filter(bon => {
    const matchSearch = searchTerm === '' ||
      bon.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatut = filterStatut === '' || bon.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const sortedBons = [...filteredBons].sort((a, b) => (a.reference || '').localeCompare(b.reference || '', 'fr'));

  if (showModal) {
    return (
      <>
        {showSelectionModal && (
          <SelectionMonturesAccessoiresModal
            onClose={() => setShowSelectionModal(false)}
            onSelect={handleSelectItems}
            selectedItems={items}
          />
        )}
        <div style={{ padding: 'clamp(12px, 3vw, 24px)', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <h1 style={{ fontSize: 'clamp(16px, 4vw, 20px)', fontWeight: 'bold', margin: 0 }}>Nouveau Bon de Distribution</h1>
          <button
            onClick={() => setShowModal(false)}
            style={{
              padding: '10px 24px',
              backgroundColor: '#0369a1',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Bons de Distribution
          </button>
        </div>

        {/* Form */}
        <div style={{ backgroundColor: '#fff', padding: 'clamp(12px, 3vw, 24px)', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Magasin Récepteur <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={magasinRecepteur}
                onChange={(e) => setMagasinRecepteur(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="">-- Choisir Magasin --</option>
                {MAGASINS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Référence Bon de Distribution <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <AddButton
              onClick={() => setShowSelectionModal(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                flexShrink: 0,
              }}
            >
              Ajouter Monture &amp; Accessoire
            </AddButton>
            <button
              style={{
                padding: '10px 20px',
                backgroundColor: '#06b6d4',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                flexShrink: 0,
              }}
            >
              Fiche Distribution
            </button>
          </div>

          {/* Recherche */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Recherche
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                value={searchProduit}
                onChange={(e) => setSearchProduit(e.target.value)}
                style={{
                  flex: '1 1 180px',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              <button
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Synchroniser Stock &amp; Quantité
              </button>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                  #
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                  Monture / Accessoire
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                  Stock Initial
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                  Quantité
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                  Prix de Vente
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', border: '1px solid #e5e7eb' }}>
                    Aucun article ajouté
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px', border: '1px solid #e5e7eb' }}>
                      {index + 1}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontWeight: '600' }}>{item.designation}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        {item.type === 'monture' ? '🔲 Monture' : '🔷 Accessoire'}
                      </div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      {item.stockInitial}
                    </td>
                    <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>
                      <input
                        type="number"
                        min="0"
                        value={item.quantite}
                        onChange={(e) => handleUpdateQuantite(item.id, parseInt(e.target.value) || 0)}
                        style={{
                          width: '100px',
                          padding: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>
                      <input
                        type="number"
                        min="0"
                        value={item.prixVente}
                        onChange={(e) => handleUpdatePrix(item.id, parseFloat(e.target.value) || 0)}
                        style={{
                          width: '120px',
                          padding: '8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button
              onClick={handleClose}
              style={{
                padding: '10px 24px',
                backgroundColor: '#fff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              Fermer
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '10px 24px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="admin-stock-list-page" style={{ padding: 'clamp(12px, 3vw, 24px)', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>Gestion Stocks: {TENANT.nom}</p>
        </div>
        <AddButton
          onClick={() => setShowModal(true)}
          style={{
            padding: '10px 24px',
            backgroundColor: '#0369a1',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Ajouter Bon de Distribution
        </AddButton>
      </div>

      <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Distribution ({bons.length})
      </h1>

      {/* Search filters */}
      <div className="admin-stock-search-filters" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Distribution)
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <input
            type="text"
            placeholder="Recherche..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: '1 1 180px',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <input
            type="text"
            placeholder="jj/mm/aaaa"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            style={{
              flex: '0 1 150px',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            style={{
              flex: '0 1 160px',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">-- Choisir Statut --</option>
            <option value="En attente">En attente</option>
            <option value="Validé">Validé</option>
            <option value="Livré">Livré</option>
          </select>
          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block admin-stock-table-wrap" style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px', width: '40px' }}>
                <input type="checkbox" />
              </th>
              <th style={{ padding: '12px', width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>#</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                N° Bon de Distribution
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Magasin
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Récepteur
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Statut
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Enregistré par
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Édition
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredBons.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun bon de distribution trouvé
                </td>
              </tr>
            ) : (
              sortedBons.map((bon, idx) => (
                <tr key={bon.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px' }}>
                    <input type="checkbox" />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{idx + 1}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.reference}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.magasinRecepteur || '-'}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{(bon as any).recepteur || (bon as any).receiver || (bon as any).responsable || '-'}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.statut}</td>
                  <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
                    {bon.createdBy ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#374151' }}>{bon.createdBy}</div>
                        <div style={{ color: '#9ca3af' }}>{formatDate(bon.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="stock-edition-actions" style={{ padding: '8px', fontSize: '14px' }}>
                    <button onClick={() => imprimerBonDistribution(bon)} title="Imprimer le bon et les montures/accessoires distribués">🖨️</button>
                    <button onClick={() => imprimerBonDistribution(bon, 'B5')} title="Imprimer le bon au format B5">B5</button>
                    <button onClick={() => imprimerBonDistribution(bon, 'A5')} title="Imprimer le bon au format A5">A5</button>
                    <button onClick={() => handleEdit(bon)} title="Éditer">✏️</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredBons.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            Aucun bon de distribution trouvé
          </div>
        ) : (
          sortedBons.map((bon) => (
            <div key={bon.id} style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ backgroundColor: '#0e7490', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>N° {bon.reference}</div>
                  {bon.magasinRecepteur && (
                    <div style={{ color: '#a5f3fc', fontSize: '13px', marginTop: '2px' }}>
                      {bon.magasinRecepteur}
                    </div>
                  )}
                </div>
                <span style={{
                  backgroundColor: getStatutColor(bon.statut),
                  color: '#fff',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {bon.statut || 'En attente'}
                </span>
              </div>
              {/* Card body */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Articles</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                      {bon.items?.length || 0} article{(bon.items?.length || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {bon.magasinRecepteur && (
                    <div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destination</div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>{bon.magasinRecepteur}</div>
                    </div>
                  )}
                </div>
                {/* Preview first 3 items */}
                {bon.items && bon.items.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {bon.items.slice(0, 3).map((item, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#6b7280', padding: '2px 0', borderBottom: i < Math.min(bon.items.length, 3) - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        {item.designation} · qté {item.quantite}
                      </div>
                    ))}
                    {bon.items.length > 3 && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                        + {bon.items.length - 3} autre{bon.items.length - 3 > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}
                {bon.createdBy && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af' }}>
                    Par {bon.createdBy} · {formatDate(bon.createdAt)}
                  </div>
                )}
              </div>
              {/* Card footer */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleDelete(bon.id)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Trash2 size={13} /> Supprimer
                </button>
                <button
                  onClick={() => handleEdit(bon)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Éditer
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="admin-stock-pagination" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <button
          onClick={() => setCurrentPage(1)}
          style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
        >
          {'<<'}
        </button>
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
        >
          {'<'}
        </button>
        <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer' }}>
          1
        </button>
        <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
          2
        </button>
        <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
          3
        </button>
        <button
          onClick={() => setCurrentPage(currentPage + 1)}
          style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
        >
          {'>'}
        </button>
        <button
          style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}
        >
          {'>>'}
        </button>
      </div>
    </div>
  );
}
