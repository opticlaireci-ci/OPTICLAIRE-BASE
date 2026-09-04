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
import CancelIcon from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { enregistrerTransfert, loadStockMagasin } from '../../../services/inventaireService';
import { upsertBon, transfertToRow } from '../../../services/bonsService';
import { getMagasins } from '../../../constants/magasins';
import { useLiveData } from '../../../hooks/useLiveData';
import { getCurrentUser, resolveUserName, formatDate } from '../../../utils/auditUtils';

const BON_TRANSFERT_KEY = 'leclaire_db_bon-transfert';

interface BonTransfert {
  id: string;
  numero: string;
  date: string;
  magasinSource: string;
  magasinDest: string;
  responsable: string;
  items: { designation: string; quantite: number; prixUnit: number }[];
  statut: string;
  observations?: string;
  createdAt?: string;
  valideePar?: string;
  dateValidation?: string;
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

interface ProduitStock {
  id: string;
  designation: string;
  quantiteDisponible: number;
  prixVente: number;
}

interface ItemTransfert {
  produitId: string;
  designation: string;
  quantiteDisponible: number;
  quantite: number;
  prixVente: number;
}

export function BonTransfertMagasinPage() {
  const { magasinId } = useParams();
  const [allBons, setAllBons] = useLiveData<BonTransfert>(BON_TRANSFERT_KEY, []);
  const [selectedBon, setSelectedBon] = useState<BonTransfert | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationAction, setValidationAction] = useState<'accepter' | 'refuser'>('accepter');
  const [observations, setObservations] = useState('');

  // États pour la création
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [stockDisponible, setStockDisponible] = useState<ProduitStock[]>([]);
  const [magasinDestination, setMagasinDestination] = useState('');
  const [reference, setReference] = useState('');
  const [itemsTransfert, setItemsTransfert] = useState<ItemTransfert[]>([]);

  // Filtrer les bons destinés à ce magasin OU provenant de ce magasin
  const bons = magasinId
    ? allBons.filter((bon) =>
        bon.magasinDest?.toUpperCase() === magasinId.toUpperCase() ||
        bon.magasinSource?.toUpperCase() === magasinId.toUpperCase()
      )
    : [];

  const handleValider = async (action: 'accepter' | 'refuser') => {
    if (!selectedBon) return;

    const updatedBons = allBons.map((bon) => {
      if (bon.id === selectedBon.id) {
        return {
          ...bon,
          statut: action === 'accepter' ? 'Validé' : 'Refusé',
          observations,
          dateValidation: new Date().toISOString(),
          valideePar: getCurrentUser(),
        };
      }
      return bon;
    });

    setAllBons(updatedBons);
    const changed = updatedBons.find((b) => b.id === selectedBon.id);
    if (changed) upsertBon(transfertToRow(changed)).catch(e => logger.error('❌ upsertBon transfert:', e));

    // Si le bon est accepté, enregistrer le transfert dans l'inventaire
    if (action === 'accepter' && selectedBon.items && selectedBon.magasinSource && selectedBon.magasinDest) {
      const items = selectedBon.items.map(item => ({
        id: item.designation, // Utiliser designation comme ID
        type: 'monture' as const, // Supposer que ce sont des montures
        designation: item.designation,
        quantite: item.quantite,
        prixVente: item.prixUnit,
      }));

      await enregistrerTransfert({
        magasinSource: selectedBon.magasinSource.toUpperCase(),
        magasinDestination: selectedBon.magasinDest.toUpperCase(),
        bonReference: selectedBon.numero,
        items,
      });

      logger.log(`✅ Transfert enregistré: ${items.length} produits de ${selectedBon.magasinSource} vers ${selectedBon.magasinDest}`);
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
      case 'refusé':
        return 'error';
      case 'en attente':
      default:
        return 'warning';
    }
  };

