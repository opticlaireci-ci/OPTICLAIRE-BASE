import { useEffect, useState } from 'react';
import { Search, X, Edit, Trash2, Eye, EyeOff, Plus, Loader2 } from 'lucide-react';
import { serverFetch } from '../utils/supabaseClient';
import {
  isEdgeUnreachable,
  listUsersDirect,
  createUserDirect,
  updateUserDirect,
  deleteUserDirect,
} from '../utils/userAdminFallback';
import { logger } from '../utils/logger';
import { getMagasins } from '../constants/magasins';
import { APP_BUTTON_GROUPS } from '../constants/appButtons';
import { ACTION_ADD_KEY, ACTION_EDIT_KEY, ACTION_DELETE_KEY, ADD_MODULES, addModuleKey } from '../utils/actionRights';
import { AddButton } from '../components/AddButton';

// Les rôles intégrés + tout rôle personnalisé ajouté par l'administrateur.
type Role = 'super_admin' | 'admin' | 'administrateur' | 'directeur' | 'manager' | 'comptable' | 'conseillere' | 'employee' | 'caissier' | (string & {});

interface Assignment {
  magasin_id: string;
  role: Role;
}

interface RemoteUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  telephone: string;
  created_at: string;
  assignments: Assignment[];
  menuAccess: string[];
}

interface FormState {
  id?: string;
  email: string;
  password: string;
  nom: string;
  prenom: string;
  telephone: string;
  assignments: Assignment[];
  menuAccess: string[];
}

const MAGASINS = getMagasins();
/** Valeur spéciale du sélecteur : assigne l'utilisateur à TOUS les magasins. */
const ALL_MAGASINS = '__ALL__';

/**
 * Développe toute assignation « Tous les magasins » en une assignation par
 * magasin (avec le rôle choisi), en évitant les doublons de magasin.
 */
function expandAssignments(assignments: Assignment[]): Assignment[] {
  const out: Assignment[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    const targets = a.magasin_id === ALL_MAGASINS ? MAGASINS.map(m => m.id) : [a.magasin_id];
    for (const id of targets) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ magasin_id: id, role: a.role });
    }
  }
  return out;
}
interface RoleOption { value: string; label: string }

// Rôles intégrés (toujours présents).
const ROLES: RoleOption[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Administrateur' },
  { value: 'directeur', label: 'Directeur' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'conseillere', label: 'Conseillère' },
  { value: 'caissier', label: 'Caissier' },
  { value: 'responsable_call_center', label: 'Responsable Call Center' },
  { value: 'opticien', label: 'Opticien' },
  { value: 'monteur', label: 'Monteur' },
];

// Rôles personnalisés ajoutés par l'administrateur — persistés dans localStorage
// (clé préfixée `leclaire_` → synchronisée automatiquement dans le cloud, donc
// partagés entre tous les appareils/navigateurs).
const CUSTOM_ROLES_KEY = 'leclaire_custom_roles';

function lireRolesPersonnalises(): RoleOption[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ROLES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((r: any) => r && r.value && r.label) : [];
  } catch { return []; }
}

function enregistrerRolePersonnalise(label: string): RoleOption {
  const value = label.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // sans accents
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const option: RoleOption = { value: value || `role_${Date.now()}`, label: label.trim() };
  const existants = lireRolesPersonnalises();
  // Éviter les doublons (même value qu'un rôle intégré ou personnalisé).
  const dejaPresent = [...ROLES, ...existants].some(r => r.value === option.value);
  if (!dejaPresent) {
    const next = [...existants, option];
    localStorage.setItem(CUSTOM_ROLES_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('leclaire-custom-roles-update'));
  }
  return option;
}

