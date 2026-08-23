import { logger } from '../utils/logger';
/**
 * AUTHENTIFICATION AVEC SUPABASE AUTH (Étape 1 de la migration)
 *
 * - Login avec email/password via Supabase Authentication
 * - Profil + rôles chargés depuis l'edge function `/me` (tables user_magasins /
 *   user_profiles côté Supabase)
 * - Session gérée par Supabase (persiste automatiquement)
 *
 * ⚠️ TRANSITION : les données métier vivent encore dans Firestore, qui exige un
 * token Firebase. On garde donc une connexion Firebase EN PARALLÈLE (best-effort,
 * mêmes identifiants) uniquement pour que l'hydratation des données continue de
 * fonctionner. Cette béquille sera retirée quand les données passeront sur Convex.
 */

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase, authHeaders, getValidAccessToken, refreshAccessToken, serverFetch, KV_TABLE_NAME } from '../utils/supabaseClient';
import type { UserRole } from '../utils/permissions';
import { isTransientNetworkError } from '../utils/networkErrors';
import { purgeBusinessCaches } from '../utils/secureStorage';
import { hydrateVentes, subscribeVentesRealtime } from '../services/ventesHydration';
import { hydrateAssurance, subscribeAssuranceRealtime } from '../services/assuranceHydration';
import { hydrateClients, subscribeClientsRealtime } from '../services/clientsHydration';
import { hydrateBons, subscribeBonsRealtime } from '../services/bonsHydration';
import { hydrateCatalogues, subscribeCataloguesRealtime } from '../services/catalogueHydration';
import { hydrateInventaires, subscribeInventairesRealtime } from '../services/inventairesHydration';
import {
  hydrateRdvEnligne,
  hydrateAtelier,
  hydrateEmplois,
  subscribeResidualRealtime,
} from '../services/residualHydration';

export interface User {
  id: string;
  email: string;
  nom?: string;
  prenom?: string;
  name?: string;
  role: UserRole;
  magasinIds: string[];
  magasinActuel?: string;
  permissions?: string[];
  /** Clés de boutons/menus explicitement autorisés (géré par l'admin). Vide/absent = pas de restriction fine. */
  menuAccess?: string[];
}

export interface LoginResult {
  success: boolean;
  /** Message d'erreur précis à afficher à l'utilisateur si `success` est faux. */
  error?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  setMagasinActuel: (magasinId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Lecture SYNCHRONE du dernier profil connu (cache) pour un démarrage instantané. */
function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem('leclaire_current_user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Session restaurée INSTANTANÉMENT depuis le cache : l'app s'affiche tout de
  // suite (plus d'écran blanc de plusieurs secondes au démarrage / à l'actualisation),
  // puis le profil est revalidé en arrière-plan via l'edge function `/me`.
  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [isLoading, setIsLoading] = useState(() => !readCachedUser());
  // useRef (et non un objet recréé à chaque rendu) : sinon le garde anti-duplication
  // ne persiste pas et l'hydratation Firebase (nombreux onSnapshot) se relance en
  // boucle, empilant les écouteurs et saturant l'app de re-rendus.
  const cleanupHydrationRef = useRef<(() => void) | null>(null);
  const hydratingForRef = useRef<string | null>(null);

  /**
   * Charge le profil depuis l'edge function Supabase `/me`.
   * Réponse attendue :
   *   { id, email, nom, prenom, telephone,
   *     magasins: [{ magasin_id, role }], permissions: string[], menuAccess: string[] }
   */
  /**
   * Profil tel que renvoyé par `/me`, ou reconstitué par le repli KV.
   */
  interface ProfilBrut {
    id: string;
    email: string;
    nom?: string;
    prenom?: string;
    magasins?: Array<{ magasin_id: string; role: string }>;
    permissions?: string[];
    menuAccess?: string[];
  }

  /**
   * Reconstitue le profil SANS l'edge function : identité depuis la session
   * Supabase, rôles depuis `user_meta:<uid>` lu directement dans la table KV.
   *
   * Utilisé quand `/me` répond 404 (fonction non déployée sur ce projet) ou
   * qu'elle est injoignable. Renvoie null si la lecture échoue ou si aucun
   * `user_meta` n'existe — dans ce cas le compte est réellement non configuré.
   */
  const profilDepuisKv = async (): Promise<ProfilBrut | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from(KV_TABLE_NAME)
        .select('value')
        .eq('key', `user_meta:${user.id}`)
        .maybeSingle();

      if (error) {
        logger.error('❌ Repli KV du profil impossible:', error.message);
        return null;
      }
      const meta = data?.value as
        | { magasins?: Array<{ magasin_id: string; role: string }>; permissions?: string[]; menuAccess?: string[] }
        | undefined;
      if (!meta) return null;

      logger.log('✅ Profil reconstitué depuis le KV (sans edge function)');
      return {
        id: user.id,
        email: user.email || '',
        nom: (user.user_metadata as any)?.nom || '',
        prenom: (user.user_metadata as any)?.prenom || '',
        magasins: meta.magasins || [],
        permissions: meta.permissions || [],
        menuAccess: meta.menuAccess || [],
      };
    } catch (err) {
      logger.error('❌ Repli KV du profil impossible:', err);
      return null;
    }
  };

