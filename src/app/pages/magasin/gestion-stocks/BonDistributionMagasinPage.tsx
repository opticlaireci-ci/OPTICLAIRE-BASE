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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { enregistrerDistribution } from '../../../services/inventaireService';
import { upsertBon, distributionToRow } from '../../../services/bonsService';
import { useLiveData } from '../../../hooks/useLiveData';
import { getCurrentUser, resolveUserName, formatDate } from '../../../utils/auditUtils';

const BON_DISTRIBUTION_KEY = 'leclaire_db_bon-distribution';

interface BonDistribution {
  id: string;
  numero: string;
  date: string;
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
    ? allBons.filter((bon) => bon.magasinDest?.toUpperCase() === magasinId.toUpperCase())
    : [];

  const handleValider = async (action: 'accepter' | 'refuser') => {
    if (!selectedBon) return;
    // Garde anti-double : empêche une double validation (double-clic) qui
    // réinjecterait le stock deux fois et fausserait la quantité reçue.
    if (validatingRef.current) return;
    // Idempotence : un bon déjà traité ne doit JAMAIS réajouter de stock.
    if (selectedBon.statut === 'Validé' || selectedBon.statut === 'Refusé') {
      setShowValidationDialog(false);
      setShowDetailDialog(false);
      setSelectedBon(null);
      return;
    }
    validatingRef.current = true;

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
    if (changed) upsertBon(distributionToRow(changed)).catch(e => logger.error('❌ upsertBon distribution:', e));

    // Si le bon est accepté, enregistrer dans l'inventaire
    if (action === 'accepter' && selectedBon.items && magasinId) {
      logger.log('🔍 DEBUG: Acceptation du bon de distribution');
      logger.log('   Magasin ID:', magasinId);
      logger.log('   Bon numéro:', selectedBon.numero);
      logger.log('   Items:', selectedBon.items);

      const items = selectedBon.items.map(item => ({
        // Clé de stock stable : id catalogue si présent, sinon désignation (bons anciens)
        id: item.id || item.designation,
        type: 'monture' as const,
        designation: item.designation,
        quantite: item.quantite,
        prixVente: item.prixUnit || 0,
      }));

      logger.log('   Items formatés:', items);

      const success = await enregistrerDistribution({
        magasinId: magasinId.toUpperCase(),
        bonReference: selectedBon.numero,
        items,
      });

      if (success) {
        logger.log(`✅ Distribution acceptée: ${items.length} produits ajoutés au stock du magasin ${magasinId}`);
        alert(`Bon accepté !\n${items.length} produit(s) ajouté(s) au stock.\n\nConsultez l'État de Stock pour vérifier.`);
      } else {
        logger.error('❌ Erreur lors de l\'enregistrement de la distribution');
        alert('Erreur lors de la mise à jour du stock');
      }
    }

    window.dispatchEvent(new CustomEvent('leclaire-sync-update'));

    setShowValidationDialog(false);
    setShowDetailDialog(false);
    setSelectedBon(null);
    setObservations('');
    validatingRef.current = false;
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
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
            Aucun bon de distribution pour ce magasin
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
                  {/* Responsable */}
                  <div style={{ fontSize: '0.78rem', color: '#555', marginBottom: '8px' }}>
                    <strong>Responsable:</strong> {bon.responsable || '-'}
                  </div>

                  {/* Articles */}
                  {bon.items && bon.items.length > 0 && (
                    <div
                      style={{
                        backgroundColor: '#f3f4f6',
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

                  {/* Traçabilité condensée */}
                  <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: '8px' }}>
                    <span>Créé: {formatDate(bon.createdAt || bon.date)}</span>
                    {(bon.statut === 'Validé' || bon.statut === 'Refusé') && bon.valideePar && (
                      <span
                        style={{
                          marginLeft: '8px',
                          color: bon.statut === 'Validé' ? '#2e7d32' : '#c62828',
                        }}
                      >
                        · {bon.statut === 'Validé' ? 'Confirmé' : 'Refusé'}: {resolveUserName(bon.valideePar)}
                      </span>
                    )}
                  </div>

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
                        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#ff9800', marginLeft: '8px' }}>
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
                      Aucun bon de distribution pour ce magasin
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
        <DialogTitle>Détails du Bon de Distribution</DialogTitle>
        <DialogContent>
          {selectedBon && (
            <Box>
              <Box sx={{ mb: 3 }}>
                <Typography><strong>Numéro:</strong> {selectedBon.numero}</Typography>
                <Typography><strong>Date:</strong> {new Date(selectedBon.date).toLocaleDateString('fr-FR')}</Typography>
                <Typography><strong>Magasin:</strong> {getMagasinLabel(selectedBon.magasinDest)}</Typography>
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
