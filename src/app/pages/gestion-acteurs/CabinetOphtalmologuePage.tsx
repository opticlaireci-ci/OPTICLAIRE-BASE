import { Box, TextField, Typography } from '@mui/material';
import { ActeursListPage } from '../../components/ActeursListPage';
import { MODELE_CABINETS } from '../../utils/catalogueCsv';

const columns = [
  { id: 'cabinetOphtalmologue', label: 'Cabinet Ophtalmologue', minWidth: 300,
    format: (_: any, row: any) => row.cabinetOphtalmologue || row.nom || '' },
  { id: 'telephone', label: 'Téléphone', minWidth: 150,
    format: (_: any, row: any) => row.telephone || row.telephoneI || '' },
];

const formFields = [{ name: 'cabinetOphtalmologue', label: 'Cabinet Ophtalmologue', required: true }];

const inp = { size: 'small' as const, fullWidth: true, sx: { '& .MuiOutlinedInput-root': { borderRadius: 0.5 } } };

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.85rem', mb: 0.5 }}>
        {label}{required && <span style={{ color: 'red' }}> *</span>}
      </Typography>
      {children}
    </Box>
  );
}

function renderForm(data: any, set: (k: string, v: any) => void) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
      <F label="Cabinet Ophtalmologue" required>
        <TextField {...inp} value={data.cabinetOphtalmologue ?? ''} onChange={e => set('cabinetOphtalmologue', e.target.value)} />
      </F>
      <F label="Téléphone">
        <TextField {...inp} value={data.telephone ?? ''} onChange={e => set('telephone', e.target.value)} />
      </F>
    </Box>
  );
}

export function CabinetOphtalmologuePage() {
  return (
    <ActeursListPage
      entityType="cabinets"
      pageTitle="Cabinets Ophtalmologue"
      addButtonLabel="Ajouter Cabinet Ophtalmologue"
      showImporter
      modeleCsv={MODELE_CABINETS}
      searchHint="(Cabinet Ophtalmologue, Téléphone)"
      columns={columns}
      formFields={formFields}
      showSolde={false}
      renderFormContent={renderForm}
      dialogMaxWidth="sm"
    />
  );
}
