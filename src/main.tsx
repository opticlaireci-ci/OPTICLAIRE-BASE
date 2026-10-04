// EN PREMIER : localStorage plein → copie locale conservée en mémoire + IndexedDB
// (voir cacheSecours.ts). Doit être installé avant le chargement des autres modules.
import { installerCacheSecours, prechargerCacheSecours } from './app/utils/cacheSecours';
installerCacheSecours();

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './adminStockListDesktop.css';
import App from './app/App';

// Les copies locales rangées dans IndexedDB sont rechargées AVANT l'affichage
// (au plus ~1,5 s, en général quelques ms) : les pages s'ouvrent déjà remplies.
void prechargerCacheSecours().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
