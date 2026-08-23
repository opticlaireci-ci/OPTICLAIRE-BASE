import { logger } from '../utils/logger';
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  CircularProgress,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { chargerToutesLesVentes } from '../services/ventesService';
import { chargerTousLesReglements } from '../services/reglementsService';
import { chargerTousLesClients } from '../services/clientsService';
import { chargerBons } from '../services/bonsService';
import { chargerFacturesAssurance } from '../services/assuranceService';
import { chargerInventaires } from '../services/inventairesService';
import { chargerJournalAudit } from '../services/auditLogService';
import { getAllMagasinIds } from '../constants/magasins';
import { resolveUserName } from '../utils/auditUtils';

const GridAny = Grid as any;

interface HistoryEntry {
  id: string;
  ts: number; // pour le tri
  date: string;
  time: string;
  user: string;
  action: 'Ajout' | 'Modification' | 'Suppression';
  module: string;
  magasin: string;
  details: string;
  type: 'create' | 'update' | 'delete';
}

const fmtMontant = (n: any) => (Number(n) || 0).toLocaleString('fr-FR') + ' FCFA';

export function HistoriquePage() {
  const [filterModule, setFilterModule] = useState('Tous');
  const [filterAction, setFilterAction] = useState('Tous');
  const [filterMagasin, setFilterMagasin] = useState('Tous');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    const allIds = getAllMagasinIds();

    // Ajoute une ou deux entrées (Ajout + éventuelle Modification) pour un enregistrement.
    const pushRecord = (
      acc: HistoryEntry[],
      opts: { id: string; module: string; magasin?: string; user?: string; details: string; createdAt?: string; updatedAt?: string; fallbackDate?: string },
    ) => {
      const created = opts.createdAt || opts.fallbackDate;
      const updated = opts.updatedAt;
      const user = resolveUserName(opts.user) || 'Système';
      const magasin = (opts.magasin || '').toUpperCase();
      const mkEntry = (suffix: string, iso: string, action: 'Ajout' | 'Modification', type: 'create' | 'update'): HistoryEntry | null => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        return {
          id: `${opts.id}-${suffix}`, ts: d.getTime(),
          date: d.toLocaleDateString('fr-FR'), time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          user, action, module: opts.module, magasin, details: opts.details, type,
        };
      };
      if (created) { const e = mkEntry('c', created, 'Ajout', 'create'); if (e) acc.push(e); }
      // Modification distincte seulement si updated_at s'écarte nettement de created_at (>60s)
      if (updated && created && Math.abs(new Date(updated).getTime() - new Date(created).getTime()) > 60000) {
        const e = mkEntry('u', updated, 'Modification', 'update'); if (e) acc.push(e);
      } else if (updated && !created) {
        const e = mkEntry('u', updated, 'Modification', 'update'); if (e) acc.push(e);
      }
    };

    async function charger() {
      setLoading(true);
      const acc: HistoryEntry[] = [];
      try {
        const [ventes, reglements, clientsMap, bons, inventaires, journal, ...facturesArr] = await Promise.all([
          chargerToutesLesVentes(),
          chargerTousLesReglements(),
          chargerTousLesClients(allIds),
          chargerBons(allIds),
          chargerInventaires(allIds),
          chargerJournalAudit(),
          ...allIds.map(id => chargerFacturesAssurance(id)),
        ]);

        ventes.forEach(v => {
          const r: any = v.recap || {};
          const numDoc = r.numDevis || r.numFacture || v.numero_client || '';
          const total = Number(v.total_net) || Number(v.total_brut) || 0;
          pushRecord(acc, {
            id: `vente-${v.id}`, module: v.type === 'devis' ? 'Devis / Proforma' : 'Ventes / Factures',
            magasin: v.magasin_id, user: v.edite_par, fallbackDate: v.date,
            createdAt: (v as any).created_at || v.date, updatedAt: (v as any).updated_at,
            details: `${v.client || ''} — ${numDoc} — ${fmtMontant(total)}`,
          });
        });

        reglements.forEach(r => pushRecord(acc, {
          id: `regl-${r.id}`, module: 'Règlements', magasin: r.magasin_id, user: r.edite_par,
          fallbackDate: r.date, createdAt: (r as any).created_at || r.date, updatedAt: (r as any).updated_at,
          details: `Reçu ${r.recu || ''} — ${r.mode_paiement || ''} — ${fmtMontant(r.montant)}`,
        }));

        Object.values(clientsMap).flat().forEach((c: any) => pushRecord(acc, {
          id: `client-${c.id}`, module: 'Clients', magasin: c.magasin_id, user: c.source || c.user_id,
          fallbackDate: c.date_edition, createdAt: c.created_at || c.date_edition, updatedAt: c.updated_at,
          details: `${c.nom || ''} (${c.numero_client || ''})${c.telephone ? ' — ' + c.telephone : ''}`,
        }));

        bons.forEach(b => {
          const modMap: Record<string, string> = {
            distribution: 'Bon de Distribution', transfert: 'Bon de Transfert', retour: 'Bon de Retour',
            commande: 'Bon de Commande', livraison: 'Bon de Livraison', peremption: 'Bon de Péremption',
          };
          pushRecord(acc, {
            id: `bon-${b.id}`, module: modMap[b.type] || 'Bons', magasin: b.magasin_source || b.magasin_destination || '',
            user: b.responsable || b.expediteur || b.valide_par, fallbackDate: b.date || undefined,
            createdAt: b.created_at || b.date || undefined, updatedAt: b.updated_at,
            details: `${b.numero || ''}${b.statut ? ' — ' + b.statut : ''} — ${(b.items || []).length} article(s)`,
          });
        });

        inventaires.forEach(iv => pushRecord(acc, {
          id: `inv-${iv.id}`, module: 'Inventaires', magasin: iv.magasin_id || '', user: iv.responsable || undefined,
          fallbackDate: iv.date_inventaire || undefined, createdAt: iv.created_at || iv.date_inventaire || undefined, updatedAt: iv.updated_at,
          details: `Inventaire — ${(Array.isArray(iv.items) ? iv.items.length : 0)} article(s) — écarts: ${iv.total_ecarts || 0}`,
        }));

        facturesArr.flat().forEach((f: any) => pushRecord(acc, {
          id: `fact-${f.id}`, module: 'Facture Assurance', magasin: f.magasin_id, user: undefined,
          fallbackDate: f.date_facture, createdAt: f.created_at || f.date_facture, updatedAt: f.updated_at,
          details: `${f.numero || ''} — ${f.client_nom || ''} — ${f.assurance || ''} — ${fmtMontant(f.montant_total)}`,
        }));

        // Journal d'audit : suppressions (et autres actions journalisées explicitement)
        journal.forEach(a => {
          const d = new Date(a.date);
          if (isNaN(d.getTime())) return;
          const type = a.action === 'delete' ? 'delete' : a.action === 'update' ? 'update' : 'create';
          const action = type === 'delete' ? 'Suppression' : type === 'update' ? 'Modification' : 'Ajout';
          acc.push({
            id: `audit-${a.id}`, ts: d.getTime(),
            date: d.toLocaleDateString('fr-FR'), time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            user: resolveUserName(a.user) || 'Système', action, type,
            module: a.module || '—', magasin: (a.magasin_id || '').toUpperCase(), details: a.details || '',
          });
        });

        acc.sort((a, b) => b.ts - a.ts);
      } catch (err) {
        logger.warn('Historique — chargement partiel :', err);
      } finally {
        if (!annule) { setEntries(acc); setLoading(false); }
      }
    }
    charger();
    return () => { annule = true; };
  }, []);

  const modules = useMemo(() => ['Tous', ...Array.from(new Set(entries.map(e => e.module))).sort()], [entries]);
  const magasins = useMemo(() => ['Tous', ...Array.from(new Set(entries.map(e => e.magasin).filter(Boolean))).sort()], [entries]);
  const actions = ['Tous', 'Ajout', 'Modification', 'Suppression'];

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const debut = dateDebut ? new Date(dateDebut + 'T00:00:00').getTime() : null;
    const fin = dateFin ? new Date(dateFin + 'T23:59:59').getTime() : null;
    return entries.filter(e =>
      (filterModule === 'Tous' || e.module === filterModule) &&
      (filterAction === 'Tous' || e.action === filterAction) &&
      (filterMagasin === 'Tous' || e.magasin === filterMagasin) &&
      (debut === null || e.ts >= debut) &&
      (fin === null || e.ts <= fin) &&
      (!q || e.user.toLowerCase().includes(q) || e.details.toLowerCase().includes(q) || e.module.toLowerCase().includes(q))
    );
  }, [entries, filterModule, filterAction, filterMagasin, searchTerm, dateDebut, dateFin]);

  const shown = filtered.slice(0, 500);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Historique</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        Consultez l'historique réel de toutes les actions effectuées (partagé entre tous les magasins et utilisateurs)
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <GridAny container spacing={2}>
          <GridAny item xs={12} md={4}>
            <TextField fullWidth label="Rechercher" placeholder="Utilisateur, détails..." value={searchTerm} onChange={(e: any) => setSearchTerm(e.target.value)} />
          </GridAny>
          <GridAny item xs={6} md={2}>
            <TextField fullWidth type="date" label="Date début" InputLabelProps={{ shrink: true }} value={dateDebut} onChange={(e: any) => setDateDebut(e.target.value)} />
          </GridAny>
          <GridAny item xs={6} md={2}>
            <TextField fullWidth type="date" label="Date fin" InputLabelProps={{ shrink: true }} value={dateFin} onChange={(e: any) => setDateFin(e.target.value)} />
          </GridAny>
          <GridAny item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Module</InputLabel>
              <Select value={filterModule} label="Module" onChange={(e: any) => setFilterModule(e.target.value)}>
                {modules.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
          </GridAny>
          <GridAny item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Action</InputLabel>
              <Select value={filterAction} label="Action" onChange={(e: any) => setFilterAction(e.target.value)}>
                {actions.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </Select>
            </FormControl>
          </GridAny>
          <GridAny item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Magasin</InputLabel>
              <Select value={filterMagasin} label="Magasin" onChange={(e: any) => setFilterMagasin(e.target.value)}>
                {magasins.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
          </GridAny>
        </GridAny>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date & Heure</TableCell>
              <TableCell>Utilisateur</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Module</TableCell>
              <TableCell>Magasin</TableCell>
              <TableCell>Détails</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            )}
            {!loading && shown.length === 0 && (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Aucune activité trouvée.</TableCell></TableRow>
            )}
            {!loading && shown.map(entry => (
              <TableRow key={entry.id} hover>
                <TableCell>
                  <Typography variant="body2">{entry.date}</Typography>
                  <Typography variant="caption" color="text.secondary">{entry.time}</Typography>
                </TableCell>
                <TableCell><Chip label={entry.user} size="small" variant="outlined" /></TableCell>
                <TableCell>
                  <Chip
                    icon={entry.type === 'create' ? <Add /> : entry.type === 'delete' ? <Delete /> : <Edit />}
                    label={entry.action}
                    size="small"
                    color={entry.type === 'create' ? 'success' : entry.type === 'delete' ? 'error' : 'primary'}
                  />
                </TableCell>
                <TableCell>{entry.module}</TableCell>
                <TableCell>{entry.magasin}</TableCell>
                <TableCell>{entry.details}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {filtered.length} entrée(s){filtered.length > shown.length ? ` — affichage des ${shown.length} plus récentes` : ''}
        </Typography>
      </Box>
    </Box>
  );
}
