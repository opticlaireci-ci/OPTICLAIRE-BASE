import { logger } from '../utils/logger';
/**
 * useLiveData — hook universel de données Firebase, LECTURE + ÉCRITURE DIRECTES.
 *
 * Modèle identique au STOCK / clients / tableau de bord : la donnée partagée est
 * lue et écrite DIRECTEMENT dans Firestore (pas seulement en cache localStorage).
 * Ce qu'un navigateur écrit, tous les autres le voient (temps réel `onSnapshot`).
 *
 *  • Clés catalogue (leclaire_db_*, leclaire_global_*) → collection `catalogues`
 *    (via chargerCatalogue / replaceCatalogue).
 *  • Autres clés → collection `app_data` (1 document par clé : {key, value[]}).
 *
 * Le cache localStorage n'est plus qu'un affichage instantané au montage ; la
 * source de vérité est Firestore.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc, onSnapshot, setDoc, getDoc,
} from '../utils/firestoreCompat';
import { kvGetDoc, kvEcrireListeFusionnee } from '../utils/supabaseDirect';
import { fusionnerListes, listeAvecIds, baseDeFusion } from '../utils/fusionListes';
export { fusionnerListes } from '../utils/fusionListes';
import { db, auth, waitForAuth } from '../utils/firebaseClient';
import { loadFromSupabase } from '../services/supabaseRealtime';
import { wasRecentlyWritten } from '../services/safeHydrate';
import {
  isCatalogueKey, CATALOGUE_KEY_TO_TYPE, chargerCatalogue, replaceCatalogue,
} from '../services/catalogueService';
import { isAuthError, isNoSessionError } from '../utils/networkErrors';

async function fetchFromFirebase<T>(key: string): Promise<T[]> {
  if (isCatalogueKey(key)) {
    const catType = CATALOGUE_KEY_TO_TYPE[key];
    return chargerCatalogue(catType) as Promise<T[]>;
  }
  return loadFromSupabase<T>(key, []);
}

/**
 * La valeur a-t-elle la forme attendue ? Une liste pour une donnée en liste, un
 * objet pour une donnée en objet (ex. stock des lentilles par case). Une valeur
 * d'une autre forme (« undefined » écrit par erreur, texte…) est ignorée au lieu
 * d'être affichée ou réécrite partout.
 */
function formeValide(valeur: unknown, defaut: unknown): boolean {
  if (Array.isArray(defaut)) return Array.isArray(valeur);
  if (defaut && typeof defaut === 'object') return !!valeur && typeof valeur === 'object' && !Array.isArray(valeur);
  return valeur !== undefined;
}
/** Donnée en objet rangée dans une liste d'un seul élément (`[objet]`) : on reprend l'objet. */
function normaliser<V>(valeur: V, defaut: unknown): V {
  if (defaut && typeof defaut === 'object' && !Array.isArray(defaut) && Array.isArray(valeur)
      && valeur.length === 1 && valeur[0] && typeof valeur[0] === 'object' && !Array.isArray(valeur[0])) {
    return valeur[0] as V;
  }
  return valeur;
}
function nonVide(valeur: unknown): boolean {
  if (Array.isArray(valeur)) return valeur.length > 0;
  return !!valeur && typeof valeur === 'object' && Object.keys(valeur as object).length > 0;
}

/**
 * Valeur ACTUELLE du serveur ; `null` si le serveur n'en a encore aucune (rien
 * à fusionner : la version de cet appareil part telle quelle). Lève une erreur
 * si le serveur n'a pas répondu.
 */
async function lireServeur(key: string): Promise<unknown> {
  if (isCatalogueKey(key)) {
    const snap = await getDoc(doc(db, 'catalogues', CATALOGUE_KEY_TO_TYPE[key]));
    return snap.exists() ? (snap.data()?.items ?? null) : null;
  }
  const d = await kvGetDoc<{ value?: unknown }>('app_data', key);
  return d?.value ?? null;
}

/** Nouvelle valeur, ou fonction qui la calcule à partir de la valeur actuelle (comme `setState`). */
export type MiseAJourLive<T> = T[] | ((actuelle: T[]) => T[]);