  const fetchUserProfile = async (): Promise<User | null> => {
    try {
      logger.log('📥 Chargement profil utilisateur Supabase…');

      // Sans session valide, inutile d'appeler /me (la clé anon serait rejetée
      // « Invalid token »). On demande à l'utilisateur de se reconnecter.
      let token = await getValidAccessToken();
      if (!token) {
        logger.warn('⚠️ Aucune session valide — reconnexion nécessaire');
        return null;
      }

      const call = (t: string) =>
        serverFetch('/me', {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        });

      let profile: ProfilBrut | null = null;

      try {
        let res = await call(token);
        let json = await res.json().catch(() => ({}));

        // Token expiré/rejeté : on force un rafraîchissement et on réessaie une fois.
        if (res.status === 401 && (json?.error === 'Invalid token' || json?.error === 'No token')) {
          console.info('🔄 Token expiré — tentative de rafraîchissement…');
          const fresh = await refreshAccessToken();
          if (fresh) {
            res = await call(fresh);
            json = await res.json().catch(() => ({}));
          }
        }

        if (res.ok && json?.success) {
          profile = json.data as ProfilBrut;
        } else if (res.status === 401) {
          // Erreur de token → session invalide/expirée : déconnexion silencieuse
          // (le refresh token a déjà été purgé côté client) plutôt qu'une alerte
          // trompeuse ou un log d'erreur alarmant. L'utilisateur se reconnecte.
          console.info('ℹ️ Session expirée — reconnexion nécessaire.');
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          return null;
        } else {
          // 404 = edge function non déployée sur ce projet Supabase ; 5xx =
          // indisponible. Ce n'est PAS un compte mal configuré : on tente le repli.
          logger.warn(`⚠️ /me indisponible (HTTP ${res.status}) — repli sur la lecture directe du KV`);
        }
      } catch (err) {
        // Réseau/timeout : même repli.
        logger.warn('⚠️ /me injoignable — repli sur la lecture directe du KV', err);
      }

      // ── Repli sans edge function ─────────────────────────────────────────
      // `/me` n'apporte que deux choses : l'identité (déjà dans la session) et
      // le `user_meta:<uid>` du KV. La policy « user lit son propre user_meta »
      // autorise précisément cette lecture au rôle `authenticated`, donc le
      // profil reste chargeable tant que la fonction n'est pas (re)déployée.
      if (!profile) profile = await profilDepuisKv();

      if (!profile) {
        logger.error('❌ Profil Supabase indisponible (edge function ET repli KV)');
        alert('⚠️ Votre compte n\'est pas configuré.\n\nContactez l\'administrateur.');
        return null;
      }

      const userMagasins = profile.magasins || [];
      if (userMagasins.length === 0) {
        logger.error('❌ Utilisateur sans magasin assigné');
        alert('⚠️ Votre compte n\'est assigné à aucun magasin.\n\nContactez l\'administrateur.');
        return null;
      }

      const roleHierarchy: UserRole[] = ['super_admin', 'admin', 'manager', 'responsable_call_center', 'employee', 'caissier', 'guest'];
      const highestRole = userMagasins.reduce((best, current) => {
        const ci = roleHierarchy.indexOf(current.role as UserRole);
        const bi = roleHierarchy.indexOf(best as UserRole);
        const cScore = ci < 0 ? Infinity : ci;
        const bScore = bi < 0 ? Infinity : bi;
        return cScore < bScore ? current.role : best;
      }, userMagasins[0].role) as UserRole;

      const magasinIds = userMagasins.map(um => um.magasin_id);

      const savedMagasin = localStorage.getItem('leclaire_magasin_actuel');
      const magasinActuel = savedMagasin && magasinIds.includes(savedMagasin)
        ? savedMagasin
        : magasinIds[0];

      const emailPrefix = profile.email?.split('@')[0] || '';

      const userProfile: User = {
        id: profile.id,
        email: profile.email || '',
        nom: profile.nom || '',
        prenom: profile.prenom || emailPrefix,
        name: `${profile.prenom || emailPrefix} ${profile.nom || ''}`.trim(),
        role: highestRole,
        magasinIds,
        magasinActuel,
        permissions: profile.permissions || [],
        menuAccess: profile.menuAccess || [],
      };

      // Ne pas logger le profil complet (email, magasins, permissions) : évite
      // d'exposer des données d'identité dans la console du navigateur.
      logger.log('✅ Profil chargé');
      return userProfile;
    } catch (err) {
      logger.error('❌ Erreur fetchUserProfile:', err);
      return null;
    }
  };

