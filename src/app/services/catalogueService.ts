import { logger } from '../utils/logger';
import {
  doc, getDoc, setDoc,
} from '../utils/firestoreCompat';
import { db, auth, waitForAuth } from '../utils/firebaseClient';
import { journaliserSuppression } from './auditLogService';
import { isAuthError, isNoSessionError } from '../utils/networkErrors';

export const CATALOGUE_KEY_TO_TYPE: Record<string, string> = {
  'leclaire_db_categories':    'categories',
  'leclaire_db_couleurs':      'couleurs',
  'leclaire_db_diametres':     'diametres',
  'leclaire_db_familles':      'familles',
  'leclaire_db_marques':       'marques',
  'leclaire_db_matieres':      'matieres',
  'leclaire_db_tailles':       'tailles',
  'leclaire_db_traitements':   'composant_traitements',
  'leclaire_db_types':         'types_verre',
  'leclaire_db_professions':   'professions',
  'leclaire_db_modes':         'modes',
  'leclaire_global_accessoires': 'catalogue_accessoires',
  'leclaire_global_montures':  'catalogue_montures',
  'leclaire_global_services':  'catalogue_services',
  'leclaire_global_traitements': 'catalogue_traitements',
  'leclaire_global_verres':    'catalogue_verres',
};

export const CATALOGUE_TYPE_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(CATALOGUE_KEY_TO_TYPE).map(([k, v]) => [v, k])
);

export function isCatalogueKey(key: string): boolean {
  return key in CATALOGUE_KEY_TO_TYPE;
}

export async function chargerCatalogue(catType: string): Promise<any[]> {
  try {
    // Chaque type de catalogue est stocké dans UN seul document `catalogues/<catType>`
    // contenant le tableau complet `items`. Une seule lecture suffit.
    const snap = await getDoc(doc(db, 'catalogues', catType));
    if (!snap.exists()) return [];
    const items = snap.data()?.items;
    return Array.isArray(items) ? items : [];
  } catch (err) {
    // Un AbortError/timeout est transitoire (fonction edge lente) : le cache
    // local est préservé et une prochaine hydratation retentera. On évite un
    // log d'erreur bruyant pour ce cas.
    const name = (err as Error)?.name || '';
    const msg = (err as Error)?.message || '';
    if (name === 'AbortError' || /aborted|timeout/i.test(msg)) {
      logger.warn(`⏳ chargerCatalogue(${catType}) interrompu (transitoire), cache local conservé`);
    } else if (isAuthError(err) || isNoSessionError(err)) {
      // Non connecté / session expirée : bénin (cache local conservé, rechargé
      // après reconnexion). Inutile de polluer la console.
    } else {
      logger.error(`chargerCatalogue(${catType}):`, err);
    }
    return [];
  }
}

export async function replaceCatalogue(catType: string, items: any[]): Promise<void> {
  // Attendre la session Firebase : sinon l'écriture part sans token et échoue
  // (permission-denied) sur le lien public / mobile où la session est lente.
  if (!auth.currentUser) {
    await waitForAuth();
    if (!auth.currentUser) throw new Error('replaceCatalogue: session Firebase non disponible');
  }

  const payload = (items || []).filter(i => i && i.id !== undefined && i.id !== null);
  const now = new Date().toISOString();

  // Écriture ATOMIQUE : tout le catalogue tient dans un seul document.
  // (Auparavant chaque élément était un document séparé → N requêtes en parallèle
  //  qui saturaient la file de concurrence et provoquaient des timeouts en cascade.)
  //
  // Les DEUX écritures (document `catalogues/<type>` + miroir `app_data` pour la
  // compat useLiveData) partent EN PARALLÈLE. Les faire séquentiellement doublait
  // la latence : sur une fonction edge lente (cold start), le cumul dépassait le
  // délai de 15 s de pushWithRetry → « Timeout d'écriture Firebase ».
  const lsKey = CATALOGUE_TYPE_TO_KEY[catType];
  await Promise.all([
    setDoc(doc(db, 'catalogues', catType), {
      cat_type: catType,
      item_id: catType,
      items: payload,
      updated_at: now,
    }),
    // Écriture COMPLÈTE (overwrite), PAS merge : on possède déjà la valeur
    // intégrale, donc inutile de lire l'existant d'abord. Le merge déclenchait un
    // GET+POST par catalogue — au démarrage (16 catalogues poussés en rafale) ces
    // GET superflus saturaient la file de concurrence (MAX_CONCURRENT=4) et
    // provoquaient les « Timeout d'écriture » en cascade.
    lsKey
      ? setDoc(doc(db, 'app_data', lsKey), { key: lsKey, value: payload, updated_at: now })
      : Promise.resolve(),
  ]);
}

export async function supprimerCatalogueItem(catType: string, itemId: string): Promise<void> {
  const id = String(itemId);
  const current = await chargerCatalogue(catType);
  const remaining = current.filter(i => String(i?.id) !== id);
  await replaceCatalogue(catType, remaining);
  journaliserSuppression('Catalogue', `${catType} — élément supprimé (${id})`);
}