  const bonsEnAttente = bons.filter(b => b.statut === 'En attente' || !b.statut);
  const bonsValides = bons.filter(b => b.statut === 'Validé');
  const bonsRefuses = bons.filter(b => b.statut === 'Refusé');

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
    setMagasinDestination('');
    setReference(`TR-${Date.now()}`);
    setItemsTransfert([]);
    setShowCreateDialog(true);
  };

  const handleAddItem = (produitId: string) => {
    const produit = stockDisponible.find(p => p.id === produitId);
    if (!produit) return;

    // Vérifier si déjà ajouté
    if (itemsTransfert.find(i => i.produitId === produitId)) {
      alert('Ce produit est déjà dans la liste');
      return;
    }

    setItemsTransfert([...itemsTransfert, {
      produitId: produit.id,
      designation: produit.designation,
      quantiteDisponible: produit.quantiteDisponible,
      quantite: 1,
      prixVente: produit.prixVente,
    }]);
  };

  const handleRemoveItem = (produitId: string) => {
    setItemsTransfert(itemsTransfert.filter(i => i.produitId !== produitId));
  };

  const handleUpdateQuantite = (produitId: string, quantite: number) => {
    setItemsTransfert(itemsTransfert.map(i =>
      i.produitId === produitId ? { ...i, quantite: Math.max(1, Math.min(quantite, i.quantiteDisponible)) } : i
    ));
  };

  const handleCreateTransfert = () => {
    if (!magasinDestination) {
      alert('Veuillez sélectionner un magasin de destination');
      return;
    }

    if (itemsTransfert.length === 0) {
      alert('Veuillez ajouter au moins un produit');
      return;
    }

    if (!magasinId) return;

    // Créer le bon de transfert
    const newBon: BonTransfert = {
      id: Date.now().toString(),
      numero: reference,
      date: new Date().toISOString(),
      magasinSource: magasinId.toUpperCase(),
      magasinDest: magasinDestination,
      responsable: getCurrentUser(),
      items: itemsTransfert.map(item => ({
        designation: item.designation,
        quantite: item.quantite,
        prixUnit: item.prixVente,
      })),
      statut: 'En attente',
      createdAt: new Date().toISOString(),
    };

    // Sauvegarder dans Firestore (partagé entre navigateurs)
    setAllBons([...allBons, newBon]);
    upsertBon(transfertToRow(newBon)).catch(e => logger.error('❌ upsertBon transfert:', e));

    window.dispatchEvent(new CustomEvent('leclaire-sync-update'));

    alert(`Bon de transfert créé avec succès !\n${itemsTransfert.length} produit(s) vers ${getMagasinLabel(magasinDestination)}`);
    setShowCreateDialog(false);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
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
          Bons de Transfert - {getMagasinLabel(magasinId || '')}
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={handleOpenCreateDialog}
        >
          + Créer un Transfert
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
        <Paper sx={{ p: 2, bgcolor: '#0ea5e9', color: 'white' }}>
          <Typography variant="h4">{bonsEnAttente.length}</Typography>
          <Typography variant="body2">En Attente</Typography>
        </Paper>
        <Paper sx={{ p: 2, bgcolor: '#4caf50', color: 'white' }}>
          <Typography variant="h4">{bonsValides.length}</Typography>
          <Typography variant="body2">Validés</Typography>
        </Paper>
        <Paper sx={{ p: 2, bgcolor: '#f44336', color: 'white' }}>
          <Typography variant="h4">{bonsRefuses.length}</Typography>
          <Typography variant="body2">Refusés</Typography>
        </Paper>
      </Box>

      {/* Mobile cards — visible uniquement sur petits écrans */}
      <div className="stock-mobile-legacy-hidden" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {bons.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px',
              color: '#666',
              backgroundColor: '#fff',
              borderRadius: '8px',
              border: '1px solid #e0e0e0',
            }}
          >
            Aucun bon de transfert pour ce magasin
          </div>
        ) : (
          bons.map((bon) => {
            const statutBg =
              bon.statut?.toLowerCase() === 'validé' ? '#4caf50' :
              bon.statut?.toLowerCase() === 'refusé' ? '#f44336' :
              '#ff9800';
            const totalValeur = bon.items?.reduce((s, i) => s + (i.prixUnit || 0) * i.quantite, 0) || 0;
            return (
              <div
                key={bon.id}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                {/* En-tête de carte */}
                <div
                  style={{
                    backgroundColor: statutBg,
                    color: '#fff',
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {bon.numero || '-'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                      {bon.date ? new Date(bon.date).toLocaleDateString('fr-FR') : '-'}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {bon.statut || 'En attente'}
                    </span>
                  </div>
                </div>

                {/* Corps */}
                <div style={{ padding: '12px' }}>
                  {/* Trajet magasin */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '8px',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                      }}
                    >
                      {getMagasinLabel(bon.magasinSource)}
                    </span>
                    <span style={{ color: '#999', fontSize: '0.8rem' }}>→</span>
                    <span
                      style={{
                        backgroundColor: '#e8f5e9',
                        color: '#2e7d32',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                      }}
                    >
                      {getMagasinLabel(bon.magasinDest)}
                    </span>
                  </div>

                  {/* Responsable */}
                  <div style={{ fontSize: '0.78rem', color: '#666', marginBottom: '8px' }}>
                    <strong>Responsable:</strong> {bon.responsable || '-'}
                  </div>

                  {/* Articles */}
                  {bon.items && bon.items.length > 0 && (
                    <div
                      style={{
                        backgroundColor: '#f9f9f9',
                        borderRadius: '4px',
                        padding: '8px',
                        marginBottom: '8px',
                        fontSize: '0.78rem',
                      }}
                    >
                      {bon.items.slice(0, 3).map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingBottom: idx < Math.min(bon.items.length, 3) - 1 ? '4px' : 0,
                          }}
                        >
                          <span style={{ color: '#333' }}>{item.designation}</span>
                          <span style={{ color: '#666', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                            ×{item.quantite}
                          </span>
                        </div>
                      ))}
                      {bon.items.length > 3 && (
                        <div style={{ color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                          +{bon.items.length - 3} autre(s) article(s)
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pied : total + action */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '8px',
                      borderTop: '1px solid #f0f0f0',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#666' }}>
                        {bon.items?.length || 0} article(s)
                      </span>
                      {totalValeur > 0 && (
                        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#1976d2', marginLeft: '8px' }}>
                          {totalValeur.toLocaleString('fr-FR')} FCFA
                        </span>
                      )}
                    </div>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => {
                        setSelectedBon(bon);
                        setShowDetailDialog(true);
                      }}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tableau desktop — masqué sur petits écrans */}
      <div className="admin-stock-table-wrap">
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Numéro</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>De</TableCell>
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
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">
                      Aucun bon de transfert pour ce magasin
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
                    <TableCell>{getMagasinLabel(bon.magasinSource)}</TableCell>
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
                      {(bon.statut === 'Validé' || bon.statut === 'Refusé') ? (
                        <div style={{ marginTop: 4, color: bon.statut === 'Validé' ? '#2e7d32' : '#c62828' }}>
                          <strong>{bon.statut === 'Validé' ? 'Confirmé:' : 'Refusé:'}</strong> {resolveUserName(bon.valideePar)}
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
        <DialogTitle>Détails du Bon de Transfert</DialogTitle>
        <DialogContent>
          {selectedBon && (
            <Box>
              <Box sx={{ mb: 3 }}>
                <Typography><strong>Numéro:</strong> {selectedBon.numero}</Typography>
                <Typography><strong>Date:</strong> {new Date(selectedBon.date).toLocaleDateString('fr-FR')}</Typography>
                <Typography><strong>De:</strong> {getMagasinLabel(selectedBon.magasinSource)}</Typography>
                <Typography><strong>Vers:</strong> {getMagasinLabel(selectedBon.magasinDest)}</Typography>
                <Typography><strong>Enregistré par:</strong> {resolveUserName(selectedBon.responsable)} le {formatDate(selectedBon.createdAt || selectedBon.date)}</Typography>
                <Typography><strong>Statut:</strong> <Chip label={selectedBon.statut || 'En attente'} color={getStatutColor(selectedBon.statut)} size="small" /></Typography>
                {(selectedBon.statut === 'Validé' || selectedBon.statut === 'Refusé') && (
                  <Typography><strong>{selectedBon.statut === 'Validé' ? 'Confirmé par:' : 'Refusé par:'}</strong> {resolveUserName(selectedBon.valideePar)} le {formatDate(selectedBon.dateValidation)}</Typography>
                )}
                {selectedBon.observations && (
                  <Typography><strong>Observations:</strong> {selectedBon.observations}</Typography>
                )}
              </Box>

              <Typography variant="h6" sx={{ mb: 2 }}>Articles</Typography>
              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell><strong>Désignation</strong></TableCell>
                      <TableCell><strong>Quantité</strong></TableCell>
                      <TableCell><strong>Prix Unit.</strong></TableCell>
                      <TableCell><strong>Total</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedBon.items?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.designation}</TableCell>
                        <TableCell>{item.quantite}</TableCell>
                        <TableCell>{(item.prixUnit || 0).toLocaleString('fr-FR')} FCFA</TableCell>
                        <TableCell>{((item.prixUnit || 0) * item.quantite).toLocaleString('fr-FR')} FCFA</TableCell>
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
          {selectedBon && (selectedBon.statut === 'En attente' || !selectedBon.statut) && (
            <>
              <Button
                variant="contained"
                color="error"
                startIcon={<CancelIcon />}
                onClick={() => {
                  setValidationAction('refuser');
                  setShowValidationDialog(true);
                }}
              >
                Refuser
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
                onClick={() => {
                  setValidationAction('accepter');
                  setShowValidationDialog(true);
                }}
              >
                Accepter
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog Création */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Créer un Bon de Transfert</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Magasin de Destination</InputLabel>
              <Select
                value={magasinDestination}
                onChange={(e) => setMagasinDestination(e.target.value)}
                label="Magasin de Destination"
              >
                {getMagasins()
                  .filter(m => m.id !== magasinId?.toUpperCase())
                  .map(m => (
                    <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
                  ))}
              </Select>
            </FormControl>

            <TextField
              label="Référence"
              fullWidth
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              sx={{ mb: 3 }}
            />

            <Typography variant="h6" sx={{ mb: 2 }}>Produits à transférer</Typography>

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
                    .filter(p => !itemsTransfert.find(i => i.produitId === p.id))
                    .map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.designation} (Stock: {p.quantiteDisponible})
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}

            {itemsTransfert.length > 0 && (
              <TableContainer component={Paper} sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell><strong>Produit</strong></TableCell>
                      <TableCell><strong>Stock Dispo</strong></TableCell>
                      <TableCell><strong>Quantité</strong></TableCell>
                      <TableCell><strong>Prix Unit.</strong></TableCell>
                      <TableCell><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {itemsTransfert.map(item => (
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
                        <TableCell>{item.prixVente.toLocaleString('fr-FR')} FCFA</TableCell>
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
            color="primary"
            onClick={handleCreateTransfert}
            disabled={!magasinDestination || itemsTransfert.length === 0}
          >
            Créer le Transfert
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Validation */}
      <Dialog open={showValidationDialog} onClose={() => setShowValidationDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {validationAction === 'accepter' ? 'Accepter le bon' : 'Refuser le bon'}
        </DialogTitle>
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
            color={validationAction === 'accepter' ? 'success' : 'error'}
            onClick={() => handleValider(validationAction)}
          >
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
