import { logger } from '../utils/logger';
/**
 * Service d'envoi de SMS automatique — connecté à Infobip via la fonction edge.
 * La clé API reste côté serveur ; le frontend appelle uniquement /sms/send.
 */

import { serverFetch } from '../utils/supabaseClient';
import { TENANT } from '../config/tenant';

export interface SmsRapport {
  id: string;
  nature: string;
  client: string;
  telephone: string;
  resultat: string;
  date: string;
  message: string;
}

const LS_RAPPORT = 'leclaire_rapport_sms';
const LS_CONFIG_SMS = 'leclaire_config_sms';
const LS_CREDITS_SMS = 'leclaire_credits_sms';

// ── Compteur / crédit de SMS ─────────────────────────────────────────────────
// Permet de saisir le NOMBRE RÉEL de SMS disponibles. Ce compteur diminue à
// chaque SMS envoyé, passe en JAUNE quand il est presque épuisé, puis en ROUGE
// quand il est terminé.
export interface CreditsSms {
  total: number;   // nombre saisi (référence)
  restant: number; // nombre encore disponible
}

const CREDITS_DEFAULT: CreditsSms = { total: 0, restant: 0 };
export const SMS_CREDITS_EVENT = 'sms-credits-updated';

/** Charge le crédit SMS (total saisi + restant). */
export function loadCreditsSms(): CreditsSms {
  try {
    const stored = localStorage.getItem(LS_CREDITS_SMS);
    if (stored) return { ...CREDITS_DEFAULT, ...JSON.parse(stored) };
  } catch (error) {
    logger.error('Erreur chargement crédits SMS:', error);
  }
  return { ...CREDITS_DEFAULT };
}

function persistCredits(c: CreditsSms): void {
  try {
    localStorage.setItem(LS_CREDITS_SMS, JSON.stringify(c));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SMS_CREDITS_EVENT));
  } catch (error) {
    logger.error('Erreur sauvegarde crédits SMS:', error);
  }
}

/** Définit le nombre réel de SMS disponibles (réinitialise total + restant). */
export function setCreditsSms(total: number): void {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  persistCredits({ total: t, restant: t });
}

/** Décrémente le crédit d'un SMS (jamais en dessous de 0). Appelé à chaque envoi réussi. */
export function decrementerCreditSms(): void {
  const c = loadCreditsSms();
  if (c.total <= 0) return; // compteur non configuré : on ne suit pas
  persistCredits({ total: c.total, restant: Math.max(0, c.restant - 1) });
}

/**
 * État du crédit pour l'affichage :
 * - 'ok'     : il reste assez de SMS (> 15 % du total)
 * - 'warn'   : presque terminé (≤ 15 % du total, mais > 0) → JAUNE
 * - 'danger' : terminé (0 restant) → ROUGE
 * - 'none'   : compteur non configuré (total = 0)
 */
export function etatCreditSms(): 'ok' | 'warn' | 'danger' | 'none' {
  const c = loadCreditsSms();
  if (c.total <= 0) return 'none';
  if (c.restant <= 0) return 'danger';
  const seuil = Math.max(5, Math.ceil(c.total * 0.15));
  return c.restant <= seuil ? 'warn' : 'ok';
}

/**
 * Configuration SMS
 */
export interface ConfigSms {
  envoyerBienvenue: boolean;
  messageBienvenue: string;
  envoyerAnniversaire: boolean;
  messageAnniversaire: string;
  envoyerRetrait: boolean;
  messageRetrait: string;
  envoyerVente: boolean;
  messageVente: string;
  // Rappel de renouvellement des verres : envoyé un certain nombre de mois après
  // l'achat de verres (par défaut 20 mois = 1 an et 8 mois) pour inviter le
  // client à renouveler son équipement avant péremption/évolution de la vue.
  envoyerRenouvellement: boolean;
  messageRenouvellement: string;
  delaiRenouvellementMois: number;
}

