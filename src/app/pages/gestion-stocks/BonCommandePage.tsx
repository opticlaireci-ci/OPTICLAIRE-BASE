import { logger } from '../../utils/logger';
import { AddButton } from '../../components/AddButton';
import { useState } from 'react';
import { Search, Trash2, Edit2 } from 'lucide-react';
import { addCreateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { SelectionMonturesAccessoiresModal } from '../../components/SelectionMonturesAccessoiresModal';
import { upsertBon, supprimerBon, commandeToRow } from '../../services/bonsService';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';
import { imprimerGestionStock, imprimerFormatGestionStock } from '../../utils/stockActions';

interface BonCommande extends AuditInfo {
  id: string;
  reference: string;
  fournisseur: string;
  numeroBonFournisseur?: string;
  items: Array<{
    id: string;
    type: 'monture' | 'accessoire';
    designation: string;
    stock: number;
    quantite: number;
    prixAchat: number;
    total: number;
  }>;
  devise: string;
  valeurDevise: number;
  remisePourcent: number;
  valeurRemise: number;
  total: number;
  taxe: string;
  totalNet: number;
  totalPaiement: number;
  totalReste: number;
  statut: string;
  envoyerFournisseur: boolean;
  dateCreation: string;
}

const getStatutColor = (statut: string) => {
  switch (statut) {
    case 'Validé': return '#10b981';
    case 'Livré': return '#3b82f6';
    case 'En attente': return '#f59e0b';
    default: return '#9ca3af';
  }
};

export function BonCommandePage() {
  const [bons, setBons] = useLiveData<BonCommande>('leclaire_bons_commande');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  // Form state
  const [reference, setReference] = useState('00001');
  const [fournisseur, setFournisseur] = useState('');
  const [numeroBonFournisseur, setNumeroBonFournisseur] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [devise, setDevise] = useState('F CFA');
  const [valeurDevise, setValeurDevise] = useState(1);
  const [remisePourcent, setRemisePourcent] = useState(0);
  const [valeurRemise, setValeurRemise] = useState(0);
  const [total, setTotal] = useState(0);
  const [taxe, setTaxe] = useState('');
  const [totalNet, setTotalNet] = useState(0);
  const [envoyerFournisseur, setEnvoyerFournisseur] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  const handleSave = () => {
    const newBon: BonCommande = {
      id: editingId || Date.now().toString(),
      reference,
      fournisseur,
      numeroBonFournisseur,
      items,
      devise,
      valeurDevise,
      remisePourcent,
      valeurRemise,
      total,
      taxe,
      totalNet,
      totalPaiement: 0,
      totalReste: totalNet,
      statut: 'En attente',
      envoyerFournisseur,
      dateCreation: new Date().toISOString(),
    };

    const bonWithAudit = addCreateAudit(newBon);
    const updatedBons = editingId ? bons.map(b => b.id === editingId ? { ...b, ...bonWithAudit, id: editingId } : b) : [...bons, bonWithAudit];
    setBons(updatedBons);
    upsertBon(commandeToRow(bonWithAudit)).catch(e => logger.error('❌ upsertBon commande:', e));

    handleClose();
  };

  const handleEdit = (bon: BonCommande) => {
    setEditingId(bon.id); setReference(bon.reference || '00001'); setFournisseur(bon.fournisseur || ''); setNumeroBonFournisseur(bon.numeroBonFournisseur || ''); setItems(bon.items || []); setDevise(bon.devise || 'F CFA'); setValeurDevise(bon.valeurDevise || 1); setRemisePourcent(bon.remisePourcent || 0); setValeurRemise(bon.valeurRemise || 0); setTotal(bon.total || 0); setTaxe(bon.taxe || ''); setTotalNet(bon.totalNet || 0); setEnvoyerFournisseur(!!bon.envoyerFournisseur); setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setEditingId(null);
    setReference('00001');
    setFournisseur('');
    setNumeroBonFournisseur('');
    setItems([]);
    setDevise('F CFA');
    setValeurDevise(1);
    setRemisePourcent(0);
    setValeurRemise(0);
    setTotal(0);
    setTaxe('');
    setTotalNet(0);
    setEnvoyerFournisseur(false);
  };

  const handleDelete = (id: string) => {
    const updatedBons = bons.filter(b => b.id !== id);
    setBons(updatedBons);
    supprimerBon(id).catch(e => logger.error('❌ supprimerBon commande:', e));
  };

  const handleSelectItems = (selectedItems: any[]) => {
    // Adapter les items sélectionnés pour le bon de commande
    const adaptedItems = selectedItems.map(item => ({
      ...item,
      stock: item.stockInitial,
      prixAchat: item.prixVente || 0,
      total: (item.prixVente || 0) * item.quantite,
    }));
    setItems(adaptedItems);
    recalculateTotal(adaptedItems);
  };

  const handleUpdateQuantite = (itemId: string, quantite: number) => {
    const updatedItems = items.map(item =>
      item.id === itemId ? { ...item, quantite: Math.max(0, quantite), total: item.prixAchat * Math.max(0, quantite) } : item
    );
    setItems(updatedItems);
    recalculateTotal(updatedItems);
  };

  const handleUpdatePrix = (itemId: string, prixAchat: number) => {
    const updatedItems = items.map(item =>
      item.id === itemId ? { ...item, prixAchat: Math.max(0, prixAchat), total: Math.max(0, prixAchat) * item.quantite } : item
    );
    setItems(updatedItems);
    recalculateTotal(updatedItems);
  };

  const handleRemoveItem = (itemId: string) => {
    const updatedItems = items.filter(item => item.id !== itemId);
    setItems(updatedItems);
    recalculateTotal(updatedItems);
  };

  const recalculateTotal = (currentItems: any[]) => {
    const subtotal = currentItems.reduce((sum, item) => sum + (item.total || 0), 0);
    setTotal(subtotal);
    const netTotal = subtotal - valeurRemise;
    setTotalNet(netTotal);
  };

  const filteredBons = bons.filter(bon => {
    const matchSearch = searchTerm === '' ||
      bon.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bon.fournisseur.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatut = filterStatut === '' || bon.statut === filterStatut;
    return matchSearch && matchStatut;
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
        <div style={{ padding: 'clamp(12px, 3vw, 24px)', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <h1 style={{ fontSize: 'clamp(16px, 4vw, 20px)', fontWeight: 'bold', margin: 0 }}>Nouveau Bon de Commande</h1>
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
            Bons de Commande
          </button>
        </div>

        {/* Form */}
        <div style={{ backgroundColor: '#fff', padding: 'clamp(12px, 3vw, 24px)', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Référence <span style={{ color: '#dc2626' }}>*</span>
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
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Fournisseur <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={fournisseur}
                onChange={(e) => setFournisseur(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="">Fournisseur...</option>
                <option value="Fournisseur 1">Fournisseur 1</option>
                <option value="Fournisseur 2">Fournisseur 2</option>
                <option value="Fournisseur 3">Fournisseur 3</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                N° Bon de Commande Fournisseur
              </label>
              <input
                type="text"
                value={numeroBonFournisseur}
                onChange={(e) => setNumeroBonFournisseur(e.target.value)}
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
          </div>

          {/* Votre sélection */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{
                padding: '8px 16px',
                backgroundColor: '#9ca3af',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '600',
                borderRadius: '4px',
              }}>
                Votre sélection
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
                }}
              >
                Ajouter Monture &amp; Accessoire
              </AddButton>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                    Monture / Accessoire
                  </th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                    Stock
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                    Quantité
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                    Prix d'Achat
                  </th>
                  <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                    Total
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
                      <td style={{ padding: '12px', fontSize: '14px', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontWeight: '600' }}>{item.designation}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                          {item.type === 'monture' ? '🔲 Monture' : '🔷 Accessoire'}
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                        {item.stock}
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
                          value={item.prixAchat}
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
                      <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right', fontWeight: '600', border: '1px solid #e5e7eb' }}>
                        {(item.total || 0).toLocaleString('fr-FR')} F
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

            <button
              style={{
                padding: '8px 16px',
                backgroundColor: '#fff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              + Ajouter
            </button>
          </div>

          {/* Bottom form */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Devise <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={devise}
                onChange={(e) => setDevise(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="F CFA">F CFA</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Valeur Devise <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="number"
                value={valeurDevise}
                onChange={(e) => setValeurDevise(parseFloat(e.target.value) || 0)}
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
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Remise %
              </label>
              <input
                type="number"
                value={remisePourcent}
                onChange={(e) => setRemisePourcent(parseFloat(e.target.value) || 0)}
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
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Valeur Remise
              </label>
              <input
                type="number"
                value={valeurRemise}
                onChange={(e) => setValeurRemise(parseFloat(e.target.value) || 0)}
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Total
              </label>
              <input
                type="number"
                value={total}
                onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
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
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                Taxe <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={taxe}
                onChange={(e) => setTaxe(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="">Taxe %</option>
                <option value="0">0%</option>
                <option value="18">18%</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Total Net
            </label>
            <input
              type="number"
              value={totalNet}
              onChange={(e) => setTotalNet(parseFloat(e.target.value) || 0)}
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

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={envoyerFournisseur}
                onChange={(e) => setEnvoyerFournisseur(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>Envoyer au fournisseur</span>
            </label>
          </div>

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
          Ajouter Bon de Commande
        </AddButton>
      </div>

      <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Commande ({bons.length})
      </h1>

      {/* Search filters */}
      <div className="admin-stock-search-filters" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Commande, Fournisseur)
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
              flex: '0 1 160px',
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
            <option value="">Choisir Statut...</option>
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

      {/* Second search row */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Commande, Fournisseur)
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <input
            type="text"
            placeholder="Recherche..."
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
            style={{
              flex: '0 1 160px',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <select
            style={{
              flex: '0 1 160px',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">Choisir Statut...</option>
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
      <div className="admin-stock-table-wrap" style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px', width: '40px' }}>
                <input type="checkbox" />
              </th>
              <th style={{ padding: '12px', width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>#</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                N° Bon de Commande
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Fournisseur
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Remise
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Total
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Taxe
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Total Net
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Total Paiement
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Total Reste
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
                <td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun bon de commande trouvé
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
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.fournisseur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.valeurRemise}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.total}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.taxe}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.totalNet}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.totalPaiement}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.totalReste}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.statut}</td>
                  <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
                    {bon.createdBy ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#374151' }}>{bon.createdBy}</div>
                        <div style={{ color: '#9ca3af' }}>{formatDate(bon.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <button onClick={() => imprimerGestionStock()} title="Imprimer">🖨️</button><button onClick={() => imprimerFormatGestionStock("Document", "B5")} title="B5">B5</button><button onClick={() => imprimerFormatGestionStock("Document", "A5")} title="A5">A5</button><button onClick={() => handleEdit(bon)} title="Éditer">✏️</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="stock-mobile-legacy-hidden" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredBons.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            Aucun bon de commande trouvé
          </div>
        ) : (
          [...filteredBons].sort((a, b) => (a.reference || '').localeCompare(b.reference || '', 'fr')).map((bon) => (
            <div key={bon.id} style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ backgroundColor: '#0369a1', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>N° {bon.reference}</div>
                  <div style={{ color: '#bae6fd', fontSize: '13px', marginTop: '2px' }}>{bon.fournisseur}</div>
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
                  {bon.statut}
                </span>
              </div>
              {/* Card body */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{(bon.total || 0).toLocaleString('fr-FR')} F</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Net</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{(bon.totalNet || 0).toLocaleString('fr-FR')} F</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reste</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: bon.totalReste > 0 ? '#ef4444' : '#10b981' }}>{(bon.totalReste || 0).toLocaleString('fr-FR')} F</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#6b7280', flexWrap: 'wrap' }}>
                  {bon.taxe && <span>Taxe: {bon.taxe}%</span>}
                  {bon.valeurRemise > 0 && <span>Remise: {bon.valeurRemise.toLocaleString('fr-FR')} F</span>}
                  {bon.totalPaiement > 0 && <span>Payé: {bon.totalPaiement.toLocaleString('fr-FR')} F</span>}
                </div>
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
