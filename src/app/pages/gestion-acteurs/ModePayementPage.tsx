import { Box, TextField, Typography } from '@mui/material';
import { ActeursListPage } from '../../components/ActeursListPage';

const columns = [
  { id: 'modePaiement', label: 'Mode de Paiement', minWidth: 250,
    format: (_: any, row: any) => row.modePaiement || row.nom || '' },
];

const formFields = [{ name: 'modePaiement', label: 'Mode de Paiement', required: true }];

const inp = { size: 'small' as const, fullWidth: true, sx: { '& .MuiOutlinedInput-root': { borderRadius: 0.5 } } };

function renderForm(data: any, set: (k: string, v: any) => void) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.85rem', mb: 0.5 }}>
        Mode de Paiement <span style={{ color: 'red' }}>*</span>
      </Typography>
      <TextField {...inp} value={data.modePaiement ?? ''} onChange={e => set('modePaiement', e.target.value)} />
    </Box>
  );
}

export function ModePayementPage() {
  return (
    <ActeursListPage
      entityType="modes-paiement"
      pageTitle="Modes de Paiement"
      addButtonLabel="Ajouter Mode de Paiement"
      searchPlaceholder="Recherche Mode de Paiement..."
      columns={columns}
      formFields={formFields}
      showSolde={false}
      renderFormContent={renderForm}
      dialogMaxWidth="sm"
    />
  );
}
