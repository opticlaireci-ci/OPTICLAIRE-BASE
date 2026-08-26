import { createTheme, responsiveFontSizes } from '@mui/material/styles';

/**
 * Thème global de l'application.
 *
 * Objectif : que TOUTE la partie MUI de l'app (Dialog, Table, Grid, Container,
 * Menu, Drawer…) s'adapte automatiquement au type d'appareil / taille d'écran
 * SANS avoir à modifier chaque page individuellement. Les composants "faits
 * main" (divs custom, Tailwind) restent couverts par les règles globales de
 * `src/styles/globals.css`.
 */
let theme = createTheme({
  breakpoints: {
    // Les hooks `useMediaQuery(theme.breakpoints.down('md'))` déjà utilisés
    // dans MainLayout / MagasinLayout s'appuient sur ces mêmes seuils.
    values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
  },
  components: {
    // Toute boîte de dialogue s'adapte automatiquement à l'écran : marges
    // réduites et quasi plein écran sur mobile, sans toucher au code de
    // chaque modale existante dans l'application.
    MuiDialog: {
      styleOverrides: {
        paper: {
          margin: 16,
          width: 'calc(100% - 32px)',
          maxHeight: 'calc(100% - 32px)',
          '@media (max-width:600px)': {
            margin: 8,
            width: 'calc(100% - 16px)',
            maxHeight: 'calc(100% - 16px)',
            borderRadius: 8,
          },
        },
      },
    },
    // Les tableaux MUI défilent horizontalement au lieu de déborder / casser
    // la mise en page sur petit écran.
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          maxWidth: '100%',
        },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          paddingLeft: 12,
          paddingRight: 12,
          '@media (min-width:600px)': {
            paddingLeft: 24,
            paddingRight: 24,
          },
        },
      },
    },
    // Les menus/drawers ne dépassent jamais la largeur de l'écran.
    MuiPaper: {
      styleOverrides: {
        root: {
          maxWidth: '100vw',
        },
      },
    },
  },
});

// Ajuste automatiquement les tailles de police (h1…body) selon la largeur
// d'écran, pour tous les composants Typography de l'application.
theme = responsiveFontSizes(theme);

export default theme;
