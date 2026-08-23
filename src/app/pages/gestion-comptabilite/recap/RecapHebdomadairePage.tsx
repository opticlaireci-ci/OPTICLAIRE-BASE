import { logger } from '../../../utils/logger';
import { useEffect, useMemo, useState } from 'react';
import { Printer, FileDown, FileSpreadsheet } from 'lucide-react';
import { getMagasins, type Magasin } from '../../../constants/magasins';
import { useLiveData } from '../../../hooks/useLiveData';
import { useAuth } from '../../../contexts/AuthContext';
import { addCreateAudit, addUpdateAudit, AuditInfo } from '../../../utils/auditUtils';
import { TENANT } from '../../../config/tenant';

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
function recettesVentesParJour(magasinId: string, semaine: string): Record<Jour, number> {
  const result = Object.fromEntries(JOURS.map(j => [j, 0])) as Record<Jour, number>;
  try {
    // Le cache des ventes est écrit avec une clé en MAJUSCULES
    // (`leclaire_ventes_${magasinId.toUpperCase()}`, cf. ventesCacheKey).
    // On doit donc lire avec la même casse, sinon aucune vente n'est trouvée.
    const ventes = JSON.parse(localStorage.getItem(`leclaire_ventes_${magasinId.toUpperCase()}`) || '[]');
    const jourDates = JOURS.map((_, i) => dateDuJour(semaine, i));
    ventes.forEach((v: any) => {
      // Seules les VENTES réelles comptent comme recettes (pas les devis).
      if ((v.type || 'vente') !== 'vente') return;
      const brut = v.date || v.dateVente || v.created_at || v.createdAt;
      if (!brut) return;
      const jourVente = new Date(brut).toISOString().slice(0, 10);
      const idx = jourDates.indexOf(jourVente);
      if (idx === -1) return;
      // Les ventes sont stockées avec `total_net` / `total_brut` (repli sur les
      // anciens noms de champs éventuels pour compatibilité).
      const montant = v.total_net ?? v.total_brut ?? v.totalNet ?? v.totalAPayer ?? v.montantTotal ?? v.total ?? 0;
      result[JOURS[idx]] += Number(montant) || 0;
    });
  } catch (error) {
    logger.error(`Erreur calcul recettes ventes ${magasinId}:`, error);
  }
  return result;
}

interface LigneRecap { jour: Jour; recettes: number; depenses: number; rd: number; }
interface RecapMagasin { lignes: LigneRecap[]; totalR: number; totalD: number; }

/** Construit les lignes recettes/dépenses/R-D + totaux d'un magasin pour une semaine. */
function calcRecapMagasin(magasinId: string, semaine: string, entries: RecapEntry[]): RecapMagasin {
  const recettesAuto = recettesVentesParJour(magasinId, semaine);
  let totalR = 0, totalD = 0;
  const lignes = JOURS.map(jour => {
    const e = entries.find(x => x.jour === jour);
    // La saisie manuelle prime ; sinon on affiche les ventes calculées.
    const recettes = e && e.recettes !== undefined && e.recettes !== null ? e.recettes : (recettesAuto[jour] || 0);
    const depenses = e?.depenses || 0;
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
  return (
    <div className="border-2 border-gray-800 rounded overflow-hidden bg-white">
      <div className="text-center font-bold py-1.5 border-b-2 border-gray-800 bg-white text-sm">
        OFFICINE {magasinLabel.replace(`${TENANT.nom} `, '')}
      </div>
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
  );
}

export function RecapHebdomadairePage() {
  const { user } = useAuth();
  const editable = ROLES_ECRITURE.includes(user?.role || '');
  const [recaps, setRecaps] = useLiveData<RecapEntry>('leclaire_recap_hebdo', []);
  const [semaine, setSemaine] = useState<string>(() => lundiDeLaSemaine(new Date()));

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
      recap: calcRecapMagasin(m.id, semaine, recaps.filter(r => r.magasinId === m.id && r.semaine === semaine)),
    }));
  }, [magasins, semaine, recaps]);

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

  const libelleSemaine = `Semaine du ${new Date(semaine + 'T00:00:00').toLocaleDateString('fr-FR')} au ${new Date(decalerSemaine(semaine, 0) + 'T00:00:00').toLocaleDateString('fr-FR')}`;

  const handleImprimer = () => window.print();

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
    doc.save(`Recap_Hebdomadaire_${semaine}.pdf`);
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

      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-5 py-3 flex-wrap gap-3 recap-no-print">
        <span className="text-sm font-semibold text-gray-700">
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
          ? 'Les recettes sont pré-remplies depuis les ventes de chaque magasin — vous pouvez les modifier ainsi que les dépenses.'
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
    </div>
  );
}
