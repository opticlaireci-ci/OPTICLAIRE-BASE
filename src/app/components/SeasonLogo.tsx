import { useSeason } from '../contexts/SeasonContext';

/**
 * Logo festif affiché dans l'en-tête quand un « mode festif » est actif.
 * Rien n'est rendu si le mode est « aucun ». Gère aussi les logos personnalisés.
 */
export function SeasonLogo({ size = 30 }: { size?: number }) {
  const { activeMode: season } = useSeason();
  if (!season) return null;
  return (
    <img
      src={season.logo}
      alt={season.label}
      title={season.label}
      style={{ height: size, width: size, borderRadius: 6, objectFit: 'cover', marginRight: 8, flexShrink: 0 }}
    />
  );
}
