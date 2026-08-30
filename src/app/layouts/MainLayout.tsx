import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import {
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Box,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  ChevronLeft,
  Dashboard,
  Store,
  AccountBalance,
  Inventory,
  Category,
  Search,
  People,
  PictureAsPdf,
  History,
  Logout,
  ShoppingCart,
  Receipt,
  LocalShipping,
  CompareArrows,
  Undo,
  BrokenImage,
  Inventory2,
  AttachMoney,
  MedicalServices,
  Visibility,
  RequestQuote,
  Business,
  Person,
  Payment,
  AccountBalanceWallet,
  ContentCut,
  Build,
  RemoveRedEye,
  Cake,
  Autorenew,
  CardGiftcard,
  SwapHoriz,
  EventAvailable,
  Event,
  Construction,
  Settings,
  Tune,
  Message,
  CalendarMonth,
  Sms,
  LocationOn,
  CloudQueue,
  Sync as SyncIcon,
  Home as HomeIcon,
  Phone as PhoneIcon,
  AdminPanelSettings,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { SessionIndicator } from '../components/SessionIndicator';
import { SeasonLogo } from '../components/SeasonLogo';
import { SyncIndicator } from '../components/SyncIndicator';
import { getMagasins } from '../constants/magasins';
import { pathToButtonKey } from '../constants/appButtons';
import { TENANT } from '../config/tenant';

const drawerWidth = 280;

// ── Shortcut badges ──────────────────────────────────────────────────────────
const readLS = <T,>(key: string): T[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

function useLiveShortcuts() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const MAGASIN_IDS = getMagasins().map(m => m.id); // Charger dynamiquement
  const todayMD = `${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  // 1. Anniversaire du personnel — employees table (clé globale)
  const personnel = readLS<any>('leclaire_personnel');
  const annivPersonnel = personnel.filter(p => (p.dateNaissance || '').slice(5, 10) === todayMD).length;

  // 2. Relance renouvellement vente — ventes datant de +1 an sans nouvelle vente
  const allVentes = MAGASIN_IDS.flatMap(id => readLS<any>(`leclaire_ventes_${id}`));
  const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const clientsAvecVieuxAchat = new Set(
    allVentes.filter(v => new Date(v.date || 0) < oneYearAgo).map(v => v.numeroClient)
  );
  const clientsAvecRecentAchat = new Set(
    allVentes.filter(v => new Date(v.date || 0) >= oneYearAgo).map(v => v.numeroClient)
  );
  const relanceRenouvellement = [...clientsAvecVieuxAchat].filter(id => !clientsAvecRecentAchat.has(id)).length;

  // 3. Anniversaire client — clients dont le jour de naissance = aujourd'hui
  const allClients = MAGASIN_IDS.flatMap(id => readLS<any>(`leclaire_clients_magasin_${id}`));
  const annivClient = allClients.filter(c => {
    const jn = c.jourNaissance || c.dateNaissance || '';
    return jn.slice(5, 10) === todayMD;
  }).length;

  // 4. Distribution en attente
  const distrib = readLS<any>('leclaire_db_bon-distribution').filter((d: any) => d.statut === 'En attente' || !d.statut).length;

  // 5. Transfert en attente
  const transfert = readLS<any>('leclaire_db_bon-transfert').filter((d: any) => d.statut === 'En attente' || !d.statut).length;

  // 6. Retour en attente
  const retour = readLS<any>('leclaire_db_bon-retour').filter((d: any) => d.statut === 'En attente' || !d.statut).length;

  // 7. RDV retrait — ventes avec date rdvRetrait non vide
  const rdvRetrait = allVentes.filter(v => (v.recap?.rdvRetrait || v.rdvRetrait || '').trim() !== '').length;

  // 8. RDV en ligne
  const rdvEnLigne = MAGASIN_IDS.reduce((s, id) => s + readLS(`leclaire_rdv_enligne_${id}`).length, 0);

  // 9. Demande devis en attente — statut "En cours" ou "En attente"
  const demandesAttente = MAGASIN_IDS.flatMap(id => readLS<any>(`leclaire_demande_devis_${id}`))
    .filter(d => d.statut === 'En cours' || d.statut === 'En attente').length;

  return { annivPersonnel, relanceRenouvellement, annivClient, distrib, transfert, retour, rdvRetrait, rdvEnLigne, demandesAttente };
}

function ShortcutBadge({ count, icon, label, onClick }: { count: number; icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <div
      title={label}
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 1, cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'scale(1.1)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ position: 'relative' }}>
        {icon}
        <span style={{
          position: 'absolute', top: -5, right: -6,
          backgroundColor: count > 0 ? '#ef4444' : 'rgba(255,255,255,0.35)',
          color: '#fff',
          fontSize: 9, fontWeight: 800,
          minWidth: 14, height: 14,
          borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 2px',
          border: '1.5px solid rgba(255,255,255,0.5)',
          lineHeight: 1,
          boxShadow: count > 0 ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
        }}>
          {count}
        </span>
      </div>
    </div>
  );
}

function ShortcutBar() {
  const navigate = useNavigate();
  const c = useLiveShortcuts();

  const handleEmploiDuTempsClick = () => {
    navigate('/emploi-du-temps');
  };

  const handleSmsClick = () => {
    navigate('/parametrage/message-sms');
  };

  const handleBadgeClick = (path: string) => {
    navigate(path);
  };

  const badges = [
    {
      icon: <Cake sx={{ fontSize: 22, color: '#fff', backgroundColor: '#f59e0b', padding: '4px', borderRadius: '5px' }} />,
      count: c.annivPersonnel,
      label: 'Anniversaire du personnel',
      path: '/profils'
    },
    {
      icon: <Autorenew sx={{ fontSize: 22, color: '#fff', backgroundColor: '#6366f1', padding: '4px', borderRadius: '5px' }} />,
      count: c.relanceRenouvellement,
      label: 'Relance renouvellement vente',
      path: '/clients'
    },
    {
      icon: <CardGiftcard sx={{ fontSize: 22, color: '#fff', backgroundColor: '#eab308', padding: '4px', borderRadius: '5px' }} />,
      count: c.annivClient,
      label: 'Anniversaire client',
      path: '/clients'
    },
    {
      icon: <LocalShipping sx={{ fontSize: 22, color: '#fff', backgroundColor: '#16a34a', padding: '4px', borderRadius: '5px' }} />,
      count: c.distrib,
      label: 'Distribution en attente',
      path: '/stocks/bon-distribution'
    },
    {
      icon: <SwapHoriz sx={{ fontSize: 22, color: '#fff', backgroundColor: '#0ea5e9', padding: '4px', borderRadius: '5px' }} />,
      count: c.transfert,
      label: 'Transfert en attente',
      path: '/stocks/bon-transfert'
    },
    {
      icon: <Undo sx={{ fontSize: 22, color: '#fff', backgroundColor: '#ef4444', padding: '4px', borderRadius: '5px' }} />,
      count: c.retour,
      label: 'Retour en attente',
      path: '/stocks/bon-retour'
    },
    {
      icon: <EventAvailable sx={{ fontSize: 22, color: '#fff', backgroundColor: '#f97316', padding: '4px', borderRadius: '5px' }} />,
      count: c.rdvRetrait,
      label: 'RDV retrait',
      path: '/clients'
    },
    {
      icon: <Event sx={{ fontSize: 22, color: '#fff', backgroundColor: '#8b5cf6', padding: '4px', borderRadius: '5px' }} />,
      count: c.rdvEnLigne,
      label: 'RDV en ligne',
      path: '/clients'
    },
    {
      icon: <RequestQuote sx={{ fontSize: 22, color: '#fff', backgroundColor: '#14b8a6', padding: '4px', borderRadius: '5px' }} />,
      count: c.demandesAttente,
      label: 'Demande devis en attente',
      path: '/clients'
    },
  ];

  const [smsCount] = useState(500);

  return (
    <>
      {/* ── Boutons GAUCHE : Emploi du temps + SMS ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4, flexShrink: 0 }}>
        <div
          title="Emploi du temps"
          onClick={handleEmploiDuTempsClick}
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 4, backgroundColor: '#10b981', color: '#fff', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
        >
          <CalendarMonth sx={{ fontSize: 13 }} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>Emploi du temps</span>
        </div>
        <div
          title={`${smsCount} SMS disponibles`}
          onClick={handleSmsClick}
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 4, backgroundColor: '#8b5cf6', color: '#fff', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
        >
          <Sms sx={{ fontSize: 13 }} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>{smsCount} SMS</span>
        </div>
      </div>

      {/* ── Spacer ── */}
      <Box sx={{ flexGrow: 1 }} />

      {/* ── Icônes DROITE : badges + FR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 10, flexShrink: 0 }}>
        <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.3)', marginRight: 4 }} />
        {badges.map((badge, index) => <ShortcutBadge key={index} {...badge} onClick={() => handleBadgeClick(badge.path)} />)}
        <SyncIndicator />
        <div style={{ marginLeft: 4, padding: '3px 9px', borderRadius: 5, background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'default', letterSpacing: '0.08em', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
          FR
        </div>
      </div>
    </>
  );
}

interface MenuItemType {
  title: string;
  icon: JSX.Element;
  path?: string;
  children?: MenuItemType[];
}

const menuItems: MenuItemType[] = [
  {
    title: 'Accueil',
    icon: <HomeIcon />,
    path: '/accueil',
  },
  {
    title: 'Tableau de Bord',
    icon: <Dashboard />,
    path: '/',
  },
  {
    title: 'Accès Magasins',
    icon: <Store />,
    path: '/espace-administrateur',
  },
  {
    title: 'Espace Administrateur',
    icon: <AdminPanelSettings />,
    children: [
      { title: 'Ajouter/Modifier Magasins', icon: <Settings />, path: '/gestion-magasins' },
      { title: 'RDV Retrait', icon: <EventAvailable />, path: '/rdv-retrait' },
      { title: 'RDV En Ligne', icon: <Event />, path: '/rdv-en-ligne' },
      { title: 'Géolocalisation', icon: <LocationOn />, path: '/geolocalisation' },
      { title: 'Base de Données Client', icon: <People />, path: '/clients' },
      { title: 'Gestion Utilisateurs', icon: <People />, path: '/utilisateurs' },
      { title: 'Gestion Profils', icon: <Person />, path: '/profils' },
      { title: 'Synchronisation', icon: <SyncIcon />, path: '/synchronisation' },
      {
        title: 'Paramétrage',
        icon: <Settings />,
        children: [
          { title: 'Configuration', icon: <Tune />, path: '/parametrage/configuration' },
          { title: "Configuration de l'enseigne", icon: <Business />, path: '/parametrage/enseigne' },
          { title: 'Condition Commerciale', icon: <AttachMoney />, path: '/parametrage/condition-commerciale' },
          { title: 'Message SMS', icon: <Message />, path: '/parametrage/message-sms' },
        ],
      },
    ],
  },
  {
    title: 'Gestion Comptabilité',
    icon: <AccountBalance />,
    children: [
      {
        title: 'Assurance',
        icon: <MedicalServices />,
        children: [
          { title: 'Facture Assurance', icon: <Receipt />, path: '/comptabilite/assurance/factures' },
          { title: 'Relevé Assurance', icon: <RequestQuote />, path: '/comptabilite/assurance/releves' },
          { title: 'Règlement Assurance', icon: <AttachMoney />, path: '/comptabilite/assurance/reglements' },
        ],
      },
      {
        title: 'Fournisseur',
        icon: <Business />,
        children: [
          { title: 'Relevé de Commande', icon: <RequestQuote />, path: '/comptabilite/fournisseur/releve-commande' },
          { title: 'Règlement Verrier', icon: <AttachMoney />, path: '/comptabilite/fournisseur/reglement-verrier' },
          { title: 'Règlement Fournisseur', icon: <AttachMoney />, path: '/comptabilite/fournisseur/reglement' },
        ],
      },
      {
        title: 'Prestation',
        icon: <Build />,
        children: [
          { title: 'Prestations', icon: <Build />, path: '/comptabilite/prestation' },
        ],
      },
      {
        title: 'Mouvement',
        icon: <CompareArrows />,
        children: [
          { title: 'Mouvements Entrée/Sortie', icon: <CompareArrows />, path: '/comptabilite/mouvement' },
          { title: 'Récap Hebdomadaire', icon: <AccountBalance />, path: '/comptabilite/recap-hebdomadaire' },
        ],
      },
      {
        title: 'Caisse - Tous Magasins',
        icon: <AccountBalance />,
        children: [
          { title: 'Mouvements Caisse Global', icon: <AccountBalance />, path: '/mouvements-caisse-global' },
        ],
      },
    ],
  },
  {
    title: 'Gestion Composants',
    icon: <Category />,
    children: [
      { title: 'Monture', icon: <RemoveRedEye />, path: '/composants/montures' },
      { title: 'Accessoires', icon: <ContentCut />, path: '/composants/accessoires' },
      { title: 'Service', icon: <Build />, path: '/composants/services' },
      { title: '__TABS_1__', icon: <Category /> }, // Placeholder pour onglets IMAGE 1
      { title: 'Verre', icon: <Visibility />, path: '/composants/verres' },
      { title: 'Traitement', icon: <Build />, path: '/composants/traitements' },
      { title: '__TABS_2__', icon: <Build /> }, // Placeholder pour onglets IMAGE 2
    ],
  },
  {
    title: 'Gestion Stocks',
    icon: <Inventory />,
    children: [
      { title: 'Bon de Commande', icon: <ShoppingCart />, path: '/stocks/bon-commande' },
      { title: 'Bon de Livraison', icon: <LocalShipping />, path: '/stocks/bon-livraison' },
      { title: 'Bon de Distribution', icon: <Receipt />, path: '/stocks/bon-distribution' },
      { title: 'Bon de Transfert', icon: <CompareArrows />, path: '/stocks/bon-transfert' },
      { title: 'Bon de Retour', icon: <Undo />, path: '/stocks/bon-retour' },
      { title: 'Bon de Péremption-Casse', icon: <BrokenImage />, path: '/stocks/bon-peremption' },
      { title: 'Inventaire Montures', icon: <Inventory2 />, path: '/stocks/inventaire' },
      { title: 'Inventaire Lentilles', icon: <Inventory2 />, path: '/stocks/inventaire-lentilles' },
      { title: 'État de Stock', icon: <Visibility />, path: '/stocks/etat-stock' },
      { title: '__STOCK_BUTTONS__', icon: <Inventory2 /> },
    ],
  },
  {
    title: 'Recherche Monture et Accessoire',
    icon: <Search />,
    path: '/recherche',
  },
  {
    title: 'Gestion des Acteurs',
    icon: <People />,
    children: [
      { title: 'Fournisseur', icon: <Business />, path: '/acteurs/fournisseurs' },
      { title: 'Assurance', icon: <MedicalServices />, path: '/acteurs/assurances' },
      { title: 'Prestataire', icon: <Build />, path: '/acteurs/prestataires' },
      { title: 'Ophtalmologue', icon: <Person />, path: '/acteurs/ophtalmologues' },
      { title: 'Cabinet Ophtalmologue', icon: <Business />, path: '/acteurs/cabinets' },
      { title: 'Mode de Paiement', icon: <Payment />, path: '/acteurs/modes-payement' },
      { title: 'Compte Banque', icon: <AccountBalanceWallet />, path: '/acteurs/comptes-banque' },
    ],
  },
  {
    title: 'Atelier',
    icon: <Construction />,
    path: '/atelier',
  },
  {
    title: 'Call Center',
    icon: <PhoneIcon />,
    path: '/call-center',
  },
  {
    title: 'Visualisation PDF et Excel',
    icon: <PictureAsPdf />,
    path: '/visualisation',
  },
  {
    title: 'Historique',
    icon: <History />,
    path: '/historique',
  },
];

// Filtrer les menus selon le rôle de l'utilisateur
function getFilteredMenuItems(role: string | undefined): MenuItemType[] {
  if (!role) return [];

  // Normaliser les rôles Supabase vers les rôles métier
  const normalizedRole =
    role === 'super_admin' || role === 'admin' || role === 'administrateur'
      ? 'administrateur'
      : role === 'manager' || role === 'directeur'
      ? 'directeur'
      : role === 'comptable'
      ? 'comptable'
      : role === 'employee' || role === 'caissier' || role === 'conseillere'
      ? 'conseillere'
      : role;

  // Monteur : accès à l'Atelier (montage) uniquement.
  if (normalizedRole === 'monteur') {
    return menuItems.filter(item =>
      item.title === 'Accueil' ||
      item.title === 'Tableau de Bord' ||
      item.title === 'Atelier'
    );
  }

  // Administrateur : accès complet
  if (normalizedRole === 'administrateur') {
    return menuItems;
  }

  // Directeur : accès uniquement à "Accès Magasins" dans Espace Administrateur + Mouvements Entrées/Sorties
  if (normalizedRole === 'directeur') {
    return menuItems.map(item => {
      if (item.title === 'Espace Administrateur') {
        return {
          ...item,
          children: item.children?.filter(child => child.title === 'Accès Magasins')
        };
      }
      if (item.title === 'Gestion Comptabilité') {
        return {
          ...item,
          children: item.children?.filter(child => child.title === 'Mouvement')
        };
      }
      return item;
    }).filter(item =>
      item.title === 'Accueil' ||
      item.title === 'Tableau de Bord' ||
      item.title === 'Espace Administrateur' ||
      item.title === 'Gestion Comptabilité'
    );
  }

  // Comptable : seulement Tableau de Bord, Gestion Comptabilité, Gestion Acteurs
  if (normalizedRole === 'comptable') {
    return menuItems.filter(item =>
      item.title === 'Accueil' ||
      item.title === 'Tableau de Bord' ||
      item.title === 'Gestion Comptabilité' ||
      item.title === 'Gestion des Acteurs'
    );
  }

  // Responsable Call Center : accueil dédié, tableau de bord Call Center et
  // page opérationnelle des appels uniquement.
  if (normalizedRole === 'responsable_call_center') {
    return [
      { title: 'Accueil', icon: <HomeIcon />, path: '/call-center/accueil' },
      { title: 'Tableau de Bord Call Center', icon: <Dashboard />, path: '/call-center/dashboard' },
      { title: 'Call Center', icon: <PhoneIcon />, path: '/call-center' },
    ];
  }

  // Conseillère : ne devrait pas arriver ici (redirigé vers magasin)
  return [];
}

/**
 * Filtre récursif des menus selon les clés de boutons explicitement autorisées
 * par l'administrateur (champ `menuAccess`). Un parent est conservé s'il garde
 * au moins un enfant « réel » (avec un chemin ou des sous-enfants). Les éléments
 * décoratifs (placeholders sans chemin) ne suffisent pas à garder un parent.
 */
function filterByAccess(items: MenuItemType[], allowed: string[]): MenuItemType[] {
  const out: MenuItemType[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      const kids = filterByAccess(item.children, allowed);
      if (kids.some(k => k.path || (k.children && k.children.length > 0))) {
        out.push({ ...item, children: kids });
      }
    } else if (!item.path) {
      out.push(item); // décoratif (onglets, boutons stock…)
    } else if (allowed.includes(pathToButtonKey(item.path) || '')) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Renvoie la liste des titres de menus PARENTS de `cible` (du plus haut au plus
 * proche), en explorant l'arbre `items`. Sert à garder la chaîne de parents
 * ouverte quand on déploie un sous-menu imbriqué. Liste vide si `cible` est au
 * premier niveau ou introuvable.
 */
function trouverAncetres(items: MenuItemType[], cible: string, chemin: string[] = []): string[] {
  for (const item of items) {
    if (item.title === cible) return chemin;
    if (item.children && item.children.length > 0) {
      const trouve = trouverAncetres(item.children, cible, [...chemin, item.title]);
      if (trouve.length || item.children.some(c => c.title === cible)) return trouve;
    }
  }
  return [];
}

function NavigationMenu() {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<{ [key: string]: boolean }>({});
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const roleFilteredMenuItems = getFilteredMenuItems(user?.role);
  const isAdminRole = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'administrateur';
  const menuAccess = user?.menuAccess || [];
  // Priorité aux boutons explicitement attribués par l'administrateur : dès qu'un
  // utilisateur (quel que soit son rôle, y compris directeur) possède des
  // `menuAccess`, on filtre à partir du MENU COMPLET et non du menu pré-restreint
  // par rôle — ainsi n'importe quel bouton peut être attribué à n'importe qui.
  // Le responsable Call Center a un menu FIXE (Accueil / Tableau de bord Call
  // Center / Call Center) : ses entrées n'existent pas dans le menu complet, un
  // filtrage par `menuAccess` le viderait entièrement.
  const isMenuFixeParRole = isAdminRole || user?.role === 'responsable_call_center';
  const filteredMenuItems = isMenuFixeParRole
    ? roleFilteredMenuItems
    : menuAccess.length > 0
      ? filterByAccess(menuItems, menuAccess)
      : roleFilteredMenuItems;

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(m => !m);
    } else {
      setOpen(o => !o);
    }
  };

  const handleExpand = (title: string) => {
    setExpandedItems((prev) => {
      const opening = !prev[title];

      // Accordéon : on ferme les menus VOISINS, mais on garde ouverts les
      // PARENTS de l'élément visé. Sans cela, ouvrir un sous-menu imbriqué
      // (ex. « Paramétrage » dans « Espace Administrateur ») refermait son
      // propre parent et le sous-menu disparaissait aussitôt.
      const newState: { [key: string]: boolean } = {};
      for (const ancetre of trouverAncetres(menuItems, title)) {
        newState[ancetre] = true;
      }
      newState[title] = opening;

      // Si on ouvre "Gestion Comptabilité", ouvrir automatiquement ses sous-sections
      if (title === 'Gestion Comptabilité' && opening) {
        newState['Assurance'] = true;
        newState['Fournisseur'] = true;
        newState['Prestation'] = true;
        newState['Mouvement'] = true;
      }

      return newState;
    });
  };

  const handleNavigate = (path: string) => {
    if (isMobile) setMobileOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleProfileClick = () => {
    handleUserMenuClose();
    navigate('/profils');
  };

  const handleLogoutClick = () => {
    handleUserMenuClose();
    handleLogout();
  };

  // Composant pour les onglets IMAGE 1 (C, M, CO, T, F)
  const TabsImage1 = () => {
    const allTabs = [
      { label: 'C',  path: '/composants/categories', bg: '#3b82f6', color: '#fff' },
      { label: 'M',  path: '/composants/marques',    bg: '#10b981', color: '#fff' },
      { label: 'CO', path: '/composants/couleurs',   bg: '#f59e0b', color: '#fff' },
      { label: 'T',  path: '/composants/tailles',    bg: '#8b5cf6', color: '#fff' },
      { label: 'F',  path: '/composants/familles',   bg: '#ec4899', color: '#fff' },
    ];
    // Respecte les accès cochés par l'admin (menuAccess). Admin ou aucune
    // restriction = tout visible ; sinon on ne garde que les onglets autorisés.
    const tabs = (isAdminRole || menuAccess.length === 0)
      ? allTabs
      : allTabs.filter(t => menuAccess.includes(t.path));
    if (tabs.length === 0) return null;

    return (
      <div style={{ paddingLeft: open ? 20 : 8, paddingRight: open ? 16 : 8, paddingTop: 8, paddingBottom: 8 }}>
        {open && (
          <div style={{ display: 'flex', gap: 1 }}>
            {tabs.map(tab => (
              <div
                key={tab.path}
                onClick={() => handleNavigate(tab.path)}
                style={{
                  flex: 1,
                  backgroundColor: tab.bg,
                  color: tab.color,
                  textAlign: 'center',
                  padding: '6px 0',
                  borderRadius: 3,
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  border: '1px solid #fff',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {tab.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Composant pour les onglets IMAGE 2 (T, M, D)
  const TabsImage2 = () => {
    const allTabs = [
      { label: 'T', path: '/composants/types-verre', bg: '#06b6d4', color: '#fff' },
      { label: 'M', path: '/composants/matieres',    bg: '#f97316', color: '#fff' },
      { label: 'D', path: '/composants/diametres',   bg: '#14b8a6', color: '#fff' },
    ];
    const tabs = (isAdminRole || menuAccess.length === 0)
      ? allTabs
      : allTabs.filter(t => menuAccess.includes(t.path));
    if (tabs.length === 0) return null;

    return (
      <div style={{ paddingLeft: open ? 20 : 8, paddingRight: open ? 16 : 8, paddingTop: 8, paddingBottom: 8 }}>
        {open && (
          <div style={{ display: 'flex', gap: 1 }}>
            {tabs.map(tab => (
              <div
                key={tab.path}
                onClick={() => handleNavigate(tab.path)}
                style={{
                  flex: 1,
                  backgroundColor: tab.bg,
                  color: tab.color,
                  textAlign: 'center',
                  padding: '6px 0',
                  borderRadius: 3,
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  border: '1px solid #fff',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {tab.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Composant pour les boutons État de Stock Disponible
  const StockButtons = () => {
    const MAGASINS = getMagasins().map(magasin => magasin.id);

    const handlePrintMontures = () => {
      const allMontures: any[] = [];
      MAGASINS.forEach(magasinId => {
        const monturesKey = `leclaire_montures_${magasinId}`;
        const monturesData = JSON.parse(localStorage.getItem(monturesKey) || '[]');
        monturesData.forEach((monture: any) => {
          if (monture.quantite > 0 || monture.stock > 0) {
            allMontures.push({
              reference: monture.reference || monture.code || '',
              designation: monture.designation || monture.nom || monture.modele || '',
              quantite: monture.quantite || monture.stock || 0,
              magasin: `${TENANT.nom} ${magasinId.toUpperCase()}`,
              prixVente: monture.prixVente || monture.prix || 0,
            });
          }
        });
      });

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const content = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>État de Stock - Montures</title>
            <style>
              @page { margin: 0; size: A4; }
              @media screen { body { visibility: hidden; } }
              @media print { body { visibility: visible; } }
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { text-align: center; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { background-color: #f3f4f6; font-weight: 600; }
              .total { font-weight: bold; background-color: #f9fafb; }
            </style>
          </head>
          <body>
            <h1>État de Stock Disponible - MONTURES</h1>
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Magasin</th>
                  <th>Quantité</th>
                  <th>Prix de Vente</th>
                </tr>
              </thead>
              <tbody>
                ${allMontures.map(m => `
                  <tr>
                    <td>${m.reference}</td>
                    <td>${m.designation}</td>
                    <td>${m.magasin}</td>
                    <td>${m.quantite}</td>
                    <td>${m.prixVente ? m.prixVente.toLocaleString('fr-FR') + ' F CFA' : '-'}</td>
                  </tr>
                `).join('')}
                <tr class="total">
                  <td colspan="3">Total</td>
                  <td>${allMontures.reduce((sum, m) => sum + m.quantite, 0)}</td>
                  <td>-</td>
                </tr>
              </tbody>
            </table>
            <script>
              window.onload = function() {
                window.print();
                window.onafterprint = function() {
                  window.close();
                };
              };
            </script>
          </body>
        </html>
      `;
      printWindow.document.write(content);
      printWindow.document.close();
    };

    const handleExportMonturesExcel = () => {
      const allMontures: any[] = [];
      MAGASINS.forEach(magasinId => {
        const monturesKey = `leclaire_montures_${magasinId}`;
        const monturesData = JSON.parse(localStorage.getItem(monturesKey) || '[]');
        monturesData.forEach((monture: any) => {
          if (monture.quantite > 0 || monture.stock > 0) {
            allMontures.push({
              reference: monture.reference || monture.code || '',
              designation: monture.designation || monture.nom || monture.modele || '',
              quantite: monture.quantite || monture.stock || 0,
              magasin: `${TENANT.nom} ${magasinId.toUpperCase()}`,
              prixVente: monture.prixVente || monture.prix || 0,
            });
          }
        });
      });

      let csv = 'Référence,Désignation,Magasin,Quantité,Prix de Vente\n';
      allMontures.forEach(m => {
        csv += `"${m.reference}","${m.designation}","${m.magasin}",${m.quantite},${m.prixVente || 0}\n`;
      });
      csv += `"","Total","",${allMontures.reduce((sum, m) => sum + m.quantite, 0)},\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `etat_stock_montures_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const handlePrintAccessoires = () => {
      const allAccessoires: any[] = [];
      MAGASINS.forEach(magasinId => {
        const accessoiresKey = `leclaire_accessoires_${magasinId}`;
        const accessoiresData = JSON.parse(localStorage.getItem(accessoiresKey) || '[]');
        accessoiresData.forEach((accessoire: any) => {
          if (accessoire.quantite > 0 || accessoire.stock > 0) {
            allAccessoires.push({
              reference: accessoire.reference || accessoire.code || '',
              designation: accessoire.designation || accessoire.nom || '',
              quantite: accessoire.quantite || accessoire.stock || 0,
              magasin: `${TENANT.nom} ${magasinId.toUpperCase()}`,
              prixVente: accessoire.prixVente || accessoire.prix || 0,
            });
          }
        });
      });

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const content = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>État de Stock - Accessoires</title>
            <style>
              @page { margin: 0; size: A4; }
              @media screen { body { visibility: hidden; } }
              @media print { body { visibility: visible; } }
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { text-align: center; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { background-color: #f3f4f6; font-weight: 600; }
              .total { font-weight: bold; background-color: #f9fafb; }
            </style>
          </head>
          <body>
            <h1>État de Stock Disponible - ACCESSOIRES</h1>
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Magasin</th>
                  <th>Quantité</th>
                  <th>Prix de Vente</th>
                </tr>
              </thead>
              <tbody>
                ${allAccessoires.map(a => `
                  <tr>
                    <td>${a.reference}</td>
                    <td>${a.designation}</td>
                    <td>${a.magasin}</td>
                    <td>${a.quantite}</td>
                    <td>${a.prixVente ? a.prixVente.toLocaleString('fr-FR') + ' F CFA' : '-'}</td>
                  </tr>
                `).join('')}
                <tr class="total">
                  <td colspan="3">Total</td>
                  <td>${allAccessoires.reduce((sum, a) => sum + a.quantite, 0)}</td>
                  <td>-</td>
                </tr>
              </tbody>
            </table>
            <script>
              window.onload = function() {
                window.print();
                window.onafterprint = function() {
                  window.close();
                };
              };
            </script>
          </body>
        </html>
      `;
      printWindow.document.write(content);
      printWindow.document.close();
    };

    const handleExportAccessoiresExcel = () => {
      const allAccessoires: any[] = [];
      MAGASINS.forEach(magasinId => {
        const accessoiresKey = `leclaire_accessoires_${magasinId}`;
        const accessoiresData = JSON.parse(localStorage.getItem(accessoiresKey) || '[]');
        accessoiresData.forEach((accessoire: any) => {
          if (accessoire.quantite > 0 || accessoire.stock > 0) {
            allAccessoires.push({
              reference: accessoire.reference || accessoire.code || '',
              designation: accessoire.designation || accessoire.nom || '',
              quantite: accessoire.quantite || accessoire.stock || 0,
              magasin: `${TENANT.nom} ${magasinId.toUpperCase()}`,
              prixVente: accessoire.prixVente || accessoire.prix || 0,
            });
          }
        });
      });

      let csv = 'Référence,Désignation,Magasin,Quantité,Prix de Vente\n';
      allAccessoires.forEach(a => {
        csv += `"${a.reference}","${a.designation}","${a.magasin}",${a.quantite},${a.prixVente || 0}\n`;
      });
      csv += `"","Total","",${allAccessoires.reduce((sum, a) => sum + a.quantite, 0)},\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `etat_stock_accessoires_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div style={{ paddingLeft: open ? 12 : 8, paddingRight: open ? 12 : 8, paddingTop: 8, paddingBottom: 8 }}>
        {open && (
          <div style={{ backgroundColor: '#f5deb3', padding: '10px', borderRadius: '6px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
              État de Stock Disponible
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {/* MONTURES */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '9px', fontWeight: '600', marginBottom: '4px', color: '#6b7280' }}>
                  MONTURES
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={handlePrintMontures}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: '#0369a1',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    🖨️
                  </button>
                  <button
                    onClick={handleExportMonturesExcel}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    📊
                  </button>
                </div>
              </div>

              {/* ACCESSOIRES */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '9px', fontWeight: '600', marginBottom: '4px', color: '#6b7280' }}>
                  ACCESSOIRES
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={handlePrintAccessoires}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: '#0369a1',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    🖨️
                  </button>
                  <button
                    onClick={handleExportAccessoiresExcel}
                    style={{
                      flex: 1,
                      padding: '6px',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    📊
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMenuItem = (item: MenuItemType, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.title];
    const isActive = item.path === location.pathname;

    // Rendu spécial pour les onglets
    if (item.title === '__TABS_1__') {
      return <TabsImage1 key={item.title} />;
    }
    if (item.title === '__TABS_2__') {
      return <TabsImage2 key={item.title} />;
    }
    if (item.title === '__STOCK_BUTTONS__') {
      return <StockButtons key={item.title} />;
    }

    // Déterminer si c'est un sous-onglet de comptabilité
    const isComptaSousOnglet = ['Assurance', 'Fournisseur', 'Prestation', 'Mouvement'].includes(item.title);

    // Fond visible uniquement pour les sous-onglets de comptabilité et le niveau principal
    let bgColor;
    if (isComptaSousOnglet) {
      bgColor = '#000';
    } else if (level === 0) {
      bgColor = isActive ? '#d0d0d0' : '#f5f5f5';
    } else {
      bgColor = isActive ? '#d0d0d0' : 'transparent';
    }

    const textColor = isComptaSousOnglet ? '#fff' : '#000';

    return (
      <div key={item.title}>
        <ListItem disablePadding sx={{ display: 'block', mb: 0.3 }}>
          <ListItemButton
            onClick={() => {
              if (hasChildren) {
                handleExpand(item.title);
              } else if (item.path) {
                handleNavigate(item.path);
              }
            }}
            sx={{
              minHeight: 32,
              justifyContent: open ? 'initial' : 'center',
              px: 1.5,
              py: 0.5,
              pl: 1.5 + level * 1.5,
              backgroundColor: bgColor,
              color: textColor,
              borderRadius: '4px',
              mx: 0.5,
              '&:hover': {
                backgroundColor: isComptaSousOnglet ? '#333' : '#d0d0d0',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: open ? 1.5 : 'auto',
                justifyContent: 'center',
                color: textColor,
                fontSize: '1.2rem',
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.title}
              sx={{ opacity: open ? 1 : 0, color: textColor }}
              primaryTypographyProps={{
                fontSize: level > 0 ? '0.8rem' : '0.85rem',
              }}
            />
          </ListItemButton>
        </ListItem>
        {hasChildren && (
          <Collapse in={isExpanded && open} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ py: 0 }}>
              {item.children!.map((child) => renderMenuItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </div>
    );
  };

  const drawerContent = (
    <>
      {!isMobile && <Toolbar />}
      {isMobile && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid #eee' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: '0.05em' }}>{TENANT.nomComplet}</Typography>
          <IconButton size="small" onClick={() => setMobileOpen(false)}><ChevronLeft fontSize="small" /></IconButton>
        </Box>
      )}
      <Box sx={{ overflow: 'auto', py: 0.5 }}>
        <List sx={{ py: 0 }}>
          {filteredMenuItems.map((item) => renderMenuItem(item))}
        </List>
      </Box>
    </>
  );

  return (
    <>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, backgroundColor: '#000', color: '#fff' }}>
        <Toolbar variant="dense" sx={{ minHeight: 40, px: 1.5 }}>
          <IconButton
            aria-label="toggle drawer"
            onClick={handleDrawerToggle}
            edge="start"
            size="small"
            sx={{ mr: 1.5, color: '#fff' }}
          >
            {isMobile
              ? <MenuIcon fontSize="small" />
              : open ? <ChevronLeft fontSize="small" /> : <MenuIcon fontSize="small" />
            }
          </IconButton>
          <SeasonLogo size={28} />
          <Typography variant="body1" noWrap component="div" sx={{ fontWeight: 700, fontSize: { xs: '0.8rem', sm: '0.875rem' }, letterSpacing: '0.05em', mr: 1.5, flexShrink: 0, color: '#fff' }}>
            {TENANT.nomComplet}
          </Typography>

          {/* Shortcut bar : masqué sur mobile, affiché dans toolbar étendue */}
          {!isMobile && <ShortcutBar />}
          {isMobile && (
            <>
              <Box sx={{ flexGrow: 1 }} />
              <IconButton size="small" onClick={() => setShortcutsOpen(s => !s)} sx={{ color: '#fff', mr: 0.5 }} title="Raccourcis">
                <Search fontSize="small" />
              </IconButton>
            </>
          )}

          <Box
            onClick={handleUserMenuOpen}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              cursor: 'pointer', padding: '4px 8px', borderRadius: '4px',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
            }}
          >
            {!isMobile && (
              <Typography variant="caption" sx={{ opacity: 0.85, flexShrink: 0, color: '#fff' }}>
                {user ? `${user.prenom} ${user.nom}` : ''}
              </Typography>
            )}
            <Person fontSize="small" sx={{ color: '#fff' }} />
          </Box>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={handleProfileClick}>
              <ListItemIcon><Person fontSize="small" /></ListItemIcon>
              <ListItemText>Mon Profil</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleLogoutClick}>
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
              <ListItemText>Déconnexion</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>

        {/* Barre raccourcis mobile dépliable */}
        {isMobile && shortcutsOpen && (
          <Box sx={{ backgroundColor: '#111', overflowX: 'auto', px: 2, py: 1, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <Box sx={{ display: 'flex', gap: 2, minWidth: 'max-content', alignItems: 'center' }}>
              <ShortcutBar />
            </Box>
          </Box>
        )}
      </AppBar>

      {/* Drawer */}
      <Box component="nav" sx={{ width: { md: open ? drawerWidth : 65 }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              '& .MuiDrawer-paper': {
                width: drawerWidth,
                boxSizing: 'border-box',
                backgroundColor: '#fff',
              },
            }}
          >
            {drawerContent}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            open={open}
            sx={{
              width: open ? drawerWidth : 65,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: open ? drawerWidth : 65,
                boxSizing: 'border-box',
                transition: (theme) =>
                  theme.transitions.create('width', {
                    easing: theme.transitions.easing.sharp,
                    duration: theme.transitions.duration.enteringScreen,
                  }),
                overflowX: 'hidden',
                backgroundColor: '#fff',
              },
            }}
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>
    </>
  );
}

function MainLayoutContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Attendre la fin de la vérification de session avant de rediriger
    if (isLoading) return;

    // Vérifier l'authentification
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    // Rediriger les conseillers vers leur magasin (une seule fois)
    const magasinDest = user?.magasinActuel || user?.magasinIds?.[0];
    if ((user?.role === 'conseillere' || user?.role === 'employee' || user?.role === 'caissier') && magasinDest) {
      if (!location.pathname.includes('/magasin/') && !hasRedirected.current) {
        hasRedirected.current = true;
        navigate(`/magasin/${magasinDest}/dashboard`, { replace: true });
      }
    }
  }, [isLoading, isAuthenticated, user, location.pathname, navigate]);

  // Attendre la fin de la vérification de session.
  // On affiche un écran d'attente PLUTÔT QUE `null` : ces deux états sont censés
  // être fugaces, mais s'ils se bloquent (Supabase injoignable au démarrage) un
  // `null` ici vide toute l'application sans le moindre message — un écran blanc
  // indébogable. Un fallback visible garantit qu'il reste toujours quelque chose
  // à l'écran.
  if (isLoading || !isAuthenticated) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#d6e4ea',
          color: '#1a6f8c',
          fontSize: 14,
        }}
      >
        Chargement…
      </Box>
    );
  }

  // Empêcher les conseillers d'accéder à MainLayout
  if ((user?.role === 'conseillere' || user?.role === 'employee' || user?.role === 'caissier')) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <style>{`
        @keyframes pageFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .page-transition {
          animation: pageFadeIn 0.15s ease-out both;
          will-change: opacity, transform;
        }
      `}</style>
      <NavigationMenu />
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 1, sm: 2, md: 3 }, maxWidth: '100vw', overflowX: { xs: 'auto', md: 'hidden' }, minWidth: 0 }}>
        <Toolbar sx={{ minHeight: { xs: 40, md: 40 } }} />
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </Box>
      <SessionIndicator />
    </Box>
  );
}

export function MainLayout() {
  return <MainLayoutContent />;
}
