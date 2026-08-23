import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  LayoutDashboard, Users, Store, RefreshCw, Receipt, UserPlus,
  Calendar, Package, BarChart3, ArrowRight, Clock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMagasinLabel, getMagasins } from '../constants/magasins';
import { readAccueilContent, loadAccueilContent, type AccueilContent } from '../utils/accueilContent';
import { pathToButtonKey } from '../constants/appButtons';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Administrateur',
  admin: 'Administrateur',
  administrateur: 'Administrateur',
  directeur: 'Directeur',
  manager: 'Manager',
  comptable: 'Comptable',
  conseillere: 'Conseillère',
  caissier: 'Caissier',
  employee: 'Employé(e)',
  guest: 'Invité',
};

const ADMIN_ROLES = ['super_admin', 'admin', 'administrateur', 'manager', 'directeur', 'comptable'];

function greeting(h: number): string {
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

interface QuickLink { title: string; desc: string; icon: React.ReactNode; to: string; color: string; }

export function AccueilPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [content, setContent] = useState<AccueilContent>(() => readAccueilContent());
  // Nombre RÉEL de magasins disponibles (dynamique). Lu ici — jamais en constante
  // de module — pour refléter immédiatement l'ajout d'un magasin.
  const [nbMagasins, setNbMagasins] = useState<number>(() => getMagasins().length);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  // La liste des magasins évolue (ajout via Gestion Magasins, synchro cloud) :
  // on recalcule le compteur à chaque mise à jour, sans recharger l'application.
  useEffect(() => {
    const refresh = () => setNbMagasins(getMagasins().length);
    refresh();
    window.addEventListener('leclaire-sync-update', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('supabase-realtime-update', refresh as EventListener);
    return () => {
      window.removeEventListener('leclaire-sync-update', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('supabase-realtime-update', refresh as EventListener);
    };
  }, []);

  // Contenu d'accueil partagé (édité dans l'Espace Administrateur) : cache
  // instantané puis rafraîchissement depuis le cloud + écoute des mises à jour.
  useEffect(() => {
    let mounted = true;
    loadAccueilContent().then(c => { if (mounted) setContent(c); }).catch(() => {});
    const refresh = () => { if (mounted) setContent(readAccueilContent()); };
    window.addEventListener('leclaire-sync-update', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      mounted = false;
      window.removeEventListener('leclaire-sync-update', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const isAdmin = ADMIN_ROLES.includes(user?.role || '');
  const displayName = user?.prenom || user?.name || user?.email?.split('@')[0] || 'Utilisateur';
  const roleLabel = ROLE_LABELS[user?.role || ''] || user?.role || '';
  const magasins = user?.magasinIds || [];
  const magasinActuel = user?.magasinActuel || magasins[0] || '';

  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // Les accès rapides doivent respecter EXACTEMENT les mêmes droits que le menu
  // latéral : si une section n'est pas activée pour l'utilisateur (menuAccess),
  // elle ne doit pas apparaître ici non plus (sinon l'accueil devient une porte
  // dérobée vers des pages désactivées, ex. le Tableau de Bord).
  const menuAccess = user?.menuAccess || [];
  const filterByAccess = (list: QuickLink[]): QuickLink[] => {
    // Admin ou aucun accès configuré → tout est visible (comportement du menu).
    if (isAdmin || menuAccess.length === 0) return list;
    return list.filter(l => {
      const key = pathToButtonKey(l.to);
      return !key || menuAccess.includes(key);
    });
  };

  const links: QuickLink[] = filterByAccess(isAdmin
    ? [
        { title: 'Tableau de Bord', desc: 'Vue globale de tous les magasins', icon: <LayoutDashboard size={22} />, to: '/', color: '#2b8fb0' },
        { title: 'Gestion Utilisateurs', desc: 'Comptes et accès', icon: <Users size={22} />, to: '/utilisateurs', color: '#7c3aed' },
        { title: 'Gestion Magasins', desc: 'Configurer les magasins', icon: <Store size={22} />, to: '/gestion-magasins', color: '#16a34a' },
        { title: 'Synchronisation', desc: 'État multi-appareils', icon: <RefreshCw size={22} />, to: '/synchronisation', color: '#d97706' },
      ]
    : [
        { title: 'Mon Tableau de Bord', desc: 'Statistiques du magasin', icon: <LayoutDashboard size={22} />, to: `/magasin/${magasinActuel}/dashboard`, color: '#2b8fb0' },
        { title: 'Vente / Facture', desc: 'Enregistrer une vente', icon: <Receipt size={22} />, to: `/magasin/${magasinActuel}/commercial/vente-facture`, color: '#16a34a' },
        { title: 'Clients', desc: 'Base de données client', icon: <UserPlus size={22} />, to: `/magasin/${magasinActuel}/clientele/clients`, color: '#7c3aed' },
        { title: 'RDV Retrait', desc: 'Rendez-vous de retrait', icon: <Calendar size={22} />, to: `/magasin/${magasinActuel}/clientele/rdv-retrait`, color: '#d97706' },
        { title: 'État de Stock', desc: 'Stock du magasin', icon: <Package size={22} />, to: `/magasin/${magasinActuel}/stocks/etat-stock`, color: '#e11d48' },
        { title: 'Vente Flash', desc: 'Vente rapide', icon: <BarChart3 size={22} />, to: `/magasin/${magasinActuel}/commercial/vente-flash`, color: '#0891b2' },
      ]);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: '#d6e4ea' }}>
      {/* Bannière d'accueil */}
      <div className="rounded-2xl p-6 md:p-8 text-white shadow-lg mb-6"
        style={{ background: 'linear-gradient(135deg, #2b8fb0 0%, #1a6f8c 100%)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="opacity-90">{greeting(now.getHours())},</p>
            <h1 className="font-bold" style={{ fontSize: '28px' }}>{displayName} 👋</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {roleLabel && (
                <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  {roleLabel}
                </span>
              )}
              {!isAdmin && magasinActuel && (
                <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  {getMagasinLabel(magasinActuel) || magasinActuel}
                </span>
              )}
              {isAdmin && (
                <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  {nbMagasins > 0 ? `${nbMagasins} magasin(s)` : 'Tous les magasins'}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end opacity-90">
              <Clock size={16} /><span className="text-sm">{timeStr}</span>
            </div>
            <p className="text-sm opacity-90 capitalize mt-1">{dateStr}</p>
          </div>
        </div>
      </div>

      {/* Message de bienvenue */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-6 border border-gray-100">
        <h2 className="font-semibold text-gray-800 mb-1">{content.title}</h2>
        {content.message && (
          <p className="text-sm text-gray-500 whitespace-pre-wrap">{content.message}</p>
        )}
      </div>

      {/* Blocs / annonces personnalisés par l'administrateur */}
      {content.blocks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {content.blocks.map(b => (
            <div key={b.id} className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 border-l-4"
              style={{ borderLeftColor: '#2b8fb0' }}>
              {b.title && <h3 className="font-semibold text-gray-800 mb-1">{b.title}</h3>}
              {b.message && <p className="text-sm text-gray-500 whitespace-pre-wrap">{b.message}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Accès rapides */}
      <h3 className="font-semibold text-gray-700 uppercase tracking-wide mb-3">Accès rapides</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map(l => (
          <button
            key={l.to + l.title}
            onClick={() => navigate(l.to)}
            className="group bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 border border-gray-100 hover:shadow-md transition text-left"
          >
            <div className="p-3 rounded-xl flex-shrink-0" style={{ backgroundColor: l.color + '18', color: l.color }}>
              {l.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-800">{l.title}</div>
              <div className="text-xs text-gray-500 truncate">{l.desc}</div>
            </div>
            <ArrowRight size={18} className="text-gray-300 group-hover:text-gray-500 transition" />
          </button>
        ))}
      </div>
    </div>
  );
}
