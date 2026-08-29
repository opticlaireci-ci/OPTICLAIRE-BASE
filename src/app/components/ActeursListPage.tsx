import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Dialog, DialogContent,
  DialogTitle, IconButton, CircularProgress, Checkbox, Alert,
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import StorageIcon from '@mui/icons-material/Storage';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { ImportCatalogueCsvDialog } from './ImportCatalogueCsvDialog';
import { genererCatalogueCsv, telechargerCsv, type ModeleCsv } from '../utils/catalogueCsv';
import { api } from '../services/api';
import { addCreateAudit, addUpdateAudit, logDeletion, showAuditNotification, formatDate } from '../utils/auditUtils';
import { TENANT } from '../config/tenant';

export interface ActeurColumn {
  id: string;
  label: string;
  minWidth?: number;
  format?: (value: any, row?: any) => React.ReactNode;
}

export interface ActeurFormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'tel' | 'email';
  required?: boolean;
}

interface ActeursListPageProps {
  entityType: string;
  pageTitle: string;
  addButtonLabel: string;
  showImporter?: boolean;
  /**
   * Modèle du fichier CSV d'import/export. Sans ce réglage, le bouton
   * « Importer Base de Données » reste inactif : il n'y a pas de format défini.
   */
  modeleCsv?: ModeleCsv;
  searchHint?: string;
  searchPlaceholder?: string;
  columns: ActeurColumn[];
  formFields: ActeurFormField[];
  showSolde?: boolean;
  itemsPerPage?: number;
  /** Custom form layout — replaces auto-generated form fields */
  renderFormContent?: (formData: any, onChange: (key: string, value: any) => void) => React.ReactNode;
  dialogMaxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const ITEMS_PER_PAGE = 20;

function formatEdition(row: any): React.ReactNode {
  const dt = row.updatedAt || row.createdAt;
  const user = row.updatedBy || row.createdBy;
  if (!dt && !user) return '-';
  const date = dt ? formatDate(dt) : '';
  return (
    <Box>
      <Typography variant="body2" sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{date}</Typography>
      <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#555' }}>{user || ''}</Typography>
    </Box>
  );
}

function SoldeCell({ value }: { value: number }) {
  const n = typeof value === 'number' ? value : parseFloat(value) || 0;
  const isNeg = n < 0;
  return (
    <Box
      sx={{
        bgcolor: isNeg ? '#ef4444' : '#4ade80',
        color: isNeg ? 'white' : '#166534',
        fontWeight: 700,
        fontSize: '0.8rem',
        px: 1,
        py: 0.5,
        borderRadius: 0.5,
        textAlign: 'center',
        minWidth: 60,
        display: 'inline-block',
      }}
    >
      {n.toFixed(2)}
    </Box>
  );
}

export function ActeursListPage({
  entityType,
  pageTitle,
  renderFormContent,
  dialogMaxWidth = 'sm',
  addButtonLabel,
  showImporter = false,
  modeleCsv,
  searchHint,
  searchPlaceholder,
  columns,
  formFields,
  showSolde = false,
  itemsPerPage = ITEMS_PER_PAGE,
}: ActeursListPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [openDialog, setOpenDialog] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    loadData();
    // Recharger si un acteur est auto-enregistré depuis une vente/devis
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.entityType || detail.entityType === entityType) loadData();
    };
    window.addEventListener('leclaire-acteurs-update', handler);
    return () => window.removeEventListener('leclaire-acteurs-update', handler);
  }, [entityType]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await api.getAll(entityType);
      setData(items);
    } catch {
      setError('Erreur lors du chargement');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = data.filter((row) => {
    const matchSearch = !searchTerm || Object.values(row).some(v =>
      String(v).toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchDate = !dateFilter || (row.updatedAt || row.createdAt || '').includes(dateFilter);
    return matchSearch && matchDate;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const allSelected = paginated.length > 0 && paginated.every(r => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) paginated.forEach(r => next.delete(r.id));
    else paginated.forEach(r => next.add(r.id));
    setSelected(next);
  };
  const toggleRow = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  /** Exporte la liste affichée au format du modèle : sert aussi de gabarit vide. */
  const handleExport = () => {
    if (!modeleCsv) return;
    telechargerCsv(genererCatalogueCsv(data, modeleCsv.colonnes), modeleCsv.nom);
  };

  /**
   * Import CSV : les doublons ont déjà été écartés par le dialogue. Chaque ligne
   * passe par `api.create` — exactement le même chemin que la saisie manuelle,
   * pour que l'audit et la synchronisation restent identiques.
   */
  const handleImport = async (nouvelles: Record<string, any>[]) => {
    const crees: any[] = [];
    const echecs: string[] = [];
    for (const ligne of nouvelles) {
      try {
        crees.push(await api.create(entityType, addCreateAudit({ ...ligne })));
      } catch {
        // Une ligne refusée ne doit pas annuler tout l'import : on la signale
        // et on continue avec les suivantes.
        echecs.push(String(Object.values(ligne)[0] ?? '?'));
      }
    }
    if (crees.length) setData([...data, ...crees]);
    if (echecs.length) {
      setError(`${echecs.length} ligne(s) non enregistrée(s) : ${echecs.slice(0, 5).join(', ')}${echecs.length > 5 ? '…' : ''}`);
    }
  };

  const openAdd = () => {
    setEditingItem(null);
    const defaults: any = {};
    if (showSolde) defaults.solde = 0;
    setFormData(defaults);
    setOpenDialog(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setFormData({ ...item });
    setOpenDialog(true);
  };

  const closeDialog = () => {
    setOpenDialog(false);
    setEditingItem(null);
    setFormData({});
  };

  const handleSubmit = async () => {
    const requiredField = formFields.find(f => f.required && !formData[f.name]);
    if (requiredField) {
      setError(`Le champ "${requiredField.label}" est obligatoire`);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (editingItem) {
        const withAudit = addUpdateAudit({ ...formData, id: editingItem.id });
        const updated = await api.update(entityType, editingItem.id, withAudit);
        setData(data.map(d => d.id === editingItem.id ? updated : d));
        showAuditNotification('update', pageTitle);
      } else {
        const withAudit = addCreateAudit({ ...formData });
        const created = await api.create(entityType, withAudit);
        setData([...data, created]);
        showAuditNotification('create', pageTitle);
      }
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!window.confirm(`Supprimer "${item.raisonSociale || item.nom || item.modePaiement || item.nomCompte || ''}" ?`)) return;
    try {
      logDeletion(entityType, item.id, item);
      await api.delete(entityType, item.id);
      setData(data.filter(d => d.id !== item.id));
      showAuditNotification('delete', pageTitle);
    } catch {
      setError('Erreur lors de la suppression');
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Supprimer ${selected.size} élément(s) ?`)) return;
    for (const id of selected) {
      const item = data.find(d => d.id === id);
      if (item) {
        logDeletion(entityType, id, item);
        await api.delete(entityType, id).catch(() => {});
      }
    }
    setData(data.filter(d => !selected.has(d.id)));
    setSelected(new Set());
  };

  const paginationBtns = () => {
    const btns = [];
    btns.push(
      <button key="<<" onClick={() => setPage(1)} disabled={page === 1} style={pBtnStyle(page === 1)}>{'<<'}</button>,
      <button key="<" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pBtnStyle(page === 1)}>{'<'}</button>,
    );
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages, page + 1); i++) {
      btns.push(
        <button key={i} onClick={() => setPage(i)} style={pBtnStyle(false, i === page)}>{i}</button>
      );
    }
    btns.push(
      <button key=">" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pBtnStyle(page === totalPages)}>{'>'}</button>,
      <button key=">>" onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pBtnStyle(page === totalPages)}>{'>>'}</button>,
    );
    return btns;
  };

  return (
    <Box sx={{ p: 0 }}>
      {/* Header bar */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        px: 2, py: 1.5, bgcolor: '#e8edf2', borderBottom: '1px solid #d0d7de', mb: 2,
        flexWrap: 'wrap', gap: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#90a4ae', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: 14, color: 'white' }}>👤</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, color: '#333', fontSize: 'clamp(0.78rem, 3vw, 0.875rem)' }}>
            Gestion Acteurs: {TENANT.nom}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {showImporter && modeleCsv && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadIcon sx={{ fontSize: 14 }} />}
                onClick={handleExport}
                sx={{ fontSize: '0.75rem', textTransform: 'none', px: 1.5 }}
              >
                Exporter {modeleCsv.nom}.csv
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<StorageIcon sx={{ fontSize: 14 }} />}
                onClick={() => setOpenImport(true)}
                sx={{ bgcolor: '#1976d2', fontSize: '0.75rem', textTransform: 'none', px: 1.5 }}
              >
                Importer Base de Données
              </Button>
            </>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={openAdd}
            sx={{ bgcolor: '#0d6efd', fontSize: '0.75rem', textTransform: 'none', px: 1.5 }}
          >
            {addButtonLabel}
          </Button>
        </Box>
      </Box>

      {openImport && modeleCsv && (
        <ImportCatalogueCsvDialog
          titre={pageTitle}
          modele={modeleCsv}
          existants={data}
          onImporter={handleImport}
          onClose={() => setOpenImport(false)}
        />
      )}

      <Box sx={{ px: 2 }}>
        {/* Title */}
        <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 400, fontSize: '1.1rem' }}>
          {pageTitle} ({data.length})
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}

        {/* Search bar */}
        {searchHint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {searchHint}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            placeholder={searchPlaceholder || 'Recherche...'}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            size="small"
            sx={{ width: 250 }}
            InputProps={{
              endAdornment: searchTerm ? (
                <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon fontSize="small" /></IconButton>
              ) : null,
            }}
          />
          <TextField
            placeholder="jj/mm/aaaa"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            size="small"
            sx={{ width: 160 }}
            InputProps={{
              endAdornment: (
                <Box sx={{ display: 'flex' }}>
                  <IconButton size="small"><CalendarTodayIcon sx={{ fontSize: 14 }} /></IconButton>
                  {dateFilter && <IconButton size="small" onClick={() => setDateFilter('')}><ClearIcon sx={{ fontSize: 14 }} /></IconButton>}
                </Box>
              ),
            }}
          />
          <IconButton size="small" sx={{ bgcolor: '#1976d2', color: 'white', borderRadius: 1, '&:hover': { bgcolor: '#1565c0' } }}>
            <SearchIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', fontSize: '0.8rem' }}>
            {paginationBtns()}
          </Box>
        </Box>

        {/* Table */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <TableContainer component={Paper} sx={{ boxShadow: 'none', border: '1px solid #e0e0e0' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell padding="checkbox" sx={{ width: 36 }}>
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <Checkbox
                            size="small"
                            checked={allSelected}
                            indeterminate={selected.size > 0 && !allSelected}
                            onChange={toggleAll}
                          />
                          {selected.size > 0 && (
                            <IconButton size="small" sx={{ bgcolor: '#ef5350', color: 'white', borderRadius: 0.5, p: 0.5 }}
                              onClick={handleDeleteSelected}>
                              <DeleteIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 36, textAlign: 'center', py: 1 }}>#</TableCell>
                      {columns.map(col => (
                        <TableCell key={col.id} sx={{ fontWeight: 700, minWidth: col.minWidth, py: 1 }}>{col.label}</TableCell>
                      ))}
                      {showSolde && <TableCell sx={{ fontWeight: 700, py: 1 }}>Solde</TableCell>}
                      <TableCell sx={{ fontWeight: 700, py: 1 }}>Édition</TableCell>
                      <TableCell sx={{ width: 80 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columns.length + (showSolde ? 5 : 4)} align="center" sx={{ py: 4, color: '#999' }}>
                          Aucune donnée disponible
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map((row, idx) => {
                        const isEditable = !row.systeme;
                        return (
                          <TableRow key={row.id ?? idx} hover sx={{ '&:hover': { bgcolor: '#f9f9f9' } }}>
                            <TableCell padding="checkbox">
                              {isEditable && (
                                <Checkbox size="small" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} />
                              )}
                            </TableCell>
                            <TableCell sx={{ textAlign: 'center', color: '#aaa', fontSize: '0.75rem' }}>
                              {(page - 1) * itemsPerPage + idx + 1}
                            </TableCell>
                            {columns.map(col => (
                              <TableCell key={col.id} sx={{ py: 0.75, fontSize: '0.85rem' }}>
                                {col.format ? col.format(row[col.id], row) : (row[col.id] ?? '')}
                              </TableCell>
                            ))}
                            {showSolde && (
                              <TableCell sx={{ py: 0.75 }}>
                                <SoldeCell value={row.solde ?? 0} />
                              </TableCell>
                            )}
                            <TableCell sx={{ py: 0.75 }}>{formatEdition(row)}</TableCell>
                            <TableCell sx={{ py: 0.75, textAlign: 'right' }}>
                              {isEditable && (
                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                  <IconButton size="small"
                                    sx={{ bgcolor: '#fff9c4', border: '1px solid #f9a825', borderRadius: 0.5, p: 0.5 }}
                                    onClick={() => openEdit(row)}>
                                    <EditIcon sx={{ fontSize: 14, color: '#f9a825' }} />
                                  </IconButton>
                                  <IconButton size="small"
                                    sx={{ bgcolor: '#ef5350', borderRadius: 0.5, p: 0.5 }}
                                    onClick={() => handleDelete(row)}>
                                    <DeleteIcon sx={{ fontSize: 14, color: 'white' }} />
                                  </IconButton>
                                </Box>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {paginated.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>Aucune donnée disponible</div>
              ) : paginated.map((row, idx) => {
                const isEditable = !row.systeme;
                const [firstCol, ...restCols] = columns;
                const titleVal = firstCol
                  ? (firstCol.format ? firstCol.format(row[firstCol.id], row) : (row[firstCol.id] ?? ''))
                  : '';
                return (
                  <div key={row.id ?? idx} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: 6, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: restCols.length > 0 ? 8 : 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 'clamp(0.82rem, 3vw, 0.95rem)', color: '#111827', flex: 1 }}>
                        {titleVal}
                      </div>
                      {isEditable && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <IconButton size="small"
                            sx={{ bgcolor: '#fff9c4', border: '1px solid #f9a825', borderRadius: 0.5, p: 0.5 }}
                            onClick={() => openEdit(row)}>
                            <EditIcon sx={{ fontSize: 14, color: '#f9a825' }} />
                          </IconButton>
                          <IconButton size="small"
                            sx={{ bgcolor: '#ef5350', borderRadius: 0.5, p: 0.5 }}
                            onClick={() => handleDelete(row)}>
                            <DeleteIcon sx={{ fontSize: 14, color: 'white' }} />
                          </IconButton>
                        </div>
                      )}
                    </div>
                    {restCols.map(col => {
                      const val = col.format ? col.format(row[col.id], row) : (row[col.id] ?? '');
                      if (val === '' || val === null || val === undefined) return null;
                      return (
                        <div key={col.id} style={{ display: 'flex', gap: 6, fontSize: '0.78rem', color: '#374151', marginBottom: 4 }}>
                          <span style={{ color: '#9ca3af', minWidth: 72, flexShrink: 0 }}>{col.label}:</span>
                          <span>{val}</span>
                        </div>
                      );
                    })}
                    {showSolde && (
                      <div style={{ marginTop: 6 }}>
                        <SoldeCell value={row.solde ?? 0} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Bottom pagination */}
        {!loading && filtered.length > itemsPerPage && (
          <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', fontSize: '0.8rem' }}>
              {paginationBtns()}
            </Box>
          </Box>
        )}
      </Box>

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={closeDialog} maxWidth={dialogMaxWidth} fullWidth>
        {/* Header */}
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          px: 2.5, py: 1.5, bgcolor: '#f8f9fa', borderBottom: '1px solid #dee2e6',
        }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#111' }}>
            {editingItem ? 'Modifier' : addButtonLabel}
          </Typography>
          <IconButton
            size="small" onClick={closeDialog}
            sx={{ bgcolor: '#f8d7da', border: '1px solid #f5c2c7', borderRadius: 0.5, p: 0.5,
              '&:hover': { bgcolor: '#f1aeb5' } }}
          >
            <CloseIcon sx={{ fontSize: 14, color: '#842029' }} />
          </IconButton>
        </Box>

        {/* Body */}
        <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

          {renderFormContent
            ? renderFormContent(formData, (key, value) => setFormData((p: any) => ({ ...p, [key]: value })))
            : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {formFields.map(field => (
                  <Box key={field.name}>
                    <Typography variant="body2" sx={{ mb: 0.5, fontSize: '0.85rem' }}>
                      {field.label}{field.required && <span style={{ color: 'red' }}> *</span>}
                    </Typography>
                    <TextField
                      fullWidth size="small"
                      type={field.type || 'text'}
                      value={formData[field.name] ?? ''}
                      onChange={e => setFormData((p: any) => ({ ...p, [field.name]: e.target.value }))}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.5 } }}
                    />
                  </Box>
                ))}
                {showSolde && (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5, fontSize: '0.85rem' }}>Solde Initial</Typography>
                    <TextField fullWidth size="small" type="number"
                      value={formData.solde ?? 0}
                      onChange={e => setFormData((p: any) => ({ ...p, solde: parseFloat(e.target.value) || 0 }))}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0.5 } }}
                    />
                  </Box>
                )}
              </Box>
            )
          }
        </Box>

        {/* Dashed separator */}
        <Box sx={{ mx: 3, borderTop: '1px dashed #ccc', mt: 2 }} />

        {/* Footer */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 3, py: 2 }}>
          <Button variant="outlined" size="small" onClick={closeDialog}
            sx={{ textTransform: 'none', borderColor: '#ccc', color: '#333', borderRadius: 0.5 }}>
            Fermer
          </Button>
          <Button variant="contained" size="small" onClick={handleSubmit} disabled={saving}
            sx={{ bgcolor: '#0d6efd', textTransform: 'none', borderRadius: 0.5,
              '&:hover': { bgcolor: '#0b5ed7' } }}>
            {saving ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'Enregistrer'}
          </Button>
        </Box>
      </Dialog>
    </Box>
  );
}

function pBtnStyle(disabled: boolean, active = false): React.CSSProperties {
  return {
    padding: '2px 8px',
    border: '1px solid #dee2e6',
    borderRadius: 3,
    cursor: disabled ? 'default' : 'pointer',
    backgroundColor: active ? '#0d6efd' : disabled ? '#f8f9fa' : 'white',
    color: active ? 'white' : disabled ? '#aaa' : '#333',
    fontSize: 12,
  };
}
