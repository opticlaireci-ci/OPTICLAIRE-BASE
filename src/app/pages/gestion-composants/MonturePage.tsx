import { logger } from '../../utils/logger';
import React, { useState, useCallback, useEffect } from 'react';
import { useLiveData } from '../../hooks/useLiveData';
import { genCodeCourt } from '../../utils/autoNumbers';
import { getMagasins } from '../../constants/magasins';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Dialog, DialogContent, DialogTitle,
  IconButton, Typography, Checkbox, Autocomplete, Chip, Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ClearIcon from '@mui/icons-material/Clear';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { AuditInfo, addCreateAudit, addUpdateAudit, logDeletion, showAuditNotification, formatDate, getCurrentUser } from '../../utils/auditUtils';
import { syncCatalogueToMagasins, syncCataloguesToMagasinsBulk, remplacerCataloguesMagasins, removeCatalogueFromMagasins } from '../../utils/syncCataloguesToMagasins';
import { autoRegisterMontureComponents } from '../../utils/autoRegisterComponents';
import { replaceCatalogue, supprimerCatalogueItem } from '../../services/catalogueService';
import { setItemWithoutSync } from '../../services/autoSync';
import { useAuth } from '../../contexts/AuthContext';
import { canAdd } from '../../utils/actionRights';
import {
  MODELE_MONTURES, genererCatalogueCsv, parserCatalogueCsv,
  telechargerCsv, messageImport,
} from '../../utils/catalogueCsv';
import { TENANT } from '../../config/tenant';
import { MONTURES_CATALOGUE_ES } from '../../data/monturesCatalogueES';

interface Monture extends AuditInfo {
  id: string;
  codeBarre: string;
  marque: string;
  categorie: string;
  famille: string;
  reference: string;
  couleur: string;
  taille: string;
  prix: number;
  stock: number;
  marge: number;
  seuil: number;
  fournisseur?: string;
  garantie?: string;
  gestionStocks?: 'actif' | 'inactif';
}

const MONTURES_KEY = 'leclaire_global_montures';

// Valeurs uniformes chez Leclaire Optic : toute monture est garantie 2 ans et
// son seuil de réapprovisionnement est 1. Elles servent de valeur par défaut à
// la saisie, à l'import et au nettoyage, et restent modifiables au cas par cas.
const GARANTIE_DEFAUT = '2 ans';
const SEUIL_DEFAUT = 1;

/**
 * Normalisation d'un libellé pour la comparaison : casse, accents et espaces
 * multiples ne doivent pas empêcher de reconnaître « Mix » et « MIX ».
 * Les tirets sont CONSERVÉS : le catalogue LeClaire contient à la fois
 * « C-117 » et « C117 », qui sont deux références différentes.
 */
const normLibelle = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Clé de doublon : LA RÉFÉRENCE, portée par sa marque.
 *
 * Couleur, taille, famille et prix sont volontairement hors de la clé : ils
 * sont saisis de façon trop irrégulière (« Mix » / « MIX », « 42-65 » /
 * « 42 - 65 », « Titane » / « Monture Haute de gamme ») pour distinguer quoi
 * que ce soit de fiable, et les y inclure laissait passer des doublons
 * évidents. Une référence identifie un modèle : elle ne doit apparaître
 * qu'une fois par marque.
 *
 * La marque reste dans la clé car deux marques peuvent porter la même
 * référence sans que ce soit un doublon : l'état de stock contient
 * « LW40163F » chez Loewe (217 000) ET chez Prada (197 000).
 */
const cleMonture = (m: any) =>
  `${normLibelle(m?.marque)}|${normLibelle(m?.reference)}`;

/**
 * Dédoublonnage du catalogue montures : une seule ligne par marque +
 * référence. La PREMIÈRE occurrence est celle qui est gardée — donc la saisie
 * la plus ancienne, avec son historique d'audit.
 */
function dedoublonnerMontures<T>(
  items: T[],
  connus: T[] = [],
): { uniques: T[]; doublons: number } {
  const vues = new Set(connus.map(cleMonture));
  const uniques: T[] = [];
  let doublons = 0;

  for (const item of items) {
    const k = cleMonture(item);
    if (vues.has(k)) { doublons++; continue; }
    vues.add(k);
    uniques.push(item);
  }

  return { uniques, doublons };
}

function formatAuditDT(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`,
    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`,
  };
}

// ── Hook : ventes réelles par monture ────────────────────────────────────────
function useVentesMonture(reference: string, codeBarre: string, marque: string) {
  const compute = useCallback(() => {
    const magasins = getMagasins();
    const matchers = [
      reference?.toLowerCase().trim(),
      codeBarre?.toLowerCase().trim(),
      `${marque} - ${reference}`.toLowerCase().trim(),
      `${marque} ${reference}`.toLowerCase().trim(),
    ].filter(Boolean);

    let qte = 0;
    let total = 0;
    for (const mag of magasins) {
      const ventes: any[] = [];
      try { ventes.push(...JSON.parse(localStorage.getItem(`leclaire_ventes_${mag.id}`) || '[]')); } catch {}
      try { ventes.push(...JSON.parse(localStorage.getItem(`leclaire_vente_flash_${mag.id}`) || '[]')); } catch {}
      for (const v of ventes) {
        for (const art of (v.articles || [])) {
          const d = (art.designation || '').toLowerCase().trim();
          if (matchers.some(m => m && d === m)) {
            qte += parseFloat(art.quantite) || 1;
            total += parseFloat(art.total) || 0;
          }
        }
      }
    }
    return { qte, total };
  }, [reference, codeBarre, marque]);

  const [stats, setStats] = useState(compute);

  useEffect(() => {
    // Debounce : au chargement, l'hydratation Firebase émet une rafale
    // d'événements. Sans regroupement, chaque ligne recalcule des dizaines de
    // fois (lecture localStorage × 7 magasins), ce qui gèle l'UI et fait perdre
    // les clics. On regroupe donc les recalculs en un seul, 250 ms après la
    // dernière notification.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setStats(compute()), 250);
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('leclaire-sync-update', refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('leclaire-sync-update', refresh);
    };
  }, [compute]);

  return stats;
}

