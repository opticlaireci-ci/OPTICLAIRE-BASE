import { useState } from 'react';
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
  Typography,
  Pagination,
  Checkbox,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ClearIcon from '@mui/icons-material/Clear';
import PrintIcon from '@mui/icons-material/Print';
import { AuditInfo, addCreateAudit, addUpdateAudit, logDeletion, showAuditNotification, formatDate, getCurrentUser } from '../../utils/auditUtils';
import { syncCatalogueToMagasins, removeCatalogueFromMagasins } from '../../utils/syncCataloguesToMagasins';
import { useLiveData } from '../../hooks/useLiveData';
import { useAuth } from '../../contexts/AuthContext';
import { canAdd } from '../../utils/actionRights';
import { ImportCatalogueCsvDialog } from '../../components/ImportCatalogueCsvDialog';
import { MODELE_SERVICES } from '../../utils/catalogueCsv';
import { TENANT } from '../../config/tenant';

interface Service extends AuditInfo {
  id: string;
  categorie: string;
  service: string;
  prixVerre: number;
}

export function ServicePage() {
  const { user } = useAuth();
  const peutAjouter = canAdd(user, 'composants');
  const [services, setServices] = useLiveData<Service>('leclaire_global_services');
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  /**
   * Import ICS.csv : les doublons ont déjà été écartés par le dialogue ; il ne
   * reste qu'à attribuer un identifiant, l'audit, puis à propager vers les
   * catalogues de chaque magasin comme le fait la saisie manuelle.
   */
  const handleImportServices = (nouvelles: Record<string, any>[]) => {
    const importes: Service[] = nouvelles.map((l, i) => addCreateAudit({
      // Date.now() serait identique pour toutes les lignes d'un même import :
      // l'index garantit des identifiants uniques.
      id: `${Date.now()}-${i}`,
      ...l,
    }) as Service);

    setServices([...services, ...importes]);
    importes.forEach(s => syncCatalogueToMagasins({ type: 'services', item: s, isUpdate: false }));
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState({
    categorie: '',
    designation: '',
    prix: '',
  });

  const handleAddService = () => {
    if (!formData.categorie || !formData.designation) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (editingService) {
      // Mode modification
      const updatedService = addUpdateAudit({
        ...editingService,
        categorie: formData.categorie,
        service: formData.designation,
        prixVerre: parseFloat(formData.prix) || 0,
      });
      const next = services.map(s => s.id === editingService.id ? updatedService : s);
      setServices(next);

      // Synchroniser vers tous les catalogues de magasins
      syncCatalogueToMagasins({ type: 'services', item: updatedService, isUpdate: true });

      showAuditNotification('update', 'Service');
    } else {
      // Mode création
      const newService: Service = addCreateAudit({
        id: Date.now().toString(),
        categorie: formData.categorie,
        service: formData.designation,
        prixVerre: parseFloat(formData.prix) || 0,
      });
      const next = [...services, newService];
      setServices(next);

      // Synchroniser vers tous les catalogues de magasins
      syncCatalogueToMagasins({ type: 'services', item: newService, isUpdate: false });

      showAuditNotification('create', 'Service');
    }

    setOpenAddDialog(false);
    setEditingService(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      categorie: '',
      designation: '',
      prix: '',
    });
  };

  const handlePrintCatalogue = () => {
    window.print();
  };

  const handleEditService = (service: Service) => {
    setEditingService(service);
    setFormData({
      categorie: service.categorie,
      designation: service.service,
      prix: service.prixVerre.toString(),
    });
    setOpenAddDialog(true);
  };

  const handleDeleteService = (service: Service) => {
    if (window.confirm(`Supprimer le service ${service.service} ?`)) {
      logDeletion('Service', service.id, service);
      const next = services.filter(s => s.id !== service.id);
      setServices(next);

      // Supprimer également des catalogues de tous les magasins
      removeCatalogueFromMagasins('services', service.id);

      showAuditNotification('delete', 'Service');
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
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={handlePrintCatalogue}
            sx={{
              bgcolor: '#757575',
              '&:hover': { bgcolor: '#616161' },
              textTransform: 'none',
            }}
          >
            Catalogue Services
          </Button>
          <Button
            variant="outlined"
            disabled={!peutAjouter}
            title={peutAjouter ? undefined : "Vous n'avez pas le droit d'ajouter des données."}
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
            Ajouter Service
          </Button>
        </Box>
      </Box>

      {openImportDialog && (
        <ImportCatalogueCsvDialog
          titre="Services"
          modele={MODELE_SERVICES}
          existants={services}
          onImporter={handleImportServices}
          onClose={() => setOpenImportDialog(false)}
        />
      )}

      {/* Title */}
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 'normal' }}>
        Services ({services.length})
      </Typography>

      {/* Search Bar - First Row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
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
          (Catégorie, Service, Prix)
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
              <TableCell>Catégorie</TableCell>
              <TableCell>Service</TableCell>
              <TableCell>Prix / Verre</TableCell>
              <TableCell>Créé par</TableCell>
              <TableCell>Modifié par</TableCell>
              <TableCell>Édition</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...services].sort((a, b) => (a.service || '').localeCompare(b.service || '', 'fr')).map((service, idx) => (
              <TableRow key={service.id}>
                <TableCell padding="checkbox">
                  <Checkbox />
                </TableCell>
                <TableCell sx={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 500 }}>{idx + 1}</TableCell>
                <TableCell>{service.categorie}</TableCell>
                <TableCell>{service.service}</TableCell>
                <TableCell>{service.prixVerre}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                    {service.createdBy || '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(service.createdAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                    {service.updatedBy || '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(service.updatedAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Button size="small" onClick={() => handleEditService(service)}>Éditer</Button>
                  <Button size="small" color="error" onClick={() => handleDeleteService(service)}>Suppr.</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Second Search Bar Row */}
      <Box sx={{ display: 'flex', gap: 2, mt: 3, alignItems: 'center' }}>
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
          (Catégorie, Service, Prix)
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

      {/* Add Service Dialog */}
      <Dialog open={openAddDialog} onClose={() => { setOpenAddDialog(false); setEditingService(null); resetForm(); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingService ? 'Modifier' : 'Ajouter'} Service
          <IconButton onClick={() => { setOpenAddDialog(false); setEditingService(null); resetForm(); }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Catégorie */}
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Catégorie <span style={{ color: 'red' }}>*</span>
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={formData.categorie}
                onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                placeholder="Catégorie...."
              />
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
          </Box>

          {/* Informations d'audit */}
          {editingService && (editingService.createdBy || editingService.updatedBy) && (
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Informations d'audit
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                {editingService.createdBy && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Créé par</Typography>
                    <Typography variant="body2">{editingService.createdBy}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(editingService.createdAt)}</Typography>
                  </Box>
                )}
                {editingService.updatedBy && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Modifié par</Typography>
                    <Typography variant="body2">{editingService.updatedBy}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(editingService.updatedAt)}</Typography>
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
              onClick={handleAddService}
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
