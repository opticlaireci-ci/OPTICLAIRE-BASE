/**
 * Catalogue central de TOUS les boutons / menus de l'application.
 *
 * Sert au panneau administrateur pour cocher, par utilisateur, les accès
 * autorisés (champ `menuAccess` du profil Firestore `user_magasins`).
 *
 * `key` est un identifiant STABLE et indépendant du magasin :
 *  - pour les menus « admin » (MainLayout) : la clé = le chemin de la route (ex: `/utilisateurs`)
 *  - pour les menus « magasin » (MagasinLayout) : la clé = `magasin:<sous-chemin>`
 *    (ex: `magasin:commercial/vente-facture`) car le chemin réel contient l'id du magasin.
 */

export interface AppButton {
  key: string;
  label: string;
}

export interface AppButtonGroup {
  group: string;
  items: AppButton[];
}

export const APP_BUTTON_GROUPS: AppButtonGroup[] = [
  {
    group: 'Magasin — Général',
    items: [
      { key: 'magasin:dashboard', label: 'Tableau de Bord' },
      { key: 'magasin:mouvements-caisse', label: 'Mouvements Entrées/Sorties' },
    ],
  },
  {
    group: 'Magasin — Gestion Commercial',
    items: [
      { key: 'magasin:commercial/devis-proforma', label: 'Devis/Proforma' },
      { key: 'magasin:commercial/vente-flash', label: 'Vente Flash' },
      { key: 'magasin:commercial/vente-facture', label: 'Vente/Facture' },
      { key: 'magasin:commercial/fiche-montage', label: 'Fiche de Montage' },
    ],
  },
  {
    group: 'Magasin — Gestion Clientèle',
    items: [
      { key: 'magasin:clientele/clients', label: 'Base de Données Client' },
      { key: 'magasin:clientele/rdv-retrait', label: 'RDV Retrait' },
      { key: 'magasin:clientele/rdv-enligne', label: 'RDV en Ligne' },
      { key: 'magasin:clientele/call-center', label: 'Call Center' },
    ],
  },
  {
    group: 'Magasin — Gestion de Stock',
    items: [
      { key: 'magasin:stocks/etat-stock', label: 'État de Stock' },
      { key: 'magasin:stocks/bon-distribution', label: 'Bon de Distribution' },
      { key: 'magasin:stocks/bon-transfert', label: 'Bon de Transfert' },
      { key: 'magasin:stocks/bon-retour', label: 'Bon de Retour' },
    ],
  },
  {
    group: 'Admin — Espace Administrateur',
    items: [
      { key: '/espace-administrateur', label: 'Accès Magasins' },
      { key: '/gestion-magasins', label: 'Ajouter/Modifier Magasins' },
      { key: '/rdv-retrait', label: 'RDV Retrait' },
      { key: '/rdv-en-ligne', label: 'RDV En Ligne' },
      { key: '/geolocalisation', label: 'Géolocalisation' },
      { key: '/clients', label: 'Base de Données Client' },
      { key: '/utilisateurs', label: 'Gestion Utilisateurs' },
      { key: '/profils', label: 'Gestion Profils' },
      { key: '/synchronisation', label: 'Synchronisation' },
      { key: '/parametrage/configuration', label: 'Paramétrage · Configuration' },
      { key: '/parametrage/condition-commerciale', label: 'Paramétrage · Condition Commerciale' },
      { key: '/parametrage/message-sms', label: 'Paramétrage · Message SMS' },
    ],
  },
  {
    group: 'Admin — Actions Espace Administrateur',
    items: [
      { key: 'action:personnaliser-accueil', label: "Personnaliser l'accueil" },
      { key: 'action:gerer-magasins', label: 'Gérer les Magasins' },
      { key: 'action:reinitialiser-donnees', label: 'Réinitialiser les données' },
    ],
  },
  {
    group: 'Admin — Gestion Comptabilité',
    items: [
      { key: '/comptabilite/assurance/factures', label: 'Facture Assurance' },
      { key: '/comptabilite/assurance/releves', label: 'Relevé Assurance' },
      { key: '/comptabilite/assurance/reglements', label: 'Règlement Assurance' },
      { key: '/comptabilite/fournisseur/releve-commande', label: 'Relevé de Commande' },
      { key: '/comptabilite/fournisseur/reglement-verrier', label: 'Règlement Verrier' },
      { key: '/comptabilite/fournisseur/reglement', label: 'Règlement Fournisseur' },
      { key: '/comptabilite/prestation', label: 'Prestations' },
      { key: '/comptabilite/mouvement', label: 'Mouvements Entrée/Sortie' },
      { key: '/comptabilite/recap-hebdomadaire', label: 'Récap Hebdomadaire' },
      { key: '/mouvements-caisse-global', label: 'Mouvements Caisse Global' },
    ],
  },
  {
    group: 'Admin — Gestion Composants',
    items: [
      { key: '/composants/montures', label: 'Monture' },
      { key: '/composants/accessoires', label: 'Accessoires' },
      { key: '/composants/services', label: 'Service' },
      { key: '/composants/verres', label: 'Verre' },
      { key: '/composants/traitements', label: 'Traitement' },
      { key: '/composants/categories', label: 'Catégorie' },
      { key: '/composants/marques', label: 'Marque' },
      { key: '/composants/couleurs', label: 'Couleur' },
      { key: '/composants/tailles', label: 'Taille' },
      { key: '/composants/familles', label: 'Famille' },
      { key: '/composants/types-verre', label: 'Type de Verre' },
      { key: '/composants/matieres', label: 'Matière' },
      { key: '/composants/diametres', label: 'Diamètre' },
    ],
  },
  {
    group: 'Admin — Gestion Stocks',
    items: [
      { key: '/stocks/bon-commande', label: 'Bon de Commande' },
      { key: '/stocks/bon-livraison', label: 'Bon de Livraison' },
      { key: '/stocks/bon-distribution', label: 'Bon de Distribution' },
      { key: '/stocks/bon-transfert', label: 'Bon de Transfert' },
      { key: '/stocks/bon-retour', label: 'Bon de Retour' },
      { key: '/stocks/bon-peremption', label: 'Bon de Péremption-Casse' },
      { key: '/stocks/inventaire', label: 'Inventaire Montures' },
      { key: '/stocks/inventaire-lentilles', label: 'Inventaire Lentilles' },
      { key: '/stocks/etat-stock', label: 'État de Stock' },
    ],
  },
  {
    group: 'Admin — Gestion des Acteurs',
    items: [
      { key: '/acteurs/fournisseurs', label: 'Fournisseur' },
      { key: '/acteurs/assurances', label: 'Assurance' },
      { key: '/acteurs/prestataires', label: 'Prestataire' },
      { key: '/acteurs/ophtalmologues', label: 'Ophtalmologue' },
      { key: '/acteurs/cabinets', label: 'Cabinet Ophtalmologue' },
      { key: '/acteurs/modes-payement', label: 'Mode de Paiement' },
      { key: '/acteurs/comptes-banque', label: 'Compte Banque' },
    ],
  },
  {
    group: 'Admin — Autres',
    items: [
      { key: '/', label: 'Tableau de Bord' },
      { key: '/recherche', label: 'Recherche Monture et Accessoire' },
      { key: '/atelier', label: 'Atelier' },
      { key: '/visualisation', label: 'Visualisation PDF et Excel' },
      { key: '/historique', label: 'Historique' },
    ],
  },
];

/** Toutes les clés connues, à plat. */
export const ALL_APP_BUTTON_KEYS: string[] = APP_BUTTON_GROUPS.flatMap(g => g.items.map(i => i.key));

/**
 * Convertit un chemin de menu en clé de catalogue.
 * - `/magasin/abobo/commercial/vente-facture` → `magasin:commercial/vente-facture`
 * - `/utilisateurs` → `/utilisateurs`
 */
export function pathToButtonKey(path: string | undefined): string | null {
  if (!path) return null;
  const m = path.match(/^\/magasin\/[^/]+\/(.+)$/);
  if (m) return `magasin:${m[1]}`;
  // dashboard magasin : /magasin/<id>/dashboard déjà géré par la regex ci-dessus
  return path;
}
