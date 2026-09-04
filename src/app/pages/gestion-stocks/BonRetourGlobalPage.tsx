import { logger } from '../../utils/logger';
import { useState } from 'react';
import { Search, CheckCircle, XCircle, Eye } from 'lucide-react';
import { getMagasins } from '../../constants/magasins';
import { useAuth } from '../../contexts/AuthContext';
import { upsertBon, retourToRow } from '../../services/bonsService';
import { useLiveData } from '../../hooks/useLiveData';

interface BonRetour {
  id: string;
  numero: string;
  date: string;
  magasin: string;
  responsable: string;
  items: { designation: string; quantite: number; motif: string }[];
  statut: string;
  observations?: string;
  dateTraitement?: string;
  traitePar?: string;
  dateValidation?: string;
  validePar?: string;
  motifRejet?: string;
}

const MAGASINS = getMagasins().map(magasin => magasin.label);

function getMagasinLabel(magasinId: string): string {
  const labels: Record<string, string> = {
    'ABOBO': 'Abobo',
    'FAYA': 'Faya',
    'KOUMASSI': 'Koumassi',
    'PALMERAIE': 'Palmeraie',
    'YOPOUGON': 'Yopougon',
    'BINGERVILLE': 'Bingerville',
    'MAN': 'Man',
  };
  return labels[magasinId.toUpperCase()] || magasinId;
}

