import { useState } from 'react';
import { Search } from 'lucide-react';
import { getMagasins } from '../../constants/magasins';
import { useLiveData } from '../../hooks/useLiveData';
import { imprimerGestionStock, imprimerFormatGestionStock } from '../../utils/stockActions';

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

const getStatutColor = (statut: string) => {
  switch (statut) {
    case 'Terminé': return '#10b981';
    case 'En cours': return '#3b82f6';
    case 'En attente': return '#f59e0b';
    default: return '#9ca3af';
  }
};

export function BonTransfertGlobalPage() {
  const [bons, setBons] = useLiveData<BonTransfert>('leclaire_db_bon-transfert');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterMagasin, setFilterMagasin] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const handleEdit = (bon: BonTransfert) => {
    const expediteur = window.prompt('Magasin expéditeur', bon.magasinExpediteur || ''); if (expediteur === null) return;
    const recepteur = window.prompt('Magasin récepteur', bon.magasinRecepteur || ''); if (recepteur === null) return;
    const responsable = window.prompt('Récepteur', bon.recepteur || ''); if (responsable === null) return;
    setBons(bons.map(b => b.id === bon.id ? { ...b, magasinExpediteur: expediteur, magasinRecepteur: recepteur, recepteur: responsable } : b));
  };

  const filteredBons = bons.filter(bon => {
    const matchSearch = searchTerm === '' ||
      bon.numeroBon.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatut = filterStatut === '' || bon.statut === filterStatut;
    const matchMagasin = filterMagasin === '' ||
      bon.magasinExpediteur === filterMagasin ||
      bon.magasinRecepteur === filterMagasin;
    return matchSearch && matchStatut && matchMagasin;
  });

  const sortedBons = [...filteredBons].sort((a, b) => (a.numeroBon || '').localeCompare(b.numeroBon || '', 'fr'));

  return (
    <div className="admin-stock-list-page" style={{ padding: 'clamp(12px, 3vw, 24px)', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 'bold', marginBottom: '24px' }}>
        Bons de Transfert ({bons.length})
      </h1>

      {/* Search filters */}
      <div className="admin-stock-search-filters" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          (N° Bon de Transfert)
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
            <option value="En cours">En cours</option>
            <option value="Terminé">Terminé</option>
          </select>
          <select
            value={filterMagasin}
            onChange={(e) => setFilterMagasin(e.target.value)}
            style={{
              flex: '0 1 160px',
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
              <th className="stock-select-col" style={{ padding: '12px', width: '40px', textAlign: 'center' }}><input type="checkbox" /></th>
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
              sortedBons.map((bon, idx) => (
                <tr key={bon.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td className="stock-select-col" style={{ padding: '12px', textAlign: 'center' }}><input type="checkbox" /></td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{idx + 1}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.numeroBon}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.magasinExpediteur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.magasinRecepteur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.recepteur}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.statut}</td>
                  <td style={{ padding: '8px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => imprimerGestionStock(`Bon de transfert ${bon.numeroBon}`)} title="Imprimer">🖨️</button>
                      <button onClick={() => handleEdit(bon)} title="Éditer" style={{ padding: '4px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Éditer</button>
                    </div>
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
            Aucun bon de transfert trouvé
          </div>
        ) : (
          sortedBons.map((bon) => (
            <div key={bon.id} style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ backgroundColor: '#6d28d9', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>N° {bon.numeroBon}</div>
                  {bon.dateTransfert && (
                    <div style={{ color: '#ddd6fe', fontSize: '12px', marginTop: '2px' }}>
                      {new Date(bon.dateTransfert).toLocaleDateString('fr-FR')}
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
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Transfert</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', backgroundColor: '#f3f4f6', padding: '3px 8px', borderRadius: '4px' }}>
                      {bon.magasinExpediteur || '-'}
                    </span>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>→</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: '4px' }}>
                      {bon.magasinRecepteur || '-'}
                    </span>
                  </div>
                </div>
                {bon.recepteur && (
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    <span style={{ fontWeight: '500', color: '#374151' }}>Récepteur:</span> {bon.recepteur}
                  </div>
                )}
              </div>
              {/* Card footer */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6' }}>
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
