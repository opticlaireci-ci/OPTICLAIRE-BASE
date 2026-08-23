import { logger } from '../utils/logger';
import { TENANT, nomMagasin } from '../config/tenant';
/**
 * Liste complète des magasins OPTICLAIRE
 * Centralisé pour éviter les duplications
 */

// Liste par défaut, DÉRIVÉE des réglages de l'enseigne (src/app/config/tenant.ts).
// Elle ne sert qu'à la première ouverture : ensuite l'enseigne gère ses magasins
// depuis l'application et `getMagasins()` lit la version enregistrée.
export const MAGASINS: Magasin[] = TENANT.magasins.map(m => ({
  id: m.id,
  label: nomMagasin(m.label),
}));

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
      return JSON.parse(stored);
    }
  } catch (error) {
    logger.error('Erreur lecture magasins:', error);
  }
  // Retourner la liste par défaut si rien en localStorage
  return MAGASINS;
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
    const stored: Magasin[] = JSON.parse(existing);
    const storedIds = new Set(stored.map(m => m.id));
    const missing = MAGASINS.filter(m => !storedIds.has(m.id));
    if (missing.length > 0) {
      saveMagasins([...stored, ...missing]);
      logger.log('✅ Magasins manquants ajoutés:', missing.map(m => m.id).join(', '));
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
  magasins.push({ ...magasin, actif: true });
  saveMagasins(magasins);
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
