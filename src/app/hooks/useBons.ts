import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';
import { collection, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { loadFromSupabase } from '../services/supabaseRealtime';
import {
  lireBonsTable, upsertBon, supprimerBon,
  distributionToRow, transfertToRow, retourToRow, rowToDistribution, rowToTransfert, rowToRetour,
  type BonRow,
} from '../services/bonsService';
import { setVisibleInterval, PAGE_POLL_MS } from '../utils/visibleInterval';

type TypeBon = 'distribution' | 'transfert' | 'retour';

const CLE_CACHE: Record<TypeBon, string> = {
  distribution: 'leclaire_db_bon-distribution',
  transfert: 'leclaire_db_bon-transfert',
  retour: 'leclaire_db_bon-retour',
};
const VERS_LIGNE: Record<TypeBon, (b: any) => BonRow> = { distribution: distributionToRow, transfert: transfertToRow, retour: retourToRow };
const DEPUIS_LIGNE: Record<TypeBon, (r: BonRow) => any> = { distribution: rowToDistribution, transfert: rowToTransfert, retour: rowToRetour };

/** Anciennes listes (blob `app_data`) déjà récupérées pendant cette session. */
const recuperees = new Set<string>();

/**
 * Bons de distribution, de transfert ou de retour — lus et écrits BON PAR BON
 * dans la table `bons`.
 *
 * Avant, chaque page enregistrait la LISTE ENTIÈRE dans un seul blob partagé :
 * quand un magasin validait un bon, il réécrivait la liste avec ses seuls bons,
 * et les distributions des autres magasins disparaissaient de la liste de
 * l'administration (alors qu'elles existaient toujours dans la table `bons`).
 * Désormais la table est la seule source : rien ne peut plus être écrasé.
 *
 * `magasinIds` : bons de ces magasins seulement (pages magasin) ; absent :
 * tous les magasins (administration), avec récupération des bons qui
 * n'existeraient que dans l'ancienne liste.
 */
export function useBons<T extends { id: string }>(type: TypeBon, magasinIds?: string[]) {
  const cle = CLE_CACHE[type];
  const filtre = (magasinIds || []).map(m => String(m).toUpperCase()).filter(Boolean);
  const filtreCle = filtre.join(',');
  // Affichage immédiat : dernière liste lue pour ces magasins (l'ancienne liste
  // partagée ne sert qu'à l'administration, qui voit tous les magasins).
  const cleLocale = `opticlaire_bons_${type}_${filtreCle || 'TOUS'}`;
  const [bons, setBons] = useState<T[]>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(cleLocale) || (filtreCle ? '[]' : localStorage.getItem(cle) || '[]'));
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const derniere = useRef(0);

  const charger = useCallback(async () => {
    const n = ++derniere.current;
    try {
      const rows = await lireBonsTable(type, filtre.length ? filtre : undefined);
      let liste = rows.map(r => DEPUIS_LIGNE[type](r)) as T[];
      // Administration : bons présents seulement dans l'ancienne liste → remis dans la table.
      if (!filtre.length && !recuperees.has(type)) {
        recuperees.add(type);
        try {
          const anciens = await loadFromSupabase<any>(cle, []);
          const connus = new Set(liste.map(b => String(b.id)));
          const manquants = (anciens || []).filter(b => b && b.id != null && !connus.has(String(b.id)));
          for (const b of manquants) {
            await upsertBon(VERS_LIGNE[type](b));
            liste = [...liste, b];
          }
          if (manquants.length) logger.log(`✅ ${manquants.length} bon(s) de ${type} récupéré(s) dans l'ancienne liste`);
        } catch (e) {
          recuperees.delete(type);
          logger.warn(`Récupération de l'ancienne liste des bons de ${type} impossible:`, e);
        }
      }
      if (n === derniere.current) {
        setBons(liste); setErreur('');
        try { localStorage.setItem(cleLocale, JSON.stringify(liste)); } catch { /* quota */ }
      }
    } catch (e: any) {
      if (n === derniere.current) setErreur(e?.message || 'Liste des bons indisponible.');
      logger.warn(`Lecture des bons de ${type} impossible:`, e);
    } finally {
      if (n === derniere.current) setChargement(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, filtreCle]);

  useEffect(() => {
    charger();
    const unsub = onSnapshot(collection(db, 'bons'), () => { charger(); }, () => {});
    const stop = setVisibleInterval(charger, PAGE_POLL_MS);
    const surMaj = () => charger();
    window.addEventListener('bons-updated', surMaj);
    return () => { unsub(); stop(); window.removeEventListener('bons-updated', surMaj); };
  }, [charger]);

  /** Enregistre UN bon (création ou modification). Lève une erreur si la base ne confirme pas. */
  const sauver = useCallback(async (bon: T) => {
    await upsertBon(VERS_LIGNE[type](bon));
    setBons(prev => (prev.some(b => String(b.id) === String(bon.id))
      ? prev.map(b => (String(b.id) === String(bon.id) ? bon : b))
      : [...prev, bon]));
    try { window.dispatchEvent(new CustomEvent('bons-updated')); } catch { /* ignore */ }
  }, [type]);

  /** Supprime UN bon. */
  const supprimer = useCallback(async (id: string) => {
    await supprimerBon(id);
    setBons(prev => prev.filter(b => String(b.id) !== String(id)));
    try { window.dispatchEvent(new CustomEvent('bons-updated')); } catch { /* ignore */ }
  }, []);

  return { bons, sauver, supprimer, chargement, erreur, recharger: charger };
}
