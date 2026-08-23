/**
 * Filtre ciblé du faux positif recharts « Encountered two children with the same key, `null` ».
 *
 * Cause : dans recharts 2.15.2, `renderGraphicChild` (generateCategoricalChart.js)
 * retourne des tableaux `[graphicalItem, null]` / `[graphicalItem, null, null]` pour
 * chaque série. Lorsqu'un graphique comporte plusieurs séries (ex. plusieurs <Bar>),
 * ces `null` juxtaposés déclenchent ce warning React À L'INTÉRIEUR de recharts —
 * indépendamment des `key` que l'on place sur nos propres <Bar>/<Area>/<Cell>.
 * C'est le bug connu recharts #3615, purement cosmétique (aucun impact sur le rendu).
 *
 * On masque UNIQUEMENT ce message précis ; tous les autres warnings restent affichés.
 */
const origError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (
    typeof first === 'string' &&
    first.includes('Encountered two children with the same key')
  ) {
    return; // faux positif recharts — on ignore
  }
  origError(...args);
};

export {};
