import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, X, Trash2, Pencil, Save, Download, Printer } from 'lucide-react';
import { getMagasins } from '../constants/magasins';
import { useLiveData } from '../hooks/useLiveData';
import { pdfHeader } from '../utils/documentHeader';
import { AtelierMontageTab } from './AtelierMontageTab';
import type { SubTab } from './AtelierMontageTab';
import { TENANT } from '../config/tenant';

import { afficherPdfBlob } from '../utils/inAppViewer';
type TabType = 'bon-verre' | 'fournisseur' | 'montage';

interface BonCommande {
  id: string;
  numFacture: string;
  numRef: string;
  numBC: string;
  numBL: string;
  fournisseur: string;
  officine: string;
  magasin: string;
  client?: string;
  totalNet: number;
  acompte: number;
  totalReste: number;
  statut: string;
  date: string;
  dateEdition?: string;
  dateRecuperation?: string;
  dateEntreeAtelier?: string;
  dateRetourMagasin?: string;
  // Suivi de montage (sous-onglet « Montage »)
  monteur?: string;
  statutMontage?: string;
  dateMontage?: string;
}

const LS_KEY = 'leclaire_bons_commande_verres';
const allMagasins = getMagasins();
const OFFICINES = allMagasins.map(magasin => magasin.label);
const MAGASINS = allMagasins.map(magasin => magasin.label.replace(`${TENANT.nom} `, ''));
const ANNEES = ['2024', '2025', '2026'];
const ITEMS_PER_PAGE = 20;

const calculateDaysDiff = (date1Str?: string, date2Str?: string): number => {
  if (!date1Str || !date2Str) return 0;
  try {
    const date1 = new Date(date1Str);
    const date2 = new Date(date2Str);
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR');
  } catch {
    return dateStr;
  }
};

