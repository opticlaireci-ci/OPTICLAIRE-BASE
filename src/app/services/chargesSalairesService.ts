/**
 * Charges du mois et salaires des employés — lecture / écriture Supabase.
 *
 * Table protégée `charges_salaires_mois` (supabase/CHARGES_SALAIRES_2026-11-23.sql) :
 * seuls les administrateurs, directeurs et comptables y accèdent. Rien n'est
 * gardé dans le navigateur (pas de clé locale : les salaires ne passent pas
 * par la synchronisation d'OPTICLAIRE).
 */
import { supabase } from '../utils/supabaseClient';
import { ajouterMois, type ChargesMois, type LigneMois, type SalairesMois } from '../utils/chargesSalaires';

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

/** Le mois demandé, le mois précédent et le modèle (dernier mois enregistré). */
export async function chargerMois(mois: string): Promise<{ ligne: LigneMois | null; precedent: LigneMois | null; modele: LigneMois | null }> {
  const avant = ajouterMois(mois, -1);
  const { data, error } = await supabase.from(TABLE).select('mois, charges, salaires, modifie_par, modifie_le').in('mois', [mois, avant, 'modele']);
  if (error) echec(error, 'Lecture des charges et salaires');
  const lignes = (data || []) as LigneMois[];
  return {
    ligne: lignes.find(l => l.mois === mois) || null,
    precedent: lignes.find(l => l.mois === avant) || null,
    modele: lignes.find(l => l.mois === 'modele') || null,
  };
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
