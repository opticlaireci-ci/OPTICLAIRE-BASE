import { getDocs, query, where, collection } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { ajouterReglement } from './reglementsService';
import { ajouterVente } from './ventesService';
import { upsertClient } from './clientsService';
import { calculerTotalLignesVente } from '../utils/venteTotals';

export interface ImportReglementInput {
  montant: number;
  date: string;
  mode_paiement?: string;
  compte_banque?: string;
  recu?: string;
  details?: string;
}

export interface ImportDocumentInput {
  name: string;
  type: string;
  size: number;
  relativePath?: string;
  /** Contenu du fichier : n'est plus lu ni stocké (seul le nom est conservé). */
  dataBase64?: string;
}

export interface LegacyClientImportPayload {
  magasinId: string;
  originalClientId?: string;
  numeroClient?: string;
  civilite?: string;
  nom: string;
  telephone?: string;
  telephone2?: string;
  email?: string;
  adresse?: string;
  profession?: string;
  dateNaissance?: string;
  matriculeAssurance?: string;
  entreprise?: string;
  ophtalmologue?: string;
  telOphtalmologue?: string;
  cabinetOphtalmologue?: string;
  telCabinet?: string;
  solde?: number;
  venteDate: string;
  totalBrut: number;
  totalNet: number;
  remisePct?: number;
  articles?: any[];
  verres?: any[];
  bonsAssurance?: any[];
  ordonnance?: any;
  acompteInitial?: number;
  acompteDisponible?: number;
  acompteDate?: string;
  modePaiementAcompte?: string;
  compteBanqueAcompte?: string;
  detailsAcompte?: string;
  reglements?: ImportReglementInput[];
  documents?: ImportDocumentInput[];
  notesImport?: string;
  sourceLogiciel?: string;
  conseillere?: string;
  numeroFacture?: string;
  rdvRetrait?: string;
  dateRecuperation?: string;
}

function safeId(value: string): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'import';
}

