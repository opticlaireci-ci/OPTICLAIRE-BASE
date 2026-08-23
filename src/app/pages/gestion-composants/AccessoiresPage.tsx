import { useState } from 'react';
import { useLiveData } from '../../hooks/useLiveData';
import { genCodeCourt } from '../../utils/autoNumbers';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  Typography,
  Pagination,
  Checkbox,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ClearIcon from '@mui/icons-material/Clear';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { AuditInfo, addCreateAudit, addUpdateAudit, logDeletion, showAuditNotification, formatDate, getCurrentUser } from '../../utils/auditUtils';
import { syncCatalogueToMagasins, removeCatalogueFromMagasins } from '../../utils/syncCataloguesToMagasins';
import { autoRegisterMontureComponents } from '../../utils/autoRegisterComponents';
import { replaceCatalogue } from '../../services/catalogueService';
import { useAuth } from '../../contexts/AuthContext';
import { canAdd } from '../../utils/actionRights';
import { ImportCatalogueCsvDialog } from '../../components/ImportCatalogueCsvDialog';
import { MODELE_ACCESSOIRES } from '../../utils/catalogueCsv';
import { TENANT } from '../../config/tenant';

interface Accessoire extends AuditInfo {
  id: string;
  codeBarre: string;
  marque: string;
  categorie: string;
  designation: string;
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

const ACCESSOIRES_KEY = 'leclaire_global_accessoires';

export function AccessoiresPage() {
  const { user } = useAuth();
  const peutAjouter = canAdd(user, 'composants');
  const [accessoires, setAccessoires] = useLiveData<Accessoire>(ACCESSOIRES_KEY);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [editingAccessoire, setEditingAccessoire] = useState<Accessoire | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState({
    codeBarre: genCodeCourt(),
    fournisseur: '',
    marque: '',
    categorie: '',
    designation: '',
    couleur: '',
    taille: '',
    prix: '',
    stock: '',
    seuil: '',
    gestionStocks: 'actif' as 'actif' | 'inactif',
    garantie: '',
    image: null as File | null,
  });

  const handleAddAccessoire = () => {
    if (!formData.marque) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (editingAccessoire) {
      // Mode modification
      const updatedAccessoire = addUpdateAudit({
        ...editingAccessoire,
        codeBarre: formData.codeBarre,
        marque: formData.marque,
        categorie: formData.categorie,
        designation: formData.designation,
        couleur: formData.couleur,
        taille: formData.taille,
        prix: parseFloat(formData.prix) || 0,
        stock: parseFloat(formData.stock) || 0,
        seuil: parseFloat(formData.seuil) || 0,
        fournisseur: formData.fournisseur,
        garantie: formData.garantie,
        gestionStocks: formData.gestionStocks,
      });
      const next = accessoires.map(a => a.id === editingAccessoire.id ? updatedAccessoire : a);
      setAccessoires(next);

      // Synchroniser vers tous les catalogues de magasins
      syncCatalogueToMagasins({ type: 'accessoires', item: updatedAccessoire, isUpdate: true });

      showAuditNotification('update', 'Accessoire');
    } else {
      // Mode création
      const newAccessoire: Accessoire = addCreateAudit({
        id: Date.now().toString(),
        codeBarre: formData.codeBarre,
        marque: formData.marque,
        categorie: formData.categorie,
        designation: formData.designation,
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
      const next = [...accessoires, newAccessoire];
      setAccessoires(next);

      // Auto-enregistrer les composants (couleur, marque, catégorie, taille)
      autoRegisterMontureComponents({
        couleur: formData.couleur,
        marque: formData.marque,
        categorie: formData.categorie,
        taille: formData.taille,
      });

      // Synchroniser vers tous les catalogues de magasins
      syncCatalogueToMagasins({ type: 'accessoires', item: newAccessoire, isUpdate: false });

      showAuditNotification('create', 'Accessoire');
    }

    setOpenAddDialog(false);
    setEditingAccessoire(null);
    resetForm();
  };

  /**
   * Import ICA.csv : les doublons ont déjà été écartés par le dialogue. On
   * complète ici les champs absents du fichier (code-barres, identifiant, marge)
   * puis on applique les mêmes effets que la saisie manuelle.
   */
  const handleImportAccessoires = (nouvelles: Record<string, any>[]) => {
    const importes: Accessoire[] = nouvelles.map((l, i) => addCreateAudit({
      // Date.now() serait identique pour toutes les lignes d'un même import :
      // l'index garantit des identifiants uniques.
      id: `${Date.now()}-${i}`,
      codeBarre: genCodeCourt(),
      marge: 0,
      ...l,
    }) as Accessoire);

    setAccessoires([...accessoires, ...importes]);
    importes.forEach(a => {
      autoRegisterMontureComponents({
        couleur: a.couleur, marque: a.marque, categorie: a.categorie, taille: a.taille,
      });
      syncCatalogueToMagasins({ type: 'accessoires', item: a, isUpdate: false });
    });
  };

  const resetForm = () => {
    setFormData({
      codeBarre: genCodeCourt(),
      fournisseur: '',
      marque: '',
      categorie: '',
      designation: '',
      couleur: '',
      taille: '',
      prix: '',
      stock: '',
      seuil: '',
      gestionStocks: 'actif',
      garantie: '',
      image: null,
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, image: e.target.files[0] });
    }
  };

  const handleEditAccessoire = (accessoire: Accessoire) => {
    setEditingAccessoire(accessoire);
    setFormData({
      codeBarre: accessoire.codeBarre,
      fournisseur: accessoire.fournisseur || '',
      marque: accessoire.marque,
      categorie: accessoire.categorie,
      designation: accessoire.designation,
      couleur: accessoire.couleur,
      taille: accessoire.taille,
      prix: accessoire.prix.toString(),
      stock: accessoire.stock.toString(),
      seuil: accessoire.seuil.toString(),
      gestionStocks: accessoire.gestionStocks || 'actif',
      garantie: accessoire.garantie || '',
      image: null,
    });
    setOpenAddDialog(true);
  };

  const handleDeleteAccessoire = (accessoire: Accessoire) => {
    if (window.confirm(`Supprimer l'accessoire ${accessoire.designation} ?`)) {
      logDeletion('Accessoire', accessoire.id, accessoire);
      const next = accessoires.filter(a => a.id !== accessoire.id);
      setAccessoires(next);

      // Supprimer également des catalogues de tous les magasins
      removeCatalogueFromMagasins('accessoires', accessoire.id);

      showAuditNotification('delete', 'Accessoire');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ fontSize: 20 }}>👓</Box>
          <Typography variant="h6">Gestion des Composants: {TENANT.nom}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            disabled={!peutAjouter}
            title={peutAjouter ? undefined : "Vous n'avez pas le droit d'ajouter des données."}
            startIcon={<FileUploadIcon />}
            onClick={() => setOpenImportDialog(true)}
            sx={{ textTransform: 'none' }}
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
            Ajouter Accessoire
          </Button>
        </Box>
      </Box>

      {openImportDialog && (
        <ImportCatalogueCsvDialog
          titre="Accessoires"
          modele={MODELE_ACCESSOIRES}
          existants={accessoires}
          onImporter={handleImportAccessoires}
          onClose={() => setOpenImportDialog(false)}
        />
      )}

      {/* Title */}
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 'normal' }}>
        Accessoires ({accessoires.length})
      </Typography>

