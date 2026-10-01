import { logger } from '../../../utils/logger';
import { useState, useRef } from 'react';
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
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PrintIcon from '@mui/icons-material/Print';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { enregistrerDistribution } from '../../../services/inventaireService';
import { upsertBon, distributionToRow } from '../../../services/bonsService';
import { useLiveData } from '../../../hooks/useLiveData';
import { getCurrentUser, resolveUserName, formatDate } from '../../../utils/auditUtils';
import { imprimerBonDistribution } from '../../../utils/stockActions';
import { getMagasinLabel as getConfiguredMagasinLabel } from '../../../constants/magasins';

const BON_DISTRIBUTION_KEY = 'leclaire_db_bon-distribution';

interface BonDistribution {
  id: string;
  numero: string;
  date: string;
  magasinDest: string;
  responsable: string;
  recepteur?: string;
  receiver?: string;
  items: { id?: string; type?: 'monture' | 'accessoire'; designation: string; quantite: number; prixUnit: number }[];
  statut: string;
  observations?: string;
  createdAt?: string;
  valideePar?: string;
  dateValidation?: string;
  createdBy?: string;

}

const getMagasinLabel = getConfiguredMagasinLabel;

function getStatutColor(statut: string): 'success' | 'error' | 'warning' {
  switch (String(statut || '').trim().toLowerCase()) {
    case 'validé': return 'success';
    case 'refusé': return 'error';
    default: return 'warning';
  }
}

