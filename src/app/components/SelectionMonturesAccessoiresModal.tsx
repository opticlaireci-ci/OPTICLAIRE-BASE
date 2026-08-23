import { logger } from '../utils/logger';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { chargerCatalogue } from '../services/catalogueService';

interface Monture {
  id: string;
  codeBarre: string;
  marque: string;
  reference: string;
  couleur: string;
  taille: string;
  prix: number;
  stock: number;
}

interface Accessoire {
  id: string;
  codeBarre: string;
  marque: string;
  designation: string;
  couleur: string;
  prix: number;
  stock: number;
}

interface SelectedItem {
  id: string;
  type: 'monture' | 'accessoire';
  designation: string;
  stockInitial: number;
  quantite: number;
  prixVente: number;
}

interface Props {
  onClose: () => void;
  onSelect: (items: SelectedItem[]) => void;
  selectedItems?: SelectedItem[];
}

export function SelectionMonturesAccessoiresModal({ onClose, onSelect, selectedItems = [] }: Props) {
  const [montures, setMontures] = useState<Monture[]>([]);
  const [accessoires, setAccessoires] = useState<Accessoire[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'montures' | 'accessoires'>('montures');
  const [selection, setSelection] = useState<SelectedItem[]>(selectedItems);

  useEffect(() => {
    // Lecture DIRECTE Firestore (catalogue global partagé) → identique sur tous
    // les navigateurs, comme le stock.
    let mounted = true;
    chargerCatalogue('catalogue_montures')
      .then(items => { if (mounted) setMontures(items as Monture[]); })
      .catch(err => logger.error('Erreur chargement montures:', err));
    chargerCatalogue('catalogue_accessoires')
      .then(items => { if (mounted) setAccessoires(items as Accessoire[]); })
      .catch(err => logger.error('Erreur chargement accessoires:', err));
    return () => { mounted = false; };
  }, []);

  const handleToggleItem = useCallback((e: React.MouseEvent, item: Monture | Accessoire, type: 'monture' | 'accessoire') => {
    // Arrêter la propagation pour éviter les conflits
    e.stopPropagation();

    const itemId = item.id;

    // Utiliser la fonction callback de setState pour éviter les problèmes de race condition
    setSelection(prevSelection => {
      const existing = prevSelection.find(s => s.id === itemId);

      if (existing) {
        // Retirer de la sélection
        return prevSelection.filter(s => s.id !== itemId);
      } else {
        // Ajouter à la sélection
        const designation = type === 'monture'
          ? `${(item as Monture).marque} - ${(item as Monture).reference} ${(item as Monture).couleur} ${(item as Monture).taille}`
          : `${(item as Accessoire).marque} - ${(item as Accessoire).designation}`;

        return [
          ...prevSelection,
          {
            id: itemId,
            type,
            designation,
            stockInitial: item.stock || 0,
            quantite: 1,
            prixVente: item.prix || 0,
          },
        ];
      }
    });
  }, []);

  const handleConfirm = () => {
    // Appeler onSelect d'abord
    onSelect(selection);

    // Fermer le modal avec un petit délai pour éviter les conflits React
    setTimeout(() => {
      onClose();
    }, 0);
  };

  const filteredMontures = montures.filter(m => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      m.marque?.toLowerCase().includes(q) ||
      m.reference?.toLowerCase().includes(q) ||
      m.codeBarre?.toLowerCase().includes(q) ||
      m.couleur?.toLowerCase().includes(q)
    );
  });

  const filteredAccessoires = accessoires.filter(a => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      a.marque?.toLowerCase().includes(q) ||
      a.designation?.toLowerCase().includes(q) ||
      a.codeBarre?.toLowerCase().includes(q)
    );
  });

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '1000px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
            Sélectionner Montures & Accessoires
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs + Search */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button
              onClick={() => setActiveTab('montures')}
              style={{
                padding: '10px 20px',
                backgroundColor: activeTab === 'montures' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'montures' ? '#fff' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              Montures ({montures.length})
            </button>
            <button
              onClick={() => setActiveTab('accessoires')}
              style={{
                padding: '10px 20px',
                backgroundColor: activeTab === 'accessoires' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'accessoires' ? '#fff' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              Accessoires ({accessoires.length})
            </button>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280' }}>
            {selection.length} article{selection.length !== 1 ? 's' : ''} sélectionné{selection.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          {activeTab === 'montures' && (
            <div style={{ display: 'grid', gap: '8px' }}>
              {filteredMontures.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  Aucune monture trouvée
                </div>
              ) : (
                filteredMontures.map(monture => {
                  const isSelected = selection.some(s => s.id === monture.id);
                  return (
                    <div
                      key={`monture-${monture.id}`}
                      onClick={(e) => handleToggleItem(e, monture, 'monture')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        border: `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#eff6ff' : '#fff',
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                          {monture.marque} - {monture.reference}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {monture.couleur} • {monture.taille} • Code: {monture.codeBarre}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>
                          {monture.prix?.toLocaleString('fr-FR')} F
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          Stock: {monture.stock || 0}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'accessoires' && (
            <div style={{ display: 'grid', gap: '8px' }}>
              {filteredAccessoires.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  Aucun accessoire trouvé
                </div>
              ) : (
                filteredAccessoires.map(accessoire => {
                  const isSelected = selection.some(s => s.id === accessoire.id);
                  return (
                    <div
                      key={`accessoire-${accessoire.id}`}
                      onClick={(e) => handleToggleItem(e, accessoire, 'accessoire')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        border: `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#eff6ff' : '#fff',
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                          {accessoire.marque} - {accessoire.designation}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {accessoire.couleur} • Code: {accessoire.codeBarre}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>
                          {accessoire.prix?.toLocaleString('fr-FR')} F
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          Stock: {accessoire.stock || 0}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            onClick={onClose}
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
            Annuler
          </button>
          <button
            onClick={handleConfirm}
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
            Confirmer ({selection.length})
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
