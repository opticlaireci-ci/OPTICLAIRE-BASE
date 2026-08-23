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

export function BonDistributionGlobalPage() {
  const [bons, setBons] = useLiveData<BonDistribution>('leclaire_db_bon-distribution');
  const [showModal, setShowModal] = useState(false);
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
      id: Date.now().toString(),
      numero: reference,
      date: new Date().toISOString(),
      magasinDest: magasin.id, // ID du magasin, pas le label
      responsable: localStorage.getItem('leclaire_current_user') || 'Administrateur',
      items: items.map(item => ({
        id: item.id, // id catalogue : clé stable du stock (évite les décalages de désignation)
        designation: item.designation,
        quantite: item.quantite,
        prixUnit: item.prixVente,
      })),
      statut: 'En attente',
    };

    const bonWithAudit = addCreateAudit(newBon);
    const updatedBons = [...bons, bonWithAudit];
    setBons(updatedBons);
    upsertBon(distributionToRow(bonWithAudit)).catch(e => logger.error('❌ upsertBon distribution:', e));

    // NE PAS enregistrer la distribution maintenant
    // Le stock sera mis à jour SEULEMENT quand le magasin ACCEPTE le bon
    logger.log(`✅ Bon de distribution créé pour le magasin ${magasinRecepteur}`);
    alert(`Bon de distribution créé avec succès !\n${items.length} produit(s) pour ${magasinRecepteur}\n\nLe magasin doit ACCEPTER le bon pour mettre à jour son stock.`);

    handleClose();
  };

  const handleClose = () => {
    setShowModal(false);
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
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Nouveau Bon de Distribution</h1>
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
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
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
            <div style={{ flex: 1 }}>
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
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                value={searchProduit}
                onChange={(e) => setSearchProduit(e.target.value)}
                style={{
                  flex: 1,
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
                }}
              >
                Synchroniser Stock & Quantité
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
          Ajouter Bon de Distribution
        </AddButton>
      </div>

      <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Distribution ({bons.length})
      </h1>

      {/* Search filters */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Distribution)
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
                <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun bon de distribution trouvé
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
                  <td style={{ padding: '12px', fontSize: '14px' }}>-</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.magasinRecepteur}</td>
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
