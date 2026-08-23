// ── Contenu personnalisable de la page d'accueil (partagé à tous les users) ───
import { TENANT } from '../config/tenant';

/** Un bloc/annonce affiché sur la page d'accueil. */
export interface AccueilBlock {
  id: string;
  title: string;
  message: string;
}

export interface AccueilContent {
  /** Titre principal de la carte de bienvenue. */
  title: string;
  /** Message principal de la carte de bienvenue. */
  message: string;
  /** Blocs/annonces supplémentaires ajoutés par l'administrateur. */
  blocks: AccueilBlock[];
}

export const ACCUEIL_CONTENT_KEY = 'leclaire_accueil_content';

export const DEFAULT_ACCUEIL_CONTENT: AccueilContent = {
  title: `Bienvenue dans votre espace ${TENANT.nom}`,
  message: 'Accédez rapidement à vos outils quotidiens. Sélectionnez une action ci-dessous pour commencer.',
  blocks: [],
};

export function newAccueilBlock(): AccueilBlock {
  return {
    id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    message: '',
  };
}

/** Normalise n'importe quelle valeur stockée vers un AccueilContent valide. */
function normalize(parsed: any): AccueilContent {
  const blocks: AccueilBlock[] = Array.isArray(parsed?.blocks)
    ? parsed.blocks
        .filter((b: any) => b && (b.title || b.message))
        .map((b: any, i: number) => ({
          id: typeof b.id === 'string' && b.id ? b.id : `blk_${i}`,
          title: typeof b.title === 'string' ? b.title : '',
          message: typeof b.message === 'string' ? b.message : '',
        }))
    : [];
  return {
    title: typeof parsed?.title === 'string' && parsed.title ? parsed.title : DEFAULT_ACCUEIL_CONTENT.title,
    message: typeof parsed?.message === 'string' ? parsed.message : DEFAULT_ACCUEIL_CONTENT.message,
    blocks,
  };
}

/** Lecture SYNCHRONE depuis le cache localStorage (affichage instantané). */
export function readAccueilContent(): AccueilContent {
  try {
    const raw = localStorage.getItem(ACCUEIL_CONTENT_KEY);
    if (!raw) return { ...DEFAULT_ACCUEIL_CONTENT, blocks: [] };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ACCUEIL_CONTENT, blocks: [] };
  }
}

/**
 * Enregistre le contenu dans le cache local ET sur Supabase (source partagée),
 * afin que tous les utilisateurs et appareils voient la même page d'accueil.
 * Stocké côté cloud sous forme de tableau à un élément (saveToSupabase ignore
 * les tableaux vides mais accepte les tableaux non vides).
 */
export async function saveAccueilContent(content: AccueilContent): Promise<void> {
  const clean = normalize(content);
  localStorage.setItem(ACCUEIL_CONTENT_KEY, JSON.stringify(clean));
  const { saveToSupabase } = await import('../services/supabaseRealtime');
  await saveToSupabase(ACCUEIL_CONTENT_KEY, [clean]);
}

/** Chargement depuis le cloud ; renvoie le contenu partagé ou le défaut. */
export async function loadAccueilContent(): Promise<AccueilContent> {
  try {
    const { loadFromSupabase } = await import('../services/supabaseRealtime');
    const rows = await loadFromSupabase<any>(ACCUEIL_CONTENT_KEY, []);
    if (rows[0]) {
      const content = normalize(rows[0]);
      localStorage.setItem(ACCUEIL_CONTENT_KEY, JSON.stringify(content));
      return content;
    }
  } catch { /* cloud indisponible : on garde le cache */ }
  return readAccueilContent();
}
