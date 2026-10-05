import { resolveUserName } from '../../utils/auditUtils';
import { useState, useEffect, useRef } from 'react';
import { imprimerPageCourante } from '../../utils/inAppViewer';
import { useParams } from 'react-router';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  TextField,
  MenuItem,
  Card,
  CardContent,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { TrendingUp, TrendingDown, AccountBalance, Print, Download, Add } from '@mui/icons-material';
import { excelHeaderRows } from '../../utils/documentHeader';
import { useLiveData } from '../../hooks/useLiveData';
import { chargerVentes, readVentesCache, VenteSupabase } from '../../services/ventesService';
import { chargerReglementsParMagasin, readReglementsCacheMap, ReglementSupabase } from '../../services/reglementsService';
import { useAuth } from '../../contexts/AuthContext';
import { canAdd } from '../../utils/actionRights';
import { setVisibleInterval, PAGE_POLL_MS } from '../../utils/visibleInterval';
import { estPaiementAssurance } from '../../utils/venteTotals';
const GridAny = Grid as any;


/** Nom lisible du responsable (les sorties manuelles stockaient le profil JSON complet). */
function nomResponsable(valeur: unknown, defaut = 'Utilisateur'): string {
  const n = resolveUserName(valeur);
  return n && n !== '-' ? n : defaut;
}

interface MouvementCaisse {
  id: string;
  date: string;
  magasinId: string;
  type: 'entree' | 'sortie';
  categorie: string;
  montant: number;
  libelle: string;
  modePaiement: string;
  reference?: string;
  responsable: string;
  beneficiaire?: string;
  nature?: string;
  compteBanque?: string;
  commentaire?: string;
  /** Origine d'une entrée calculée automatiquement (pour imprimer son reçu). */
  source?: { kind: 'acompte' | 'reglement'; venteId: string; reglementId?: string };
}

function getMagasinLabel(magasinId: string): string {
  const labels: Record<string, string> = {
    'ABOBO': 'Abobo',
    'FAYA': 'Faya',
    'KOUMASSI': 'Koumassi',
    'PALMERAIE': 'Palmeraie',
    'YOPOUGON': 'Yopougon',
    'BINGERVILLE': 'Bingerville',
    'MAN': 'Man',
  };
  return labels[magasinId.toUpperCase()] || magasinId;
}

