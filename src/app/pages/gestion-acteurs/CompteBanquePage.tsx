import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Dialog,
  IconButton, CircularProgress, Alert, Tooltip,
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { api } from '../../services/api';
import { addCreateAudit, addUpdateAudit, logDeletion, showAuditNotification } from '../../utils/auditUtils';
import { getMagasins, type Magasin } from '../../constants/magasins';
import { useAuth } from '../../contexts/AuthContext';
import { canAdd } from '../../utils/actionRights';

interface CompteBanque {
  id: string;
  nomCompte: string;
  /** Montant cumulé transféré depuis les magasins vers l'officine */
  soldeOfficine: number;
  /** Par magasin : montant déjà transféré vers l'officine */
  transfertsParMagasin: Record<string, number>;
  createdBy?: string; createdAt?: string; updatedBy?: string; updatedAt?: string;
  systeme?: boolean;
}

function loadMagasins(): Magasin[] {
  const list = getMagasins();
  return [...list].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
}

/**
 * Calcule les entrées d'un magasin VENTILÉES par compte banque choisi lors de la
 * vente. Retourne un objet { NOM_COMPTE_MAJUSCULE: montant }. Ainsi, si une vente
 * a été enregistrée sur « CAISSE INTERNE », le montant n'alimente QUE ce compte —
 * et non tous les comptes disponibles (correction du double comptage).
 */
