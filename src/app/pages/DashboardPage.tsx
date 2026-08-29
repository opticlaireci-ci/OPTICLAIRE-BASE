import { logger } from '../utils/logger';
import { useEffect, useMemo, useState } from 'react';
import { getMagasins } from '../constants/magasins';
import { chargerToutesLesVentes, subscriberToutesLesVentes, readVentesCache, type VenteSupabase } from '../services/ventesService';
import { chargerTousLesReglements, type ReglementSupabase } from '../services/reglementsService';
import { AdminDashboard, type MagasinRef } from '../components/AdminDashboard';

// Lit la liste des magasins (dédupliquée). Calculée à CHAQUE appel — surtout PAS
// au niveau module — sinon l'ajout d'un 8e magasin ne serait jamais pris en compte
// tant que l'app n'est pas totalement rechargée (constante figée au 1er import).
function lireMagasins(): MagasinRef[] {
  const seen = new Set<string>();
  return getMagasins()
    .filter(m => m?.id && !seen.has(m.id) && seen.add(m.id))
    .map(m => ({ id: m.id, label: m.label || m.id }));
}

const REGLEMENTS_CACHE_KEY = 'leclaire_reglements_cache_ALL';

function readReglementsCache(): ReglementSupabase[] {
  try { return JSON.parse(localStorage.getItem(REGLEMENTS_CACHE_KEY) || '[]'); } catch { return []; }
}
function readObjectif(magasinId: string): number {
  const v = Number(localStorage.getItem(`leclaire_objectif_${magasinId}`));
  return Number.isFinite(v) ? v : 0;
}
function readTauxMarge(): number {
  const v = Number(localStorage.getItem('leclaire_taux_marge'));
  return Number.isFinite(v) && v > 0 ? v : 0.4;
}

/**
 * Tableau de bord global — Administrateur / Directeur / Comptable (route « / »).
 * Reproduit le tableau de bord sgoptic.net dans son intégralité, agrégé sur tous
 * les magasins. Ces vues globales n'apparaissent QUE sur ce tableau de bord ;
 * les magasins conservent leur propre tableau de bord (SgopticDashboard).
 */
export function DashboardPage() {
  const [ventes, setVentes] = useState<VenteSupabase[]>(() => readVentesCache('ALL'));
  const [reglements, setReglements] = useState<ReglementSupabase[]>(() => readReglementsCache());
  const [magasins, setMagasins] = useState<MagasinRef[]>(() => lireMagasins());

  // La liste des magasins évolue (ajout via Gestion Magasins, synchro cloud).
  // On la recharge sur les événements de mise à jour pour refléter le 8e magasin
  // sans recharger toute l'application.
  useEffect(() => {
    const refresh = () => setMagasins(lireMagasins());
    window.addEventListener('leclaire-sync-update', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('supabase-realtime-update', refresh as EventListener);
    return () => {
      window.removeEventListener('leclaire-sync-update', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('supabase-realtime-update', refresh as EventListener);
    };
  }, []);

  const magasinIds = useMemo(() => magasins.map(m => m.id), [magasins]);

  useEffect(() => {
    let mounted = true;
    chargerToutesLesVentes()
      .then(rows => { if (mounted) setVentes(rows); })
      .catch(e => logger.error('❌ dashboard ventes:', e));

    const map = new Map<string, VenteSupabase>();
    const flush = () => { if (mounted) setVentes(Array.from(map.values())); };
    const unsub = subscriberToutesLesVentes(
      v => { map.set(v.id, v); flush(); },
      v => { map.set(v.id, v); flush(); },
      id => { map.delete(id); flush(); },
    );
    return () => { mounted = false; unsub(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => chargerTousLesReglements()
      .then(rows => {
        if (!mounted) return;
        setReglements(rows);
        try { localStorage.setItem(REGLEMENTS_CACHE_KEY, JSON.stringify(rows)); } catch { /* quota */ }
      })
      .catch(e => logger.error('❌ dashboard reglements:', e));
    load();
    window.addEventListener('leclaire-sync-update', load);
    window.addEventListener('storage', load);
    return () => {
      mounted = false;
      window.removeEventListener('leclaire-sync-update', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  const objectifGlobal = useMemo(
    () => magasinIds.reduce((s, id) => s + readObjectif(id), 0),
    [magasinIds],
  );

  return (
    <AdminDashboard
      ventes={ventes}
      reglements={reglements}
      magasins={magasins}
      objectifGlobal={objectifGlobal}
      objectifDe={readObjectif}
      tauxMarge={readTauxMarge()}
    />
  );
}