      {/* Search Bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <TextField
          placeholder="Recherche..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ width: 300 }}
          InputProps={{
            endAdornment: searchTerm && (
              <IconButton size="small" onClick={() => setSearchTerm('')}>
                <ClearIcon fontSize="small" />
              </IconButton>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary">
          (Code Barre, Marque, Catégorie, Désignation, Couleur, Taille, Prix)
        </Typography>
        <TextField
          placeholder="jj/mm/aaaa"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          size="small"
          sx={{ width: 200 }}
          InputProps={{
            endAdornment: (
              <>
                <IconButton size="small">
                  <CalendarTodayIcon fontSize="small" />
                </IconButton>
                {dateFilter && (
                  <IconButton size="small" onClick={() => setDateFilter('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
              </>
            ),
          }}
        />
        <IconButton
          sx={{
            bgcolor: '#2196f3',
            color: 'white',
            '&:hover': { bgcolor: '#1976d2' },
          }}
        >
          <SearchIcon />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <Pagination count={3} page={page} onChange={(_, value) => setPage(value)} />
      </Box>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: 40, textAlign: 'center' }}>#</TableCell>
              <TableCell>Code Barre</TableCell>
              <TableCell>Marque</TableCell>
              <TableCell>Catégorie</TableCell>
              <TableCell>Désignation</TableCell>
              <TableCell>Couleur</TableCell>
              <TableCell>Taille</TableCell>
              <TableCell>Prix</TableCell>
              <TableCell>Stock</TableCell>
              <TableCell>Marge</TableCell>
              <TableCell>Seuil</TableCell>
              <TableCell>Créé par</TableCell>
              <TableCell>Modifié par</TableCell>
              <TableCell>Édition</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...accessoires].sort((a, b) => (a.marque || '').localeCompare(b.marque || '', 'fr')).map((accessoire, idx) => (
              <TableRow key={accessoire.id}>
                <TableCell padding="checkbox">
                  <Checkbox />
                </TableCell>
                <TableCell sx={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 500 }}>{idx + 1}</TableCell>
                <TableCell>{accessoire.codeBarre}</TableCell>
                <TableCell>{accessoire.marque}</TableCell>
                <TableCell>{accessoire.categorie}</TableCell>
                <TableCell>{accessoire.designation}</TableCell>
                <TableCell>{accessoire.couleur}</TableCell>
                <TableCell>{accessoire.taille}</TableCell>
                <TableCell>{accessoire.prix}</TableCell>
                <TableCell>{accessoire.stock}</TableCell>
                <TableCell>{accessoire.marge}</TableCell>
                <TableCell>{accessoire.seuil}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                    {accessoire.createdBy || '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(accessoire.createdAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                    {accessoire.updatedBy || '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(accessoire.updatedAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Button size="small" onClick={() => handleEditAccessoire(accessoire)}>Éditer</Button>
                  <Button size="small" color="error" onClick={() => handleDeleteAccessoire(accessoire)}>Suppr.</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Accessoire Dialog */}
      <Dialog open={openAddDialog} onClose={() => { setOpenAddDialog(false); setEditingAccessoire(null); resetForm(); }} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingAccessoire ? 'Modifier' : 'Ajouter'} Accessoire
          <IconButton onClick={() => { setOpenAddDialog(false); setEditingAccessoire(null); resetForm(); }}>
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
              <FormControl fullWidth size="small">
                <Select
                  value={formData.fournisseur}
                  onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                  displayEmpty
                >
                  <MenuItem value="">Fournisseur...</MenuItem>
                  <MenuItem value="fournisseur1">Fournisseur 1</MenuItem>
                  <MenuItem value="fournisseur2">Fournisseur 2</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Marque */}
            <Box sx={{ gridColumn: '2' }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Marque <span style={{ color: 'red' }}>*</span>
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={formData.marque}
                  onChange={(e) => setFormData({ ...formData, marque: e.target.value })}
                  displayEmpty
                >
                  <MenuItem value="">Marque...</MenuItem>
                  <MenuItem value="marque1">Marque 1</MenuItem>
                  <MenuItem value="marque2">Marque 2</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Catégorie */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Catégorie <span style={{ color: 'red' }}>*</span>
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={formData.categorie}
                  onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                  displayEmpty
                >
                  <MenuItem value="">Catégorie...</MenuItem>
                  <MenuItem value="etui">Étui</MenuItem>
                  <MenuItem value="chiffon">Chiffon</MenuItem>
                  <MenuItem value="cordon">Cordon</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Désignation */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Désignation <span style={{ color: 'red' }}>*</span>
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              />
            </Box>

            {/* Couleur */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Couleur <span style={{ color: 'red' }}>*</span>
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={formData.couleur}
                  onChange={(e) => setFormData({ ...formData, couleur: e.target.value })}
                  displayEmpty
                >
                  <MenuItem value="">Couleur...</MenuItem>
                  <MenuItem value="noir">Noir</MenuItem>
                  <MenuItem value="marron">Marron</MenuItem>
                  <MenuItem value="bleu">Bleu</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Taille */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Taille <span style={{ color: 'red' }}>*</span>
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={formData.taille}
                  onChange={(e) => setFormData({ ...formData, taille: e.target.value })}
                  displayEmpty
                >
                  <MenuItem value="">Taille...</MenuItem>
                  <MenuItem value="S">S</MenuItem>
                  <MenuItem value="M">M</MenuItem>
                  <MenuItem value="L">L</MenuItem>
                </Select>
              </FormControl>
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
              <FormControl fullWidth size="small">
                <Select
                  value={formData.garantie}
                  onChange={(e) => setFormData({ ...formData, garantie: e.target.value })}
                  displayEmpty
                >
                  <MenuItem value="">Sélectionner...</MenuItem>
                  <MenuItem value="1an">1 an</MenuItem>
                  <MenuItem value="2ans">2 ans</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {/* Informations d'audit */}
          {editingAccessoire && (editingAccessoire.createdBy || editingAccessoire.updatedBy) && (
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Informations d'audit
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                {editingAccessoire.createdBy && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Créé par</Typography>
                    <Typography variant="body2">{editingAccessoire.createdBy}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(editingAccessoire.createdAt)}</Typography>
                  </Box>
                )}
                {editingAccessoire.updatedBy && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Modifié par</Typography>
                    <Typography variant="body2">{editingAccessoire.updatedBy}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(editingAccessoire.updatedAt)}</Typography>
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
              onClick={handleAddAccessoire}
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