function calcEntreesParCompte(magasinId: string): Record<string, number> {
  const map: Record<string, number> = {};
  try {
    const ventes: any[] = JSON.parse(localStorage.getItem(`leclaire_ventes_${magasinId}`) || '[]');
    const flash: any[] = JSON.parse(localStorage.getItem(`leclaire_vente_flash_${magasinId}`) || '[]');
    for (const v of [...ventes, ...flash]) {
      const amt = parseFloat(String(v.totalNet ?? v.montantTotal ?? v.montant ?? v.total ?? 0)) || 0;
      if (!amt) continue;
      const compte = String(
        v?.recap?.compteBanque ?? v?.compteBanque ?? v?.compte_banque ?? ''
      ).trim().toUpperCase();
      if (!compte) continue; // sans compte défini → on n'attribue à aucun
      map[compte] = (map[compte] || 0) + amt;
    }
  } catch { /* ignore */ }
  return map;
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pBtnStyle(disabled: boolean, active = false): React.CSSProperties {
  return {
    padding: '2px 8px', border: '1px solid #dee2e6', borderRadius: 3,
    cursor: disabled ? 'default' : 'pointer',
    backgroundColor: active ? '#0d6efd' : disabled ? '#f8f9fa' : 'white',
    color: active ? 'white' : disabled ? '#aaa' : '#333', fontSize: 12,
  };
}

export function CompteBanquePage() {
  const { user } = useAuth();
  const peutAjouter = canAdd(user, 'acteurs');
  const CACHE_KEY = 'leclaire_comptes_banque_cache';
  const [comptes, setComptes] = useState<CompteBanque[]>(() => {
    try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  // magasinId → { NOM_COMPTE_MAJUSCULE : montant encaissé sur ce compte }
  const [entrees, setEntrees] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState<boolean>(() => {
    try { return !localStorage.getItem(CACHE_KEY); } catch { return true; }
  });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<CompteBanque | null>(null);
  const [formNom, setFormNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);

  const refreshEntrees = useCallback((mgs: Magasin[]) => {
    const map: Record<string, Record<string, number>> = {};
    mgs.forEach(m => { map[m.id] = calcEntreesParCompte(m.id); });
    setEntrees(map);
  }, []);

  useEffect(() => {
    const mgs = loadMagasins();
    setMagasins(mgs);
    refreshEntrees(mgs);
    loadData();

    const h = () => {
      const updated = loadMagasins();
      setMagasins(updated);
      refreshEntrees(updated);
    };
    window.addEventListener('leclaire-sync-update', h);
    window.addEventListener('storage', h);
    return () => {
      window.removeEventListener('leclaire-sync-update', h);
      window.removeEventListener('storage', h);
    };
  }, [refreshEntrees]);

  const loadData = async () => {
    try {
      setLoading(true);
      const items = await api.getAll<CompteBanque>('comptes-banque');
      const mapped = items.map(c => ({
        ...c,
        soldeOfficine: Number(c.soldeOfficine ?? ((c as any).soldesParMagasin
          ? Object.values((c as any).soldesParMagasin || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0)
          : 0)),
        transfertsParMagasin: c.transfertsParMagasin ?? (c as any).soldesParMagasin ?? {},
      }));
      setComptes(mapped);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(mapped)); } catch {}
    } catch {
      setError('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  /** Balance restante d'un magasin = entrées totales - déjà transféré vers officine */
  const soldeRestant = (compte: CompteBanque, magasinId: string) => {
    const nom = (compte.nomCompte || '').trim().toUpperCase();
    const total = entrees[magasinId]?.[nom] || 0;
    const transfere = (compte.transfertsParMagasin || {})[magasinId] || 0;
    return Math.max(0, total - transfere);
  };

  /** Somme des soldes restants de tous les magasins */
  const totalMagasins = (compte: CompteBanque) =>
    magasins.reduce((s, m) => s + soldeRestant(compte, m.id), 0);

  /** Clic sur ↑ : transfère le solde du magasin vers Solde Officine */
  const handleTransferer = async (compte: CompteBanque, magasinId: string) => {
    const montant = soldeRestant(compte, magasinId);
    if (montant <= 0) return;
    const key = `${compte.id}_${magasinId}`;
    setTransferring(key);
    try {
      const updated: CompteBanque = {
        ...compte,
        soldeOfficine: (compte.soldeOfficine || 0) + montant,
        transfertsParMagasin: {
          ...(compte.transfertsParMagasin || {}),
          [magasinId]: ((compte.transfertsParMagasin || {})[magasinId] || 0) + montant,
        },
      };
      const saved = await api.update<CompteBanque>('comptes-banque', compte.id, addUpdateAudit(updated));
      setComptes(prev => prev.map(c => c.id === compte.id ? { ...updated, ...saved } : c));
    } catch {
      setError('Erreur lors du transfert');
    } finally {
      setTransferring(null);
    }
  };

  const filtered = comptes.filter(c =>
    !search || c.nomCompte?.toLowerCase().includes(search.toLowerCase())
  );
  const CARDS_PER_PAGE = 4;
  const totalPages = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);

  const openAdd = () => { setEditingItem(null); setFormNom(''); setOpenDialog(true); };
  const openEdit = (c: CompteBanque) => { setEditingItem(c); setFormNom(c.nomCompte); setOpenDialog(true); };
  const closeDialog = () => { setOpenDialog(false); setEditingItem(null); setFormNom(''); };

  const handleSubmit = async () => {
    if (!formNom.trim()) { setError('Le nom du compte est obligatoire'); return; }
    try {
      setSaving(true); setError(null);
      if (editingItem) {
        const saved = await api.update<CompteBanque>('comptes-banque', editingItem.id,
          addUpdateAudit({ ...editingItem, nomCompte: formNom }));
        setComptes(prev => prev.map(c => c.id === editingItem.id ? { ...editingItem, ...saved, nomCompte: formNom } : c));
        showAuditNotification('update', 'Compte Banque');
      } else {
        const created = await api.create<CompteBanque>('comptes-banque',
          addCreateAudit({ nomCompte: formNom, soldeOfficine: 0, transfertsParMagasin: {} }));
        setComptes(prev => [...prev, created]);
        showAuditNotification('create', 'Compte Banque');
      }
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally { setSaving(false); }
  };

  const handleDelete = async (c: CompteBanque) => {
    if (!window.confirm(`Supprimer le compte "${c.nomCompte}" ?`)) return;
    logDeletion('comptes-banque', c.id, c);
    await api.delete('comptes-banque', c.id).catch(() => {});
    setComptes(prev => prev.filter(x => x.id !== c.id));
    showAuditNotification('delete', 'Compte Banque');
  };

  return (
    <Box sx={{ p: 0, minHeight: '100vh', bgcolor: '#f0f4f0' }}>

      {/* ── Barre de titre ── */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        px: 3, py: 2,
        background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 60%, #388e3c 100%)',
        boxShadow: '0 2px 8px rgba(27,94,32,0.25)',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.2)',
            border: '2px solid rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🏦</Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'white', lineHeight: 1.1 }}>
              Comptes Banque
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)' }}>
              {comptes.length} compte{comptes.length !== 1 ? 's' : ''} enregistré{comptes.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained" size="small" onClick={openAdd}
          disabled={!peutAjouter}
          title={peutAjouter ? undefined : "Vous n'avez pas le droit d'ajouter des données."}
          sx={{
            background: 'rgba(255,255,255,0.18)',
            border: '1.5px solid rgba(255,255,255,0.6)',
            color: 'white', fontWeight: 700, fontSize: '0.78rem',
            textTransform: 'none', px: 2, py: 0.9, borderRadius: 2,
            backdropFilter: 'blur(4px)',
            '&:hover': { background: 'rgba(255,255,255,0.3)' },
            boxShadow: 'none',
          }}>
          + Ajouter Compte Banque
        </Button>
      </Box>

      <Box sx={{ px: 3, pt: 2.5 }}>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        {/* ── Barre de recherche ── */}
        <Box sx={{
          display: 'flex', gap: 1.5, mb: 3, alignItems: 'center', flexWrap: 'wrap',
          bgcolor: 'white', p: 1.5, borderRadius: 2,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          border: '1px solid #e8f5e9',
        }}>
          <TextField
            placeholder="Recherche Compte Banque..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            size="small"
            sx={{ width: 260, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            InputProps={{ endAdornment: search ? <IconButton size="small" onClick={() => setSearch('')}><ClearIcon fontSize="small" /></IconButton> : null }}
          />
          <TextField
            placeholder="jj/mm/aaaa" value={dateFilter}
            onChange={e => setDateFilter(e.target.value)} size="small"
            sx={{ width: 155, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            InputProps={{ endAdornment: (
              <Box sx={{ display: 'flex' }}>
                <IconButton size="small"><CalendarTodayIcon sx={{ fontSize: 14 }} /></IconButton>
                {dateFilter && <IconButton size="small" onClick={() => setDateFilter('')}><ClearIcon sx={{ fontSize: 14 }} /></IconButton>}
              </Box>
            )}}
          />
          <IconButton size="small" sx={{ bgcolor: '#2e7d32', color: 'white', borderRadius: 1.5, p: 0.8 }}>
            <SearchIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {['<<', '<', null, '>', '>>'].map((lbl, i) => {
              if (lbl === null) return <button key="cur" style={pBtnStyle(false, true)}>{page}</button>;
              const disabled = lbl === '<<' || lbl === '<' ? page === 1 : page === totalPages;
              const action = lbl === '<<' ? () => setPage(1) : lbl === '<' ? () => setPage(p => p - 1) : lbl === '>' ? () => setPage(p => p + 1) : () => setPage(totalPages);
              return <button key={lbl} onClick={action} disabled={disabled} style={pBtnStyle(disabled)}>{lbl}</button>;
            })}
          </Box>
        </Box>

        {/* ── Grille de cartes ── */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress sx={{ color: '#2e7d32' }} /></Box>
        ) : paginated.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, bgcolor: 'white', borderRadius: 3, border: '2px dashed #c8e6c9' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>🏦</Typography>
            <Typography color="text.secondary">Aucun compte banque enregistré</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {paginated.map(compte => {
              const totalMag = totalMagasins(compte);
              const grandTotal = (compte.soldeOfficine || 0) + totalMag;
              return (
                <Box key={compte.id} sx={{
                  minWidth: 340, maxWidth: 500, flex: '1 1 340px',
                  bgcolor: 'white',
                  borderRadius: 3,
                  border: '2px solid white',
                  boxShadow: '0 4px 20px rgba(46,125,50,0.15), 0 1px 6px rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s',
                  '&:hover': { boxShadow: '0 8px 30px rgba(46,125,50,0.22), 0 2px 10px rgba(0,0,0,0.1)' },
                }}>

                  {/* ── En-tête carte ── */}
                  <Box sx={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    px: 2, py: 1.5,
                    background: 'linear-gradient(135deg, #f9fbe7 0%, #f1f8e9 100%)',
                    borderBottom: '2px solid #c5e1a5',
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #2e7d32, #66bb6a)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(46,125,50,0.3)',
                        fontSize: 16,
                      }}>🏦</Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1b5e20', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {compte.nomCompte}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.75 }}>
                      <Tooltip title="Supprimer" arrow>
                        <IconButton size="small" onClick={() => handleDelete(compte)}
                          sx={{ bgcolor: '#ffebee', border: '1.5px solid #ef9a9a', borderRadius: 1.5, p: 0.6, '&:hover': { bgcolor: '#ef5350', '& svg': { color: 'white' } } }}>
                          <DeleteIcon sx={{ fontSize: 14, color: '#c62828' }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Modifier" arrow>
                        <IconButton size="small" onClick={() => openEdit(compte)}
                          sx={{ bgcolor: '#fffde7', border: '1.5px solid #ffe082', borderRadius: 1.5, p: 0.6, '&:hover': { bgcolor: '#fdd835' } }}>
                          <EditIcon sx={{ fontSize: 14, color: '#f57f17' }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  {/* ── Solde Officine ── */}
                  <Box sx={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    px: 2, py: 1.25,
                    background: 'linear-gradient(90deg, #2e7d32 0%, #388e3c 100%)',
                    borderBottom: '1px solid rgba(255,255,255,0.15)',
                  }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Solde Officine
                    </Typography>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: 'white' }}>
                      {fmt(compte.soldeOfficine || 0)} <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>F CFA</span>
                    </Typography>
                  </Box>

                  {/* ── Lignes par magasin ── */}
                  {magasins.map((m, idx) => {
                    const montant = soldeRestant(compte, m.id);
                    const isTransferring = transferring === `${compte.id}_${m.id}`;
                    const isEven = idx % 2 === 0;
                    return (
                      <Box key={m.id} sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        px: 2, py: 0.9,
                        bgcolor: isEven ? '#e8f5e9' : '#f1f8e9',
                        borderBottom: '1px solid #c8e6c9',
                        transition: 'background 0.15s',
                        '&:hover': { bgcolor: '#dcedc8' },
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1 }}>
                          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#43a047', flexShrink: 0 }} />
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#1b5e20', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            Solde {m.label}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#2e7d32', minWidth: 120, textAlign: 'right' }}>
                            {fmt(montant)} <span style={{ fontSize: '0.65rem', color: '#558b2f' }}>F CFA</span>
                          </Typography>
                          <Tooltip title={montant > 0 ? `Transférer ${fmt(montant)} F CFA → Solde Officine` : 'Aucun solde à transférer'} arrow>
                            <span>
                              <IconButton
                                size="small"
                                disabled={montant <= 0 || isTransferring}
                                onClick={() => handleTransferer(compte, m.id)}
                                sx={{
                                  width: 28, height: 28,
                                  background: montant > 0
                                    ? 'linear-gradient(135deg, #43a047, #2e7d32)'
                                    : '#e0e0e0',
                                  borderRadius: 1.5,
                                  boxShadow: montant > 0 ? '0 2px 6px rgba(46,125,50,0.4)' : 'none',
                                  '&:hover': { background: 'linear-gradient(135deg, #2e7d32, #1b5e20)', transform: 'translateY(-1px)', boxShadow: '0 4px 10px rgba(46,125,50,0.5)' },
                                  '&.Mui-disabled': { background: '#e8e8e8' },
                                  transition: 'all 0.2s',
                                }}
                              >
                                {isTransferring
                                  ? <CircularProgress size={13} sx={{ color: 'white' }} />
                                  : <ArrowUpwardIcon sx={{ fontSize: 15, color: montant > 0 ? 'white' : '#bdbdbd' }} />
                                }
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>
                    );
                  })}

                  {/* ── Solde Tous Les Magasins ── */}
                  <Box sx={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    px: 2, py: 1.25,
                    background: 'linear-gradient(90deg, #1b5e20 0%, #2e7d32 100%)',
                    borderTop: '2px solid rgba(255,255,255,0.2)',
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#a5d6a7' }} />
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Solde Tous Les Magasins
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: 'white' }}>
                      {fmt(grandTotal)} <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>F CFA</span>
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
        <Box sx={{ pb: 4 }} />
      </Box>

      {/* ── Dialog Ajouter / Modifier ── */}
      <Dialog open={openDialog} onClose={closeDialog} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          px: 2.5, py: 1.75,
          background: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
        }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'white' }}>
            {editingItem ? 'Modifier Compte Banque' : 'Ajouter Compte Banque'}
          </Typography>
          <IconButton size="small" onClick={closeDialog}
            sx={{ bgcolor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 1, p: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}>
            <CloseIcon sx={{ fontSize: 14, color: 'white' }} />
          </IconButton>
        </Box>
        <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          <Typography sx={{ fontSize: '0.85rem', mb: 0.75, fontWeight: 600, color: '#333' }}>
            Nom du Compte <span style={{ color: '#e53935' }}>*</span>
          </Typography>
          <TextField fullWidth size="small" value={formNom} onChange={e => setFormNom(e.target.value)}
            placeholder="Ex : CAISSE INTERNE, ECOBANK 2024..."
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
        </Box>
        <Box sx={{ mx: 3, borderTop: '1px dashed #e0e0e0', mt: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, px: 3, py: 2 }}>
          <Button variant="outlined" size="small" onClick={closeDialog}
            sx={{ textTransform: 'none', borderColor: '#ccc', color: '#555', borderRadius: 1.5, px: 2 }}>
            Annuler
          </Button>
          <Button variant="contained" size="small" onClick={handleSubmit} disabled={saving}
            sx={{
              background: 'linear-gradient(135deg, #2e7d32, #43a047)',
              textTransform: 'none', borderRadius: 1.5, px: 2.5,
              '&:hover': { background: 'linear-gradient(135deg, #1b5e20, #2e7d32)' },
            }}>
            {saving ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'Enregistrer'}
          </Button>
        </Box>
      </Dialog>
    </Box>
  );
}
