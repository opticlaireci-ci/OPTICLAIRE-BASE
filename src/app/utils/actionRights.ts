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
