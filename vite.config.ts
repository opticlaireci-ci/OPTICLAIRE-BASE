import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Découpage manuel du bundle vendor (n'affecte QUE le build de production, ex.
  // Vercel ; le serveur de dev Make utilise esbuild et ignore cette option).
  // Objectif : sortir les libs lourdes (MUI, Recharts, xlsx/jsPDF) du chunk
  // principal pour qu'elles ne soient plus chargées au premier écran.
  build: {
    rollupOptions: {
      output: {
        // Forme « fonction » : seuls les fichiers de ces bibliothèques vont dans
        // leur paquet. La forme « liste » y entraînait aussi de petits modules
        // partagés (aides de compilation) dont le démarrage dépend : le paquet
        // Excel/PDF (≈ 850 Ko) était alors téléchargé à CHAQUE ouverture du site.
        manualChunks(id) {
          // Petites aides internes de Vite (chargement à la demande) : sans ce
          // rangement, elles atterrissaient dans le paquet Excel/PDF et le
          // démarrage téléchargeait alors tout ce paquet.
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers') || id.includes('modulepreload-polyfill')) return 'runtime';
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(@mui|@emotion)\//.test(id)) return 'vendor-mui';
          if (/node_modules\/recharts\//.test(id)) return 'vendor-charts';
          if (/node_modules\/(xlsx|jspdf|jspdf-autotable)\//.test(id)) return 'vendor-export';
          return undefined;
        },
      },
    },
  },
})
