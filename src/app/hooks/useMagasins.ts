import { useEffect, useMemo, useState } from 'react';
import { nomMagasin, sansEnseigne } from '../config/tenant';
import {
  getMagasins, getActiveMagasins, CLE_REGISTRE_MAGASINS, EVENEMENT_MAGASINS, type Magasin,
} from '../constants/magasins';

/**
 * Liste des magasins, TOUJOURS à jour à l'écran.
 *
 * Avant, beaucoup de pages lisaient la liste une seule fois, au chargement de
 * leur fichier (`const MAGASINS = getMagasins()` en dehors du composant) : un
 * magasin ajouté ensuite — ou arrivé du serveur quelques secondes après
 * l'ouverture de l'application — n'y apparaissait qu'après un rechargement
 * complet, et ces pages restaient sur les 9 magasins de départ.
 */
export function useMagasins(options: { actifs?: boolean } = {}): Magasin[] {
  const actifs = !!options.actifs;
  const lire = () => (actifs ? getActiveMagasins() : getMagasins());
  const [liste, setListe] = useState<Magasin[]>(lire);
  useEffect(() => {
    const maj = () => setListe(avant => {
      const apres = lire();
      return JSON.stringify(apres) === JSON.stringify(avant) ? avant : apres;
    });
    const surStockage = (e: StorageEvent) => { if (!e.key || e.key === CLE_REGISTRE_MAGASINS) maj(); };
    maj();
    window.addEventListener(EVENEMENT_MAGASINS, maj);
    window.addEventListener('supabase-realtime-update', maj);
    window.addEventListener('storage', surStockage);
    return () => {
      window.removeEventListener(EVENEMENT_MAGASINS, maj);
      window.removeEventListener('supabase-realtime-update', maj);
      window.removeEventListener('storage', surStockage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actifs]);
  return liste;
}

/** Libellés complets des magasins (« LECLAIRE ABOBO »…), à jour. */
export function useLibellesMagasins(): string[] {
  const liste = useMagasins();
  return useMemo(() => liste.map(m => nomMagasin(m.label)), [liste]);
}

/** Noms courts des magasins, sans le nom de l'enseigne (« ABOBO »…), à jour. */
export function useNomsCourtsMagasins(): string[] {
  const liste = useMagasins();
  return useMemo(() => liste.map(m => sansEnseigne(m.label)), [liste]);
}
