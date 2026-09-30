import { doc, setDoc } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { ajouterReglement } from './reglementsService';
import { ajouterVente } from './ventesService';
import { upsertClient } from './clientsService';

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
  dataBase64: string;
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

export async function importerDossierClient(payload: LegacyClientImportPayload): Promise<{ clientId: string; venteId: string; reglementIds: string[]; importId: string; documents: number }> {
  const now = new Date().toISOString();
  const numeroClient = payload.numeroClient?.trim() || `IMP-${Date.now().toString().slice(-8)}`;
  const clientId = `client-${safeId(payload.magasinId)}-${safeId(numeroClient)}`;
  const unique = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
  const venteId = `vente-import-${safeId(payload.magasinId)}-${Date.now()}-${unique}-${safeId(numeroClient)}`;
  const importId = `import-${venteId}`;

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

  const acompte = money(payload.acompteInitial);
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
    verres: Array.isArray(payload.verres) ? payload.verres : [],
    articles: Array.isArray(payload.articles) ? payload.articles : [],
    bons_assurance: Array.isArray(payload.bonsAssurance) ? payload.bonsAssurance : [],
    recap: {
      remisePct: Number(payload.remisePct || 0),
      acompte,
      modePaiement: payload.modePaiementAcompte || '',
      compteBanque: payload.compteBanqueAcompte || '',
      details: payload.detailsAcompte || '',
      rdvRetrait: payload.rdvRetrait || '',
      dateRecuperation: payload.dateRecuperation || '',
      numFacture: payload.numeroFacture || (payload.numeroClient ? `IMP-${numeroClient}` : `IMP-${Date.now()}`),
      numRecu: '',
      imported: true,
      importId,
      originalSource: payload.sourceLogiciel || 'ancien logiciel',
      ordonnance: payload.ordonnance || null,
    },
    total_brut: money(payload.totalBrut),
    total_net: money(payload.totalNet),
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

  // Les pièces du dossier sont stockées séparément pour éviter la limite de
  // taille d'un document Firestore. Chaque morceau fait moins de 700 k caractères.
  const CHUNK = 700_000;
  let documentCount = 0;
  for (const file of payload.documents || []) {
    const base = file.dataBase64 || '';
    if (!base) continue;
    for (let start = 0, part = 0; start < base.length; start += CHUNK, part++) {
      const chunk = base.slice(start, start + CHUNK);
      const id = `${importId}-${documentCount}-${part}`;
      await setDoc(doc(db, 'documents_importes', id), {
        id,
        import_id: importId,
        vente_id: venteId,
        client_id: clientId,
        magasin_id: payload.magasinId,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        relativePath: file.relativePath || '',
        part,
        total_parts: Math.ceil(base.length / CHUNK),
        data_base64: chunk,
        created_at: now,
      }, { merge: true });
    }
    documentCount++;
  }

  return { clientId, venteId, reglementIds, importId, documents: documentCount };
}

export function parseMoney(value: any): number { return money(value); }
