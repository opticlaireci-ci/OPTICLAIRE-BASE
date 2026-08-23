// Redéploiement forcé (bump 2026-08-08 #2) : import Supabase remis au format
// canonique `npm:@supabase/supabase-js@2` (l'ancien `jsr:...@2.49.8` pouvait faire
// échouer silencieusement le bundler du runtime Edge de Make → aucune fonction
// créée → « function not found » / « Failed to fetch »). Ce commentaire force Make
// à voir un changement et à relancer un build propre.
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// ── Identifiants d'application (configurables) ────────────────────────────────
// Le suffixe `488c4464` identifie l'application Figma Make. Il apparaît à DEUX
// endroits critiques : le nom de la table KV et le préfixe des routes. Il était
// codé en dur 23 fois, ce qui en faisait un point de rupture lors d'un
// changement de projet Supabase. On le centralise ici, surchargeable par
// variable d'environnement (Dashboard → Edge Functions → Secrets).
//
// • KV_TABLE   : nom de la table clé/valeur. C'est LE réglage important : les
//                données applicatives y vivent entièrement. Si un nouveau projet
//                Supabase régénère `kv_store.tsx` avec un autre suffixe, il
//                suffit de définir ce secret pour raccorder l'existant.
// • ROUTE_PREFIX : doit rester ÉGAL AU NOM DE LA FONCTION DÉPLOYÉE, car Supabase
//                sert la fonction sous /functions/v1/<nom-de-la-fonction>. Le
//                client le construit dans `src/app/utils/supabaseClient.ts`
//                (SERVER_BASE) : les deux doivent concorder.
// Projet Supabase courant `wfwvosdbikvvpcfipedi`. ⚠️ DEUX slugs DIFFÉRENTS :
//  • Make DÉPLOIE la fonction sous le nom `make-server-8ddbb853` (slug réel de
//    l'app Make dans cet environnement). C'est l'URL servie par Supabase
//    (/functions/v1/make-server-8ddbb853). ROUTE_PREFIX doit donc valoir
//    `make-server-8ddbb853`, sinon Hono ne matche aucune route → 404 « Not Found ».
//  • Les DONNÉES vivent dans la table `kv_store_10865fd7` (projet historique
//    `khhlpczbisgxagxhihvz` : compte propriétaire, user_meta, données métier…).
//    KV_TABLE vaut donc `kv_store_10865fd7`.
// Ne PAS refusionner les deux : le nom de fonction et le nom de table divergent
// ici, c'était la cause racine du 404 (le code cherchait ses routes sous
// `make-server-488c4464`, jamais servi).
const KV_TABLE = Deno.env.get("KV_TABLE") ?? "kv_store_10865fd7";
const ROUTE_PREFIX = Deno.env.get("ROUTE_PREFIX") ?? "make-server-8ddbb853";

const supabaseAdmin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Accès KV local (remplace ./kv_store.tsx) ─────────────────────────────────
// `kv_store.tsx` est un fichier PROTÉGÉ, autogénéré, qui cible EN DUR la table
// `kv_store_488c4464` — table absente du projet `khhlpczbisgxagxhihvz`, dont les
// données vivent dans `kv_store_10865fd7` (PostgREST renverrait PGRST205). Toute
// route l'utilisant (`/me`, `/admin/users`, `/setup/*`) échouerait donc. On
// réimplémente les 4 helpers utilisés en passant par `KV_TABLE`, seul nom de
// table configurable et correct.
const kv = {
  async get(key: string): Promise<unknown> {
    const { data, error } = await supabaseAdmin()
      .from(KV_TABLE).select("value").eq("key", key).maybeSingle();
    if (error) throw new Error(`kv.get(${key}) sur ${KV_TABLE}: ${error.message}`);
    return data?.value ?? null;
  },
  async set(key: string, value: unknown): Promise<void> {
    const { error } = await supabaseAdmin()
      .from(KV_TABLE).upsert({ key, value });
    if (error) throw new Error(`kv.set(${key}) sur ${KV_TABLE}: ${error.message}`);
  },
  async del(key: string): Promise<void> {
    const { error } = await supabaseAdmin()
      .from(KV_TABLE).delete().eq("key", key);
    if (error) throw new Error(`kv.del(${key}) sur ${KV_TABLE}: ${error.message}`);
  },
  async getByPrefix(prefix: string): Promise<unknown[]> {
    const { data, error } = await supabaseAdmin()
      .from(KV_TABLE).select("key, value").like("key", `${prefix}%`);
    if (error) throw new Error(`kv.getByPrefix(${prefix}) sur ${KV_TABLE}: ${error.message}`);
    return (data ?? []).map((r: { value: unknown }) => r.value);
  },
};

