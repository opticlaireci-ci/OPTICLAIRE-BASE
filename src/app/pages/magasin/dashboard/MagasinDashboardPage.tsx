import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { chargerVentes, readVentesCache, type VenteSupabase } from '../../../services/ventesService';
import { chargerReglementsParMagasin, type ReglementSupabase } from '../../../services/reglementsService';
import { getMagasinLabel } from '../../../constants/magasins';
import { SgopticDashboard } from '../../../components/SgopticDashboard';

const REGLEMENTS_CACHE = (m: string) => `leclaire_reglements_cache_${m}`;

function readLS<T = any>(key: string): T[] {
  try { const raw = localStorage.getItem(key); const p = raw ? JSON.parse(raw) : []; return Array.isArray(p) ? p : []; }
  catch { return []; }
}

export function MagasinDashboardPage() {
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const magKey = magasinId.toUpperCase();
  const label = getMagasinLabel(magasinId) || magasinId.toUpperCase();

  const [ventes, setVentes] = useState<VenteSupabase[]>(() => readVentesCache(magasinId));
  const [reglements, setReglements] = useState<ReglementSupabase[]>(() => readLS(REGLEMENTS_CACHE(magasinId)));

  const objectif = Number(localStorage.getItem(`leclaire_objectif_${magasinId}`) || 0) || 0;
  const tauxMarge = Number(localStorage.getItem('leclaire_taux_marge') || 0.4) || 0.4;

  useEffect(() => {
    if (!magasinId) return;
    let mounted = true;
    const load = () => {
      // IMPORTANT : les ventes/règlements sont enregistrés avec `magasin_id` =
      // l'identifiant MINUSCULE de la route (ex. « yopougon »). Il faut donc
      // interroger Firestore avec `magasinId` (minuscule) et NON `magKey`
      // (majuscule), sinon la requête d'égalité ne renvoie rien et les
      // « chiffres du jour » restent à zéro sur un appareil sans cache local.
      chargerVentes(magasinId).then((rows: VenteSupabase[]) => {
        if (mounted && rows.length > 0) setVentes(rows);
      }).catch(() => {});
      chargerReglementsParMagasin(magasinId).then(rows => {
        if (mounted && rows.length > 0) {
          setReglements(rows);
          try { localStorage.setItem(REGLEMENTS_CACHE(magasinId), JSON.stringify(rows)); } catch { /* quota */ }
        }
      }).catch(() => {});
    };
    load();
    const refresh = () => load();
    const interval = setInterval(load, 8000);
    window.addEventListener('leclaire-sync-update', refresh);
    window.addEventListener('ventes-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('leclaire-sync-update', refresh);
      window.removeEventListener('ventes-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [magasinId, magKey]);

  return (
    <SgopticDashboard
      title={label}
      ventes={ventes}
      reglements={reglements}
      objectif={objectif}
      tauxMarge={tauxMarge}
    />
  );
}
