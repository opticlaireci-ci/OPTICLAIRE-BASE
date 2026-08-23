import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowBack,
  Home,
  Dashboard,
  ShoppingCart,
  People,
  Description,
  Event,
  FlashOn,
  Logout,
  Person,
  CardGiftcard,
  LocalShipping,
  SwapHoriz,
  Undo,
  EventAvailable,
  RequestQuote,
  CalendarMonth,
  Sms,
  Phone,
  Visibility,
  AttachMoney,
  Receipt,
  Build,
  Menu as MenuIcon,
  ExpandMore,
  ExpandLess,
  AccountBalance,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { SessionIndicator } from '../components/SessionIndicator';
import { SeasonLogo } from '../components/SeasonLogo';
import { pathToButtonKey } from '../constants/appButtons';
import { TENANT } from '../config/tenant';

const drawerWidth = 280;

// ── Shortcut badges ──────────────────────────────────────────────────────────
const readLS = <T,>(key: string): T[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

function useLiveShortcutsMagasin(magasinId: string | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(x => x + 1), 5000);
    // Rafraîchissement IMMÉDIAT quand l'opticien consulte la liste des montages
    // (le badge se remet à zéro sans attendre le tick de 5 s).
    const onVus = () => setTick(x => x + 1);
    window.addEventListener('montage-vus-update', onVus);
    return () => { clearInterval(timer); window.removeEventListener('montage-vus-update', onVus); };
  }, []);

  if (!magasinId) return { demandesAttente: 0, venteFlash: 0, distrib: 0, transfert: 0, retour: 0, annivClient: 0, rdvRetrait: 0, rdvEnLigne: 0, montageValide: 0, montagesValidesIds: [] as string[] };

  const todayMD = `${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  const demandesAttente = readLS<any>(`leclaire_demande_devis_${magasinId}`)
    .filter(devis => devis.statut === 'En cours' || devis.statut === 'En attente').length;

  const venteFlash = readLS<any>(`leclaire_vente_flash_${magasinId}`).length;

  const distrib = readLS<any>('leclaire_db_bon-distribution')
    .filter((dist: any) => (dist.statut === 'En attente' || !dist.statut) && dist.magasinDest?.toUpperCase() === magasinId.toUpperCase()).length;

  const transfert = readLS<any>('leclaire_db_bon-transfert')
    .filter((trans: any) => (trans.statut === 'En attente' || !trans.statut) && trans.magasinDest?.toUpperCase() === magasinId.toUpperCase()).length;

  const retour = readLS<any>('leclaire_db_bon-retour')
    .filter((ret: any) => (ret.statut === 'En attente' || !ret.statut) && ret.magasin?.toUpperCase() === magasinId.toUpperCase()).length;

  const clients = readLS<any>(`leclaire_clients_magasin_${magasinId}`);
  const annivClient = clients.filter(client => {
    const jourNaiss = client.jourNaissance || client.dateNaissance || '';
    return jourNaiss.slice(5, 10) === todayMD;
  }).length;

  const rdvRetrait = readLS<any>(`leclaire_ventes_${magasinId}`)
    .filter(vente => (vente.recap?.rdvRetrait || vente.rdvRetrait || '').trim() !== '').length;

  const rdvEnLigne = readLS(`leclaire_rdv_enligne_${magasinId}`).length;

  // Montages validés par l'atelier pour ce magasin — le compteur clignote pour
  // interpeller l'opticien dès qu'un monteur valide une fiche de montage.
  const midU = magasinId.toUpperCase();
  // Montages déjà consultés par l'opticien (accusé local, par appareil) : ils ne
  // font plus clignoter le badge. Cf. FicheMontagePage qui les marque « vus ».
  let montagesVus: string[] = [];
  try { montagesVus = JSON.parse(localStorage.getItem(`montage_vus_${magasinId}`) || '[]'); } catch { montagesVus = []; }
  const vusSet = new Set(montagesVus);
  // Tous les montages VALIDÉS de ce magasin (indépendamment de « vus »).
  const montagesValidesIds = readLS<any>('leclaire_bons_commande_verres')
    .filter((b: any) => b.source === 'fiche-montage' && b.valide
      && ((b.magasinId && b.magasinId.toUpperCase() === midU)
        || b.officine?.toUpperCase().includes(midU)
        || b.magasin?.toUpperCase() === midU))
    .map((b: any) => b.id);
  // Le COMPTEUR = montages validés « à l'instant » = ceux pas encore consultés.
  const montageValide = montagesValidesIds.filter((id: string) => !vusSet.has(id)).length;

  return { demandesAttente, venteFlash, distrib, transfert, retour, annivClient, rdvRetrait, rdvEnLigne, montageValide, montagesValidesIds };
}

/** Marque tous les montages validés de ce magasin comme « vus » → arrête le clignotement. */
function marquerMontagesVus(magasinId: string | undefined, ids: string[]) {
  if (!magasinId || !ids.length) return;
  const key = `montage_vus_${magasinId}`;
  let existing: string[] = [];
  try { existing = JSON.parse(localStorage.getItem(key) || '[]'); } catch { existing = []; }
  const merged = Array.from(new Set([...existing, ...ids]));
  if (merged.length !== existing.length) {
    localStorage.setItem(key, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('montage-vus-update'));
  }
}

function ShortcutBadge({ count, icon, label, onClick, blink }: { count: number; icon: React.ReactNode; label: string; onClick?: () => void; blink?: boolean }) {
  const clignote = blink && count > 0;
  return (
    <div
      title={label}
      onClick={onClick}
      className={clignote ? 'montage-blink' : undefined}
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

function ShortcutBarMagasin({ magasinId }: { magasinId: string | undefined }) {
  const compteurs = useLiveShortcutsMagasin(magasinId);
  const navigate = useNavigate();

  const handleSmsClick = () => {
    navigate('/parametrage/message-sms');
  };

  const handleBadgeClick = (path: string) => {
    navigate(path);
  };

  const badges = [
    {
      icon: <CardGiftcard sx={{ fontSize: 22, color: '#fff', backgroundColor: '#eab308', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.annivClient,
      label: 'Anniversaire client',
      path: `/magasin/${magasinId}/clientele/clients`
    },
    {
      icon: <LocalShipping sx={{ fontSize: 22, color: '#fff', backgroundColor: '#16a34a', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.distrib,
      label: 'Distribution en attente',
      path: `/magasin/${magasinId}/stocks/bon-distribution`
    },
    {
      icon: <SwapHoriz sx={{ fontSize: 22, color: '#fff', backgroundColor: '#0ea5e9', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.transfert,
      label: 'Transfert en attente',
      path: `/magasin/${magasinId}/stocks/bon-transfert`
    },
    {
      icon: <Undo sx={{ fontSize: 22, color: '#fff', backgroundColor: '#ef4444', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.retour,
      label: 'Retour en attente',
      path: `/magasin/${magasinId}/stocks/bon-retour`
    },
    {
      icon: <EventAvailable sx={{ fontSize: 22, color: '#fff', backgroundColor: '#f97316', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.rdvRetrait,
      label: 'RDV retrait',
      path: `/magasin/${magasinId}/clientele/rdv-retrait`
    },
    {
      icon: <Event sx={{ fontSize: 22, color: '#fff', backgroundColor: '#8b5cf6', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.rdvEnLigne,
      label: 'RDV en ligne',
      path: `/magasin/${magasinId}/clientele/rdv-enligne`
    },
    {
      icon: <RequestQuote sx={{ fontSize: 22, color: '#fff', backgroundColor: '#14b8a6', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.demandesAttente,
      label: 'Demande devis en attente',
      path: `/magasin/${magasinId}/commercial/demande-devis`
    },
    {
      icon: <FlashOn sx={{ fontSize: 22, color: '#fff', backgroundColor: '#eab308', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.venteFlash,
      label: 'Vente Flash',
      path: `/magasin/${magasinId}/commercial/vente-flash`
    },
    {
      icon: <Build sx={{ fontSize: 22, color: '#fff', backgroundColor: '#16a34a', padding: '4px', borderRadius: '5px' }} />,
      count: compteurs.montageValide,
      label: 'Montage validé par l\'atelier',
      path: `/magasin/${magasinId}/commercial/fiche-montage`,
      blink: true,
      // Au clic : on marque immédiatement les montages validés comme « vus »
      // → le badge cesse de clignoter tant qu'aucune nouvelle validation n'arrive.
      onClickExtra: () => marquerMontagesVus(magasinId, compteurs.montagesValidesIds),
    },
  ];

  const [smsCount] = useState(500);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12, marginLeft: 6, flexShrink: 0 }}>
      <style>{`
        @keyframes montageBlink { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.18); } }
        .montage-blink { animation: montageBlink 0.8s ease-in-out infinite; }
      `}</style>
      <div
        title="Emploi du temps"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 5,
          backgroundColor: '#10b981',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      >
        <CalendarMonth sx={{ fontSize: 16 }} />
        <span style={{ fontSize: 11, fontWeight: 700 }}>Emploi du temps</span>
      </div>

      <div
        title={`${smsCount} SMS disponibles`}
        onClick={handleSmsClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 5,
          backgroundColor: '#8b5cf6',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      >
        <Sms sx={{ fontSize: 16 }} />
        <span style={{ fontSize: 11, fontWeight: 700 }}>{smsCount} SMS</span>
      </div>

      <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.3)', marginLeft: 8, marginRight: 8 }} />

      {badges.map((badge, index) => <ShortcutBadge key={index} {...badge} blink={(badge as any).blink} onClick={() => { (badge as any).onClickExtra?.(); handleBadgeClick(badge.path); }} />)}
    </div>
  );
}

interface MenuItemType {
  title: string;
  icon: JSX.Element;
  path?: string;
  children?: MenuItemType[];
}

/** Filtre récursif des menus magasin selon les clés autorisées (menuAccess). */
function filterByAccess(items: MenuItemType[], allowed: string[]): MenuItemType[] {
  const out: MenuItemType[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      const kids = filterByAccess(item.children, allowed);
      if (kids.some(k => k.path || (k.children && k.children.length > 0))) {
        out.push({ ...item, children: kids });
      }
    } else if (item.path && allowed.includes(pathToButtonKey(item.path) || '')) {
      out.push(item);
    }
  }
  return out;
}

export function MagasinLayout() {
  const { magasinId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, isAuthenticated, isLoading } = useAuth();
  const [expandedItems, setExpandedItems] = useState<{ [key: string]: boolean }>({});
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Garde d'accès par section : empêche l'accès direct par URL à une page dont
  // le bouton n'est pas activé pour l'utilisateur (menuAccess). Sans cela,
  // taper /magasin/abobo/dashboard contournerait le masquage du menu et de
  // l'accueil. L'accueil reste toujours accessible (point d'entrée du magasin).
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    const isAdmin = user.role === 'super_admin' || user.role === 'admin' || user.role === 'administrateur';

    // Fiche de Montage : accès réservé (opticien, directeur, comptable, administrateur),
    // y compris via saisie directe de l'URL — les admins conservent l'accès.
    const rolesFicheMontage = ['super_admin', 'admin', 'administrateur', 'directeur', 'comptable', 'opticien', 'monteur'];
    const accesUtilisateur = user.menuAccess || [];
    if (location.pathname.includes('/commercial/fiche-montage')
      && !rolesFicheMontage.includes(user.role || '')
      && !accesUtilisateur.includes('magasin:commercial/fiche-montage')) {
      navigate(`/magasin/${magasinId}/accueil`, { replace: true });
      return;
    }

    const access = user.menuAccess || [];
    if (isAdmin || access.length === 0) return;
    const path = location.pathname;
    if (path.endsWith('/accueil') || /\/magasin\/[^/]+\/?$/.test(path)) return;
    const key = pathToButtonKey(path);
    if (key && !access.includes(key)) {
      navigate(`/magasin/${magasinId}/accueil`, { replace: true });
    }
  }, [isLoading, isAuthenticated, user, location.pathname, magasinId, navigate]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const magasinNom = `${TENANT.nom} ${magasinId?.toUpperCase() || 'MAGASIN'}`;

  // Accès explicitement attribués par l'administrateur (cases cochées).
  const accesAttribues = user?.menuAccess || [];
  // Fiche de Montage : réservée aux opticiens, monteurs, directeurs, comptables et
  // administrateurs — OU à tout utilisateur dont l'admin a coché la case.
  const ROLES_FICHE_MONTAGE = ['super_admin', 'admin', 'administrateur', 'directeur', 'comptable', 'opticien', 'monteur'];
  const peutVoirFicheMontage = ROLES_FICHE_MONTAGE.includes(user?.role || '')
    || accesAttribues.includes('magasin:commercial/fiche-montage');
  // Atelier : réservé aux monteurs et administrateurs (PAS aux opticiens) — OU si
  // l'admin a coché la case Atelier pour cet utilisateur.
  const ROLES_ATELIER = ['super_admin', 'admin', 'administrateur', 'monteur'];
  const peutVoirAtelier = ROLES_ATELIER.includes(user?.role || '')
    || accesAttribues.includes('/atelier');

  const commercialChildren: MenuItemType[] = [
    { title: 'Devis/Proforma', icon: <Description />, path: `/magasin/${magasinId}/commercial/devis-proforma` },
    { title: 'Vente Flash', icon: <FlashOn />, path: `/magasin/${magasinId}/commercial/vente-flash` },
    { title: 'Vente/Facture', icon: <Receipt />, path: `/magasin/${magasinId}/commercial/vente-facture` },
    ...(peutVoirFicheMontage
      ? [{ title: 'Fiche de Montage', icon: <Visibility />, path: `/magasin/${magasinId}/commercial/fiche-montage` }]
      : []),
  ];

  const menuItems: MenuItemType[] = [
    {
      title: 'Accueil',
      icon: <Home />,
      path: `/magasin/${magasinId}/accueil`,
    },
    {
      title: 'Tableau de Bord',
      icon: <Dashboard />,
      path: `/magasin/${magasinId}/dashboard`,
    },
    {
      title: 'Gestion Commercial',
      icon: <ShoppingCart />,
      children: commercialChildren,
    },
    {
      title: 'Gestion Clientèle',
      icon: <People />,
      children: [
        { title: 'Base de Données Client', icon: <People />, path: `/magasin/${magasinId}/clientele/clients` },
        { title: 'RDV Retrait', icon: <Event />, path: `/magasin/${magasinId}/clientele/rdv-retrait` },
        { title: 'RDV en Ligne', icon: <Event />, path: `/magasin/${magasinId}/clientele/rdv-enligne` },
        { title: 'Call Center', icon: <Phone />, path: `/magasin/${magasinId}/clientele/call-center` },
      ],
    },
    {
      title: 'Gestion de Stock',
      icon: <LocalShipping />,
      children: [
        { title: 'État de Stock', icon: <Visibility />, path: `/magasin/${magasinId}/stocks/etat-stock` },
        { title: 'Bon de Distribution', icon: <LocalShipping />, path: `/magasin/${magasinId}/stocks/bon-distribution` },
        { title: 'Bon de Transfert', icon: <SwapHoriz />, path: `/magasin/${magasinId}/stocks/bon-transfert` },
        { title: 'Bon de Retour', icon: <Undo />, path: `/magasin/${magasinId}/stocks/bon-retour` },
      ],
    },
    {
      title: 'Mouvements Entrées/Sorties',
      icon: <AccountBalance />,
      path: `/magasin/${magasinId}/mouvements-caisse`,
    },
    // Atelier (montage) : réservé aux monteurs (et administrateurs) qui valident
    // les montages — les opticiens n'y ont PAS accès.
    ...(peutVoirAtelier
      ? [{ title: 'Atelier', icon: <Build />, path: '/atelier' }]
      : []),
  ];

  const isAdminRole = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'administrateur';
  const menuAccess = user?.menuAccess || [];
  const visibleMenuItems = (isAdminRole || menuAccess.length === 0)
    ? menuItems
    : filterByAccess(menuItems, menuAccess);

  const handleExpand = (title: string) => {
    // Accordéon : une seule rubrique ouverte à la fois. Ouvrir une rubrique
    // referme automatiquement celle précédemment déroulée.
    setExpandedItems((prev) => (prev[title] ? {} : { [title]: true }));
  };

  const handleNavigate = (path: string) => {
    if (isMobile) setMobileOpen(false);
    navigate(path);
  };

  const handleBack = () => {
    navigate('/');
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

  const renderMenuItem = (item: MenuItemType, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.title];
    const isActive = item.path === location.pathname;

    let bgColor;
    if (level === 0) {
      bgColor = isActive ? '#d0d0d0' : '#f5f5f5';
    } else {
      bgColor = isActive ? '#d0d0d0' : 'transparent';
    }

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
              px: 1.5,
              py: 0.5,
              pl: 1.5 + level * 1.5,
              backgroundColor: bgColor,
              color: '#000',
              borderRadius: '4px',
              mx: 0.5,
              '&:hover': {
                backgroundColor: '#d0d0d0',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: 1.5,
                justifyContent: 'center',
                color: '#000',
                fontSize: '1.2rem',
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.title}
              primaryTypographyProps={{
                fontSize: level > 0 ? '0.8rem' : '0.85rem',
              }}
            />
          </ListItemButton>
        </ListItem>
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, borderBottom: '1px solid #eee' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{magasinNom}</Typography>
          <IconButton size="small" onClick={() => setMobileOpen(false)}><ArrowBack fontSize="small" /></IconButton>
        </Box>
      )}
      <Box sx={{ overflow: 'auto', py: 0.5 }}>
        <List sx={{ py: 0 }}>
          {visibleMenuItems.map((item) => renderMenuItem(item))}
        </List>
      </Box>
    </>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, backgroundColor: '#000', color: '#fff' }}>
        <Toolbar variant="dense" sx={{ minHeight: 40, px: 1.5 }}>
          {isMobile ? (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1, color: '#fff' }}>
              <MenuIcon />
            </IconButton>
          ) : (
            <IconButton edge="start" onClick={handleBack} sx={{ mr: 2, color: '#fff' }}>
              <ArrowBack />
            </IconButton>
          )}
          <SeasonLogo size={28} />
          <Typography variant={isMobile ? 'body2' : 'h6'} noWrap sx={{ fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {isMobile ? magasinId?.toUpperCase() : magasinNom}
          </Typography>

          {/* Shortcuts : desktop uniquement en ligne, mobile en dropdown */}
          {!isMobile && (
            <>
              <Box sx={{ flexGrow: 1 }} />
              <ShortcutBarMagasin magasinId={magasinId} />
            </>
          )}
          {isMobile && (
            <>
              <Box sx={{ flexGrow: 1 }} />
              <IconButton size="small" onClick={() => setShortcutsOpen(s => !s)} sx={{ color: '#fff' }}>
                {shortcutsOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </IconButton>
            </>
          )}

          <Box
            onClick={handleUserMenuOpen}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', ml: 1,
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
            {isMobile && (
              <MenuItem onClick={handleBack}>
                <ListItemIcon><ArrowBack fontSize="small" /></ListItemIcon>
                <ListItemText>Retour Admin</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={handleLogoutClick}>
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
              <ListItemText>Déconnexion</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>

        {/* Barre raccourcis mobile dépliable */}
        {isMobile && shortcutsOpen && (
          <Box sx={{ backgroundColor: '#111', overflowX: 'auto', px: 2, py: 1, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <Box sx={{ display: 'flex', gap: 2, minWidth: 'max-content' }}>
              <ShortcutBarMagasin magasinId={magasinId} />
            </Box>
          </Box>
        )}
      </AppBar>

      {/* Drawer permanent sur desktop, temporaire sur mobile */}
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
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
            sx={{
              width: drawerWidth,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: drawerWidth,
                boxSizing: 'border-box',
                backgroundColor: '#fff',
              },
            }}
            open
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 1, sm: 2, md: 3 },
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          maxWidth: '100vw',
          // Sur mobile : le contenu large défile horizontalement au lieu d'être
          // coupé ; sur desktop on masque le débordement comme avant.
          overflowX: { xs: 'auto', md: 'hidden' },
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 40, md: 40 } }} />
        {/* Espace pour la barre raccourcis dépliée sur mobile */}
        {isMobile && shortcutsOpen && <Box sx={{ height: 52 }} />}
        <div key={location.pathname} style={{ animation: 'pageFadeIn 0.15s ease-out both', willChange: 'opacity, transform' }}>
          <Outlet />
        </div>
      </Box>
      <SessionIndicator />
      <style>{`
        @keyframes pageFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Box>
  );
}
