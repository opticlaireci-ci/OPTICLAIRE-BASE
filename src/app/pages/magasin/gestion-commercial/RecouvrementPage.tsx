import { useParams } from 'react-router';
import { DataManagementPage } from '../../../components/DataManagementPage';

export function RecouvrementPage() {
  const { magasinId } = useParams();

  const columns = [
    { id: 'facture', label: 'N° Facture', minWidth: 130 },
    { id: 'client', label: 'Client', minWidth: 200 },
    { id: 'montantdu', label: 'Montant Dû', minWidth: 130 },
    { id: 'montantpaye', label: 'Montant Payé', minWidth: 130 },
    { id: 'reste', label: 'Reste', minWidth: 130 },
    { id: 'echeance', label: 'Échéance', minWidth: 130 },
    { id: 'statut', label: 'Statut', minWidth: 130 },
  ];

  const formFields: any[] = [
    { name: 'facture', label: 'N° Facture', type: 'text', required: true },
    { name: 'client', label: 'Client', type: 'text', required: true },
    { name: 'montantdu', label: 'Montant Dû (FCFA)', type: 'number', required: true },
    { name: 'montantpaye', label: 'Montant Payé (FCFA)', type: 'number', required: true },
    { name: 'reste', label: 'Reste à Payer (FCFA)', type: 'number', required: true },
    { name: 'echeance', label: 'Date Échéance', type: 'date', required: true },
    {
      name: 'statut',
      label: 'Statut',
      type: 'select',
      required: true,
      options: ['En cours', 'En retard', 'Soldé', 'Contentieux']
    },
    { name: 'telephone', label: 'Téléphone', type: 'text', required: false },
    { name: 'notes', label: 'Notes', type: 'textarea', required: false },
  ];

  const initialData = [
    {
      id: '1',
      facture: 'FACT-2024-0498',
      client: 'Yao Patricia',
      montantdu: 95000,
      montantpaye: 50000,
      reste: 45000,
      echeance: '2024-06-15',
      statut: 'En cours',
      telephone: '+225 07 08 09 10 11',
      notes: 'Paiement en 2 fois convenu',
    },
  ];

  return (
    <DataManagementPage
      title="Recouvrement"
      subtitle="Suivi des paiements et créances clients"
      columns={columns}
      formFields={formFields}
      initialData={initialData}
      entityType={`magasin-${magasinId}-recouvrement`}
    />
  );
}
