import { Box, TextField, Typography } from '@mui/material';
import { ActeursListPage } from '../../components/ActeursListPage';
import { MODELE_ASSURANCES } from '../../utils/catalogueCsv';

const columns = [
  { id: 'raisonSociale', label: 'Raison Sociale', minWidth: 180,
    format: (_: any, row: any) => row.raisonSociale || row.nom || '' },
  { id: 'adresse', label: 'Adresse', minWidth: 160 },
  { id: 'telephoneI', label: 'Téléphone', minWidth: 130,
    format: (_: any, row: any) => row.telephoneI || row.telephone || '' },
  { id: 'email', label: 'Email', minWidth: 160 },
];

const formFields = [{ name: 'raisonSociale', label: 'Raison Sociale', required: true }];

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

const inp = { size: 'small' as const, fullWidth: true, sx: { '& .MuiOutlinedInput-root': { borderRadius: 0.5 } } };

function renderForm(data: any, set: (k: string, v: any) => void) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 2 }}>
        <F label="Raison Sociale" required>
          <TextField {...inp} value={data.raisonSociale ?? ''} onChange={e => set('raisonSociale', e.target.value)} />
        </F>
        <F label="Téléphone I" required>
          <TextField {...inp} value={data.telephoneI ?? ''} onChange={e => set('telephoneI', e.target.value)} />
        </F>
        <F label="Téléphone II">
          <TextField {...inp} value={data.telephoneII ?? ''} onChange={e => set('telephoneII', e.target.value)} />
        </F>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 2 }}>
        <F label="Adresse">
          <TextField {...inp} value={data.adresse ?? ''} onChange={e => set('adresse', e.target.value)} />
        </F>
        <F label="Email">
          <TextField {...inp} type="email" value={data.email ?? ''} onChange={e => set('email', e.target.value)} />
        </F>
      </Box>
    </Box>
  );
}

export function AssurancePage() {
  return (
    <ActeursListPage
      entityType="assurances"
      pageTitle="Assurances"
      addButtonLabel="Ajouter Assurance"
      showImporter
      modeleCsv={MODELE_ASSURANCES}
      searchHint="(Raison Sociale, Adresse, Téléphone)"
      columns={columns}
      formFields={formFields}
      showSolde
      renderFormContent={renderForm}
      dialogMaxWidth="md"
    />
  );
}
