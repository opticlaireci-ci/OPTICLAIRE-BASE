/**
 * IMPORT / EXPORT CSV DES CATALOGUES
 *
 * Logique commune aux fichiers modèles de chaque catalogue :
 *   • ICM.csv → Montures      • ICG.csv → Verres        • ICS.csv → Services
 *   • ICA.csv → Accessoires   • ICT.csv → Traitements
 *
 * Chaque page déclare simplement ses colonnes (voir `ColonneCsv`) ; la lecture,
 * l'écriture, l'échappement et la conversion des nombres sont mutualisés ici.
 *
 * ── Choix du séparateur ─────────────────────────────────────────────────────
 * Point-virgule « ; » et non virgule : en locale française, Excel utilise la
 * virgule comme séparateur DÉCIMAL des prix. Avec « , » comme séparateur de
 * colonnes, « 1 250,75 » serait lu comme deux cellules.
 */

export const CSV_SEPARATEUR = ';';

/** Type de conversion appliqué à une colonne lors de la lecture/écriture. */
export type TypeColonne =
  | 'texte'    // valeur reprise telle quelle
  | 'nombre'   // « 1 250,75 » ou « 1250.75 » → 1250.75
  | 'stock01'; // « 1 » → 'actif', « 0 » → 'inactif'

export interface ColonneCsv {
  /** En-tête abrégé du fichier modèle (MA, CA, FA…). */
  code: string;
  /** Libellé lisible, affiché dans le dialogue d'import. */
  libelle: string;
  /** Nom du champ correspondant dans l'objet du catalogue. */
  champ: string;
  /** Conversion à appliquer. Par défaut : 'texte'. */
  type?: TypeColonne;
}

/**
 * Échappe une valeur pour le CSV.
 * - Guillemets si elle contient « ; », un guillemet ou un saut de ligne.
 * - Protection anti-injection de formule : un tableur (Excel, Sheets, LibreOffice)
 *   exécute toute cellule commençant par = + - @ (ou tabulation / retour chariot).
 *   On préfixe alors une apostrophe pour neutraliser l'exécution, sans altérer
 *   la valeur affichée. Cf. OWASP « CSV Injection ».
 */
function echapper(valeur: unknown): string {
  let texte = valeur == null ? '' : String(valeur);
  if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/**
 * Génère le contenu CSV à partir des éléments DÉJÀ ENREGISTRÉS.
 * Le résultat est directement relisible par `parserCatalogueCsv` : l'aller-retour
 * export → import restitue des données identiques.
 */
export function genererCatalogueCsv(items: any[], colonnes: ColonneCsv[]): string {
  const lignes = items.map(item =>
    colonnes.map(col => {
      const brut = item?.[col.champ];
      if (col.type === 'stock01') return brut === 'inactif' ? 0 : 1;
      if (col.type === 'nombre') return brut ?? 0;
      return brut ?? '';
    }).map(echapper).join(CSV_SEPARATEUR)
  );
  // BOM UTF-8 : sans lui, Excel affiche « CatÃ©gorie » au lieu de « Catégorie ».
  return '﻿'
    + [colonnes.map(c => c.code).join(CSV_SEPARATEUR), ...lignes].join('\r\n')
    + '\r\n';
}

/** Découpe une ligne CSV en respectant les guillemets (une valeur peut contenir « ; »). */
function decouperLigne(ligne: string): string[] {
  const cellules: string[] = [];
  let courante = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      // Un guillemet doublé à l'intérieur d'un champ représente un guillemet littéral.
      if (c === '"' && ligne[i + 1] === '"') { courante += '"'; i++; }
      else if (c === '"') dansGuillemets = false;
      else courante += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === CSV_SEPARATEUR) { cellules.push(courante); courante = ''; }
    else courante += c;
  }
  cellules.push(courante);
  return cellules.map(v => v.trim());
}

/**
 * Convertit un nombre saisi dans Excel en locale française.
 * « 25 000,50 » (espaces de milliers, virgule décimale) → 25000.5.
 * Renvoie 0 si la valeur est vide ou illisible.
 */
