import { logger } from '../utils/logger';
/**
 * Hydratation des tables résiduelles (RDV, atelier, emplois) depuis Firebase.
 */

import { collection, onSnapshot } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { chargerRdvEnligne, rowToRdv, replaceRdvEnligne } from './rdvService';
import { chargerBonsCommandeVerres, rowToBonCommande, replaceBonsCommandeVerres } from './atelierService';
import { chargerEmplois, rowToEmploi, replaceEmplois } from './emploisService';
import { setItemWithoutSync } from './autoSync';

function notify(eventName: string) {
  try { window.dispatchEvent(new CustomEvent(eventName)); } catch {}
  try { window.dispatchEvent(new CustomEvent('leclaire-sync-update')); } catch {}
}

function readLocalArray(key: string): any[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function hydrateRdvEnligne(magasinIds: string[]): Promise<void> {
  if (!magasinIds.length) return;
  const rows = await chargerRdvEnligne(magasinIds);
  if (rows === null) { logger.warn('⚠️ hydrateRdvEnligne ignoré (cache local préservé)'); return; }

  if (rows.length === 0) {
    for (const id of magasinIds) {
      const lower = `leclaire_rdv_enligne_${id.toLowerCase()}`;
      const upper = `leclaire_rdv_enligne_${id.toUpperCase()}`;
      const local = readLocalArray(lower).length ? readLocalArray(lower) : readLocalArray(upper);
      if (local.length) {
        logger.log(`🔧 Auto-réparation RDV ${id} : re-push de ${local.length} entrées locales`);
        try { await replaceRdvEnligne(id, local); }
        catch (e) { logger.error('❌ Auto-réparation RDV échouée:', e); return; }
      }
    }
    const refreshed = await chargerRdvEnligne(magasinIds);
    if (refreshed && refreshed.length) {
      const byMagasin = new Map<string, any[]>();
      for (const id of magasinIds) byMagasin.set(id.toUpperCase(), []);
      for (const r of refreshed) {
        const key = (r.magasin_id || '').toUpperCase();
        if (!byMagasin.has(key)) byMagasin.set(key, []);
        byMagasin.get(key)!.push(rowToRdv(r));
      }
      for (const [magId, list] of byMagasin) {
        setItemWithoutSync(`leclaire_rdv_enligne_${magId.toLowerCase()}`, JSON.stringify(list));
        setItemWithoutSync(`leclaire_rdv_enligne_${magId}`, JSON.stringify(list));
      }
      notify('rdv-updated');
    }
    return;
  }

  const byMagasin = new Map<string, any[]>();
  for (const id of magasinIds) byMagasin.set(id.toUpperCase(), []);
  for (const r of rows) {
    const key = (r.magasin_id || '').toUpperCase();
    if (!byMagasin.has(key)) byMagasin.set(key, []);
    byMagasin.get(key)!.push(rowToRdv(r));
  }
  for (const [magId, list] of byMagasin) {
    setItemWithoutSync(`leclaire_rdv_enligne_${magId.toLowerCase()}`, JSON.stringify(list));
    setItemWithoutSync(`leclaire_rdv_enligne_${magId}`, JSON.stringify(list));
  }
  logger.log(`💾 Cache RDV en ligne : ${rows.length} entrées`);
  notify('rdv-updated');
}

export async function hydrateAtelier(): Promise<void> {
  const rows = await chargerBonsCommandeVerres();
  if (rows === null) { logger.warn('⚠️ hydrateAtelier ignoré'); return; }

  if (rows.length === 0) {
    // Le cloud ne renvoie aucun bon : cela peut être normal pour un utilisateur
    // restreint (opticien, monteur, conseillère) qui n'est autorisé que sur
    // certains magasins. On PRÉSERVE le cache local mais on NE tente PAS de
    // re-pousser les bons locaux — le KV refuserait (403 « magasin non
    // autorisé ») les magasins non autorisés. La réparation reste possible pour
    // les administrateurs qui ont accès à tous les magasins.
    const local = readLocalArray('leclaire_bons_commande_verres');
    if (local.length) {
      logger.log(`🔧 Auto-réparation atelier : re-push de ${local.length} entrées`);
      try {
        await replaceBonsCommandeVerres(local);
      } catch (e: any) {
        // 403 = utilisateur non autorisé sur un magasin : on ignore
        // silencieusement (le cache local est conservé, aucune donnée perdue).
        logger.warn('⚠️ Auto-réparation atelier ignorée (accès magasin restreint) :', e?.message || e);
        return;
      }
      const refreshed = await chargerBonsCommandeVerres();
      if (refreshed && refreshed.length) {
        setItemWithoutSync('leclaire_bons_commande_verres', JSON.stringify(refreshed.map(rowToBonCommande)));
        notify('atelier-updated');
      }
    }
    return;
  }

  const mapped = rows.map(rowToBonCommande);
  setItemWithoutSync('leclaire_bons_commande_verres', JSON.stringify(mapped));
  logger.log(`💾 Cache atelier : ${mapped.length} entrées`);
  notify('atelier-updated');
}

export async function hydrateEmplois(magasinIds: string[]): Promise<void> {
  if (!magasinIds.length) return;
  const rows = await chargerEmplois(magasinIds);
  if (rows === null) { logger.warn('⚠️ hydrateEmplois ignoré'); return; }

  if (rows.length === 0) {
    const local = readLocalArray('leclaire_emplois_du_temps');
    if (local.length) {
      logger.log(`🔧 Auto-réparation emplois : re-push de ${local.length} entrées`);
      try { await replaceEmplois(local); }
      catch (e) { logger.error('❌ Auto-réparation emplois échouée:', e); return; }
      const refreshed = await chargerEmplois(magasinIds);
      if (refreshed && refreshed.length) {
        setItemWithoutSync('leclaire_emplois_du_temps', JSON.stringify(refreshed.map(rowToEmploi)));
        notify('emplois-updated');
      }
    }
    return;
  }

  const mapped = rows.map(rowToEmploi);
  setItemWithoutSync('leclaire_emplois_du_temps', JSON.stringify(mapped));
  logger.log(`💾 Cache emplois : ${mapped.length} entrées`);
  notify('emplois-updated');
}

let unsubscribeListeners: Array<() => void> = [];
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function subscribeResidualRealtime(magasinIds: string[]): () => void {
  unsubscribeListeners.forEach(fn => fn());
  unsubscribeListeners = [];
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (!magasinIds.length) return () => {};

  pollInterval = setInterval(() => {
    Promise.all([
      hydrateRdvEnligne(magasinIds),
      hydrateAtelier(),
      hydrateEmplois(magasinIds),
    ]).catch(e => logger.error('❌ poll residual:', e));
  }, 30_000);

  unsubscribeListeners.push(onSnapshot(collection(db, 'rdv_enligne'), () => {
    hydrateRdvEnligne(magasinIds).catch(e => logger.error('❌ rehydrate rdv:', e));
  }));
  unsubscribeListeners.push(onSnapshot(collection(db, 'bons_commande_verres'), () => {
    hydrateAtelier().catch(e => logger.error('❌ rehydrate atelier:', e));
  }));
  unsubscribeListeners.push(onSnapshot(collection(db, 'emplois_du_temps'), () => {
    hydrateEmplois(magasinIds).catch(e => logger.error('❌ rehydrate emplois:', e));
  }));

  return () => {
    unsubscribeListeners.forEach(fn => fn());
    unsubscribeListeners = [];
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  };
}
