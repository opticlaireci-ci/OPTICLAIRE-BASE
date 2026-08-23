/**
 * POLITIQUE DE MOT DE PASSE — MIROIR CÔTÉ CLIENT
 *
 * Reproduit `validatePasswordStrength` de l'edge function
 * (`supabase/functions/server/index.tsx`). Le compte PROPRIÉTAIRE (super_admin,
 * le plus sensible) peut être créé via le flux de bootstrap CLIENT quand l'edge
 * function n'est pas encore joignable : il doit donc respecter la MÊME exigence
 * (≥ 10 caractères + majuscule + minuscule + chiffre) pour ne pas contourner la
 * politique serveur avec un mot de passe faible.
 *
 * ⚠️ Garder synchronisé avec la version serveur.
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 10) {
    return 'Le mot de passe doit contenir au moins 10 caractères.';
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (!hasLower || !hasUpper || !hasDigit) {
    return 'Le mot de passe doit contenir majuscules, minuscules et chiffres.';
  }
  return null; // ok
}