const CONFIG_DEFAULT: ConfigSms = {
  envoyerBienvenue: true,
  messageBienvenue: `Bienvenue chez ${TENANT.nom} ! Nous sommes ravis de vous compter parmi nos clients. Pour toute question, n'hésitez pas à nous contacter.`,
  envoyerAnniversaire: true,
  messageAnniversaire: `Bonjour, ${TENANT.nom} vous souhaite un heureux et joyeux anniversaire. Excellente journée, au plaisir de vous voir.`,
  envoyerRetrait: true,
  messageRetrait: `Bonjour, vos lunettes sont prêtes et disponibles en magasin. Vous pouvez passer les récupérer. Merci de votre confiance — ${TENANT.nom}.`,
  envoyerVente: true,
  messageVente: `Merci pour votre achat chez ${TENANT.nom} ! Nous vous remercions de votre confiance et restons à votre disposition. À très bientôt.`,
  envoyerRenouvellement: true,
  messageRenouvellement: `Bonjour, cela fait bientôt 2 ans que vous avez acheté vos verres chez ${TENANT.nom}. Vos verres arrivent en fin de vie : pensez à les renouveler pour préserver votre confort visuel. Passez nous voir, nous serons ravis de vous accueillir.`,
  delaiRenouvellementMois: 20,
};

/**
 * Normalise un numéro de téléphone au format international attendu par Infobip.
 * Côte d'Ivoire : indicatif 225. Les numéros locaux à 10 chiffres (commençant
 * par 0, ex. 0700000000) deviennent 2250700000000. Les entrées déjà
 * internationales (+225…, 00225…, 225…) sont conservées.
 */
export function normaliserTelephone(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('225')) return s;
  // Numéro local ivoirien (10 chiffres) ou ancien format (8 chiffres) → préfixer 225
  if (s.length === 10 || s.length === 8) return '225' + s;
  return s;
}

/**
 * Charger la configuration SMS
 */
export function loadConfigSms(): ConfigSms {
  try {
    const stored = localStorage.getItem(LS_CONFIG_SMS);
    if (stored) {
      return { ...CONFIG_DEFAULT, ...JSON.parse(stored) };
    }
  } catch (error) {
    logger.error('Erreur chargement config SMS:', error);
  }
  return CONFIG_DEFAULT;
}

/**
 * Sauvegarder la configuration SMS
 */
export function saveConfigSms(config: ConfigSms): void {
  try {
    localStorage.setItem(LS_CONFIG_SMS, JSON.stringify(config));
  } catch (error) {
    logger.error('Erreur sauvegarde config SMS:', error);
  }
}

/**
 * Charger le rapport SMS
 */
function loadRapport(): SmsRapport[] {
  try {
    return JSON.parse(localStorage.getItem(LS_RAPPORT) || '[]');
  } catch {
    return [];
  }
}

/**
 * Sauvegarder le rapport SMS
 */
function saveRapport(data: SmsRapport[]): void {
  try {
    localStorage.setItem(LS_RAPPORT, JSON.stringify(data));
  } catch (error) {
    logger.error('Erreur sauvegarde rapport SMS:', error);
  }
}

/** Ajoute/actualise une entrée du rapport SMS. */
function upsertRapport(entry: SmsRapport): void {
  const rapports = loadRapport();
  const idx = rapports.findIndex(r => r.id === entry.id);
  if (idx >= 0) rapports[idx] = entry; else rapports.unshift(entry);
  saveRapport(rapports);
}

/** Indique si le service Infobip est configuré côté serveur. */
export async function isSmsConfigure(): Promise<{ configured: boolean; sender?: string }> {
  try {
    const res = await serverFetch('/sms/status');
    const json = await res.json();
    return json?.data || { configured: false };
  } catch {
    return { configured: false };
  }
}

/**
 * Envoi RÉEL d'un SMS via Infobip (fonction edge). Enregistre le résultat dans
 * le rapport et renvoie le statut. Utilisé par tous les envois (auto ou manuel).
 */
