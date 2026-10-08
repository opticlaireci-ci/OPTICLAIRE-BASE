import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ClientsNonSoldes } from './magasin/gestion-commercial/RecouvrementPage';

/**
 * CLIENTS NON SOLDÉS — TOUS LES MAGASINS (administration)
 *
 * Raccourci ouvert depuis Visualisation PDF et Excel : l'administrateur voit
 * les clients non soldés de chaque magasin (filtre par magasin) sans avoir à
 * entrer d'abord dans le magasin. Même liste, mêmes calculs et mêmes actions
 * que l'onglet « Clients non soldés » d'un magasin.
 */
export function ClientsNonSoldesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = String(user?.role || '');
  const estAdmin = role === 'super_admin' || role === 'admin' || role === 'administrateur';
  const acces = user?.menuAccess || [];
  // Données de tous les magasins : réservées à l'administrateur et aux comptes
  // à qui il a ouvert Visualisation PDF et Excel (ou ce raccourci).
  const autorise = estAdmin || acces.includes('/visualisation') || acces.includes('/clients-non-soldes');

  if (!autorise) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-600 text-sm">
          Accès réservé à l'administrateur.
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#eef2f4', minHeight: '100%' }}>
      <div className="px-4 md:px-6 pt-4">
        <button
          onClick={() => navigate('/visualisation')}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft size={16} /> Visualisation PDF et Excel
        </button>
      </div>
      <ClientsNonSoldes />
    </div>
  );
}
