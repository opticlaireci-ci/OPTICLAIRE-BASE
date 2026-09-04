import { AdminLoginSettingsPanel } from '../../components/AdminLoginSettingsPanel';
import { ModeFestifPanel } from '../../components/ModeFestifPanel';

/** Paramètres réservés à l'administration : connexion et mode festif. */
export function AdministrationSettingsPage() {
  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-50">
      <div className="mb-6 pb-3 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800">Paramètres de l'administration</h1>
        <p className="text-sm text-gray-500 mt-1">Personnalisation de la connexion et des moments festifs.</p>
      </div>
      <div className="flex flex-col gap-4">
        <AdminLoginSettingsPanel />
        <ModeFestifPanel />
      </div>
    </div>
  );
}
