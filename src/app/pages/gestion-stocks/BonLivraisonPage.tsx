import { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useLiveData } from '../../hooks/useLiveData';

interface BonLivraison {
  id: string;
  fournisseur: string;
  numeroBonCommande: string;
  numeroBonLivraison: string;
  dateLivraison: string;
}

export function BonLivraisonPage() {
  const [bons, setBons] = useLiveData<BonLivraison>('leclaire_bons_livraison');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');

  const handleDelete = (id: string) => {
    const updatedBons = bons.filter(b => b.id !== id);
    setBons(updatedBons);
  };

  const filteredBons = bons.filter(bon => {
    const matchSearch = searchTerm === '' ||
      bon.fournisseur.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bon.numeroBonLivraison.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bon.numeroBonCommande.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Livraison ({bons.length})
      </h1>

      {/* Search filters */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (Fournisseur, N° Bon de Livraison, N°Bon de Commande)
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
                Fournisseur
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                N° Bon de Commande
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                N° Bon de Livraison
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
                  Aucun bon de livraison trouvé
                </td>
              </tr>
            ) : (
              [...filteredBons].sort((a, b) => (a.fournisseur || '').localeCompare(b.fournisseur || '', 'fr')).map((bon, idx) => (
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
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.fournisseur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.numeroBonCommande}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.numeroBonLivraison}</td>
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
