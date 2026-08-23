import logoPaques from '../../imports/ChatGPT_Image_26_juil._2026__13_25_19.png';
import logoIndependance from '../../imports/ChatGPT_Image_26_juil._2026__13_36_19.png';
import logoFinAnnee from '../../imports/ChatGPT_Image_26_juil._2026__13_40_56.png';
import logoTabaski from '../../imports/ChatGPT_Image_26_juil._2026__13_32_15.png';
import logoCareme from '../../imports/ChatGPT_Image_26_juil._2026__13_29_14.png';
import logoNoel from '../../imports/ChatGPT_Image_26_juil._2026__13_43_49.png';

export type SeasonId = string;

export type SeasonEffet =
  | 'aucun'
  | 'neige'
  | 'feux'
  | 'confettis'
  | 'oeufs'
  | 'lune'
  | 'petales';

export interface SeasonMode {
  id: SeasonId;
  label: string;
  emoji: string;
  logo: string;
  couleur: string;
  effet: SeasonEffet;
  builtin?: boolean;
}

export const SEASON_MODES: SeasonMode[] = [
  { id: 'paques',       label: "Fete de Paques",          emoji: '🐰', logo: logoPaques,       couleur: '#f5a3c7', effet: 'oeufs',     builtin: true },
  { id: 'independance', label: "Fete de l'Independance",  emoji: '🇨🇮', logo: logoIndependance, couleur: '#f77f00', effet: 'confettis', builtin: true },
  { id: 'fin-annee',    label: "Fete de fin d'annee",     emoji: '🎉', logo: logoFinAnnee,     couleur: '#d4af37', effet: 'feux',      builtin: true },
  { id: 'tabaski',      label: "Fete de Tabaski",         emoji: '🐏', logo: logoTabaski,      couleur: '#2e8b57', effet: 'lune',      builtin: true },
  { id: 'careme',       label: "Fete de Careme",          emoji: '✝️', logo: logoCareme,       couleur: '#6a4c93', effet: 'petales',   builtin: true },
  { id: 'noel',         label: "Fete de Noel",            emoji: '🎄', logo: logoNoel,         couleur: '#c1121f', effet: 'neige',     builtin: true },
];

export const EFFET_OPTIONS: { value: SeasonEffet; label: string }[] = [
  { value: 'aucun',     label: 'Aucune animation' },
  { value: 'neige',     label: 'Neige (Noel)' },
  { value: 'feux',      label: "Feux d'artifice" },
  { value: 'confettis', label: 'Confettis' },
  { value: 'oeufs',     label: 'Oeufs / fleurs' },
  { value: 'lune',      label: 'Lune / lanternes' },
  { value: 'petales',   label: 'Petales / colombes' },
];

export const getSeasonMode = (id: SeasonId | undefined): SeasonMode | undefined =>
  SEASON_MODES.find(m => m.id === id);
