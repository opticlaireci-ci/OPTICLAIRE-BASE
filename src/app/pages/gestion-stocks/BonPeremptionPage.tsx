import { logger } from '../../utils/logger';
import { AddButton } from '../../components/AddButton';
import { useState } from 'react';
import { Search, Trash2, Edit2 } from 'lucide-react';
import { addCreateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { SelectionMonturesAccessoiresModal } from '../../components/SelectionMonturesAccessoiresModal';
import { upsertBon, supprimerBon, peremptionToRow } from '../../services/bonsService';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';

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
      id: Date.now().toString(),
      reference,
      motif,
      items,
      dateCreation: new Date().toISOString(),
      commentaire: '',
    };

    const bonWithAudit = addCreateAudit(newBon);
    const updatedBons = [...bons, bonWithAudit];
    setBons(updatedBons);
    upsertBon(peremptionToRow(bonWithAudit)).catch(e => logger.error('❌ upsertBon péremption:', e));

    handleClose();
  };

  const handleClose = () => {
    setShowModal(false);
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
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                  Actions
                </th>
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
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
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
      <div style={{ marginBottom: '20px' }}>
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
      <div style={{ marginBottom: '20px' }}>
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

      {/* Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px', width: '40px' }}>
                <input type="checkbox" />
              </th>
              <th style={{ padding: '12px', width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>#</th>
              <th style={{ padding: '12px', width: '60px' }}></th>
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
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
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
                  <td style={{ padding: '12px' }}>
                    <button
                      onClick={() => handleDelete(bon.id)}
                      style={{
                        padding: '8px',
                        backgroundColor: '#dc2626',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={16} color="#fff" />
                    </button>
                  </td>
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
                    <button
                      style={{
                        padding: '4px 12px',
                        backgroundColor: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Éditer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
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