// ── CORS : liste blanche d'origines ──────────────────────────────────────────
// Domaines de production autorisés (correspondance exacte). Ajoutez ici vos
// domaines définitifs (ex. le domaine Vercel de prod).
const ALLOWED_ORIGINS = [
  "https://sgoptic.net",
  "https://www.sgoptic.net",
  "https://boboptique.net",
  "https://www.boboptique.net",
  "https://opticlaire.app",
  "https://www.opticlaire.app",
  "https://project-pi-tawny-87.vercel.app",
  // Ajoutez ici votre domaine définitif, SANS barre oblique finale.
];
// Nom du projet Vercel : sert à borner les URLs de preview. Les URLs de preview
// Vercel sont toujours préfixées par le nom du projet, p.ex.
// `opticlaire-<hash>.vercel.app`, `opticlaire-git-<branche>-<scope>.vercel.app`.
// ⚠️ Adaptez cette valeur si votre projet Vercel porte un autre nom.
const VERCEL_PROJECT_PREFIXES = ["opticlaire", "boboptique"];
// Origines de preview à URL dynamique (éditeur Figma Make, previews Vercel).
// Elles ne sont PAS des domaines de prod mais doivent fonctionner pendant le
// développement. Correspondance par motif — RESSERRÉE : on n'accepte QUE les
// previews de CE projet, pas n'importe quel sous-domaine *.vercel.app (qui
// pourrait appartenir à un tiers malveillant).
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/i,              // développement local
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,           // développement local (IP)
  // Éditeur / preview Figma Make. Le proxy de preview sert l'app sous un
  // sous-domaine MULTI-LABELS, p.ex. `app-<hash>.makeproxy-c.figma.site` : il
  // faut donc accepter plusieurs labels avant `.figma.site` (et pas un seul),
  // tout en restant borné au domaine de Figma.
  /^https:\/\/([a-z0-9-]+\.)+figma\.site$/i,
  ...VERCEL_PROJECT_PREFIXES.flatMap((p) => [
    new RegExp(`^https://${p}-[a-z0-9-]+\\.vercel\\.app$`, "i"), // previews Vercel du projet
    new RegExp(`^https://${p}\\.vercel\\.app$`, "i"),            // prod Vercel du projet
  ]),
];
function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

// ── Politique de mot de passe ────────────────────────────────────────────────
// Renvoie un message d'erreur (français) si le mot de passe est trop faible,
// ou null s'il respecte la politique : ≥ 10 caractères, avec majuscule,
// minuscule et chiffre.
function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 10) {
    return "Le mot de passe doit contenir au moins 10 caractères.";
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (!hasLower || !hasUpper || !hasDigit) {
    return "Le mot de passe doit contenir majuscules, minuscules et chiffres.";
  }
  return null; // ok
}

// ── Garde d'authentification ──────────────────────────────────────────────────
// SÉCURITÉ : la clé anon est PUBLIQUE (embarquée dans le bundle navigateur). Les
// routes de données (storage, sync, CRUD, SMS) ne doivent donc PAS se contenter
// d'accepter la clé anon : elles exigent un VRAI jeton d'utilisateur connecté.
// `supabase.auth.getUser(token)` échoue pour la clé anon (aucun utilisateur),
// ce qui ferme l'accès aux données à toute personne non authentifiée.
async function requireUser(c: any): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false, res: c.json({ success: false, error: 'No token' }, 401) };
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, res: c.json({ success: false, error: 'Invalid token' }, 401) };
  }
  return { ok: true, userId: data.user.id };
}

// ── Scoping par rôle / magasin ────────────────────────────────────────────────
// Au-delà de l'authentification, on RESTREINT ce que chaque utilisateur peut voir
// et modifier à ses magasins assignés. Les administrateurs (super_admin / admin /
// administrateur) ne sont pas restreints. Les enregistrements SANS marqueur de
// magasin sont considérés « globaux » (catalogues, fournisseurs…) et restent
// visibles de tous les utilisateurs connectés.

// Normalise un identifiant de magasin pour comparaison robuste :
// 'ABOBO', 'abobo', 'LECLAIRE ABOBO' → 'abobo'.
function normId(v: any): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^leclaire/, '');
}

interface Scope { ok: true; userId: string; isAdmin: boolean; magasins: Set<string>; }
async function getScope(c: any): Promise<Scope | { ok: false; res: Response }> {
  const g = await requireUser(c);
  if (!g.ok) return g;
  const meta = await getUserMeta(g.userId);
  const roles = meta?.magasins || [];
  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r.role));
  const magasins = new Set(roles.map((r) => normId(r.magasin_id)).filter(Boolean));
  return { ok: true, userId: g.userId, isAdmin, magasins };
}

