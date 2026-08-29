import { useState, useEffect } from 'react';
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
} from '@mui/material';
import { TrendingUp, TrendingDown, AccountBalance, Print, Download } from '@mui/icons-material';
import { excelHeaderRows } from '../utils/documentHeader';
import { getMagasins } from '../constants/magasins';
import { useLiveData } from '../hooks/useLiveData';
import { chargerToutesLesVentes, VenteSupabase } from '../services/ventesService';
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
  const magasins = getMagasins();
  return magasins.find(m => m.id === magasinId.toUpperCase())?.label || magasinId;
}

export function MouvementsCaisseGlobalPage() {
  // Mouvements personnalisés : lecture DIRECTE Firestore (partagé entre navigateurs)
  const [mouvementsPersonnalises] = useLiveData<MouvementCaisse>('leclaire_mouvements_caisse', []);
  const [ventesDerivees, setVentesDerivees] = useState<MouvementCaisse[]>([]);
  const [mouvements, setMouvements] = useState<MouvementCaisse[]>([]);
  const [filteredMouvements, setFilteredMouvements] = useState<MouvementCaisse[]>([]);
  const [filterMagasin, setFilterMagasin] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateDebut, setFilterDateDebut] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');

  // Dérivation des ventes (entrées) depuis Firestore — tous magasins
  useEffect(() => {
    let annule = false;
    chargerToutesLesVentes().then((ventes: VenteSupabase[]) => {
      if (annule) return;
      const derivees: MouvementCaisse[] = [];
      ventes
        // CHAQUE vente d'un magasin est une entrée (on exclut les devis).
        .filter((vente) => (vente.type || 'vente') === 'vente')
        .forEach((vente) => {
          const numFacture = (vente.recap && (vente.recap.numFacture || vente.recap.numDevis)) || vente.id;
          derivees.push({
            id: `vente-${vente.id}`,
            date: vente.date || new Date().toISOString(),
            magasinId: vente.magasin_id,
            type: 'entree',
            categorie: 'Vente',
            montant: vente.total_net ?? vente.total_brut ?? 0,
            libelle: `Vente ${numFacture} - ${vente.numero_client || 'Client'}`,
            modePaiement: (vente.recap && vente.recap.modePaiement) || 'Espèces',
            reference: numFacture,
            responsable: vente.edite_par || 'N/A',
          });
        });
      setVentesDerivees(derivees);
    }).catch(() => { if (!annule) setVentesDerivees([]); });
    return () => { annule = true; };
  }, []);

  // Agrégation ventes dérivées + mouvements personnalisés (tous magasins)
  useEffect(() => {
    const allMouvements: MouvementCaisse[] = [...ventesDerivees, ...mouvementsPersonnalises];
    // Trier par date décroissante
    allMouvements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setMouvements(allMouvements);
  }, [ventesDerivees, mouvementsPersonnalises]);

  useEffect(() => {
    applyFilters();
  }, [mouvements, filterMagasin, filterType, filterDateDebut, filterDateFin]);

  const applyFilters = () => {
    let filtered = [...mouvements];

    if (filterMagasin) {
      filtered = filtered.filter(m => m.magasinId === filterMagasin);
    }

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
      'Magasin': getMagasinLabel(m.magasinId),
      'Type': m.type === 'entree' ? 'Entrée' : 'Sortie',
      'Catégorie': m.categorie,
      'Libellé': m.libelle,
      'Montant': m.montant,
      'Mode de Paiement': m.modePaiement,
      'Référence': m.reference || '-',
      'Responsable': m.responsable,
    }));

    const headers = ['Date', 'Magasin', 'Type', 'Catégorie', 'Libellé', 'Montant', 'Mode de Paiement', 'Référence', 'Responsable'];
    const aoa = [...excelHeaderRows(), headers, ...data.map((row: any) => headers.map(h => row[h]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mouvements Caisse');
    XLSX.writeFile(wb, `Mouvements_Caisse_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontSize: 'clamp(18px,4vw,24px)' }}>
        Mouvements Entrées et Sorties - Tous les Magasins
      </Typography>

      {/* Statistiques */}
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

      {/* Filtres */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            select
            label="Magasin"
            value={filterMagasin}
            onChange={(e) => setFilterMagasin(e.target.value)}
            sx={{ minWidth: 200 }}
            size="small"
          >
            <MenuItem value="">Tous les magasins</MenuItem>
            {getMagasins().map(m => (
              <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
            ))}
          </TextField>

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

      {/* Tableau — desktop */}
      <div className="hidden md:block">
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Magasin</TableCell>
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
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
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
                    <TableCell>{getMagasinLabel(mouvement.magasinId)}</TableCell>
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
      </div>

      {/* Cartes — mobile */}
      <div className="md:hidden">
        {filteredMouvements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af', fontSize: 14 }}>
            Aucun mouvement trouvé
          </div>
        ) : filteredMouvements.map((mouvement) => {
          const isEntree = mouvement.type === 'entree';
          return (
            <div key={mouvement.id} style={{ border: `1px solid ${isEntree ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, marginBottom: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, padding: '10px 14px', backgroundColor: isEntree ? '#f0fdf4' : '#fff5f5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#374151' }}>
                    {new Date(mouvement.date).toLocaleDateString('fr-FR')}
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                    {getMagasinLabel(mouvement.magasinId)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: isEntree ? '#16a34a' : '#dc2626', color: '#fff' }}>
                    {isEntree ? 'Entrée' : 'Sortie'}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: isEntree ? '#16a34a' : '#dc2626' }}>
                    {isEntree ? '+' : '-'}{mouvement.montant.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              </div>
              {/* Card body */}
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{mouvement.libelle}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{mouvement.categorie} · {mouvement.modePaiement}</div>
                {mouvement.reference && (
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Réf : {mouvement.reference}</div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Par : {mouvement.responsable}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Box>
  );
}
