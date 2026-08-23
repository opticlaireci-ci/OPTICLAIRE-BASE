import { logger } from './utils/logger';
import './utils/chunkReload';
import './utils/silenceRechartsKeyWarning';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './contexts/AuthContext';
import { SyncProvider } from './contexts/SyncContext';
import { SeasonProvider } from './contexts/SeasonContext';
import { IdleTimeout } from './components/IdleTimeout';
import { FirebaseErrorBanner } from './components/FirebaseErrorBanner';
import { ensureCataloguesMigration } from './utils/syncCataloguesToMagasins';
import { enableAutoSync } from './services/autoSync';
import { supabaseHealthCheck } from './utils/supabaseDirect';
import { lancerEnvoisAutomatiques } from './services/smsService';
import { prefetchRoutes } from './utils/prefetchRoutes';

export default function App() {
  useEffect(() => {
    // Garantit un viewport mobile correct
    let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1';

    ensureCataloguesMigration();

    // Précharge les pages les plus utilisées en tâche de fond → navigation
    // instantanée (plus d'écran « Chargement… » entre les pages).
    prefetchRoutes();

    enableAutoSync().catch(err => logger.error('❌ Échec activation auto-sync:', err));

    // Vérifie la connexion Supabase de bout en bout (log console).
    supabaseHealthCheck().catch(err => logger.error('❌ Supabase health check:', err));

    // Envois SMS automatiques du jour (anniversaires + lunettes prêtes).
    // Différé pour ne pas retarder le rendu initial.
    const t = setTimeout(() => {
      lancerEnvoisAutomatiques().catch(err => logger.error('❌ Envois SMS auto:', err));
    }, 20000);
    return () => clearTimeout(t);
  }, []);

  return (
    <AuthProvider>
      <SyncProvider>
        <SeasonProvider>
          <FirebaseErrorBanner />
          <RouterProvider router={router} />
        </SeasonProvider>
      </SyncProvider>
      <IdleTimeout />
    </AuthProvider>
  );
}