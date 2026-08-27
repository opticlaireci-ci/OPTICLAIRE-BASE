import { createBrowserRouter } from "react-router";
import { MainLayout } from "./layouts/MainLayout";
import { MagasinLayout } from "./layouts/MagasinLayout";

// Élément affiché pendant l'hydratation initiale des routes paresseuses.
// Sans lui, React Router v7 émet l'avertissement « No HydrateFallback element
// provided to render during initial hydration ».
function HydrateFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#d6e4ea",
        color: "#1a6f8c",
        fontSize: 14,
      }}
    >
      Chargement…
    </div>
  );
}

// Écran affiché pour TOUTE erreur non gérée sur une route (chunk manquant,
// erreur de rendu...) au lieu de l'écran brut « Unexpected Application
// Error! » de React Router. Propose un rechargement en un clic : dans
// l'immense majorité des cas (chunk périmé après un redéploiement, hoquet
// réseau) un simple rechargement récupère la dernière version et résout le
// problème.
function RouteErrorScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#d6e4ea",
        color: "#0f2f3a",
        fontSize: 14,
        textAlign: "center",
        padding: 24,
        gap: 16,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        Une erreur est survenue lors du chargement de cette page
      </div>
      <div style={{ maxWidth: 420, color: "#3a5a66" }}>
        Cela arrive généralement juste après une mise à jour de l'application.
        Rechargez la page pour récupérer la dernière version.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "10px 24px",
          borderRadius: 8,
          border: "none",
          backgroundColor: "#1a7a96",
          color: "white",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Recharger la page
      </button>
    </div>
  );
}

// Chaque page est chargée à la demande (code-splitting) pour accélérer
// le chargement initial et les transitions entre pages.

// Import dynamique résilient : après un redéploiement (ou un hoquet réseau),
// l'URL d'un chunk devient obsolète et `import()` échoue avec
// « Failed to fetch dynamically imported module ». Sans filet, React Router
// plante via son ErrorBoundary. On réessaie donc une fois, puis on force UN
// rechargement complet (une seule fois, via sessionStorage) pour récupérer les
// chunks à jour au lieu d'afficher un écran d'erreur.
//
// `expectedExport` : nom de l'export attendu dans le module. Un module chargé
// avec succès mais dont l'export attendu est absent (`mod[name] === undefined`)
// est TOUJOURS le symptôme d'un chunk périmé/mal formé (jamais un cas normal),
// donc traité exactement comme un échec de fetch : même retry, même
// rechargement automatique unique. Sans cette vérification explicite, on
// obtient un crash cryptique (« Cannot read properties of undefined ») au
// lieu du rechargement auto-réparateur.
async function importWithRetry(
  loader: () => Promise<Record<string, any>>,
  expectedExport: string,
): Promise<Record<string, any>> {
  const attempt = async (): Promise<Record<string, any>> => {
    const mod = await loader();
    if (!mod || typeof mod[expectedExport] === "undefined") {
      throw new Error(
        `Module chargé mais export "${expectedExport}" introuvable (chunk périmé ou build incomplet).`,
      );
    }
    return mod;
  };

  try {
    const mod = await attempt();
    // Un import a réussi → on réarme le mécanisme pour un futur redéploiement.
    try { sessionStorage.removeItem("chunk_reload_once"); } catch {}
    return mod;
  } catch (err) {
    try {
      // Deuxième tentative immédiate (couvre un simple hoquet réseau).
      return await attempt();
    } catch (err2) {
      const FLAG = "chunk_reload_once";
      const alreadyReloaded = sessionStorage.getItem(FLAG);
      if (!alreadyReloaded) {
        sessionStorage.setItem(FLAG, "1");
        window.location.reload();
        // On renvoie une promesse jamais résolue : la page se recharge.
        return new Promise<Record<string, any>>(() => {});
      }
      throw err2;
    }
  }
}

// Petit utilitaire pour transformer un export nommé en route paresseuse.
const lazyRoute = (
  loader: () => Promise<Record<string, any>>,
  name: string
) => async () => {
  const mod = await importWithRetry(loader, name);
  return { Component: mod[name] };
};

