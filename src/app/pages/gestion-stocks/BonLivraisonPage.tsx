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

  const sortedBons = [...filteredBons].sort((a, b) => (a.fournisseur || '').localeCompare(b.fournisseur || '', 'fr'));

  return (
    <div className="admin-stock-list-page" style={{ padding: 'clamp(12px, 3vw, 24px)', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Livraison ({bons.length})
      </h1>

      {/* Search filters */}
      <div className="admin-stock-search-filters" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (Fournisseur, N° Bon de Livraison, N°Bon de Commande)
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
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun bon de livraison trouvé
                </td>
              </tr>
            ) : (
              sortedBons.map((bon, idx) => (
                <tr key={bon.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px' }}>
                    <input type="checkbox" />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{idx + 1}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.fournisseur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.numeroBonCommande}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.numeroBonLivraison}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <button title="Imprimer">🖨️</button><button title="B5">B5</button><button title="A5">A5</button><button title="Éditer">✏️</button>
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
            Aucun bon de livraison trouvé
          </div>
        ) : (
          sortedBons.map((bon) => (
            <div key={bon.id} style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ backgroundColor: '#047857', padding: '12px 16px' }}>
                <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>
                  N° Livraison: {bon.numeroBonLivraison || '-'}
                </div>
                <div style={{ color: '#a7f3d0', fontSize: '13px', marginTop: '2px' }}>
                  {bon.fournisseur}
                </div>
              </div>
              {/* Card body */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fournisseur</div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>{bon.fournisseur || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>N° Commande</div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>{bon.numeroBonCommande || '-'}</div>
                  </div>
                </div>
                {bon.dateLivraison && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af' }}>
                    Date livraison: {new Date(bon.dateLivraison).toLocaleDateString('fr-FR')}
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