  const startBusinessHydration = (userProfile: User) => {
    // L'hydratation lit désormais depuis SUPABASE (source de vérité unique) et
    // remplit le localStorage local pour un affichage instantané.
    if (hydratingForRef.current === userProfile.id) return;
    hydratingForRef.current = userProfile.id;
    cleanupHydrationRef.current?.();

    const cleanups: Array<() => void> = [];
    // Si le nettoyage (déconnexion) survient AVANT la résolution d'une
    // hydratation, l'abonnement créé ensuite doit être immédiatement défait —
    // sinon le poller `onSnapshot` continue de tourner après la déconnexion.
    let disposed = false;
    const register = (unsub: () => void) => {
      if (disposed) unsub();
      else cleanups.push(unsub);
    };

    hydrateVentes(userProfile.magasinIds).then(() => {
      register(subscribeVentesRealtime(userProfile.magasinIds));
    });
    hydrateAssurance(userProfile.magasinIds).then(() => {
      register(subscribeAssuranceRealtime(userProfile.magasinIds));
    });
    hydrateClients(userProfile.magasinIds).then(() => {
      register(subscribeClientsRealtime(userProfile.magasinIds));
    });
    hydrateBons(userProfile.magasinIds).then(() => {
      register(subscribeBonsRealtime(userProfile.magasinIds));
    });
    hydrateCatalogues().then(() => {
      register(subscribeCataloguesRealtime());
    });
    hydrateInventaires(userProfile.magasinIds).then(() => {
      register(subscribeInventairesRealtime(userProfile.magasinIds));
    });
    Promise.all([
      hydrateRdvEnligne(userProfile.magasinIds),
      hydrateAtelier(),
      hydrateEmplois(userProfile.magasinIds),
    ]).then(() => {
      register(subscribeResidualRealtime(userProfile.magasinIds));
    });

    cleanupHydrationRef.current = () => {
      disposed = true;
      cleanups.forEach(fn => fn());
      cleanups.length = 0;
    };
  };

