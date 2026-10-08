import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Phone, ExternalLink, BellRing, Search, Printer } from 'lucide-react';
import {
  abonnerVentesMagasin, abonnerToutesLesVentes, chargerVentes, chargerToutesLesVentes,
  readVentesCache, mettreAJourVente, type VenteSupabase,
} from '../../../services/ventesService';
import {
  chargerReglementsParMagasin, chargerTousLesReglements, type ReglementSupabase,
} from '../../../services/reglementsService';
import { normaliserTotauxVente } from '../../../utils/venteTotals';
import { setVisibleInterval, PAGE_POLL_MS } from '../../../utils/visibleInterval';
import { useAuth } from '../../../contexts/AuthContext';
import { getAllMagasinIds, getMagasinById, getMagasinLabel } from '../../../constants/magasins';
import { logger } from '../../../utils/logger';

/**
 * CLIENTS NON SOLDÉS (relances)
 *
 * Liste AUTOMATIQUE — rien n'est recopié ni déplacé :
 *   • une facture d'un mois TERMINÉ (avant le mois en cours) dont le client
 *     doit encore de l'argent apparaît ici dès le 1er du mois suivant ;
 *   • la facture reste dans Vente | Facture, c'est là qu'on la solde ;
 *   • dès qu'elle est soldée (ligne verte dans Vente | Facture), elle disparaît
 *     d'elle-même de cette liste.
 * Reste à payer = Total net − assurance − acompte − règlements (même calcul
 * que la liste Vente | Facture).
 *
 * Deux usages du même écran :
 *   • dans un magasin (menu du magasin) : uniquement les factures de CE magasin ;
 *   • côté administration (bouton dans Visualisation PDF et Excel) : tous les
 *     magasins, avec un filtre par magasin, sans avoir à entrer dans chacun.
 */

interface LigneRelance {
  vente: VenteSupabase;
  totalNet: number;
  assurance: number;
  paye: number;
  reste: number;
  relance?: { date: string; par: string };
}

const num = (v: unknown) => Number(v) || 0;
const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const fmtDate = (s?: string) => {
  const d = new Date(s || '');
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
};
const moisLibelle = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};
const moisCle = (s: string) => String(s || '').slice(0, 7);
const minuscule = (m: unknown) => String(m || '').trim().toLowerCase();
const estImportTechnique = (r: ReglementSupabase) => minuscule(r.details) === 'acompte importé';

/** Identifiant de magasin tel qu'utilisé dans les adresses (/magasin/<id>/…). */
const idRoute = (m: unknown) => getMagasinById(String(m || ''))?.id || minuscule(m);

/** Page du menu d'un magasin : uniquement les clients de CE magasin. */
export function RecouvrementPage() {
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  return <ClientsNonSoldes magasinId={magasinId} />;
}

/**
 * `magasinId` fourni → ce magasin seulement. Absent → tous les magasins
 * (vue administration).
 */