// ── Cellule Marge avec données ventes réelles ─────────────────────────────────
function MargeCell({ reference, codeBarre, marque, prix }: {
  reference: string; codeBarre: string; marque: string; prix: number;
}) {
  const { qte, total } = useVentesMonture(reference, codeBarre, marque);
  const rowBase: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '3px 8px', borderBottom: '1px solid #e8e8e8', gap: 6 };
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cout = prix * qte;
  const marge = total - cout;
  const pctMonture = total > 0 ? Math.round((marge / total) * 100) : 0;
  return (
    <Box sx={{ fontSize: '0.67rem', minWidth: 230 }}>
      <div style={rowBase}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f44336', flexShrink: 0, display: 'inline-block' }} />
        <span style={{ flex: 1, fontSize: '0.67rem' }}>Commande</span>
        <span style={{ minWidth: 40, textAlign: 'right', fontSize: '0.67rem' }}>0.00</span>
        <span style={{ fontSize: '0.67rem', color: '#777', padding: '0 4px' }}>Qte 0</span>
        <span style={{ minWidth: 40, textAlign: 'right', fontSize: '0.67rem' }}>0.00</span>
      </div>
      <div style={rowBase}>
        <span style={{ width: 9, height: 9, background: '#4caf50', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, fontSize: 9, color: 'white', fontWeight: 700 }}>+</span>
        <span style={{ flex: 1, fontSize: '0.67rem' }}>Vente</span>
        <span style={{ minWidth: 40, textAlign: 'right', fontSize: '0.67rem', fontWeight: qte > 0 ? 700 : 400, color: qte > 0 ? '#1a237e' : 'inherit' }}>{fmt(total)}</span>
        <span style={{ fontSize: '0.67rem', color: qte > 0 ? '#1976d2' : '#777', padding: '0 4px', fontWeight: qte > 0 ? 700 : 400 }}>Qte {qte}</span>
        <span style={{ minWidth: 40, textAlign: 'right', fontSize: '0.67rem' }}>{fmt(prix)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', borderBottom: '1px solid #e8e8e8' }}>
        <span style={{ fontWeight: 700, fontSize: '0.67rem', color: marge > 0 ? '#2e7d32' : marge < 0 ? '#c62828' : 'inherit' }}>{fmt(marge)}</span>
        <span style={{ fontWeight: 700, fontSize: '0.67rem' }}>{pctMonture}% / Monture</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.67rem', color: marge > 0 ? '#2e7d32' : marge < 0 ? '#c62828' : 'inherit' }}>{fmt(marge)}</span>
        <span style={{ fontWeight: 700, fontSize: '0.67rem' }}>{pctMonture}% / Total</span>
      </div>
    </Box>
  );
}

function useRefList(lsKey: string, field: string): string[] {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    const read = () => {
      try {
        const data = JSON.parse(localStorage.getItem(lsKey) || '[]');
        setItems(data.map((x: any) => x[field]).filter(Boolean).sort());
      } catch { setItems([]); }
    };
    read();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRead = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, 200);
    };
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.key === lsKey) scheduleRead();
    };
    window.addEventListener('leclaire-sync-update', h);
    window.addEventListener('storage', scheduleRead);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener('leclaire-sync-update', h); window.removeEventListener('storage', scheduleRead); };
  }, [lsKey, field]);
  return items;
}

