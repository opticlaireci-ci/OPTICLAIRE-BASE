import { logger } from '../../../utils/logger';
import { useState } from 'react';
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
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import { enregistrerRetour, loadStockMagasin } from '../../../services/inventaireService';
import { upsertBon, retourToRow } from '../../../services/bonsService';
import { useLiveData } from '../../../hooks/useLiveData';
import { getCurrentUser, resolveUserName, formatDate } from '../../../utils/auditUtils';

const BON_RETOUR_KEY = 'leclaire_db_bon-retour';

interface BonRetour {
  id: string;
  numero: string;
  date: string;
  magasin: string;
  responsable: string;
  items: { designation: string; quantite: number; motif: string }[];
  statut: string;
  observations?: string;
  validePar?: string;
  dateValidation?: string;
  motifRejet?: string;
  createdAt?: string;
  traitePar?: string;
  dateTraitement?: string;
}

interface ProduitStock {
  id: string;
  designation: string;
  quantiteDisponible: number;
  prixVente: number;
}

interface ItemRetour {
  produitId: string;
  designation: string;
  quantiteDisponible: number;
  quantite: number;
  prixVente: number;
  motif: string;
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

export function BonRetourMagasinPage() {
  const { magasinId } = useParams();
  const [allBons, setAllBons] = useLiveData<BonRetour>(BON_RETOUR_KEY, []);
  const [selectedBon, setSelectedBon] = useState<BonRetour | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [observations, setObservations] = useState('');

  // États pour la création
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [stockDisponible, setStockDisponible] = useState<ProduitStock[]>([]);
  const [reference, setReference] = useState('');
  const [itemsRetour, setItemsRetour] = useState<ItemRetour[]>([]);

  // Filtrer les bons de ce magasin
  const bons = magasinId
    ? allBons.filter((bon) => bon.magasin?.toUpperCase() === magasinId.toUpperCase())
    : [];

  const handleValider = async () => {
    if (!selectedBon) return;

    const updatedBons = allBons.map((bon) => {
      if (bon.id === selectedBon.id) {
        return {
          ...bon,
          statut: 'Traité',
          observations,
          dateTraitement: new Date().toISOString(),
          traitePar: getCurrentUser(),
        };
      }
      return bon;
    });

    setAllBons(updatedBons);
    const changed = updatedBons.find((b) => b.id === selectedBon.id);
    if (changed) upsertBon(retourToRow(changed)).catch(e => logger.error('❌ upsertBon retour:', e));

    // Enregistrer le retour dans l'inventaire
    if (selectedBon.items && magasinId) {
      const items = selectedBon.items.map(item => ({
        id: item.designation,
        type: 'monture' as const,
        designation: item.designation,
        quantite: item.quantite,
        prixVente: 0, // Prix non disponible dans les retours
      }));

      await enregistrerRetour({
        magasinId: magasinId.toUpperCase(),
        bonReference: selectedBon.numero,
        items,
      });

      logger.log(`✅ Retour enregistré: ${items.length} produits retirés du magasin ${magasinId}`);
    }

    window.dispatchEvent(new CustomEvent('leclaire-sync-update'));

    setShowValidationDialog(false);
    setShowDetailDialog(false);
    setSelectedBon(null);
    setObservations('');
  };

  const getStatutColor = (statut: string) => {
    switch (statut?.toLowerCase()) {
      case 'validé':
        return 'success';
      case 'traité':
        return 'success';
      case 'rejeté':
        return 'error';
      case 'en attente':
      default:
        return 'warning';
    }
  };

  const bonsEnAttente = bons.filter(b => b.statut === 'En attente' || !b.statut);
  const bonsValides = bons.filter(b => b.statut === 'Validé');
  const bonsRejetes = bons.filter(b => b.statut === 'Rejeté');
  const bonsTraites = bons.filter(b => b.statut === 'Traité');

  const handleOpenCreateDialog = async () => {
    if (!magasinId) return;

    // Charger le stock disponible du magasin
    const stock = await loadStockMagasin(magasinId.toUpperCase());
    const produitsDisponibles: ProduitStock[] = stock
      .filter(s => s.quantiteDisponible > 0)
      .map(s => ({
        id: s.produitId,
        designation: s.designation,
        quantiteDisponible: s.quantiteDisponible,
        prixVente: s.prixVente,
      }));

    setStockDisponible(produitsDisponibles);
    setReference(`RET-${Date.now()}`);
    setItemsRetour([]);
    setShowCreateDialog(true);
  };

  const handleAddItem = (produitId: string) => {
    const produit = stockDisponible.find(p => p.id === produitId);
    if (!produit) return;

    // Vérifier si déjà ajouté
    if (itemsRetour.find(i => i.produitId === produitId)) {
      alert('Ce produit est déjà dans la liste');
      return;
    }

    setItemsRetour([...itemsRetour, {
      produitId: produit.id,
      designation: produit.designation,
      quantiteDisponible: produit.quantiteDisponible,
      quantite: 1,
      prixVente: produit.prixVente,
      motif: '',
    }]);
  };

  const handleRemoveItem = (produitId: string) => {
    setItemsRetour(itemsRetour.filter(i => i.produitId !== produitId));
  };

  const handleUpdateQuantite = (produitId: string, quantite: number) => {
    setItemsRetour(itemsRetour.map(i =>
      i.produitId === produitId ? { ...i, quantite: Math.max(1, Math.min(quantite, i.quantiteDisponible)) } : i
    ));
  };

  const handleUpdateMotif = (produitId: string, motif: string) => {
    setItemsRetour(itemsRetour.map(i =>
      i.produitId === produitId ? { ...i, motif } : i
    ));
  };

  const handleCreateRetour = () => {
    if (itemsRetour.length === 0) {
      alert('Veuillez ajouter au moins un produit');
      return;
    }

    // Vérifier que tous les produits ont un motif
    const itemsSansMotif = itemsRetour.filter(i => !i.motif.trim());
    if (itemsSansMotif.length > 0) {
      alert('Veuillez renseigner le motif pour tous les produits');
      return;
    }

    if (!magasinId) return;

    // Créer le bon de retour
    const newBon: BonRetour = {
      id: Date.now().toString(),
      numero: reference,
      date: new Date().toISOString(),
      magasin: magasinId.toUpperCase(),
      responsable: getCurrentUser(),
      items: itemsRetour.map(item => ({
        designation: item.designation,
        quantite: item.quantite,
        motif: item.motif,
      })),
      statut: 'En attente',
      createdAt: new Date().toISOString(),
    };

    // Sauvegarder dans Firestore (partagé entre navigateurs)
    setAllBons([...allBons, newBon]);
    upsertBon(retourToRow(newBon)).catch(e => logger.error('❌ upsertBon retour:', e));

    window.dispatchEvent(new CustomEvent('leclaire-sync-update'));

    alert(`Bon de retour créé avec succès !\n${itemsRetour.length} produit(s) à retourner`);
    setShowCreateDialog(false);
  };

  return (
    <Box className="admin-stock-list-page" sx={{ p: { xs: 2, md: 3 } }}>
      {/* En-tête */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography
          variant="h4"
          style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)' }}
        >
          Bons de Retour - {getMagasinLabel(magasinId || '')}
        </Typography>
        <Button
          variant="contained"
          color="error"
          onClick={handleOpenCreateDialog}
        >
          + Créer un Retour
        </Button>
      </Box>

      {/* Statistiques */}
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Paper sx={{ p: 2, bgcolor: '#f59e0b', color: 'white' }}>
          <Typography variant="h4">{bonsEnAttente.length}</Typography>
          <Typography variant="body2">En Attente de Validation</Typography>
        </Paper>
        <Paper sx={{ p: 2, bgcolor: '#10b981', color: 'white' }}>
          <Typography variant="h4">{bonsValides.length}</Typography>
          <Typography variant="body2">Validés</Typography>
        </Paper>
        <Paper sx={{ p: 2, bgcolor: '#ef4444', color: 'white' }}>
          <Typography variant="h4">{bonsRejetes.length}</Typography>
          <Typography variant="body2">Rejetés</Typography>
        </Paper>
        <Paper sx={{ p: 2, bgcolor: '#4caf50', color: 'white' }}>
          <Typography variant="h4">{bonsTraites.length}</Typography>
          <Typography variant="body2">Traités</Typography>
        </Paper>
      </Box>

      

      {/* Tableau de gestion */}
      <div className="admin-stock-table-wrap">
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Numéro</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Responsable</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Articles</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Statut</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Traçabilité</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">
                      Aucun bon de retour pour ce magasin
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                bons.map((bon, index) => (
                  <TableRow key={bon.id} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{bon.numero || '-'}</TableCell>
                    <TableCell>
                      {bon.date ? new Date(bon.date).toLocaleDateString('fr-FR') : '-'}
                    </TableCell>
                    <TableCell>{bon.responsable || '-'}</TableCell>
                    <TableCell>{bon.items?.length || 0} article(s)</TableCell>
                    <TableCell>
                      <Chip
                        label={bon.statut || 'En attente'}
                        color={getStatutColor(bon.statut)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                      <div><strong>Créé:</strong> {resolveUserName(bon.responsable)}</div>
                      <div style={{ color: '#888' }}>{formatDate(bon.createdAt || bon.date)}</div>
                      {bon.statut === 'Traité' ? (
                        <div style={{ marginTop: 4, color: '#2e7d32' }}>
                          <strong>Traité:</strong> {resolveUserName(bon.traitePar)}
                          <div style={{ color: '#888' }}>{formatDate(bon.dateTraitement)}</div>
                        </div>
                      ) : bon.validePar ? (
                        <div style={{ marginTop: 4, color: bon.statut === 'Rejeté' ? '#c62828' : '#2e7d32' }}>
                          <strong>{bon.statut === 'Rejeté' ? 'Rejeté:' : 'Validé:'}</strong> {resolveUserName(bon.validePar)}
                          <div style={{ color: '#888' }}>{formatDate(bon.dateValidation)}</div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 4, color: '#ed6c02' }}>En attente de confirmation</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => {
                          setSelectedBon(bon);
                          setShowDetailDialog(true);
                        }}
                      >
                        <VisibilityIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* Dialog Détails */}
      <Dialog open={showDetailDialog} onClose={() => setShowDetailDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Détails du Bon de Retour</DialogTitle>
        <DialogContent>
          {selectedBon && (
            <Box>
              <Box sx={{ mb: 3 }}>
                <Typography><strong>Numéro:</strong> {selectedBon.numero}</Typography>
                <Typography><strong>Date:</strong> {new Date(selectedBon.date).toLocaleDateString('fr-FR')}</Typography>
                <Typography><strong>Magasin:</strong> {getMagasinLabel(selectedBon.magasin)}</Typography>
                <Typography><strong>Enregistré par:</strong> {resolveUserName(selectedBon.responsable)} le {formatDate(selectedBon.createdAt || selectedBon.date)}</Typography>
                <Typography><strong>Statut:</strong> <Chip label={selectedBon.statut || 'En attente'} color={getStatutColor(selectedBon.statut)} size="small" /></Typography>
                {selectedBon.statut === 'Traité' && (
                  <Typography><strong>Traité par:</strong> {resolveUserName(selectedBon.traitePar)} le {formatDate(selectedBon.dateTraitement)}</Typography>
                )}

                {selectedBon.validePar && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: '#f0fdf4', borderRadius: 1, border: '1px solid #bbf7d0' }}>
                    <Typography sx={{ color: '#166534', fontWeight: 'bold' }}>✓ Validé par le directeur</Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: '#15803d' }}>
                      <strong>Directeur:</strong> {resolveUserName(selectedBon.validePar)}
                    </Typography>
                    {selectedBon.dateValidation && (
                      <Typography sx={{ fontSize: '0.875rem', color: '#15803d' }}>
                        <strong>Date:</strong> {new Date(selectedBon.dateValidation).toLocaleDateString('fr-FR')}
                      </Typography>
                    )}
                  </Box>
                )}

                {selectedBon.motifRejet && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: '#fef2f2', borderRadius: 1, border: '1px solid #fecaca' }}>
                    <Typography sx={{ color: '#991b1b', fontWeight: 'bold' }}>✗ Rejeté par le directeur</Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: '#991b1b' }}>
                      <strong>Directeur:</strong> {resolveUserName(selectedBon.validePar)}
                    </Typography>
                    {selectedBon.dateValidation && (
                      <Typography sx={{ fontSize: '0.875rem', color: '#991b1b' }}>
                        <strong>Date:</strong> {new Date(selectedBon.dateValidation).toLocaleDateString('fr-FR')}
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: '0.875rem', color: '#991b1b', mt: 1 }}>
                      <strong>Motif:</strong> {selectedBon.motifRejet}
                    </Typography>
                  </Box>
                )}

                {selectedBon.observations && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: '#eff6ff', borderRadius: 1, border: '1px solid #bfdbfe' }}>
                    <Typography sx={{ fontSize: '0.875rem', color: '#1e40af' }}>
                      <strong>Observations du directeur:</strong> {selectedBon.observations}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Typography variant="h6" sx={{ mb: 2 }}>Articles</Typography>
              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell><strong>Désignation</strong></TableCell>
                      <TableCell><strong>Quantité</strong></TableCell>
                      <TableCell><strong>Motif</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedBon.items?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.designation}</TableCell>
                        <TableCell>{item.quantite}</TableCell>
                        <TableCell>{item.motif || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDetailDialog(false)}>Fermer</Button>
          {selectedBon && selectedBon.statut === 'Validé' && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => setShowValidationDialog(true)}
            >
              Traiter le Retour
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog Création */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Créer un Bon de Retour</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              label="Référence"
              fullWidth
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              sx={{ mb: 3 }}
            />

            <Typography variant="h6" sx={{ mb: 2 }}>Produits à retourner</Typography>

            {stockDisponible.length === 0 ? (
              <Typography color="textSecondary" sx={{ mb: 2 }}>
                Aucun produit en stock dans ce magasin
              </Typography>
            ) : (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Ajouter un produit</InputLabel>
                <Select
                  value=""
                  onChange={(e) => handleAddItem(e.target.value)}
                  label="Ajouter un produit"
                >
                  {stockDisponible
                    .filter(p => !itemsRetour.find(i => i.produitId === p.id))
                    .map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.designation} (Stock: {p.quantiteDisponible})
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}

            {itemsRetour.length > 0 && (
              <TableContainer component={Paper} sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell><strong>Produit</strong></TableCell>
                      <TableCell><strong>Stock Dispo</strong></TableCell>
                      <TableCell><strong>Quantité</strong></TableCell>
                      <TableCell><strong>Motif</strong></TableCell>
                      <TableCell><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {itemsRetour.map(item => (
                      <TableRow key={item.produitId}>
                        <TableCell>{item.designation}</TableCell>
                        <TableCell>{item.quantiteDisponible}</TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            size="small"
                            value={item.quantite}
                            onChange={(e) => handleUpdateQuantite(item.produitId, parseInt(e.target.value) || 1)}
                            inputProps={{ min: 1, max: item.quantiteDisponible }}
                            sx={{ width: 80 }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            value={item.motif}
                            onChange={(e) => handleUpdateMotif(item.produitId, e.target.value)}
                            placeholder="Défaut, Casse, etc."
                            sx={{ minWidth: 150 }}
                          />
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => handleRemoveItem(item.produitId)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Annuler</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCreateRetour}
            disabled={itemsRetour.length === 0}
          >
            Créer le Retour
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Validation */}
      <Dialog open={showValidationDialog} onClose={() => setShowValidationDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Traiter le bon de retour</DialogTitle>
        <DialogContent>
          <TextField
            label="Observations (optionnel)"
            multiline
            rows={4}
            fullWidth
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowValidationDialog(false)}>Annuler</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleValider}
          >
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
