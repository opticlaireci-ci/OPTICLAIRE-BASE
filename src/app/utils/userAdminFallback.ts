/**
 * REPLI CÔTÉ CLIENT — GESTION DES UTILISATEURS SANS EDGE FUNCTION
 *
 * L'edge function `make-server-8ddbb853` porte normalement l'administration des
 * comptes (création via l'API admin `service_role`, écriture des rôles, etc.).
 * Tant qu'elle n'est pas déployée (préflight CORS / 404), ce module prend le
 * relais en s'appuyant UNIQUEMENT sur PostgREST + l'auth publique :
 *
 *   • lister / créer / modifier / supprimer les DROITS (user_meta) en direct ;
 *   • créer le compte Auth via `signUp` sur un client SECONDAIRE isolé, pour ne
 *     PAS écraser la session de l'administrateur connecté.
 *
 * ⚠️ Limites (nécessitent la vraie edge function, service_role) :
 *   • la SUPPRESSION efface les droits (user_meta) mais PAS le compte Auth ;
 *   • le CHANGEMENT DE MOT DE PASSE d'un autre utilisateur est impossible ici ;
 *   • la confirmation d'email doit être DÉSACTIVÉE dans Supabase
 *     (Authentication → Settings → « Confirm email ») pour que `signUp` rende
 *     immédiatement un compte utilisable.
 *
 * SÉCURITÉ : ces écritures passent par la RLS. Elles n'aboutissent que si
 * l'appelant est admin (`est_admin()`), grâce aux policies « admin gère
 * user_meta » du script d'installation (voir supabase/INSTALLATION_*.sql).
 */
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { supabase, KV_TABLE_NAME } from './supabaseClient';
import { logger } from './logger';

const supabaseUrl = `https://${projectId}.supabase.co`;

// Client isolé dédié à la CRÉATION de comptes. persistSession:false +
// storageKey distinct → un `signUp` ici n'altère jamais la session de l'admin
// gérée par le client principal `supabase`.
const authFactory = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'opticlaire_user_factory',
  },
});

export interface DirectAssignment {
  magasin_id: string;
  role: string;
}

export interface DirectUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  telephone: string;
  created_at: string;
  assignments: DirectAssignment[];
  menuAccess: string[];
}

export interface DirectUserPayload {
  email: string;
  password?: string;
  nom: string;
  prenom: string;
  telephone: string;
  assignments: DirectAssignment[];
  menuAccess: string[];
}

/** Vrai si l'erreur indique que l'edge function est injoignable (CORS/réseau/404). */
export function isEdgeUnreachable(err: unknown): boolean {
  if (err instanceof TypeError) return true; // « Failed to fetch » (CORS/réseau)
  if ((err as { name?: string })?.name === 'AbortError') return true; // timeout requête
  const msg = (err as { message?: string })?.message || '';
  return /failed to fetch|networkerror|load failed|\(404\)|not[_ ]?found/i.test(msg);
}

function metaToUser(key: string, value: Record<string, unknown> | null): DirectUser {
  const v = value || {};
  const magasins = Array.isArray(v.magasins) ? (v.magasins as Array<Record<string, unknown>>) : [];
  return {
    id: key.replace('user_meta:', ''),
    email: String(v.email || ''),
    nom: String(v.nom || ''),
    prenom: String(v.prenom || ''),
    telephone: String(v.telephone || ''),
    created_at: String(v.created_at || ''),
    assignments: magasins
      .filter(m => m && m.magasin_id)
      .map(m => ({ magasin_id: String(m.magasin_id), role: String(m.role || '') })),
    menuAccess: Array.isArray(v.menuAccess) ? (v.menuAccess as string[]) : [],
  };
}

/** Liste tous les utilisateurs à partir des clés `user_meta:*` (RLS admin requise). */
export async function listUsersDirect(): Promise<DirectUser[]> {
  const { data, error } = await supabase
    .from(KV_TABLE_NAME)
    .select('key,value')
    .like('key', 'user_meta:%');
  if (error) {
    throw new Error(
      `Lecture directe des utilisateurs échouée : ${error.message}. ` +
      `Vérifiez que les policies « admin gère user_meta » ont été appliquées dans Supabase.`,
    );
  }
  return (data || []).map(r => metaToUser(r.key as string, r.value as Record<string, unknown>));
}

