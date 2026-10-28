/**
 * DROITS D'ACTION (modifier / supprimer)
 *
 * Ces droits sont stockés dans le même tableau `menuAccess` que les accès aux
 * boutons (déjà persisté de bout en bout par l'edge function), via des clés
 * "sentinelles" préfixées `action:` qui n'entrent jamais en conflit avec les
 * vraies clés de boutons (`pathToButtonKey` ne produit jamais `action:*`).
 *
 * Ainsi, aucun changement du backend n'est nécessaire pour donner (ou retirer)
 * à un utilisateur le droit de modifier ou de supprimer des données.
 */

export const ACTION_EDIT_KEY = 'action:edit';
export const ACTION_DELETE_KEY = 'action:delete';
/** Droit d'AJOUT GLOBAL : autorise l'ajout dans TOUS les modules. */
export const ACTION_ADD_KEY = 'action:add';
/** Préfixe des droits d'ajout GRANULAIRES par module : `action:add:<module>`. */
export const ADD_MODULE_PREFIX = 'action:add:';

/** Clé d'un droit d'ajout propre à un module. */
export function addModuleKey(module: string): string {
  return `${ADD_MODULE_PREFIX}${module}`;
}

/**
 * Liste des modules pour lesquels un droit d'ajout distinct peut être accordé.
 * L'id doit correspondre à ce que renvoie `moduleFromPath`.
 */
export const ADD_MODULES: { id: string; label: string }[] = [
  { id: 'general', label: 'Général (caisse, tableau de bord)' },
  { id: 'commercial', label: 'Commercial (ventes, devis, recouvrement)' },
  { id: 'clientele', label: 'Clientèle (clients, RDV)' },
  { id: 'stocks', label: 'Stocks (bons, inventaire)' },
  { id: 'composants', label: 'Composants (montures, verres…)' },
  { id: 'acteurs', label: 'Acteurs (fournisseurs, assurances…)' },
  { id: 'comptabilite', label: 'Comptabilité (factures, règlements)' },
  { id: 'admin', label: 'Administration (magasins, utilisateurs…)' },
];

/**
 * Déduit le module d'ajout à partir du chemin de la route courante.
 * Sert à l'auto-détection dans AddButton (aucun changement d'appel requis).
 */
export function moduleFromPath(pathname: string | undefined): string | undefined {
  if (!pathname) return undefined;
  // Routes magasin : /magasin/<id>/<section>/...
  const mag = pathname.match(/^\/magasin\/[^/]+\/([^/]+)/);
  const seg = mag ? mag[1] : pathname.split('/').filter(Boolean)[0];
  if (!seg) return 'general';
  if (seg === 'commercial') return 'commercial';
  if (seg === 'clientele') return 'clientele';
  if (seg === 'stocks') return 'stocks';
  if (seg === 'composants') return 'composants';
  if (seg === 'acteurs') return 'acteurs';
  if (seg === 'comptabilite') return 'comptabilite';
  if (seg === 'dashboard' || seg === 'mouvements-caisse') return 'general';
  if (seg === 'mouvements-caisse-global') return 'comptabilite';
  // Écrans d'administration
  if ([
    'espace-administrateur', 'gestion-magasins', 'utilisateurs', 'profils',
    'clients', 'rdv-retrait', 'rdv-en-ligne', 'geolocalisation',
    'configurer-sync', 'test-sync', 'parametrage',
  ].includes(seg)) return 'admin';
  return 'general';
}

interface UserLike {
  role?: string;
  menuAccess?: string[];
}

const ADMIN_ROLES = ['super_admin', 'admin', 'administrateur'];

/** Administrateur (seul autorisé à supprimer un règlement d'argent). */
export function estAdministrateur(user: UserLike | null | undefined): boolean {
  return !!user && ADMIN_ROLES.includes(user.role || '');
}

