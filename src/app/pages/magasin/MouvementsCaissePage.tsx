import { useState, useEffect } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { canAdd } from '../../utils/actionRights';
const GridAny = Grid as any;

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
      if (montantPaye > 0) {
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
          reference: numFacture,
          responsable: vente.edite_par || 'N/A',
        });
      }
    });
    return derivees;
  };
  // Affichage INSTANTANÉ depuis le cache des ventes.
  const [ventesDerivees, setVentesDerivees] = useState<MouvementCaisse[]>(
    () => deriveFromVentes(readVentesCache(magasinId || ''), magasinId || ''),
  );
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
        if (!annule) setVentesDerivees(deriveFromVentes(ventes, magasinId));
      }).catch(() => {});
    };
    load();
    // Rafraîchissement AUTOMATIQUE : périodique + événements.
    const interval = setInterval(load, 10000);
    const onUpdate = () => load();
    window.addEventListener('ventes-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      annule = true;
      clearInterval(interval);
      window.removeEventListener('ventes-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [magasinId]);

  // Agrégation ventes dérivées + mouvements personnalisés du magasin
  useEffect(() => {
    if (!magasinId) return;
    const allMouvements: MouvementCaisse[] = [...ventesDerivees];

    const mouvementsMagasin = mouvementsPersonnalises.filter(
      (m: MouvementCaisse) => m.magasinId === magasinId
    );
    allMouvements.push(...mouvementsMagasin);

    // Trier par date décroissante
    allMouvements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setMouvements(allMouvements);
  }, [magasinId, ventesDerivees, mouvementsPersonnalises]);

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
      reference: formReference,
      responsable: localStorage.getItem('leclaire_current_user') || 'Utilisateur',
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
      'Responsable': m.responsable,
    }));

    const headers = ['Date', 'Type', 'Catégorie', 'Libellé', 'Montant', 'Mode de Paiement', 'Référence', 'Responsable'];
    const aoa = [...excelHeaderRows(magasinId || ''), headers, ...data.map((row: any) => headers.map(h => row[h]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mouvements Caisse');
    XLSX.writeFile(wb, `Mouvements_Caisse_${getMagasinLabel(magasinId || '')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  const categoriesEntree = ['Vente', 'Règlement client', 'Remboursement', 'Autre'];
  const categoriesSortie = ['Achat fournitures', 'Frais généraux', 'Salaire', 'Loyer', 'Électricité', 'Eau', 'Téléphone/Internet', 'Transport', 'Autre'];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
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

      {/* Tableau */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Catégorie</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Libellé</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Montant</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Mode de Paiement</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Référence</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Responsable</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMouvements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="textSecondary">
                    Aucun mouvement trouvé
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredMouvements.map((mouvement) => (
                <TableRow key={mouvement.id} hover>
                  <TableCell>
                    {new Date(mouvement.date).toLocaleDateString('fr-FR')}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={mouvement.type === 'entree' ? 'Entrée' : 'Sortie'}
                      color={mouvement.type === 'entree' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{mouvement.categorie}</TableCell>
                  <TableCell>{mouvement.libelle}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: mouvement.type === 'entree' ? '#4caf50' : '#f44336' }}>
                    {mouvement.type === 'entree' ? '+' : '-'}{mouvement.montant.toLocaleString('fr-FR')} FCFA
                  </TableCell>
                  <TableCell>{mouvement.modePaiement}</TableCell>
                  <TableCell>{mouvement.reference || '-'}</TableCell>
                  <TableCell>{mouvement.responsable}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
