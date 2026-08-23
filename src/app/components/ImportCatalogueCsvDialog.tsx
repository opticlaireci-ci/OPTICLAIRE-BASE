import React, { useState } from 'react';
import { logger } from '../utils/logger';
import {
  genererCatalogueCsv, parserCatalogueCsv, telechargerCsv,
  filtrerNouveautes, messageImport, libelleColonnes,
  type ModeleCsv,
} from '../utils/catalogueCsv';

/**
 * DIALOGUE D'IMPORT / EXPORT CSV D'UN CATALOGUE
 *
 * Composant unique partagé par les catalogues (verres, accessoires, services,
 * traitements). Il gère :
 *   • le téléchargement du fichier modèle DÉJÀ RENSEIGNÉ avec l'existant, pour
 *     que l'utilisateur complète son catalogue dans Excel plutôt que de repartir
 *     d'une page blanche ;
 *   • la relecture du fichier, l'exclusion des doublons et le compte-rendu.
 *
 * La page appelante reste responsable d'ajouter les identifiants, l'audit et la
 * synchronisation vers les magasins, via `onImporter`.
 */
interface Props {
  /** Intitulé du catalogue, affiché dans le titre (« Verres », « Services »…). */
  titre: string;
  /** Définition des colonnes et de la règle de doublon (voir utils/catalogueCsv). */
  modele: ModeleCsv;
  /** Éléments déjà enregistrés : servent à l'export et à la détection de doublons. */
  existants: any[];
  /** Reçoit les lignes NOUVELLES (doublons déjà écartés). */
  onImporter: (nouvelles: Record<string, any>[]) => void;
  onClose: () => void;
}

export function ImportCatalogueCsvDialog({ titre, modele, existants, onImporter, onClose }: Props) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Note d'aide affichée uniquement si le modèle comporte une colonne
  // « Gestion Stock » (les services et traitements n'en ont pas).
  const colonneStock = modele.colonnes.findIndex(c => c.type === 'stock01');

  const handleTelecharger = () => {
    telechargerCsv(genererCatalogueCsv(existants, modele.colonnes), modele.nom);
  };

  const handleImporter = async () => {
    if (!fichier) {
      alert('Veuillez sélectionner un fichier');
      return;
    }
    setEnCours(true);
    try {
      const { lignes, ignorees } = parserCatalogueCsv(await fichier.text(), modele.colonnes);

      if (lignes.length === 0) {
        alert(
          `❌ Aucune ligne exploitable dans le fichier.\n\n`
          + `Vérifiez que le séparateur est le point-virgule « ; » et que la 1re `
          + `colonne (${modele.colonnes[0].libelle}) est renseignée.`
        );
        return;
      }

      const { nouvelles, doublons } = filtrerNouveautes(existants, lignes, modele.dedup);
      if (nouvelles.length === 0) {
        alert(`ℹ️ Aucune nouveauté : les ${doublons} ligne(s) du fichier sont déjà enregistrées.`);
        onClose();
        return;
      }

      onImporter(nouvelles);
      alert(messageImport(nouvelles.length, doublons, ignorees));
      onClose();
    } catch (e) {
      logger.warn(`Import ${modele.nom}: lecture impossible`, e);
      alert("❌ Impossible de lire le fichier. Vérifiez qu'il s'agit bien d'un .csv.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100">
          <span className="font-semibold text-gray-800">Importer Fichier — {titre}</span>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 font-bold text-lg px-1">×</button>
        </div>

        <div className="p-6">
          <p className="mb-2 text-gray-700">Renseigner le fichier {modele.nom}.csv télécharger</p>
          <p className="mb-2 text-gray-700">{libelleColonnes(modele.colonnes)}</p>
          {colonneStock >= 0 && (
            <p className="mb-2 text-gray-700">
              Dans la {colonneStock + 1}ème colonne si la gestion de stock est prise en compte
              écrire 1 si non 0.
            </p>
          )}
          <p className="mb-4 text-gray-600">
            Séparateur : point-virgule « ; ». Seule la colonne 1
            ({modele.colonnes[0].libelle}) est obligatoire.
          </p>

          {/* Export du modèle DÉJÀ RENSEIGNÉ : l'utilisateur complète dans Excel
              puis réimporte le même fichier. Sert aussi de sauvegarde. */}
          <button
            onClick={handleTelecharger}
            className="mb-5 px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 bg-gray-100"
          >
            ⬇ Télécharger {modele.nom}.csv ({existants.length})
          </button>

          <div className="flex items-center gap-3">
            <span className="text-gray-600">Fichier <span className="text-red-500">*</span></span>
            <label className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 cursor-pointer hover:bg-gray-50 bg-gray-100">
              Charger
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => setFichier(e.target.files?.[0] ?? null)}
              />
            </label>
            <span className="text-gray-400">{fichier ? fichier.name : 'Aucun Fichier'}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-300 mx-6 mb-4" />
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-gray-700">
            Fermer
          </button>
          <button
            onClick={handleImporter}
            disabled={enCours}
            className="px-4 py-2 rounded text-white font-semibold disabled:opacity-60"
            style={{ backgroundColor: '#2563eb' }}
          >
            {enCours ? 'Import…' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
