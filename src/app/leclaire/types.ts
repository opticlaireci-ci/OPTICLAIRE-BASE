/**
 * LECLAIRE (caisse des ouvertures de magasins et des missions) — types.
 * Données à part d'OPTICLAIRE : tables `leclaire_caisse_*` (voir
 * supabase/LECLAIRE_CAISSE_2026-11-18.sql).
 */
export type TransactionType = 'income' | 'expense'

export type PaymentMethod = 'Espèces' | 'Virement' | 'Mobile Money' | 'Chèque' | 'Carte'

/** Rôle dans LECLAIRE (donné par les cases de Gestion des utilisateurs). */
export type UserRole = 'superadmin' | 'admin' | 'user'

/** Administrateur LECLAIRE : voit les données de tout le monde. */
export function isPrivilegedRole(role: UserRole): boolean {
  return role === 'admin' || role === 'superadmin'
}

/** Personne LECLAIRE (fiche `leclaire_caisse_utilisateurs`). */
export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  /** Compte de connexion OPTICLAIRE ; vide pour une ancienne personne non rattachée. */
  compte?: string | null
  /** Rôle dans l'ancienne application LECLAIRE (personnes reprises). */
  ancienRole?: string | null
  createdAt: string
}

export interface Shop {
  id: string
  name: string
  createdAt: string
}

export interface Transaction {
  id: string
  userId: string
  storeId?: string
  type: TransactionType
  amount: number
  date: string
  description: string
  category: string
  paymentMethod: PaymentMethod
  beneficiaryOrSource: string
  comment: string
  // Nom du magasin au moment de l'enregistrement : le mouvement reste rattaché
  // au magasin même si celui-ci est recréé avec un autre identifiant.
  storeName?: string
  attachmentName?: string
  /** Type du justificatif (image/jpeg, application/pdf…). */
  attachmentType?: string
  /** Chemin du justificatif dans l'espace privé « leclaire-justificatifs ». */
  attachmentPath?: string
  /**
   * Contenu `data:` d'un NOUVEAU justificatif choisi dans le formulaire (pas
   * encore déposé). Jamais rempli à la lecture : le fichier est chargé à la
   * demande depuis le stockage.
   */
  attachmentData?: string
  createdAt: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  userId: string
  userName: string
  userRole?: UserRole
  action: string
  transactionId?: string
  description: string
  createdAt: string
}

export interface AppSettings {
  currency: string
  currencyCode: string
  allowOverdraft: boolean
  requireAttachment: boolean
  companyName: string
}

export type View =
  | 'dashboard'
  | 'movements'
  | 'stores'
  | 'statistics'
  | 'categories'
  | 'justificatifs'
  | 'history'
  | 'users'
  | 'settings'
  | 'import'

export interface ToastMsg {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export interface ModalState {
  open: boolean
  mode: 'income' | 'expense'
  editing?: Transaction
}