export function BonRetourGlobalPage() {
  const { user } = useAuth();
  const [bons, setBons] = useLiveData<BonRetour>('leclaire_db_bon-retour');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterMagasin, setFilterMagasin] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBon, setSelectedBon] = useState<BonRetour | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showRejetModal, setShowRejetModal] = useState(false);
  const [observations, setObservations] = useState('');
  const [motifRejet, setMotifRejet] = useState('');

  const filteredBons = bons.filter(bon => {
    const matchSearch = searchTerm === '' ||
      (bon.numero && bon.numero.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchMagasin = filterMagasin === '' || getMagasinLabel(bon.magasin).toLowerCase().includes(filterMagasin.toLowerCase());
    const matchStatut = filterStatut === '' || bon.statut === filterStatut;
    return matchSearch && matchMagasin && matchStatut;
  });

  const handleValider = () => {
    if (!selectedBon) return;

    const updatedBons = bons.map((bon: BonRetour) => {
      if (bon.id === selectedBon.id) {
        return {
          ...bon,
          statut: 'Validé',
          dateValidation: new Date().toISOString(),
          validePar: user ? `${user.prenom} ${user.nom}` : 'Directeur',
          observations,
        };
      }
      return bon;
    });

    setBons(updatedBons);
    const changed = updatedBons.find((b: BonRetour) => b.id === selectedBon.id);
    if (changed) upsertBon(retourToRow(changed)).catch(e => logger.error('❌ upsertBon retour:', e));

    alert('Bon de retour validé avec succès !');
    setShowValidationModal(false);
    setShowDetailModal(false);
    setSelectedBon(null);
    setObservations('');
  };

  const handleRejeter = () => {
    if (!selectedBon || !motifRejet.trim()) {
      alert('Veuillez renseigner le motif de rejet');
      return;
    }

    const updatedBons = bons.map((bon: BonRetour) => {
      if (bon.id === selectedBon.id) {
        return {
          ...bon,
          statut: 'Rejeté',
          dateValidation: new Date().toISOString(),
          validePar: user ? `${user.prenom} ${user.nom}` : 'Directeur',
          motifRejet,
        };
      }
      return bon;
    });

    setBons(updatedBons);
    const changed = updatedBons.find((b: BonRetour) => b.id === selectedBon.id);
    if (changed) upsertBon(retourToRow(changed)).catch(e => logger.error('❌ upsertBon retour:', e));

    alert('Bon de retour rejeté');
    setShowRejetModal(false);
    setShowDetailModal(false);
    setSelectedBon(null);
    setMotifRejet('');
  };

  const getStatutColor = (statut: string) => {
    switch (statut?.toLowerCase()) {
      case 'validé':
        return '#10b981';
      case 'rejeté':
        return '#ef4444';
      case 'en attente':
      default:
        return '#f59e0b';
    }
  };

  const bonsEnAttente = filteredBons.filter(b => b.statut === 'En attente' || !b.statut);
  const bonsValides = filteredBons.filter(b => b.statut === 'Validé');
  const bonsRejetes = filteredBons.filter(b => b.statut === 'Rejeté');

  const sortedBons = [...filteredBons].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="admin-stock-list-page" style={{ padding: 'clamp(12px, 3vw, 24px)', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 'bold', marginBottom: '24px' }}>
        Validation Bons de Retour - Directeur ({bons.length})
      </h1>

      {/* Statistiques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f59e0b' }}>{bonsEnAttente.length}</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>En Attente de Validation</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>{bonsValides.length}</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Validés</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{bonsRejetes.length}</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Rejetés</div>
        </div>
      </div>

      {/* Search filters */}
      <div className="admin-stock-search-filters" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
          Filtrer les bons de retour
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <input
            type="text"
            placeholder="N° Bon de Retour..."
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
            type="date"
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
            <option value="">Tous les statuts</option>
            <option value="En attente">En attente</option>
            <option value="Validé">Validé</option>
            <option value="Rejeté">Rejeté</option>
          </select>
          <input
            type="text"
            placeholder="Magasin..."
            value={filterMagasin}
            onChange={(e) => setFilterMagasin(e.target.value)}
            style={{
              flex: '0 1 160px',
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
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th className="stock-select-col" style={{ padding: '12px', width: '40px', textAlign: 'center' }}><input type="checkbox" /></th>
              <th style={{ padding: '12px', width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>#</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                N° Bon de Retour
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Date
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Magasin
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Responsable
              </th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>
                Articles
              </th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>
                Statut
              </th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredBons.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun bon de retour trouvé
                </td>
              </tr>
            ) : (
              sortedBons.map((bon, idx) => (
                <tr key={bon.id} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td className="stock-select-col" style={{ padding: '12px', textAlign: 'center' }}><input type="checkbox" /></td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{idx + 1}</td>
                  <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600' }}>{bon.numero || '-'}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    {bon.date ? new Date(bon.date).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{getMagasinLabel(bon.magasin)}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{bon.responsable || '-'}</td>
                  <td style={{ padding: '12px', fontSize: '14px', textAlign: 'center' }}>
                    <span style={{ backgroundColor: '#e5e7eb', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                      {bon.items?.length || 0}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    <span style={{
                      backgroundColor: getStatutColor(bon.statut),
                      color: '#fff',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      display: 'inline-block',
                    }}>
                      {bon.statut || 'En attente'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        onClick={() => {
                          setSelectedBon(bon);
                          setShowDetailModal(true);
                        }}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#3b82f6',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Eye size={14} /> Voir
                      </button>
                      {(bon.statut === 'En attente' || !bon.statut) && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedBon(bon);
                              setShowValidationModal(true);
                            }}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#10b981',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <CheckCircle size={14} /> Valider
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBon(bon);
                              setShowRejetModal(true);
                            }}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <XCircle size={14} /> Rejeter
                          </button>
                        </>
                      )}
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
            Aucun bon de retour trouvé
          </div>
        ) : (
          sortedBons.map((bon) => (
            <div key={bon.id} style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ backgroundColor: getStatutColor(bon.statut), padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>N° {bon.numero || '-'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px', marginTop: '2px' }}>
                    {getMagasinLabel(bon.magasin)}
                  </div>
                </div>
                <span style={{
                  backgroundColor: 'rgba(0,0,0,0.2)',
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                      {bon.date ? new Date(bon.date).toLocaleDateString('fr-FR') : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Articles</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                      {bon.items?.length || 0} article{(bon.items?.length || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                {bon.responsable && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '500', color: '#374151' }}>Responsable:</span> {bon.responsable}
                  </div>
                )}
                {/* Preview items */}
                {bon.items && bon.items.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    {bon.items.slice(0, 3).map((item, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#6b7280', padding: '2px 0', borderBottom: i < Math.min(bon.items.length, 3) - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        {item.designation} · qté {item.quantite}
                        {item.motif && <span style={{ color: '#9ca3af' }}> · {item.motif}</span>}
                      </div>
                    ))}
                    {bon.items.length > 3 && (
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                        + {bon.items.length - 3} autre{bon.items.length - 3 > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Card footer */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setSelectedBon(bon);
                    setShowDetailModal(true);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Eye size={13} /> Voir
                </button>
                {(bon.statut === 'En attente' || !bon.statut) && (
                  <>
                    <button
                      onClick={() => {
                        setSelectedBon(bon);
                        setShowValidationModal(true);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle size={13} /> Valider
                    </button>
                    <button
                      onClick={() => {
                        setSelectedBon(bon);
                        setShowRejetModal(true);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <XCircle size={13} /> Rejeter
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Détails */}
      {showDetailModal && selectedBon && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px' }}>
                Détails du Bon de Retour
              </h2>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div><strong>N° Bon:</strong> {selectedBon.numero}</div>
                <div><strong>Date:</strong> {new Date(selectedBon.date).toLocaleDateString('fr-FR')}</div>
                <div><strong>Magasin:</strong> {getMagasinLabel(selectedBon.magasin)}</div>
                <div><strong>Responsable:</strong> {selectedBon.responsable}</div>
                <div><strong>Statut:</strong>
                  <span style={{
                    marginLeft: '8px',
                    backgroundColor: getStatutColor(selectedBon.statut),
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}>
                    {selectedBon.statut || 'En attente'}
                  </span>
                </div>
              </div>

              {selectedBon.validePar && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
                  <strong>Validé par:</strong> {selectedBon.validePar} le{' '}
                  {selectedBon.dateValidation ? new Date(selectedBon.dateValidation).toLocaleDateString('fr-FR') : '-'}
                </div>
              )}

              {selectedBon.motifRejet && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fee', borderRadius: '6px', border: '1px solid #fcc' }}>
                  <strong style={{ color: '#ef4444' }}>Motif de rejet:</strong> {selectedBon.motifRejet}
                </div>
              )}

              {selectedBon.observations && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                  <strong>Observations:</strong> {selectedBon.observations}
                </div>
              )}

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Articles à retourner</h3>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Désignation</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '13px', fontWeight: '600' }}>Quantité</th>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '13px', fontWeight: '600' }}>Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBon.items?.map((item, idx) => (
                      <tr key={idx} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '10px', fontSize: '14px' }}>{item.designation}</td>
                        <td style={{ padding: '10px', fontSize: '14px', textAlign: 'center', fontWeight: '600' }}>{item.quantite}</td>
                        <td style={{ padding: '10px', fontSize: '14px' }}>{item.motif || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Validation */}
      {showValidationModal && selectedBon && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>
                Valider le Bon de Retour
              </h2>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
                Confirmez-vous la validation du bon de retour <strong>{selectedBon.numero}</strong> du magasin <strong>{getMagasinLabel(selectedBon.magasin)}</strong> ?
              </p>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                Observations (optionnel)
              </label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Ajouter des observations..."
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowValidationModal(false);
                  setObservations('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleValider}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                <CheckCircle size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Valider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rejet */}
      {showRejetModal && selectedBon && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444' }}>
                Rejeter le Bon de Retour
              </h2>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
                Vous allez rejeter le bon de retour <strong>{selectedBon.numero}</strong> du magasin <strong>{getMagasinLabel(selectedBon.magasin)}</strong>.
              </p>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                Motif de rejet <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={motifRejet}
                onChange={(e) => setMotifRejet(e.target.value)}
                placeholder="Expliquer le motif du rejet..."
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  minHeight: '100px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowRejetModal(false);
                  setMotifRejet('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleRejeter}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                <XCircle size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Rejeter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
