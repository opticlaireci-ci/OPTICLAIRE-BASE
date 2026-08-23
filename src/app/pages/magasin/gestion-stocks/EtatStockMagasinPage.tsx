import { logger } from '../../../utils/logger';
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
  TextField,
  Typography,
  Button,
  Chip,
  InputAdornment,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import { recalculerStockMagasin, readStockCache, type StockMagasin } from '../../../services/inventaireService';
import { excelHeaderRows, printHeaderHTML } from '../../../utils/documentHeader';
const GridAny = Grid as any;

interface ProduitStock {
  id: string;
  type: 'monture' | 'accessoire';
  codeBarre: string;
  marque: string;
  reference: string;
  couleur: string;
  taille: string;
  prix: number;
  stock: number;
  seuil: number;
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

/** Convertit le stock calculé (StockMagasin[]) en lignes d'affichage. */
function toProduits(stock: StockMagasin[]): ProduitStock[] {
  return stock
    .filter(s => s.quantiteDisponible > 0)
    .map(s => ({
      id: s.produitId,
      type: s.produitType,
      codeBarre: s.produitId,
      marque: s.designation.split(' - ')[0] || '',
      reference: s.designation.split(' - ')[1] || s.designation,
      couleur: '',
      taille: '',
      prix: s.prixVente,
      stock: s.quantiteDisponible,
      seuil: 5,
    }));
}

export function EtatStockMagasinPage() {
  const { magasinId } = useParams();
  // Affichage INSTANTANÉ depuis le cache localStorage (aucune attente réseau),
  // puis rafraîchissement automatique en arrière-plan.
  const [montures, setMontures] = useState<ProduitStock[]>(() => toProduits(readStockCache(magasinId || '')));
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!magasinId) return;
    let mounted = true;

    // 1) Re-seed immédiat depuis le cache (changement de magasin).
    setMontures(toProduits(readStockCache(magasinId)));

    // 2) Recalcul réseau en arrière-plan (recalculerStockMagasin met à jour le
    //    cache + émet 'leclaire-stock-updated').
    const loadStock = async () => {
      try {
        const stockCalcule = await recalculerStockMagasin(magasinId.toUpperCase());
        if (mounted) setMontures(toProduits(stockCalcule));
      } catch (error) {
        logger.error('Erreur lors du chargement du stock:', error);
      }
    };
    loadStock();

