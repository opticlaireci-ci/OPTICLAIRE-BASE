import { logger } from '../utils/logger';
import { TENANT, nomMagasin, tenantConfigDefaut } from '../config/tenant';
import { creerNormaliseurMagasins } from '../services/stockLedger';
/**
 * Liste complète des magasins OPTICLAIRE
 * Centralisé pour éviter les duplications
 */

// Liste par défaut, DÉRIVÉE des réglages de l'enseigne (src/app/config/tenant.ts).
// Elle ne sert qu'à la première ouverture : ensuite l'enseigne gère ses magasins
// depuis l'application et `getMagasins()` lit la version enregistrée.
const MAGASINS_REFERENCE = tenantConfigDefaut().magasins;

export const MAGASINS: Magasin[] = MAGASINS_REFERENCE.map(m => ({
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
 * Normalise et déduplique la liste des magasins. Les anciens identifiants
 * `cocody` et `marcory` sont migrés définitivement vers les nouveaux magasins
 * `bouake` et `yopougon-gandi`, afin qu'une ancienne copie locale ou cloud ne
 * puisse jamais les faire réapparaître.
 */
const LEGACY_MAGASIN_IDS: Record<string, { id: string; label: string }> = {
  cocody: { id: 'bouake', label: 'BOUAKÉ' },
  marcory: { id: 'yopougon-gandi', label: 'YOPOUGON GANDI' },
};

/** Clé du registre des magasins (copie locale de la liste partagée). */
export const CLE_REGISTRE_MAGASINS = 'leclaire_magasins';
/** Événement émis à chaque changement de la liste des magasins sur ce poste. */
export const EVENEMENT_MAGASINS = 'leclaire-magasins-update';

/**
 * Entrée du registre. Un magasin supprimé reste dans le registre avec
 * `supprime: true` (« pierre tombale ») : sans elle, la fusion des listes des
 * différents appareils le ferait réapparaître.
 */
export type EntreeRegistreMagasin = Magasin & { supprime?: boolean; modifieLe?: string };

/**
 * FUSION SANS PERTE des listes de magasins (défauts du code, configuration de
 * l'enseigne, copie locale, copie du serveur…), dans l'ordre donné.
 *
 * - Un magasin présent dans UNE seule liste est toujours gardé : un appareil
 *   resté sur 9 magasins ne peut plus faire disparaître les 3 ajoutés ailleurs.
 * - Même magasin dans deux listes : la modification la plus récente
 *   (`modifieLe`) l'emporte ; à date égale, la liste donnée en dernier.
 * - Les pierres tombales (`supprime`) sont conservées (filtrées à l'affichage).
 */
export function fusionnerMagasins(...listes: unknown[]): EntreeRegistreMagasin[] {
  const parId = new Map<string, { m: EntreeRegistreMagasin; ancien: boolean }>();
  for (const liste of listes) {
    if (!Array.isArray(liste)) continue;
    for (const raw of liste) {
      if (!raw || typeof raw !== 'object') continue;
      const brut = raw as EntreeRegistreMagasin;
      const originalId = String(brut.id ?? '').trim().toLowerCase();
      if (!originalId) continue;
      const legacy = LEGACY_MAGASIN_IDS[originalId];
      const id = legacy?.id || originalId;
      // Les anciens magasins sont un renommage officiel : leur libellé est aussi
      // remplacé, même si une vieille sauvegarde contient encore COCODY/MARCORY.
      const label = legacy?.label || String(brut.label || id.toUpperCase()).trim();
      const m: EntreeRegistreMagasin = { ...brut, id, label };
      const actuel = parId.get(id);
      if (!actuel) { parId.set(id, { m, ancien: !!legacy }); continue; }
      // Un vrai magasin portant déjà ce nouvel identifiant est prioritaire sur
      // l'ancienne écriture renommée.
      if (legacy && !actuel.ancien) continue;
      const plusRecent = String(m.modifieLe || '') >= String(actuel.m.modifieLe || '');
      if (plusRecent || (actuel.ancien && !legacy)) parId.set(id, { m: { ...actuel.m, ...m }, ancien: !!legacy });
    }
  }
  return [...parId.values()].map(v => v.m);
}

export function normalizeMagasins(input: unknown): Magasin[] {
  return fusionnerMagasins(input).filter(m => !m.supprime);
}

/** Registre local complet (pierres tombales comprises), tel qu'enregistré. */
export function lireRegistreMagasins(): EntreeRegistreMagasin[] {
  try {
    const brut = localStorage.getItem(CLE_REGISTRE_MAGASINS);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? fusionnerMagasins(liste) : [];
  } catch {
    return [];
  }
}

/** Magasins de la configuration de l'enseigne (code, puis réglage de l'application). */
function magasinsDeConfiguration(): Magasin[] {
  return [
    ...MAGASINS,
    ...TENANT.magasins.map(m => ({ id: m.id, label: nomMagasin(m.label) })),
  ];
}

/**
 * Liste des magasins : magasins de la configuration + registre (magasins ajoutés
 * depuis l'application), sans les magasins supprimés. Lecture seule : rien
 * n'est réécrit ni envoyé au serveur.
 */
export function getMagasins(): Magasin[] {
  try {
    return fusionnerMagasins(magasinsDeConfiguration(), lireRegistreMagasins())
      .filter(m => !m.supprime)
      .map(({ supprime: _s, modifieLe: _d, ...m }) => m as Magasin);
  } catch (error) {
    logger.error('Erreur lecture magasins:', error);
    return MAGASINS;
  }
}

/**
 * Enregistre le registre LOCAL. Les magasins déjà connus du registre et absents
 * de `magasins` sont conservés (fusion) : une liste incomplète ne peut plus en
 * effacer. Supprimer un magasin passe par `deleteMagasin`.
 */
export function saveMagasins(magasins: EntreeRegistreMagasin[]): void {
  try {
    const avant = localStorage.getItem(CLE_REGISTRE_MAGASINS);
    const apres = JSON.stringify(fusionnerMagasins(lireRegistreMagasins(), magasins));
    if (avant === apres) return;
    localStorage.setItem(CLE_REGISTRE_MAGASINS, apres);
  } catch (error) {
    // Ne PAS avaler l'erreur : sinon l'appelant croit avoir sauvegardé alors que
    // le magasin n'est jamais persisté (ex. quota localStorage saturé) → « succès
    // mais rien ne s'affiche ». On relaie pour que l'UI montre un vrai message.
    logger.error('Erreur sauvegarde magasins:', error);
    throw error;
  }
  try { window.dispatchEvent(new CustomEvent(EVENEMENT_MAGASINS)); } catch { /* hors navigateur */ }
}

/**
 * Ancienne initialisation : elle écrivait les 9 magasins par défaut dans le
 * registre au démarrage, et cette liste partait ensuite vers le serveur,
 * écrasant les magasins ajoutés. Désormais les magasins de la configuration
 * sont lus à la volée (getMagasins) : il n'y a plus rien à écrire.
 */
export function initMagasins(): void { /* volontairement vide */ }

/**
 * Identifiant d'un magasin (MAJUSCULES), quelle que soit la façon dont il a été
 * écrit dans un bon, une vente ou un mouvement de stock : identifiant
 * (« yopougon-gandi »), libellé (« YOPOUGON GANDI », « BOUAKÉ »), ancien nom
 * renommé (« cocody » → BOUAKE, « marcory » → YOPOUGON-GANDI), « LECLAIRE X »…
 */
let normaliseur: { cle: string; f: (v: unknown) => string } | null = null;
/** Fonction de normalisation (à garder pour toute une boucle : la liste des magasins n'est lue qu'une fois). */
export function normaliseurMagasins(): (value: unknown) => string {
  const magasins = getMagasins();
  const cle = JSON.stringify(magasins.map(m => [m.id, m.label]));
  if (!normaliseur || normaliseur.cle !== cle) {
    const anciens = Object.fromEntries(Object.entries(LEGACY_MAGASIN_IDS).map(([ancien, m]) => [ancien, m.id]));
    normaliseur = { cle, f: creerNormaliseurMagasins(magasins, anciens) };
  }
  return normaliseur.f;
}
export function magasinCanonique(value: unknown): string {
  return normaliseurMagasins()(value);
}

/** Les deux écritures désignent-elles le même magasin ? */
export function memeMagasin(a: unknown, b: unknown): boolean {
  const x = magasinCanonique(a);
  return !!x && x === magasinCanonique(b);
}

/**
 * Récupère un magasin par son ID
 */
export function getMagasinById(id: string): Magasin | undefined {
  const magasins = getMagasins();
  const cle = String(id || '').trim().toLowerCase();
  // Insensible à la casse : selon les écrans, l'identifiant arrive en
  // « bouake » ou « BOUAKE ».
  return magasins.find(magasin => magasin.id === id) || magasins.find(magasin => magasin.id.toLowerCase() === cle);
}

/**
 * Récupère le label d'un magasin
 */
export function getMagasinLabel(id: string): string {
  return getMagasinById(id)?.label || String(id || '').toUpperCase();
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

/** Horodatage d'une modification du registre (la plus récente l'emporte). */
const maintenant = () => new Date().toISOString();

/**
 * Ajoute un nouveau magasin
 */
export function addMagasin(magasin: Magasin): void {
  saveMagasins([{ ...magasin, actif: magasin.actif !== false, supprime: false, modifieLe: maintenant() }]);
}

/**
 * Modifie un magasin existant
 */
export function updateMagasin(id: string, updates: Partial<Magasin>): void {
  const actuel = getMagasinById(id);
  if (!actuel) return;
  saveMagasins([{ ...actuel, ...updates, id: actuel.id, supprime: false, modifieLe: maintenant() }]);
}

/**
 * Supprime un magasin (pierre tombale : il ne revient plus depuis un autre appareil).
 */
export function deleteMagasin(id: string): void {
  const actuel = getMagasinById(id);
  if (!actuel) return;
  saveMagasins([{ ...actuel, supprime: true, modifieLe: maintenant() }]);
}
