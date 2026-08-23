import { logger } from '../utils/logger';
import { useState, useEffect, useCallback } from 'react';
import { saveToSupabase, loadFromSupabase, subscribeToChanges } from '../services/supabaseRealtime';

/**
 * Hook React pour la synchronisation avec Supabase Realtime
 * Synchronise automatiquement entre TOUS les appareils/navigateurs
 */
export function useSupabaseSync<T>(
  storageKey: string,
  defaultValue: T[] = []
): [T[], (data: T[]) => Promise<void>, boolean] {
  const [data, setData] = useState<T[]>(defaultValue);
  const [loading, setLoading] = useState(true);

  // Charger les données initiales
  useEffect(() => {
    const loadInitial = async () => {
      try {
        logger.log(`🔄 Chargement données pour: ${storageKey}`);

        // ÉTAPE 1: Charger depuis Supabase (source de vérité centrale)
        const supabaseData = await loadFromSupabase<T>(storageKey, []);

        // ÉTAPE 2: Charger depuis localStorage
        let localData: T[] = [];
        const localStr = localStorage.getItem(storageKey);
        if (localStr) {
          try {
            localData = JSON.parse(localStr);
          } catch (e) {
            logger.error('Erreur parsing localStorage:', e);
          }
        }

        // ÉTAPE 3: Décider quelle version utiliser
        if (supabaseData && Array.isArray(supabaseData) && supabaseData.length > 0) {
          // Supabase a des données
          logger.log(`📥 ${supabaseData.length} données chargées depuis Supabase: ${storageKey}`);
          setData(supabaseData);

          // Mettre à jour localStorage avec les données Supabase
          try {
            localStorage.setItem(storageKey, JSON.stringify(supabaseData));
          } catch (e) {
            logger.error('Erreur sauvegarde localStorage:', e);
          }
        } else if (localData && Array.isArray(localData) && localData.length > 0) {
          // Pas de données dans Supabase, mais localStorage a des données
          logger.log(`💾 ${localData.length} données locales trouvées, upload vers Supabase: ${storageKey}`);
          setData(localData);

          // Uploader vers Supabase en arrière-plan
          saveToSupabase(storageKey, localData, true).catch(err => {
            logger.error(`⚠️ Erreur upload vers Supabase ${storageKey}:`, err);
          });
        } else {
          // Aucune donnée nulle part
          logger.log(`⚠️ Aucune donnée trouvée: ${storageKey}`);
          setData(defaultValue);
        }
      } catch (error) {
        logger.error('Erreur chargement initial:', error);

        // En cas d'erreur, fallback sur localStorage
        try {
          const localStr = localStorage.getItem(storageKey);
          if (localStr) {
            setData(JSON.parse(localStr));
          } else {
            setData(defaultValue);
          }
        } catch {
          setData(defaultValue);
        }
      } finally {
        setLoading(false);
      }
    };

    loadInitial();
  }, [storageKey]);

  // Écouter les changements en temps réel
  useEffect(() => {
    const unsubscribe = subscribeToChanges(storageKey, (value) => {
      if (Array.isArray(value)) {
        setData(value);
      } else if (value && typeof value === 'object') {
        setData(value);
      }
    });

    return unsubscribe;
  }, [storageKey]);

  // Fonction pour sauvegarder
  const saveData = useCallback(async (newData: T[]) => {
    // 1. Mettre à jour l'état React immédiatement
    setData(newData);

    // 2. Sauvegarder dans localStorage IMMÉDIATEMENT
    try {
      localStorage.setItem(storageKey, JSON.stringify(newData));
      logger.log(`💾 Sauvegardé dans localStorage: ${storageKey}`);
    } catch (error) {
      logger.error(`❌ Erreur sauvegarde localStorage ${storageKey}:`, error);
    }

    // 3. Synchroniser avec Supabase en arrière-plan (skipLocalStorage = true)
    try {
      await saveToSupabase(storageKey, newData, true);
      logger.log(`✅ Synchronisé avec Supabase: ${storageKey}`);
    } catch (error) {
      logger.error(`⚠️ Erreur sync Supabase ${storageKey}:`, error);
      // Ne pas bloquer même si Supabase échoue - données déjà sauvegardées localement
    }
  }, [storageKey]);

  return [data, saveData, loading];
}

/**
 * Hook en lecture seule
 */
export function useSupabaseSyncReadonly<T>(
  storageKey: string,
  defaultValue: T[] = []
): [T[], boolean] {
  const [data, , loading] = useSupabaseSync<T>(storageKey, defaultValue);
  return [data, loading];
}