  useEffect(() => {
    let mounted = true;

    // Démarrage instantané : si un profil est en cache, on lance TOUT DE SUITE
    // l'hydratation des données (sans attendre la revalidation réseau du profil).
    const cached = readCachedUser();
    if (cached) startBusinessHydration(cached);

    // 1) Restauration de session au démarrage (revalidation en arrière-plan).
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        // Pas de session valide : purger le profil en cache pour ne pas afficher
        // l'app à un utilisateur réellement déconnecté.
        setUser(null);
        localStorage.removeItem('leclaire_current_user');
        localStorage.removeItem('leclaire_magasin_actuel');
        setIsLoading(false);
        return;
      }
      try {
        const userProfile = await fetchUserProfile();
        if (mounted && userProfile) {
          setUser(userProfile);
          localStorage.setItem('leclaire_current_user', JSON.stringify(userProfile));
          startBusinessHydration(userProfile);
        } else if (mounted) {
          // Session expirée / profil indisponible : on repasse explicitement à
          // l'état déconnecté (et on purge le cache) pour que les routes
          // protégées redirigent immédiatement vers le login, sans dépendre du
          // seul événement SIGNED_OUT (asynchrone).
          setUser(null);
          localStorage.removeItem('leclaire_current_user');
          localStorage.removeItem('leclaire_magasin_actuel');
        }
      } catch (err) {
        logger.error('❌ Erreur chargement profil:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }).catch(err => {
      // `getSession()` elle-même a rejeté (Supabase injoignable, CSP, DNS…).
      // Sans ce catch, le `.then` ci-dessus n'est JAMAIS exécuté : le `finally`
      // qui libère `isLoading` non plus, l'état reste bloqué sur `true` et
      // MainLayout renvoie `null` → écran totalement blanc, sans erreur React
      // en console. On dégrade donc vers l'état déconnecté, ce qui affiche
      // l'écran de connexion au lieu du vide.
      logger.error('❌ getSession() injoignable — bascule en état déconnecté:', err);
      if (mounted) {
        setUser(null);
        setIsLoading(false);
      }
    });

    // 2) Réagir aux changements de session (logout dans un autre onglet, refresh…)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && mounted) {
        cleanupHydrationRef.current?.();
        cleanupHydrationRef.current = null;
        hydratingForRef.current = null;
        setUser(null);
        localStorage.removeItem('leclaire_current_user');
        localStorage.removeItem('leclaire_magasin_actuel');
        // Déconnexion (y compris depuis un autre onglet) : purge des caches
        // métier sensibles (audit ÉLEVÉ 3).
        purgeBusinessCaches();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (emailOrUsername: string, password: string): Promise<LoginResult> => {
    try {
      // Tolérance : si l'utilisateur tape juste un nom sans "@", on complète
      // automatiquement avec le domaine par défaut @leclaire.ci.
      const raw = emailOrUsername.trim();
      const email = raw.includes('@') ? raw : `${raw}@leclaire.ci`;
      // Ne pas logger l'email : identifiant de connexion à ne pas exposer console.
      logger.log('🔐 Tentative de connexion…');

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        logger.error('❌ Échec connexion Supabase:', error.message || error.name || error);
        const rawMsg = error.message || '';
        // Message précis : identifiants invalides vs erreur réseau/serveur.
        // Certaines erreurs réseau Supabase (AuthRetryableFetchError) reviennent
        // avec un message VIDE → on ne doit jamais renvoyer une erreur vide, ni
        // faire croire à tort à un mauvais mot de passe.
        let msg: string;
        if (/invalid login credentials/i.test(rawMsg)) {
          msg = 'Email ou mot de passe incorrect.';
        } else if (!rawMsg || isTransientNetworkError(error) || /failed to fetch|network/i.test(rawMsg)) {
          msg = 'Serveur injoignable. Vérifiez votre connexion internet puis réessayez.';
        } else {
          msg = `Connexion refusée : ${rawMsg}`;
        }
        return { success: false, error: msg };
      }

      const userProfile = await fetchUserProfile();
      if (!userProfile) {
        // Les identifiants étaient bons mais le profil n'a pas pu être chargé
        // (session/token, compte non configuré, aucun magasin…). On termine la
        // session pour éviter un état incohérent.
        await supabase.auth.signOut().catch(() => {});
        return {
          success: false,
          error: 'Identifiants corrects mais le profil est indisponible. Réessayez ; si le problème persiste, contactez l\'administrateur.',
        };
      }

      setUser(userProfile);
      localStorage.setItem('leclaire_current_user', JSON.stringify(userProfile));
      startBusinessHydration(userProfile);

      logger.log('🎉 Connexion complète !');
      return { success: true };
    } catch (err: any) {
      logger.error('❌ Exception login Supabase:', err?.message || err);
      const msg = isTransientNetworkError(err)
        ? 'Serveur injoignable. Vérifiez votre connexion internet puis réessayez.'
        : 'Erreur de connexion au serveur. Vérifiez votre connexion internet.';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      logger.log('👋 Déconnexion Supabase...');
      cleanupHydrationRef.current?.();
      cleanupHydrationRef.current = null;
      hydratingForRef.current = null;
      await supabase.auth.signOut();
      setUser(null);
      localStorage.removeItem('leclaire_current_user');
      localStorage.removeItem('leclaire_magasin_actuel');
      // Sécurité (audit ÉLEVÉ 3) : effacer les données personnelles/santé mises
      // en cache localement (clients, ventes, prescriptions…) — ré-hydratées à
      // la prochaine connexion depuis Supabase.
      purgeBusinessCaches();
      logger.log('✅ Déconnexion réussie');
    } catch (err) {
      logger.error('❌ Erreur déconnexion:', err);
    }
  };

  const setMagasinActuel = (magasinId: string) => {
    if (!user) return;
    if (!user.magasinIds.includes(magasinId)) {
      logger.error('❌ Magasin non autorisé:', magasinId);
      return;
    }
    const updatedUser = { ...user, magasinActuel: magasinId };
    setUser(updatedUser);
    localStorage.setItem('leclaire_current_user', JSON.stringify(updatedUser));
    localStorage.setItem('leclaire_magasin_actuel', magasinId);
    logger.log('✅ Magasin actuel changé:', magasinId);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
        setMagasinActuel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const authFallback: AuthContextType = {
  user: null,
  login: async () => ({ success: false }),
  logout: () => {},
  isAuthenticated: false,
  isLoading: false,
  setMagasinActuel: () => {},
};

let warnedOutsideProvider = false;

export function useAuth() {
  const context = useContext(AuthContext);

  // Figma Make peut rendre certains composants isolément en preview/HMR
  // (ex: IdleTimeout ou LoginPage) avant que l'arbre complet App/AuthProvider
  // soit monté. On retourne un fallback neutre au lieu de faire tomber tout
  // l'écran blanc. Dans l'application normale, AuthProvider fournit toujours
  // le vrai contexte.
  if (!context) {
    // Rendu isolé en preview/HMR avant le montage de l'arbre complet : on log
    // une seule fois en debug pour ne pas polluer la console à chaque render.
    if (!warnedOutsideProvider) {
      warnedOutsideProvider = true;
      console.debug('useAuth: contexte non monté (preview/HMR) — fallback neutre utilisé');
    }
    return authFallback;
  }

  return context;
}
