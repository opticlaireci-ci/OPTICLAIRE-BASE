import { logger } from '../../utils/logger';
import { AddButton } from '../../components/AddButton';
import { useState } from 'react';
import { Search, Trash2, Edit2 } from 'lucide-react';
import { addCreateAudit, formatDate, AuditInfo } from '../../utils/auditUtils';
import { SelectionMonturesAccessoiresModal } from '../../components/SelectionMonturesAccessoiresModal';
import { upsertBon, supprimerBon, commandeToRow } from '../../services/bonsService';
import { useLiveData } from '../../hooks/useLiveData';
import { TENANT } from '../../config/tenant';

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

export function BonCommandePage() {
  const [bons, setBons] = useLiveData<BonCommande>('leclaire_bons_commande');
  const [showModal, setShowModal] = useState(false);
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
      id: Date.now().toString(),
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
    const updatedBons = [...bons, bonWithAudit];
    setBons(updatedBons);
    upsertBon(commandeToRow(bonWithAudit)).catch(e => logger.error('❌ upsertBon commande:', e));

    handleClose();
  };

  const handleClose = () => {
    setShowModal(false);
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
        <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Nouveau Bon de Commande</h1>
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
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
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
                }}
              />
            </div>
          </div>

          {/* Votre sélection */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
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
                Ajouter Monture & Accessoire
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
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
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
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
          Ajouter Bon de Commande
        </AddButton>
      </div>

      <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Commande ({bons.length})
      </h1>

      {/* Search filters */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Commande, Fournisseur)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px auto', gap: '12px', alignItems: 'end' }}>
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
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            style={{
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px auto', gap: '12px', alignItems: 'end' }}>
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
          <select
            style={{
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
                <td colSpan={14} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
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