/** Crée un compte Auth (client isolé) puis écrit ses droits (user_meta). */
export async function createUserDirect(payload: DirectUserPayload): Promise<void> {
  if (!payload.email || !payload.password) {
    throw new Error('Email et mot de passe sont requis pour créer un utilisateur.');
  }

  // 1. Compte Auth via le client isolé → n'écrase PAS la session de l'admin.
  const { data, error } = await authFactory.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: { data: { name: `${payload.prenom} ${payload.nom}`.trim() } },
  });
  if (error) {
    throw new Error(`Création du compte Auth échouée : ${error.message}`);
  }
  const uid = data.user?.id;
  if (!uid) {
    throw new Error(
      'Compte non finalisé : Supabase attend une confirmation par email. ' +
      'Désactivez « Confirm email » dans Authentication → Settings, puis réessayez.',
    );
  }

  // 2. Droits (user_meta) écrits via la session ADMIN (client principal).
  const value = {
    user_id: uid,
    email: payload.email,
    nom: payload.nom,
    prenom: payload.prenom,
    telephone: payload.telephone,
    created_at: new Date().toISOString(),
    magasins: payload.assignments.map(a => ({ magasin_id: a.magasin_id, role: a.role })),
    permissions: [],
    menuAccess: payload.menuAccess || [],
  };
  const { error: metaErr } = await supabase
    .from(KV_TABLE_NAME)
    .upsert({ key: `user_meta:${uid}`, value });

  // On nettoie la session en mémoire du client isolé (pas de token qui traîne).
  await authFactory.auth.signOut({ scope: 'local' }).catch(() => {});

  if (metaErr) {
    throw new Error(
      `Compte Auth créé mais droits non enregistrés : ${metaErr.message}. ` +
      `Vérifiez les policies « admin gère user_meta » dans Supabase.`,
    );
  }
}

/** Met à jour les droits (user_meta) d'un utilisateur existant. */
export async function updateUserDirect(id: string, payload: DirectUserPayload): Promise<void> {
  const { data: existing } = await supabase
    .from(KV_TABLE_NAME)
    .select('value')
    .eq('key', `user_meta:${id}`)
    .maybeSingle();

  const prev = (existing?.value as Record<string, unknown>) || {};
  const value = {
    ...prev,
    user_id: id,
    email: payload.email || prev.email || '',
    nom: payload.nom ?? prev.nom ?? '',
    prenom: payload.prenom ?? prev.prenom ?? '',
    telephone: payload.telephone ?? prev.telephone ?? '',
    magasins: payload.assignments.map(a => ({ magasin_id: a.magasin_id, role: a.role })),
    menuAccess: payload.menuAccess ?? (prev.menuAccess as string[]) ?? [],
  };

  const { error } = await supabase
    .from(KV_TABLE_NAME)
    .upsert({ key: `user_meta:${id}`, value });
  if (error) {
    throw new Error(`Mise à jour des droits échouée : ${error.message}.`);
  }

  if (payload.password) {
    // Changer le mot de passe d'un AUTRE utilisateur exige l'API admin
    // (service_role) → indisponible côté client. On informe sans bloquer.
    logger.warn(
      'ℹ️ Mot de passe non modifié : le changement de mot de passe d\'un autre ' +
      'utilisateur nécessite l\'edge function (service_role).',
    );
    throw new Error(
      'Droits mis à jour, mais le mot de passe ne peut PAS être changé sans ' +
      'l\'edge function (déployez-la pour cette opération). L\'utilisateur peut ' +
      'utiliser « mot de passe oublié » pour le réinitialiser lui-même.',
    );
  }
}

/** Supprime les DROITS (user_meta). Le compte Auth subsiste (voir en-tête). */
export async function deleteUserDirect(id: string): Promise<void> {
  const { error } = await supabase
    .from(KV_TABLE_NAME)
    .delete()
    .eq('key', `user_meta:${id}`);
  if (error) {
    throw new Error(`Suppression des droits échouée : ${error.message}.`);
  }
}