export function useLiveData<T>(
  storageKey: string,
  defaultValue: T[] = []
): [T[], (data: MiseAJourLive<T>) => void, boolean] {
  const [data, setData] = useState<T[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const lu = normaliser(raw ? JSON.parse(raw) : defaultValue, defaultValue);
      return formeValide(lu, defaultValue) ? lu : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  // Valeur courante, pour les mises à jour données sous forme de fonction.
  const dataRef = useRef<T[]>(data);
  // Dernière version reçue du serveur (base de la fusion à l'enregistrement).
  const serveurRef = useRef<T[] | null>(null);
  // loading = false dès qu'un cache local existe : les données s'affichent
  // immédiatement sans attendre le réseau. La mise à jour cloud est silencieuse.
  const [loading, setLoading] = useState<boolean>(() => {
    try { return !localStorage.getItem(storageKey); } catch { return true; }
  });
  const mountedRef = useRef(true);

  const defautRef = useRef(defaultValue);
  const applyLocal = useCallback((recu: T[]) => {
    const rows = normaliser(recu, defautRef.current);
    // Valeur d'une autre forme (ex. texte « undefined » laissé par une ancienne
    // version) : ignorée, l'affichage actuel est conservé.
    if (!formeValide(rows, defautRef.current)) return;
    dataRef.current = rows;
    setData(rows);
    try { localStorage.setItem(storageKey, JSON.stringify(rows)); } catch {}
  }, [storageKey]);

  /**
   * Version reçue du serveur. Si la liste a été modifiée ICI depuis la dernière
   * version reçue (enregistrement en cours), on fusionne au lieu de remplacer :
   * la modification pas encore partie n'est pas effacée de l'écran.
   */
  const appliquerVersionServeur = useCallback((valeur: T[]) => {
    const base = serveurRef.current, locale = dataRef.current;
    if (listeAvecIds(valeur) && listeAvecIds(base) && listeAvecIds(locale) && JSON.stringify(locale) !== JSON.stringify(base)) {
      serveurRef.current = valeur;
      applyLocal(fusionnerListes(base as any[], locale as any[], valeur as any[]) as T[]);
      return;
    }
    if (Array.isArray(valeur)) serveurRef.current = valeur;
    applyLocal(valeur);
  }, [applyLocal]);

  useEffect(() => {
    mountedRef.current = true;

    // 1. Lecture directe immédiate (affichage rapide au montage).
    fetchFromFirebase<T>(storageKey)
      // Donnée en liste OU en objet (stock des lentilles) : `fresh.length`
      // n'existe pas pour un objet, qui n'était jamais appliqué ici.
      .then(fresh => {
        if (!mountedRef.current) return;
        // Pas de référence de fusion ici : en cas de panne réseau, cette lecture
        // renvoie la copie de l'appareil, pas celle du serveur. La référence
        // vient seulement des réponses du serveur (temps réel, enregistrement).
        if (nonVide(fresh)) applyLocal(fresh);
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });

    // 2. Temps réel Firestore : autorité partagée sur tous les navigateurs.
    let unsub: () => void = () => {};
    if (isCatalogueKey(storageKey)) {
      const catType = CATALOGUE_KEY_TO_TYPE[storageKey];
      unsub = onSnapshot(
        doc(db, 'catalogues', catType),
        snap => {
          if (!mountedRef.current) return;
          // Écriture locale récente en vol : ignorer l'écho cloud (potentiellement
          // en retard) pour ne pas régresser ce que l'utilisateur vient de saisir.
          if (wasRecentlyWritten(storageKey)) return;
          // Le document cloud n'existe pas encore (écriture pas encore propagée) :
          // on NE VIDE PAS l'affichage local. Sinon toute actualisation efface ce
          // que l'utilisateur vient de saisir avant que le cloud ne l'ait reçu.
          if (!snap.exists()) return;
          const items = (snap.data()?.items ?? []) as T[];
          appliquerVersionServeur(items);
        },
        err => { if (!isAuthError(err) && !isNoSessionError(err)) logger.error(`useLiveData onSnapshot catalogue ${storageKey}:`, err); },
      );
    } else {
      unsub = onSnapshot(
        doc(db, 'app_data', storageKey),
        snap => {
          if (!mountedRef.current) return;
          if (wasRecentlyWritten(storageKey)) return; // écho cloud en retard : garder le local
          if (!snap.exists()) return; // idem : ne pas écraser le local avec du vide
          const valeur = (snap.data()?.value ?? []) as T[];
          appliquerVersionServeur(valeur);
        },
        err => { if (!isAuthError(err) && !isNoSessionError(err)) logger.error(`useLiveData onSnapshot app_data ${storageKey}:`, err); },
      );
    }

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [storageKey, applyLocal, appliquerVersionServeur]);

  const saveData = useCallback((miseAJour: MiseAJourLive<T>) => {
    // Forme « fonction » (comme setState) : calculée sur la valeur actuelle.
    // Avant, la fonction elle-même était enregistrée : le texte « undefined »
    // partait au serveur et effaçait la donnée (stock des lentilles) partout.
    const avant = dataRef.current;
    const newData = normaliser(typeof miseAJour === 'function'
      ? (miseAJour as (actuelle: T[]) => T[])(dataRef.current)
      : miseAJour, defautRef.current);
    if (!formeValide(newData, defautRef.current)) {
      logger.error(`useLiveData: valeur invalide refusée pour ${storageKey}`, newData);
      return;
    }
    // Mise à jour optimiste locale immédiate…
    applyLocal(newData);
    // …puis persistance DIRECTE dans Firestore (partagée entre navigateurs).
    (async () => {
      try {
        // Liste partagée : fusion avec ce qui a été enregistré entre-temps
        // ailleurs (voir fusionnerListes). Serveur injoignable : envoi tel quel.
        let aEcrire: T[] = newData;
        // Réglage partagé en liste : écriture CONDITIONNELLE avec fusion (voir
        // kvEcrireListeFusionnee) — deux appareils qui enregistrent au même
        // instant ne s'écrasent plus. Base : dernière version reçue du serveur ;
        // inconnue, seuls les éléments communs servent de base (un élément
        // présent seulement ici n'est jamais pris pour une suppression).
        if (!isCatalogueKey(storageKey) && listeAvecIds(newData) && listeAvecIds(avant)) {
          try {
            aEcrire = await kvEcrireListeFusionnee(storageKey, serveurRef.current, newData as any[], avant) as T[];
            serveurRef.current = aEcrire;
            if (JSON.stringify(aEcrire) !== JSON.stringify(newData) && mountedRef.current) applyLocal(aEcrire);
            return;
          } catch { /* serveur injoignable : écriture habituelle ci-dessous (mise en file) */ }
        }
        if (isCatalogueKey(storageKey) && listeAvecIds(newData) && listeAvecIds(avant)) {
          try {
            const distante = await lireServeur(storageKey);
            const base = baseDeFusion(serveurRef.current, avant, distante) as any[];
            if (distante !== null && listeAvecIds(distante) && JSON.stringify(distante) !== JSON.stringify(base)) {
              aEcrire = fusionnerListes(base, newData as any[], distante as any[]) as T[];
              if (JSON.stringify(aEcrire) !== JSON.stringify(newData) && mountedRef.current) applyLocal(aEcrire);
            }
          } catch { /* serveur injoignable : la version locale part telle quelle */ }
        }
        serveurRef.current = Array.isArray(aEcrire) ? aEcrire : serveurRef.current;
        if (isCatalogueKey(storageKey)) {
          await replaceCatalogue(CATALOGUE_KEY_TO_TYPE[storageKey], aEcrire as any[]);
          return;
        }
        if (!auth.currentUser) {
          await waitForAuth();
          if (!auth.currentUser) throw new Error('session Firebase non disponible');
        }
        // setDoc direct (écrit aussi les tableaux vides → les suppressions se propagent).
        await setDoc(
          doc(db, 'app_data', storageKey),
          { key: storageKey, value: aEcrire, updated_at: new Date().toISOString() },
          { merge: true },
        );
      } catch (e) {
        // Session absente/expirée : bénin (cache local conservé, re-poussé à la
        // reconnexion) — inutile de polluer la console.
        if (!isAuthError(e) && !isNoSessionError(e)) {
          logger.error(`useLiveData: échec persistance Firestore ${storageKey}`, e);
        }
      }
    })();
  }, [storageKey, applyLocal]);

  return [data, saveData, loading];
}

export function useLiveDataReadonly<T>(
  storageKey: string,
  defaultValue: T[] = []
): [T[], boolean] {
  const [data, , loading] = useLiveData<T>(storageKey, defaultValue);
  return [data, loading];
}