/** Un droit d'action (add global/granulaire, edit ou delete) a-t-il été configuré ? */
function aDesDroitsAction(access: string[]): boolean {
  return (
    access.includes(ACTION_ADD_KEY) ||
    access.includes(ACTION_EDIT_KEY) ||
    access.includes(ACTION_DELETE_KEY) ||
    access.some(k => k.startsWith(ADD_MODULE_PREFIX))
  );
}

/**
 * L'utilisateur peut-il AJOUTER des données ?
 * @param module module concerné (auto-détecté par AddButton). Si omis, on
 *   vérifie le droit global ou l'existence d'au moins un droit granulaire.
 */
export function canAdd(user: UserLike | null | undefined, module?: string): boolean {
  if (!user) return false;
  if (ADMIN_ROLES.includes(user.role || '')) return true;
  const access = user.menuAccess || [];
  // Rétro-compatibilité : aucun droit d'action configuré → comportement historique.
  if (!aDesDroitsAction(access)) return true;
  // Droit global : ajout autorisé partout.
  if (access.includes(ACTION_ADD_KEY)) return true;
  if (module) return access.includes(addModuleKey(module));
  // Contexte inconnu : autorisé s'il possède au moins un droit d'ajout granulaire.
  return access.some(k => k.startsWith(ADD_MODULE_PREFIX));
}

/** L'utilisateur peut-il MODIFIER des données ? */
export function canEdit(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (ADMIN_ROLES.includes(user.role || '')) return true;
  const access = user.menuAccess || [];
  // Rétro-compatibilité : si aucun droit d'action n'a jamais été configuré, historique.
  if (!aDesDroitsAction(access)) return true;
  return access.includes(ACTION_EDIT_KEY);
}

/** L'utilisateur peut-il SUPPRIMER des données ? */
export function canDelete(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (ADMIN_ROLES.includes(user.role || '')) return true;
  const access = user.menuAccess || [];
  if (!aDesDroitsAction(access)) return true;
  return access.includes(ACTION_DELETE_KEY);
}

/*
 * ACCÈS PARTICULIERS DES CONSEILLÈRES ET OPTICIENS
 *
 * Par défaut, une conseillère ou un opticien :
 *  - ne voit pas les ENTRÉES dans « Mouvements Entrées et Sorties » du magasin
 *    (il ne peut qu'y enregistrer des SORTIES) ;
 *  - ne voit pas l'« Activité mensuelle » ni l'« Activité annuelle » du
 *    tableau de bord du magasin.
 * L'administrateur peut rendre chacun de ces accès en cochant la case
 * correspondante dans Gestion des Utilisateurs → Accès aux boutons.
 *
 * Les cases sont rangées dans le même tableau `menuAccess` (préfixe `voir:`),
 * déjà enregistré par le serveur : aucun changement du backend n'est
 * nécessaire. Ces clés ne sont pas des boutons de menu : elles sont mises de
 * côté au chargement du profil (`droitsVoir`) pour ne pas restreindre le menu.
 */
export const VOIR_PREFIX = 'voir:';
export const VOIR_ENTREES_KEY = 'voir:mouvements-entrees';
export const VOIR_ACTIVITE_MENSUELLE_KEY = 'voir:activite-mensuelle';
export const VOIR_ACTIVITE_ANNUELLE_KEY = 'voir:activite-annuelle';

/** Cases proposées à l'administrateur (Gestion des Utilisateurs). */
export const ACCES_CONSEILLERES_OPTICIENS: { key: string; label: string }[] = [
  { key: VOIR_ENTREES_KEY, label: 'Voir les entrées (Mouvements Entrées et Sorties)' },
  { key: VOIR_ACTIVITE_MENSUELLE_KEY, label: "Voir l'activité mensuelle (tableau de bord du magasin)" },
  { key: VOIR_ACTIVITE_ANNUELLE_KEY, label: "Voir l'activité annuelle (tableau de bord du magasin)" },
];

/** Rôles soumis à ces restrictions. Les autres rôles gardent leur affichage habituel. */
export const ROLES_ACCES_RESTREINT = ['conseillere', 'opticien'];

