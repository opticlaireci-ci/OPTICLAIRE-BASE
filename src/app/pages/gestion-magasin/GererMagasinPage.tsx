import { logger } from '../../utils/logger';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Store, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMagasins } from '../../constants/magasins';
import { chargerVentes, readVentesCache, type VenteSupabase } from '../../services/ventesService';

/** Map snake_case Firestore → forme camelCase attendue par les graphiques. */
const mapVenteToVente = (v: VenteSupabase) => ({
  id: v.id,
  date: v.date,
  totalNet: Number(v.total_net) || 0,
  montantPaye: Number((v as any).montant_paye ?? v.recap?.acompte) || 0,
  totalAssurance: Array.isArray(v.bons_assurance) ? v.bons_assurance.reduce((s: number, b: any) => s + (Number(b?.montantPrisEnCharge ?? b?.montant ?? b?.total ?? 0) || 0), 0) : 0,
  avoirClient: Number((v as any).avoir_client) || 0,
  restant: Number((v as any).restant) || 0,
});

interface Objectif {
  id: string;
  magasinId: string;
  objectif: string;
  mois: string;
  annee: string;
}

interface Vente {
  date: string;
  totalNet: number;
  montantPaye?: number;
  totalAssurance?: number;
  avoirClient?: number;
  restant?: number;
}

const MAGASINS = getMagasins();

const MOIS = [
  { value: 'Janvier', label: 'Janvier' },
  { value: 'Février', label: 'Février' },
  { value: 'Mars', label: 'Mars' },
  { value: 'Avril', label: 'Avril' },
  { value: 'Mai', label: 'Mai' },
  { value: 'Juin', label: 'Juin' },
  { value: 'Juillet', label: 'Juillet' },
  { value: 'Août', label: 'Août' },
  { value: 'Septembre', label: 'Septembre' },
  { value: 'Octobre', label: 'Octobre' },
  { value: 'Novembre', label: 'Novembre' },
  { value: 'Décembre', label: 'Décembre' },
];