export async function envoyerSmsReel(params: {
  client: string;
  telephone: string;
  message: string;
  nature?: string;
}): Promise<{ success: boolean; error?: string }> {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const base: SmsRapport = {
    id,
    nature: params.nature || 'SMS Personnalisé',
    client: params.client,
    telephone: params.telephone,
    resultat: 'En cours',
    date: new Date().toISOString(),
    message: params.message,
  };

  if (!params.telephone?.trim() || !params.message?.trim()) {
    upsertRapport({ ...base, resultat: 'Échec' });
    return { success: false, error: 'Numéro ou message manquant' };
  }

  const to = normaliserTelephone(params.telephone);
  if (!to) {
    upsertRapport({ ...base, resultat: 'Échec' });
    return { success: false, error: 'Numéro invalide' };
  }

  upsertRapport(base);
  try {
    const res = await serverFetch('/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message: params.message }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.success) {
      upsertRapport({ ...base, resultat: 'Envoyé' });
      decrementerCreditSms(); // le compteur de SMS diminue à chaque envoi réussi
      logger.log(`📤 SMS envoyé à ${params.client} (${params.telephone})`);
      return { success: true };
    }
    const error = json?.error || `Erreur serveur (HTTP ${res.status})`;
    upsertRapport({ ...base, resultat: 'Échec' });
    logger.warn('❌ SMS non envoyé:', error);
    return { success: false, error };
  } catch (err) {
    upsertRapport({ ...base, resultat: 'Échec' });
    return { success: false, error: String((err as Error)?.message || err) };
  }
}

/**
 * Envoyer un SMS de bienvenue à un nouveau client
 */
export function envoyerSmsBienvenue(client: {
  nom: string;
  telephone: string;
}): boolean {
  const config = loadConfigSms();

  // Vérifier si l'envoi automatique est activé
  if (!config.envoyerBienvenue) {
    logger.log('📵 Envoi SMS bienvenue désactivé');
    return false;
  }

  // Vérifier que le client a un numéro de téléphone
  if (!client.telephone || client.telephone.trim() === '') {
    logger.warn('⚠️ Impossible d\'envoyer SMS: pas de numéro de téléphone');
    return false;
  }

  // Envoi réel via Infobip (en arrière-plan ; le rapport est mis à jour au retour)
  void envoyerSmsReel({
    client: client.nom,
    telephone: client.telephone,
    message: config.messageBienvenue,
    nature: 'Bienvenue Client',
  });
  return true;
}

/**
 * Envoyer un SMS personnalisé
 */
export function envoyerSmsPersonnalise(params: {
  client: string;
  telephone: string;
  message: string;
  nature?: string;
}): boolean {
  if (!params.telephone || params.telephone.trim() === '') {
    logger.warn('⚠️ Impossible d\'envoyer SMS: pas de numéro de téléphone');
    return false;
  }

  if (!params.message || params.message.trim() === '') {
    logger.warn('⚠️ Impossible d\'envoyer SMS: pas de message');
    return false;
  }

  // Envoi réel via Infobip (en arrière-plan)
  void envoyerSmsReel(params);
  return true;
}

/**
 * Envoyer un SMS d'anniversaire
 */
export function envoyerSmsAnniversaire(client: {
  nom: string;
  telephone: string;
}): boolean {
  const config = loadConfigSms();

  if (!config.envoyerAnniversaire) {
    logger.log('📵 Envoi SMS anniversaire désactivé');
    return false;
  }

  return envoyerSmsPersonnalise({
    client: client.nom,
    telephone: client.telephone,
    message: config.messageAnniversaire,
    nature: 'Anniversaire',
  });
}

/**
 * Envoyer un SMS de retrait (lunettes prêtes) à un client.
 */
export function envoyerSmsRetrait(client: { nom: string; telephone: string }): boolean {
  const config = loadConfigSms();
  if (!config.envoyerRetrait) return false;
  if (!client.telephone || client.telephone.trim() === '') return false;
  void envoyerSmsReel({
    client: client.nom,
    telephone: client.telephone,
    message: config.messageRetrait,
    nature: 'Retrait Lunettes',
  });
  return true;
}

/**
 * Envoyer un SMS de remerciement après une vente/facture. Idempotent : un seul
 * SMS par vente (dédoublonnage permanent par id). À appeler à la création d'une
 * vente réelle (type "vente", pas un devis).
 */
export function envoyerSmsRemerciementVente(vente: { id: string; client?: string; telephone?: string }): boolean {
  const config = loadConfigSms();
  if (!config.envoyerVente) return false;
  if (!vente.telephone || vente.telephone.trim() === '') return false;
  if (dejaNotifiePermanent('vente', vente.id)) return false;
  void envoyerSmsReel({
    client: vente.client || 'Client',
    telephone: vente.telephone,
    message: config.messageVente,
    nature: 'Remerciement Vente',
  });
  return true;
}