/*
 * DROITS PARTICULIERS (préfixe `droit:`), rangés comme les accès « voir: » :
 * ce ne sont pas des boutons de menu.
 *
 * MODIFIER UN RÈGLEMENT (Détails Vente | Facture → Règlement) : autorisé
 * d'office à l'assistante administrative, aux administrateurs et au super
 * administrateur ; l'administrateur peut le donner à n'importe quel autre
 * utilisateur en cochant la case dans Gestion des Utilisateurs.
 */
export const DROIT_PREFIX = 'droit:';
export const DROIT_MODIFIER_REGLEMENT_KEY = 'droit:modifier-reglement';
/** Rôles qui peuvent modifier un règlement sans case cochée. */
export const ROLES_MODIFIER_REGLEMENT = ['super_admin', 'admin', 'administrateur', 'assistante_admin'];

/** Cases « droits particuliers » proposées pour tout utilisateur. */
export const DROITS_PARTICULIERS: { key: string; label: string; roles: string[] }[] = [
  { key: DROIT_MODIFIER_REGLEMENT_KEY, label: 'Modifier un règlement (Détails Vente | Facture → Règlement)', roles: ROLES_MODIFIER_REGLEMENT },
];

/** Clé d'accès ou de droit particulier (et non bouton de menu). */
export const estCleVoir = (k: string) => typeof k === 'string' && (k.startsWith(VOIR_PREFIX) || k.startsWith(DROIT_PREFIX));
/** Clés de boutons de menu seulement. */
export const sansClesVoir = (access: string[] = []) => access.filter(k => !estCleVoir(k));
/** Accès particuliers seulement. */
export const clesVoir = (access: string[] = []) => access.filter(estCleVoir);

/**
 * L'utilisateur peut-il voir cet élément ? Toujours oui, sauf pour une
 * conseillère ou un opticien dont l'administrateur n'a pas coché la case.
 */
export function peutVoir(user: (UserLike & { droitsVoir?: string[] }) | null | undefined, key: string): boolean {
  if (!user) return false;
  if (!ROLES_ACCES_RESTREINT.includes(user.role || '')) return true;
  const droits = user.droitsVoir ?? clesVoir(user.menuAccess || []);
  return droits.includes(key);
}

/** L'utilisateur peut-il modifier un règlement (montant, mode, compte, détails, date) ? */
export function peutModifierReglement(user: (UserLike & { droitsVoir?: string[] }) | null | undefined): boolean {
  if (!user) return false;
  if (ROLES_MODIFIER_REGLEMENT.includes(user.role || '')) return true;
  const droits = user.droitsVoir ?? clesVoir(user.menuAccess || []);
  return droits.includes(DROIT_MODIFIER_REGLEMENT_KEY);
}

/*
 * COMMANDE DE VERRE (Atelier) : ce que chacun voit (clés `voir:` cochées dans
 * Gestion des Utilisateurs, comme les accès ci-dessus).
 *  - « Passer commande » : les magasins (conseillères, opticiens… tous les
 *    rôles sauf l'assistante administrative) ;
 *  - « Réception commande » (confirmer, verre arrivé) : l'assistante
 *    administrative ;
 *  - cases explicatives (étapes 1-2-3) : personne d'office.
 * Administrateurs et super administrateur : tout. L'administrateur donne une
 * partie à n'importe quel autre utilisateur en cochant sa case.
 */
export const VOIR_CV_PASSER_KEY = 'voir:commande-verre-passer';
export const VOIR_CV_RECEPTION_KEY = 'voir:commande-verre-reception';
export const VOIR_CV_EXPLICATIONS_KEY = 'voir:commande-verre-explications';

/** Cases « Commande de verre » et rôles qui ont l'accès sans case cochée. */
export const ACCES_COMMANDE_VERRE: { key: string; label: string; parRole: (role: string) => boolean }[] = [
  { key: VOIR_CV_PASSER_KEY, label: '« Passer commande » (nouvelle commande de verre)', parRole: r => r !== 'assistante_admin' },
  { key: VOIR_CV_RECEPTION_KEY, label: '« Réception commande » (confirmer la commande, verre arrivé)', parRole: r => r === 'assistante_admin' },
  { key: VOIR_CV_EXPLICATIONS_KEY, label: 'Les cases explicatives en haut (1. Passer commande, 2. Confirmation, 3. Verre arrivé)', parRole: () => false },
];