/** Liste complète des rôles (intégrés + personnalisés), dédupliquée. */
function tousLesRoles(): RoleOption[] {
  const seen = new Set<string>();
  const out: RoleOption[] = [];
  for (const r of [...ROLES, ...lireRolesPersonnalises()]) {
    if (seen.has(r.value)) continue;
    seen.add(r.value);
    out.push(r);
  }
  return out;
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await serverFetch(path, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Erreur serveur (${res.status})`);
  }
  return json;
}

async function apiList(): Promise<RemoteUser[]> {
  try {
    const json = await apiFetch('/admin/users');
    return (json.data || []).map((u: any) => ({
      id: u.id,
      email: u.email || '',
      nom: u.nom || '',
      prenom: u.prenom || '',
      telephone: u.telephone || '',
      created_at: u.created_at || '',
      assignments: (u.assignments || []).map((a: any) => ({ magasin_id: a.magasin_id, role: a.role })),
      menuAccess: u.menuAccess || [],
    })) as RemoteUser[];
  } catch (err) {
    if (!isEdgeUnreachable(err)) throw err;
    logger.warn('Edge function injoignable — repli direct (liste des utilisateurs).');
    return (await listUsersDirect()) as RemoteUser[];
  }
}

async function apiCreate(payload: FormState) {
  try {
    return await apiFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        nom: payload.nom,
        prenom: payload.prenom,
        telephone: payload.telephone,
        assignments: payload.assignments,
        menuAccess: payload.menuAccess || [],
      }),
    });
  } catch (err) {
    if (!isEdgeUnreachable(err)) throw err;
    logger.warn('Edge function injoignable — repli direct (création utilisateur).');
    await createUserDirect({
      email: payload.email,
      password: payload.password,
      nom: payload.nom,
      prenom: payload.prenom,
      telephone: payload.telephone,
      assignments: payload.assignments,
      menuAccess: payload.menuAccess || [],
    });
    return { success: true };
  }
}

async function apiUpdate(id: string, payload: Partial<FormState>) {
  try {
    return await apiFetch(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        email: payload.email,
        password: payload.password || undefined,
        nom: payload.nom,
        prenom: payload.prenom,
        telephone: payload.telephone,
        assignments: payload.assignments,
        menuAccess: payload.menuAccess,
      }),
    });
  } catch (err) {
    if (!isEdgeUnreachable(err)) throw err;
    logger.warn('Edge function injoignable — repli direct (modification utilisateur).');
    await updateUserDirect(id, {
      email: payload.email || '',
      password: payload.password || undefined,
      nom: payload.nom || '',
      prenom: payload.prenom || '',
      telephone: payload.telephone || '',
      assignments: payload.assignments || [],
      menuAccess: payload.menuAccess || [],
    });
    return { success: true };
  }
}

async function apiDelete(id: string) {
  try {
    return await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (!isEdgeUnreachable(err)) throw err;
    logger.warn('Edge function injoignable — repli direct (suppression utilisateur).');
    await deleteUserDirect(id);
    return { success: true };
  }
}

function ModalUser({
  initial,
  onSaved,
  onClose,
}: {
  initial?: RemoteUser;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    id: initial?.id,
    email: initial?.email || '',
    password: '',
    nom: initial?.nom || '',
    prenom: initial?.prenom || '',
    telephone: initial?.telephone || '',
    assignments: initial?.assignments?.length
      ? initial.assignments
      : [{ magasin_id: MAGASINS[0]?.id || '', role: 'conseillere' }],
    menuAccess: initial?.menuAccess || [],
  });
  const [tab, setTab] = useState<'infos' | 'acces'>('infos');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Liste des rôles disponibles (intégrés + personnalisés). Rafraîchie quand un
  // nouveau rôle est ajouté.
  const [roles, setRoles] = useState<RoleOption[]>(() => tousLesRoles());

  // Libellé affiché pour une valeur de rôle (repli sur la valeur brute si inconnue).
  const roleLabel = (val: string) => roles.find(r => r.value === val)?.label ?? val;

  // Saisie en cours : si le texte correspond à un rôle connu, on stocke sa valeur,
  // sinon on garde le texte brut (le rôle sera créé à la validation du champ).
  const choisirRoleTexte = (i: number, texte: string) => {
    const found = roles.find(r => r.label.toLowerCase() === texte.trim().toLowerCase());
    updateAssignment(i, 'role', found ? found.value : texte);
  };

  // Validation du champ (blur) : enregistre un nouveau rôle si le texte est inédit.
  const commitRoleTexte = (i: number, texte: string) => {
    const t = texte.trim();
    if (!t) return;
    const found = roles.find(r => r.label.toLowerCase() === t.toLowerCase() || r.value === t);
    if (found) { updateAssignment(i, 'role', found.value); return; }
    const option = enregistrerRolePersonnalise(t);
    setRoles(tousLesRoles());
    updateAssignment(i, 'role', option.value);
  };

  const iCls = 'border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full';
  const lCls = 'text-xs text-gray-600 mb-1 block';

  const updateAssignment = (i: number, key: keyof Assignment, value: string) => {
    setForm(f => ({
      ...f,
      assignments: f.assignments.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)),
    }));
  };

  const addAssignment = () => {
    setForm(f => ({
      ...f,
      assignments: [...f.assignments, { magasin_id: MAGASINS[0]?.id || '', role: 'conseillere' }],
    }));
  };

  const removeAssignment = (i: number) => {
    setForm(f => ({ ...f, assignments: f.assignments.filter((_, idx) => idx !== i) }));
  };

  const toggleAccess = (key: string) => {
    setForm(f => ({
      ...f,
      menuAccess: f.menuAccess.includes(key)
        ? f.menuAccess.filter(k => k !== key)
        : [...f.menuAccess, key],
    }));
  };

  const toggleGroupAccess = (keys: string[], allChecked: boolean) => {
    setForm(f => ({
      ...f,
      menuAccess: allChecked
        ? f.menuAccess.filter(k => !keys.includes(k))
        : [...new Set([...f.menuAccess, ...keys])],
    }));
  };

  const doSave = async () => {
    setError(null);
    if (!form.email || (!initial && !form.password)) {
      setError('Email et mot de passe obligatoires');
      return;
    }
    if (form.assignments.length === 0 || form.assignments.some(a => !a.magasin_id)) {
      setError('Au moins un magasin doit être assigné');
      return;
    }
    setSaving(true);
    try {
      // « Tous les magasins » est développé en une assignation par magasin.
      const expandedAssignments = expandAssignments(form.assignments);
      if (initial) {
        const payload: Partial<FormState> = {
          email: form.email,
          nom: form.nom,
          prenom: form.prenom,
          telephone: form.telephone,
          assignments: expandedAssignments,
          menuAccess: form.menuAccess,
        };
        if (form.password) payload.password = form.password;
        await apiUpdate(initial.id, payload);
      } else {
        await apiCreate({ ...form, assignments: expandedAssignments });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-100">
          <span className="font-semibold text-gray-800">{initial ? 'Modifier' : 'Ajouter'} Utilisateur</span>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 font-bold text-lg px-1">×</button>
        </div>
        <div className="flex border-b border-gray-200 bg-gray-50 px-5">
          <button
            type="button"
            onClick={() => setTab('infos')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'infos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Informations
          </button>
          <button
            type="button"
            onClick={() => setTab('acces')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'acces' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Accès aux boutons ({form.menuAccess.length})
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4" style={{ display: tab === 'infos' ? 'flex' : 'none' }}>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>Nom</label>
              <input className={iCls} value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
            </div>
            <div>
              <label className={lCls}>Prénom</label>
              <input className={iCls} value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>Email <span className="text-red-500">*</span></label>
              <input type="email" className={iCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className={lCls}>Téléphone</label>
              <input className={iCls} value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={lCls}>
              Mot de passe {initial ? '(laisser vide pour ne pas changer)' : <span className="text-red-500">*</span>}
            </label>
            <div className="flex items-center gap-1">
              <input
                type={showPassword ? 'text' : 'password'}
                className={iCls}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-600 font-semibold">Magasins assignés + Rôle</label>
              <button onClick={addAssignment} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                <Plus size={12} /> Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {form.assignments.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className={iCls} value={a.magasin_id} onChange={e => updateAssignment(i, 'magasin_id', e.target.value)}>
                    <option value="">-- Magasin --</option>
                    <option value={ALL_MAGASINS}>Tous les magasins</option>
                    {MAGASINS.map(m => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
                  </select>
                  <input
                    className={iCls}
                    list={`roles-list-${i}`}
                    value={roleLabel(a.role)}
                    onChange={e => choisirRoleTexte(i, e.target.value)}
                    onBlur={e => commitRoleTexte(i, e.target.value)}
                    placeholder="Rôle (saisir ou choisir)…"
                  />
                  <datalist id={`roles-list-${i}`}>
                    {roles.map(r => <option key={r.value} value={r.label} />)}
                  </datalist>
                  {form.assignments.length > 1 && (
                    <button onClick={() => removeAssignment(i)} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4" style={{ display: tab === 'acces' ? 'flex' : 'none' }}>
          <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded px-3 py-2">
            Cochez les boutons auxquels cet utilisateur a accès. Si <b>aucune</b> case n'est cochée,
            l'utilisateur garde l'accès défini par son rôle. Les administrateurs voient toujours tout.
          </div>

          {/* Droits d'action : autorise cet utilisateur à modifier / supprimer des données. */}
          <div className="border border-amber-200 rounded overflow-hidden">
            <div className="bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Droits sur les données
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-amber-600"
                  checked={form.menuAccess.includes(ACTION_ADD_KEY)}
                  onChange={() => toggleAccess(ACTION_ADD_KEY)}
                />
                Peut ajouter des données (tous modules)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-amber-600"
                  checked={form.menuAccess.includes(ACTION_EDIT_KEY)}
                  onChange={() => toggleAccess(ACTION_EDIT_KEY)}
                />
                Peut modifier les données
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-amber-600"
                  checked={form.menuAccess.includes(ACTION_DELETE_KEY)}
                  onChange={() => toggleAccess(ACTION_DELETE_KEY)}
                />
                Peut supprimer les données
              </label>
            </div>
            {/* Droit d'ajout GRANULAIRE par module : ignoré si « tous modules » est coché. */}
            <div className="border-t border-amber-100 px-3 py-2">
              <div className="text-xs font-semibold text-amber-800 mb-1">
                Droit d'ajout par module
                {form.menuAccess.includes(ACTION_ADD_KEY) && (
                  <span className="ml-1 font-normal text-gray-400">(désactivé : « tous modules » est coché)</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {ADD_MODULES.map(m => {
                  const key = addModuleKey(m.id);
                  const globalOn = form.menuAccess.includes(ACTION_ADD_KEY);
                  return (
                    <label key={m.id} className={`flex items-center gap-2 text-sm cursor-pointer ${globalOn ? 'text-gray-400' : 'text-gray-700'}`}>
                      <input
                        type="checkbox"
                        className="accent-amber-600"
                        disabled={globalOn}
                        checked={globalOn || form.menuAccess.includes(key)}
                        onChange={() => toggleAccess(key)}
                      />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="px-3 pb-2 text-xs text-gray-500">
              Si aucune case n'est cochée, l'utilisateur conserve le comportement de son rôle.
            </div>
          </div>
          {APP_BUTTON_GROUPS.map(group => {
            const keys = group.items.map(i => i.key);
            const allChecked = keys.every(k => form.menuAccess.includes(k));
            return (
              <div key={group.group} className="border border-gray-200 rounded overflow-hidden">
                <div className="flex items-center justify-between bg-gray-100 px-3 py-2">
                  <span className="text-sm font-semibold text-gray-700">{group.group}</span>
                  <button
                    type="button"
                    onClick={() => toggleGroupAccess(keys, allChecked)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {allChecked ? 'Tout décocher' : 'Tout cocher'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3">
                  {group.items.map(item => (
                    <label key={item.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={form.menuAccess.includes(item.key)}
                        onChange={() => toggleAccess(item.key)}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Fermer</button>
          <button onClick={doSave} disabled={saving} className="px-4 py-2 rounded text-sm text-white font-semibold flex items-center gap-2" style={{ backgroundColor: '#2563eb' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function userRoleBadgeStyle(role: string): { bg: string; text: string; border: string } {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    super_admin:   { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' },
    admin:         { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    administrateur:{ bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    directeur:     { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
    manager:       { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    comptable:     { bg: '#fefce8', text: '#854d0e', border: '#fde68a' },
    conseillere:   { bg: '#fdf4ff', text: '#7e22ce', border: '#e9d5ff' },
    caissier:      { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
    opticien:      { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
    monteur:       { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
    responsable_call_center: { bg: '#fef9c3', text: '#713f12', border: '#fde047' },
  };
  return map[role] ?? { bg: '#f9fafb', text: '#374151', border: '#d1d5db' };
}

export function GestionUtilisateursPage() {
  const USERS_CACHE = 'leclaire_users_cache';
  const [users, setUsers] = useState<RemoteUser[]>(() => {
    try { const r = localStorage.getItem(USERS_CACHE); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ item?: RemoteUser } | null>(null);
  const [loading, setLoading] = useState<boolean>(() => {
    try { return !localStorage.getItem(USERS_CACHE); } catch { return true; }
  });
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiList();
      setUsers(list);
      try { localStorage.setItem(USERS_CACHE, JSON.stringify(list)); } catch {}
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [u.email, u.nom, u.prenom, ...u.assignments.map(a => a.role), ...u.assignments.map(a => a.magasin_id)]
      .some(v => v?.toLowerCase().includes(s));
  });

  const handleDelete = async (u: RemoteUser) => {
    if (!window.confirm(`Supprimer ${u.email} ? Cette action est irréversible.`)) return;
    try {
      await apiDelete(u.id);
      refresh();
    } catch (e: any) {
      alert(e.message || String(e));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#f0f4f6', minHeight: '100vh' }}>
      {modal && <ModalUser initial={modal.item} onSaved={refresh} onClose={() => setModal(null)} />}

      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-5 py-2.5">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-400">👥</span>
          <span className="font-semibold">Gestion des Utilisateurs (Supabase Auth)</span>
        </div>
        <div className="flex items-center gap-2">
          <AddButton onClick={() => setModal({})} className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
            Ajouter Utilisateur
          </AddButton>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Utilisateurs ({users.length})</h2>
          <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
            <input className="px-2 py-1.5 text-sm outline-none" style={{ width: 220 }} placeholder="Recherche..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
            <Search size={14} className="text-gray-400 mx-2" />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
            ⚠️ {error}
            <div className="text-xs text-red-600 mt-1">
              Vérifie que l'Edge Function <code>server</code> est déployée et que ton compte a le rôle <code>super_admin</code>/<code>admin</code>.
            </div>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block">
          <div className="border border-gray-200 rounded overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white border-b-2 border-gray-200 text-gray-700 font-semibold text-xs">
                  <th className="text-left px-3 py-3">Email</th>
                  <th className="text-left px-3 py-3">Nom</th>
                  <th className="text-left px-3 py-3">Prénom</th>
                  <th className="text-left px-3 py-3">Téléphone</th>
                  <th className="text-left px-3 py-3">Magasins + Rôles</th>
                  <th className="text-center px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">
                    <Loader2 size={20} className="animate-spin inline mr-2" /> Chargement…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">Aucun utilisateur</td></tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold">{u.email}</td>
                    <td className="px-3 py-2">{u.nom || '-'}</td>
                    <td className="px-3 py-2">{u.prenom || '-'}</td>
                    <td className="px-3 py-2">{u.telephone || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.assignments.length === 0 ? (
                          <span className="text-xs text-red-500">Aucun magasin</span>
                        ) : u.assignments.map((a, i) => (
                          <span key={`${a.magasin_id}-${i}`} className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
                            {a.magasin_id} · {a.role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setModal({ item: u })} className="text-blue-500 hover:text-blue-700 p-1"><Edit size={13} /></button>
                        <button onClick={() => handleDelete(u)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
              <Loader2 size={20} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} /> Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>Aucun utilisateur</div>
          ) : filtered.map(u => (
            <div key={u.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'clamp(0.82rem, 3vw, 0.95rem)', color: '#111827' }}>
                    {u.nom ? `${u.nom}${u.prenom ? ' ' + u.prenom : ''}` : u.email}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{u.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setModal({ item: u })}
                    style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '4px 8px', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <Edit size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(u)}
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {u.telephone && (
                <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: 6 }}>📞 {u.telephone}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {u.assignments.length === 0 ? (
                  <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>Aucun magasin assigné</span>
                ) : u.assignments.map((a, i) => {
                  const s = userRoleBadgeStyle(a.role);
                  return (
                    <span
                      key={`${a.magasin_id}-${i}`}
                      style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
                    >
                      {a.magasin_id} · {a.role}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
