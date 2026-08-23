import { resolveUserName } from './auditUtils';
import type { VenteSupabase } from '../services/ventesService';

/**
 * OUTILS PARTAGÉS DU CALL CENTER
 *
 * Le Call Center (par magasin ET global) liste les clients issus des VENTES à
 * rappeler, regroupés PAR VENDEUSE : chaque conseillère appelle les clients à
 * qui elle a vendu pendant le mois sélectionné. À chaque fin de mois, la liste
 * du mois courant se remplit automatiquement à partir des ventes.
 */

// Contact à appeler, dérivé d'une vente.
export interface CallContact {
  id: string;          // clé de dédup (téléphone ou nom)
  numRef: string;      // n° du document
  client: string;
  telephone?: string;
  motif?: string;      // 'Facture' | 'Devis'
  rendezVous?: string; // date du dernier achat
  date?: string;
  vendeuse: string;    // nom résolu de la vendeuse (edite_par)
  magasinId: string;
  source?: 'vente' | 'import'; // origine du contact ('vente' par défaut)
  extraId?: string;    // id du contact ajouté/importé (pour la suppression)
}

/**
 * Client ajouté manuellement OU importé (CSV) dans le Call Center, rattaché à un
 * magasin et à un mois `YYYY-MM`. Stocké dans Firestore (app_data) par magasin.
 */
export interface ExtraContact {
  id: string;
  client: string;
  telephone?: string;
  vendeuse?: string;   // conseillère assignée (optionnel)
  month: string;       // clé de mois `YYYY-MM`
  createdAt?: string;
}

/** Clé de stockage des clients ajoutés/importés d'un magasin. */
export const EXTRA_KEY = (magasinId: string) => `leclaire_callcenter_extra_${magasinId}`;

/** Convertit les clients ajoutés/importés d'un mois en contacts à appeler. */
export function extrasToContacts(extras: ExtraContact[], monthKey: string, magasinId: string): CallContact[] {
  return extras
    .filter(e => e.month === monthKey)
    .map(e => ({
      id: `extra__${e.id}`,
      numRef: e.id,
      client: (e.client || '').trim() || 'Client sans nom',
      telephone: (e.telephone || '').trim(),
      motif: 'Importé',
      rendezVous: e.createdAt,
      date: e.createdAt,
      vendeuse: (e.vendeuse || '').trim() || 'Clients importés',
      magasinId: (magasinId || '').toUpperCase(),
      source: 'import' as const,
      extraId: e.id,
    }));
}

/**
 * Analyse un contenu CSV en liste de {client, telephone, vendeuse}.
 * Accepte les séparateurs `,` `;` ou tabulation, avec ou sans ligne d'en-tête.
 * Colonnes reconnues (si en-tête) : nom/client, telephone/tel/phone, vendeuse/conseillere.
 */
export function parseClientsCsv(content: string): { client: string; telephone: string; vendeuse: string }[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const splitLine = (l: string) => l.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));

  const first = splitLine(lines[0]).map(c => c.toLowerCase());
  const hasHeader = first.some(c => /nom|client|tel|phone|vendeu|conseil/.test(c));
  let idxNom = 0, idxTel = 1, idxVend = -1;
  let start = 0;
  if (hasHeader) {
    start = 1;
    const find = (re: RegExp) => first.findIndex(c => re.test(c));
    const n = find(/nom|client/); if (n >= 0) idxNom = n;
    const t = find(/tel|phone/); if (t >= 0) idxTel = t;
    const v = find(/vendeu|conseil/); if (v >= 0) idxVend = v;
  }

  const out: { client: string; telephone: string; vendeuse: string }[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const client = (cols[idxNom] || '').trim();
    const telephone = (cols[idxTel] || '').trim();
    const vendeuse = idxVend >= 0 ? (cols[idxVend] || '').trim() : '';
    if (client || telephone) out.push({ client, telephone, vendeuse });
  }
  return out;
}

// Rôles ayant une vue globale (voient TOUTES les vendeuses). Les autres
// (conseillère, opticien, caissier…) ne voient que LEURS propres clients.
// Rôles voyant TOUS les clients du Call Center (et pas seulement leurs propres
// ventes) : le responsable Call Center supervise l'ensemble des magasins.
const ADMIN_ROLES = ['super_admin', 'admin', 'administrateur', 'manager', 'directeur', 'comptable', 'responsable_call_center'];