export function GererMagasinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const magasinId = searchParams.get('magasin') || 'abobo';
  const magasin = MAGASINS.find(storeItem => storeItem.id === magasinId) || MAGASINS[0];

  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  // Affichage INSTANTANÉ depuis le cache, puis rafraîchissement Firestore.
  const [ventes, setVentes] = useState<Vente[]>(() => readVentesCache(magasinId).map(mapVenteToVente));
  const [formData, setFormData] = useState({
    objectif: '',
    mois: 'Mai',
    annee: new Date().getFullYear().toString(),
  });
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState('mai 2026');
  const [selectedYear, setSelectedYear] = useState('2026');
  const itemsPerPage = 10;

  useEffect(() => {
    loadObjectifs();
  }, [magasinId]);

  useEffect(() => {
    let mounted = true;
    setVentes(readVentesCache(magasinId).map(mapVenteToVente));
    const load = () => chargerVentes(magasinId.toUpperCase())
      .then(rows => { if (mounted) setVentes(rows.map(mapVenteToVente)); })
      .catch(e => logger.error('Erreur chargement ventes:', e));
    load();
    const interval = setInterval(load, 10000);
    const onUpdate = () => load();
    window.addEventListener('ventes-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('ventes-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [magasinId]);

  const loadObjectifs = () => {
    try {
      const key = `leclaire_objectifs_${magasinId}`;
      const data = localStorage.getItem(key);
      if (data) {
        setObjectifs(JSON.parse(data));
      }
    } catch (error) {
      logger.error('Erreur chargement objectifs:', error);
    }
  };

  const saveObjectifs = (data: Objectif[]) => {
    const key = `leclaire_objectifs_${magasinId}`;
    localStorage.setItem(key, JSON.stringify(data));
    setObjectifs(data);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newObjectif: Objectif = {
      id: Date.now().toString(),
      magasinId,
      objectif: formData.objectif,
      mois: formData.mois,
      annee: formData.annee,
    };
    saveObjectifs([...objectifs, newObjectif]);
    setFormData({ objectif: '', mois: 'Mai', annee: new Date().getFullYear().toString() });
  };

  const handleDelete = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet objectif ?')) {
      saveObjectifs(objectifs.filter(o => o.id !== id));
    }
  };

  // Données pour graphique mensuel
  const monthlyData = useMemo(() => {
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

    return days.map(day => {
      const dayVentes = ventes.filter(v => {
        if (!v.date) return false;
        const date = new Date(v.date);
        return date.getDate() === day && date.getMonth() === 4 && date.getFullYear() === 2026;
      });

      return {
        day,
        "Chiffre d'Affaires": dayVentes.reduce((sum, v) => sum + (v.totalNet || 0), 0),
        "Paiements Clients": dayVentes.reduce((sum, v) => sum + (v.montantPaye || 0), 0),
        "Bons Assurance": dayVentes.reduce((sum, v) => sum + (v.totalAssurance || 0), 0),
        "AVOIR-CLIENT +": 0,
        "AVOIR-CLIENT -": 0,
        "Montant Restant": dayVentes.reduce((sum, v) => sum + (v.restant || 0), 0),
      };
    });
  }, [magasinId, ventes]);

  // Données pour graphique annuel
  const yearlyData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sept', 'Oct', 'Nov', 'Dec'];

    return months.map((month, idx) => {
      const monthVentes = ventes.filter(v => {
        if (!v.date) return false;
        const date = new Date(v.date);
        return date.getMonth() === idx && date.getFullYear() === 2026;
      });

      return {
        month,
        "Chiffre d'Affaires": monthVentes.reduce((sum, v) => sum + (v.totalNet || 0), 0),
        "Paiements Clients": monthVentes.reduce((sum, v) => sum + (v.montantPaye || 0), 0),
        "Bons Assurance": monthVentes.reduce((sum, v) => sum + (v.totalAssurance || 0), 0),
        "AVOIR-CLIENT +": 0,
        "AVOIR-CLIENT -": 0,
        "Montant Restant": monthVentes.reduce((sum, v) => sum + (v.restant || 0), 0),
        "Objectif": 0,
      };
    });
  }, [magasinId, ventes]);

  const filteredObjectifs = objectifs.filter(o => o.annee === filterYear);
  const totalPages = Math.ceil(filteredObjectifs.length / itemsPerPage);
  const paginatedObjectifs = filteredObjectifs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
          Gestion Magasins {magasin.label}
        </h1>
        <button
          onClick={() => navigate(`/magasin/${magasinId}/dashboard`)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          <Store size={16} />
          Accéder au Magasin
        </button>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
              Objectif <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={formData.objectif}
              onChange={(e) => setFormData({ ...formData, objectif: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
              Mois <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={formData.mois}
              onChange={(e) => setFormData({ ...formData, mois: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              {MOIS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
              Année <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="number"
              required
              value={formData.annee}
              onChange={(e) => setFormData({ ...formData, annee: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '8px 24px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Enregistrer
          </button>
        </div>
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Colonne gauche - Tables */}
        <div>
          {/* Table 1 */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Année...</span>
              <span style={{ fontSize: '14px' }}>...</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    width: '100px',
                  }}
                />
                <button
                  onClick={() => setFilterYear('')}
                  style={{
                    padding: '6px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
                <button
                  style={{
                    padding: '6px 16px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  🔍
                </button>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '4px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>#</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Objectif</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Mois</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Année</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedObjectifs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        Aucune donnée
                      </td>
                    </tr>
                  ) : (
                    paginatedObjectifs.map((obj, idx) => (
                      <tr key={obj.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{obj.objectif}</td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{obj.mois}</td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>{obj.annee}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDelete(obj.id)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === 1 ? '#f3f4f6' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === 1 ? '#f3f4f6' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === totalPages || totalPages === 0 ? '#f3f4f6' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                style={{
                  padding: '6px 12px',
                  backgroundColor: currentPage === totalPages || totalPages === 0 ? '#f3f4f6' : '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>

          {/* Table 2 - Duplicate structure */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Année...</span>
              <span style={{ fontSize: '14px' }}>...</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={filterYear}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    width: '100px',
                  }}
                  readOnly
                />
                <button
                  style={{
                    padding: '6px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
                <button
                  style={{
                    padding: '6px 16px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  🔍
                </button>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '4px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>#</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Objectif</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Mois</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Année</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                      Aucune donnée
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
              <button
                disabled
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'not-allowed',
                }}
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                disabled
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'not-allowed',
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'not-allowed',
                }}
              >
                <ChevronRight size={14} />
              </button>
              <button
                disabled
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'not-allowed',
                }}
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Colonne droite - Graphiques */}
        <div>
          {/* Graphique Mensuel */}
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>ACTIVITÉ MENSUELLE</h3>
              <input
                type="text"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  width: '120px',
                }}
              />
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Chiffre d'Affaires" fill="#3b82f6" />
                <Bar dataKey="Paiements Clients" fill="#10b981" />
                <Bar dataKey="Bons Assurance" fill="#f59e0b" />
                <Bar dataKey="AVOIR-CLIENT +" fill="#8b5cf6" />
                <Bar dataKey="AVOIR-CLIENT -" fill="#ef4444" />
                <Bar dataKey="Montant Restant" fill="#ec4899" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Graphique Annuel */}
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>ACTIVITÉ ANNUELLE</h3>
              <input
                type="text"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  width: '80px',
                }}
              />
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Chiffre d'Affaires" fill="#3b82f6" />
                <Bar dataKey="Paiements Clients" fill="#10b981" />
                <Bar dataKey="Bons Assurance" fill="#f59e0b" />
                <Bar dataKey="AVOIR-CLIENT +" fill="#8b5cf6" />
                <Bar dataKey="AVOIR-CLIENT -" fill="#ef4444" />
                <Bar dataKey="Montant Restant" fill="#ec4899" />
                <Bar dataKey="Objectif" fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