export function ClientsNonSoldes({ magasinId = '' }: { magasinId?: string }) {
  const tousMagasins = !magasinId;
  const cleCache = magasinId || 'ALL';
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ventes, setVentes] = useState<VenteSupabase[]>(() => readVentesCache(cleCache));
  const [reglements, setReglements] = useState<ReglementSupabase[]>([]);
  const [recherche, setRecherche] = useState('');
  const [mois, setMois] = useState('');
  const [magasinFiltre, setMagasinFiltre] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [impression, setImpression] = useState<string | null>(null);

  // Ventes : affichage immédiat (copie locale) puis temps réel.
  useEffect(() => {
    setVentes(readVentesCache(cleCache));
    (tousMagasins ? chargerToutesLesVentes() : chargerVentes(magasinId)).then(setVentes).catch(() => {});
    const unsub = tousMagasins ? abonnerToutesLesVentes(setVentes) : abonnerVentesMagasin(magasinId, setVentes);
    return () => unsub();
  }, [magasinId, cleCache, tousMagasins]);

  // Règlements : rechargés régulièrement et après chaque paiement.
  useEffect(() => {
    let actif = true;
    const charger = () => (tousMagasins ? chargerTousLesReglements() : chargerReglementsParMagasin(magasinId))
      .then(rows => { if (actif) setReglements(rows); })
      .catch(err => logger.error('❌ Relances — règlements:', err));
    charger();
    const stop = setVisibleInterval(charger, PAGE_POLL_MS);
    window.addEventListener('reglements-updated', charger);
    window.addEventListener('ventes-updated', charger);
    return () => {
      actif = false;
      stop();
      window.removeEventListener('reglements-updated', charger);
      window.removeEventListener('ventes-updated', charger);
    };
  }, [magasinId, tousMagasins]);

  const lignes = useMemo<LigneRelance[]>(() => {
    // Sécurité : dans un magasin, uniquement les factures et règlements de CE
    // magasin, quelle que soit la façon dont les données sont arrivées (copie
    // locale, temps réel). Vue administration : tous les magasins.
    const ceMagasin = (m: unknown) => tousMagasins || minuscule(m) === minuscule(magasinId);
    const ventesMagasin = ventes.filter(v => ceMagasin(v.magasin_id));
    const reglementsMagasin = reglements.filter(r => ceMagasin(r.magasin_id));
    const maintenant = new Date();
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).getTime();
    const parVente = new Map<string, number>();
    for (const r of reglementsMagasin) {
      if (!r.vente_id) continue;
      parVente.set(r.vente_id, (parVente.get(r.vente_id) || 0) + num(r.montant));
    }
    // Ligne technique des anciennes importations (acompte déjà compté dans la vente).
    const doublonImport = new Map<string, number>();
    for (const r of reglementsMagasin) {
      if (estImportTechnique(r)) {
        doublonImport.set(r.vente_id, (doublonImport.get(r.vente_id) || 0) + num(r.montant));
      }
    }
    const out: LigneRelance[] = [];
    for (const v of ventesMagasin) {
      if (v.type === 'devis') continue;
      const t = new Date(v.date || '').getTime();
      if (isNaN(t) || t >= debutMois) continue; // mois en cours : pas encore en relance
      const recap: any = v.recap || {};
      const totalNet = normaliserTotauxVente(v).totalNet;
      const assurance = (Array.isArray(v.bons_assurance) ? v.bons_assurance : [])
        .reduce((s: number, b: any) => s + num(b?.montantPrisEnCharge ?? b?.montant ?? b?.total ?? b?.montantAssurance), 0);
      const reglementsVente = (parVente.get(v.id) || 0) - (recap.imported ? (doublonImport.get(v.id) || 0) : 0);
      const paye = num(recap.acompte) + reglementsVente;
      const reste = Math.max(0, totalNet - assurance - paye);
      if (reste < 1) continue; // soldée → retirée automatiquement
      out.push({ vente: v, totalNet, assurance, paye, reste, relance: (v as any).relance });
    }
    // Les plus anciennes d'abord (les plus urgentes à relancer).
    return out.sort((a, b) => String(a.vente.date).localeCompare(String(b.vente.date)));
  }, [ventes, reglements, magasinId, tousMagasins]);

  const moisDisponibles = useMemo(
    () => Array.from(new Set(lignes.map(l => moisCle(l.vente.date)))).sort().reverse(),
    [lignes],
  );

  const affichees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter(l => {
      if (magasinFiltre && minuscule(l.vente.magasin_id) !== minuscule(magasinFiltre)) return false;
      if (mois && moisCle(l.vente.date) !== mois) return false;
      if (!q) return true;
      const v = l.vente;
      return [v.client, v.numero_client, v.telephone, v.recap?.numFacture]
        .some(x => String(x || '').toLowerCase().includes(q));
    });
  }, [lignes, recherche, mois, magasinFiltre]);

  const totalReste = affichees.reduce((s, l) => s + l.reste, 0);

  const ouvrirFacture = (v: VenteSupabase) =>
    navigate(`/magasin/${magasinId || idRoute(v.magasin_id)}/commercial/vente-facture?detail=${encodeURIComponent(v.id)}`);

  /**
   * Reçu du DERNIER règlement du client (même document que « Dernier Règlement
   * PDF » dans Vente | Facture) : dernier versement + cumul payé + reste.
   */
  const imprimerRecu = async (l: LigneRelance) => {
    const v = l.vente;
    const recap: any = v.recap || {};
    const acompteInitial = num(recap.acompte);
    const reglementsVente = reglements
      .filter(r => r.vente_id === v.id)
      .filter(r => !(recap.imported && estImportTechnique(r)))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const totalPaye = acompteInitial + reglementsVente.reduce((s, r) => s + num(r.montant), 0);
    if (totalPaye <= 0) {
      alert(`Aucun règlement enregistré pour ${v.client || 'ce client'} : il n'y a pas encore de reçu à imprimer.`);
      return;
    }
    const dernier = reglementsVente.length > 0 ? reglementsVente[reglementsVente.length - 1] : null;
    setImpression(v.id);
    try {
      const { telechargerReglementPDF, venteSupabaseToSauvegardee } = await import('./VenteFacturePage');
      await telechargerReglementPDF({
        recu: dernier?.recu || recap.numRecu || '—',
        modePaiement: dernier?.mode_paiement || recap.modePaiement || 'ESPECE',
        compteBanque: dernier?.compte_banque || recap.compteBanque || 'CAISSE INTERNE',
        details: dernier?.details || recap.details || '',
        montant: dernier ? num(dernier.montant) : acompteInitial,
        totalPaye,
        date: dernier?.date || v.date,
        editePar: dernier?.edite_par || v.edite_par || '—',
      }, venteSupabaseToSauvegardee(v), v.magasin_id || magasinId);
    } catch (err) {
      logger.error('❌ Reçu non généré:', err);
      alert('Impossible de générer le reçu. Vérifiez la connexion puis réessayez.');
    } finally {
      setImpression(null);
    }
  };

  const noterRelance = async (l: LigneRelance) => {
    setEnCours(l.vente.id);
    try {
      const relance = { date: new Date().toISOString(), par: user?.nom || user?.prenom || user?.email || '' };
      const maj = await mettreAJourVente(l.vente.id, { relance } as any);
      if (maj) setVentes(prev => prev.map(v => (v.id === l.vente.id ? { ...v, relance } as any : v)));
      else alert("La relance n'a pas pu être enregistrée. Réessayez.");
    } catch (err) {
      logger.error('❌ Relance non enregistrée:', err);
      alert("La relance n'a pas pu être enregistrée. Vérifiez la connexion puis réessayez.");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4" style={{ backgroundColor: '#eef2f4', minHeight: '100%' }}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h1 className="text-lg font-bold text-gray-800">
          Clients non soldés — {tousMagasins ? (magasinFiltre ? getMagasinLabel(magasinFiltre) : 'tous les magasins') : getMagasinLabel(magasinId)}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Factures des mois précédents qui ne sont pas encore soldées. Le client se règle dans
          <strong> Vente | Facture</strong> ; une fois soldée, la facture disparaît automatiquement de cette liste.
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="rounded-lg px-4 py-2" style={{ backgroundColor: '#fee2e2' }}>
            <div className="text-xs text-red-700">Clients à relancer</div>
            <div className="text-xl font-bold text-red-800">{affichees.length}</div>
          </div>
          <div className="rounded-lg px-4 py-2" style={{ backgroundColor: '#fee2e2' }}>
            <div className="text-xs text-red-700">Total restant à encaisser</div>
            <div className="text-xl font-bold text-red-800">{fmt(totalReste)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          {tousMagasins && (
            <select value={magasinFiltre} onChange={e => setMagasinFiltre(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
              <option value="">Tous les magasins</option>
              {getAllMagasinIds().map(id => <option key={id} value={id}>{getMagasinLabel(id)}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2 border border-gray-300 rounded px-2 bg-white" style={{ minWidth: 260 }}>
            <Search size={14} className="text-gray-400" />
            <input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder="Client, téléphone, n° facture…"
              className="py-1.5 text-sm outline-none flex-1"
            />
          </div>
          <select value={mois} onChange={e => setMois(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            <option value="">Tous les mois</option>
            {moisDisponibles.map(m => <option key={m} value={m}>{moisLibelle(m + '-01')}</option>)}
          </select>
        </div>
      </div>

      {affichees.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500 text-sm">
          {lignes.length === 0 ? 'Aucun client à relancer : toutes les factures des mois précédents sont soldées.' : 'Aucun résultat pour cette recherche.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse" style={{ minWidth: 900, maxWidth: 'none' }}>
              <thead>
                <tr style={{ backgroundColor: '#1a7a96' }}>
                  {['#', 'Date facture', tousMagasins ? 'N° Facture / Magasin' : 'N° Facture', 'Client', 'Total net', 'Assurance', 'Payé', 'Reste à payer', 'Dernière relance', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-white font-semibold text-xs uppercase border border-gray-300 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {affichees.map((l, i) => {
                  const v = l.vente;
                  return (
                    <tr key={v.id} className="border-b border-gray-200" style={{ backgroundColor: '#fff5f5' }}>
                      <td className="px-3 py-2 border border-gray-200 text-center">{i + 1}</td>
                      <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{fmtDate(v.date)}</td>
                      <td className="px-3 py-2 border border-gray-200">
                        <div className="font-mono font-semibold text-blue-700 whitespace-nowrap">{v.recap?.numFacture || '—'}</div>
                        {tousMagasins && (
                          <div className="text-xs font-semibold text-gray-600 mt-0.5">{getMagasinLabel(String(v.magasin_id || ''))}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 border border-gray-200">
                        <div className="font-semibold text-gray-800">{v.client}</div>
                        <div className="text-xs text-gray-500">N° {v.numero_client || '—'}</div>
                        {v.telephone && (
                          <a href={`tel:${v.telephone}`} className="inline-flex items-center gap-1 text-xs text-blue-700 mt-0.5">
                            <Phone className="shrink-0" size={11} /> {v.telephone}
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2 border border-gray-200 text-right whitespace-nowrap">{fmt(l.totalNet)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right whitespace-nowrap">{fmt(l.assurance)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right whitespace-nowrap">{fmt(l.paye)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right whitespace-nowrap font-bold text-red-700">{fmt(l.reste)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-xs text-gray-600">
                        {l.relance?.date ? <>{fmtDate(l.relance.date)}<div className="text-gray-500">{l.relance.par}</div></> : 'Jamais'}
                      </td>
                      <td className="px-3 py-2 border border-gray-200">
                        <div className="flex flex-col flex-nowrap gap-1">
                          <button onClick={() => ouvrirFacture(v)} className="inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white whitespace-nowrap" style={{ backgroundColor: '#1a7a96' }}>
                            <ExternalLink className="shrink-0" size={12} /> Ouvrir la facture
                          </button>
                          <button onClick={() => imprimerRecu(l)} disabled={impression === v.id} className="inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60" style={{ backgroundColor: '#374151' }}>
                            <Printer className="shrink-0" size={12} /> {impression === v.id ? 'Préparation…' : 'Imprimer le reçu'}
                          </button>
                          <button onClick={() => noterRelance(l)} disabled={enCours === v.id} className="inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60" style={{ backgroundColor: '#f59e0b' }}>
                            <BellRing className="shrink-0" size={12} /> {enCours === v.id ? 'Enregistrement…' : 'Client relancé'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
