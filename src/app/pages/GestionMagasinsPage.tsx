import { logger } from '../utils/logger';
import { AddButton } from '../components/AddButton';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Edit2, Trash2, X, Save, ArrowLeft, Database } from 'lucide-react';
import { getMagasins, saveMagasins, addMagasin, updateMagasin, deleteMagasin, type Magasin } from '../constants/magasins';
import { TENANT, libellesMagasins } from '../config/tenant';
import { subscribeToChanges, saveToSupabase } from '../services/supabaseRealtime';
import { getValidAccessToken } from '../utils/supabaseClient';

export function GestionMagasinsPage() {
  const navigate = useNavigate();
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Magasin>>({
    id: '',
    label: '',
    adresse: '',
    telephone: '',
    email: '',
    actif: true,
  });

  useEffect(() => {
    chargerMagasins();

    // Rafraîchir la liste en temps réel : un magasin ajouté/modifié/supprimé sur
    // un AUTRE navigateur est poussé vers Supabase, puis récupéré par le polling.
    // Sans ces abonnements, la page n'affichait la nouvelle valeur qu'après un
    // rechargement manuel (« enregistré mais rien ne s'affiche »).
    const unsub = subscribeToChanges('leclaire_magasins', () => chargerMagasins());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'leclaire_magasins') chargerMagasins();
    };
    const onSync = () => chargerMagasins();
    window.addEventListener('storage', onStorage);
    window.addEventListener('leclaire-sync-update', onSync as EventListener);
    window.addEventListener('supabase-realtime-update', onSync as EventListener);
    return () => {
      unsub();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('leclaire-sync-update', onSync as EventListener);
      window.removeEventListener('supabase-realtime-update', onSync as EventListener);
    };
  }, []);

  function chargerMagasins() {
    setMagasins(getMagasins());
  }

  function resetForm() {
    setForm({
      id: '',
      label: '',
      adresse: '',
      telephone: '',
      email: '',
      actif: true,
    });
    setEditingId(null);
    setShowForm(false);
  }

  function handleAjouter() {
    logger.log('🔵 Bouton Ajouter Magasin cliqué');
    setEditingId(null);
    setForm({
      id: '',
      label: '',
      adresse: '',
      telephone: '',
      email: '',
      actif: true,
    });
    setShowForm(true);
    logger.log('🟢 Formulaire affiché (showForm=true)');
  }

  function handleModifier(magasin: Magasin) {
    setForm(magasin);
    setEditingId(magasin.id);
    setShowForm(true);
  }

  function handleSupprimer(id: string) {
    if (confirm(`Voulez-vous vraiment supprimer ce magasin ?`)) {
      deleteMagasin(id);
      chargerMagasins();
    }
  }

  async function handleSauvegarder() {
    if (!form.id || !form.label) {
      alert('Veuillez remplir au minimum l\'ID et le nom du magasin');
      return;
    }

    if (editingId) {
      // Modification (l'alerte de résultat est affichée après confirmation cloud)
      updateMagasin(editingId, form);
    } else {
      // Ajout
      // Vérifier que l'ID n'existe pas déjà
      if (magasins.some(magasin => magasin.id === form.id)) {
        alert('Un magasin avec cet ID existe déjà !');
        return;
      }

      // Ajouter le magasin. Si la persistance échoue (ex. quota localStorage
      // saturé), on remonte une VRAIE erreur au lieu d'un faux « succès ».
      try {
        addMagasin(form as Magasin);
      } catch (err) {
        logger.error('❌ Échec sauvegarde magasin:', err);
        alert(
          `❌ Impossible d'enregistrer le magasin "${form.label}".\n\n` +
          `Le stockage du navigateur est probablement saturé. ` +
          `Essayez « Effacer le cache navigateur » dans l'Espace Administrateur, puis réessayez.\n\n` +
          `Détail: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      // Initialiser les clés localStorage pour ce nouveau magasin
      const magasinId = form.id;

      // 1. Créer les clés vides pour données spécifiques au magasin
      const clesVides = [
        `leclaire_clients_magasin_${magasinId}`,
        `leclaire_ventes_${magasinId}`,
        `leclaire_vente_flash_${magasinId}`,
        `leclaire_devis_proforma_${magasinId}`,
        `leclaire_demande_devis_${magasinId}`,
        `leclaire_rdv_enligne_${magasinId}`,
      ];

      clesVides.forEach(cle => {
        if (!localStorage.getItem(cle)) {
          localStorage.setItem(cle, '[]');
        }
      });

      // 2. Copier les catalogues GLOBAUX vers le nouveau magasin
      const cataloguesGlobaux = [
        { source: 'leclaire_global_montures', dest: `leclaire_db_magasin-${magasinId}-montures` },
        { source: 'leclaire_global_accessoires', dest: `leclaire_db_magasin-${magasinId}-accessoires` },
        { source: 'leclaire_global_verres', dest: `leclaire_db_magasin-${magasinId}-verres` },
        { source: 'leclaire_global_services', dest: `leclaire_db_magasin-${magasinId}-services` },
        { source: 'leclaire_global_traitements', dest: `leclaire_db_magasin-${magasinId}-traitements` },
      ];

      cataloguesGlobaux.forEach(({ source, dest }) => {
        try {
          const donnees = localStorage.getItem(source);
          if (donnees) {
            // Copier les fiches produits, mais jamais le stock global : le stock
            // magasin vient seulement des distributions/transferts.
            const parsed = JSON.parse(donnees);
            const sanitized = Array.isArray(parsed)
              ? parsed.map((item: any) => ({ ...item, stock: 0, quantite: 0, quantiteDisponible: 0, stockReel: 0 }))
              : parsed;
            localStorage.setItem(dest, JSON.stringify(sanitized));
            logger.log(`✅ Catalogue copié sans stock global: ${source} → ${dest}`);
          } else {
            // Créer vide si pas de données globales
            localStorage.setItem(dest, '[]');
            logger.log(`⚠️ Pas de données globales pour ${source}, clé vide créée`);
          }
        } catch (error) {
          logger.error(`❌ Erreur copie catalogue ${source}:`, error);
          localStorage.setItem(dest, '[]');
        }
      });

      logger.log('✅ Magasin créé avec catalogues globaux copiés:', magasinId);
    }

    // Recharger la liste ET rester sur la page : l'utilisateur voit
    // immédiatement le magasin ajouté/modifié dans le tableau.
    chargerMagasins();
    const nomMag = form.label;
    const etaitModif = !!editingId;

    // ── Confirmation RÉELLE de l'enregistrement cloud ────────────────────────
    // Sur Chromium (Chrome/Opera) le push cloud passe en tâche de fond. Mais sur
    // Safari/Firefox, la session Supabase peut ne pas être maintenue (ITP /
    // restrictions de stockage) : le push était alors abandonné SILENCIEUSEMENT
    // alors que l'app affichait « enregistré ». On vérifie donc la session PUIS
    // on attend la confirmation du serveur avant d'annoncer le succès.
    const token = await getValidAccessToken();
    if (!token) {
      resetForm();
      alert(
        `⚠️ Magasin "${nomMag}" enregistré LOCALEMENT mais PAS synchronisé.\n\n` +
        `Votre session n'est pas active (fréquent sur Safari/Firefox ou en navigation privée, ` +
        `qui bloquent le stockage de session). Reconnectez-vous, puis rouvrez cette page : ` +
        `le magasin sera alors poussé vers le cloud et visible sur tous les appareils.`
      );
      return;
    }

    try {
      // Push explicite de la liste complète + attente de la réponse serveur.
      await saveToSupabase('leclaire_magasins', getMagasins(), true);
      alert(`✅ Magasin "${nomMag}" ${etaitModif ? 'modifié' : 'créé'} et synchronisé sur tous les appareils.`);
    } catch (err) {
      logger.error('❌ Échec synchronisation cloud du magasin:', err);
      alert(
        `⚠️ Magasin "${nomMag}" enregistré localement, mais la synchronisation cloud a échoué.\n\n` +
        `Détail: ${err instanceof Error ? err.message : String(err)}\n\n` +
        `Vérifiez votre connexion Internet puis réessayez.`
      );
    }
    resetForm();
  }

  function retourAccueil() {
    navigate('/espace-administrateur');
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={retourAccueil}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft size={18} />
            Retour
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Gestion des Magasins</h1>
        </div>
        <div className="flex items-center gap-3">
          <AddButton
            onClick={handleAjouter}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Ajouter un Magasin
          </AddButton>
        </div>
      </div>

      {/* Formulaire d'ajout/modification */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingId ? 'Modifier le Magasin' : 'Ajouter un Magasin'}
              </h2>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID du Magasin <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  disabled={!!editingId}
                  placeholder="ex: bingerville"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Utilisé dans l'URL (ex: /magasin/bingerville/dashboard)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du Magasin <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder={`ex: ${libellesMagasins()[0] ?? TENANT.nom}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse
                </label>
                <input
                  type="text"
                  value={form.adresse || ''}
                  onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                  placeholder="Adresse du magasin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={form.telephone || ''}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  placeholder="ex: +225 XX XX XX XX XX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ex: contact@leclaire.ci"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="actif"
                  checked={form.actif !== false}
                  onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="actif" className="text-sm font-medium text-gray-700">
                  Magasin actif
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSauvegarder}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Save size={18} />
                Sauvegarder
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-400 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste des magasins */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Nom
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Adresse
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Téléphone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Statut
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {magasins.map((magasin) => (
              <tr key={magasin.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {magasin.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {magasin.label}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {magasin.adresse || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {magasin.telephone || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      magasin.actif !== false
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {magasin.actif !== false ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleModifier(magasin)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Modifier"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleSupprimer(magasin.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Supprimer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {magasins.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Aucun magasin enregistré
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Information</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Les magasins sont stockés dans le navigateur (localStorage)</li>
          <li>• L'ID du magasin est utilisé dans les URLs et ne peut pas être modifié après création</li>
          <li>• Le nom du magasin s'affiche dans l'interface</li>
          <li>• Les magasins actifs sont visibles dans l'espace administrateur</li>
        </ul>
      </div>
    </div>
  );
}
