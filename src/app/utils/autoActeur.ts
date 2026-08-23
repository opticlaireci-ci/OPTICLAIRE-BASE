/**
 * Auto-enregistrement des ophtalmologues et cabinets dans Gestion des Acteurs.
 * Appelé silencieusement lors de l'enregistrement d'une vente ou d'un devis.
 *
 * - Évite les doublons via un cache en mémoire (initialisé une seule fois par session).
 * - L'entrée est créée côté Supabase via l'API, puis disponible dans les onglets Acteurs.
 */

import { api } from '../services/api';
import { addCreateAudit } from './auditUtils';

// Cache par session : évite des appels API répétés
let _ophCache: Set<string> | null = null;
let _cabCache: Set<string> | null = null;

async function getOphCache(): Promise<Set<string>> {
  if (_ophCache) return _ophCache;
  try {
    const items = await api.getAll<any>('ophtalmologues');
    _ophCache = new Set(
      items.map((i: any) => (i.ophtalmologue || i.nom || '').trim().toLowerCase()).filter(Boolean)
    );
  } catch {
    _ophCache = new Set();
  }
  return _ophCache;
}

async function getCabCache(): Promise<Set<string>> {
  if (_cabCache) return _cabCache;
  try {
    const items = await api.getAll<any>('cabinets');
    _cabCache = new Set(
      items.map((i: any) => (i.cabinetOphtalmologue || i.nom || '').trim().toLowerCase()).filter(Boolean)
    );
  } catch {
    _cabCache = new Set();
  }
  return _cabCache;
}

/** Réinitialise les caches (utile après une suppression manuelle) */
export function resetActeursCaches() {
  _ophCache = null;
  _cabCache = null;
}

/**
 * Enregistre automatiquement un ophtalmologue dans Gestion des Acteurs
 * s'il n'y est pas déjà.
 */
export async function autoSaveOphtalmologue(nom: string, telephone?: string): Promise<void> {
  const trimmed = nom?.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  const cache = await getOphCache();
  if (cache.has(key)) return;
  try {
    await api.create('ophtalmologues', addCreateAudit({
      ophtalmologue: trimmed,
      telephone: telephone?.trim() || '',
    }));
    cache.add(key);
    // Notifie les pages ouvertes pour qu'elles rechargent leurs listes
    window.dispatchEvent(new CustomEvent('leclaire-acteurs-update', {
      detail: { entityType: 'ophtalmologues' },
    }));
  } catch {
    // Silencieux : ne doit jamais bloquer la sauvegarde d'une vente
  }
}

/**
 * Enregistre automatiquement un cabinet ophtalmologique dans Gestion des Acteurs
 * s'il n'y est pas déjà.
 */
export async function autoSaveCabinet(nom: string, telephone?: string): Promise<void> {
  const trimmed = nom?.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  const cache = await getCabCache();
  if (cache.has(key)) return;
  try {
    await api.create('cabinets', addCreateAudit({
      cabinetOphtalmologue: trimmed,
      telephone: telephone?.trim() || '',
    }));
    cache.add(key);
    window.dispatchEvent(new CustomEvent('leclaire-acteurs-update', {
      detail: { entityType: 'cabinets' },
    }));
  } catch {
    // Silencieux
  }
}