    // 3) Rafraîchissement AUTOMATIQUE : périodique + sur événements.
    const interval = setInterval(loadStock, 8000);
    const onStockUpdated = () => { if (mounted) setMontures(toProduits(readStockCache(magasinId))); };
    window.addEventListener('storage', loadStock);
    window.addEventListener('leclaire-sync-update', loadStock);
    window.addEventListener('leclaire-stock-updated', onStockUpdated);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('storage', loadStock);
      window.removeEventListener('leclaire-sync-update', loadStock);
      window.removeEventListener('leclaire-stock-updated', onStockUpdated);
    };
  }, [magasinId]);

  const filteredMontures = montures.filter(monture => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      monture.codeBarre?.toLowerCase().includes(search) ||
      monture.marque?.toLowerCase().includes(search) ||
      monture.reference?.toLowerCase().includes(search) ||
      monture.couleur?.toLowerCase().includes(search) ||
      monture.taille?.toLowerCase().includes(search)
    );
  });

  const getStockStatus = (stock: number, seuil: number) => {
    if (stock === 0) return { label: 'Rupture', color: 'error' as const };
    if (stock <= seuil) return { label: 'Alerte', color: 'warning' as const };
    return { label: 'Disponible', color: 'success' as const };
  };

  // Calculs statistiques
  const totalMontures = filteredMontures.length;
  const stockDisponible = filteredMontures.filter(m => m.stock > m.seuil).length;
  const stockAlerte = filteredMontures.filter(m => m.stock > 0 && m.stock <= m.seuil).length;
  const stockRupture = filteredMontures.filter(m => m.stock === 0).length;
  const valeurStock = filteredMontures.reduce((sum, m) => sum + (m.prix * m.stock), 0);

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1000');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>État de Stock - ${getMagasinLabel(magasinId || '')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #1976d2; margin-bottom: 10px; }
          .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
          .stats { display: flex; gap: 15px; margin-bottom: 30px; flex-wrap: wrap; }
          .stat-card { flex: 1; min-width: 150px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1976d2; }
          .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #1976d2; color: white; padding: 12px; text-align: left; font-size: 12px; }
          td { padding: 10px; border-bottom: 1px solid #ddd; font-size: 11px; }
          tr:hover { background-color: #f5f5f5; }
          .status-disponible { background-color: #4caf50; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; }
          .status-alerte { background-color: #ff9800; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; }
          .status-rupture { background-color: #f44336; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #666; }
        </style>
      </head>
      <body>
        ${printHeaderHTML(magasinId || '')}
        <h1>État de Stock - ${getMagasinLabel(magasinId || '')}</h1>
        <div class="subtitle">Date: ${new Date().toLocaleDateString('fr-FR')}</div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${totalMontures}</div>
            <div class="stat-label">Total Articles</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stockDisponible}</div>
            <div class="stat-label">Disponibles</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stockAlerte}</div>
            <div class="stat-label">En Alerte</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stockRupture}</div>
            <div class="stat-label">En Rupture</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${valeurStock.toLocaleString('fr-FR')} FCFA</div>
            <div class="stat-label">Valeur Stock</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code Barre</th>
              <th>Marque</th>
              <th>Référence</th>
              <th>Couleur</th>
              <th>Taille</th>
              <th>Stock</th>
              <th>Seuil</th>
              <th>Prix Unit.</th>
              <th>Valeur</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${filteredMontures.map(m => {
              const status = getStockStatus(m.stock, m.seuil);
              const statusClass = status.color === 'success' ? 'status-disponible' : status.color === 'warning' ? 'status-alerte' : 'status-rupture';
              return `
                <tr>
                  <td>${m.codeBarre || '-'}</td>
                  <td>${m.marque || '-'}</td>
                  <td>${m.reference || '-'}</td>
                  <td>${m.couleur || '-'}</td>
                  <td>${m.taille || '-'}</td>
                  <td style="font-weight: bold;">${m.stock || 0}</td>
                  <td>${m.seuil || 0}</td>
                  <td>${(m.prix || 0).toLocaleString('fr-FR')} FCFA</td>
                  <td style="font-weight: bold;">${((m.prix || 0) * (m.stock || 0)).toLocaleString('fr-FR')} FCFA</td>
                  <td><span class="${statusClass}">${status.label}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="footer">
          Document généré le ${new Date().toLocaleString('fr-FR')} - OPTICLAIRE
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleExportExcel = async () => {
    // Import paresseux : xlsx chargé uniquement au moment de l'export.
    const XLSX = await import('xlsx');
    const data = filteredMontures.map(m => ({
      'Code Barre': m.codeBarre || '-',
      'Marque': m.marque || '-',
      'Référence': m.reference || '-',
      'Couleur': m.couleur || '-',
      'Taille': m.taille || '-',
      'Stock': m.stock || 0,
      'Seuil': m.seuil || 0,
      'Prix Unitaire': m.prix || 0,
      'Valeur': (m.prix || 0) * (m.stock || 0),
      'Statut': getStockStatus(m.stock, m.seuil).label,
    }));

    const headers = ['Code Barre', 'Marque', 'Référence', 'Couleur', 'Taille', 'Stock', 'Seuil', 'Prix Unitaire', 'Valeur', 'Statut'];
    const aoa = [...excelHeaderRows(magasinId || ''), headers, ...data.map((row: any) => headers.map(h => row[h]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'État de Stock');
    XLSX.writeFile(wb, `Etat_Stock_${getMagasinLabel(magasinId || '')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        État de Stock - {getMagasinLabel(magasinId || '')}
      </Typography>

      {/* Statistiques */}
      <GridAny container spacing={2} sx={{ mb: 3 }}>
        <GridAny item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#1976d2', color: 'white' }}>
            <CardContent>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {totalMontures}
              </Typography>
              <Typography variant="body2">Total Articles</Typography>
            </CardContent>
          </Card>
        </GridAny>
        <GridAny item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#4caf50', color: 'white' }}>
            <CardContent>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stockDisponible}
              </Typography>
              <Typography variant="body2">Disponibles</Typography>
            </CardContent>
          </Card>
        </GridAny>
        <GridAny item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#ff9800', color: 'white' }}>
            <CardContent>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stockAlerte}
              </Typography>
              <Typography variant="body2">En Alerte</Typography>
            </CardContent>
          </Card>
        </GridAny>
        <GridAny item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#f44336', color: 'white' }}>
            <CardContent>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stockRupture}
              </Typography>
              <Typography variant="body2">En Rupture</Typography>
            </CardContent>
          </Card>
        </GridAny>
        <GridAny item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#9c27b0', color: 'white' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                {valeurStock.toLocaleString('fr-FR')}
              </Typography>
              <Typography variant="body2">Valeur Stock (FCFA)</Typography>
            </CardContent>
          </Card>
        </GridAny>
      </GridAny>

      {/* Barre d'outils */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            sx={{ flexGrow: 1, minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            sx={{ bgcolor: '#1976d2' }}
          >
            Imprimer
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            sx={{ bgcolor: '#4caf50' }}
          >
            Excel
          </Button>
        </Box>
      </Paper>

      {/* Tableau */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Code Barre</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Marque</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Référence</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Couleur</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Taille</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Stock</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Seuil</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Prix Unit.</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Valeur</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Statut</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMontures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                  <Typography color="textSecondary">
                    Aucune monture/accessoire en stock distribué ou transféré dans ce magasin
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredMontures.map((monture, index) => {
                const status = getStockStatus(monture.stock, monture.seuil);
                return (
                  <TableRow key={monture.id} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell><Chip label={monture.type === 'accessoire' ? 'Accessoire' : 'Monture'} size="small" variant="outlined" /></TableCell>
                    <TableCell>{monture.codeBarre || '-'}</TableCell>
                    <TableCell>{monture.marque || '-'}</TableCell>
                    <TableCell>{monture.reference || '-'}</TableCell>
                    <TableCell>{monture.couleur || '-'}</TableCell>
                    <TableCell>{monture.taille || '-'}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{monture.stock || 0}</TableCell>
                    <TableCell>{monture.seuil || 0}</TableCell>
                    <TableCell>{(monture.prix || 0).toLocaleString('fr-FR')} FCFA</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>
                      {((monture.prix || 0) * (monture.stock || 0)).toLocaleString('fr-FR')} FCFA
                    </TableCell>
                    <TableCell>
                      <Chip label={status.label} color={status.color} size="small" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
