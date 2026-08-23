import { logger } from './logger';
/**
 * Auto-enregistrement des clients dans la base du magasin concerné.
 * Appelé silencieusement lors de l'enregistrement d'une vente, devis ou vente flash.
 *
 * - Déduplique par numéro de téléphone principal (cache en mémoire par session).
 * - Enregistre dans leclaire_clients_magasin_{magasinId}.
 * - Dispatch 'leclaire-clients-update' pour rafraîchir la page Clients ouverte.
 */

import { addCreateAudit } from './auditUtils';
import { upsertClient } from '../services/clientsService';

// Cache par session : magasinId → Set des téléphones déjà enregistrés
const _cache = new Map<string, Set<string>>();

function getCache(magasinId: string): Set<string> {
  if (_cache.has(magasinId)) return _cache.get(magasinId)!;
  const key = `leclaire_clients_magasin_${magasinId}`;
  try {
    const items: any[] = JSON.parse(localStorage.getItem(key) || '[]');
    const phones = new Set<string>(
      items.map(c => (c.telephone || '').trim().toLowerCase()).filter(Boolean)
    );
    _cache.set(magasinId, phones);
    return phones;
  } catch {
    const empty = new Set<string>();
    _cache.set(magasinId, empty);
    return empty;
  }
}

export function resetClientCache(magasinId?: string) {
  if (magasinId) _cache.delete(magasinId);
  else _cache.clear();
}

export interface ClientVenteData {
  numeroClient: string;
  civilite?: string;
  nom: string;
  telephone1: string;
  telephone2?: string;
  email?: string;
  adresse?: string;
  profession?: string;
  jourNaissance?: string;
  moisNaissance?: string;
  anneeNaissance?: string;
  soldeClient?: string;
  matriculeAssurance?: string;
  entreprise?: string;
}

/**
 * Enregistre automatiquement un client dans la base du magasin
 * s'il n'y est pas déjà (dédupliqué par téléphone principal).
 */
export function autoSaveClient(data: ClientVenteData, magasinId: string): void {
  const nom = data.nom?.trim();
  const tel = data.telephone1?.trim();
  if (!nom || !tel) return;

  const telKey = tel.toLowerCase();
  const cache = getCache(magasinId);
  if (cache.has(telKey)) return;

  const lsKey = `leclaire_clients_magasin_${magasinId}`;
  try {
    const existing: any[] = JSON.parse(localStorage.getItem(lsKey) || '[]');

    // Vérification double (cache potentiellement périmé)
    if (existing.some(c => (c.telephone || '').toLowerCase() === telKey)) {
      cache.add(telKey);
      return;
    }

    const nomComplet = data.civilite ? `${data.civilite} ${nom}` : nom;

    const newClient = addCreateAudit({
      id: Date.now().toString(),
      numeroClient: data.numeroClient,
      nom: nomComplet,
      telephone: tel,
      telephone2: data.telephone2?.trim() || '',
      email: data.email?.trim() || '',
      adresse: data.adresse?.trim() || '',
      profession: data.profession?.trim() || '',
      jourNaissance: data.jourNaissance || '',
      moisNaissance: data.moisNaissance || '',
      anneeNaissance: data.anneeNaissance || '',
      matriculeAssurance: data.matriculeAssurance?.trim() || '',
      entreprise: data.entreprise?.trim() || '',
      notes: '',
      solde: parseFloat(data.soldeClient || '0') || 0,
      dateEdition: new Date().toISOString(),
      source: 'auto',
    });

    localStorage.setItem(lsKey, JSON.stringify([newClient, ...existing]));
    cache.add(telKey);

    // Lot 7 : push dans public.clients (silencieux, ne bloque pas la vente)
    upsertClient({
      id: newClient.id,
      magasin_id: magasinId,
      numero_client: newClient.numeroClient,
      nom: newClient.nom,
      telephone: newClient.telephone,
      telephone2: newClient.telephone2,
      email: newClient.email,
      adresse: newClient.adresse,
      profession: newClient.profession,
      jour_naissance: newClient.jourNaissance,
      mois_naissance: newClient.moisNaissance,
      annee_naissance: newClient.anneeNaissance,
      matricule_assurance: newClient.matriculeAssurance,
      entreprise: newClient.entreprise,
      notes: newClient.notes,
      solde: newClient.solde,
      date_edition: newClient.dateEdition,
      source: newClient.source,
    }).catch(err => logger.error('❌ upsertClient auto:', err));

    // Enregistrer la profession dans le référentiel global
    if (data.profession?.trim()) autoSaveProfession(data.profession.trim());

    window.dispatchEvent(new CustomEvent('leclaire-clients-update', {
      detail: { magasinId },
    }));
  } catch {
    // Silencieux : ne bloque jamais la sauvegarde d'une vente
  }
}

// ── Cache professions ─────────────────────────────────────────────────────────
const _profCache = new Set<string>(
  (() => {
    try {
      const items: any[] = JSON.parse(localStorage.getItem('leclaire_db_professions') || '[]');
      return items.map((x: any) => (x.profession || '').toLowerCase()).filter(Boolean);
    } catch { return []; }
  })()
);

/**
 * Enregistre une profession dans le référentiel global si elle n'y est pas déjà.
 */
export function autoSaveProfession(profession: string): void {
  const trimmed = profession?.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (_profCache.has(key)) return;
  try {
    const existing: any[] = JSON.parse(localStorage.getItem('leclaire_db_professions') || '[]');
    if (existing.some((x: any) => (x.profession || '').toLowerCase() === key)) {
      _profCache.add(key);
      return;
    }
    existing.push({ id: Date.now().toString(), profession: trimmed });
    localStorage.setItem('leclaire_db_professions', JSON.stringify(existing));
    _profCache.add(key);
    window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
      detail: { key: 'leclaire_db_professions' },
    }));
  } catch {}
}