export function AtelierPage() {
  const [activeTab, setActiveTab] = useState<TabType>('bon-verre');
  const [montageSubTab, setMontageSubTab] = useState<SubTab>('dashboard');
  const [yearFilter, setYearFilter] = useState('2026');
  const [officineFilter, setOfficineFilter] = useState('');
  const [officine, setOfficine] = useState('');
  const [magasin, setMagasin] = useState('');
  const [infoBon, setInfoBon] = useState('');
  const [date, setDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [allBons, setAllBons] = useLiveData<BonCommande>(LS_KEY, []);
  const [filteredBons, setFilteredBons] = useState<BonCommande[]>([]);
  // Sélection (suppression groupée) + brouillons d'édition en ligne (date de
  // récupération / N° bon de livraison saisis directement dans le tableau).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, { dateRecuperation?: string; numBL?: string }>>({});

  useEffect(() => {
    setFilteredBons(allBons);
  }, [allBons]);

  // Filtrer les bons selon les critères
  const applyFilters = () => {
    let filtered = [...allBons];

    if (yearFilter) {
      filtered = filtered.filter(b => b.date && b.date.startsWith(yearFilter));
    }

    if (officineFilter) {
      filtered = filtered.filter(b => b.officine === officineFilter);
    }

    if (officine) {
      filtered = filtered.filter(b => b.officine === officine);
    }

    if (magasin) {
      filtered = filtered.filter(b => b.magasin === magasin);
    }

    if (infoBon) {
      const searchLower = infoBon.toLowerCase();
      filtered = filtered.filter(b =>
        (b.numBC || '').toLowerCase().includes(searchLower) ||
        (b.numRef || '').toLowerCase().includes(searchLower) ||
        (b.fournisseur || '').toLowerCase().includes(searchLower) ||
        (b.client || '').toLowerCase().includes(searchLower)
      );
    }

    if (date) {
      filtered = filtered.filter(b => b.date === date);
    }

    setFilteredBons(filtered);
    setCurrentPage(1);
  };

  // La SALLE DE MONTAGE ne travaille QUE sur les fiches de montage envoyées par
  // les magasins (Commercial → Fiche de montage), jamais sur les bons de
  // commande fournisseur qui transitent par le même stockage. Un bon est
  // recevable s'il porte le marqueur `source: 'fiche-montage'` ou, pour les
  // enregistrements antérieurs à ce marqueur, un bloc `ficheMontage`.
  const montageBons = useMemo(
    () => filteredBons.filter(b => (b as any).source === 'fiche-montage' || !!(b as any).ficheMontage),
    [filteredBons],
  );

  // Statistiques
  const stats = useMemo(() => {
    const bons = yearFilter
      ? allBons.filter(b => b.date && b.date.startsWith(yearFilter))
      : allBons;

    const total = bons.length;
    const processusAcheve = bons.filter(b => b.statut === 'Réglé' || b.statut === 'Achevé').length;

    const today = new Date();
    const fifteenDaysAgo = new Date(today);
    fifteenDaysAgo.setDate(today.getDate() - 15);

    const enAttente15Jours = bons.filter(b => {
      if (b.statut === 'Réglé' || b.statut === 'Achevé') return false;
      try {
        const bonDate = new Date(b.date);
        return bonDate < fifteenDaysAgo;
      } catch {
        return false;
      }
    }).length;

    return { total, processusAcheve, enAttente15Jours };
  }, [allBons, yearFilter]);

  // Calcul des périodes
  const periods = useMemo(() => {
    const bons = yearFilter
      ? allBons.filter(b => b.date && b.date.startsWith(yearFilter))
      : allBons;

    // DATE ÉDITION <> DATE RÉCUPÉRATION
    const editionRecup = bons
      .map(b => calculateDaysDiff(b.dateEdition || b.date, b.dateRecuperation))
      .filter(d => d > 0);

    // DATE ENTRÉE ATELIER <> DATE RETOUR EN MAGASIN
    const entreeRetour = bons
      .map(b => calculateDaysDiff(b.dateEntreeAtelier, b.dateRetourMagasin))
      .filter(d => d > 0);

    // DATE ÉDITION <> DATE RETOUR EN MAGASIN
    const editionRetourMag = bons
      .map(b => calculateDaysDiff(b.dateEdition || b.date, b.dateRetourMagasin))
      .filter(d => d > 0);

    const calcStats = (arr: number[]) => {
      if (arr.length === 0) return { min: 0, avg: 0, max: 0 };
      return {
        min: Math.min(...arr),
        avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
        max: Math.max(...arr),
      };
    };

    return {
      editionRecup: calcStats(editionRecup),
      entreeRetour: calcStats(entreeRetour),
      editionRetourMag: calcStats(editionRetourMag),
    };
  }, [allBons, yearFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredBons.length / ITEMS_PER_PAGE));
  const paginatedBons = filteredBons.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const hasBons = filteredBons.length > 0;

  // ── Édition / suppression des bons ──────────────────────────────────────────
  const updateBon = (id: string, patch: Partial<BonCommande>) => {
    setAllBons(allBons.map(b => (b.id === id ? { ...b, ...patch } : b)));
  };
  const deleteBon = (id: string) => {
    if (!window.confirm('Supprimer ce bon de commande ?')) return;
    setAllBons(allBons.filter(b => b.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };
  const deleteSelected = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Supprimer ${selected.size} bon(s) sélectionné(s) ?`)) return;
    setAllBons(allBons.filter(b => !selected.has(b.id)));
    setSelected(new Set());
  };
  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const pageIds = paginatedBons.map(b => b.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const toggleSelectAll = () => {
    setSelected(prev => {
      const n = new Set(prev);
      if (allPageSelected) pageIds.forEach(id => n.delete(id));
      else pageIds.forEach(id => n.add(id));
      return n;
    });
  };
  const draftOf = (b: BonCommande) => ({
    dateRecuperation: drafts[b.id]?.dateRecuperation ?? b.dateRecuperation ?? '',
    numBL: drafts[b.id]?.numBL ?? b.numBL ?? '',
  });
  const setDraft = (id: string, patch: { dateRecuperation?: string; numBL?: string }) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };
  const saveDraft = (b: BonCommande) => {
    updateBon(b.id, draftOf(b));
    setDrafts(prev => { const n = { ...prev }; delete n[b.id]; return n; });
  };

  // Génère un PDF simple pour un bon de commande de verre.
  const genererPDF = async (b: BonCommande) => {
    // Import paresseux : jsPDF chargé uniquement au moment de générer le PDF.
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    let y = pdfHeader(doc, undefined, { date: b.date });
    doc.setFontSize(13);
    doc.text(`BON DE COMMANDE DE VERRE — ${b.numBC || b.numRef || ''}`, 14, y);
    y += 10;
    doc.setFontSize(10);
    const lignes = [
      ['N° Facture', b.numFacture || '-'],
      ['N° Référence', b.numRef || '-'],
      ['N° Bon de Commande', b.numBC || '-'],
      ['N° Bon de Livraison', b.numBL || '-'],
      ['Fournisseur', b.fournisseur || '-'],
      ['Client', b.client || '-'],
      ['Officine', b.officine || '-'],
      ['Total Net', `${(b.totalNet || 0).toLocaleString('fr-FR')} FCFA`],
      ['Statut', b.statut || '-'],
      ['Date édition', formatDate(b.dateEdition || b.date)],
      ['Date récupération', formatDate(b.dateRecuperation)],
    ];
    lignes.forEach(([k, v]) => { doc.text(`${k} : ${v}`, 14, y); y += 7; });
    const pdfBlob = doc.output('blob');
    await afficherPdfBlob(pdfBlob, { titre: `Bon de commande ${b.numBC || b.numRef || b.id}`, nomFichier: `bon-commande-${b.numBC || b.numRef || b.id}.pdf` });
  };

  const th: React.CSSProperties = { padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#2c3e50', fontSize: '13px', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 8px', fontSize: '13px', color: '#2c3e50', verticalAlign: 'top' };
  const cellInput: React.CSSProperties = { width: '100%', padding: '5px 6px', border: '1px solid #b7c6d3', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff' };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {/* Header Section */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {/* Left Sidebar - Tabs */}
        <div style={{ width: '300px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '12px', backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
              <select
                value={officineFilter}
                onChange={(e) => {
                  setOfficineFilter(e.target.value);
                  applyFilters();
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
              >
                <option value="">Toutes les O...</option>
                {OFFICINES.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
              >
                {ANNEES.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
              <button
                onClick={() => setActiveTab('bon-verre')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  backgroundColor: activeTab === 'bon-verre' ? '#fff' : '#f9fafb',
                  borderBottom: activeTab === 'bon-verre' ? '2px solid #2563eb' : 'none',
                  fontWeight: activeTab === 'bon-verre' ? '600' : '400',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Bon Verre
              </button>
              <button
                onClick={() => setActiveTab('fournisseur')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  backgroundColor: activeTab === 'fournisseur' ? '#fff' : '#f9fafb',
                  borderBottom: activeTab === 'fournisseur' ? '2px solid #2563eb' : 'none',
                  fontWeight: activeTab === 'fournisseur' ? '600' : '400',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Fournisseur
              </button>
              <button
                onClick={() => setActiveTab('montage')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: 'none',
                  backgroundColor: activeTab === 'montage' ? '#fff' : '#f9fafb',
                  borderBottom: activeTab === 'montage' ? '2px solid #2563eb' : 'none',
                  fontWeight: activeTab === 'montage' ? '600' : '400',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Montage
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Total Commandes */}
              <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{ fontSize: '48px' }}>👓</span>
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {stats.total}
                  </span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '8px' }}>Total</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>Commandes</div>
              </div>

              {/* Commandes Processus Achevé */}
              <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{ fontSize: '48px' }}>👓</span>
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    backgroundColor: '#16a34a',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {stats.processusAcheve}
                  </span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '8px' }}>Commandes</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>Processus</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>Achevé</div>
              </div>

              {/* En Attente */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{ fontSize: '48px' }}>👓</span>
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {stats.enAttente15Jours}
                  </span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '8px' }}>En Attente(s) {'>'}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>15 Jour</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content - Statistics (masqué en mode Montage) */}
        {activeTab !== 'montage' && (
        <div style={{ flex: 1 }}>
          {/* DATE ÉDITION < > DATE RÉCUPÉRATION */}
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center' }}>
              DATE ÉDITION {'<'} {'>'} DATE RÉCUPÉRATION
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#86efac', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Minimum {periods.editionRecup.min} jour{periods.editionRecup.min > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#fb923c', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Moyenne {periods.editionRecup.avg} jour{periods.editionRecup.avg > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#f87171', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Maximum {periods.editionRecup.max} jour{periods.editionRecup.max > 1 ? 's' : ''}</div>
                </div>
              </div>
            </div>
          </div>

          {/* DATE ENTRÉE ATELIER < > DATE RETOUR EN MAGASIN */}
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center' }}>
              DATE ENTRÉE ATELIER {'<'} {'>'} DATE RETOUR EN MAGASIN
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#86efac', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Minimum {periods.entreeRetour.min} jour{periods.entreeRetour.min > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#fb923c', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Moyenne {periods.entreeRetour.avg} jour{periods.entreeRetour.avg > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#f87171', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Maximum {periods.entreeRetour.max} jour{periods.entreeRetour.max > 1 ? 's' : ''}</div>
                </div>
              </div>
            </div>
          </div>

          {/* DATE ÉDITION < > DATE RETOUR EN MAGASIN */}
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center' }}>
              DATE ÉDITION {'<'} {'>'} DATE RETOUR EN MAGASIN
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#86efac', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Minimum {periods.editionRetourMag.min} jour{periods.editionRetourMag.min > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#fb923c', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Moyenne {periods.editionRetourMag.avg} jour{periods.editionRetourMag.avg > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', backgroundColor: '#f87171', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Période Maximum {periods.editionRetourMag.max} jour{periods.editionRetourMag.max > 1 ? 's' : ''}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Sous-onglet MONTAGE — barre de sous-onglets + KPI à droite de la barre latérale */}
        {activeTab === 'montage' && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <AtelierMontageTab
              bons={montageBons}
              onUpdate={updateBon}
              subTab={montageSubTab}
              setSubTab={setMontageSubTab}
              region="beside"
            />
          </div>
        )}
      </div>

      {/* Sous-onglet MONTAGE — graphiques + tableaux en pleine largeur sous la barre latérale */}
      {activeTab === 'montage' && (
        <div style={{ marginTop: '16px' }}>
          <AtelierMontageTab
            bons={montageBons}
            onUpdate={updateBon}
            subTab={montageSubTab}
            setSubTab={setMontageSubTab}
            region="full"
          />
        </div>
      )}

      {/* Table Section (masquée en mode Montage) */}
      {activeTab !== 'montage' && (
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
          Bons de Commande Verre ({filteredBons.length})
        </h2>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Officine...</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff' }}>
              <select
                value={officine}
                onChange={(e) => setOfficine(e.target.value)}
                style={{ flex: 1, padding: '8px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent' }}
              >
                <option value="">Toutes les ...</option>
                {OFFICINES.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {officine && (
                <button
                  onClick={() => setOfficine('')}
                  style={{ padding: '0 8px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Magasin...</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff' }}>
              <select
                value={magasin}
                onChange={(e) => setMagasin(e.target.value)}
                style={{ flex: 1, padding: '8px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent' }}
              >
                <option value="">-- Choisir Magasin --</option>
                {MAGASINS.map(magasinName => (
                  <option key={magasinName} value={magasinName}>{magasinName}</option>
                ))}
              </select>
              {magasin && (
                <button
                  onClick={() => setMagasin('')}
                  style={{ padding: '0 8px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Infos Bon de Commande...</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff' }}>
              <input
                type="text"
                value={infoBon}
                onChange={(e) => setInfoBon(e.target.value)}
                placeholder="Infos Bon de Commande..."
                style={{ flex: 1, padding: '8px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent' }}
              />
              {infoBon && (
                <button
                  onClick={() => setInfoBon('')}
                  style={{ padding: '0 8px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Date</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#fff' }}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ flex: 1, padding: '8px', border: 'none', outline: 'none', fontSize: '14px', backgroundColor: 'transparent' }}
              />
              {date && (
                <button
                  onClick={() => setDate('')}
                  style={{ padding: '0 8px', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <button
            onClick={applyFilters}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Search size={16} />
          </button>
        </div>

        {/* Table — disposition conforme à la maquette */}
        <div className="hidden md:block" style={{ overflowX: 'auto', border: '1px solid #b7c6d3', borderRadius: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1300px' }}>
            <thead>
              <tr style={{ backgroundColor: '#8ba9bd' }}>
                <th style={{ ...th, width: '90px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                    <button
                      onClick={deleteSelected}
                      title="Supprimer la sélection"
                      style={{ backgroundColor: '#e74c3c', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', color: '#fff' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </th>
                <th style={th}>N° Facture</th>
                <th style={th}>N° Ref</th>
                <th style={th}>N° BC</th>
                <th style={th}>N° BL</th>
                <th style={th}>Fournisseur</th>
                <th style={th}>Remise</th>
                <th style={th}>Total</th>
                <th style={th}>Taxe</th>
                <th style={th}>Total Net</th>
                <th style={th}>Statut</th>
                <th style={th}>Édition</th>
                <th style={{ ...th, minWidth: '200px' }}>Date Récupération</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {paginatedBons.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    Aucun bon de commande verre
                  </td>
                </tr>
              ) : (
                paginatedBons.map((bon, idx) => {
                  const b = bon as any;
                  const d = draftOf(bon);
                  const remise = Number(b.remise ?? b.verreDetails?.valeurRemise ?? 0);
                  const total = Number(b.total ?? b.verreDetails?.total ?? 0);
                  const taxe = Number(b.taxe ?? b.verreDetails?.taxe ?? 0);
                  const rowNum = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                  return (
                    <tr key={bon.id} style={{ backgroundColor: '#dbe6ee', borderBottom: '2px solid #fff' }}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="checkbox" checked={selected.has(bon.id)} onChange={() => toggleSelect(bon.id)} />
                          <span style={{ backgroundColor: '#c3d3de', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>{rowNum}</span>
                        </div>
                      </td>
                      <td style={td}>{bon.numFacture || '-'}</td>
                      <td style={td}>{bon.numRef || '-'}</td>
                      <td style={td}>{bon.numBC || '-'}</td>
                      <td style={td}>{bon.numBL || '-'}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{bon.fournisseur || '-'}</div>
                        {bon.client && (
                          <div style={{ marginTop: '10px', backgroundColor: '#1a5a72', color: '#fff', padding: '4px 8px', borderRadius: '3px', display: 'inline-block', fontSize: '12px' }}>
                            | Client: {bon.client} |
                          </div>
                        )}
                      </td>
                      <td style={td}>{remise.toFixed(2)}</td>
                      <td style={td}>{total.toFixed(2)}</td>
                      <td style={td}>{taxe.toFixed(2)}<sup style={{ color: '#e67e22' }}>{taxe.toFixed(2)}%</sup></td>
                      <td style={td}>{(bon.totalNet || 0).toFixed(2)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{(bon.statut || '').toUpperCase()}</td>
                      <td style={td}>
                        <div>{formatDate(bon.dateEdition || bon.date)}</div>
                        {b.createdBy && <div style={{ color: '#5a6b7b' }}>{b.createdBy}</div>}
                      </td>
                      <td style={td}>
                        <input
                          type="date"
                          value={d.dateRecuperation}
                          onChange={e => setDraft(bon.id, { dateRecuperation: e.target.value })}
                          style={{ ...cellInput, marginBottom: '6px' }}
                        />
                        <input
                          type="text"
                          placeholder="N° Bon de Livraison"
                          value={d.numBL}
                          onChange={e => setDraft(bon.id, { numBL: e.target.value })}
                          style={{ ...cellInput, marginBottom: '6px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => genererPDF(bon)}
                            title="Télécharger"
                            style={{ backgroundColor: '#f5cba7', border: 'none', borderRadius: '4px', padding: '6px 14px', cursor: 'pointer' }}
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => saveDraft(bon)}
                            title="Enregistrer"
                            style={{ backgroundColor: '#5b9bd5', border: 'none', borderRadius: '4px', padding: '6px 14px', cursor: 'pointer', color: '#fff' }}
                          >
                            <Save size={16} />
                          </button>
                        </div>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
                          <button
                            onClick={() => genererPDF(bon)}
                            style={{ backgroundColor: '#2c6e8f', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', fontWeight: 600 }}
                          >
                            <Printer size={14} /> PDF
                          </button>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => { const s = window.prompt('Statut du bon :', bon.statut || ''); if (s !== null) updateBon(bon.id, { statut: s }); }}
                              title="Modifier le statut"
                              style={{ flex: 1, backgroundColor: '#f1c40f', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer' }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteBon(bon.id)}
                              title="Supprimer"
                              style={{ flex: 1, backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {paginatedBons.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Aucun bon de commande verre</div>
          ) : paginatedBons.map((bon, idx) => {
            const b = bon as any;
            const d = draftOf(bon);
            const rowNum = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
            return (
              <div key={bon.id} style={{ backgroundColor: '#dbe6ee', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #c3d3de' }}>
                {/* Card header: number + status badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={selected.has(bon.id)} onChange={() => toggleSelect(bon.id)} />
                    <span style={{ backgroundColor: '#c3d3de', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '12px' }}>#{rowNum}</span>
                    <span style={{ fontWeight: 700, fontSize: 'clamp(13px, 3.5vw, 15px)' }}>{bon.numBC || bon.numRef || '-'}</span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '11px', padding: '3px 8px', borderRadius: '12px', backgroundColor: (bon.statut === 'Réglé' || bon.statut === 'Achevé') ? '#dcfce7' : '#fee2e2', color: (bon.statut === 'Réglé' || bon.statut === 'Achevé') ? '#16a34a' : '#dc2626' }}>
                    {(bon.statut || '-').toUpperCase()}
                  </span>
                </div>
                {/* Fournisseur / Client */}
                <div style={{ fontSize: '13px', color: '#2c3e50', marginBottom: '4px' }}><strong>Fournisseur:</strong> {bon.fournisseur || '-'}</div>
                {bon.client && (
                  <div style={{ fontSize: '12px', backgroundColor: '#1a5a72', color: '#fff', padding: '3px 8px', borderRadius: '3px', display: 'inline-block', marginBottom: '6px' }}>Client: {bon.client}</div>
                )}
                {/* Meta row */}
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#5a6b7b', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <span>N° BC: <strong>{bon.numBC || '-'}</strong></span>
                  <span>Total Net: <strong>{(bon.totalNet || 0).toFixed(2)}</strong></span>
                  <span>Date: {formatDate(bon.dateEdition || bon.date)}</span>
                </div>
                {/* Inline editable fields */}
                <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input type="date" value={d.dateRecuperation} onChange={e => setDraft(bon.id, { dateRecuperation: e.target.value })} style={{ width: '100%', padding: '6px', border: '1px solid #b7c6d3', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff', boxSizing: 'border-box' }} />
                  <input type="text" placeholder="N° Bon de Livraison" value={d.numBL} onChange={e => setDraft(bon.id, { numBL: e.target.value })} style={{ width: '100%', padding: '6px', border: '1px solid #b7c6d3', borderRadius: '4px', fontSize: '12px', backgroundColor: '#fff', boxSizing: 'border-box' }} />
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => genererPDF(bon)} style={{ backgroundColor: '#2c6e8f', color: '#fff', border: 'none', borderRadius: '4px', padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600 }}>
                    <Printer size={13} /> PDF
                  </button>
                  <button onClick={() => saveDraft(bon)} style={{ backgroundColor: '#5b9bd5', color: '#fff', border: 'none', borderRadius: '4px', padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                    <Save size={13} /> Enreg.
                  </button>
                  <button onClick={() => { const s = window.prompt('Statut du bon :', bon.statut || ''); if (s !== null) updateBon(bon.id, { statut: s }); }} style={{ backgroundColor: '#f1c40f', border: 'none', borderRadius: '4px', padding: '7px 12px', cursor: 'pointer' }} title="Modifier le statut">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => deleteBon(bon.id)} style={{ backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', padding: '7px 12px', cursor: 'pointer' }} title="Supprimer">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {hasBons && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1 || !hasBons}
              style={{
                padding: '4px 8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1,
              }}
            >
              {'<<'}
            </button>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || !hasBons}
              style={{
                padding: '4px 8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={14} />
            </button>
            {[...Array(Math.min(3, totalPages))].map((_, i) => {
              let page = i + 1;
              if (currentPage > 2 && totalPages > 3) {
                page = currentPage - 1 + i;
                if (page > totalPages) return null;
              }
              return (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  style={{
                    padding: '4px 12px',
                    border: `1px solid ${currentPage === page ? '#2563eb' : '#d1d5db'}`,
                    borderRadius: '4px',
                    backgroundColor: currentPage === page ? '#2563eb' : '#fff',
                    color: currentPage === page ? '#fff' : '#000',
                    fontWeight: currentPage === page ? '600' : '400',
                    cursor: 'pointer',
                  }}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || !hasBons}
              style={{
                padding: '4px 8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages || !hasBons}
              style={{
                padding: '4px 8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}
            >
              {'>>'}
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
