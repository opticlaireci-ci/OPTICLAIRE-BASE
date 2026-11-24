/**
 * Fusion des listes partagées (useLiveData) : voir `fusionnerListes`.
 */

/** Liste dont chaque élément est un objet avec un identifiant unique. */
export function listeAvecIds(v: unknown): v is Array<{ id: string | number }> {
  if (!Array.isArray(v)) return false;
  const vus = new Set<string>();
  for (const x of v) {
    const id = x && typeof x === 'object' ? (x as any).id : undefined;
    if (id === undefined || id === null || id === '') return false;
    const cle = String(id);
    if (vus.has(cle)) return false;
    vus.add(cle);
  }
  return true;
}

/**
 * FUSION À TROIS d'une liste partagée (même principe qu'un outil de suivi de
 * versions) : `base` = dernière version reçue du serveur, `locale` = ce que
 * l'utilisateur vient d'enregistrer, `distante` = version actuelle du serveur.
 * Les ajouts, modifications et suppressions faits ici ET ceux faits entre-temps
 * sur un autre appareil sont tous conservés. Avant, la liste entière
 * remplaçait celle du serveur : deux caissières qui ajoutaient un mouvement à
 * quelques secondes d'intervalle, et l'un des deux disparaissait.
 * En cas de conflit sur un même élément, la modification faite ici l'emporte ;
 * un élément modifié ici mais supprimé ailleurs est conservé.
 */
export function fusionnerListes<E extends { id: string | number }>(base: E[], locale: E[], distante: E[]): E[] {
  const json = (x: unknown) => JSON.stringify(x);
  const parId = (l: E[]) => new Map(l.map(x => [String(x.id), x]));
  const b = parId(base), d = parId(distante);
  const resultat: E[] = [];
  const places = new Set<string>();
  for (const x of locale) {
    const id = String(x.id);
    const avant = b.get(id), ailleurs = d.get(id);
    const modifieIci = !avant || json(avant) !== json(x);
    if (modifieIci) resultat.push(x);                       // ajouté ou modifié ici
    else if (ailleurs) resultat.push(ailleurs);              // inchangé ici : version du serveur
    else continue;                                           // supprimé ailleurs, inchangé ici
    places.add(id);
  }
  for (const x of distante) {
    const id = String(x.id);
    if (places.has(id)) continue;
    const avant = b.get(id);
    if (!avant) { resultat.push(x); continue; }              // ajouté ailleurs
    if (json(avant) !== json(x)) resultat.push(x);           // supprimé ici mais modifié ailleurs : conservé
    // sinon : supprimé ici → reste supprimé
  }
  return resultat;
}

/** Éléments d'un ensemble de marques SMS (liste d'identifiants, ou { id: 'AAAA-MM-JJ' } pour les marques du jour). */
function elementsMarques(v: unknown): Set<string> {
  if (Array.isArray(v)) return new Set(v.map(String));
  if (v && typeof v === 'object') {
    const auj = new Date().toISOString().slice(0, 10);
    // Marques du jour : { idClient: 'AAAA-MM-JJ' } — seules celles d'aujourd'hui comptent.
    return new Set(Object.entries(v as Record<string, unknown>).filter(([, d]) => String(d) === auj).map(([k]) => k));
  }
  return new Set();
}
export function fusionnerMarquesSms(base: unknown, serveur: unknown, local: unknown): unknown {
  const B = elementsMarques(base), S = elementsMarques(serveur), L = elementsMarques(local);
  const garder = (x: string) => (S.has(x) || L.has(x)) && !(B.has(x) && !L.has(x)) && !(B.has(x) && !S.has(x));
  const tous = [...(Array.isArray(serveur) ? serveur.map(String) : [...S]), ...(Array.isArray(local) ? local.map(String) : [...L])];
  const ids = [...new Set(tous)].filter(garder);
  const enObjet = !Array.isArray(local ?? serveur) && typeof (local ?? serveur) === 'object' && (local ?? serveur) !== null;
  if (enObjet) {
    const auj = new Date().toISOString().slice(0, 10);
    return Object.fromEntries(ids.map(id => [id, auj]));
  }
  return ids.slice(-4000);
}

/**
 * Base de la fusion à trois : la dernière version reçue du serveur si elle est
 * connue ; sinon, la liste affichée avant l'enregistrement RESTREINTE aux
 * éléments que le serveur possède aussi. Ainsi, sans référence fiable, la
 * fusion ne supprime jamais un élément qui n'existe que sur cet appareil
 * (au pire, un élément supprimé ailleurs réapparaît : aucune perte).
 */
export function baseDeFusion(serveur: unknown, avant: unknown, distante: unknown): Array<{ id: string | number }> {
  if (listeAvecIds(serveur)) return serveur;
  if (!listeAvecIds(avant)) return [];
  if (!listeAvecIds(distante)) return [];
  const surServeur = new Set(distante.map(x => String(x.id)));
  return avant.filter(x => surServeur.has(String(x.id)));
}
