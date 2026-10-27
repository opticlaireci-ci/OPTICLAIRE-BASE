import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';
import { setVisibleInterval, PAGE_POLL_MS } from '../utils/visibleInterval';
import {
  chargerCommandesVerre, EVENEMENT_COMMANDES_VERRE, type CommandeVerre,
} from '../services/commandesVerreService';

/**
 * Commandes de verre, tenues à jour (toutes les 30 s, et aussitôt qu'une
 * commande est passée, confirmée ou arrivée sur ce poste).
 * `magasinId` : celles de ce magasin ; absent : toutes celles visibles par le compte.
 * `actif` à false : rien n'est chargé (crochet appelé sans condition).
 */
export function useCommandesVerre(magasinId?: string, actif = true) {
  const [commandes, setCommandes] = useState<CommandeVerre[]>([]);
  const [chargement, setChargement] = useState(actif);
  const [erreur, setErreur] = useState('');
  const derniere = useRef(0);

  const charger = useCallback(async () => {
    if (!actif) return;
    const n = ++derniere.current;
    try {
      const liste = await chargerCommandesVerre(magasinId);
      if (n === derniere.current) { setCommandes(liste); setErreur(''); }
    } catch (e: any) {
      if (n === derniere.current) setErreur(e?.message || 'Commandes de verre indisponibles.');
      logger.warn('Lecture des commandes de verre impossible:', e);
    } finally {
      if (n === derniere.current) setChargement(false);
    }
  }, [magasinId, actif]);

  useEffect(() => {
    if (!actif) return;
    charger();
    const stop = setVisibleInterval(charger, PAGE_POLL_MS);
    window.addEventListener(EVENEMENT_COMMANDES_VERRE, charger);
    return () => { stop(); window.removeEventListener(EVENEMENT_COMMANDES_VERRE, charger); };
  }, [charger, actif]);

  return { commandes, chargement, erreur, recharger: charger };
}
