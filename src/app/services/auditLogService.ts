import { collection, doc, getDocs, setDoc } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { safeUuid } from '../utils/safeId';
import { getCurrentUser } from '../utils/auditUtils';
import { logNetworkAware } from '../utils/networkErrors';

const COLLECTION = 'audit_log';

export interface AuditLogRow {
  id: string;
  action: 'delete' | 'create' | 'update';
  module: string;
  magasin_id?: string | null;
  user?: string | null;
  details?: string | null;
  date: string; // ISO
  created_at?: string;
}

/**
 * Journalise une action (principalement les suppressions) dans une collection
 * cloud dédiée, visible par tous les magasins/utilisateurs. Best-effort : n'échoue
 * jamais bruyamment pour ne pas bloquer l'action métier (ex: la suppression réelle).
 */
export async function journaliserAction(opts: {
  action: 'delete' | 'create' | 'update';
  module: string;
  magasinId?: string | null;
  details?: string;
  user?: string;
}): Promise<void> {
  try {
    const id = safeUuid();
    const now = new Date().toISOString();
    const row: AuditLogRow = {
      id,
      action: opts.action,
      module: opts.module,
      magasin_id: (opts.magasinId || '').toUpperCase() || null,
      user: opts.user || getCurrentUser(),
      details: opts.details || '',
      date: now,
      created_at: now,
    };
    await setDoc(doc(db, COLLECTION, id), row);
  } catch (err) {
    logNetworkAware('journaliserAction', err);
  }
}

/** Raccourci pour journaliser une suppression. */
export function journaliserSuppression(module: string, details: string, magasinId?: string | null): Promise<void> {
  return journaliserAction({ action: 'delete', module, details, magasinId });
}

export async function chargerJournalAudit(): Promise<AuditLogRow[]> {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as AuditLogRow))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    logNetworkAware('chargerJournalAudit', err);
    return [];
  }
}
