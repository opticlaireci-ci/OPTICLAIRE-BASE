/**
 * ANTI-DOUBLE ENREGISTREMENT — protège TOUS les boutons d'enregistrement.
 *
 * Problème réglé : un double clic (souris) ou un double toucher (tablette,
 * téléphone) sur « Enregistrer », « Valider », « Ajouter »… pendant que la
 * première demande part au serveur (numéro de reçu, de facture, de bon…)
 * créait DEUX enregistrements identiques : deux règlements, deux mouvements
 * de caisse, deux bons, etc.
 *
 * Principe, valable pour toute l'application sans toucher à chaque écran :
 *   • au premier clic sur un bouton d'enregistrement, le bouton est verrouillé ;
 *   • les clics suivants sur CE bouton sont ignorés tant que les échanges avec
 *     le serveur lancés par ce clic ne sont pas terminés (20 s au plus) ;
 *   • pendant ce temps le bouton paraît « occupé » (curseur d'attente).
 * Une fois l'enregistrement terminé, le bouton fonctionne de nouveau normalement.
 */

/** Libellés des boutons qui ENREGISTRENT quelque chose. */
const LIBELLES_ENREGISTREMENT = /(enregistr|valid|sauvegard|confirm|cr[ée]er|ajout|import|transf[ée]r|livr|r[ée]ception|distribu|payer|paiement|solder|g[ée]n[ée]rer|envoy|soumettre|cl[ôo]tur|appliqu|termin|publier|dupliquer|convertir|facturer|encaisser|retourner|commander|mettre [àa] jour|modifier)/i;

/** Délai minimal de verrouillage, même sans échange réseau. */
const VERROU_MIN_MS = 700;
/** Calme réseau requis après la dernière requête lancée par le clic. */
const CALME_RESEAU_MS = 450;
/** Sécurité : le bouton n'est jamais bloqué plus longtemps que cela. */
const VERROU_MAX_MS = 20_000;

interface Verrou { debut: number; minuteur: ReturnType<typeof setInterval> }

let installe = false;
let requetesEnVol = 0;
/** Horodatage de début de chaque requête en cours. */
const debutsEnVol = new Map<number, number>();
let numeroRequete = 0;
let derniereFin = 0;
const verrous = new WeakMap<Element, Verrou>();

function libelleDe(el: Element): string {
  return [el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), (el as HTMLInputElement).value]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function boutonCible(cible: EventTarget | null): Element | null {
  if (!(cible instanceof Element)) return null;
  const el = cible.closest('button, [role="button"], input[type="submit"], input[type="button"]');
  if (!el || el.closest('[data-sans-anti-double]')) return null;
  const libelle = libelleDe(el);
  // « Ajouter une ligne » (verres, articles…) : simple ligne vide, pas un enregistrement.
  if (/\bligne/i.test(libelle)) return null;
  return LIBELLES_ENREGISTREMENT.test(libelle) ? el : null;
}

/** Des requêtes lancées APRÈS le clic sont-elles encore en cours ou toutes récentes ? */
function reseauOccupeDepuis(debutClic: number): boolean {
  for (const debut of debutsEnVol.values()) if (debut >= debutClic) return true;
  return derniereFin >= debutClic && Date.now() - derniereFin < CALME_RESEAU_MS;
}

function liberer(el: Element) {
  const v = verrous.get(el);
  if (v) clearInterval(v.minuteur);
  verrous.delete(el);
  el.removeAttribute('aria-busy');
  el.classList.remove('enregistrement-en-cours');
}

function verrouiller(el: Element) {
  const debut = Date.now();
  el.setAttribute('aria-busy', 'true');
  el.classList.add('enregistrement-en-cours');
  const minuteur = setInterval(() => {
    const ecoule = Date.now() - debut;
    if (!el.isConnected || ecoule > VERROU_MAX_MS) { liberer(el); return; }
    if (ecoule >= VERROU_MIN_MS && !reseauOccupeDepuis(debut)) liberer(el);
  }, 150);
  verrous.set(el, { debut, minuteur });
}

/** Compte les requêtes réseau en cours (enregistrements, numérotation…). */
function suivreLeReseau() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const fetchOrigine = window.fetch.bind(window);
  window.fetch = function (...args: Parameters<typeof fetch>) {
    const n = ++numeroRequete;
    debutsEnVol.set(n, Date.now());
    requetesEnVol++;
    return fetchOrigine(...args).finally(() => {
      debutsEnVol.delete(n);
      requetesEnVol = Math.max(0, requetesEnVol - 1);
      derniereFin = Date.now();
    });
  } as typeof fetch;
}

export function installerAntiDoubleEnregistrement(): void {
  if (installe || typeof document === 'undefined') return;
  installe = true;
  suivreLeReseau();
  // Phase de CAPTURE sur le document : passe AVANT les gestionnaires React.
  document.addEventListener('click', (e) => {
    const el = boutonCible(e.target);
    if (!el) return;
    if (verrous.has(el)) {
      // 2e clic pendant l'enregistrement : ignoré.
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    verrouiller(el);
  }, true);
  const style = document.createElement('style');
  style.textContent = '.enregistrement-en-cours{cursor:progress!important;opacity:.75}';
  document.head.appendChild(style);
}
