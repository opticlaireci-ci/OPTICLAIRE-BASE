import { logger } from '../utils/logger';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { canAdd, moduleFromPath } from '../utils/actionRights';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Add, Edit, Delete, Search } from '@mui/icons-material';
import { api } from '../services/api';
import { AuditInfo, addCreateAudit, addUpdateAudit, logDeletion, showAuditNotification, formatDate, getCurrentUser } from '../utils/auditUtils';

export interface Column {
  id: string;
  label: string;
  minWidth?: number;
  format?: (value: any) => string;
}

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'tel';
  required?: boolean;
  multiline?: boolean;
}

interface DataManagementPageProps {
  title: string;
  subtitle?: string;
  columns: Column[];
  formFields: FormField[];
  initialData?: any[];
  onAdd?: (data: any) => void;
  onEdit?: (id: string, data: any) => void;
  onDelete?: (id: string) => void;
  entityType: string;
}

export function DataManagementPage({
  title,
  subtitle,
  columns,
  formFields,
  initialData = [],
  onAdd,
  onEdit,
  onDelete,
  entityType,
}: DataManagementPageProps) {
  const { user } = useAuth();
  const location = useLocation();
  const peutAjouter = canAdd(user, moduleFromPath(location.pathname));
  const [data, setData] = useState<any[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Load data from API on mount
  useEffect(() => {
    loadData();
  }, [entityType]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await api.getAll(entityType);

      // If no data in DB and we have initialData, save it first
      if (items.length === 0 && initialData.length > 0 && !initialized) {
        logger.log(`Initializing ${entityType} with ${initialData.length} items`);
        const savedItems = [];
        for (const item of initialData) {
          const saved = await api.create(entityType, item);
          savedItems.push(saved);
        }
        setData(savedItems);
        setInitialized(true);
      } else {
        setData(items);
      }
    } catch (err) {
      logger.error('Error loading data:', err);
      setError('Erreur lors du chargement des données');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (item?: any) => {
    if (item) {
      setEditingItem(item);
      setFormData(item);
    } else {
      setEditingItem(null);
      setFormData({});
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingItem(null);
    setFormData({});
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);

      if (editingItem) {
        // Mode modification - ajouter l'audit de mise à jour
        const dataWithAudit = addUpdateAudit({ ...formData, id: editingItem.id });
        const updatedItem = await api.update(entityType, editingItem.id, dataWithAudit);
        const updatedData = data.map((item) =>
          item.id === editingItem.id ? updatedItem : item
        );
        setData(updatedData);
        onEdit?.(editingItem.id, dataWithAudit);
        showAuditNotification('update', title);
      } else {
        // Mode création - ajouter l'audit de création
        const dataWithAudit = addCreateAudit(formData);
        const newItem = await api.create(entityType, dataWithAudit);
        setData([...data, newItem]);
        onAdd?.(newItem);
        showAuditNotification('create', title);
      }
      handleCloseDialog();
    } catch (err) {
      logger.error('Error saving data:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const itemToDelete = data.find(item => item.id === id);
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
      try {
        setError(null);
        // Logger la suppression avant de la faire
        if (itemToDelete) {
          logDeletion(entityType, id, itemToDelete);
        }
        await api.delete(entityType, id);
        setData(data.filter((item) => item.id !== id));
        onDelete?.(id);
        showAuditNotification('delete', title);
      } catch (err) {
        logger.error('Error deleting data:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
      }
    }
  };

  const filteredData = data.filter((item) =>
    Object.values(item).some((value) =>
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
          disabled={loading || !peutAjouter}
          title={peutAjouter ? undefined : "Vous n'avez pas le droit d'ajouter des données."}
        >
          Ajouter
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      style={{ minWidth: column.minWidth }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                  <TableCell style={{ minWidth: 120 }}>Créé par</TableCell>
                  <TableCell style={{ minWidth: 120 }}>Modifié par</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 3} align="center">
                      <Typography color="text.secondary" sx={{ py: 4 }}>
                        Aucune donnée disponible
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((row, index) => (
                    <TableRow hover key={row.id ?? `row-${index}`}>
                      {columns.map((column) => (
                        <TableCell key={`${row.id ?? index}-${column.id}`}>
                          {column.format ? column.format(row[column.id]) : row[column.id]}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {row.createdBy || '-'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(row.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {row.updatedBy || '-'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(row.updatedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(row)}
                          color="primary"
                        >
                          <Edit />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(row.id)}
                          color="error"
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Total: {filteredData.length} élément(s)
            </Typography>
            {searchTerm && (
              <Chip
                label={`Filtré: ${filteredData.length} / ${data.length}`}
                onDelete={() => setSearchTerm('')}
                size="small"
              />
            )}
          </Box>
        </>
      )}

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingItem ? 'Modifier' : 'Ajouter'} {title}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {formFields.map((field) => (
              <TextField
                key={field.name}
                label={field.label}
                type={field.type || 'text'}
                required={field.required}
                multiline={field.multiline}
                rows={field.multiline ? 3 : 1}
                value={formData[field.name] || ''}
                onChange={(e) => handleFormChange(field.name, e.target.value)}
                fullWidth
              />
            ))}

            {/* Informations d'audit */}
            {editingItem && (editingItem.createdBy || editingItem.updatedBy) && (
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e0e0e0' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Informations d'audit
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {editingItem.createdBy && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Créé par</Typography>
                      <Typography variant="body2">{editingItem.createdBy}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatDate(editingItem.createdAt)}</Typography>
                    </Box>
                  )}
                  {editingItem.updatedBy && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Modifié par</Typography>
                      <Typography variant="body2">{editingItem.updatedBy}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatDate(editingItem.updatedAt)}</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>Annuler</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={24} /> : (editingItem ? 'Modifier' : 'Ajouter')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
