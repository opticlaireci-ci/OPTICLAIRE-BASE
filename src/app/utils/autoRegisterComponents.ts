import { logger } from './logger';
/**
 * Utilitaires pour enregistrer automatiquement les composants
 * (couleurs, marques, etc.) lors de la création de montures
 */

import { addCreateAudit } from './auditUtils';

/**
 * Auto-enregistre une couleur si elle n'existe pas déjà
 */
export function autoRegisterCouleur(couleur: string): void {
  if (!couleur || !couleur.trim()) return;

  const LS_KEY = 'leclaire_db_couleurs';

  try {
    const couleurs = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

    // Vérifier si la couleur existe déjà (insensible à la casse)
    const exists = couleurs.some((c: any) =>
      c.couleur?.toLowerCase().trim() === couleur.toLowerCase().trim()
    );

    if (!exists) {
      const newCouleur = addCreateAudit({
        id: Date.now().toString(),
        couleur: couleur.trim(),
      });

      couleurs.push(newCouleur);
      localStorage.setItem(LS_KEY, JSON.stringify(couleurs));

      // Déclencher un événement pour notifier les composants
      window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
        detail: { key: LS_KEY, action: 'create' }
      }));

      logger.log(`✅ Couleur "${couleur}" enregistrée automatiquement`);
    }
  } catch (error) {
    logger.error('Erreur lors de l\'enregistrement automatique de la couleur:', error);
  }
}

/**
 * Auto-enregistre une marque si elle n'existe pas déjà
 */
export function autoRegisterMarque(marque: string): void {
  if (!marque || !marque.trim()) return;

  const LS_KEY = 'leclaire_db_marques';

  try {
    const marques = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

    const exists = marques.some((m: any) =>
      m.marque?.toLowerCase().trim() === marque.toLowerCase().trim()
    );

    if (!exists) {
      const newMarque = addCreateAudit({
        id: Date.now().toString(),
        marque: marque.trim(),
      });

      marques.push(newMarque);
      localStorage.setItem(LS_KEY, JSON.stringify(marques));

      window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
        detail: { key: LS_KEY, action: 'create' }
      }));

      logger.log(`✅ Marque "${marque}" enregistrée automatiquement`);
    }
  } catch (error) {
    logger.error('Erreur lors de l\'enregistrement automatique de la marque:', error);
  }
}

/**
 * Auto-enregistre une catégorie si elle n'existe pas déjà
 */
export function autoRegisterCategorie(categorie: string): void {
  if (!categorie || !categorie.trim()) return;

  const LS_KEY = 'leclaire_db_categories';

  try {
    const categories = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

    const exists = categories.some((c: any) =>
      c.categorie?.toLowerCase().trim() === categorie.toLowerCase().trim()
    );

    if (!exists) {
      const newCategorie = addCreateAudit({
        id: Date.now().toString(),
        categorie: categorie.trim(),
      });

      categories.push(newCategorie);
      localStorage.setItem(LS_KEY, JSON.stringify(categories));

      window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
        detail: { key: LS_KEY, action: 'create' }
      }));

      logger.log(`✅ Catégorie "${categorie}" enregistrée automatiquement`);
    }
  } catch (error) {
    logger.error('Erreur lors de l\'enregistrement automatique de la catégorie:', error);
  }
}

/**
 * Auto-enregistre une famille si elle n'existe pas déjà
 */
export function autoRegisterFamille(famille: string): void {
  if (!famille || !famille.trim()) return;

  const LS_KEY = 'leclaire_db_familles';

  try {
    const familles = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

    const exists = familles.some((f: any) =>
      f.famille?.toLowerCase().trim() === famille.toLowerCase().trim()
    );

    if (!exists) {
      const newFamille = addCreateAudit({
        id: Date.now().toString(),
        famille: famille.trim(),
      });

      familles.push(newFamille);
      localStorage.setItem(LS_KEY, JSON.stringify(familles));

      window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
        detail: { key: LS_KEY, action: 'create' }
      }));

      logger.log(`✅ Famille "${famille}" enregistrée automatiquement`);
    }
  } catch (error) {
    logger.error('Erreur lors de l\'enregistrement automatique de la famille:', error);
  }
}

/**
 * Auto-enregistre une taille si elle n'existe pas déjà
 */
export function autoRegisterTaille(taille: string): void {
  if (!taille || !taille.trim()) return;

  const LS_KEY = 'leclaire_db_tailles';

  try {
    const tailles = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

    const exists = tailles.some((t: any) =>
      t.taille?.toLowerCase().trim() === taille.toLowerCase().trim()
    );

    if (!exists) {
      const newTaille = addCreateAudit({
        id: Date.now().toString(),
        taille: taille.trim(),
      });

      tailles.push(newTaille);
      localStorage.setItem(LS_KEY, JSON.stringify(tailles));

      window.dispatchEvent(new CustomEvent('leclaire-sync-update', {
        detail: { key: LS_KEY, action: 'create' }
      }));

      logger.log(`✅ Taille "${taille}" enregistrée automatiquement`);
    }
  } catch (error) {
    logger.error('Erreur lors de l\'enregistrement automatique de la taille:', error);
  }
}

/**
 * Auto-enregistre tous les composants d'une monture
 */
export function autoRegisterMontureComponents(monture: {
  couleur?: string;
  marque?: string;
  categorie?: string;
  famille?: string;
  taille?: string;
}): void {
  if (monture.couleur) autoRegisterCouleur(monture.couleur);
  if (monture.marque) autoRegisterMarque(monture.marque);
  if (monture.categorie) autoRegisterCategorie(monture.categorie);
  if (monture.famille) autoRegisterFamille(monture.famille);
  if (monture.taille) autoRegisterTaille(monture.taille);
}
