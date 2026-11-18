/**
 * LECLAIRE (caisse des ouvertures de magasins et des missions) : ouverte
 * depuis le menu d'OPTICLAIRE, avec le compte OPTICLAIRE connecté. Écran
 * plein, à part des écrans d'OPTICLAIRE ; « Retour à OPTICLAIRE » ramène à
 * la page précédente.
 */
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import LeclaireApp from '../leclaire/LeclaireApp';

export function LeclairePage() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B1D3A', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        Chargement…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const nom = user.name || [user.prenom, user.nom].filter(Boolean).join(' ') || user.email;
  const retour = () => {
    // Ouverte depuis le menu : on revient à la page précédente ; ouverte
    // directement (lien, favori) : accueil d'OPTICLAIRE.
    if (location.key && location.key !== 'default') navigate(-1);
    else navigate(user.magasinActuel && !['super_admin', 'admin', 'administrateur'].includes(user.role) ? `/magasin/${user.magasinActuel}` : '/', { replace: true });
  };

  return (
    <LeclaireApp
      compte={{ id: user.id, nom, email: user.email }}
      onRetour={retour}
      onLogout={() => { logout(); navigate('/login', { replace: true }); }}
    />
  );
}