export function isAdminRole(role?: string): boolean {
  return ADMIN_ROLES.includes(role || '');
}

/** Clé de mois `YYYY-MM` d'une date ISO/`YYYY-MM-DD`. */
export function monthKeyOf(dateStr: string): string {
  return (dateStr || '').slice(0, 7);
}

/** Clé du mois courant. */
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Libellé lisible d'une clé de mois (ex. « août 2026 »). */
export function monthLabel(key: string): string {
  if (!key || key.length < 7) return key;
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/**
 * Liste des mois disponibles (les plus récents d'abord), déduits des ventes,
 * en garantissant la présence du mois courant même s'il n'a pas encore de vente.
 */
export function listMonthOptions(ventes: VenteSupabase[], max = 12): string[] {
  const set = new Set<string>();
  set.add(currentMonthKey());
  for (const v of ventes) {
    const k = monthKeyOf(v.date || '');
    if (k) set.add(k);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a)).slice(0, max);
}

/** Nom résolu de la vendeuse d'une vente. */
export function vendeuseOf(v: VenteSupabase): string {
  return resolveUserName((v as any).editePar || (v as any).createdBy || v.edite_par) || 'Non attribué';
}

/**
 * Vrai si la vendeuse `nom` correspond à l'utilisateur connecté.
 * `edite_par` est renseigné à la création avec `user.nom || user.prenom || user.email`,
 * on compare donc de façon tolérante contre toutes ces identités.
 */
export function matchesUser(vendeuse: string, user: any): boolean {
  if (!user) return false;
  const norm = (s?: string) => (s || '').trim().toLowerCase();
  const cible = norm(vendeuse);
  if (!cible || cible === 'non attribué') return false;
  const candidats = [
    user.nom, user.prenom, user.name, user.email,
    (user.email || '').split('@')[0],
    `${user.prenom || ''} ${user.nom || ''}`,
    `${user.prenom || ''} ${user.name || ''}`,
  ].map(norm).filter(Boolean);
  return candidats.includes(cible);
}

/**
 * Construit les contacts à appeler pour un mois donné à partir des ventes.
 * - filtre sur le mois `monthKey`
 * - ne garde que les VENTES (les devis sont exclus par défaut)
 * - conserve la vente la plus récente par (vendeuse + client)
 */
export function buildContacts(
  ventes: VenteSupabase[],
  monthKey: string,
  opts: { includeDevis?: boolean } = {},
): CallContact[] {
  const map = new Map<string, CallContact>();
  for (const v of ventes) {
    if (monthKeyOf(v.date || '') !== monthKey) continue;
    if (!opts.includeDevis && v.type === 'devis') continue;
    const nom = (v.client || '').trim();
    const tel = (v.telephone || v.telephone2 || '').trim();
    if (!nom && !tel) continue;
    const vendeuse = vendeuseOf(v);
    const cle = `${vendeuse.toLowerCase()}__${tel || nom.toLowerCase()}`;
    const prev = map.get(cle);
    if (prev && (prev.rendezVous || '') >= (v.date || '')) continue;
    map.set(cle, {
      id: `${v.magasin_id}__${tel || nom.toLowerCase()}`,
      numRef: v.numero_client || v.id,
      client: nom || 'Client sans nom',
      telephone: tel,
      motif: v.type === 'devis' ? 'Devis' : 'Facture',
      rendezVous: v.date,
      date: v.date,
      vendeuse,
      magasinId: (v.magasin_id || '').toUpperCase(),
    });
  }
  return Array.from(map.values()).sort((a, b) => (b.rendezVous || '').localeCompare(a.rendezVous || ''));
}

/** Regroupe des contacts par vendeuse (trié par nom de vendeuse). */
export function groupByVendeuse(contacts: CallContact[]): { vendeuse: string; contacts: CallContact[] }[] {
  const map = new Map<string, CallContact[]>();
  for (const c of contacts) {
    if (!map.has(c.vendeuse)) map.set(c.vendeuse, []);
    map.get(c.vendeuse)!.push(c);
  }
  return Array.from(map.entries())
    .map(([vendeuse, list]) => ({ vendeuse, contacts: list }))
    .sort((a, b) => a.vendeuse.localeCompare(b.vendeuse));
}
