import { logger } from './logger';
/**
 * Utilitaire pour synchroniser automatiquement les catalogues globaux
 * vers tous les catalogues de magasins
 */

import { getMagasins } from '../constants/magasins';

export type CatalogueType = 'montures' | 'verres' | 'accessoires' | 'traitements' | 'services';

interface SyncOptions {
  type: CatalogueType;
  item: any;
  isUpdate?: boolean;
}

// Clés localStorage pour les catalogues globaux

function sanitizeItemForMagasin(type: CatalogueType, item: any): any {
  const copy = { ...item };
  // Le catalogue magasin est une fiche produit. Le stock réel du magasin vient
  // uniquement des mouvements de stock (distribution/transfert/retour) et de la
  // vue Supabase stock_par_magasin, jamais du stock global catalogue.
  if (type === 'montures' || type === 'accessoires') {
    copy.stock = 0;
    copy.quantite = 0;
    copy.quantiteDisponible = 0;
    copy.stockReel = 0;
  }
  return copy;
}

const GLOBAL_KEYS: Record<CatalogueType, string> = {
  montures: 'leclaire_global_montures',
  verres: 'leclaire_global_verres',
  accessoires: 'leclaire_global_accessoires',
  traitements: 'leclaire_global_traitements',
  services: 'leclaire_global_services',
};

/**
 * Synchronise un élément du catalogue global vers tous les catalogues de magasins
 * @param options - Les options de synchronisation
 */
export function syncCatalogueToMagasins(options: SyncOptions): void {
  const { type, item, isUpdate = false } = options;
  const magasins = getMagasins();

  // Pour chaque magasin, synchroniser l'élément
  magasins.forEach(magasin => {
    const storageKey = `leclaire_db_magasin-${magasin.id}-${type}`;

    try {
      // Charger le catalogue du magasin
      const catalogueMagasin = JSON.parse(localStorage.getItem(storageKey) || '[]');

      if (isUpdate) {
        // Mode modification : mettre à jour si l'élément existe déjà
        const existingIndex = catalogueMagasin.findIndex((i: any) => i.id === item.id);

        if (existingIndex !== -1) {
          catalogueMagasin[existingIndex] = sanitizeItemForMagasin(type, item);
        } else {
          // Si l'élément n'existe pas dans ce magasin, l'ajouter
          catalogueMagasin.push(sanitizeItemForMagasin(type, item));
        }
      } else {
        // Mode création : vérifier que l'élément n'existe pas déjà
        const exists = catalogueMagasin.some((i: any) => i.id === item.id);

        if (!exists) {
          catalogueMagasin.push(sanitizeItemForMagasin(type, item));
        }
      }

      // Sauvegarder le catalogue mis à jour
      localStorage.setItem(storageKey, JSON.stringify(catalogueMagasin));
    } catch (error) {
      logger.error(`Erreur lors de la synchronisation de ${type} vers le magasin ${magasin.id}:`, error);
    }
  });

  // Déclencher un événement pour notifier les autres composants
  window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
    detail: { type, action: isUpdate ? 'update' : 'create', itemId: item.id }
  }));
}

/**
 * Version GROUPÉE de `syncCatalogueToMagasins` pour un import en masse.
 *
 * Appeler la version unitaire dans une boucle est quadratique : elle relit,
 * re-sérialise et réécrit le catalogue ENTIER de chaque magasin à chaque
 * élément. Sur un import de plusieurs centaines de références × 8 magasins,
 * cela représente des milliers d'écritures localStorage — l'onglet se fige et
 * le quota de stockage peut sauter en cours de route, laissant les catalogues
 * à moitié écrits. Ici : une seule lecture + une seule écriture par magasin.
 */
export function syncCataloguesToMagasinsBulk(type: CatalogueType, items: any[]): void {
  if (items.length === 0) return;
  const magasins = getMagasins();

  magasins.forEach(magasin => {
    const storageKey = `leclaire_db_magasin-${magasin.id}-${type}`;

    try {
      const catalogueMagasin = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const connus = new Set(catalogueMagasin.map((i: any) => i.id));
      for (const item of items) {
        if (connus.has(item.id)) continue;
        connus.add(item.id);
        catalogueMagasin.push(sanitizeItemForMagasin(type, item));
      }
      localStorage.setItem(storageKey, JSON.stringify(catalogueMagasin));
    } catch (error) {
      logger.error(`Erreur lors de la synchronisation groupée de ${type} vers le magasin ${magasin.id}:`, error);
    }
  });

  // Un seul événement pour tout le lot : en émettre un par élément
  // provoquerait autant de re-rendus des écrans ouverts.
  window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
    detail: { type, action: 'create', count: items.length }
  }));
}

/**
 * Remplace INTÉGRALEMENT le catalogue de chaque magasin par `items`.
 *
 * À utiliser après un nettoyage du catalogue global (dédoublonnage,
 * normalisation) : les magasins ont reçu les mêmes doublons par propagation,
 * un ajout groupé ne ferait que les laisser en place.
 */
export function remplacerCataloguesMagasins(type: CatalogueType, items: any[]): void {
  const magasins = getMagasins();

  magasins.forEach(magasin => {
    const storageKey = `leclaire_db_magasin-${magasin.id}-${type}`;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(items.map(i => sanitizeItemForMagasin(type, i))),
      );
    } catch (error) {
      logger.error(`Erreur lors du remplacement du catalogue ${type} du magasin ${magasin.id}:`, error);
    }
  });

  window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
    detail: { type, action: 'replace', count: items.length }
  }));
}