export function BonDistributionMagasinPage() {
  const { magasinId } = useParams();
  const [allBons, setAllBons] = useLiveData<BonDistribution>(BON_DISTRIBUTION_KEY, []);
  const [selectedBon, setSelectedBon] = useState<BonDistribution | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationAction, setValidationAction] = useState<'accepter' | 'refuser'>('accepter');
  const [observations, setObservations] = useState('');
  const validatingRef = useRef(false);

  // Filtrer les bons destinés à ce magasin
  const bons = magasinId
    ? allBons.filter((bon) => bon.magasinDest?.trim().toUpperCase() === magasinId.trim().toUpperCase())
    : [];

  // Compteurs calculés à partir de la liste filtrée : ils restent donc
  // cohérents pour Abobo comme pour n'importe quel autre magasin.
  const bonsEnAttente = bons.filter((bon) => bon.statut === 'En attente' || !bon.statut);
  const bonsValides = bons.filter((bon) => bon.statut === 'Validé');
  const bonsRefuses = bons.filter((bon) => bon.statut === 'Refusé');

  const handleValider = async (action: 'accepter' | 'refuser') => {
    if (!selectedBon) return;
    // Garde anti-double : empêche une double validation (double-clic).
    if (validatingRef.current) return;
    // Un bon déjà traité ne doit jamais rejouer son mouvement de stock.
    if (selectedBon.statut === 'Validé' || selectedBon.statut === 'Refusé') {
      setShowValidationDialog(false);
      setShowDetailDialog(false);
      setSelectedBon(null);
      return;
    }
    validatingRef.current = true;

    try {
      // IMPORTANT : pour une ACCEPTATION, le mouvement de stock est écrit et
      // confirmé AVANT de marquer le bon comme « Validé ». Ainsi, une panne
      // réseau ne peut plus créer un bon validé avec un stock magasin vide.
      let stockSuccess = true;

      if (action === 'accepter' && selectedBon.items && magasinId) {
        const items = selectedBon.items.map(item => ({
          // Clé de stock stable : id catalogue si présent, sinon désignation
          // (compatibilité avec les anciens bons).
          id: item.id || item.designation,
          type: item.type === 'accessoire' ? 'accessoire' as const : 'monture' as const,
          designation: item.designation,
          quantite: Number(item.quantite) || 0,
          prixVente: Number(item.prixUnit) || 0,
        }));

        stockSuccess = await enregistrerDistribution({
          magasinId: magasinId.toUpperCase(),
          bonReference: selectedBon.numero,
          items,
        });

        if (!stockSuccess) {
          logger.error('❌ Distribution non confirmée : le bon reste En attente');
          alert('La réception n’a pas pu être confirmée sur le serveur.\n\nLe bon reste « En attente » et pourra être réessayé sans perdre le stock.');
          return;
        }
      }

      const changed = {
        ...selectedBon,
        statut: action === 'accepter' ? 'Validé' : 'Refusé',
        observations,
        dateValidation: new Date().toISOString(),
        valideePar: getCurrentUser(),
        recepteur: getCurrentUser(),
        receiver: getCurrentUser(),
      };

      const updatedBons = allBons.map((bon) => bon.id === selectedBon.id ? changed : bon);
      setAllBons(updatedBons);

      // Attendre la persistance du statut : le stock a déjà été confirmé.
      await upsertBon(distributionToRow(changed));

      if (action === 'accepter') {
        logger.log(`✅ Distribution acceptée et stock confirmé pour ${magasinId}`);
        alert(`Bon accepté !\n${selectedBon.items?.length || 0} produit(s) ajouté(s) au stock.\n\nConsultez l'État de Stock pour vérifier.`);
      }

      window.dispatchEvent(new CustomEvent('leclaire-sync-update'));
      setShowValidationDialog(false);
      setShowDetailDialog(false);
      setSelectedBon(null);
      setObservations('');
    } catch (e) {
      logger.error('❌ Validation du bon de distribution:', e);
      alert('La validation n’a pas pu être terminée. Le bon reste en attente afin de permettre un nouvel essai.');
    } finally {
      validatingRef.current = false;
    }
  };
  return (
    <Box className="admin-stock-list-page" sx={{ p: { xs: 2, md: 3 } }}>
      <Typography
        variant="h4"
        style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', marginBottom: '24px' }}
      >
        Bons de Distribution - {getMagasinLabel(magasinId || '')}
      </Typography>

      {/* Statistiques */}
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Paper sx={{ p: 2, bgcolor: '#ff9800', color: 'white' }}>
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

      

      {/* Tableau de gestion */}
      <div className="admin-stock-table-wrap">
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>N° Bon de Distribution</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Magasin</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Récepteur</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Statut</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Enregistré par</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Édition</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">
                      Aucun bon de distribution pour ce magasin
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                bons.map((bon, index) => (
                  <TableRow key={bon.id} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{bon.numero || '-'}</TableCell>
                    <TableCell>{getMagasinLabel(bon.magasinDest) || '-'}</TableCell>
                    <TableCell>{resolveUserName(bon.recepteur || bon.receiver || bon.valideePar) || (bon.statut === 'En attente' ? 'En attente' : '-')}</TableCell>
                    <TableCell>
                      <Chip
                        label={bon.statut || 'En attente'}
                        color={getStatutColor(bon.statut)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                      <div><strong>{resolveUserName(bon.createdBy || bon.responsable)}</strong></div>
                      <div style={{ color: '#888' }}>{formatDate(bon.createdAt || bon.date)}</div>
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="primary"
                        title="Voir le bon"
                        onClick={() => {
                          setSelectedBon(bon);
                          setShowDetailDialog(true);
                        }}
                      >
                        <VisibilityIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="default"
                        title="Imprimer le bon et les montures/accessoires"
                        onClick={() => imprimerBonDistribution(bon)}
                      >
                        <PrintIcon />
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
        <DialogTitle>Détails du Bon de Distribution</DialogTitle>
        <DialogContent>
          {selectedBon && (
            <Box>
              <Box sx={{ mb: 3 }}>
                <Typography><strong>Numéro:</strong> {selectedBon.numero}</Typography>
                <Typography><strong>Date:</strong> {new Date(selectedBon.date).toLocaleDateString('fr-FR')}</Typography>
                <Typography><strong>Magasin:</strong> {getMagasinLabel(selectedBon.magasinDest)}</Typography>
                <Typography><strong>Enregistré par:</strong> {resolveUserName(selectedBon.createdBy || selectedBon.responsable)} le {formatDate(selectedBon.createdAt || selectedBon.date)}</Typography>
                <Typography><strong>Récepteur:</strong> {resolveUserName(selectedBon.recepteur || selectedBon.receiver || selectedBon.valideePar) || (selectedBon.statut === 'En attente' ? 'En attente' : '-')}</Typography>
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
          {selectedBon && (
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={() => imprimerBonDistribution(selectedBon)}
            >
              Imprimer le bon
            </Button>
          )}
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
