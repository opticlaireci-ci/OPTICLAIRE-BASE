import { logger } from '../../../utils/logger';
import { useEffect, useMemo, useState } from 'react';
import { Printer, FileDown, FileSpreadsheet } from 'lucide-react';
import { getMagasins, type Magasin } from '../../../constants/magasins';
import { useLiveData } from '../../../hooks/useLiveData';
import { useAuth } from '../../../contexts/AuthContext';
import { addCreateAudit, addUpdateAudit, AuditInfo } from '../../../utils/auditUtils';
import { TENANT } from '../../../config/tenant';
import { chargerToutesLesVentes, type VenteSupabase } from '../../../services/ventesService';
import { afficherPdfBlob, imprimerPageCourante } from '../../../utils/inAppViewer';

// Jours de la semaine (lundi → dimanche) tels qu'affichés dans le tableau.
const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'] as const;
type Jour = typeof JOURS[number];

// Un enregistrement = une saisie recettes/dépenses pour un magasin, une semaine et un jour.
interface RecapEntry extends AuditInfo {
  id: string;            // `${magasinId}_${semaine}_${jour}`
  magasinId: string;
  semaine: string;       // date du lundi de la semaine (yyyy-mm-dd)
  jour: Jour;
  recettes: number;
  depenses: number;
}

// Rôles autorisés à modifier (écriture). Les autres sont en lecture seule.
const ROLES_ECRITURE = ['super_admin', 'admin', 'administrateur', 'directeur', 'comptable'];