export const router = createBrowserRouter([
  {
    path: "/login",
    HydrateFallback,
    errorElement: <RouteErrorScreen />,
    lazy: lazyRoute(() => import("./pages/LoginPage"), "LoginPage"),
  },
  {
    path: "/magasins-select",
    HydrateFallback,
    errorElement: <RouteErrorScreen />,
    lazy: lazyRoute(() => import("./pages/gestion-magasin/SelectMagasinPage"), "SelectMagasinPage"),
  },
  {
    path: "/magasin/:magasinId",
    Component: MagasinLayout,
    HydrateFallback,
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, lazy: lazyRoute(() => import("./pages/AccueilPage"), "AccueilPage") },
      { path: "accueil", lazy: lazyRoute(() => import("./pages/AccueilPage"), "AccueilPage") },
      { path: "dashboard", lazy: lazyRoute(() => import("./pages/magasin/dashboard/MagasinDashboardPage"), "MagasinDashboardPage") },

      // Gestion Commercial
      { path: "commercial/demande-devis", lazy: lazyRoute(() => import("./pages/magasin/gestion-commercial/DemandeDevisPage"), "DemandeDevisPage") },
      { path: "commercial/devis-proforma", lazy: lazyRoute(() => import("./pages/magasin/gestion-commercial/DevisProformaPage"), "DevisProformaPage") },
      { path: "commercial/vente-flash", lazy: lazyRoute(() => import("./pages/magasin/gestion-commercial/VenteFlashPage"), "VenteFlashPage") },
      { path: "commercial/vente-facture", lazy: lazyRoute(() => import("./pages/magasin/gestion-commercial/VenteFacturePage"), "VenteFacturePage") },
      { path: "commercial/recouvrement", lazy: lazyRoute(() => import("./pages/magasin/gestion-commercial/RecouvrementPage"), "RecouvrementPage") },
      { path: "commercial/fiche-montage", lazy: lazyRoute(() => import("./pages/magasin/gestion-commercial/FicheMontagePage"), "FicheMontagePage") },

      // Gestion Clientèle
      { path: "clientele/clients", lazy: lazyRoute(() => import("./pages/magasin/gestion-clientele/ClientsPage"), "ClientsPage") },
      { path: "clientele/rdv-retrait", lazy: lazyRoute(() => import("./pages/magasin/gestion-clientele/RdvRetraitMagasinPage"), "RdvRetraitMagasinPage") },
      { path: "clientele/rdv-enligne", lazy: lazyRoute(() => import("./pages/magasin/gestion-clientele/RdvEnLigneMagasinPage"), "RdvEnLigneMagasinPage") },
      { path: "clientele/call-center", lazy: lazyRoute(() => import("./pages/magasin/gestion-clientele/CallCenterPage"), "CallCenterPage") },

      // Gestion de Stock
      { path: "stocks/bon-distribution", lazy: lazyRoute(() => import("./pages/magasin/gestion-stocks/BonDistributionMagasinPage"), "BonDistributionMagasinPage") },
      { path: "stocks/bon-transfert", lazy: lazyRoute(() => import("./pages/magasin/gestion-stocks/BonTransfertMagasinPage"), "BonTransfertMagasinPage") },
      { path: "stocks/bon-retour", lazy: lazyRoute(() => import("./pages/magasin/gestion-stocks/BonRetourMagasinPage"), "BonRetourMagasinPage") },
      { path: "stocks/etat-stock", lazy: lazyRoute(() => import("./pages/magasin/gestion-stocks/EtatStockMagasinPage"), "EtatStockMagasinPage") },

      // Mouvements Caisse
      { path: "mouvements-caisse", lazy: lazyRoute(() => import("./pages/magasin/MouvementsCaissePage"), "MouvementsCaissePage") },
    ],
  },
  {
    path: "/",
    Component: MainLayout,
    HydrateFallback,
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, lazy: lazyRoute(() => import("./pages/DashboardPage"), "DashboardPage") },
      { path: "accueil", lazy: lazyRoute(() => import("./pages/AccueilPage"), "AccueilPage") },

      // Gestion Magasin
      { path: "magasin", lazy: lazyRoute(() => import("./pages/gestion-magasin/MagasinPage"), "MagasinPage") },
      { path: "gerer-magasin", lazy: lazyRoute(() => import("./pages/gestion-magasin/GererMagasinPage"), "GererMagasinPage") },
      { path: "gestion-magasins", lazy: lazyRoute(() => import("./pages/GestionMagasinsPage"), "GestionMagasinsPage") },
      { path: "espace-administrateur", lazy: lazyRoute(() => import("./pages/EspaceAdministrateurPage"), "EspaceAdministrateurPage") },
      { path: "rdv-retrait", lazy: lazyRoute(() => import("./pages/RdvRetraitGlobalPage"), "RdvRetraitGlobalPage") },
      { path: "rdv-en-ligne", lazy: lazyRoute(() => import("./pages/RdvEnLigneGlobalPage"), "RdvEnLigneGlobalPage") },
      { path: "call-center", lazy: lazyRoute(() => import("./pages/CallCenterGlobalPage"), "CallCenterGlobalPage") },
      { path: "call-center/accueil", lazy: lazyRoute(() => import("./pages/CallCenterAccueilPage"), "CallCenterAccueilPage") },
      { path: "call-center/dashboard", lazy: lazyRoute(() => import("./pages/CallCenterDashboardPage"), "CallCenterDashboardPage") },
      { path: "geolocalisation", lazy: lazyRoute(() => import("./pages/GeolocalisationPage"), "GeolocalisationPage") },
      { path: "clients", lazy: lazyRoute(() => import("./pages/gestion-magasin/ClientPage"), "ClientPage") },
      { path: "utilisateurs", lazy: lazyRoute(() => import("./pages/GestionUtilisateursPage"), "GestionUtilisateursPage") },
      { path: "profils", lazy: lazyRoute(() => import("./pages/GestionProfilsPage"), "GestionProfilsPage") },

      // Gestion Comptabilité - Assurance
      { path: "comptabilite/assurance/factures", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/assurance/FactureAssurancePage"), "FactureAssurancePage") },
      { path: "comptabilite/assurance/factures/:magasinId", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/assurance/FactureAssuranceMagasinPage"), "FactureAssuranceMagasinPage") },
      { path: "comptabilite/assurance/releves", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/assurance/ReleveAssurancePage"), "ReleveAssurancePage") },
      { path: "comptabilite/assurance/reglements", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/assurance/ReglementAssurancePage"), "ReglementAssurancePage") },

      // Gestion Comptabilité - Fournisseur
      { path: "comptabilite/fournisseur/releve-commande", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/fournisseur/ReleveCommandePage"), "ReleveCommandePage") },
      { path: "comptabilite/fournisseur/reglement-verrier", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/fournisseur/ReglementVerrierPage"), "ReglementVerrierPage") },
      { path: "comptabilite/fournisseur/reglement", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/fournisseur/ReglementFournisseurPage"), "ReglementFournisseurPage") },

      // Gestion Comptabilité - Prestation
      { path: "comptabilite/prestation", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/prestation/PrestationPage"), "PrestationPage") },

      // Gestion Comptabilité - Mouvement
      { path: "comptabilite/mouvement", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/mouvement/MouvementPage"), "MouvementPage") },

      // Gestion Comptabilité - Récapitulatif Hebdomadaire (Recettes/Dépenses par magasin)
      { path: "comptabilite/recap-hebdomadaire", lazy: lazyRoute(() => import("./pages/gestion-comptabilite/recap/RecapHebdomadairePage"), "RecapHebdomadairePage") },

      // Mouvements Caisse Global
      { path: "mouvements-caisse-global", lazy: lazyRoute(() => import("./pages/MouvementsCaisseGlobalPage"), "MouvementsCaisseGlobalPage") },

      // Gestion Composants
      { path: "composants/montures", lazy: lazyRoute(() => import("./pages/gestion-composants/MonturePage"), "MonturePage") },
      { path: "composants/accessoires", lazy: lazyRoute(() => import("./pages/gestion-composants/AccessoiresPage"), "AccessoiresPage") },
      { path: "composants/services", lazy: lazyRoute(() => import("./pages/gestion-composants/ServicePage"), "ServicePage") },
      { path: "composants/categories", lazy: lazyRoute(() => import("./pages/gestion-composants/CategoriePage"), "CategoriePage") },
      { path: "composants/marques", lazy: lazyRoute(() => import("./pages/gestion-composants/MarquePage"), "MarquePage") },
      { path: "composants/couleurs", lazy: lazyRoute(() => import("./pages/gestion-composants/CouleurPage"), "CouleurPage") },
      { path: "composants/tailles", lazy: lazyRoute(() => import("./pages/gestion-composants/TaillePage"), "TaillePage") },
      { path: "composants/familles", lazy: lazyRoute(() => import("./pages/gestion-composants/FamillePage"), "FamillePage") },
      { path: "composants/verres", lazy: lazyRoute(() => import("./pages/gestion-composants/VerrePage"), "VerrePage") },
      { path: "composants/traitements", lazy: lazyRoute(() => import("./pages/gestion-composants/TraitementPage"), "TraitementPage") },
      { path: "composants/types-verre", lazy: lazyRoute(() => import("./pages/gestion-composants/TypeVerrePage"), "TypeVerrePage") },
      { path: "composants/matieres", lazy: lazyRoute(() => import("./pages/gestion-composants/MatierePage"), "MatierePage") },
      { path: "composants/diametres", lazy: lazyRoute(() => import("./pages/gestion-composants/DiametrePage"), "DiametrePage") },

      // Gestion Stocks
      { path: "stocks/bon-commande", lazy: lazyRoute(() => import("./pages/gestion-stocks/BonCommandePage"), "BonCommandePage") },
      { path: "stocks/bon-livraison", lazy: lazyRoute(() => import("./pages/gestion-stocks/BonLivraisonPage"), "BonLivraisonPage") },
      { path: "stocks/bon-distribution", lazy: lazyRoute(() => import("./pages/gestion-stocks/BonDistributionGlobalPage"), "BonDistributionGlobalPage") },
      { path: "stocks/bon-transfert", lazy: lazyRoute(() => import("./pages/gestion-stocks/BonTransfertGlobalPage"), "BonTransfertGlobalPage") },
      { path: "stocks/bon-retour", lazy: lazyRoute(() => import("./pages/gestion-stocks/BonRetourGlobalPage"), "BonRetourGlobalPage") },
      { path: "stocks/bon-peremption", lazy: lazyRoute(() => import("./pages/gestion-stocks/BonPeremptionPage"), "BonPeremptionPage") },
      { path: "stocks/inventaire", lazy: lazyRoute(() => import("./pages/gestion-stocks/InventairePage"), "InventairePage") },
      { path: "stocks/inventaire-lentilles", lazy: lazyRoute(() => import("./pages/gestion-stocks/InventaireLentillesPage"), "InventaireLentillesPage") },
      { path: "stocks/etat-stock", lazy: lazyRoute(() => import("./pages/gestion-stocks/EtatStockGlobalPage"), "EtatStockGlobalPage") },

      // Recherche
      { path: "recherche", lazy: lazyRoute(() => import("./pages/RecherchePage"), "RecherchePage") },

      // Gestion Acteurs
      { path: "acteurs/fournisseurs", lazy: lazyRoute(() => import("./pages/gestion-acteurs/FournisseurPage"), "FournisseurPage") },
      { path: "acteurs/assurances", lazy: lazyRoute(() => import("./pages/gestion-acteurs/AssurancePage"), "AssurancePage") },
      { path: "acteurs/prestataires", lazy: lazyRoute(() => import("./pages/gestion-acteurs/PrestatairePage"), "PrestatairePage") },
      { path: "acteurs/ophtalmologues", lazy: lazyRoute(() => import("./pages/gestion-acteurs/OphtalmologuePage"), "OphtalmologuePage") },
      { path: "acteurs/cabinets", lazy: lazyRoute(() => import("./pages/gestion-acteurs/CabinetOphtalmologuePage"), "CabinetOphtalmologuePage") },
      { path: "acteurs/modes-payement", lazy: lazyRoute(() => import("./pages/gestion-acteurs/ModePayementPage"), "ModePayementPage") },
      { path: "acteurs/comptes-banque", lazy: lazyRoute(() => import("./pages/gestion-acteurs/CompteBanquePage"), "CompteBanquePage") },

      // Paramétrage
      { path: "parametrage/configuration", lazy: lazyRoute(() => import("./pages/parametrage/ConfigurationPage"), "ConfigurationPage") },
      { path: "parametrage/enseigne", lazy: lazyRoute(() => import("./pages/parametrage/ConfigurationEnseignePage"), "ConfigurationEnseignePage") },
      { path: "parametrage/condition-commerciale", lazy: lazyRoute(() => import("./pages/parametrage/ConditionCommercialePage"), "ConditionCommercialePage") },
      { path: "parametrage/message-sms", lazy: lazyRoute(() => import("./pages/parametrage/MessageSmsPage"), "MessageSmsPage") },
      { path: "parametrage/configuration-sms", lazy: lazyRoute(() => import("./pages/parametrage/ConfigurationSmsPage"), "ConfigurationSmsPage") },

      // Synchronisation
      { path: "synchronisation", lazy: lazyRoute(() => import("./pages/SynchronisationPage"), "SynchronisationPage") },

      // Emploi du Temps
      { path: "emploi-du-temps", lazy: lazyRoute(() => import("./pages/EmploiDuTempsPage"), "EmploiDuTempsPage") },

      // Atelier
      { path: "atelier", lazy: lazyRoute(() => import("./pages/AtelierPage"), "AtelierPage") },

      // Visualisation et Historique
      { path: "visualisation", lazy: lazyRoute(() => import("./pages/VisualisationPage"), "VisualisationPage") },
      { path: "historique", lazy: lazyRoute(() => import("./pages/HistoriquePage"), "HistoriquePage") },
    ],
  },
]);