export function MouvementsCaissePage() {
  const { user } = useAuth();
  const peutAjouter = canAdd(user, 'general');
  // Récap (Entrées / Sorties / Solde) réservé aux directeurs, comptables et administrateurs.
  const peutVoirRecap = ['super_admin', 'admin', 'administrateur', 'directeur', 'comptable'].includes(user?.role || '');
  const { magasinId } = useParams();
  // Mouvements personnalisés : lecture + écriture DIRECTES Firestore (partagé entre navigateurs)
  const [mouvementsPersonnalises, setMouvementsPersonnalises] = useLiveData<MouvementCaisse>('leclaire_mouvements_caisse', []);
  const deriveFromVentes = (ventes: VenteSupabase[], mag: string): MouvementCaisse[] => {
    const derivees: MouvementCaisse[] = [];
    ventes.forEach((vente) => {
      const montantPaye = parseFloat((vente.recap && vente.recap.acompte) || '0') || 0;
      // Acompte saisi en mode « Assurance » = prise en charge, pas un encaissement.
      if (montantPaye > 0 && !estPaiementAssurance(vente.recap && vente.recap.modePaiement)) {
        const numFacture = (vente.recap && (vente.recap.numFacture || vente.recap.numDevis)) || vente.id;
        derivees.push({
          id: `vente-${vente.id}`,
          date: vente.date || new Date().toISOString(),
          magasinId: mag,
          type: 'entree',
          categorie: 'Vente',
          montant: montantPaye,
          libelle: `Vente ${numFacture} - ${vente.numero_client || 'Client'}`,
          modePaiement: (vente.recap && vente.recap.modePaiement) || 'Espèces',
          reference: numFacture || `V-${vente.id}`,
          responsable: vente.edite_par || 'Utilisateur',
          beneficiaire: vente.numero_client || vente.client || 'Client',
          nature: 'Vente',
          compteBanque: (vente.recap && vente.recap.compteBanque) || 'CAISSE INTERNE',
          commentaire: (vente as any).observations || `Encaissement de la vente ${numFacture || vente.id}`,
          source: { kind: 'acompte', venteId: vente.id },
        });
      }
    });
    return derivees;
  };
  // Dérive une entrée de caisse par RÈGLEMENT (encaissement postérieur à la
  // vente), daté à la date du règlement — c'est ce que demande le magasin.
  const deriveFromReglements = (reglements: ReglementSupabase[], mag: string, ventes: VenteSupabase[] = []): MouvementCaisse[] => {
    return (reglements || [])
      .filter((r) => (r.magasin_id || '').toUpperCase() === (mag || '').toUpperCase())
      .filter((r) => (Number(r.montant) || 0) > 0)
      // Règlement saisi en mode « Assurance » = prise en charge, pas un encaissement.
      .filter((r) => !estPaiementAssurance(r.mode_paiement))
      .map((r) => ({
        id: `reglement-${r.id}`,
        date: r.date || new Date().toISOString(),
        magasinId: mag,
        type: 'entree' as const,
        categorie: 'Règlement client',
        montant: Number(r.montant) || 0,
        libelle: `Règlement ${r.recu || ''}`.trim(),
        modePaiement: r.mode_paiement || 'Espèces',
        reference: r.recu || `REG-${r.id}`,
        responsable: r.edite_par || 'Utilisateur',
        beneficiaire: ventes.find(v => v.id === r.vente_id)?.numero_client || ventes.find(v => v.id === r.vente_id)?.client || 'Client',
        nature: 'Règlement',
        compteBanque: r.compte_banque || 'CAISSE INTERNE',
        commentaire: r.details || `Règlement client ${r.recu || r.id}`,
        source: { kind: 'reglement' as const, venteId: r.vente_id, reglementId: r.id },
      }));
  };
  const readReglementsCacheMagasin = (mag: string): ReglementSupabase[] => {
    const map = readReglementsCacheMap();
    return Object.values(map).flat();
  };
  // Affichage INSTANTANÉ depuis le cache des ventes.
  const [ventesDerivees, setVentesDerivees] = useState<MouvementCaisse[]>(
    () => deriveFromVentes(readVentesCache(magasinId || ''), magasinId || ''),
  );
  const [reglementsDerives, setReglementsDerives] = useState<MouvementCaisse[]>(
    () => deriveFromReglements(readReglementsCacheMagasin(magasinId || ''), magasinId || '', readVentesCache(magasinId || '')),
  );
  // Dernières données brutes chargées (pour imprimer le reçu d'un règlement).
  const ventesBrutesRef = useRef<VenteSupabase[]>([]);
  const reglementsBrutsRef = useRef<ReglementSupabase[]>([]);
  const [mouvements, setMouvements] = useState<MouvementCaisse[]>([]);
  const [filteredMouvements, setFilteredMouvements] = useState<MouvementCaisse[]>([]);
  const [filterType, setFilterType] = useState('');
  const [filterDateDebut, setFilterDateDebut] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Form state
  const [formType, setFormType] = useState<'entree' | 'sortie'>('entree');
  const [formCategorie, setFormCategorie] = useState('');
  const [formMontant, setFormMontant] = useState('');
  const [formLibelle, setFormLibelle] = useState('');
  const [formModePaiement, setFormModePaiement] = useState('Espèces');
  const [formReference, setFormReference] = useState('');

  // Dérivation des ventes (entrées) depuis Firestore — cohérent sur tous les navigateurs
  useEffect(() => {
    if (!magasinId) { setVentesDerivees([]); return; }
    let annule = false;
    // Re-seed cache immédiat au changement de magasin.
    setVentesDerivees(deriveFromVentes(readVentesCache(magasinId), magasinId));
    const load = () => {
      chargerVentes(magasinId).then((ventes: VenteSupabase[]) => {
        if (annule) return;
        ventesBrutesRef.current = ventes;
        setVentesDerivees(deriveFromVentes(ventes, magasinId));
      }).catch(() => {});
    };
    load();
    // Rafraîchissement AUTOMATIQUE : périodique + événements.
    const stopPolling = setVisibleInterval(load, PAGE_POLL_MS);
    const onUpdate = () => load();
    window.addEventListener('ventes-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      annule = true;
      stopPolling();
      window.removeEventListener('ventes-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [magasinId]);

  // Dérivation des RÈGLEMENTS (encaissements) depuis Firestore — chaque
  // règlement apparaît comme une entrée datée à sa propre date.
  useEffect(() => {
    if (!magasinId) { setReglementsDerives([]); return; }
    let annule = false;
    setReglementsDerives(deriveFromReglements(readReglementsCacheMagasin(magasinId), magasinId, readVentesCache(magasinId)));
    const load = () => {
      chargerReglementsParMagasin(magasinId).then((regls) => {
        if (annule) return;
        reglementsBrutsRef.current = regls;
        setReglementsDerives(deriveFromReglements(regls, magasinId, readVentesCache(magasinId)));
      }).catch(() => {});
    };
    load();
    const stopPolling = setVisibleInterval(load, PAGE_POLL_MS);
    const onUpdate = () => load();
    window.addEventListener('reglements-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      annule = true;
      stopPolling();
      window.removeEventListener('reglements-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [magasinId]);

  // Agrégation ventes dérivées + règlements + mouvements personnalisés du magasin
  useEffect(() => {
    if (!magasinId) return;
    const allMouvements: MouvementCaisse[] = [...ventesDerivees, ...reglementsDerives];

    const mouvementsMagasin = mouvementsPersonnalises.filter(
      (m: MouvementCaisse) => m.magasinId === magasinId
    );
    allMouvements.push(...mouvementsMagasin);

    // Trier par date décroissante
    allMouvements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setMouvements(allMouvements);
  }, [magasinId, ventesDerivees, reglementsDerives, mouvementsPersonnalises]);

  useEffect(() => {
    applyFilters();
  }, [mouvements, filterType, filterDateDebut, filterDateFin]);

  const applyFilters = () => {
    let filtered = [...mouvements];

    if (filterType) {
      filtered = filtered.filter(m => m.type === filterType);
    }

    if (filterDateDebut) {
      filtered = filtered.filter(m => new Date(m.date) >= new Date(filterDateDebut));
    }

    if (filterDateFin) {
      const dateFin = new Date(filterDateFin);
      dateFin.setHours(23, 59, 59, 999);
      filtered = filtered.filter(m => new Date(m.date) <= dateFin);
    }

    setFilteredMouvements(filtered);
  };

  const handleCreateMouvement = () => {
    if (!formCategorie || !formMontant || !formLibelle || !magasinId) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const nouveauMouvement: MouvementCaisse = {
      id: `custom-${Date.now()}`,
      date: new Date().toISOString(),
      magasinId: magasinId,
      type: formType,
      categorie: formCategorie,
      montant: parseFloat(formMontant),
      libelle: formLibelle,
      modePaiement: formModePaiement,
      reference: formReference.trim() || `MVT-${Date.now().toString().slice(-6)}`,
      responsable: nomResponsable(localStorage.getItem('leclaire_current_user')),
      beneficiaire: formLibelle.trim() || 'CAISSE',
      nature: formCategorie || 'Autre',
      compteBanque: 'CAISSE INTERNE',
      commentaire: formLibelle.trim() || `Mouvement ${formType === 'entree' ? 'entrée' : 'sortie'}`,
    };

    // Sauvegarder dans Firestore (partagé entre navigateurs) via useLiveData
    setMouvementsPersonnalises([...mouvementsPersonnalises, nouveauMouvement]);

    window.dispatchEvent(new CustomEvent('leclaire-sync-update'));

    // Réinitialiser le formulaire
    setFormType('entree');
    setFormCategorie('');
    setFormMontant('');
    setFormLibelle('');
    setFormModePaiement('Espèces');
    setFormReference('');
    setShowCreateDialog(false);
  };

  const totalEntrees = filteredMouvements
    .filter(m => m.type === 'entree')
    .reduce((sum, m) => sum + m.montant, 0);

  const totalSorties = filteredMouvements
    .filter(m => m.type === 'sortie')
    .reduce((sum, m) => sum + m.montant, 0);

  const solde = totalEntrees - totalSorties;

  const handleExportExcel = async () => {
    // Import paresseux : xlsx chargé uniquement au moment de l'export.
    const XLSX = await import('xlsx');
    const data = filteredMouvements.map(m => ({
      'Date': new Date(m.date).toLocaleDateString('fr-FR'),
      'Type': m.type === 'entree' ? 'Entrée' : 'Sortie',
      'Catégorie': m.categorie,
      'Libellé': m.libelle,
      'Montant': m.montant,
      'Mode de Paiement': m.modePaiement,
      'Référence': m.reference || '-',
      'Responsable': nomResponsable(m.responsable),
    }));

    const headers = ['Date', 'Type', 'Catégorie', 'Libellé', 'Montant', 'Mode de Paiement', 'Référence', 'Responsable'];
    const aoa = [...excelHeaderRows(magasinId || ''), headers, ...data.map((row: any) => headers.map(h => row[h]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mouvements Caisse');
    XLSX.writeFile(wb, `Mouvements_Caisse_${getMagasinLabel(magasinId || '')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = () => {
    imprimerPageCourante();
  };

  // Bouton PDF d'une ligne : pour un acompte ou un règlement client, on ouvre
  // le REÇU de ce règlement (même document que dans Ventes | Factures). Pour un
  // mouvement saisi à la main, on imprime la page comme avant.
  const imprimerMouvement = async (mouvement: MouvementCaisse) => {
    const src = mouvement.source;
    if (!src) { handlePrint(); return; }
    const ventes = ventesBrutesRef.current.length ? ventesBrutesRef.current : readVentesCache(magasinId || '');
    const venteBrute = ventes.find(v => v.id === src.venteId);
    if (!venteBrute) { alert('Vente introuvable pour ce règlement. Rechargez la page puis réessayez.'); return; }
    try {
      const { telechargerReglementPDF, venteSupabaseToSauvegardee } = await import('./gestion-commercial/VenteFacturePage');
      const vente = venteSupabaseToSauvegardee(venteBrute);
      const acompteInitial = parseFloat(String(venteBrute.recap?.acompte ?? '0')) || 0;
      if (src.kind === 'acompte') {
        await telechargerReglementPDF({
          recu: (venteBrute.recap as any)?.numRecu || '—',
          modePaiement: (venteBrute.recap as any)?.modePaiement || 'ESPECE',
          compteBanque: (venteBrute.recap as any)?.compteBanque || 'CAISSE INTERNE',
          details: (venteBrute.recap as any)?.details || '',
          montant: acompteInitial,
          totalPaye: acompteInitial,
          date: venteBrute.date,
          editePar: venteBrute.edite_par || '—',
        }, vente, magasinId);
        return;
      }
      // Règlement : cumul payé À CE STADE (acompte + règlements jusqu'à celui-ci).
      const reglementsVente = (reglementsBrutsRef.current.length ? reglementsBrutsRef.current : readReglementsCacheMagasin(magasinId || ''))
        .filter(r => r.vente_id === src.venteId)
        .filter(r => !((venteBrute.recap as any)?.imported && String((r as any).details || '').trim().toLowerCase() === 'acompte importé'))
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      const idx = reglementsVente.findIndex(r => r.id === src.reglementId);
      const reglement = reglementsVente[idx];
      if (!reglement) { alert('Règlement introuvable. Rechargez la page puis réessayez.'); return; }
      const totalPaye = acompteInitial + reglementsVente.slice(0, idx + 1).reduce((s, r) => s + (Number(r.montant) || 0), 0);
      await telechargerReglementPDF({
        id: reglement.id,
        recu: reglement.recu,
        modePaiement: reglement.mode_paiement,
        compteBanque: reglement.compte_banque,
        details: reglement.details,
        montant: reglement.montant,
        totalPaye,
        date: reglement.date,
        editePar: reglement.edite_par,
      }, vente, magasinId);
    } catch (e) {
      console.error('Impression du reçu impossible :', e);
      alert('Impossible de générer le reçu. Réessayez.');
    }
  };

  const categoriesEntree = ['Vente', 'Règlement client', 'Remboursement', 'Autre'];
  const categoriesSortie = ['Achat fournitures', 'Frais généraux', 'Salaire', 'Loyer', 'Électricité', 'Eau', 'Téléphone/Internet', 'Transport', 'Autre'];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontSize: 'clamp(18px,4vw,24px)' }}>
          Mouvements Entrées et Sorties - {getMagasinLabel(magasinId || '')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          disabled={!peutAjouter}
          title={peutAjouter ? undefined : "Vous n'avez pas le droit d'ajouter des données."}
          onClick={() => setShowCreateDialog(true)}
          sx={{ bgcolor: '#1976d2' }}
        >
          Nouveau Mouvement
        </Button>
      </Box>

      {/* Statistiques — visibles uniquement pour directeurs, comptables et administrateurs */}
      {peutVoirRecap && (
      <GridAny container spacing={2} sx={{ mb: 3 }}>
        <GridAny item xs={12} sm={4}>
          <Card sx={{ bgcolor: '#4caf50', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrendingUp />
                <Typography variant="h6">Entrées</Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {totalEntrees.toLocaleString('fr-FR')} FCFA
              </Typography>
            </CardContent>
          </Card>
        </GridAny>
        <GridAny item xs={12} sm={4}>
          <Card sx={{ bgcolor: '#f44336', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrendingDown />
                <Typography variant="h6">Sorties</Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {totalSorties.toLocaleString('fr-FR')} FCFA
              </Typography>
            </CardContent>
          </Card>
        </GridAny>
        <GridAny item xs={12} sm={4}>
          <Card sx={{ bgcolor: solde >= 0 ? '#1976d2' : '#ff9800', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AccountBalance />
                <Typography variant="h6">Solde</Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {solde.toLocaleString('fr-FR')} FCFA
              </Typography>
            </CardContent>
          </Card>
        </GridAny>
      </GridAny>
      )}

      {/* Filtres */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            select
            label="Type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            sx={{ minWidth: 150 }}
            size="small"
          >
            <MenuItem value="">Tous</MenuItem>
            <MenuItem value="entree">Entrées</MenuItem>
            <MenuItem value="sortie">Sorties</MenuItem>
          </TextField>

          <TextField
            type="date"
            label="Date début"
            value={filterDateDebut}
            onChange={(e) => setFilterDateDebut(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />

          <TextField
            type="date"
            label="Date fin"
            value={filterDateFin}
            onChange={(e) => setFilterDateFin(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            startIcon={<Print />}
            onClick={handlePrint}
          >
            Imprimer
          </Button>

          <Button
            variant="contained"
            startIcon={<Download />}
            onClick={handleExportExcel}
            sx={{ bgcolor: '#4caf50' }}
          >
            Excel
          </Button>
        </Box>
      </Paper>

      {/* Tableau — même présentation que les mouvements de l'administration */}
      <div className="hidden md:block border border-gray-200 rounded overflow-x-auto">
        <TableContainer component={Paper} elevation={0}>
          {/* Largeurs FIXES : les colonnes courtes (n°, type, montant…) prennent
              peu de place, les textes longs (bénéficiaire, nature, commentaire)
              passent à la ligne DANS leur colonne au lieu de déborder. */}
          <Table size="small" sx={{
            tableLayout: 'fixed', minWidth: 1180,
            '& th, & td': { px: 1, py: 1, fontSize: 13, verticalAlign: 'middle', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' },
            '& th': { overflowWrap: 'normal', wordBreak: 'normal', lineHeight: 1.25 },
          }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 108 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 112 }} />
              <col />
              <col style={{ width: 150 }} />
            </colgroup>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell padding="checkbox"><input type="checkbox" /></TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>N° Mouv.</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Emplacement</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Bénéficiaire</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Nature</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Montant</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Mode Paiement</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Compte Banque</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Commentaire</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Édition</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredMouvements.length === 0 ? (
                <TableRow><TableCell colSpan={11} align="center" sx={{ py: 4 }}><Typography color="textSecondary">Aucun mouvement trouvé</Typography></TableCell></TableRow>
              ) : filteredMouvements.map((mouvement) => {
                const isEntree = mouvement.type === 'entree';
                const reference = mouvement.reference || `MVT-${mouvement.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
                const beneficiaire = mouvement.beneficiaire || (mouvement.libelle?.split(' - ')[1] || (isEntree ? 'Client' : 'CAISSE'));
                const nature = mouvement.nature || mouvement.categorie || (isEntree ? 'Entrée' : 'Sortie');
                const compte = mouvement.compteBanque || 'CAISSE INTERNE';
                const commentaire = mouvement.commentaire || mouvement.libelle || `${nature} — ${isEntree ? 'Encaissement' : 'Dépense'}`;
                const dt = mouvement.date ? new Date(mouvement.date) : null;
                const dateEdition = dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('fr-FR') : '—';
                const heureEdition = dt && !isNaN(dt.getTime()) ? dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <TableRow key={mouvement.id} hover>
                    <TableCell padding="checkbox"><input type="checkbox" /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: '#1565c0', fontWeight: 600 }}>{reference}</TableCell>
                    <TableCell>{getMagasinLabel(magasinId || '')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{beneficiaire}</TableCell>
                    <TableCell>
                      <Chip label={isEntree ? 'Entrée' : 'Sortie'} color={isEntree ? 'success' : 'error'} size="small" />
                    </TableCell>
                    <TableCell>{nature}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: isEntree ? '#16a34a' : '#dc2626', textAlign: 'right', whiteSpace: 'nowrap !important' }}>
                      {isEntree ? '+' : '-'}{(Number(mouvement.montant) || 0).toLocaleString('fr-FR')}
                    </TableCell>
                    <TableCell>{mouvement.modePaiement || 'Espèces'}</TableCell>
                    <TableCell>{compte}</TableCell>
                    <TableCell>{commentaire}</TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ lineHeight: 1.3, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{dateEdition}{heureEdition ? ` ${heureEdition}` : ''}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{nomResponsable(mouvement.responsable, '—')}</div>
                        </div>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => imprimerMouvement(mouvement)}
                          title={mouvement.source ? 'Reçu du règlement (PDF)' : 'Imprimer'}
                          sx={{ bgcolor: '#0f7894', minWidth: 0, px: 0.75, py: 0.25, flexShrink: 0 }}
                        >
                          <Print sx={{ fontSize: 16 }} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* Cartes — mobile : reprend toutes les informations du tableau */}
      <div className="md:hidden">
        {filteredMouvements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af', fontSize: 14 }}>Aucun mouvement trouvé</div>
        ) : filteredMouvements.map((mouvement) => {
          const isEntree = mouvement.type === 'entree';
          const reference = mouvement.reference || `MVT-${mouvement.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
          const beneficiaire = mouvement.beneficiaire || (mouvement.libelle?.split(' - ')[1] || (isEntree ? 'Client' : 'CAISSE'));
          const nature = mouvement.nature || mouvement.categorie || (isEntree ? 'Entrée' : 'Sortie');
          const compte = mouvement.compteBanque || 'CAISSE INTERNE';
          const commentaire = mouvement.commentaire || mouvement.libelle || `${nature} — ${isEntree ? 'Encaissement' : 'Dépense'}`;
          return (
            <div key={mouvement.id} style={{ border: `1px solid ${isEntree ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, marginBottom: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, padding: '10px 14px', backgroundColor: isEntree ? '#f0fdf4' : '#fff5f5' }}>
                <span style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace' }}>{reference}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: isEntree ? '#16a34a' : '#dc2626', color: '#fff' }}>{isEntree ? 'Entrée' : 'Sortie'}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: isEntree ? '#16a34a' : '#dc2626' }}>{isEntree ? '+' : '-'}{(Number(mouvement.montant) || 0).toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>
              <div style={{ padding: '10px 14px', display: 'grid', gap: 5, fontSize: 12 }}>
                <div><strong>Bénéficiaire :</strong> {beneficiaire}</div>
                <div><strong>Emplacement :</strong> {getMagasinLabel(magasinId || '')}</div>
                <div><strong>Nature :</strong> {nature}</div>
                <div><strong>Mode de Paiement :</strong> {mouvement.modePaiement || 'Espèces'}</div>
                <div><strong>Compte Banque :</strong> {compte}</div>
                <div style={{ overflowWrap: 'anywhere' }}><strong>Commentaire :</strong> {commentaire}</div>
                <div><strong>Date :</strong> {new Date(mouvement.date).toLocaleDateString('fr-FR')} {new Date(mouvement.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div><strong>Responsable :</strong> {nomResponsable(mouvement.responsable)}</div>
                <Button size="small" variant="contained" startIcon={<Print />} onClick={() => imprimerMouvement(mouvement)} sx={{ bgcolor: '#0f7894', textTransform: 'none', width: 'fit-content', mt: 0.5 }}>{mouvement.source ? 'Reçu PDF' : 'PDF'}</Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialog Création */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouveau Mouvement de Caisse</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              select
              label="Type de Mouvement"
              value={formType}
              onChange={(e) => {
                setFormType(e.target.value as 'entree' | 'sortie');
                setFormCategorie('');
              }}
              fullWidth
              required
            >
              <MenuItem value="entree">Entrée</MenuItem>
              <MenuItem value="sortie">Sortie</MenuItem>
            </TextField>

            <TextField
              select
              label="Catégorie"
              value={formCategorie}
              onChange={(e) => setFormCategorie(e.target.value)}
              fullWidth
              required
            >
              {(formType === 'entree' ? categoriesEntree : categoriesSortie).map(cat => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </TextField>

            <TextField
              label="Montant (FCFA)"
              type="number"
              value={formMontant}
              onChange={(e) => setFormMontant(e.target.value)}
              fullWidth
              required
              inputProps={{ min: 0, step: 0.01 }}
            />

            <TextField
              label="Libellé"
              value={formLibelle}
              onChange={(e) => setFormLibelle(e.target.value)}
              fullWidth
              required
              multiline
              rows={2}
            />

            <TextField
              select
              label="Mode de Paiement"
              value={formModePaiement}
              onChange={(e) => setFormModePaiement(e.target.value)}
              fullWidth
            >
              <MenuItem value="Espèces">Espèces</MenuItem>
              <MenuItem value="Chèque">Chèque</MenuItem>
              <MenuItem value="Carte bancaire">Carte bancaire</MenuItem>
              <MenuItem value="Virement">Virement</MenuItem>
              <MenuItem value="Mobile Money">Mobile Money</MenuItem>
            </TextField>

            <TextField
              label="Référence (optionnel)"
              value={formReference}
              onChange={(e) => setFormReference(e.target.value)}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleCreateMouvement}
            sx={{ bgcolor: formType === 'entree' ? '#4caf50' : '#f44336' }}
          >
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
