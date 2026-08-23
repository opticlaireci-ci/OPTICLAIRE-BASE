import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Card,
  CardContent,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import DevicesIcon from '@mui/icons-material/Devices';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';
import SecurityIcon from '@mui/icons-material/Security';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useSync } from '../contexts/SyncContext';
import { resetAllCounters } from '../utils/autoNumbers';
const GridAny = Grid as any;

export function SynchronisationPage() {
  const { status, lastSync, forcerSync } = useSync();
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleResetCounters = async () => {
    const ok = window.confirm(
      '⚠️ Voulez-vous vraiment remettre TOUS les compteurs à zéro ?\n\n'
      + 'Les prochaines factures, devis et ventes flash repartiront à 0001.\n'
      + 'Cette action est propagée à tous les appareils et est irréversible.'
    );
    if (!ok) return;
    setResetting(true);
    try {
      await resetAllCounters();
      alert('✅ Tous les compteurs ont été remis à zéro.');
    } catch {
      alert('❌ Erreur lors de la remise à zéro des compteurs.');
    } finally {
      setResetting(false);
    }
  };

  const handleForcerSync = async () => {
    setSyncing(true);
    try {
      await forcerSync();
      alert('✅ Synchronisation forcée terminée avec succès !');
    } catch (error) {
      alert('❌ Erreur lors de la synchronisation');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'synced':
        return {
          severity: 'success' as const,
          message: '✅ Tous vos appareils sont synchronisés en temps réel',
        };
      case 'syncing':
        return {
          severity: 'info' as const,
          message: '🔄 Synchronisation en cours...',
        };
      case 'error':
        return {
          severity: 'error' as const,
          message: '❌ Erreur de synchronisation. Vérifiez votre connexion internet.',
        };
      default:
        return {
          severity: 'warning' as const,
          message: '⚠️ Synchronisation inactive',
        };
    }
  };

  const statusMsg = getStatusMessage();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Synchronisation Multi-Appareils
      </Typography>

      <Alert severity={statusMsg.severity} sx={{ mb: 3 }}>
        {statusMsg.message}
      </Alert>

      {/* Statut actuel */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          État de la Synchronisation
        </Typography>

        <GridAny container spacing={2}>
          <GridAny item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: status === 'synced' ? '#4caf50' : '#f5f5f5', color: status === 'synced' ? 'white' : 'inherit' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <CloudDoneIcon />
                  <Typography variant="body2">Statut</Typography>
                </Box>
                <Typography variant="h6">
                  {status === 'synced' ? 'Actif' : status === 'syncing' ? 'En cours' : 'Inactif'}
                </Typography>
              </CardContent>
            </Card>
          </GridAny>

          <GridAny item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <SyncIcon />
                  <Typography variant="body2">Dernière sync</Typography>
                </Box>
                <Typography variant="h6">
                  {lastSync ? lastSync.toLocaleTimeString('fr-FR') : '-'}
                </Typography>
              </CardContent>
            </Card>
          </GridAny>

          <GridAny item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#2196f3', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <DevicesIcon />
                  <Typography variant="body2">Mode</Typography>
                </Box>
                <Typography variant="h6">Temps réel</Typography>
              </CardContent>
            </Card>
          </GridAny>

          <GridAny item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#ff9800', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <SpeedIcon />
                  <Typography variant="body2">Fréquence</Typography>
                </Box>
                <Typography variant="h6">Instantané</Typography>
              </CardContent>
            </Card>
          </GridAny>
        </GridAny>

        <Box sx={{ mt: 3 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={syncing ? <CloudSyncIcon /> : <SyncIcon />}
            onClick={handleForcerSync}
            disabled={syncing || status === 'syncing'}
            sx={{ bgcolor: '#2196f3' }}
          >
            {syncing ? 'Synchronisation en cours...' : 'Forcer la synchronisation'}
          </Button>
        </Box>
      </Paper>

      {/* Remise à zéro des compteurs */}
      <Paper sx={{ p: 3, mb: 3, border: '1px solid #ffcdd2' }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Réinitialisation des compteurs
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Remet à zéro les numérotations automatiques (factures, devis, ventes flash).
          Les prochains documents repartiront à <strong>0001</strong>. Action propagée à tous les appareils.
        </Typography>
        <Button
          variant="contained"
          color="error"
          size="large"
          startIcon={<RestartAltIcon />}
          onClick={handleResetCounters}
          disabled={resetting}
        >
          {resetting ? 'Remise à zéro en cours...' : 'Remettre tous les compteurs à zéro'}
        </Button>
      </Paper>

      {/* Comment ça fonctionne */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Comment ça fonctionne ?
        </Typography>

        <List>
          <ListItem>
            <ListItemIcon>
              <CheckCircleIcon sx={{ color: '#4caf50' }} />
            </ListItemIcon>
            <ListItemText
              primary="Synchronisation automatique"
              secondary="Toutes les modifications sont automatiquement envoyées vers le cloud"
            />
          </ListItem>

          <Divider />

          <ListItem>
            <ListItemIcon>
              <DevicesIcon sx={{ color: '#2196f3' }} />
            </ListItemIcon>
            <ListItemText
              primary="Multi-appareils"
              secondary="Vos données sont visibles instantanément sur tous vos appareils (ordinateurs, tablettes, téléphones)"
            />
          </ListItem>

          <Divider />

          <ListItem>
            <ListItemIcon>
              <SpeedIcon sx={{ color: '#ff9800' }} />
            </ListItemIcon>
            <ListItemText
              primary="Temps réel"
              secondary="Les modifications apparaissent en temps réel sur tous les appareils connectés (via WebSocket)"
            />
          </ListItem>

          <Divider />

          <ListItem>
            <ListItemIcon>
              <SecurityIcon sx={{ color: '#9c27b0' }} />
            </ListItemIcon>
            <ListItemText
              primary="Sécurisé et fiable"
              secondary="Vos données sont cryptées et stockées sur Supabase. Un système de cache local garantit le fonctionnement même hors ligne."
            />
          </ListItem>
        </List>
      </Paper>

      {/* Données synchronisées */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Données synchronisées
        </Typography>

        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Les données suivantes sont automatiquement synchronisées entre tous vos appareils :
        </Typography>

        <GridAny container spacing={2}>
          <GridAny item xs={12} sm={6} md={4}>
            <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                📦 Catalogues
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Montures, Verres, Accessoires, Traitements, Services
              </Typography>
            </Box>
          </GridAny>

          <GridAny item xs={12} sm={6} md={4}>
            <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                👥 Clients
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Informations clients de tous les magasins
              </Typography>
            </Box>
          </GridAny>

          <GridAny item xs={12} sm={6} md={4}>
            <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                💰 Ventes
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Factures, Devis, Ventes Flash
              </Typography>
            </Box>
          </GridAny>

          <GridAny item xs={12} sm={6} md={4}>
            <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                📋 Stocks
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Bons de commande, Distribution, Transfert, Retour
              </Typography>
            </Box>
          </GridAny>

          <GridAny item xs={12} sm={6} md={4}>
            <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                🏪 Magasins
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Configuration et données de chaque magasin
              </Typography>
            </Box>
          </GridAny>

          <GridAny item xs={12} sm={6} md={4}>
            <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                📅 RDV
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Rendez-vous retrait et en ligne
              </Typography>
            </Box>
          </GridAny>
        </GridAny>
      </Paper>
    </Box>
  );
}
