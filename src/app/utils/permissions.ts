/**
 * SYSTÈME DE PERMISSIONS - OPTICLAIRE
 *
 * Gestion centralisée des permissions basée sur les rôles utilisateurs
 */

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'employee' | 'caissier' | 'conseillere' | 'responsable_call_center' | 'guest';

export type Permission =
  // Gestion Commerciale
  | 'vente.create'
  | 'vente.read'
  | 'vente.update'
  | 'vente.delete'
  | 'devis.create'
  | 'devis.read'
  | 'devis.update'
  | 'devis.delete'

  // Gestion Clientèle
  | 'client.create'
  | 'client.read'
  | 'client.update'
  | 'client.delete'

  // Gestion Financière
  | 'reglement.create'
  | 'reglement.read'
  | 'reglement.update'
  | 'reglement.delete'
  | 'caisse.access'
  | 'caisse.open'
  | 'caisse.close'
  | 'comptabilite.read'
  | 'comptabilite.manage'

  // Gestion Stock
  | 'stock.read'
  | 'stock.update'
  | 'stock.inventory'
  | 'stock.transfer'

  // Gestion Catalogues
  | 'catalogue.read'
  | 'catalogue.manage'

  // Administration
  | 'user.create'
  | 'user.read'
  | 'user.update'
  | 'user.delete'
  | 'magasin.create'
  | 'magasin.read'
  | 'magasin.update'
  | 'magasin.delete'
  | 'settings.read'
  | 'settings.manage'

  // Rapports
  | 'report.view'
  | 'report.export'
  | 'report.advanced';

/**
 * Mapping des permissions par rôle
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    // Accès total à tout
    'vente.create', 'vente.read', 'vente.update', 'vente.delete',
    'devis.create', 'devis.read', 'devis.update', 'devis.delete',
    'client.create', 'client.read', 'client.update', 'client.delete',
    'reglement.create', 'reglement.read', 'reglement.update', 'reglement.delete',
    'caisse.access', 'caisse.open', 'caisse.close',
    'comptabilite.read', 'comptabilite.manage',
    'stock.read', 'stock.update', 'stock.inventory', 'stock.transfer',
    'catalogue.read', 'catalogue.manage',
    'user.create', 'user.read', 'user.update', 'user.delete',
    'magasin.create', 'magasin.read', 'magasin.update', 'magasin.delete',
    'settings.read', 'settings.manage',
    'report.view', 'report.export', 'report.advanced',
  ],

  admin: [
    // Gestion complète du magasin (sauf création/suppression magasins)
    'vente.create', 'vente.read', 'vente.update', 'vente.delete',
    'devis.create', 'devis.read', 'devis.update', 'devis.delete',
    'client.create', 'client.read', 'client.update', 'client.delete',
    'reglement.create', 'reglement.read', 'reglement.update', 'reglement.delete',
    'caisse.access', 'caisse.open', 'caisse.close',
    'comptabilite.read', 'comptabilite.manage',
    'stock.read', 'stock.update', 'stock.inventory', 'stock.transfer',
    'catalogue.read', 'catalogue.manage',
    'user.create', 'user.read', 'user.update', // Pas de delete
    'magasin.read', // Lecture seule
    'settings.read', 'settings.manage',
    'report.view', 'report.export', 'report.advanced',
  ],

  manager: [
    // Gestion quotidienne + rapports
    'vente.create', 'vente.read', 'vente.update',
    'devis.create', 'devis.read', 'devis.update',
    'client.create', 'client.read', 'client.update',
    'reglement.create', 'reglement.read', 'reglement.update',
    'caisse.access', 'caisse.open', 'caisse.close',
    'comptabilite.read',
    'stock.read', 'stock.update', 'stock.inventory',
    'catalogue.read',
    'user.read',
    'magasin.read',
    'settings.read',
    'report.view', 'report.export',
  ],

  conseillere: [
    'vente.create', 'vente.read',
    'devis.create', 'devis.read',
    'client.create', 'client.read', 'client.update',
    'reglement.create', 'reglement.read',
    'stock.read',
    'catalogue.read',
    'magasin.read',
  ],

  responsable_call_center: [
    // Pilotage du Call Center : lecture seule des clients + rapports/export.
    // Pas de création/modification/suppression du fichier client.
    'client.read',
    'vente.read',
    'report.view', 'report.export',
    'magasin.read',
  ],

  employee: [
    // Vente et gestion clientèle basique
    'vente.create', 'vente.read',
    'devis.create', 'devis.read',
    'client.create', 'client.read', 'client.update',
    'reglement.create', 'reglement.read',
    'stock.read',
    'catalogue.read',
    'report.view',
  ],

  caissier: [
    // Caisse uniquement
    'vente.read',
    'reglement.create', 'reglement.read',
    'caisse.access',
    'client.read',
  ],

  guest: [
    // Lecture seule limitée
    'vente.read',
    'devis.read',
    'client.read',
    'stock.read',
    'catalogue.read',
  ],
};

/**
 * Interface utilisateur avec permissions
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  magasinIds: string[]; // Magasins auxquels l'utilisateur a accès
}

/**
 * Vérifie si un utilisateur a une permission spécifique.
 * Consulte d'abord user.permissions (vérité backend), puis la matrice locale en fallback.
 */
export function hasPermission(user: (User & { permissions?: string[] }) | null, permission: Permission): boolean {
  if (!user) return false;

  if (user.permissions && user.permissions.length > 0) {
    return user.permissions.includes('*') || user.permissions.includes(permission);
  }

  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Vérifie si un utilisateur a TOUTES les permissions spécifiées
 */
export function hasAllPermissions(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false;

  return permissions.every(permission => hasPermission(user, permission));
}

/**
 * Vérifie si un utilisateur a AU MOINS UNE des permissions spécifiées
 */
export function hasAnyPermission(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false;

  return permissions.some(permission => hasPermission(user, permission));
}

/**
 * Vérifie si un utilisateur a accès à un magasin spécifique
 */
export function hasMagasinAccess(user: User | null, magasinId: string): boolean {
  if (!user) return false;

  // Super admin a accès à tous les magasins
  if (user.role === 'super_admin') return true;

  // Autres rôles : vérifier dans la liste des magasins
  return user.magasinIds.includes(magasinId);
}

/**
 * Récupère toutes les permissions d'un rôle
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Vérifie si un rôle est admin (admin ou super_admin)
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Vérifie si un rôle est super admin
 */
export function isSuperAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'super_admin';
}

/**
 * Filtre une liste d'actions en fonction des permissions de l'utilisateur
 */
export function filterActionsByPermissions<T extends { permission: Permission }>(
  user: User | null,
  actions: T[]
): T[] {
  if (!user) return [];

  return actions.filter(action => hasPermission(user, action.permission));
}

/**
 * Exemple de configuration d'actions avec permissions
 */
export interface Action {
  id: string;
  label: string;
  permission: Permission;
  icon?: string;
  onClick: () => void;
}

/**
 * Exemple d'utilisation :
 *
 * const venteActions: Action[] = [
 *   { id: 'create', label: 'Nouvelle Vente', permission: 'vente.create', onClick: handleCreate },
 *   { id: 'delete', label: 'Supprimer', permission: 'vente.delete', onClick: handleDelete },
 * ];
 *
 * const allowedActions = filterActionsByPermissions(currentUser, venteActions);
 */