export function nombreFr(valeur: string): number {
  if (!valeur) return 0;
  // Espace ordinaire, insécable ( ) et fine insécable ( ) : Excel
  // utilise l'un ou l'autre selon la version pour les milliers.
  const n = parseFloat(valeur.replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export interface ResultatCsv {
  /** Lignes valides, converties selon les types déclarés. */
  lignes: Record<string, any>[];
  /** Lignes écartées car la 1re colonne (obligatoire) était vide. */
  ignorees: number;
}

/**
 * Analyse un fichier CSV de catalogue.
 *
 * • La ligne d'en-tête est détectée et ignorée si présente ; un fichier sans
 *   en-tête est également accepté.
 * • La PREMIÈRE colonne est considérée obligatoire : une ligne dont elle est
 *   vide est comptée dans `ignorees` (évite d'importer les lignes vides que
 *   Excel laisse souvent en fin de fichier).
 */
export function parserCatalogueCsv(contenu: string, colonnes: ColonneCsv[]): ResultatCsv {
  const lignesTexte = contenu
    .replace(/^﻿/, '')   // BOM éventuel ajouté par Excel
    .split(/\r?\n/)
    .filter(l => l.trim() !== '');

  const lignes: Record<string, any>[] = [];
  let ignorees = 0;

  // En-tête reconnu soit par le code du modèle (MA, TV…), soit par le libellé.
  const premiereCol = colonnes[0];
  const estEntete = (valeur: string) => {
    const v = (valeur || '').toLowerCase();
    return v === premiereCol.code.toLowerCase() || v === premiereCol.libelle.toLowerCase();
  };

  lignesTexte.forEach((ligneTexte, index) => {
    const cellules = decouperLigne(ligneTexte);
    if (index === 0 && estEntete(cellules[0])) return;

    if (!(cellules[0] || '')) { ignorees++; return; }

    const objet: Record<string, any> = {};
    colonnes.forEach((col, i) => {
      const brut = cellules[i] || '';
      if (col.type === 'nombre') objet[col.champ] = nombreFr(brut);
      // Colonne « gestion de stock » : « 0 » = non gérée. Toute autre valeur
      // (vide, « 1 », « oui »…) retombe sur 'actif', le comportement par défaut.
      else if (col.type === 'stock01') objet[col.champ] = brut.trim() === '0' ? 'inactif' : 'actif';
      else objet[col.champ] = brut;
    });
    lignes.push(objet);
  });

  return { lignes, ignorees };
}

/** Déclenche le téléchargement d'un CSV dans le navigateur. */
export function telechargerCsv(contenu: string, prefixeNom: string): void {
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = `${prefixeNom}_${new Date().toISOString().slice(0, 10)}.csv`;
  lien.click();
  // Libère la mémoire retenue par le Blob une fois le téléchargement lancé.
  URL.revokeObjectURL(url);
}

/**
 * Construit la clé d'unicité d'un élément à partir des champs donnés.
 * Comparaison insensible à la casse et aux espaces de bordure, pour que
 * « RAY-BAN » et « ray-ban » soient reconnus comme un doublon.
 */
export function cleUnicite(item: any, champs: string[]): string {
  return champs.map(c => String(item?.[c] ?? '').trim().toLowerCase()).join('|');
}

/** Compte-rendu d'import, formaté pour être affiché tel quel à l'utilisateur. */
export function messageImport(importees: number, doublons: number, ignorees: number): string {
  return [
    `✅ ${importees} ligne(s) importée(s).`,
    doublons > 0 ? `↪ ${doublons} doublon(s) ignoré(s).` : '',
    ignorees > 0 ? `↪ ${ignorees} ligne(s) incomplète(s) ignorée(s).` : '',
  ].filter(Boolean).join('\n');
}

/** Description des colonnes pour le texte d'aide du dialogue (« 1. Marque, 2. … »). */
export function libelleColonnes(colonnes: ColonneCsv[]): string {
  return colonnes.map((c, i) => `${i + 1}. ${c.libelle}`).join(', ');
}


// ═════════════════════════════════════════════════════════════════════════════
//  DÉFINITION DES FICHIERS MODÈLES
// ═════════════════════════════════════════════════════════════════════════════
// L'ORDRE des colonnes est contractuel : il correspond au fichier modèle que les
// utilisateurs remplissent dans Excel. N'insérez jamais une colonne au milieu —
// les fichiers déjà remplis par les magasins deviendraient illisibles. Toute
// nouvelle colonne s'ajoute À LA FIN.
//
// `dedup` liste les champs qui identifient un élément de façon unique : une
// ligne importée dont ces champs concordent avec un élément existant est
// ignorée plutôt que dupliquée.

export interface ModeleCsv {
  /** Nom du fichier modèle, tel qu'annoncé dans l'interface (ICM, ICG…). */
  nom: string;
  colonnes: ColonneCsv[];
  dedup: string[];
}

/** ICM.csv — Montures (12 colonnes). */
export const MODELE_MONTURES: ModeleCsv = {
  nom: 'ICM',
  colonnes: [
    { code: 'MA', libelle: 'Marque',        champ: 'marque' },
    { code: 'CA', libelle: 'Catégorie',     champ: 'categorie' },
    { code: 'FA', libelle: 'Famille',       champ: 'famille' },
    { code: 'R',  libelle: 'Référence',     champ: 'reference' },
    { code: 'CO', libelle: 'Couleur',       champ: 'couleur' },
    { code: 'TA', libelle: 'Taille',        champ: 'taille' },
    { code: 'P',  libelle: 'Prix',          champ: 'prix',        type: 'nombre' },
    { code: 'S',  libelle: 'Stock',         champ: 'stock',       type: 'nombre' },
    { code: 'SE', libelle: 'Seuil',         champ: 'seuil',       type: 'nombre' },
    { code: 'GS', libelle: 'Gestion Stock', champ: 'gestionStocks', type: 'stock01' },
    { code: 'G',  libelle: 'Garantie',      champ: 'garantie' },
    { code: 'FR', libelle: 'Fournisseur',   champ: 'fournisseur' },
  ],
  dedup: ['marque', 'reference', 'couleur', 'taille'],
};

/** ICA.csv — Accessoires (11 colonnes ; « Désignation » remplace Famille/Référence). */
export const MODELE_ACCESSOIRES: ModeleCsv = {
  nom: 'ICA',
  colonnes: [
    { code: 'MA', libelle: 'Marque',        champ: 'marque' },
    { code: 'CA', libelle: 'Catégorie',     champ: 'categorie' },
    { code: 'D',  libelle: 'Désignation',   champ: 'designation' },
    { code: 'CO', libelle: 'Couleur',       champ: 'couleur' },
    { code: 'TA', libelle: 'Taille',        champ: 'taille' },
    { code: 'P',  libelle: 'Prix',          champ: 'prix',        type: 'nombre' },
    { code: 'S',  libelle: 'Stock',         champ: 'stock',       type: 'nombre' },
    { code: 'SE', libelle: 'Seuil',         champ: 'seuil',       type: 'nombre' },
    { code: 'GS', libelle: 'Gestion Stock', champ: 'gestionStocks', type: 'stock01' },
    { code: 'G',  libelle: 'Garantie',      champ: 'garantie' },
    { code: 'FR', libelle: 'Fournisseur',   champ: 'fournisseur' },
  ],
  dedup: ['marque', 'designation', 'couleur', 'taille'],
};

/** ICG.csv — Verres (8 colonnes ; ordre déjà annoncé dans le dialogue existant). */
export const MODELE_VERRES: ModeleCsv = {
  nom: 'ICG',
  colonnes: [
    { code: 'TV', libelle: 'Type Verre',  champ: 'typeVerre' },
    { code: 'V',  libelle: 'Verre',       champ: 'verre' },
    { code: 'T',  libelle: 'Traitement',  champ: 'traitement' },
    { code: 'M',  libelle: 'Matière',     champ: 'matiere' },
    { code: 'D',  libelle: 'Diamètre',    champ: 'diametre' },
    { code: 'P',  libelle: 'Prix',        champ: 'prixVerre', type: 'nombre' },
    { code: 'G',  libelle: 'Garantie',    champ: 'garantie' },
    { code: 'FR', libelle: 'Fournisseur', champ: 'fournisseur' },
  ],
  dedup: ['typeVerre', 'verre', 'traitement', 'matiere', 'diametre'],
};

/** ICS.csv — Services (3 colonnes). */
export const MODELE_SERVICES: ModeleCsv = {
  nom: 'ICS',
  colonnes: [
    { code: 'CA', libelle: 'Catégorie', champ: 'categorie' },
    { code: 'S',  libelle: 'Service',   champ: 'service' },
    { code: 'P',  libelle: 'Prix',      champ: 'prixVerre', type: 'nombre' },
  ],
  dedup: ['categorie', 'service'],
};

/** ICT.csv — Traitements (2 colonnes). */
export const MODELE_TRAITEMENTS: ModeleCsv = {
  nom: 'ICT',
  colonnes: [
    { code: 'D', libelle: 'Désignation', champ: 'designation' },
    { code: 'P', libelle: 'Prix',        champ: 'prix', type: 'nombre' },
  ],
  dedup: ['designation'],
};

/**
 * Fournisseurs (ICF).
 *
 * Ce ne sont pas des composants d'optique mais la structure du fichier obéit
 * aux mêmes règles : première colonne obligatoire, ordre figé.
 */
export const MODELE_FOURNISSEURS: ModeleCsv = {
  nom: 'ICF',
  colonnes: [
    { code: 'RS', libelle: 'Raison Sociale', champ: 'raisonSociale' },
    { code: 'T1', libelle: 'Téléphone I',   champ: 'telephoneI' },
    { code: 'T2', libelle: 'Téléphone II',  champ: 'telephoneII' },
    { code: 'AD', libelle: 'Adresse',       champ: 'adresse' },
    { code: 'E',  libelle: 'Email',         champ: 'email' },
    { code: 'S',  libelle: 'Solde',         champ: 'solde', type: 'nombre' },
  ],
  dedup: ['raisonSociale'],
};

/** Assurances (ICAS) — même structure que les fournisseurs. */
export const MODELE_ASSURANCES: ModeleCsv = {
  nom: 'ICAS',
  colonnes: [
    { code: 'RS', libelle: 'Raison Sociale', champ: 'raisonSociale' },
    { code: 'T1', libelle: 'Téléphone I',   champ: 'telephoneI' },
    { code: 'T2', libelle: 'Téléphone II',  champ: 'telephoneII' },
    { code: 'AD', libelle: 'Adresse',       champ: 'adresse' },
    { code: 'E',  libelle: 'Email',         champ: 'email' },
    { code: 'S',  libelle: 'Solde',         champ: 'solde', type: 'nombre' },
  ],
  dedup: ['raisonSociale'],
};

/** Ophtalmologues (ICO). */
export const MODELE_OPHTALMOLOGUES: ModeleCsv = {
  nom: 'ICO',
  colonnes: [
    { code: 'O', libelle: 'Ophtalmologue', champ: 'ophtalmologue' },
    { code: 'T', libelle: 'Téléphone',     champ: 'telephone' },
  ],
  dedup: ['ophtalmologue'],
};

/** Cabinets d'ophtalmologie (ICB). */
export const MODELE_CABINETS: ModeleCsv = {
  nom: 'ICB',
  colonnes: [
    { code: 'CO', libelle: 'Cabinet Ophtalmologue', champ: 'cabinetOphtalmologue' },
    { code: 'T',  libelle: 'Téléphone',             champ: 'telephone' },
  ],
  dedup: ['cabinetOphtalmologue'],
};

/**
 * Clients (ICC).
 *
 * Le numéro de client n'est PAS une colonne : il est attribué automatiquement à
 * l'import, comme lors d'une saisie manuelle, pour éviter les collisions avec
 * les numéros déjà utilisés.
 *
 * La date de naissance est éclatée en trois colonnes (jour / mois / année),
 * exactement comme dans le formulaire de saisie.
 */
export const MODELE_CLIENTS: ModeleCsv = {
  nom: 'ICC',
  colonnes: [
    { code: 'N',  libelle: 'Nom',                 champ: 'nom' },
    { code: 'T',  libelle: 'Téléphone',           champ: 'telephone' },
    { code: 'T2', libelle: 'Téléphone 2',         champ: 'telephone2' },
    { code: 'E',  libelle: 'Email',               champ: 'email' },
    { code: 'AD', libelle: 'Adresse',             champ: 'adresse' },
    { code: 'PR', libelle: 'Profession',          champ: 'profession' },
    { code: 'JN', libelle: 'Jour naissance',      champ: 'jourNaissance' },
    { code: 'MN', libelle: 'Mois naissance',      champ: 'moisNaissance' },
    { code: 'AN', libelle: 'Année naissance',     champ: 'anneeNaissance' },
    { code: 'MA', libelle: 'Matricule assurance', champ: 'matriculeAssurance' },
    { code: 'EN', libelle: 'Entreprise',          champ: 'entreprise' },
    { code: 'S',  libelle: 'Solde',               champ: 'solde', type: 'nombre' },
  ],
  dedup: ['nom', 'telephone'],
};

/**
 * Applique un import : filtre les doublons (contre l'existant ET à l'intérieur
 * du fichier lui-même) et renvoie les seules lignes réellement nouvelles.
 */
export function filtrerNouveautes(
  existants: any[],
  lignes: Record<string, any>[],
  dedup: string[],
): { nouvelles: Record<string, any>[]; doublons: number } {
  const vues = new Set(existants.map(e => cleUnicite(e, dedup)));
  const nouvelles: Record<string, any>[] = [];
  let doublons = 0;
  lignes.forEach(l => {
    const cle = cleUnicite(l, dedup);
    if (vues.has(cle)) { doublons++; return; }
    vues.add(cle);
    nouvelles.push(l);
  });
  return { nouvelles, doublons };
}
