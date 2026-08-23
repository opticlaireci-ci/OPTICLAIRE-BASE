import { DataManagementPage } from '../../components/DataManagementPage';
import { nomMagasin } from '../../config/tenant';

const columns = [
  { id: 'nom', label: 'Nom du Magasin', minWidth: 170 },
  { id: 'adresse', label: 'Adresse', minWidth: 200 },
  { id: 'ville', label: 'Ville', minWidth: 120 },
  { id: 'telephone', label: 'Téléphone', minWidth: 120 },
  { id: 'responsable', label: 'Responsable', minWidth: 150 },
];

const formFields = [
  { name: 'nom', label: 'Nom du Magasin', required: true },
  { name: 'adresse', label: 'Adresse', required: true },
  { name: 'ville', label: 'Ville', required: true },
  { name: 'codePostal', label: 'Code Postal', required: true },
  { name: 'telephone', label: 'Téléphone', type: 'tel' as const, required: true },
  { name: 'email', label: 'Email', type: 'email' as const },
  { name: 'responsable', label: 'Responsable', required: true },
];

const initialData = [
  {
    id: '1',
    nom: nomMagasin('PALMERAIE'),
    adresse: 'Palmeraie rue ministre 8pool',
    ville: 'Abidjan',
    codePostal: '225',
    telephone: '07 15 15 25 25',
    email: '',
    responsable: 'PDG',
  },
  {
    id: '2',
    nom: nomMagasin('YOPOUGON'),
    adresse: 'Yopougon carrefour tiken-jah',
    ville: 'Abidjan',
    codePostal: '225',
    telephone: '07 15 15 25 25',
    email: 'beaulieu@optique.fr',
    responsable: 'PDG',
  },
  {
    id: '3',
    nom: nomMagasin('ABOBO'),
    adresse: 'Abobo feu du 15ème ',
    ville: 'Abidjan',
    codePostal: '225',
    telephone: '07 15 15 25 25',
    email: '',
    responsable: 'PDG',
  },
  {
    id: '4',
    nom: nomMagasin('FAYA'),
    adresse: 'Faya centre',
    ville: 'Abidjan',
    codePostal: '225',
    telephone: '07 15 15 25 25',
    email: 'faya@leclaire.ci',
    responsable: 'PDG',
  },
  {
    id: '5',
    nom: nomMagasin('KOUMASSI'),
    adresse: 'Koumassi centre',
    ville: 'Abidjan',
    codePostal: '225',
    telephone: '07 15 15 25 25',
    email: 'koumassi@leclaire.ci',
    responsable: 'PDG',
  },
  {
    id: 'bingerville',
    nom: nomMagasin('BINGERVILLE'),
    adresse: 'Bingerville centre',
    ville: 'Bingerville',
    codePostal: '225',
    telephone: '07 15 15 25 25',
    email: 'bingerville@leclaire.ci',
    responsable: 'PDG',
  },
  {
    id: 'man',
    nom: nomMagasin('MAN'),
    adresse: 'Man centre ville',
    ville: 'Man',
    codePostal: '225',
    telephone: '07 15 15 25 25',
    email: 'man@leclaire.ci',
    responsable: 'PDG',
  },
];

export function MagasinPage() {
  return (
    <DataManagementPage
      title="Magasins"
      subtitle="Gérez vos différents points de vente"
      columns={columns}
      formFields={formFields}
      initialData={initialData}
      entityType="magasins"
    />
  );
}
