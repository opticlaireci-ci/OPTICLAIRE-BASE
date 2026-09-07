import { logger } from '../utils/logger';
import { TENANT, nomMagasin, tenantConfigDefaut } from '../config/tenant';
/**
 * Liste complète des magasins OPTICLAIRE
 * Centralisé pour éviter les duplications
 */

// Liste de référence livrée avec l'application. On garde toujours les 9 magasins
// de base, même si un ancien réglage navigateur/cloud contient encore une liste
// incomplète (ancien bug des 7 magasins). Les magasins ajoutés par l'utilisateur
// sont ensuite fusionnés et ne sont jamais supprimés automatiquement.
const MAGASINS_DE_BASE: Magasin[] = tenantConfigDefaut().magasins.map(m => ({
  id: m.id,
  label: nomMagasin(m.label),
}));

const MIGRATION_IDS: Record<string, { id: string; label: string }> = {
  cocody: { id: 'bouake', label: 'BOUAKE' },
  marcory: { id: 'yopougon-gandi', label: 'YOPOUGON GANDI' },
};

function normaliserId(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

/** Convertit les anciens magasins COCODY/MARCORY vers BOUAKE/YOPOUGON GANDI. */
function migrerMagasin(magasin: Magasin): Magasin {
  const ancienId = normaliserId(magasin.id);
  const migration = MIGRATION_IDS[ancienId];
  if (!migration) return { ...magasin, id: ancienId };
  return { ...magasin, id: migration.id, label: nomMagasin(migration.label) };
}

/** Union stable par ID : base + liste enregistrée, sans perdre les ajouts utilisateur. */
function fusionnerMagasins(...listes: Magasin[][]): Magasin[] {
  const parId = new Map<string, Magasin>();
  for (const liste of listes) {
    for (const brut of liste || []) {
      if (!brut?.id) continue;
      const magasin = migrerMagasin(brut);
      const id = normaliserId(magasin.id);
      if (!parId.has(id)) parId.set(id, { ...magasin, id });
      else parId.set(id, { ...parId.get(id)!, ...magasin, id });
    }
  }
  return Array.from(parId.values());
}

// La configuration personnalisée peut contenir une ancienne liste de 7 magasins.
// On la complète donc toujours avec les 9 magasins livrés de base.
export const MAGASINS: Magasin[] = fusionnerMagasins(
  MAGASINS_DE_BASE,
  TENANT.magasins.map(m => ({ id: m.id, label: nomMagasin(m.label) })),
);

// Identifiant de magasin : `string` car chaque enseigne définit les siens dans
// ses réglages. Le type nommé est conservé pour la lisibilité des signatures.
export type MagasinId = string;

export interface Magasin {
  id: MagasinId | string;
  label: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  actif?: boolean;
  latitude?: number;
  longitude?: number;
}

/**
 * Récupère la liste des magasins depuis localStorage (dynamique)
 */
export function getMagasins(): Magasin[] {
  try {
    const stored = localStorage.getItem('leclaire_magasins');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return fusionnerMagasins(MAGASINS, parsed);
    }
  } catch (error) {
    logger.error('Erreur lecture magasins:', error);
  }
  return [...MAGASINS];
}

/**
 * Sauvegarde la liste des magasins dans localStorage
 */
export function saveMagasins(magasins: Magasin[]): void {
  try {
    localStorage.setItem('leclaire_magasins', JSON.stringify(magasins));
  } catch (error) {
    // Ne PAS avaler l'erreur : sinon l'appelant croit avoir sauvegardé alors que
    // le magasin n'est jamais persisté (ex. quota localStorage saturé) → « succès
    // mais rien ne s'affiche ». On relaie pour que l'UI montre un vrai message.
    logger.error('Erreur sauvegarde magasins:', error);
    throw error;
  }
}

/**
 * Initialise les magasins par défaut dans localStorage.
 * Si des magasins par défaut sont absents (migration depuis une ancienne version),
 * ils sont ajoutés sans écraser les magasins existants ou ajoutés manuellement.
 */
export function initMagasins(): void {
  const existing = localStorage.getItem('leclaire_magasins');
  if (!existing) {
    saveMagasins(MAGASINS);
    return;
  }
  try {
    const stored = JSON.parse(existing);
    const fusion = fusionnerMagasins(MAGASINS, Array.isArray(stored) ? stored : []);
    // Réécriture uniquement si une migration/fusion a réellement changé la liste.
    if (JSON.stringify(fusion) !== JSON.stringify(stored)) {
      saveMagasins(fusion);
      logger.log('✅ Liste des magasins migrée et complétée sans perdre les ajouts utilisateur.');
    }
  } catch {
    saveMagasins(MAGASINS);
  }
}

/**
 * Récupère un magasin par son ID
 */
export function getMagasinById(id: string): Magasin | undefined {
  const magasins = getMagasins();
  return magasins.find(magasin => magasin.id === id);
}

/**
 * Récupère le label d'un magasin
 */
export function getMagasinLabel(id: string): string {
  return getMagasinById(id)?.label || id.toUpperCase();
}

/**
 * Vérifie si un magasin existe
 */
export function isMagasinValid(id: string): boolean {
  const magasins = getMagasins();
  return magasins.some(magasin => magasin.id === id);
}

/**
 * Récupère tous les IDs de magasins
 */
export function getAllMagasinIds(): string[] {
  const magasins = getMagasins();
  return magasins.map(magasin => magasin.id);
}

/**
 * Récupère uniquement les magasins actifs
 */
export function getActiveMagasins(): Magasin[] {
  const magasins = getMagasins();
  return magasins.filter(magasin => magasin.actif !== false);
}

/**
 * Ajoute un nouveau magasin
 */
export function addMagasin(magasin: Magasin): void {
  const magasins = getMagasins();
  const id = normaliserId(magasin.id);
  if (magasins.some(m => normaliserId(m.id) === id)) {
    throw new Error('Un magasin avec cet identifiant existe déjà.');
  }
  // Ajout durable : sauvegardé dans le registre local puis synchronisé par la
  // couche autoSync. Les futures migrations ne remplacent jamais les ajouts.
  saveMagasins([...magasins, { ...magasin, id, actif: magasin.actif ?? true }]);
}

/**
 * Modifie un magasin existant
 */
export function updateMagasin(id: string, updates: Partial<Magasin>): void {
  const magasins = getMagasins();
  const index = magasins.findIndex(magasin => magasin.id === id);
  if (index !== -1) {
    magasins[index] = { ...magasins[index], ...updates };
    saveMagasins(magasins);
  }
}

/**
 * Supprime un magasin
 */
export function deleteMagasin(id: string): void {
  const magasins = getMagasins();
  const filtered = magasins.filter(magasin => magasin.id !== id);
  saveMagasins(filtered);
}

// Initialiser au chargement
if (typeof window !== 'undefined') {
  initMagasins();
}
