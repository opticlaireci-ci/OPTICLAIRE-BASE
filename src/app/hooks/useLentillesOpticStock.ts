import { useCallback } from 'react';
import { useLiveData } from './useLiveData';
import { OPTIC_STORAGE_KEY } from '../pages/lentillesOpticData';
import type { Cell } from '../pages/lentillesOpticData';
import { trouverCase } from '../services/lentillesOpticStock';
import type { LentilleVendue } from '../services/lentillesOpticStock';

type Overrides = Record<string, Record<string, Record<string, Cell>>>;

/**
 * Lecture temps réel du stock « Lentilles OPTIC ».
 *
 * Renvoie une fonction `getRestant(verre)` qui donne le Restant (Initial − Monté)
 * de la case correspondant à un verre, ou `null` si aucune case dédiée n'existe.
 * Sert à colorer les champs de la facture (vert = disponible, rouge = indisponible).
 */
export function useLentillesOpticStock() {
  const [overrides] = useLiveData<Overrides>(OPTIC_STORAGE_KEY, {} as any);

  return useCallback(
    (v: LentilleVendue): number | null => {
      const c = trouverCase(v);
      if (!c) return null;
      const store = overrides as unknown as Overrides;
      const cell: Cell = store[c.tableId]?.[c.row]?.[c.col] ?? c.table.seed[c.row]?.[c.col] ?? [0, 0];
      return cell[0] - cell[1];
    },
    [overrides],
  );
}
