/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RÉGLAGES DU CLIENT (ENSEIGNE)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  OPTICLAIRE est le logiciel. Chaque client (enseigne d'optique) en utilise sa
 *  propre installation : son projet Supabase et ce fichier de réglages.
 *
 *  ┌─────────────────────────────────────────────────────────────────────────┐
 *  │  POUR INSTALLER UN NOUVEAU CLIENT — C'EST LE SEUL FICHIER À MODIFIER.   │
 *  └─────────────────────────────────────────────────────────────────────────┘
 *
 *  Marche à suivre complète :
 *    1. Créer un nouveau projet Supabase pour le client.
 *    2. Y exécuter `supabase/INSTALLATION_NOUVEAU_PROJET.sql` (installeur unique
 *       et idempotent). Puis `supabase/CORRECTIFS_SECURITE.sql` sur un projet
 *       déjà en service. NE PAS utiliser `setup-nouveau-projet.sql` (déprécié).
 *    3. Déployer l'edge function (nom : voir SERVER_FUNCTION_NAME).
 *    4. Renseigner les valeurs de `TENANT` ci-dessous.
 *    5. Ouvrir l'application : l'écran de configuration crée l'administrateur.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  À NE PAS FAIRE : renommer les clés de stockage `leclaire_*`
 *  ─────────────────────────────────────────────────────────────────────────
 *  Ces clés sont purement INTERNES : aucun client ne les voit jamais, et chaque
 *  installation possède sa propre base de données — il n'y a donc aucune
 *  collision possible entre enseignes. `leclaire_` est un simple préfixe
 *  technique historique, au même titre que le suffixe `10865fd7` de la table
 *  clé/valeur. Les renommer casserait la synchronisation sans rien apporter.
 */

// ── Visuels de l'enseigne ────────────────────────────────────────────────────
// Remplacez ces trois lignes par les fichiers du nouveau client (déposés dans
// `src/imports/`). Les images doivent être importées, pas écrites en texte.
import logoEnseigne from '../../imports/WhatsApp_Image_2026-05-22_at_16.11.40.jpeg';
import accueilEnseigne from '../../imports/WhatsApp_Image_2026-05-23_at_01.24.33.jpeg';
import logoNoelEnseigne from '../../imports/ChatGPT_Image_26_juil._2026__13_20_18.png';

export interface TenantConfig {
  /**
   * Nom commercial affiché PARTOUT : menus, en-têtes, factures, reçus, PDF.
   * Écrit en majuscules par convention dans l'interface existante.
   */
  nom: string;

  /** Nom complet, pour les mentions légales et l'écran de connexion. */
  nomComplet: string;

  /** Coordonnées du siège (direction), utilisées en en-tête de document. */
  siege: {
    adresse: string;
    telephone: string;
    email: string;
    ville: string;
  };

  /**
   * Adresse e-mail du compte propriétaire créé par l'écran de configuration.
   * Doit correspondre au secret OWNER_EMAIL de l'edge function.
   */
  emailProprietaire: string;

  /**
   * Magasins livrés par défaut à la première ouverture. Ensuite, l'enseigne les
   * gère elle-même depuis l'application (Gestion des magasins), et cette liste
   * n'est plus consultée : `getMagasins()` lit la version enregistrée.
   *
   * `id` doit être en MINUSCULES sans accent ni espace (il sert d'identifiant
   * technique dans les clés de données et les URL).
   */
  magasins: Array<{ id: string; label: string }>;

  /** Devise affichée dans les montants. */
  devise: string;

  /**
   * Visuels de l'enseigne. Pour un nouveau client :
   *   1. déposer ses fichiers dans `src/imports/` ;
   *   2. modifier les trois `import` en haut de CE fichier.
   * Ne mettez JAMAIS un chemin en texte (`'/imports/logo.png'`) : Vite renomme
   * les fichiers à la compilation, seul un `import` fonctionne en production.
   */
  visuels: {
    /** Logo principal : écran de connexion, espace administrateur. */
    logo: string;
    /** Grande photo d'ambiance de l'écran de connexion. */
    accueil: string;
    /** Variante de Noël du logo (mode festif). Mettre `logo` si inutile. */
    logoNoel: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ▼▼▼  VALEURS DU CLIENT PAR DÉFAUT  ▼▼▼
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valeurs livrées « en dur » dans le code. Elles servent de point de départ.
 * Elles peuvent ensuite être remplacées SANS toucher au code, depuis
 * l'application (Espace Administrateur → « Configuration de l'enseigne »).
 * Ce que l'on y enregistre est stocké dans le navigateur et fusionné ci-dessous.
 */
const TENANT_DEFAUT: TenantConfig = {
  nom: 'LECLAIRE',
  nomComplet: 'LECLAIRE OPTIQUE',

  siege: {
    adresse: '8 Pool, Rond-point de la Rivera Palmeraie',
    telephone: '+225 07 15 15 25 25',
    email: 'Leclaire.optic@gmail.com',
    ville: 'Abidjan',
  },

  emailProprietaire: 'admin@leclaire.ci',

  magasins: [
    { id: 'abobo',       label: 'ABOBO' },
    { id: 'faya',        label: 'FAYA' },
    { id: 'koumassi',    label: 'KOUMASSI' },
    { id: 'palmeraie',   label: 'PALMERAIE' },
    { id: 'yopougon',    label: 'YOPOUGON' },
    { id: 'bingerville', label: 'BINGERVILLE' },
    { id: 'man',         label: 'MAN' },
  ],

  devise: 'FCFA',

  visuels: {
    logo: logoEnseigne,
    accueil: accueilEnseigne,
    logoNoel: logoNoelEnseigne,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  ▲▲▲  FIN DES VALEURS PAR DÉFAUT  ▲▲▲
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clé de stockage de la personnalisation saisie dans l'application.
 * (Volontairement préfixée `leclaire_` comme toutes les autres clés internes —
 *  voir l'avertissement en tête de fichier : ne pas renommer.)
 */
const CLE_CONFIG = 'leclaire_tenant_config';

/** Partie de la config que l'on autorise à modifier depuis l'interface. */
export type TenantConfigModifiable = Pick<
  TenantConfig,
  'nom' | 'nomComplet' | 'siege' | 'emailProprietaire' | 'magasins' | 'devise'
>;

function chargerOverride(): Partial<TenantConfig> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const brut = localStorage.getItem(CLE_CONFIG);
    return brut ? (JSON.parse(brut) as Partial<TenantConfig>) : {};
  } catch {
    return {};
  }
}

const _override = chargerOverride();

export const TENANT: TenantConfig = {
  ...TENANT_DEFAUT,
  ...(_override.nom ? { nom: _override.nom } : {}),
  ...(_override.nomComplet ? { nomComplet: _override.nomComplet } : {}),
  ...(_override.emailProprietaire ? { emailProprietaire: _override.emailProprietaire } : {}),
  ...(_override.devise ? { devise: _override.devise } : {}),
  siege: { ...TENANT_DEFAUT.siege, ...(_override.siege || {}) },
  magasins:
    _override.magasins && _override.magasins.length
      ? _override.magasins
      : TENANT_DEFAUT.magasins,
  // Les visuels restent définis dans le code (imports en haut de fichier).
  visuels: TENANT_DEFAUT.visuels,
};

/** Valeurs par défaut livrées avec le code (pour un « rétablir »). */
export function tenantConfigDefaut(): TenantConfig {
  return TENANT_DEFAUT;
}

/** Y a-t-il une personnalisation enregistrée depuis l'application ? */
export function tenantEstPersonnalise(): boolean {
  return Object.keys(chargerOverride()).length > 0;
}

/**
 * Enregistre une nouvelle identité d'enseigne. Prend effet au RECHARGEMENT de la
 * page (le nom est utilisé à l'import dans une cinquantaine de fichiers).
 * L'appelant est responsable de recharger : `window.location.reload()`.
 */
export function enregistrerTenantConfig(cfg: Partial<TenantConfigModifiable>): void {
  if (typeof localStorage === 'undefined') return;
  const actuel = chargerOverride();
  const fusion: Record<string, unknown> = {
    ...actuel,
    ...cfg,
    siege: { ...(actuel.siege || {}), ...(cfg.siege || {}) },
  };
  localStorage.setItem(CLE_CONFIG, JSON.stringify(fusion));
}

/** Supprime la personnalisation et revient aux valeurs du code (LECLAIRE). */
export function reinitialiserTenantConfig(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(CLE_CONFIG);
}

/**
 * Nom complet d'un magasin, préfixé par l'enseigne : « LECLAIRE ABOBO ».
 *
 * Utiliser CETTE fonction partout plutôt que d'écrire `` `${TENANT.nom} ${id}` ``
 * à la main : le jour où une enseigne veut un autre format (« Abobo — BOBOPTIQUE »),
 * un seul endroit change.
 */
export function nomMagasin(idOuLabel: string): string {
  const brut = (idOuLabel || '').trim();
  if (!brut) return TENANT.nom;
  // Si le libellé contient déjà le nom de l'enseigne, ne pas le doubler
  // (les magasins enregistrés par d'anciennes versions incluaient le préfixe).
  if (brut.toUpperCase().includes(TENANT.nom.toUpperCase())) return brut.toUpperCase();
  return `${TENANT.nom} ${brut.toUpperCase()}`;
}

/**
 * Inverse de `nomMagasin` : retire le préfixe de l'enseigne pour n'afficher que
 * la ville. « LECLAIRE ABOBO » → « ABOBO ».
 *
 * Utilisé partout où la place manque (onglets, colonnes de tableau, en-têtes
 * Excel) ou quand le nom de l'enseigne figure déjà ailleurs sur l'écran.
 */
export function sansEnseigne(label: string): string {
  const brut = (label || '').trim();
  const prefixe = `${TENANT.nom} `.toUpperCase();
  return brut.toUpperCase().startsWith(prefixe) ? brut.slice(prefixe.length).trim() : brut;
}

/** Libellés complets des magasins configurés : « LECLAIRE ABOBO », … */
export function libellesMagasins(): string[] {
  return TENANT.magasins.map(m => nomMagasin(m.label));
}