function money(n: any): number {
  const v = Number(String(n ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

function normalizeImportDate(value: any): string {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s.slice(0, 10);
}

function estVenteImportee(v: any): boolean {
  return !!(v?.recap?.imported || v?.source_import === 'ancien_logiciel' || v?.import_id);
}

/**
 * Identité d'un ancien dossier : magasin + n° client + date + n° facture.
 * Vide si le n° client manque (pas d'identité fiable → pas de rapprochement).
 * Un n° facture GÉNÉRÉ (IMP-<horodatage>) n'identifie rien : il est ignoré.
 */
function cleDossierImporte(magasinId: any, numeroClient: any, date: any, numFacture: any): string {
  const client = String(numeroClient || '').trim().toUpperCase();
  if (!client || /^IMP-\d{8,}$/.test(client)) return '';
  const facture = String(numFacture || '').trim().toUpperCase();
  return [
    String(magasinId || '').trim().toUpperCase(),
    client,
    normalizeImportDate(date),
    /^IMP-\d{10,}$/.test(facture) ? '' : facture,
  ].join('|');
}

export async function importerDossierClient(payload: LegacyClientImportPayload): Promise<{ clientId: string; venteId: string; reglementIds: string[]; importId: string; documents: number; dejaImporte: boolean }> {
  const now = new Date().toISOString();
  const numeroClient = payload.numeroClient?.trim() || `IMP-${Date.now().toString().slice(-8)}`;
  const clientId = `client-${safeId(payload.magasinId)}-${safeId(numeroClient)}`;
  const unique = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
  // ── Anti-doublon ──────────────────────────────────────────────────────────
  // Un même ancien dossier (magasin + n° client + date + n° facture) ne doit
  // exister qu'UNE fois. S'il a déjà été importé, on met à jour la vente
  // existante au lieu d'en créer une nouvelle (réimport sans risque).
  const numFacture = payload.numeroFacture || (payload.numeroClient ? `IMP-${numeroClient}` : `IMP-${Date.now()}`);
  const cleImport = cleDossierImporte(payload.magasinId, payload.numeroClient, payload.venteDate, numFacture);
  let existante: any = null;
  if (cleImport) {
    // Recherche CIBLÉE : seules les ventes de CE n° client sont demandées à
    // Supabase (quelques lignes), au lieu de télécharger toutes les ventes du
    // magasin à chaque dossier — ce qui ralentissait les imports à mesure que
    // la base grossissait. Aucune écriture de cache, aucun événement.
    const snap = await getDocs(query(collection(db, 'ventes'),
      where('numero_client', '==', String(payload.numeroClient).trim())))
      .catch(() => null);
    const ventesClient: any[] = snap ? snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) : [];
    existante = ventesClient.find((v: any) => estVenteImportee(v)
      && cleDossierImporte(v.magasin_id, v.numero_client, v.date, v?.recap?.numFacture) === cleImport) || null;
  }
  const venteId: string = existante?.id
    || (cleImport
      ? `vente-import-${safeId(payload.magasinId)}-${safeId(cleImport.replace(/\|/g, '-'))}`.slice(0, 180)
      : `vente-import-${safeId(payload.magasinId)}-${Date.now()}-${unique}-${safeId(numeroClient)}`);
  const importId: string = existante?.import_id || existante?.recap?.importId || `import-${venteId}`;

  const clientName = `${payload.civilite ? payload.civilite.trim() + ' ' : ''}${payload.nom.trim()}`.trim();

  await upsertClient({
    id: clientId,
    magasin_id: payload.magasinId,
    numero_client: numeroClient,
    nom: clientName,
    telephone: payload.telephone || '',
    telephone2: payload.telephone2 || '',
    email: payload.email || '',
    adresse: payload.adresse || '',
    profession: payload.profession || '',
    jour_naissance: payload.dateNaissance ? payload.dateNaissance.slice(8, 10) : '',
    mois_naissance: payload.dateNaissance ? payload.dateNaissance.slice(5, 7) : '',
    annee_naissance: payload.dateNaissance ? payload.dateNaissance.slice(0, 4) : '',
    matricule_assurance: payload.matriculeAssurance || '',
    entreprise: payload.entreprise || '',
    notes: payload.notesImport || '',
    solde: money(payload.solde),
    date_edition: payload.venteDate || now,
    source: `import:${payload.sourceLogiciel || 'ancien logiciel'}`,
    updated_at: now,
  });

  // Pour un ancien dossier, l'acompte disponible indiqué par le logiciel source
  // est prioritaire. Il ne doit jamais être remplacé par le prix de la monture.
  const acompte = money(payload.acompteDisponible ?? payload.acompteInitial);

  // ── TOTAL / TOTAL NET d'origine : seule source de vérité d'un ancien dossier ──
  // La base Supabase (trigger trg_normaliser_totaux_vente) et certains écrans
  // recalculent le total à partir des lignes (monture + verres). Si le prix des
  // verres n'a pas pu être lu, ce recalcul ne gardait que la monture. On
  // verrouille donc les montants d'origine de trois façons :
  //   1. recap.totalBrutOrigine / totalNetOrigine (relus en priorité partout) ;
  //   2. les lignes sont alignées pour que monture + verres = TOTAL ;
  //   3. la remise % est exacte pour que TOTAL − remise = TOTAL NET.
  const totalNetOrigine = money(payload.totalNet);
  const totalBrutOrigine = Math.max(money(payload.totalBrut), totalNetOrigine);
  const articlesImport: any[] = Array.isArray(payload.articles) ? payload.articles.map(a => ({ ...a })) : [];
  const verresImport: any[] = Array.isArray(payload.verres) ? payload.verres.map(v => ({ ...v })) : [];
  const totalArticles = calculerTotalLignesVente({ articles: articlesImport, verres: [] });
  const totalVerresLu = calculerTotalLignesVente({ articles: [], verres: verresImport });
  const partVerres = totalBrutOrigine - totalArticles;
  if (totalBrutOrigine > 0 && totalArticles + totalVerresLu !== totalBrutOrigine && partVerres >= 0) {
    if (verresImport.length > 0) {
      // Les verres portent la différence (prix non lus ou partiellement lus).
      verresImport[0] = { ...verresImport[0], totalVerres: partVerres };
      for (let i = 1; i < verresImport.length; i++) verresImport[i] = { ...verresImport[i], totalVerres: 0, lignes: [] };
    } else if (partVerres > 0) {
      // Aucun verre détaillé : ligne de complément pour que les lignes = TOTAL.
      verresImport.push({ type: 'Verres', prescription: 'Verres (ancien dossier)', quantite: 1, totalVerres: partVerres, lignes: [] });
    }
  }
  let remisePct = Math.min(100, Math.max(0, Number(payload.remisePct || 0)));
  if (totalBrutOrigine > 0 && Math.round(totalBrutOrigine * (1 - remisePct / 100)) !== totalNetOrigine) {
    remisePct = (totalBrutOrigine - totalNetOrigine) / totalBrutOrigine * 100;
  }

  const vente: any = {
    id: venteId,
    magasin_id: payload.magasinId,
    type: 'vente',
    date: payload.venteDate,
    numero_client: numeroClient,
    client: clientName,
    civilite: payload.civilite || '',
    telephone: payload.telephone || '',
    telephone2: payload.telephone2 || '',
    email: payload.email || '',
    adresse: payload.adresse || '',
    profession: payload.profession || '',
    date_naissance: payload.dateNaissance || '',
    matricule_assurance: payload.matriculeAssurance || '',
    entreprise: payload.entreprise || '',
    ophtalmologue: payload.ophtalmologue || '',
    tel_ophtalmologue: payload.telOphtalmologue || '',
    cabinet_ophtalmologue: payload.cabinetOphtalmologue || '',
    tel_cabinet: payload.telCabinet || '',
    verres: verresImport,
    articles: articlesImport,
    bons_assurance: Array.isArray(payload.bonsAssurance) ? payload.bonsAssurance : [],
    recap: {
      remisePct,
      totalBrutOrigine,
      totalNetOrigine,
      acompte,
      acompteDisponible: acompte,
      modePaiement: payload.modePaiementAcompte || '',
      compteBanque: payload.compteBanqueAcompte || '',
      details: payload.detailsAcompte || '',
      rdvRetrait: payload.rdvRetrait || '',
      dateRecuperation: payload.dateRecuperation || '',
      numFacture,
      numRecu: '',
      imported: true,
      importId,
      originalSource: payload.sourceLogiciel || 'ancien logiciel',
      ordonnance: payload.ordonnance || null,
    },
    total_brut: totalBrutOrigine,
    total_net: totalNetOrigine,
    // Pour une vente historique, la conseillère indiquée sur la facture est conservée
    // comme éditrice/vendeuse afin qu'elle reste visible dans les historiques et
    // les statistiques par conseillère. La trace d'import reste séparée.
    edite_par: payload.conseillere || 'IMPORT ANCIEN CLIENT',
    conseillere: payload.conseillere || '',
    vendeur: payload.conseillere || '',
    importe_par: 'IMPORT ANCIEN CLIENT',
    statut: 'Importée',
    source_import: 'ancien_logiciel',
    import_id: importId,
    ordonnance: payload.ordonnance || null,
    documents_importes: (payload.documents || []).map(d => ({ name: d.name, type: d.type, size: d.size, relativePath: d.relativePath || '' })),
    created_at: now,
    updated_at: now,
  };

  // ajouterVente() enregistre une vraie vente et donc la rend visible dans les
  // tableaux de bord. L'import ne déclenche pas de SMS de remerciement grâce au
  // garde global d'import dans la donnée recap/imported.
  await ajouterVente(vente);

  const reglementIds: string[] = [];
  // IMPORTANT : l'acompte historique est déjà porté par recap.acompte.
  // Il ne faut donc PAS créer un deuxième règlement pour ce même acompte,
  // sinon les écrans qui calculent le reste (total - acompte - règlements)
  // le déduisent deux fois et peuvent afficher un reste négatif.
  // Les règlements importés ci-dessous correspondent uniquement aux paiements
  // complémentaires distincts de l'acompte.
  const acompteDate = normalizeImportDate(payload.acompteDate || payload.venteDate);
  let acompteEquivalentIgnore = acompte > 0;

  for (let i = 0; i < (payload.reglements || []).length; i++) {
    const r = payload.reglements![i];
    const montant = money(r.montant);
    if (montant <= 0) continue;

    const regDate = normalizeImportDate(r.date || payload.venteDate);
    const memeAcompte = acompteEquivalentIgnore &&
      montant === acompte &&
      regDate === acompteDate;
    if (memeAcompte) {
      // Ce règlement représente le même acompte déjà stocké dans recap.acompte.
      // On le consomme une seule fois afin de ne pas créer de double paiement.
      acompteEquivalentIgnore = false;
      continue;
    }

    const id = `reg-import-${venteId}-${i + 1}`;
    await ajouterReglement({
      id,
      vente_id: venteId,
      magasin_id: payload.magasinId,
      recu: r.recu || '',
      mode_paiement: r.mode_paiement || 'Espèces',
      compte_banque: r.compte_banque || '',
      details: r.details || 'Règlement importé',
      montant,
      date: r.date || payload.venteDate,
      edite_par: 'IMPORT ANCIEN CLIENT',
    });
    reglementIds.push(id);
  }

  // Les fichiers PDF / pièces du dossier ne sont PLUS stockés dans la base :
  // toutes leurs informations utiles sont déjà extraites dans la vente, et leur
  // contenu (plusieurs Mo par dossier) remplissait le disque de Supabase. Seuls
  // leurs NOMS restent notés sur la vente (champ documents_importes).
  const documentCount = (payload.documents || []).length;

  return { clientId, venteId, reglementIds, importId, documents: documentCount, dejaImporte: !!existante };
}

export function parseMoney(value: any): number { return money(value); }