/** Accès donné par le rôle seul (sans case cochée). */
export function accesCommandeVerreParRole(key: string, role: string | undefined): boolean {
  if (!role) return false;
  if (ADMIN_ROLES.includes(role)) return true;
  return !!ACCES_COMMANDE_VERRE.find(a => a.key === key)?.parRole(role);
}

/** Parties de la commande de verre visibles par l'utilisateur. */
export function accesCommandeVerre(user: (UserLike & { droitsVoir?: string[] }) | null | undefined) {
  const droits = user ? (user.droitsVoir ?? clesVoir(user.menuAccess || [])) : [];
  const a = (key: string) => !!user && (accesCommandeVerreParRole(key, user.role) || droits.includes(key));
  return {
    passer: a(VOIR_CV_PASSER_KEY),
    reception: a(VOIR_CV_RECEPTION_KEY),
    explications: a(VOIR_CV_EXPLICATIONS_KEY),
  };
}

/*
 * ATELIER : autres boutons (Bon Verre, Fournisseur, Montage). D'office :
 * administrateurs, super administrateur et monteur, ainsi que tout compte dont
 * le bouton de menu « Atelier » est coché — sauf l'assistante administrative,
 * qui n'a que la commande de verre. L'administrateur donne chaque bouton à
 * n'importe quel utilisateur en cochant sa case (Gestion des Utilisateurs).
 */
export const VOIR_ATELIER_BON_VERRE_KEY = 'voir:atelier-bon-verre';
export const VOIR_ATELIER_FOURNISSEUR_KEY = 'voir:atelier-fournisseur';
export const VOIR_ATELIER_MONTAGE_KEY = 'voir:atelier-montage';
const ROLES_ATELIER_COMPLET = ['super_admin', 'admin', 'administrateur', 'monteur'];
/** Bouton de menu « Atelier » : donne tout l'Atelier (anciens profils), sauf à l'assistante. */
export const MENU_ATELIER_KEY = '/atelier';

/** Cases « Atelier » (autres boutons) proposées dans Gestion des Utilisateurs. */
export const ACCES_ATELIER: { key: string; label: string }[] = [
  { key: VOIR_ATELIER_BON_VERRE_KEY, label: '« Bon Verre » (bons de commande verre et délais)' },
  { key: VOIR_ATELIER_FOURNISSEUR_KEY, label: '« Fournisseur »' },
  { key: VOIR_ATELIER_MONTAGE_KEY, label: '« Montage » (suivi de montage)' },
];

/** Accès donné par le rôle seul (sans case cochée). */
export function accesAtelierParRole(role: string | undefined): boolean {
  return !!role && ROLES_ATELIER_COMPLET.includes(role);
}

/** Accès donné par le bouton de menu « Atelier » coché (jamais pour l'assistante). */
export function accesAtelierParMenu(role: string | undefined, access: string[] = []): boolean {
  return role !== 'assistante_admin' && access.includes(MENU_ATELIER_KEY);
}

/** Boutons de l'Atelier (hors commande de verre) visibles par l'utilisateur. */
export function accesAtelier(user: (UserLike & { droitsVoir?: string[] }) | null | undefined) {
  const droits = user ? (user.droitsVoir ?? clesVoir(user.menuAccess || [])) : [];
  const toutes = !!user && (accesAtelierParRole(user.role) || accesAtelierParMenu(user.role, user.menuAccess || []));
  const a = (key: string) => toutes || droits.includes(key);
  return {
    bonVerre: a(VOIR_ATELIER_BON_VERRE_KEY),
    fournisseur: a(VOIR_ATELIER_FOURNISSEUR_KEY),
    montage: a(VOIR_ATELIER_MONTAGE_KEY),
  };
}
