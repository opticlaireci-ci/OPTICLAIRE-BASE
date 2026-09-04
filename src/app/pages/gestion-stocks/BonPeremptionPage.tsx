import { logger } from '../../utils/logger';
import { AddButton } from '../../components/AddButton';
import { useState } from 'react';
import { Search, Trash2, Edit2 } from 'lucide-react';
import { addCreateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { SelectionMonturesAccessoiresModal } from '../../components/SelectionMonturesAccessoiresModal';
import { upsertBon, supprimerBon, peremptionToRow } from '../../services/bonsService';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';
import { imprimerGestionStock, imprimerFormatGestionStock } from '../../utils/stockActions';

interface BonPeremption extends AuditInfo {
  id: string;
  reference: string;
  motif: string;
  items: Array<{
    id: string;
    type: 'monture' | 'accessoire';
    designation: string;
    stockInitial: number;
    quantite: number;
  }>;
  dateCreation: string;
  commentaire?: string;
}

export function BonPeremptionPage() {
  const [bons, setBons] = useLiveData<BonPeremption>('leclaire_bons_peremption');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');

  // Form state
  const [reference, setReference] = useState('00001');
  const [motif, setMotif] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [searchProduit, setSearchProduit] = useState('');
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  const handleSave = () => {
    const newBon: BonPeremption = {
      id: editingId || Date.now().toString(),
      reference,
      motif,
      items,
      dateCreation: new Date().toISOString(),
      commentaire: '',
    };

    const bonWithAudit = addCreateAudit(newBon);
    const updatedBons = editingId ? bons.map(b => b.id === editingId ? { ...b, ...bonWithAudit, id: editingId } : b) : [...bons, bonWithAudit];
    setBons(updatedBons);
    upsertBon(peremptionToRow(bonWithAudit)).catch(e => logger.error('❌ upsertBon péremption:', e));

    handleClose();
  };

  const handleEdit = (bon: BonPeremption) => { setEditingId(bon.id); setReference(bon.reference || '00001'); setMotif(bon.motif || ''); setItems(bon.items || []); setShowModal(true); };

  const handleClose = () => {
    setShowModal(false);
    setEditingId(null);
    setReference('00001');
    setMotif('');
    setItems([]);
    setSearchProduit('');
  };

  const handleDelete = (id: string) => {
    const updatedBons = bons.filter(b => b.id !== id);
    setBons(updatedBons);
    supprimerBon(id).catch(e => logger.error('❌ supprimerBon péremption:', e));
  };

  const handleSelectItems = (selectedItems: any[]) => {
    setItems(selectedItems);
  };

  const handleUpdateQuantite = (itemId: string, quantite: number) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, quantite: Math.max(0, quantite) } : item
    ));
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const filteredBons = bons.filter(bon => {
    const matchSearch = searchTerm === '' ||
      bon.reference.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

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
        <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Nouveau Bon de Péremption-Casse</h1>
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
            Bons de Péremption-Casse
          </button>
        </div>

        {/* Form */}
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Référence Bon de Péremption-Casse <span style={{ color: '#dc2626' }}>*</span>
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
                whiteSpace: 'nowrap',
              }}
            >
              Ajouter Monture & Accessoire
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
                whiteSpace: 'nowrap',
              }}
            >
              Fiche Bon de Péremption-Casse
            </button>
          </div>

          {/* Motif */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Motif
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                minHeight: '80px',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Recherche */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Recherche
            </label>
            <input
              type="text"
              value={searchProduit}
              onChange={(e) => setSearchProduit(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Table articles — desktop */}
          <div className="hidden md:block">
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>#</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>Monture / Accessoire</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>Stock Initial</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>Quantité</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', border: '1px solid #e5e7eb' }}>
                      Aucun article ajouté
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px', border: '1px solid #e5e7eb' }}>{index + 1}</td>
                      <td style={{ padding: '12px', fontSize: '14px', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontWeight: '600' }}>{item.designation}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                          {item.type === 'monture' ? '🔲 Monture' : '🔷 Accessoire'}
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', textAlign: 'center', border: '1px solid #e5e7eb' }}>{item.stockInitial}</td>
                      <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>
                        <input type="number" min="0" value={item.quantite} onChange={(e) => handleUpdateQuantite(item.id, parseInt(e.target.value) || 0)} style={{ width: '100px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }} />
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                        <button onClick={() => handleRemoveItem(item.id)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Cartes articles — mobile */}
          <div className="stock-mobile-legacy-hidden" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {items.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                Aucun article ajouté
              </div>
            ) : items.map((item) => (
              <div key={item.id} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'clamp(12px, 3vw, 14px)', fontWeight: 700, color: '#111827' }}>{item.designation}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                      {item.type === 'monture' ? '🔲 Monture' : '🔷 Accessoire'} · Stock initial : {item.stockInitial}
                    </div>
                  </div>
                  <button onClick={() => handleRemoveItem(item.id)} style={{ padding: '6px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>Quantité :</label>
                  <input type="number" min="0" value={item.quantite} onChange={(e) => handleUpdateQuantite(item.id, parseInt(e.target.value) || 0)} style={{ width: '80px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
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
    <div className="admin-stock-list-page" style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
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
          Ajouter Bon de Péremption-Casse
        </AddButton>
      </div>

      <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Péremption-Casse ({bons.length})
      </h1>

      {/* Search filters - First row */}
      <div className="admin-stock-search-filters" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Péremption-Casse)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: '12px', alignItems: 'end' }}>
          <input
            type="text"
            placeholder="Recherche..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
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
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      {/* Search filters - Second row */}
      <div className="admin-stock-search-filters admin-stock-search-filters-secondary" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Péremption-Casse)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: '12px', alignItems: 'end' }}>
          <input
            type="text"
            placeholder="Recherche..."
            style={{
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <input
            type="text"
            placeholder="jj/mm/aaaa"
            style={{
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      {/* Table — desktop */}
      <div className="admin-stock-table-wrap" style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px', width: '40px' }}>
                <input type="checkbox" />
              </th>
              <th style={{ padding: '12px', width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>#</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                N° Bon de Péremption-Casse
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Commentaire
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
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun bon de péremption-casse trouvé
                </td>
              </tr>
            ) : (
              [...filteredBons].sort((a, b) => (a.reference || '').localeCompare(b.reference || '', 'fr')).map((bon, idx) => (
                <tr key={bon.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px' }}>
                    <input type="checkbox" />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{idx + 1}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.reference}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.commentaire || '-'}</td>
                  <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
                    {bon.createdBy ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#374151' }}>{bon.createdBy}</div>
                        <div style={{ color: '#9ca3af' }}>{formatDate(bon.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <button onClick={() => imprimerGestionStock(`Bon de péremption-casse ${bon.reference}`)} style={{ padding: '4px 10px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🖨️</button>
                  <button onClick={() => handleEdit(bon)} style={{ padding: '4px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      Éditer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Cartes bons péremption — mobile */}
      <div className="stock-mobile-legacy-hidden" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredBons.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            Aucun bon de péremption-casse trouvé
          </div>
        ) : (
          [...filteredBons].sort((a, b) => (a.reference || '').localeCompare(b.reference || '', 'fr')).map((bon) => (
            <div key={bon.id} style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: 'clamp(13px, 3.5vw, 15px)', fontWeight: 700, color: '#111827' }}>
                    N° {bon.reference}
                  </div>
                  {bon.commentaire && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{bon.commentaire}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Éditer
                  </button>
                  <button
                    onClick={() => handleDelete(bon.id)}
                    style={{ padding: '6px', backgroundColor: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <Trash2 size={14} color="#fff" />
                  </button>
                </div>
              </div>
              {bon.createdBy && (
                <div style={{ fontSize: '11px', color: '#6b7280', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{bon.createdBy}</span>
                  {bon.createdAt && <span style={{ marginLeft: '6px' }}>{formatDate(bon.createdAt)}</span>}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="admin-stock-pagination" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
          {'<<'}
        </button>
        <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
          {'<'}
        </button>
        <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
          {'>'}
        </button>
        <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer' }}>
          {'>>'}
        </button>
      </div>
    </div>
  );
}
