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
  doc, onSnapshot, setDoc,
} from '../utils/firestoreCompat';
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

export function useLiveData<T>(
  storageKey: string,
  defaultValue: T[] = []
): [T[], (data: T[]) => void, boolean] {
  const [data, setData] = useState<T[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  // loading = false dès qu'un cache local existe : les données s'affichent
  // immédiatement sans attendre le réseau. La mise à jour cloud est silencieuse.
  const [loading, setLoading] = useState<boolean>(() => {
    try { return !localStorage.getItem(storageKey); } catch { return true; }
  });
  const mountedRef = useRef(true);

  const applyLocal = useCallback((rows: T[]) => {
    setData(rows);
    try { localStorage.setItem(storageKey, JSON.stringify(rows)); } catch {}
  }, [storageKey]);

  useEffect(() => {
    mountedRef.current = true;

    // 1. Lecture directe immédiate (affichage rapide au montage).
    fetchFromFirebase<T>(storageKey)
      .then(fresh => { if (mountedRef.current && fresh.length > 0) applyLocal(fresh); })
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
          applyLocal((snap.data()?.items ?? []) as T[]);
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
          applyLocal((snap.data()?.value ?? []) as T[]);
        },
        err => { if (!isAuthError(err) && !isNoSessionError(err)) logger.error(`useLiveData onSnapshot app_data ${storageKey}:`, err); },
      );
    }

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [storageKey, applyLocal]);

  const saveData = useCallback((newData: T[]) => {
    // Mise à jour optimiste locale immédiate…
    applyLocal(newData);
    // …puis persistance DIRECTE dans Firestore (partagée entre navigateurs).
    (async () => {
      try {
        if (isCatalogueKey(storageKey)) {
          await replaceCatalogue(CATALOGUE_KEY_TO_TYPE[storageKey], newData as any[]);
          return;
        }
        if (!auth.currentUser) {
          await waitForAuth();
          if (!auth.currentUser) throw new Error('session Firebase non disponible');
        }
        // setDoc direct (écrit aussi les tableaux vides → les suppressions se propagent).
        await setDoc(
          doc(db, 'app_data', storageKey),
          { key: storageKey, value: newData, updated_at: new Date().toISOString() },
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
