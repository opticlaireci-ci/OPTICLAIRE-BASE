/**
 * LECLAIRE — outils d'affichage et de calcul (repris de l'application
 * LECLAIRE). Plus aucune donnée n'est gardée dans le navigateur : tout est
 * lu et écrit dans les tables LECLAIRE de Supabase (leclaireService.ts).
 */
import type { Transaction, AppSettings } from './types'

export const genId = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36)

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'FCFA',
  currencyCode: 'XOF',
  allowOverdraft: false,
  requireAttachment: false,
  companyName: 'LECLAIRE',
}

export function formatFCFA(amount: number, currency = 'FCFA'): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' ' + currency
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function calcBalance(transactions: Transaction[]): number {
  return transactions.reduce(
    (acc, t) => (t.type === 'income' ? acc + t.amount : acc - t.amount),
    0,
  )
}

export function calcTotalIncome(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0)
}

export function calcTotalExpense(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0)
}

export const DEFAULT_CATEGORIES: string[] = [
  'Alimentation',
  'Transport',
  'Loyer',
  'Électricité',
  'Eau',
  'Internet',
  'Salaire',
  'Fournitures',
  'Achat',
  'Santé',
  'Communication',
  'Autre',
]

export function roleLabel(role: string): string {
  if (role === 'superadmin') return 'Super Admin'
  if (role === 'admin') return 'Administrateur'
  return 'Utilisateur'
}

export const PAYMENT_METHODS: string[] = [
  'Espèces',
  'Virement',
  'Mobile Money',
  'Chèque',
  'Carte',
]
