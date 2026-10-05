// EN PREMIER : localStorage plein → copie locale conservée en mémoire + IndexedDB
// (voir cacheSecours.ts). Doit être installé avant le chargement des autres modules.
import { installerCacheSecours, prechargerCacheSecours } from './app/utils/cacheSecours';
installerCacheSecours();

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './adminStockListDesktop.css';
import App from './app/App';
import { ErreurGlobale } from './app/components/ErreurGlobale';

// Les copies locales rangées dans IndexedDB sont rechargées EN PARALLÈLE de
// l'affichage (jamais avant : l'application ne doit pas rester sur une page
// blanche). Le rechargement prend quelques millisecondes et se termine bien
// avant que l'utilisateur ait ouvert une page de données.
void prechargerCacheSecours();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErreurGlobale>
      <App />
    </ErreurGlobale>
  </React.StrictMode>
);
