import { useState } from 'react';
import { Search } from 'lucide-react';
import { getMagasins } from '../../constants/magasins';
import { useLiveData } from '../../hooks/useLiveData';

interface BonTransfert {
  id: string;
  numeroBon: string;
  magasinExpediteur: string;
  magasinRecepteur: string;
  recepteur: string;
  statut: string;
  dateTransfert: string;
}

const MAGASINS = getMagasins().map(magasin => magasin.label);

export function BonTransfertGlobalPage() {
  const [bons] = useLiveData<BonTransfert>('leclaire_db_bon-transfert');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterMagasin, setFilterMagasin] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredBons = bons.filter(bon => {
    const matchSearch = searchTerm === '' ||
      bon.numeroBon.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatut = filterStatut === '' || bon.statut === filterStatut;
    const matchMagasin = filterMagasin === '' ||
      bon.magasinExpediteur === filterMagasin ||
      bon.magasinRecepteur === filterMagasin;
    return matchSearch && matchStatut && matchMagasin;
  });

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Transfert ({bons.length})
      </h1>

      {/* Search filters */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Transfert)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px 200px auto', gap: '12px', alignItems: 'end' }}>
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
            <option value="En cours">En cours</option>
            <option value="Terminé">Terminé</option>
          </select>
          <select
            value={filterMagasin}
            onChange={(e) => setFilterMagasin(e.target.value)}
            style={{
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">-- Choisir Magasin --</option>
            {MAGASINS.map(m => <option key={m} value={m}>{m}</option>)}
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
              <th style={{ padding: '12px', width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>#</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                N° Bon de Transfert
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Magasin Expéditeur
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Magasin Récepteur
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Récepteur
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Statut
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
                  Aucun bon de transfert trouvé
                </td>
              </tr>
            ) : (
              [...filteredBons].sort((a, b) => (a.numeroBon || '').localeCompare(b.numeroBon || '', 'fr')).map((bon, idx) => (
                <tr key={bon.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{idx + 1}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.numeroBon}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.magasinExpediteur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.magasinRecepteur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.recepteur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.statut}</td>
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
