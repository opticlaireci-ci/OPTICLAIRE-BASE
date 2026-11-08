import { compterSegmentsSms } from '../services/smsService';

/**
 * Sous un texte de SMS : nombre de caractères et nombre de SMS facturés par
 * Orange (160 caractères par SMS en texte simple, 70 si un caractère impose
 * l'Unicode), avec les caractères à remplacer pour revenir à 1 SMS.
 */
export function CompteurSms({ texte, className = '' }: { texte: string; className?: string }) {
  const d = compterSegmentsSms(texte);
  const plusieurs = d.segments > 1;
  return (
    <p className={`text-xs mt-1 ${plusieurs ? 'text-amber-700' : 'text-gray-500'} ${className}`} data-testid="compteur-sms">
      {texte.length} caractères · <strong>{d.segments} SMS</strong> facturé{plusieurs ? 's' : ''} par envoi
      {d.encodage === 'Unicode' ? (
        <> · Unicode (70 caractères par SMS) à cause de {d.horsGsm.map(c => `« ${c} »`).join(' ')}. Remplacez-les (par exemple ê → e, ô → o, À → A, « — » → « - ») pour passer à 160 caractères par SMS.</>
      ) : plusieurs ? (
        <> · plus de 160 caractères : message découpé en SMS de 153</>
      ) : null}
    </p>
  );
}