// Magasin(s) concerné(s) par un enregistrement. Renvoie un tableau car certains
// enregistrements (bons de transfert/distribution) concernent DEUX magasins :
// une source et une destination. Un tableau vide = enregistrement global.
function itemMagasins(item: any): string[] {
  if (!item || typeof item !== 'object') return [];
  const raws = [
    item.magasin_id, item.magasinId, item.magasin,
    item.magasin_source, item.magasinSource,
    item.magasin_destination, item.magasinDestination, item.magasinDest,
  ];
  const ids = new Set<string>();
  for (const r of raws) {
    const n = normId(r);
    if (n) ids.add(n);
  }
  return Array.from(ids);
}
// L'utilisateur (scope) a-t-il le droit de voir/modifier cet enregistrement ?
// Un bon source→destination est visible/modifiable si l'utilisateur est affecté
// à AU MOINS un des deux magasins concernés.
function scopeAllowsItem(scope: Scope, item: any): boolean {
  if (scope.isAdmin) return true;
  const ms = itemMagasins(item);
  if (ms.length === 0) return true; // enregistrement global (aucun magasin) → autorisé
  return ms.some((m) => scope.magasins.has(m));
}
// Magasin ciblé par une CLÉ de stockage (ex. leclaire_clients_magasin_ABOBO),
// ou null si la clé est globale.
function keyMagasin(key: string): string | null {
  const m = key.match(/_magasin_([a-z0-9]+)/i);
  return m ? normId(m[1]) : null;
}
function scopeAllowsKey(scope: Scope, key: string): boolean {
  if (scope.isAdmin) return true;
  const m = keyMagasin(key);
  if (!m) return true; // clé globale → autorisée
  return scope.magasins.has(m);
}

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    // CORS N'EST PAS la frontière de sécurité ici : chaque route sensible vérifie
    // un VRAI jeton utilisateur côté serveur (`requireUser`/`requireAdmin` via
    // `getUser`). La clé anon est publique, et l'auth passe par un en-tête
    // `Authorization` (pas de cookie) → aucun risque CSRF cross-origin. Une liste
    // blanche stricte cassait au contraire l'app dès que l'origine réelle du
    // preview Figma Make changeait (préflight refusé → « Failed to fetch » sur
    // /me, /admin/users… → repli client bloqué par la RLS).
    //
    // On ÉCHO donc l'origine appelante (équivaut à autoriser toutes les origines
    // tout en restant compatible avec `Authorization`). `isOriginAllowed` est
    // conservé uniquement pour la journalisation des origines « connues ».
    origin: (origin) => {
      if (origin && !isOriginAllowed(origin)) {
        console.log(`CORS: origine hors liste blanche, autorisée (auth par jeton) : ${origin}`);
      }
      return origin || "*";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check
app.get(`/${ROUTE_PREFIX}/health`, (c) => {
  return c.json({ status: "ok", deployedAt: "2026-07-25T00:00:00Z" });
});

// ── Synchronisation bulk (DOIT être AVANT les routes génériques /:entity) ─────

// PULL : renvoie toutes les clés leclaire_* stockées dans Supabase
app.get(`/${ROUTE_PREFIX}/sync/pull`, async (c) => {
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  // SYNC INCRÉMENTAL (P6) : `?since=<ISO8601>` optionnel. S'il est fourni, on ne
  // renvoie que les clés modifiées depuis cet instant (colonne `updated_at`
  // alimentée par le trigger `trg_kv_touch`). Sans `since`, comportement d'avant
  // (full pull) — rétrocompatible avec les anciens clients.
  const since = c.req.query("since");
  // Horodatage serveur AVANT la requête : renvoyé au client comme filigrane pour
  // le prochain pull. Le prendre avant la lecture évite de rater une écriture
  // concurrente (au pire on renverra une clé déjà connue au tour suivant — idempotent).
  const serverTime = new Date().toISOString();
  try {
    const supabase = supabaseAdmin();
    const runQuery = (withSince: boolean) => {
      let q = supabase
        .from(KV_TABLE)
        .select("key, value")
        .like("key", "storage:leclaire_%");
      if (withSince && since) q = q.gte("updated_at", since);
      return q;
    };
    let { data, error } = await runQuery(!!since);
    // DÉFENSIF (P6) : si la colonne `updated_at` n'a pas encore été migrée dans la
    // base (voir supabase/migrations/SUPABASE_KV_INCREMENTAL_SYNC.sql), le filtre
    // `.gte("updated_at", …)` échoue. Plutôt que de renvoyer une 500 et de casser
    // le polling silencieusement, on retombe sur un PULL COMPLET (comportement
    // d'avant P6). Le client reste fonctionnel, juste sans le gain de bande passante.
    if (error && since && /updated_at/i.test(error.message)) {
      console.log("sync/pull: colonne updated_at absente, repli sur pull complet:", error.message);
      ({ data, error } = await runQuery(false));
    }
    if (error) throw new Error(error.message);
    // SCOPING : un utilisateur non-admin ne reçoit QUE les clés globales (sans
    // marqueur de magasin) et les clés des magasins qui lui sont assignés. On ne
    // « dumpe » donc plus toute la base à chaque connecté.
    const result = (data || [])
      .filter((d: { key: string }) => scopeAllowsKey(scope, d.key))
      .map((d: { key: string; value: any }) => ({
        key: d.key.replace("storage:", ""),
        value: d.value,
      }));
    return c.json({ success: true, data: result, serverTime });
  } catch (error) {
    console.log("Error sync pull:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// PUSH : reçoit un tableau { items: [{key, value}] } et les upsert dans Supabase
app.post(`/${ROUTE_PREFIX}/sync/push`, async (c) => {
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const body = await c.req.json();
    const { items } = body;
    if (!items || !Array.isArray(items)) {
      return c.json({ success: false, error: "items array required" }, 400);
    }
    // SCOPING : on n'accepte l'écriture que des clés globales ou des magasins de
    // l'utilisateur. Les clés d'autres magasins sont silencieusement ignorées
    // (un non-admin ne peut pas écraser les données d'un magasin qui n'est pas
    // le sien).
    const kvItems = items
      .filter((item: { key: string }) => scopeAllowsKey(scope, `storage:${item.key}`))
      .map((item: { key: string; value: any }) => ({
        key: `storage:${item.key}`,
        value: item.value,
      }));
    if (kvItems.length === 0) {
      return c.json({ success: true, count: 0 });
    }
    const supabase = supabaseAdmin();
    const { error } = await supabase.from(KV_TABLE).upsert(kvItems);
    if (error) throw new Error(error.message);
    return c.json({ success: true, count: kvItems.length });
  } catch (error) {
    console.log("Error sync push:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ── Storage endpoints (localStorage replacement) ──────────────────────────────

app.get(`/${ROUTE_PREFIX}/storage/:key`, async (c) => {
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const key = c.req.param("key");
    if (!scopeAllowsKey(scope, `storage:${key}`)) {
      return c.json({ success: false, error: "Accès refusé (magasin non autorisé)" }, 403);
    }
    const value = await kv.get(`storage:${key}`);
    if (!value) {
      return c.json({ success: false, error: "Key not found" }, 404);
    }
    return c.json({ success: true, data: value });
  } catch (error) {
    console.log("Error fetching storage item:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post(`/${ROUTE_PREFIX}/storage`, async (c) => {
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const body = await c.req.json();
    const { id, value } = body;
    if (!id) {
      return c.json({ success: false, error: "Key (id) is required" }, 400);
    }
    if (!scopeAllowsKey(scope, `storage:${id}`)) {
      return c.json({ success: false, error: "Accès refusé (magasin non autorisé)" }, 403);
    }
    await kv.set(`storage:${id}`, value);
    return c.json({ success: true, data: { id, value } });
  } catch (error) {
    console.log("Error setting storage item:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.delete(`/${ROUTE_PREFIX}/storage/:key`, async (c) => {
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const key = c.req.param("key");
    if (!scopeAllowsKey(scope, `storage:${key}`)) {
      return c.json({ success: false, error: "Accès refusé (magasin non autorisé)" }, 403);
    }
    await kv.del(`storage:${key}`);
    return c.json({ success: true });
  } catch (error) {
    console.log("Error deleting storage item:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ── Generic CRUD /:entity ─────────────────────────────────────────────────────
// Réservé pour le store key-value. Les segments suivants sont des routes
// dédiées et ne doivent PAS tomber dans le CRUD générique.
const RESERVED_ENTITIES = new Set(['admin', 'storage', 'sync', 'health', 'setup', 'me', 'sms']);

app.get(`/${ROUTE_PREFIX}/:entity`, async (c, next) => {
  const entity = c.req.param("entity");
  if (RESERVED_ENTITIES.has(entity)) return next();
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  // SYNC INCRÉMENTAL (P6) : `?since=<ISO8601>` optionnel. S'il est fourni, on ne
  // renvoie que les documents modifiés depuis cet instant (colonne `updated_at`).
  // C'est le chemin réellement emprunté par le poller temps réel (app_data), donc
  // le gain de bande passante y est concret. Sans `since`, comportement inchangé.
  const since = c.req.query("since");
  const serverTime = new Date().toISOString();
  try {
    let items: any[];
    if (since) {
      // Requête directe pour pouvoir filtrer sur `updated_at` (le helper kv ne
      // l'expose pas). On récupère la valeur JSON telle quelle, même forme que
      // kv.getByPrefix.
      const supabase = supabaseAdmin();
      const { data, error } = await supabase
        .from(KV_TABLE)
        .select("value")
        .like("key", `${entity}:%`)
        .gte("updated_at", since);
      if (error) {
        // DÉFENSIF (P6) : colonne `updated_at` pas encore migrée (voir
        // supabase/migrations/SUPABASE_KV_INCREMENTAL_SYNC.sql). On retombe sur un
        // pull complet plutôt que de renvoyer une 500 qui casserait le polling
        // temps réel (app_data) dès le 2ᵉ cycle, silencieusement.
        if (/updated_at/i.test(error.message)) {
          console.log(`GET /${entity}: colonne updated_at absente, repli sur pull complet:`, error.message);
          items = await kv.getByPrefix(`${entity}:`);
        } else {
          throw new Error(error.message);
        }
      } else {
        items = (data || []).map((d: { value: any }) => d.value);
      }
    } else {
      items = await kv.getByPrefix(`${entity}:`);
    }
    // SCOPING : on ne renvoie que les enregistrements globaux (sans magasin) et
    // ceux des magasins de l'utilisateur.
    const scoped = (items || []).filter((it: any) => scopeAllowsItem(scope, it));
    return c.json({ success: true, data: scoped, serverTime });
  } catch (error) {
    console.log("Error fetching items:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.get(`/${ROUTE_PREFIX}/:entity/:id`, async (c, next) => {
  const entity = c.req.param("entity");
  if (RESERVED_ENTITIES.has(entity)) return next();
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const id = c.req.param("id");
    const item = await kv.get(`${entity}:${id}`);
    if (!item) {
      return c.json({ success: false, error: "Item not found" }, 404);
    }
    if (!scopeAllowsItem(scope, item)) {
      return c.json({ success: false, error: "Accès refusé (magasin non autorisé)" }, 403);
    }
    return c.json({ success: true, data: item });
  } catch (error) {
    console.log("Error fetching item:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post(`/${ROUTE_PREFIX}/:entity`, async (c, next) => {
  const entity = c.req.param("entity");
  if (RESERVED_ENTITIES.has(entity)) return next();
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const body = await c.req.json();
    if (!scopeAllowsItem(scope, body)) {
      return c.json({ success: false, error: "Accès refusé (magasin non autorisé)" }, 403);
    }
    const id = body.id || crypto.randomUUID();
    const item = { ...body, id, createdAt: new Date().toISOString() };
    await kv.set(`${entity}:${id}`, item);
    return c.json({ success: true, data: item });
  } catch (error) {
    console.log("Error creating item:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.put(`/${ROUTE_PREFIX}/:entity/:id`, async (c, next) => {
  const entity = c.req.param("entity");
  if (RESERVED_ENTITIES.has(entity)) return next();
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const existing = await kv.get(`${entity}:${id}`);
    if (!existing) {
      return c.json({ success: false, error: "Item not found" }, 404);
    }
    // On refuse la modification si l'enregistrement existant OU la nouvelle
    // valeur cible un magasin qui n'appartient pas à l'utilisateur.
    if (!scopeAllowsItem(scope, existing) || !scopeAllowsItem(scope, body)) {
      return c.json({ success: false, error: "Accès refusé (magasin non autorisé)" }, 403);
    }
    const item = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
    await kv.set(`${entity}:${id}`, item);
    return c.json({ success: true, data: item });
  } catch (error) {
    console.log("Error updating item:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.delete(`/${ROUTE_PREFIX}/:entity/:id`, async (c, next) => {
  const entity = c.req.param("entity");
  if (RESERVED_ENTITIES.has(entity)) return next();
  const scope = await getScope(c);
  if (!scope.ok) return scope.res;
  try {
    const id = c.req.param("id");
    const existing = await kv.get(`${entity}:${id}`);
    if (existing && !scopeAllowsItem(scope, existing)) {
      return c.json({ success: false, error: "Accès refusé (magasin non autorisé)" }, 403);
    }
    await kv.del(`${entity}:${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.log("Error deleting item:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ── Profil de l'utilisateur connecté ─────────────────────────────────────────
// GET /me — renvoie l'identité + rôles + permissions de l'utilisateur du token.
// Utilisé par AuthContext après login pour construire l'objet User.
app.get(`/${ROUTE_PREFIX}/me`, async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return c.json({ success: false, error: 'No token' }, 401);

  try {
    const supabase = supabaseAdmin();
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }
    const u = userData.user;

    const meta = await getUserMeta(u.id);

    return c.json({
      success: true,
      data: {
        id: u.id,
        email: u.email,
        nom: u.user_metadata?.nom || '',
        prenom: u.user_metadata?.prenom || '',
        telephone: u.user_metadata?.telephone || '',
        magasins: meta?.magasins || [],
        permissions: meta?.permissions || [],
        menuAccess: meta?.menuAccess || [],
      },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// ── Bootstrap du compte propriétaire (première installation) ─────────────────
// Ce mécanisme remplace l'étape manuelle "Dashboard → Authentication → Add user".
// Il est volontairement PUBLIC mais AUTO-VERROUILLÉ : dès qu'un super_admin
// existe dans user_magasins, le bootstrap refuse toute nouvelle exécution.

// Ces deux réglages changent à CHAQUE nouveau client : définissez-les dans les
// variables d'environnement de la fonction (Supabase → Edge Functions → Secrets)
// plutôt que de modifier ce fichier.
// • OWNER_EMAIL    : e-mail du compte propriétaire, ex. « admin@boboptique.ci »
// • OWNER_MAGASINS : identifiants des magasins séparés par des virgules, en
//                    minuscules, ex. « cocody,marcory » — ils doivent être
//                    identiques aux `id` de src/app/config/tenant.ts.
const OWNER_EMAIL = (Deno.env.get('OWNER_EMAIL') ?? 'admin@leclaire.ci').toLowerCase();
const OWNER_MAGASINS = (Deno.env.get('OWNER_MAGASINS') ?? 'abobo,faya,koumassi,palmeraie,yopougon,bingerville,man')
  .split(',')
  .map((m) => m.trim().toLowerCase())
  .filter(Boolean);

// ── Métadonnées utilisateur stockées dans le KV store ────────────────────────
// Ce projet ne dispose que de la table KV : les rôles/assignations magasins et
// permissions (auparavant dans les tables Postgres user_magasins/user_profiles)
// sont donc stockés sous la clé `user_meta:<userId>`.
interface UserMagasin { magasin_id: string; role: string; }
interface UserMeta {
  user_id: string;
  magasins: UserMagasin[];
  permissions: any[];
  menuAccess: string[];
}

async function getUserMeta(userId: string): Promise<UserMeta | null> {
  return (await kv.get(`user_meta:${userId}`)) as UserMeta | null;
}
async function setUserMeta(userId: string, meta: Omit<UserMeta, 'user_id'>): Promise<void> {
  await kv.set(`user_meta:${userId}`, { user_id: userId, ...meta });
}
async function getAllUserMeta(): Promise<UserMeta[]> {
  return ((await kv.getByPrefix('user_meta:')) as UserMeta[]) || [];
}

async function ownerExists(_supabase: any): Promise<boolean> {
  const all = await getAllUserMeta();
  return all.some((m) => (m.magasins || []).some((r) => r.role === 'super_admin'));
}

// GET /setup/status — indique si l'app a déjà un propriétaire configuré.
app.get(`/${ROUTE_PREFIX}/setup/status`, async (c) => {
  try {
    const supabase = supabaseAdmin();
    const initialized = await ownerExists(supabase);
    // SÉCURITÉ : route PUBLIQUE (non authentifiée). On n'expose l'e-mail du
    // propriétaire QUE pendant le bootstrap (pour préremplir le formulaire de
    // création) — jamais une fois l'app initialisée (fuite d'info inutile).
    return c.json({
      success: true,
      data: initialized ? { initialized: true } : { initialized: false, ownerEmail: OWNER_EMAIL },
    });
  } catch (e) {
    // Table absente → considérer non initialisé (le SQL n'a peut-être pas encore
    // tourné). On journalise le détail côté serveur mais on ne le RENVOIE pas
    // (route publique : pas de fuite de structure interne / message PostgREST).
    console.log('setup/status error:', e);
    return c.json({ success: true, data: { initialized: false, ownerEmail: OWNER_EMAIL } });
  }
});

// POST /setup/bootstrap-owner — crée (ou rattache) le compte propriétaire
// super_admin sur les 7 magasins. body: { password }
app.post(`/${ROUTE_PREFIX}/setup/bootstrap-owner`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const password: string = body?.password || '';
    const pwdError = validatePasswordStrength(password);
    if (pwdError) return c.json({ success: false, error: pwdError }, 400);

    const supabase = supabaseAdmin();

    // Verrou : si un super_admin existe déjà, interdire.
    if (await ownerExists(supabase)) {
      return c.json({ success: false, error: 'Propriétaire déjà configuré. Bootstrap verrouillé.' }, 403);
    }

    // 1) Trouver ou créer le compte Auth admin@leclaire.ci
    let ownerId: string | null = null;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: OWNER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { nom: 'Propriétaire', prenom: 'OPTICLAIRE' },
    });
    if (createErr || !created?.user) {
      // Le compte existe probablement déjà : le retrouver et réinitialiser son mot de passe.
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) return c.json({ success: false, error: `Liste utilisateurs: ${listErr.message}` }, 500);
      const existing = list.users.find((u: any) => u.email?.toLowerCase() === OWNER_EMAIL);
      if (!existing) {
        return c.json({ success: false, error: `Création compte échouée: ${createErr?.message || 'inconnue'}` }, 500);
      }
      ownerId = existing.id;
      await supabase.auth.admin.updateUserById(ownerId, { password, email_confirm: true });
    } else {
      ownerId = created.user.id;
    }

    // 2) Assigner les 7 magasins en super_admin + profil (permissions/menu vides)
    await setUserMeta(ownerId!, {
      magasins: OWNER_MAGASINS.map((m) => ({ magasin_id: m, role: 'super_admin' })),
      permissions: [],
      menuAccess: [],
    });

    return c.json({ success: true, data: { id: ownerId, email: OWNER_EMAIL } });
  } catch (e) {
    console.log('bootstrap-owner error:', e);
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// ── Admin user management ─────────────────────────────────────────────────────

const ADMIN_ROLES = ['super_admin', 'admin', 'administrateur'];

async function requireAdmin(c: any): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false, res: c.json({ success: false, error: 'No token' }, 401) };

  const supabase = supabaseAdmin();
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, res: c.json({ success: false, error: 'Invalid token' }, 401) };
  }
  const userId = userData.user.id;
  const meta = await getUserMeta(userId);
  const isAdmin = (meta?.magasins || []).some((r) => ADMIN_ROLES.includes(r.role));
  if (!isAdmin) return { ok: false, res: c.json({ success: false, error: 'Forbidden' }, 403) };
  return { ok: true, userId };
}

// GET /admin/users — liste tous les comptes + leurs assignations magasins
app.get(`/${ROUTE_PREFIX}/admin/users`, async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return guard.res;
  try {
    const supabase = supabaseAdmin();
    const { data: list, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    const allMeta = await getAllUserMeta();
    const metaByUser: Record<string, UserMeta> = {};
    allMeta.forEach((m) => { if (m?.user_id) metaByUser[m.user_id] = m; });
    const users = list.users.map((u: any) => ({
      id: u.id,
      email: u.email,
      nom: u.user_metadata?.nom || '',
      prenom: u.user_metadata?.prenom || '',
      telephone: u.user_metadata?.telephone || '',
      created_at: u.created_at,
      assignments: metaByUser[u.id]?.magasins || [],
      permissions: metaByUser[u.id]?.permissions || [],
      menuAccess: metaByUser[u.id]?.menuAccess || [],
    }));
    return c.json({ success: true, data: users });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// POST /admin/users — crée un compte + assignations magasins
// body: { email, password, nom, prenom, telephone, assignments: [{ magasin_id, role }] }
app.post(`/${ROUTE_PREFIX}/admin/users`, async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return guard.res;
  try {
    const body = await c.req.json();
    const { email, password, nom, prenom, telephone, assignments, permissions, menuAccess } = body;
    if (!email || !password) return c.json({ success: false, error: 'email + password requis' }, 400);
    const pwdError = validatePasswordStrength(password);
    if (pwdError) return c.json({ success: false, error: pwdError }, 400);
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return c.json({ success: false, error: 'Au moins une assignation magasin+rôle requise' }, 400);
    }

    const supabase = supabaseAdmin();
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom, prenom, telephone },
    });
    if (createErr || !created.user) {
      return c.json({ success: false, error: createErr?.message || 'Création échouée' }, 400);
    }

    await setUserMeta(created.user.id, {
      magasins: assignments.map((a: any) => ({ magasin_id: a.magasin_id, role: a.role })),
      permissions: permissions || [],
      menuAccess: menuAccess || [],
    });

    return c.json({ success: true, data: { id: created.user.id } });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// PUT /admin/users/:id — met à jour metadata, mot de passe optionnel, et remplace les assignations
app.put(`/${ROUTE_PREFIX}/admin/users/:id`, async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return guard.res;
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { email, password, nom, prenom, telephone, assignments, permissions, menuAccess } = body;

    // Le mot de passe est optionnel en modification : on ne le valide que s'il
    // est fourni (sinon l'existant est conservé).
    if (password) {
      const pwdError = validatePasswordStrength(password);
      if (pwdError) return c.json({ success: false, error: pwdError }, 400);
    }

    const supabase = supabaseAdmin();
    const updates: any = { user_metadata: { nom, prenom, telephone } };
    if (email) updates.email = email;
    if (password) updates.password = password;
    const { error: updErr } = await supabase.auth.admin.updateUserById(id, updates);
    if (updErr) return c.json({ success: false, error: updErr.message }, 400);

    const existingMeta = await getUserMeta(id);
    await setUserMeta(id, {
      magasins: Array.isArray(assignments)
        ? assignments.map((a: any) => ({ magasin_id: a.magasin_id, role: a.role }))
        : (existingMeta?.magasins || []),
      permissions: Array.isArray(permissions) ? permissions : (existingMeta?.permissions || []),
      menuAccess: Array.isArray(menuAccess) ? menuAccess : (existingMeta?.menuAccess || []),
    });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// DELETE /admin/users/:id
app.delete(`/${ROUTE_PREFIX}/admin/users/:id`, async (c) => {
  const guard = await requireAdmin(c);
  if (!guard.ok) return guard.res;
  try {
    const id = c.req.param('id');
    if (id === guard.userId) {
      return c.json({ success: false, error: 'Impossible de se supprimer soi-même' }, 400);
    }
    const supabase = supabaseAdmin();
    await kv.del(`user_meta:${id}`);
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) return c.json({ success: false, error: error.message }, 400);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// ── SMS Orange ────────────────────────────────────────────────────────────────
// L'API SMS Orange utilise OAuth2 (client_credentials). Les secrets restent
// SECRETS côté serveur (variables d'env Supabase) :
//   ORANGE_SMS_AUTH_HEADER  la valeur "Authorization header" fournie par Orange
//                           (Basic base64(clientId:clientSecret)) — SANS le mot
//                           "Basic", ou AVEC : les deux sont acceptés.
//   ORANGE_SENDER_ADDRESS   l'expéditeur au format tel:+2250XXXXXXXX (numéro/shortcode)
//   ORANGE_SENDER_NAME      (optionnel) nom affiché, ex: OPTICLAIRE (doit être validé par Orange)
//   ORANGE_TOKEN_URL        (optionnel) défaut https://api.orange.com/oauth/v3/token
//   ORANGE_SMS_BASE_URL     (optionnel) défaut https://api.orange.com
// Aucune de ces valeurs n'est jamais exposée au navigateur.

function orangeConfig() {
  const rawAuth = (Deno.env.get('ORANGE_SMS_AUTH_HEADER') || '').trim();
  // Accepte la valeur avec ou sans le préfixe "Basic ".
  const authHeader = rawAuth ? (/^basic\s/i.test(rawAuth) ? rawAuth : `Basic ${rawAuth}`) : '';
  let senderAddress = (Deno.env.get('ORANGE_SENDER_ADDRESS') || '').trim();
  // Normalise en tel:+... si l'utilisateur a saisi un simple numéro.
  if (senderAddress && !senderAddress.startsWith('tel:')) {
    senderAddress = 'tel:' + (senderAddress.startsWith('+') ? senderAddress : '+' + senderAddress.replace(/^0+/, ''));
  }
  const senderName = (Deno.env.get('ORANGE_SENDER_NAME') || '').trim();
  const tokenUrl = (Deno.env.get('ORANGE_TOKEN_URL') || 'https://api.orange.com/oauth/v3/token').trim();
  const baseUrl = (Deno.env.get('ORANGE_SMS_BASE_URL') || 'https://api.orange.com').trim().replace(/\/+$/, '');
  return { authHeader, senderAddress, senderName, tokenUrl, baseUrl };
}

// Cache du jeton OAuth pour éviter un aller-retour à chaque SMS.
let _orangeToken: { value: string; expiresAt: number } | null = null;

async function orangeAccessToken(): Promise<string> {
  const now = Date.now();
  if (_orangeToken && _orangeToken.expiresAt > now + 30_000) return _orangeToken.value;
  const { authHeader, tokenUrl } = orangeConfig();
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    const msg = data?.error_description || data?.error || `Token Orange HTTP ${res.status}`;
    throw new Error(`Échec obtention jeton Orange: ${msg}`);
  }
  const ttl = Number(data.expires_in || 3600) * 1000;
  _orangeToken = { value: data.access_token, expiresAt: now + ttl };
  return _orangeToken.value;
}

// GET /sms/status — indique si Orange est configuré (sans révéler les secrets)
app.get(`/${ROUTE_PREFIX}/sms/status`, (c) => {
  const { authHeader, senderAddress, senderName } = orangeConfig();
  return c.json({
    success: true,
    data: { configured: Boolean(authHeader && senderAddress), sender: senderName || senderAddress },
  });
});

// Rôles autorisés à envoyer un SMS (coût réel + envoi à des tiers depuis
// l'expéditeur de l'entreprise : à réserver au personnel encadrant).
const SMS_ROLES = ['super_admin', 'admin', 'administrateur', 'manager', 'responsable_call_center'];

// Quota anti-abus par utilisateur : fenêtre glissante en mémoire de l'instance.
// Empêche un compte compromis de vider le crédit Orange / spammer en masse.
const SMS_RATE_LIMIT = 30;                 // messages max par fenêtre
const SMS_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 heure
const _smsHits = new Map<string, number[]>();
function smsRateExceeded(userId: string): boolean {
  const now = Date.now();
  const recent = (_smsHits.get(userId) || []).filter((t) => now - t < SMS_RATE_WINDOW_MS);
  if (recent.length >= SMS_RATE_LIMIT) {
    _smsHits.set(userId, recent);
    return true;
  }
  recent.push(now);
  _smsHits.set(userId, recent);
  return false;
}

// POST /sms/send — envoie un SMS via Orange. body: { to, message }
app.post(`/${ROUTE_PREFIX}/sms/send`, async (c) => {
  const guard = await requireUser(c);
  if (!guard.ok) return guard.res;

  // Contrôle de rôle : tout utilisateur authentifié ne doit PAS pouvoir envoyer.
  const meta = await getUserMeta(guard.userId);
  const autorise = (meta?.magasins || []).some((r) => SMS_ROLES.includes(r.role));
  if (!autorise) {
    return c.json({ success: false, error: "Envoi de SMS non autorisé pour votre rôle." }, 403);
  }
  // Quota anti-abus.
  if (smsRateExceeded(guard.userId)) {
    return c.json({ success: false, error: `Quota SMS atteint (${SMS_RATE_LIMIT}/h). Réessayez plus tard.` }, 429);
  }

  const { authHeader, senderAddress, senderName, baseUrl } = orangeConfig();
  if (!authHeader || !senderAddress) {
    return c.json({ success: false, error: "Orange non configuré : définissez les secrets ORANGE_SMS_AUTH_HEADER et ORANGE_SENDER_ADDRESS, puis redéployez la fonction." }, 400);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    let to = String(body?.to || '').trim();
    const message = String(body?.message || '').trim();
    if (!to) return c.json({ success: false, error: 'Numéro destinataire (to) requis' }, 400);
    if (!message) return c.json({ success: false, error: 'Message requis' }, 400);

    // Orange attend une adresse au format tel:+<international>.
    if (!to.startsWith('tel:')) to = 'tel:' + (to.startsWith('+') ? to : '+' + to);

    const token = await orangeAccessToken();
    // senderAddress doit être URL-encodé dans le chemin de l'endpoint.
    const endpoint = `${baseUrl}/smsmessaging/v1/outbound/${encodeURIComponent(senderAddress)}/requests`;

    const payload: any = {
      outboundSMSMessageRequest: {
        address: to,
        senderAddress,
        outboundSMSTextMessage: { message },
      },
    };
    if (senderName) payload.outboundSMSMessageRequest.senderName = senderName;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Orange renvoie des messages avec variables (%1, %2…) et un messageId
      // (ex. POL0001, SVC0002). On reconstruit le texte réel en injectant les
      // variables et on inclut le messageId pour un diagnostic précis.
      const ex = data?.requestError?.policyException || data?.requestError?.serviceException;
      let msg = ex?.text || `Orange HTTP ${res.status}`;
      const vars: string[] = Array.isArray(ex?.variables) ? ex.variables : [];
      vars.forEach((v, i) => { msg = msg.replace(new RegExp(`%${i + 1}`, 'g'), v); });
      if (ex?.messageId) msg = `[${ex.messageId}] ${msg}`;
      console.log('sms/send Orange error:', res.status, JSON.stringify(data));
      return c.json({ success: false, error: msg }, 502);
    }
    const ref = data?.outboundSMSMessageRequest?.resourceURL || '';
    return c.json({ success: true, data: { messageId: ref, status: 'SUBMITTED' } });
  } catch (e) {
    console.log('sms/send error:', e);
    return c.json({ success: false, error: String((e as Error)?.message || e) }, 500);
  }
});

Deno.serve(app.fetch);