/** Retourne la date (yyyy-mm-dd) du lundi de la semaine contenant `d`. */
function lundiDeLaSemaine(d: Date): string {
  const date = new Date(d);
  const day = date.getDay(); // 0 = dimanche, 1 = lundi ...
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

/** Décale une semaine (lundi yyyy-mm-dd) de `n` semaines. */
function decalerSemaine(semaine: string, n: number): string {
  const d = new Date(semaine + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

/** Index du jour (0 = lundi) → date yyyy-mm-dd dans la semaine donnée. */
function dateDuJour(semaine: string, index: number): string {
  const d = new Date(semaine + 'T00:00:00');
  d.setDate(d.getDate() + index);
  return d.toISOString().slice(0, 10);
}

/**
 * Calcule les recettes (ventes) par jour d'une semaine pour un magasin,
 * à partir des ventes stockées localement (`leclaire_ventes_{magasinId}`).
 */
function montantAssuranceVente(v: any): number {
  const bons = Array.isArray(v?.bons_assurance) ? v.bons_assurance : (Array.isArray(v?.bonsAssurance) ? v.bonsAssurance : []);
  return bons.reduce((sum: number, b: any) => {
    return sum + (Number(b?.montantPrisEnCharge ?? b?.montant ?? b?.total ?? b?.montantAssurance) || 0);
  }, 0);
}

function montantRecetteVente(v: any): number {
  const total = Number(v?.total_net ?? v?.total_brut ?? v?.totalNet ?? v?.totalAPayer ?? v?.montantTotal ?? v?.total ?? 0) || 0;
  // La prise en charge assurance n'est pas une recette encaissée par le magasin.
  return Math.max(0, total - montantAssuranceVente(v));
}

function dateMouvementISO(date: string): string {
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? String(date).slice(0, 10) : parsed.toISOString().slice(0, 10);
}

/** Calcule les recettes réelles par jour : la part prise en charge par assurance est exclue. */
function recettesVentesParJour(magasinId: string, semaine: string, ventesSource?: VenteSupabase[]): Record<Jour, number> {
  const result = Object.fromEntries(JOURS.map(j => [j, 0])) as Record<Jour, number>;
  try {
    const ventes = ventesSource || JSON.parse(localStorage.getItem(`leclaire_ventes_${magasinId.toUpperCase()}`) || '[]');
    const jourDates = JOURS.map((_, i) => dateDuJour(semaine, i));
    ventes.forEach((v: any) => {
      if ((v.type || 'vente') !== 'vente') return;
      if (magasinId && String(v.magasin_id || '').toUpperCase() !== String(magasinId).toUpperCase()) return;
      const brut = v.date || v.dateVente || v.created_at || v.createdAt;
      if (!brut) return;
      const jourVente = dateMouvementISO(brut);
      const idx = jourDates.indexOf(jourVente);
      if (idx === -1) return;
      result[JOURS[idx]] += montantRecetteVente(v);
    });
  } catch (error) {
    logger.error(`Erreur calcul recettes ventes ${magasinId}:`, error);
  }
  return result;
}

interface LigneRecap { jour: Jour; recettes: number; depenses: number; rd: number; }
interface RecapMagasin { lignes: LigneRecap[]; totalR: number; totalD: number; }

interface MouvementCaisseRecap {
  id: string;
  date: string;
  magasinId: string;
  type: 'entree' | 'sortie';
  categorie: string;
  montant: number;
  libelle: string;
  modePaiement: string;
  reference?: string;
  responsable?: string;
}

interface MouvementAdministrationRecap {
  id: string;
  reference: string;
  magasin?: string;
  dateMouvement: string;
  heure?: string;
  beneficiaire: string;
  type: string;
  nature: string;
  montant: number;
  modePaiement: string;
  compteBanque: string;
  commentaire: string;
}

function depensesMouvementsParJour(magasinId: string, semaine: string, mouvements: MouvementCaisseRecap[]): Record<Jour, number> {
  const result = Object.fromEntries(JOURS.map(j => [j, 0])) as Record<Jour, number>;
  const jourDates = JOURS.map((_, i) => dateDuJour(semaine, i));
  mouvements.forEach(m => {
    if (String(m.magasinId || '').toUpperCase() !== String(magasinId).toUpperCase()) return;
    if (String(m.type || '').toLowerCase() !== 'sortie') return;
    const idx = jourDates.indexOf(dateMouvementISO(m.date));
    if (idx === -1) return;
    result[JOURS[idx]] += Number(m.montant) || 0;
  });
  return result;
}

/** Construit les lignes recettes/dépenses/R-D + totaux d'un magasin pour une semaine. */
function calcRecapMagasin(
  magasinId: string,
  semaine: string,
  entries: RecapEntry[],
  mouvementsCaisse: MouvementCaisseRecap[] = [],
  ventesSource?: VenteSupabase[],
): RecapMagasin {
  const recettesAuto = recettesVentesParJour(magasinId, semaine, ventesSource);
  const depensesAuto = depensesMouvementsParJour(magasinId, semaine, mouvementsCaisse);
  let totalR = 0, totalD = 0;
  const lignes = JOURS.map(jour => {
    const e = entries.find(x => x.jour === jour);
    const recettes = recettesAuto[jour] || 0;
    // Les sorties enregistrées dans les mouvements de caisse deviennent les dépenses du récap.
    // Les anciennes saisies manuelles restent utilisées uniquement lorsqu'aucune sortie n'est enregistrée ce jour-là.
    const depenses = depensesAuto[jour] > 0 ? depensesAuto[jour] : (e?.depenses || 0);
    totalR += recettes; totalD += depenses;
    return { jour, recettes, depenses, rd: recettes - depenses };
  });
  return { lignes, totalR, totalD };
}

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR');

function TableauMagasin({
  magasinLabel, recap, onSet, editable,
}: {
  magasinLabel: string;
  recap: RecapMagasin;
  onSet: (jour: Jour, champ: 'recettes' | 'depenses', valeur: number) => void;
  editable: boolean;
}) {
  const cellNum = 'px-2 py-1.5 text-center font-semibold';
  const nomOfficine = magasinLabel.replace(`${TENANT.nom} `, '');

  return (
    <div className="border-2 border-gray-800 rounded overflow-hidden bg-white">
      <div className="text-center font-bold py-1.5 border-b-2 border-gray-800 bg-white text-sm">
        OFFICINE {nomOfficine}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-700 px-2 py-1 bg-white text-gray-800 text-xs">JOURS</th>
              <th className="border border-gray-700 px-2 py-1 text-white text-xs" style={{ backgroundColor: '#7b8fc7' }}>RECETTES</th>
              <th className="border border-gray-700 px-2 py-1 text-white text-xs" style={{ backgroundColor: '#e53935' }}>DEPENSES</th>
              <th className="border border-gray-700 px-2 py-1 text-white text-xs" style={{ backgroundColor: '#29b6f6' }}>R-D</th>
            </tr>
          </thead>
          <tbody>
            {recap.lignes.map(({ jour, recettes, depenses, rd }) => (
              <tr key={jour}>
                <td className="border border-gray-700 px-2 py-1 font-bold text-gray-800 text-xs bg-white">{jour}</td>
                <td className={cellNum + ' text-gray-900'} style={{ backgroundColor: '#9fb0da' }}>
                  {editable ? (
                    <input
                      type="number"
                      className="w-full bg-transparent text-center outline-none font-semibold"
                      value={recettes}
                      onChange={e => onSet(jour, 'recettes', Number(e.target.value) || 0)}
                    />
                  ) : fmt(recettes)}
                </td>
                <td className={cellNum + ' text-white'} style={{ backgroundColor: '#f44336' }}>
                  {editable ? (
                    <input
                      type="number"
                      className="w-full bg-transparent text-center outline-none font-semibold text-white"
                      value={depenses}
                      onChange={e => onSet(jour, 'depenses', Number(e.target.value) || 0)}
                    />
                  ) : fmt(depenses)}
                </td>
                <td className={cellNum + ' text-gray-900'} style={{ backgroundColor: '#4fc3f7' }}>{fmt(rd)}</td>
              </tr>
            ))}
            <tr>
              <td className="border-2 border-gray-800 px-2 py-1.5 font-bold text-gray-900 text-sm bg-white">TOTAL</td>
              <td className={cellNum + ' text-gray-900 border-2 border-gray-800'} style={{ backgroundColor: '#9fb0da' }}>{fmt(recap.totalR)}</td>
              <td className={cellNum + ' text-white border-2 border-gray-800'} style={{ backgroundColor: '#f44336' }}>{fmt(recap.totalD)}</td>
              <td className={cellNum + ' text-gray-900 border-2 border-gray-800'} style={{ backgroundColor: '#4fc3f7' }}>{fmt(recap.totalR - recap.totalD)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile cards — one row per jour */}
      <div className="md:hidden">
        {recap.lignes.map(({ jour, recettes, depenses, rd }) => (
          <div key={jour} style={{ borderBottom: '1px solid #e5e7eb', padding: '0.5rem 0.75rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#374151', marginBottom: '0.35rem' }}>{jour}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.375rem' }}>
              <div style={{ background: '#9fb0da', borderRadius: 6, padding: '0.3rem 0.4rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', color: '#1e3a5f', fontWeight: 600, marginBottom: '0.15rem' }}>RECETTES</div>
                {editable ? (
                  <input
                    type="number"
                    style={{ width: '100%', background: 'transparent', textAlign: 'center', outline: 'none', fontWeight: 700, fontSize: '0.8125rem', color: '#1e293b' }}
                    value={recettes}
                    onChange={e => onSet(jour, 'recettes', Number(e.target.value) || 0)}
                  />
                ) : (
                  <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#1e293b' }}>{fmt(recettes)}</div>
                )}
              </div>
              <div style={{ background: '#f44336', borderRadius: 6, padding: '0.3rem 0.4rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', color: '#fff', fontWeight: 600, marginBottom: '0.15rem' }}>DEPENSES</div>
                {editable ? (
                  <input
                    type="number"
                    style={{ width: '100%', background: 'transparent', textAlign: 'center', outline: 'none', fontWeight: 700, fontSize: '0.8125rem', color: '#fff' }}
                    value={depenses}
                    onChange={e => onSet(jour, 'depenses', Number(e.target.value) || 0)}
                  />
                ) : (
                  <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#fff' }}>{fmt(depenses)}</div>
                )}
              </div>
              <div style={{ background: '#4fc3f7', borderRadius: 6, padding: '0.3rem 0.4rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', color: '#1e3a5f', fontWeight: 600, marginBottom: '0.15rem' }}>R-D</div>
                <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#1e293b' }}>{fmt(rd)}</div>
              </div>
            </div>
          </div>
        ))}
        {/* Total row */}
        <div style={{ padding: '0.5rem 0.75rem', background: '#f9fafb' }}>
          <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#374151', marginBottom: '0.35rem' }}>TOTAL</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.375rem' }}>
            <div style={{ background: '#9fb0da', borderRadius: 6, padding: '0.3rem 0.5rem', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>{fmt(recap.totalR)}</div>
            </div>
            <div style={{ background: '#f44336', borderRadius: 6, padding: '0.3rem 0.5rem', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#fff' }}>{fmt(recap.totalD)}</div>
            </div>
            <div style={{ background: '#4fc3f7', borderRadius: 6, padding: '0.3rem 0.5rem', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>{fmt(recap.totalR - recap.totalD)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function formatDateAffichage(date: string): string {
  if (!date) return '—';
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('fr-FR');
}

function TableauMouvementsSemaine({
  titre,
  mouvements,
  administration = false,
}: {
  titre: string;
  mouvements: Array<MouvementCaisseRecap | MouvementAdministrationRecap>;
  administration?: boolean;
}) {
  const rows = [...mouvements].sort((a, b) => {
    const da = administration
      ? `${(a as MouvementAdministrationRecap).dateMouvement || ''} ${(a as MouvementAdministrationRecap).heure || ''}`
      : (a as MouvementCaisseRecap).date || '';
    const db = administration
      ? `${(b as MouvementAdministrationRecap).dateMouvement || ''} ${(b as MouvementAdministrationRecap).heure || ''}`
      : (b as MouvementCaisseRecap).date || '';
    return db.localeCompare(da);
  });

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-white border-b border-gray-200 font-bold text-sm text-gray-800">
        {titre} ({rows.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold text-xs">
              <th className="text-left px-2 py-2.5">N° Mouvement</th>
              <th className="text-left px-2 py-2.5">Bénéficiaire</th>
              <th className="text-left px-2 py-2.5">Type</th>
              <th className="text-left px-2 py-2.5">Nature</th>
              <th className="text-right px-2 py-2.5">Montant</th>
              <th className="text-left px-2 py-2.5">Mode de Paiement</th>
              <th className="text-left px-2 py-2.5">Compte Banque</th>
              <th className="text-left px-2 py-2.5">Commentaire</th>
              <th className="text-left px-2 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Aucun mouvement sur cette semaine</td></tr>
            ) : rows.map((raw, idx) => {
              if (administration) {
                const m = raw as MouvementAdministrationRecap;
                return (
                  <tr key={m.id || idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-2 font-mono text-blue-700">{m.reference || '—'}</td>
                    <td className="px-2 py-2 font-semibold">{m.beneficiaire || '—'}</td>
                    <td className="px-2 py-2">
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: String(m.type || '').toLowerCase() === 'entrée' ? '#16a34a' : '#dc2626' }}>{String(m.type || '').toLowerCase() === 'entrée' ? 'Entrée' : 'Sortie'}</span>
                    </td>
                    <td className="px-2 py-2 text-gray-600">{m.nature || '—'}</td>
                    <td className="px-2 py-2 text-right font-semibold">{(Number(m.montant) || 0).toLocaleString('fr-FR')}</td>
                    <td className="px-2 py-2 text-gray-600">{m.modePaiement || '—'}</td>
                    <td className="px-2 py-2 text-gray-600 text-xs">{m.compteBanque || '—'}</td>
                    <td className="px-2 py-2 text-gray-500">{m.commentaire || '—'}</td>
                    <td className="px-2 py-2 text-gray-600">{formatDateAffichage(m.dateMouvement)}</td>
                  </tr>
                );
              }
              const m = raw as MouvementCaisseRecap;
              return (
                <tr key={m.id || idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-2 font-mono text-blue-700">{m.reference || m.id || '—'}</td>
                  <td className="px-2 py-2 font-semibold">{m.libelle || '—'}</td>
                  <td className="px-2 py-2">
                    <span className="px-1.5 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: m.type === 'entree' ? '#16a34a' : '#dc2626' }}>{m.type === 'entree' ? 'Entrée' : 'Sortie'}</span>
                  </td>
                  <td className="px-2 py-2 text-gray-600">{m.categorie || '—'}</td>
                  <td className="px-2 py-2 text-right font-semibold">{(Number(m.montant) || 0).toLocaleString('fr-FR')}</td>
                  <td className="px-2 py-2 text-gray-600">{m.modePaiement || '—'}</td>
                  <td className="px-2 py-2 text-gray-600 text-xs">—</td>
                  <td className="px-2 py-2 text-gray-500">{m.responsable || '—'}</td>
                  <td className="px-2 py-2 text-gray-600">{formatDateAffichage(m.date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RecapHebdomadairePage() {
  const { user } = useAuth();
  const editable = ROLES_ECRITURE.includes(user?.role || '');
  const [recaps, setRecaps] = useLiveData<RecapEntry>('leclaire_recap_hebdo', []);
  const [mouvementsCaisse] = useLiveData<MouvementCaisseRecap>('leclaire_mouvements_caisse', []);
  const [mouvementsAdministration] = useLiveData<MouvementAdministrationRecap>('leclaire_mouvements', []);
  const [ventesAll, setVentesAll] = useState<VenteSupabase[] | null>(null);
  const [semaine, setSemaine] = useState<string>(() => lundiDeLaSemaine(new Date()));

  // Les ventes sont rechargées directement pour que le récap reste exact même si
  // le cache local du magasin n'a pas encore été rafraîchi.
  useEffect(() => {
    let annule = false;
    const load = () => chargerToutesLesVentes().then(rows => {
      if (!annule) setVentesAll(rows);
    }).catch(() => {});
    load();
    const interval = setInterval(load, 15000);
    const onUpdate = () => load();
    window.addEventListener('ventes-updated', onUpdate);
    return () => {
      annule = true;
      clearInterval(interval);
      window.removeEventListener('ventes-updated', onUpdate);
    };
  }, []);

  // Liste des magasins réactive : un magasin ajouté apparaît automatiquement.
  const [magasins, setMagasins] = useState<Magasin[]>(() => getMagasins());
  useEffect(() => {
    const refresh = () => setMagasins(getMagasins());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    const interval = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(interval);
    };
  }, []);

  // Recap calculé pour chaque magasin (mémoïsé sur les données pertinentes).
  const recapsParMagasin = useMemo(() => {
    return magasins.map(m => ({
      magasin: m,
      recap: calcRecapMagasin(
        m.id,
        semaine,
        recaps.filter(r => r.magasinId === m.id && r.semaine === semaine),
        mouvementsCaisse,
        ventesAll === null ? undefined : ventesAll,
      ),
    }));
  }, [magasins, semaine, recaps, mouvementsCaisse, ventesAll]);

  const handleSet = (magasinId: string) => (jour: Jour, champ: 'recettes' | 'depenses', valeur: number) => {
    const id = `${magasinId}_${semaine}_${jour}`;
    const existante = recaps.find(r => r.id === id);
    if (existante) {
      const maj = addUpdateAudit({ ...existante, [champ]: valeur });
      setRecaps(recaps.map(r => r.id === id ? maj : r));
    } else {
      const recettesAuto = recettesVentesParJour(magasinId, semaine);
      const nouvelle = addCreateAudit({
        id, magasinId, semaine, jour,
        recettes: champ === 'recettes' ? valeur : (recettesAuto[jour] || 0),
        depenses: champ === 'depenses' ? valeur : 0,
      } as RecapEntry);
      setRecaps([nouvelle, ...recaps]);
    }
  };

  const libelleSemaine = `Semaine du ${new Date(semaine + 'T00:00:00').toLocaleDateString('fr-FR')} au ${new Date(dateDuJour(semaine, 6) + 'T00:00:00').toLocaleDateString('fr-FR')}`;

  const handleImprimer = () => imprimerPageCourante();

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    recapsParMagasin.forEach(({ magasin, recap }) => {
      const aoa: (string | number)[][] = [
        [`OFFICINE ${magasin.label.replace(`${TENANT.nom} `, '')}`, '', '', ''],
        ['JOURS', 'RECETTES', 'DEPENSES', 'R-D'],
        ...recap.lignes.map(l => [l.jour, l.recettes, l.depenses, l.rd]),
        ['TOTAL', recap.totalR, recap.totalD, recap.totalR - recap.totalD],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const nom = magasin.label.replace(`${TENANT.nom} `, '').slice(0, 28) || magasin.id;
      XLSX.utils.book_append_sheet(wb, ws, nom);
    });
    XLSX.writeFile(wb, `Recap_Hebdomadaire_${semaine}.xlsx`);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    // Charge le correctif global d'affichage des montants (espaces insécables).
    await import('../../../utils/documentHeader');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(13);
    doc.text('Récapitulatif Hebdomadaire — Recettes & Dépenses', 14, 15);
    doc.setFontSize(9);
    doc.text(libelleSemaine, 14, 21);

    let startY = 27;
    recapsParMagasin.forEach(({ magasin, recap }) => {
      autoTable(doc, {
        startY,
        head: [[`OFFICINE ${magasin.label.replace(`${TENANT.nom} `, '')}`, 'RECETTES', 'DEPENSES', 'R-D']],
        body: [
          ...recap.lignes.map(l => [l.jour, fmt(l.recettes), fmt(l.depenses), fmt(l.rd)]),
          ['TOTAL', fmt(recap.totalR), fmt(recap.totalD), fmt(recap.totalR - recap.totalD)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        styles: { halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });
      // Position de départ du prochain tableau (juste après le précédent).
      startY = (doc as any).lastAutoTable.finalY + 6;
      if (startY > 260) { doc.addPage(); startY = 15; }
    });
    const pdfBlob = doc.output('blob');
    await afficherPdfBlob(pdfBlob, { titre: `Récapitulatif hebdomadaire — ${semaine}`, nomFichier: `Recap_Hebdomadaire_${semaine}.pdf` });
  };

  return (
    <div className="flex flex-col gap-4 p-5 recap-print-root" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      <style>{`
        @media print {
          .recap-no-print { display: none !important; }
          .recap-print-root { background: white !important; padding: 0 !important; }
          .recap-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }} className="bg-white rounded-lg shadow-sm px-5 py-3 recap-no-print">
        <span className="text-sm font-semibold text-gray-700" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>
          Récapitulatif Hebdomadaire — Recettes & Dépenses par Magasin
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSemaine(s => decalerSemaine(s, -1))} className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50">◀ Précédente</button>
          <input
            type="date"
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={semaine}
            onChange={e => setSemaine(lundiDeLaSemaine(new Date(e.target.value + 'T00:00:00')))}
          />
          <button onClick={() => setSemaine(s => decalerSemaine(s, 1))} className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50">Suivante ▶</button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button onClick={handleImprimer} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#475569' }}>
            <Printer size={15} /> Imprimer
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#dc2626' }}>
            <FileDown size={15} /> PDF
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#16a34a' }}>
            <FileSpreadsheet size={15} /> Excel
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500 px-1 recap-no-print">
        {editable
          ? 'Les recettes sont calculées hors prise en charge assurance. Les dépenses proviennent automatiquement des sorties enregistrées dans les mouvements de caisse.'
          : 'Lecture seule — seuls les directeurs, comptables et administrateurs peuvent modifier les données.'}
        {' · '}{libelleSemaine}
      </div>

      <div className="hidden print:block text-center font-bold text-base mb-2">{libelleSemaine}</div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 recap-grid">
        {recapsParMagasin.map(({ magasin, recap }) => (
          <TableauMagasin
            key={magasin.id}
            magasinLabel={magasin.label}
            recap={recap}
            onSet={handleSet(magasin.id)}
            editable={editable}
          />
        ))}
      </div>


      {/* Détail des mouvements sous les tableaux récapitulatifs. */}
      <div className="flex flex-col gap-4">
        <div className="text-base font-bold text-gray-800 border-b border-gray-300 pb-2">
          MOUVEMENTS ENTRÉES / SORTIES — SEMAINE DU {new Date(semaine + 'T00:00:00').toLocaleDateString('fr-FR')}
        </div>
        <TableauMouvementsSemaine
          titre="MOUVEMENTS DE L'ADMINISTRATION"
          administration
          mouvements={mouvementsAdministration.filter(m => {
            const d = dateMouvementISO(m.dateMouvement);
            return d >= semaine && d <= dateDuJour(semaine, 6);
          })}
        />
        {recapsParMagasin.map(({ magasin }) => (
          <TableauMouvementsSemaine
            key={`mouvements-${magasin.id}`}
            titre={`MOUVEMENTS DE L'OFFICINE ${magasin.label.replace(`${TENANT.nom} `, '')}`}
            mouvements={mouvementsCaisse.filter(m => {
              const d = dateMouvementISO(m.date);
              return String(m.magasinId || '').toUpperCase() === String(magasin.id).toUpperCase() && d >= semaine && d <= dateDuJour(semaine, 6);
            })}
          />
        ))}
      </div>
    </div>
  );
}