export function MonturePage() {
  const { user } = useAuth();
  const peutAjouter = canAdd(user, 'composants');
  const [montures, setMontures] = useLiveData<Monture>(MONTURES_KEY);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [editingMonture, setEditingMonture] = useState<Monture | null>(null);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);

  const marquesList = useRefList('leclaire_db_marques', 'marque');
  const categoriesList = useRefList('leclaire_db_categories', 'categorie');
  const famillesList = useRefList('leclaire_db_familles', 'famille');
  const couleursList = useRefList('leclaire_db_couleurs', 'couleur');
  const taillesList = useRefList('leclaire_db_tailles', 'taille');
  const [fournisseursList, setFournisseursList] = useState<string[]>([]);

  useEffect(() => {
    const loadFournisseurs = async () => {
      try {
        const { api } = await import('../../services/api');
        const items = await api.getAll<any>('fournisseurs');
        setFournisseursList(items.map((f: any) => f.raisonSociale || f.nom).filter(Boolean).sort());
      } catch {}
    };
    loadFournisseurs();
  }, []);

  const [formData, setFormData] = useState({
    codeBarre: genCodeCourt(),
    fournisseur: '',
    marque: '',
    categorie: '',
    famille: '',
    reference: '',
    couleur: '',
    taille: '',
    prix: '',
    stock: '',
    seuil: String(SEUIL_DEFAUT),
    gestionStocks: 'actif' as 'actif' | 'inactif',
    garantie: GARANTIE_DEFAUT,
    image: null as File | null,
  });

  const handleAddMonture = () => {
    if (!formData.marque) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (editingMonture) {
      // Mode modification
      const updatedMonture = addUpdateAudit({
        ...editingMonture,
        codeBarre: formData.codeBarre,
        marque: formData.marque,
        categorie: formData.categorie,
        famille: formData.famille,
        reference: formData.reference,
        couleur: formData.couleur,
        taille: formData.taille,
        prix: parseFloat(formData.prix) || 0,
        stock: parseFloat(formData.stock) || 0,
        seuil: parseFloat(formData.seuil) || 0,
        fournisseur: formData.fournisseur,
        garantie: formData.garantie,
        gestionStocks: formData.gestionStocks,
      });
      const next = montures.map(m => m.id === editingMonture.id ? updatedMonture : m);
      setMontures(next);

      // Auto-enregistrer les composants (couleur, marque, etc.) sous les boutons CO, MA, etc.
      autoRegisterMontureComponents({
        couleur: formData.couleur,
        marque: formData.marque,
        categorie: formData.categorie,
        famille: formData.famille,
        taille: formData.taille,
      });

      // Synchroniser vers tous les catalogues de magasins
      syncCatalogueToMagasins({ type: 'montures', item: updatedMonture, isUpdate: true });

      showAuditNotification('update', 'Monture');
    } else {
      // Mode création
      const newMonture: Monture = addCreateAudit({
        id: Date.now().toString(),
        codeBarre: formData.codeBarre,
        marque: formData.marque,
        categorie: formData.categorie,
        famille: formData.famille,
        reference: formData.reference,
        couleur: formData.couleur,
        taille: formData.taille,
        prix: parseFloat(formData.prix) || 0,
        stock: parseFloat(formData.stock) || 0,
        marge: 0,
        seuil: parseFloat(formData.seuil) || 0,
        fournisseur: formData.fournisseur,
        garantie: formData.garantie,
        gestionStocks: formData.gestionStocks,
      });

      // Auto-enregistrer les composants (couleur, marque, etc.) sous les boutons CO, MA, etc.
      autoRegisterMontureComponents({
        couleur: formData.couleur,
        marque: formData.marque,
        categorie: formData.categorie,
        famille: formData.famille,
        taille: formData.taille,
      });

      const next = [...montures, newMonture];
      setMontures(next);

      // Synchroniser vers tous les catalogues de magasins
      syncCatalogueToMagasins({ type: 'montures', item: newMonture, isUpdate: false });

      showAuditNotification('create', 'Monture');
    }

    setOpenAddDialog(false);
    setEditingMonture(null);
    resetForm();
  };

  /**
   * Télécharge le fichier ICM.csv DÉJÀ RENSEIGNÉ avec les montures existantes.
   * Sert à deux choses : repartir du catalogue en place pour le compléter dans
   * Excel, et disposer d'une sauvegarde réimportable telle quelle.
   */
  const handleTelechargerICM = () => {
    telechargerCsv(genererCatalogueCsv(montures, MODELE_MONTURES.colonnes), MODELE_MONTURES.nom);
  };

  const handleImportFile = async () => {
    if (!selectedFile) {
      alert('Veuillez sélectionner un fichier');
      return;
    }

    let resultat;
    try {
      resultat = parserCatalogueCsv(await selectedFile.text(), MODELE_MONTURES.colonnes);
    } catch (e) {
      logger.warn('Import ICM: lecture impossible', e);
      alert('❌ Impossible de lire le fichier. Vérifiez qu\'il s\'agit bien d\'un .csv.');
      return;
    }

    if (resultat.lignes.length === 0) {
      alert(
        '❌ Aucune monture trouvée dans le fichier.\n\n'
        + 'Vérifiez que le séparateur est le point-virgule « ; » et que la 1re '
        + 'colonne (Marque) est renseignée.'
      );
      return;
    }

    const ajoutees = fusionnerMontures(resultat.lignes, resultat.ignorees);

    if (ajoutees > 0) {
      setOpenImportDialog(false);
      setSelectedFile(null);
    }
  };

  /**
   * Ajoute les lignes ABSENTES du catalogue (dédup marque + référence + couleur
   * + taille) et laisse intactes celles déjà présentes : rien n'est écrasé, un
   * second passage ne fait donc rien. Retourne le nombre de montures créées.
   */
  const fusionnerMontures = (lignes: Record<string, any>[], ignorees = 0): number => {
    // `filtrerNouveautes` du module CSV compare les libellés bruts : « 42 - 65 »
    // et « 42-65 » lui échappent et il recrée des montures déjà présentes.
    // On passe donc par le dédoublonnage montures, plus tolérant à la mise en
    // forme, aussi bien pour l'import CSV que pour le catalogue embarqué.
    const { uniques: aCreer, doublons } = dedoublonnerMontures(
      lignes as any[], montures as any[],
    );

    if (aCreer.length === 0) {
      alert(`ℹ️ Aucune nouvelle monture : les ${doublons} ligne(s) sont déjà enregistrées.`);
      return 0;
    }

    const nouvelles: Monture[] = aCreer.map((l, i) => addCreateAudit({
      // Date.now() serait identique pour toutes les lignes d'un même import :
      // on ajoute l'index pour garantir des identifiants uniques.
      id: `${Date.now()}-${i}`,
      codeBarre: genCodeCourt(),
      marge: 0,
      ...l,
    }) as Monture);

    setMontures([...montures, ...nouvelles]);

    // Mêmes effets que la saisie manuelle : alimenter les listes de référence
    // (MA, CA, FA, CO, TA) et propager vers les catalogues de chaque magasin —
    // mais EN UN SEUL PASSAGE. Sur un gros import, enregistrer chaque monture
    // individuellement relit et réécrit tout le catalogue des 8 magasins à
    // chaque ligne (des milliers d'écritures localStorage) : l'onglet se fige
    // et l'enregistrement échoue avant la fin.
    const distinct = (champ: keyof Monture) =>
      Array.from(new Set(nouvelles.map(m => (m[champ] as string) || '').filter(Boolean)));
    for (const couleur of distinct('couleur')) autoRegisterMontureComponents({ couleur });
    for (const marque of distinct('marque')) autoRegisterMontureComponents({ marque });
    for (const categorie of distinct('categorie')) autoRegisterMontureComponents({ categorie });
    for (const famille of distinct('famille')) autoRegisterMontureComponents({ famille });
    for (const taille of distinct('taille')) autoRegisterMontureComponents({ taille });

    syncCataloguesToMagasinsBulk('montures', nouvelles);

    alert(messageImport(nouvelles.length, doublons, ignorees));
    return nouvelles.length;
  };

  /**
   * Complète le catalogue avec l'état de stock « E-S-2026052215007 » (742
   * montures arrêtées au 22-05-2026). Seules les références manquantes sont
   * créées ; les montures déjà saisies gardent leur prix et leur stock.
   */
  const handleImportCatalogueES = () => {
    const total = MONTURES_CATALOGUE_ES.length;
    if (!window.confirm(
      `Compléter le catalogue avec l'état de stock du 22-05-2026 (${total} montures) ?\n\n`
      + 'Seules les montures absentes seront ajoutées. Aucune monture existante '
      + "ne sera modifiée ni supprimée."
    )) return;

    fusionnerMontures(MONTURES_CATALOGUE_ES.map(l => ({
      ...l,
      seuil: SEUIL_DEFAUT,
      gestionStocks: 'actif' as const,
      garantie: GARANTIE_DEFAUT,
      fournisseur: '',
    })));
  };

  const resetForm = () => {
    setFormData({
      codeBarre: genCodeCourt(),
      fournisseur: '',
      marque: '',
      categorie: '',
      famille: '',
      reference: '',
      couleur: '',
      taille: '',
      prix: '',
      stock: '',
      seuil: String(SEUIL_DEFAUT),
      gestionStocks: 'actif',
      garantie: GARANTIE_DEFAUT,
      image: null,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, image: e.target.files[0] });
    }
  };

  const handleEditMonture = (monture: Monture) => {
    setEditingMonture(monture);
    setFormData({
      codeBarre: monture.codeBarre,
      fournisseur: monture.fournisseur || '',
      marque: monture.marque,
      categorie: monture.categorie,
      famille: monture.famille,
      reference: monture.reference,
      couleur: monture.couleur,
      taille: monture.taille,
      prix: monture.prix.toString(),
      stock: monture.stock.toString(),
      seuil: monture.seuil.toString(),
      gestionStocks: monture.gestionStocks || 'actif',
      garantie: monture.garantie || '',
      image: null,
    });
    setOpenAddDialog(true);
  };

  /**
   * Remise en état du catalogue existant, en une seule écriture :
   *   1. suppression des doublons (même marque + référence + couleur + taille
   *      + famille) — la PREMIÈRE occurrence est conservée, donc la plus
   *      ancienne saisie et son historique d'audit ;
   *   2. garantie forcée à 2 ans et seuil forcé à 1, valeurs uniformes chez
   *      Leclaire Optic.
   *
   * `setItemWithoutSync` + `replaceCatalogue` : comme pour une suppression
   * unitaire, le résultat ne doit pas être refusionné avec l'ancien contenu du
   * cloud, sinon les doublons reviendraient à la synchro suivante.
   */
  const handleNettoyerCatalogue = () => {
    const { uniques, doublons } = dedoublonnerMontures(montures);

    const aCorriger = uniques.filter(m => m.garantie !== GARANTIE_DEFAUT || m.seuil !== SEUIL_DEFAUT).length;

    if (doublons === 0 && aCorriger === 0) {
      alert('ℹ️ Catalogue déjà propre : aucun doublon, garantie et seuil déjà uniformes.');
      return;
    }

    if (!window.confirm(
      `Nettoyer le catalogue ?\n\n`
      + `• ${doublons} doublon(s) supprimé(s)\n`
      + `• ${aCorriger} monture(s) passée(s) en garantie « ${GARANTIE_DEFAUT} » et seuil ${SEUIL_DEFAUT}\n\n`
      + `${uniques.length} monture(s) conservée(s) sur ${montures.length}.`
    )) return;

    const nettoyees = uniques.map(m =>
      m.garantie === GARANTIE_DEFAUT && m.seuil === SEUIL_DEFAUT
        ? m
        : addUpdateAudit({ ...m, garantie: GARANTIE_DEFAUT, seuil: SEUIL_DEFAUT }) as Monture,
    );

    setMontures(nettoyees);
    setItemWithoutSync(MONTURES_KEY, JSON.stringify(nettoyees));
    replaceCatalogue('catalogue_montures', nettoyees)
      .catch(e => logger.error('❌ nettoyage catalogue montures Supabase:', e));

    // Les catalogues magasin sont reconstruits à l'identique : les doublons y
    // ont été propagés eux aussi, un simple ajout groupé ne les enlèverait pas.
    remplacerCataloguesMagasins('montures', nettoyees);

    alert(`✅ ${doublons} doublon(s) supprimé(s), ${aCorriger} monture(s) corrigée(s).`);
    setPage(1);
  };

  const handleDeleteMonture = (monture: Monture) => {
    if (window.confirm(`Supprimer la monture ${monture.reference} ?`)) {
      logDeletion('Monture', monture.id, monture);
      const next = montures.filter(m => m.id !== monture.id);
      setMontures(next);
      // Mise à jour locale sans déclencher replaceCatalogue, car une suppression
      // explicite ne doit pas être fusionnée avec l'ancien cloud.
      setItemWithoutSync(MONTURES_KEY, JSON.stringify(next));
      supprimerCatalogueItem('catalogue_montures', monture.id)
        .catch(e => logger.error('❌ suppression monture Supabase:', e));

      // Supprimer également des catalogues de tous les magasins
      removeCatalogueFromMagasins('montures', monture.id);

      showAuditNotification('delete', 'Monture');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ fontSize: 20 }}>👓</Box>
          <Typography variant="h6" sx={{ fontSize: 'clamp(0.9rem, 3vw, 1.25rem)' }}>Gestion des Composants: {TENANT.nom}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {/* Le catalogue de l'état de stock est aussi proposé dans la boîte
              d'import, mais il doit rester visible sans l'ouvrir : c'est
              l'action attendue tant que la table est vide. */}
          <Button
            variant="outlined"
            color="success"
            disabled={!peutAjouter}
            startIcon={<FileUploadIcon />}
            onClick={handleImportCatalogueES}
            sx={{ textTransform: 'none' }}
          >
            Catalogue E/S ({MONTURES_CATALOGUE_ES.length})
          </Button>
          <Button
            variant="outlined"
            color="warning"
            disabled={montures.length === 0}
            startIcon={<DeleteIcon />}
            onClick={handleNettoyerCatalogue}
            sx={{ textTransform: 'none' }}
            title={`Supprime les doublons et applique garantie « ${GARANTIE_DEFAUT} » + seuil ${SEUIL_DEFAUT} à toutes les montures.`}
          >
            Nettoyer les doublons
          </Button>
          <Button
            variant="contained"
            startIcon={<FileUploadIcon />}
            onClick={() => setOpenImportDialog(true)}
            sx={{
              bgcolor: '#4caf50',
              '&:hover': { bgcolor: '#45a049' },
              textTransform: 'none',
            }}
          >
            Importer Fichier
          </Button>
          <Button
            variant="contained"
            disabled={!peutAjouter}
            title={peutAjouter ? undefined : "Vous n'avez pas le droit d'ajouter des données."}
            onClick={() => setOpenAddDialog(true)}
            sx={{
              bgcolor: '#0277bd',
              '&:hover': { bgcolor: '#01579b' },
              textTransform: 'none',
            }}
          >
            Ajouter Monture
          </Button>
        </Box>
      </Box>

      {/* Title + search */}
      <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 'normal' }}>
        Montures ({montures.length})
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        (Code Barre, Marque, Catégorie, Famille, Référence, Couleur, Taille, Prix)
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField placeholder="Recherche..." value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
          size="small" sx={{ width: 280 }}
          InputProps={{ endAdornment: searchTerm ? <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon fontSize="small" /></IconButton> : null }}
        />
        <TextField placeholder="jj/mm/aaaa" value={dateFilter}
          onChange={e => setDateFilter(e.target.value)} size="small" sx={{ width: 170 }}
          InputProps={{ endAdornment: (
            <Box sx={{ display: 'flex' }}>
              <IconButton size="small"><CalendarTodayIcon sx={{ fontSize: 14 }} /></IconButton>
              {dateFilter && <IconButton size="small" onClick={() => setDateFilter('')}><ClearIcon sx={{ fontSize: 14 }} /></IconButton>}
            </Box>
          )}}
        />
        <IconButton size="small" sx={{ bgcolor: '#1976d2', color: 'white', borderRadius: 1 }}>
          <SearchIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        {/* Pagination */}
        {(() => {
          const PER_PAGE = 20;
          const total = Math.max(1, Math.ceil(montures.length / PER_PAGE));
          const btnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
            padding: '2px 7px', border: '1px solid #dee2e6', borderRadius: 3, cursor: disabled ? 'default' : 'pointer',
            backgroundColor: active ? '#0d6efd' : disabled ? '#f8f9fa' : 'white',
            color: active ? 'white' : disabled ? '#aaa' : '#333', fontSize: 12, margin: '0 1px',
          });
          return ['<<','<',null,'>','>>'].map((lbl, i) => {
            if (lbl === null) return <button key="cur" style={btnStyle(true, false)}>{page}</button>;
            const dis = lbl === '<<' || lbl === '<' ? page === 1 : page === total;
            const act = lbl === '<<' ? () => setPage(1) : lbl === '<' ? () => setPage(p=>p-1) : lbl === '>' ? () => setPage(p=>p+1) : () => setPage(total);
            return <button key={lbl} onClick={act} disabled={dis} style={btnStyle(false, dis)}>{lbl}</button>;
          });
        })()}
      </Box>

      {/* Table - Desktop */}
      <div className="hidden md:block">
      <TableContainer component={Paper} sx={{ boxShadow: '0 1px 4px rgba(0,0,0,0.1)', borderRadius: 1 }}>
        <Table size="small" sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#fafafa', '& th': { fontWeight: 700, fontSize: '0.78rem', borderBottom: '2px solid #e0e0e0', py: 1.2, px: 1 } }}>
              <TableCell padding="checkbox" sx={{ width: 36 }}><Checkbox size="small" /></TableCell>
              <TableCell sx={{ width: 46, textAlign: 'center' }}>
                <IconButton size="small" sx={{ bgcolor: '#f44336', borderRadius: 0.5, p: 0.4 }}>
                  <DeleteIcon sx={{ fontSize: 13, color: 'white' }} />
                </IconButton>
              </TableCell>
              <TableCell>Code Barre</TableCell>
              <TableCell>Marque</TableCell>
              <TableCell>Catégorie</TableCell>
              <TableCell>Famille</TableCell>
              <TableCell>Référence</TableCell>
              <TableCell>Couleur</TableCell>
              <TableCell>Taille</TableCell>
              <TableCell>Prix</TableCell>
              <TableCell>Stock</TableCell>
              <TableCell sx={{ minWidth: 230 }}>Marge</TableCell>
              <TableCell>Seuil</TableCell>
              <TableCell sx={{ minWidth: 155 }}>Édition</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(() => {
              const PER_PAGE = 20;
              const sorted = [...montures].sort((a, b) => (a.marque||'').localeCompare(b.marque||'','fr'));
              const filtered = sorted.filter(m => {
                if (!searchTerm) return true;
                const q = searchTerm.toLowerCase();
                return [m.codeBarre,m.marque,m.categorie,m.famille,m.reference,m.couleur,m.taille,String(m.prix)].some(s=>(s||'').toLowerCase().includes(q));
              });
              const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);
              if (paginated.length === 0) return (
                <TableRow><TableCell colSpan={14} sx={{ textAlign: 'center', py: 5, color: '#aaa' }}>Aucune monture</TableCell></TableRow>
              );
              return paginated.map((m, idx) => {
                const { date, time } = formatAuditDT(m.updatedAt || m.createdAt);
                const user = m.updatedBy || m.createdBy || '—';
                const cellSx = { fontSize: '0.78rem', px: 1, py: 1 };
                return (
                  <React.Fragment key={m.id}>
                    {/* ── Ligne principale ── */}
                    <TableRow sx={{ '&:hover': { bgcolor: '#f5f5f5' }, borderBottom: 'none' }}>
                      <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center', color: '#9e9e9e' }}>{idx + 1}</TableCell>
                      <TableCell sx={cellSx}>{m.codeBarre}</TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{m.marque}</TableCell>
                      <TableCell sx={cellSx}>{m.categorie}</TableCell>
                      <TableCell sx={cellSx}>{m.famille}</TableCell>
                      <TableCell sx={cellSx}>
                        <div>{m.reference}</div>
                        {m.garantie && (
                          <Chip label={`Garantie: ${m.garantie}`} size="small"
                            sx={{ mt: 0.5, bgcolor: '#ff9800', color: 'white', fontSize: '0.65rem', height: 20, fontWeight: 600 }} />
                        )}
                      </TableCell>
                      <TableCell sx={cellSx}>{m.couleur}</TableCell>
                      <TableCell sx={cellSx}>{m.taille}</TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{m.prix?.toLocaleString('fr-FR')}</TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{m.stock}</TableCell>
                      <TableCell sx={{ p: 0, verticalAlign: 'top', borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                        <MargeCell reference={m.reference} codeBarre={m.codeBarre} marque={m.marque} prix={m.prix ?? 0} />
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{m.seuil}</TableCell>
                      <TableCell sx={{ ...cellSx, verticalAlign: 'top' }}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.3 }}>{date}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#666', lineHeight: 1.3 }}>{time}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#333', lineHeight: 1.3, mb: 0.5 }}>{user}</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Copier" arrow>
                            <IconButton size="small" sx={{ bgcolor: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 0.5, p: 0.35 }}>
                              <ContentCopyIcon sx={{ fontSize: 11, color: '#1565c0' }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Modifier" arrow>
                            <IconButton size="small" onClick={() => handleEditMonture(m)}
                              sx={{ bgcolor: '#fffde7', border: '1px solid #ffe082', borderRadius: 0.5, p: 0.35 }}>
                              <EditIcon sx={{ fontSize: 11, color: '#f57f17' }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Supprimer" arrow>
                            <IconButton size="small" onClick={() => handleDeleteMonture(m)}
                              sx={{ bgcolor: '#f44336', borderRadius: 0.5, p: 0.35 }}>
                              <DeleteIcon sx={{ fontSize: 11, color: 'white' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                    {/* ── Sous-ligne : fournisseur + étiquettes ── */}
                    <TableRow sx={{ bgcolor: '#fafafa', '& td': { py: 0.6, px: 1, borderBottom: '1px solid #eeeeee' } }}>
                      <TableCell padding="checkbox" />
                      <TableCell />
                      <TableCell sx={{ fontSize: '0.72rem', color: '#555', fontStyle: 'italic' }}>{m.fournisseur || ''}</TableCell>
                      <TableCell colSpan={10}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Button size="small" variant="outlined"
                            sx={{ fontSize: '0.68rem', py: 0.2, px: 1, textTransform: 'none', borderColor: '#bbb', color: '#555', minWidth: 0 }}>
                            Étiquette
                          </Button>
                          <TextField size="small" placeholder="Quantité"
                            sx={{ width: 90, '& .MuiInputBase-input': { py: 0.4, fontSize: '0.72rem' } }} />
                          <Button size="small" variant="outlined"
                            sx={{ fontSize: '0.68rem', py: 0.2, px: 1, textTransform: 'none', borderColor: '#bbb', color: '#555', minWidth: 0 }}>
                            B5
                          </Button>
                          <Button size="small" variant="outlined"
                            sx={{ fontSize: '0.68rem', py: 0.2, px: 1, textTransform: 'none', borderColor: '#bbb', color: '#555', minWidth: 0 }}>
                            A5
                          </Button>
                        </Box>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </React.Fragment>
                );
              });
            })()}
          </TableBody>
        </Table>
      </TableContainer>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden">
        {(() => {
          const PER_PAGE = 20;
          const sorted = [...montures].sort((a, b) => (a.marque||'').localeCompare(b.marque||'','fr'));
          const fil = sorted.filter(m => {
            if (!searchTerm) return true;
            const q = searchTerm.toLowerCase();
            return [m.codeBarre,m.marque,m.categorie,m.famille,m.reference,m.couleur,m.taille,String(m.prix)].some(s=>(s||'').toLowerCase().includes(q));
          });
          const pag = fil.slice((page-1)*PER_PAGE, page*PER_PAGE);
          if (pag.length === 0) return (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa', fontSize: '0.9rem' }}>Aucune monture</div>
          );
          return pag.map(m => (
            <div key={m.id} style={{
              background: 'white',
              borderRadius: 8,
              border: '1px solid #e0e0e0',
              padding: '12px 14px',
              marginBottom: 10,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {/* Card header: marque + status badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'clamp(0.88rem, 3.5vw, 1rem)', color: '#1a237e' }}>{m.marque}</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', marginTop: 2 }}>{m.reference}</div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600, flexShrink: 0,
                  background: m.gestionStocks === 'actif' ? '#e8f5e9' : '#fff3e0',
                  color: m.gestionStocks === 'actif' ? '#2e7d32' : '#e65100',
                }}>
                  {m.gestionStocks === 'actif' ? 'Actif' : 'Inactif'}
                </span>
              </div>
              {/* Info grid: couleur + taille + stock + prix */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Couleur</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{m.couleur || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Taille</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{m.taille || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Stock</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: m.stock <= (m.seuil ?? 0) ? '#c62828' : '#2e7d32' }}>{m.stock}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2 }}>Prix</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1565c0' }}>{m.prix?.toLocaleString('fr-FR')} F</div>
                </div>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                <button onClick={() => handleEditMonture(m)} style={{
                  flex: 1, padding: '7px 0', border: '1px solid #ffe082', borderRadius: 4,
                  background: '#fffde7', color: '#f57f17', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                }}>
                  Modifier
                </button>
                <button onClick={() => handleDeleteMonture(m)} style={{
                  flex: 1, padding: '7px 0', border: 'none', borderRadius: 4,
                  background: '#f44336', color: 'white', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                }}>
                  Supprimer
                </button>
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Import Dialog */}
      <Dialog open={openImportDialog} onClose={() => setOpenImportDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Importer Fichier
          <IconButton onClick={() => setOpenImportDialog(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Renseigner le fichier ICM.csv télécharger
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              1. Marque, 2. Catégorie, 3. Famille, 4. Référence, 5. Couleur, 6. Taille, 7. Prix, 8. Stock, 9. Seuil, 10. Gestion Stock, 11. Garantie, 12. Fournisseur
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Dans la 10ème colonne si la gestion de stock est prise en compte écrire 1 si non 0.
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Séparateur : point-virgule « ; ». Seule la colonne 1 (Marque) est obligatoire.
            </Typography>

            {/* Export du modèle DÉJÀ RENSEIGNÉ avec les montures existantes :
                l'utilisateur complète dans Excel puis réimporte le même fichier. */}
            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadIcon />}
                onClick={handleTelechargerICM}
                sx={{ textTransform: 'none' }}
              >
                Télécharger ICM.csv ({montures.length} monture{montures.length > 1 ? 's' : ''})
              </Button>
            </Box>

            {/* Raccourci : catalogue de l'état de stock du 22-05-2026 déjà
                embarqué dans l'app — évite de repasser par un CSV. */}
            <Box sx={{ mb: 3, p: 2, border: '1px solid #c8e6c9', borderRadius: 1, bgcolor: '#f1f8e9' }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Catalogue E/S du 22-05-2026</strong> — {MONTURES_CATALOGUE_ES.length} montures
                (marque, catégorie, famille, référence, couleur, taille, prix, stock).
                Seules les montures manquantes seront ajoutées.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                color="success"
                startIcon={<FileUploadIcon />}
                onClick={handleImportCatalogueES}
                sx={{ textTransform: 'none' }}
              >
                Ajouter les montures manquantes
              </Button>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2">Fichier *</Typography>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="import-file"
              />
              <label htmlFor="import-file">
                <Button
                  component="span"
                  variant="outlined"
                  size="small"
                  sx={{ textTransform: 'none' }}
                >
                  Charger
                </Button>
              </label>
              <Typography variant="body2" color="text.secondary">
                {selectedFile ? selectedFile.name : 'Aucun Fichier'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
            <Button
              variant="outlined"
              onClick={() => {
                setOpenImportDialog(false);
                setSelectedFile(null);
              }}
              sx={{ textTransform: 'none' }}
            >
              Fermer
            </Button>
            <Button
              variant="contained"
              onClick={handleImportFile}
              sx={{
                bgcolor: '#2196f3',
                '&:hover': { bgcolor: '#1976d2' },
                textTransform: 'none',
              }}
            >
              Importer
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Add Monture Dialog */}
      <Dialog open={openAddDialog} onClose={() => { setOpenAddDialog(false); setEditingMonture(null); resetForm(); }} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingMonture ? 'Modifier' : 'Ajouter'} Monture
          <IconButton onClick={() => { setOpenAddDialog(false); setEditingMonture(null); resetForm(); }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
            {/* Image Upload */}
            <Box sx={{ gridColumn: '1', gridRow: '1 / 3' }}>
              <Box
                sx={{
                  width: 120,
                  height: 120,
                  border: '1px solid #ccc',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: '#fafafa',
                  position: 'relative',
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  id="upload-image"
                />
                <label htmlFor="upload-image" style={{ cursor: 'pointer', textAlign: 'center' }}>
                  <FileUploadIcon sx={{ fontSize: 40, color: '#999' }} />
                </label>
              </Box>
            </Box>

            {/* Code Barre */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Code Barre <span style={{ color: 'red' }}>*</span>
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={formData.codeBarre}
                InputProps={{ readOnly: true }}
                placeholder=""
              />
            </Box>

            {/* Fournisseur */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Fournisseur</Typography>
              <Autocomplete
                freeSolo
                size="small"
                options={fournisseursList}
                value={formData.fournisseur || null}
                onInputChange={(_, v) => setFormData({ ...formData, fournisseur: v })}
                renderInput={(params) => <TextField {...params} placeholder="Fournisseur..." />}
              />
            </Box>

            {/* Marque */}
            <Box sx={{ gridColumn: '2' }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Marque <span style={{ color: 'red' }}>*</span>
              </Typography>
              <Autocomplete
                freeSolo
                size="small"
                options={marquesList}
                value={formData.marque || null}
                onInputChange={(_, v) => setFormData({ ...formData, marque: v })}
                renderInput={(params) => <TextField {...params} placeholder="Marque..." />}
              />
            </Box>

            {/* Catégorie */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Catégorie <span style={{ color: 'red' }}>*</span>
              </Typography>
              <Autocomplete
                freeSolo
                size="small"
                options={categoriesList}
                value={formData.categorie || null}
                onInputChange={(_, v) => setFormData({ ...formData, categorie: v })}
                renderInput={(params) => <TextField {...params} placeholder="Catégorie..." />}
              />
            </Box>

            {/* Famille */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Famille <span style={{ color: 'red' }}>*</span>
              </Typography>
              <Autocomplete
                freeSolo
                size="small"
                options={famillesList}
                value={formData.famille || null}
                onInputChange={(_, v) => setFormData({ ...formData, famille: v })}
                renderInput={(params) => <TextField {...params} placeholder="Famille..." />}
              />
            </Box>

            {/* Référence */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Référence <span style={{ color: 'red' }}>*</span>
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              />
            </Box>

            {/* Couleur */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Couleur <span style={{ color: 'red' }}>*</span>
              </Typography>
              <Autocomplete
                freeSolo
                size="small"
                options={couleursList}
                value={formData.couleur || null}
                onInputChange={(_, v) => setFormData({ ...formData, couleur: v })}
                renderInput={(params) => <TextField {...params} placeholder="Couleur..." />}
              />
            </Box>

            {/* Taille */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Taille <span style={{ color: 'red' }}>*</span>
              </Typography>
              <Autocomplete
                freeSolo
                size="small"
                options={taillesList}
                value={formData.taille || null}
                onInputChange={(_, v) => setFormData({ ...formData, taille: v })}
                renderInput={(params) => <TextField {...params} placeholder="Taille..." />}
              />
            </Box>

            {/* Prix */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Prix</Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={formData.prix}
                onChange={(e) => setFormData({ ...formData, prix: e.target.value })}
              />
            </Box>

            {/* Stock */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Stock</Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
              />
            </Box>

            {/* Seuil */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Seuil</Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={formData.seuil}
                onChange={(e) => setFormData({ ...formData, seuil: e.target.value })}
              />
            </Box>

            {/* Gestion Stocks */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Gestion Stocks <span style={{ color: 'red' }}>*</span>
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <label>
                  <input
                    type="radio"
                    value="actif"
                    checked={formData.gestionStocks === 'actif'}
                    onChange={(e) => setFormData({ ...formData, gestionStocks: e.target.value as 'actif' })}
                  />
                  {' '}Actif
                </label>
                <label>
                  <input
                    type="radio"
                    value="inactif"
                    checked={formData.gestionStocks === 'inactif'}
                    onChange={(e) => setFormData({ ...formData, gestionStocks: e.target.value as 'inactif' })}
                  />
                  {' '}Inactif
                </label>
              </Box>
            </Box>

            {/* Garantie */}
            <Box sx={{ gridColumn: '2 / 4' }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Garantie</Typography>
              <Autocomplete
                freeSolo
                size="small"
                options={['6 mois', '1 an', '2 ans', '3 ans']}
                value={formData.garantie || null}
                onInputChange={(_, v) => setFormData({ ...formData, garantie: v })}
                renderInput={(params) => <TextField {...params} placeholder="Garantie..." />}
              />
            </Box>
          </Box>

          {/* Informations d'audit */}
          {editingMonture && (editingMonture.createdBy || editingMonture.updatedBy) && (
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Informations d'audit
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                {editingMonture.createdBy && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Créé par</Typography>
                    <Typography variant="body2">{editingMonture.createdBy}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(editingMonture.createdAt)}</Typography>
                  </Box>
                )}
                {editingMonture.updatedBy && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Modifié par</Typography>
                    <Typography variant="body2">{editingMonture.updatedBy}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(editingMonture.updatedAt)}</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
            <Button
              variant="outlined"
              onClick={() => {
                setOpenAddDialog(false);
                resetForm();
              }}
              sx={{ textTransform: 'none' }}
            >
              Fermer
            </Button>
            <Button
              variant="contained"
              onClick={handleAddMonture}
              sx={{
                bgcolor: '#2196f3',
                '&:hover': { bgcolor: '#1976d2' },
                textTransform: 'none',
              }}
            >
              Enregistrer
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