// ── Envois automatiques quotidiens (scan au démarrage) ───────────────────────

/** Empêche les doublons : marque une clé comme déjà traitée pour la journée. */
function dejaTraiteAujourdhui(prefix: string, id: string): boolean {
  const key = `leclaire_sms_${prefix}`;
  const today = new Date().toISOString().slice(0, 10);
  let store: Record<string, string> = {};
  try { store = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
  if (store[id] === today) return true;
  store[id] = today;
  // Purge des entrées anciennes pour éviter la croissance infinie
  for (const k of Object.keys(store)) if (store[k] !== today) delete store[k];
  try { localStorage.setItem(key, JSON.stringify(store)); } catch {}
  return false;
}

/** Marqueur permanent (une seule notification par identifiant, jamais réinitialisé). */
function dejaNotifiePermanent(prefix: string, id: string): boolean {
  const key = `leclaire_sms_done_${prefix}`;
  let ids: string[] = [];
  try { ids = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  if (ids.includes(id)) return true;
  ids.push(id);
  // Borne la taille (garde les 2000 plus récents)
  if (ids.length > 2000) ids = ids.slice(-2000);
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch {}
  return false;
}

/**
 * Parcourt tous les clients et envoie un SMS d'anniversaire à ceux dont c'est
 * l'anniversaire aujourd'hui (une seule fois par client et par jour).
 */
async function chargerClientsParMagasin(): Promise<Record<string, import('./clientsService').ClientRow[]>> {
  const { chargerTousLesClients } = await import('./clientsService');
  const { getAllMagasinIds } = await import('../constants/magasins');
  return chargerTousLesClients(getAllMagasinIds());
}

export async function envoyerAnniversairesDuJour(
  clientsParMagasin?: Record<string, import('./clientsService').ClientRow[]>,
): Promise<number> {
  const config = loadConfigSms();
  if (!config.envoyerAnniversaire) return 0;
  try {
    const now = new Date();
    const jour = String(now.getDate());
    const mois = String(now.getMonth() + 1);
    const byMag = clientsParMagasin || await chargerClientsParMagasin();
    let envoyes = 0;
    for (const rows of Object.values(byMag)) {
      for (const c of rows) {
        const j = String(parseInt(c.jour_naissance || '', 10));
        const m = String(parseInt(c.mois_naissance || '', 10));
        if (j === jour && m === mois && c.telephone) {
          if (dejaTraiteAujourdhui('anniv', c.id)) continue;
          void envoyerSmsReel({
            client: c.nom,
            telephone: c.telephone,
            message: config.messageAnniversaire,
            nature: 'Anniversaire',
          });
          envoyes++;
        }
      }
    }
    if (envoyes) logger.log(`🎂 ${envoyes} SMS d'anniversaire envoyés`);
    return envoyes;
  } catch (err) {
    logger.error('❌ envoyerAnniversairesDuJour:', err);
    return 0;
  }
}

const STATUTS_PRETS = ['prêt', 'pret', 'prête', 'disponible', 'récupérable', 'recuperable', 'retour magasin', 'livré magasin', 'livre magasin'];

/**
 * Parcourt les bons de commande verres et notifie les clients dont la commande
 * est prête à être récupérée (statut "prêt"/"disponible"…). Le téléphone est
 * retrouvé en associant le nom du client à la fiche client. Chaque bon n'est
 * notifié qu'une seule fois.
 */
export async function envoyerRetraitsDuJour(
  clientsParMagasin?: Record<string, import('./clientsService').ClientRow[]>,
): Promise<number> {
  const config = loadConfigSms();
  if (!config.envoyerRetrait) return 0;
  try {
    const { chargerBonsCommandeVerres } = await import('./atelierService');
    const bons = await chargerBonsCommandeVerres();
    if (!bons || !bons.length) return 0;

    const byMag = clientsParMagasin || await chargerClientsParMagasin();
    const telParNom = new Map<string, string>();
    for (const rows of Object.values(byMag)) {
      for (const c of rows) {
        if (c.nom && c.telephone) telParNom.set(c.nom.trim().toLowerCase(), c.telephone);
      }
    }

    let envoyes = 0;
    for (const b of bons) {
      const statut = (b.statut || '').trim().toLowerCase();
      if (!statut || !STATUTS_PRETS.some(s => statut.includes(s))) continue;
      const nom = (b.client || '').trim();
      if (!nom) continue;
      const tel = telParNom.get(nom.toLowerCase());
      if (!tel) continue;
      if (dejaNotifiePermanent('retrait', b.id)) continue;
      void envoyerSmsReel({
        client: nom,
        telephone: tel,
        message: config.messageRetrait,
        nature: 'Retrait Lunettes',
      });
      envoyes++;
    }
    if (envoyes) logger.log(`👓 ${envoyes} SMS de retrait envoyés`);
    return envoyes;
  } catch (err) {
    logger.error('❌ envoyerRetraitsDuJour:', err);
    return 0;
  }
}

/**
 * Rappel de renouvellement des verres : parcourt toutes les ventes réelles
 * comportant des verres et notifie les clients dont l'achat remonte à AU MOINS
 * `delaiRenouvellementMois` (par défaut 20 mois = 1 an et 8 mois). Chaque vente
 * n'est notifiée qu'une seule fois (dédoublonnage permanent).
 */
export async function envoyerRenouvellementsDuJour(): Promise<number> {
  const config = loadConfigSms();
  if (!config.envoyerRenouvellement) return 0;
  try {
    const { chargerToutesLesVentes } = await import('./ventesService');
    const ventes = await chargerToutesLesVentes();
    if (!ventes || !ventes.length) return 0;

    const delai = config.delaiRenouvellementMois || 20;
    const seuil = new Date();
    seuil.setMonth(seuil.getMonth() - delai);

    let envoyes = 0;
    for (const v of ventes) {
      // Uniquement les ventes réelles (pas les devis) comportant des verres.
      if (v.type !== 'vente') continue;
      if (!Array.isArray(v.verres) || v.verres.length === 0) continue;
      if (!v.telephone || !v.telephone.trim()) continue;
      const dateAchat = new Date(v.date || v.created_at || '');
      if (isNaN(dateAchat.getTime())) continue;
      // On notifie dès que l'achat a dépassé le délai (fenêtre ouverte : le
      // dédoublonnage permanent garantit un seul envoi par vente).
      if (dateAchat > seuil) continue;
      if (dejaNotifiePermanent('renouvellement', v.id)) continue;
      void envoyerSmsReel({
        client: v.client || 'Client',
        telephone: v.telephone,
        message: config.messageRenouvellement,
        nature: 'Renouvellement Verres',
      });
      envoyes++;
    }
    if (envoyes) logger.log(`🔁 ${envoyes} SMS de renouvellement envoyés`);
    return envoyes;
  } catch (err) {
    logger.error('❌ envoyerRenouvellementsDuJour:', err);
    return 0;
  }
}

/** Déclenche les envois automatiques quotidiens (anniversaires + retraits + renouvellements). */
export async function lancerEnvoisAutomatiques(): Promise<void> {
  const { configured } = await isSmsConfigure();
  if (!configured) return;
  const config = loadConfigSms();
  if (!config.envoyerAnniversaire && !config.envoyerRetrait && !config.envoyerRenouvellement) return;
  try {
    // Charger les clients UNE SEULE FOIS et enchaîner les scans en SÉQUENCE :
    // deux téléchargements complets simultanés au démarrage saturaient la
    // fonction edge (AbortError). On réutilise le même jeu de données.
    const byMag = await chargerClientsParMagasin();
    await envoyerAnniversairesDuJour(byMag);
    await envoyerRetraitsDuJour(byMag);
    await envoyerRenouvellementsDuJour();
  } catch (err) {
    logger.warn('⚠️ Envois SMS automatiques différés (chargement interrompu):', (err as Error)?.message || err);
  }
}

/**
 * Obtenir les statistiques SMS
 */
export function getStatistiquesSms(): {
  total: number;
  envoyes: number;
  echecs: number;
  dernierEnvoi?: SmsRapport;
} {
  const rapports = loadRapport();

  return {
    total: rapports.length,
    envoyes: rapports.filter(r => r.resultat === 'Envoyé').length,
    echecs: rapports.filter(r => r.resultat === 'Échec').length,
    dernierEnvoi: rapports[0],
  };
}
