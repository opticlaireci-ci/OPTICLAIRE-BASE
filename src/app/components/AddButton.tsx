import React from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { canAdd, moduleFromPath } from '../utils/actionRights';

/**
 * Bouton « Ajouter » bridé par le droit d'action `action:add`.
 *
 * Rendu identique à un <button> classique (mêmes props : className, style,
 * onClick, children…). Si l'utilisateur connecté n'a PAS le droit d'ajouter,
 * le bouton est désactivé (grisé + curseur interdit + info-bulle) et son
 * onClick est neutralisé. Les administrateurs et les utilisateurs sans aucun
 * droit d'action configuré conservent l'accès (cf. canAdd).
 *
 * Le module concerné est auto-détecté depuis la route courante ; on peut le
 * forcer via la prop `module` (utile hors contexte de route reconnu).
 */
export function AddButton({
  onClick,
  disabled,
  title,
  style,
  module,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { module?: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const autorise = canAdd(user, module ?? moduleFromPath(location.pathname));

  return (
    <button
      {...rest}
      onClick={autorise ? onClick : undefined}
      disabled={disabled || !autorise}
      title={autorise ? title : "Vous n'avez pas le droit d'ajouter des données."}
      style={autorise ? style : { ...style, opacity: 0.5, cursor: 'not-allowed' }}
    />
  );
}

export default AddButton;
