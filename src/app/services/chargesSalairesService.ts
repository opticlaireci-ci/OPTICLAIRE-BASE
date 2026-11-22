/**
 * Charges du mois et salaires des employés — lecture / écriture Supabase.
 *
 * Table protégée `charges_salaires_mois` (supabase/CHARGES_SALAIRES_2026-11-23.sql) :
 * seuls les administrateurs, directeurs et comptables y accèdent. Rien n'est
 * gardé dans le navigateur (pas de clé locale : les salaires ne passent pas
 * par la synchronisation d'OPTICLAIRE).
 */
import { supabase } from '../utils/supabaseClient';
import { moisVide, type ChargesMois, type LigneMois, type SalairesMois } from '../utils/chargesSalaires';

const TABLE = 'charges_salaires_mois';
export const SCRIPT_CHARGES_SALAIRES = 'supabase/CHARGES_SALAIRES_2026-11-23.sql';

export class TableChargesAbsente extends Error {
  constructor() {
    super(`La table des charges et salaires n'est pas encore créée dans Supabase : exécutez le script ${SCRIPT_CHARGES_SALAIRES} (SQL Editor), puis actualisez la page.`);
    this.name = 'TableChargesAbsente';
  }
}
export class AccesRefuse extends Error {
  constructor() {
    super('Accès refusé : seuls les administrateurs, directeurs et comptables voient et modifient les charges et salaires.');
    this.name = 'AccesRefuse';
  }
}

function echec(err: any, action: string): never {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || '');
  if (['PGRST205', '42P01'].includes(code) || /could not find the table|does not exist|schema cache/i.test(msg)) throw new TableChargesAbsente();
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) throw new AccesRefuse();
  throw new Error(`${action} : ${msg}`);
}

const COLONNES = 'mois, charges, salaires, modifie_par, modifie_le';

/**
 * Le mois demandé et son mois de référence : le mois REMPLI le plus proche
 * AVANT lui (à défaut, le plus proche après). Un mois enregistré vide est
 * ignoré. La ligne « modele » n'est pas un mois (« modele » vient après
 * « 2026-… » dans l'ordre).
 */
export async function chargerMois(mois: string): Promise<{ ligne: LigneMois | null; reference: LigneMois | null }> {
  const { data, error } = await supabase.from(TABLE).select(COLONNES).lte('mois', mois).order('mois', { ascending: false }).limit(24);
  if (error) echec(error, 'Lecture des charges et salaires');
  const avant = ((data || []) as LigneMois[]).filter(l => l.mois !== 'modele');
  const ligne = avant.find(l => l.mois === mois && !moisVide(l)) || null;
  if (ligne) return { ligne, reference: null };
  const precedent = avant.find(l => l.mois !== mois && !moisVide(l));
  if (precedent) return { ligne: null, reference: precedent };
  const { data: apres, error: e2 } = await supabase.from(TABLE).select(COLONNES).gt('mois', mois).neq('mois', 'modele').order('mois', { ascending: true }).limit(24);
  if (e2) echec(e2, 'Lecture des charges et salaires');
  return { ligne: null, reference: ((apres || []) as LigneMois[]).find(l => !moisVide(l)) || null };
}

/** Mois enregistrés APRÈS ce mois (pour y reporter une correction). */
export async function chargerMoisSuivants(mois: string): Promise<LigneMois[]> {
  const { data, error } = await supabase.from(TABLE).select(COLONNES).gt('mois', mois).neq('mois', 'modele').order('mois', { ascending: true });
  if (error) echec(error, 'Lecture des mois suivants');
  // Un mois enregistré vide montre le mois précédent : rien à y reporter.
  return ((data || []) as LigneMois[]).filter(l => !moisVide(l));
}

/**
 * Enregistre une partie du mois (les autres colonnes de la ligne ne sont pas
 * touchées : deux personnes qui modifient l'une les charges, l'autre les
 * salaires ne s'écrasent pas).
 */
export async function enregistrerMois(mois: string, parties: { charges?: ChargesMois; salaires?: SalairesMois }, auteur: string): Promise<string> {
  const modifie_le = new Date().toISOString();
  const ligne: Record<string, unknown> = { mois, modifie_par: auteur, modifie_le };
  if (parties.charges) ligne.charges = parties.charges;
  if (parties.salaires) ligne.salaires = parties.salaires;
  const { data, error } = await supabase.from(TABLE).upsert(ligne, { onConflict: 'mois' }).select('mois');
  if (error) echec(error, 'Enregistrement des charges et salaires');
  if (!data || !data.length) throw new AccesRefuse();
  return modifie_le;
}