/**
 * Supprime un élément du catalogue de tous les magasins
 * @param type - Le type de catalogue
 * @param itemId - L'ID de l'élément à supprimer
 */
export function removeCatalogueFromMagasins(type: CatalogueType, itemId: string): void {
  const magasins = getMagasins();

  magasins.forEach(magasin => {
    const storageKey = `leclaire_db_magasin-${magasin.id}-${type}`;

    try {
      const catalogueMagasin = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const filtered = catalogueMagasin.filter((i: any) => i.id !== itemId);
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch (error) {
      logger.error(`Erreur lors de la suppression de ${type} du magasin ${magasin.id}:`, error);
    }
  });

  // Déclencher un événement pour notifier les autres composants
  window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
    detail: { type, action: 'delete', itemId }
  }));
}

/**
 * Migre tous les catalogues globaux existants vers tous les magasins
 * Cette fonction doit être appelée au démarrage de l'application pour synchroniser
 * les catalogues existants vers les magasins qui n'ont pas encore ces données
 */
export function migrateGlobalCataloguesToMagasins(): void {
  const magasins = getMagasins();
  const catalogueTypes: CatalogueType[] = ['montures', 'verres', 'accessoires', 'traitements', 'services'];

  logger.log('🔄 Début de la migration des catalogues globaux vers les magasins...');

  catalogueTypes.forEach(type => {
    try {
      // Charger le catalogue global
      const globalKey = GLOBAL_KEYS[type];
      const catalogueGlobal = JSON.parse(localStorage.getItem(globalKey) || '[]');

      if (catalogueGlobal.length === 0) {
        logger.log(`⏭️  Catalogue global ${type}: vide, rien à migrer`);
        return;
      }

      logger.log(`📦 Migration de ${catalogueGlobal.length} ${type} vers ${magasins.length} magasins...`);

      // Pour chaque magasin
      magasins.forEach(magasin => {
        const storageKey = `leclaire_db_magasin-${magasin.id}-${type}`;

        try {
          // Charger le catalogue existant du magasin
          const catalogueMagasin = JSON.parse(localStorage.getItem(storageKey) || '[]');

          // Créer un Map des IDs existants dans le magasin pour éviter les doublons
          const existingIds = new Set(catalogueMagasin.map((item: any) => item.id));

          // Ajouter les éléments du catalogue global qui n'existent pas encore dans le magasin
          const newItems = catalogueGlobal.filter((item: any) => !existingIds.has(item.id));

          if (newItems.length > 0) {
            const updatedCatalogue = [...catalogueMagasin, ...newItems.map((item: any) => sanitizeItemForMagasin(type, item))];
            localStorage.setItem(storageKey, JSON.stringify(updatedCatalogue));
            logger.log(`  ✅ ${magasin.label}: ${newItems.length} nouveaux ${type} ajoutés`);
          } else {
            logger.log(`  ✓ ${magasin.label}: ${type} déjà à jour`);
          }
        } catch (error) {
          logger.error(`  ❌ Erreur lors de la migration de ${type} vers ${magasin.label}:`, error);
        }
      });

    } catch (error) {
      logger.error(`❌ Erreur lors de la migration du catalogue global ${type}:`, error);
    }
  });

  logger.log('✅ Migration des catalogues terminée !');

  // Marquer la migration comme effectuée
  localStorage.setItem('leclaire_catalogues_migrated', 'true');

  // Déclencher un événement pour notifier les composants
  window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
    detail: { type: 'all', action: 'migrate' }
  }));
}


export function sanitizeExistingMagasinCataloguesStock(): void {
  const magasins = getMagasins();
  (['montures', 'accessoires'] as CatalogueType[]).forEach(type => {
    magasins.forEach(magasin => {
      const storageKey = `leclaire_db_magasin-${magasin.id}-${type}`;
      try {
        const catalogue = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!Array.isArray(catalogue)) return;
        const sanitized = catalogue.map((item: any) => sanitizeItemForMagasin(type, item));
        if (JSON.stringify(catalogue) !== JSON.stringify(sanitized)) {
          localStorage.setItem(storageKey, JSON.stringify(sanitized));
        }
      } catch (error) {
        logger.error(`Erreur nettoyage stock catalogue ${type} ${magasin.id}:`, error);
      }
    });
  });
}

/**
 * Vérifie si la migration a déjà été effectuée et l'exécute si nécessaire
 */
export function ensureCataloguesMigration(): void {
  sanitizeExistingMagasinCataloguesStock();
  const migrated = localStorage.getItem('leclaire_catalogues_migrated');

  if (!migrated) {
    migrateGlobalCataloguesToMagasins();
  } else {
    logger.log('✓ Catalogues déjà migrés');
  }
}

/**
 * Force une nouvelle migration (utile pour le développement ou en cas de problème)
 */
export function forceCataloguesMigration(): void {
  localStorage.removeItem('leclaire_catalogues_migrated');
  migrateGlobalCataloguesToMagasins();
}

// Exposer les fonctions de migration dans l'objet window pour faciliter le debugging
if (typeof window !== 'undefined') {
  (window as any).leclaireMigration = {
    migrate: migrateGlobalCataloguesToMagasins,
    force: forceCataloguesMigration,
    ensure: ensureCataloguesMigration,
  };
}
