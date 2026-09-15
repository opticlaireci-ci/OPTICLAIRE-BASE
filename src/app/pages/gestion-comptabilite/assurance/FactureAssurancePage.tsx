import { Store } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getMagasins } from '../../../constants/magasins';
import { TENANT } from '../../../config/tenant';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#1a7a96', '#dc2626', '#ea580c', '#ca8a04'];
const allMagasins = getMagasins();
const MAGASINS = allMagasins.map((magasin, index) => ({
  id: magasin.id,
  label: magasin.label.replace(`${TENANT.nom} `, ''),
  color: COLORS[index % COLORS.length]
}));

function readLS<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

export function FactureAssurancePage() {
  const navigate = useNavigate();
  const handleMagasinClick = (magasinId: string) => {
    navigate(`/comptabilite/assurance/factures/${magasinId}`);
  };

  return (
    <div className="flex flex-col gap-6 p-6" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      <div>
        <h1 className="text-xl font-bold text-gray-800">Factures Assurance</h1>
        <p className="text-sm text-gray-500 mt-0.5">Sélectionnez un magasin pour consulter ses factures assurance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {MAGASINS.map(magasin => {
          const factures = readLS<any>(`leclaire_factures_assurance_${magasin.id}`);
          return (
            <button
              key={magasin.id}
              onClick={() => handleMagasinClick(magasin.id)}
              className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center gap-4 border-t-4 hover:shadow-md transition-shadow text-left w-full"
              style={{ borderColor: magasin.color }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: magasin.color + '18' }}>
                <Store size={28} style={{ color: magasin.color }} />
              </div>
              <div className="text-center">
                <div className="text-base font-bold" style={{ color: magasin.color }}>{magasin.label}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {factures.length} facture{factures.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="mt-auto w-full text-center py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: magasin.color }}>
                Voir les factures
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
