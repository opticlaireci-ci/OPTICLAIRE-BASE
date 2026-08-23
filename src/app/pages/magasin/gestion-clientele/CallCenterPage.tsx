import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import {
  Phone, PhoneCall, PhoneOff, Search, X, Clock, Timer, CheckCircle2, History, User, Smartphone,
} from 'lucide-react';
import { useLiveData } from '../../../hooks/useLiveData';
import { useAuth } from '../../../contexts/AuthContext';
import { chargerVentes, readVentesCache, type VenteSupabase } from '../../../services/ventesService';
import {
  buildContacts, groupByVendeuse, listMonthOptions, monthLabel, currentMonthKey,
  matchesUser, isAdminRole, type CallContact,
} from '../../../utils/callCenter';
import { savePendingCall, readPendingCall, clearPendingCall } from '../../../utils/pendingCall';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CallLog {
  id: string;
  rdvId?: string;
  numRef?: string;
  client: string;
  telephone: string;
  conseillere: string;
  debut: string;   // ISO datetime — heure de l'appel
  duree: number;   // durée en secondes
  statut: string;  // 'Décroché' | 'Pas décroché' | 'Injoignable'
  resultat: string;
  commentaire: string;
}

// Les trois issues possibles d'un appel.
const ISSUES = ['Décroché', 'Pas décroché', 'Injoignable'] as const;
export const issueColor: Record<string, string> = {
  'Décroché': '#16a34a', 'Pas décroché': '#d97706', 'Injoignable': '#dc2626',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export const LOG_KEY = (id: string) => `leclaire_call_logs_${id}`;

const RESULTATS = ['Répondu', 'Pas de réponse', 'Occupé', 'Numéro incorrect', 'À rappeler', 'RDV confirmé', 'RDV annulé'];

export const resultatColor = (r: string) => {
  const map: Record<string, string> = {
    'Répondu': '#16a34a', 'RDV confirmé': '#16a34a', 'Pas de réponse': '#d97706',
    'Occupé': '#d97706', 'À rappeler': '#2563eb', 'Numéro incorrect': '#dc2626', 'RDV annulé': '#dc2626',
  };
  return map[r] ?? '#6b7280';
};

export const fmtDuree = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
export const fmtDureeLong = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}min ${sec}s` : m > 0 ? `${m}min ${sec}s` : `${sec}s`;
};
export const fmtDateTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white focus:border-blue-400 w-full';
const TEAL = '#1a7a96';

// Normalise un numéro pour le lien tel: (garde le + éventuel, supprime espaces/points/tirets/parenthèses).
const telHref = (tel: string) => 'tel:' + (tel || '').replace(/[^\d+]/g, '');

// Lance réellement l'appel : ouvre le composeur natif du téléphone (mobile) via tel:.
export const lancerAppel = (tel: string) => {
  const href = telHref(tel);
  const a = document.createElement('a');
  a.href = href;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// ── Panneau d'appel : durée mesurée AUTOMATIQUEMENT par le système ─────────────
// Impossible d'accéder au journal d'appels natif depuis un navigateur. On mesure
// donc le temps réel passé HORS de l'application (dans l'app téléphone) via l'API
// Page Visibility : dès que le composeur s'ouvre, la page passe en arrière-plan ;
// au retour de la conseillère, le temps écoulé = durée réelle passée au téléphone.
// La durée n'est donc PAS déclarée à la main : elle est chronométrée par l'appareil.
export function CallPanel({
  rdv, conseillere, onSave, onCancel, startedAt,
}: {
  rdv: { id: string; numRef: string; client: string; telephone?: string }; conseillere: string;
  onSave: (log: Omit<CallLog, 'id'>) => void; onCancel: () => void;
  /** Heure réelle de composition. Fournie lors d'une reprise après que le
   *  système mobile a déchargé la page : la durée reste ainsi correcte. */
  startedAt?: string;
}) {
  const [debut] = useState(() => {
    const d = startedAt ? new Date(startedAt) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  });
  // Durée déjà écoulée depuis la composition (cas d'une page rechargée par l'OS).
  const dejaEcoule = Math.max(0, Math.floor((Date.now() - debut.getTime()) / 1000));
  const [dureeAuto, setDureeAuto] = useState(dejaEcoule);  // temps mesuré hors de l'app (secondes)
  const [revenu, setRevenu] = useState(dejaEcoule > 0);    // la conseillère est revenue dans l'app
  const [statut, setStatut] = useState<string>('Décroché'); // Décroché / Pas décroché / Injoignable
  const [resultat, setResultat] = useState('Répondu');
  const [commentaire, setCommentaire] = useState('');
  const hiddenAtRef = useRef<number | null>(null);   // horodatage du passage en arrière-plan
  const accumRef = useRef(dejaEcoule);               // cumul du temps hors de l'app
  const overlayRef = useRef<HTMLDivElement>(null);

  // Amène la fiche sous les yeux : on remonte l'overlay en haut. Sans cela, sur
  // mobile, la conseillère devait faire défiler la page pour la retrouver.
  const amenerAuPremierPlan = () => {
    overlayRef.current?.scrollTo({ top: 0 });
    overlayRef.current?.focus({ preventScroll: true });
  };

  // Tant que la fiche est ouverte, la page derrière ne défile pas : l'overlay
  // reste ainsi toujours visible au retour dans l'application.
  useEffect(() => {
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    amenerAuPremierPlan();
    return () => { document.body.style.overflow = precedent; };
  }, []);

  // Mesure automatique : on additionne chaque période où la page est en arrière-plan.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else {
        if (hiddenAtRef.current != null) {
          accumRef.current += Math.floor((Date.now() - hiddenAtRef.current) / 1000);
          hiddenAtRef.current = null;
          setDureeAuto(accumRef.current);
          if (accumRef.current > 0) setRevenu(true);
        }
        // Retour dans l'application (fin de l'appel) : la fiche remonte d'elle-même.
        amenerAuPremierPlan();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', amenerAuPremierPlan);
    window.addEventListener('pageshow', amenerAuPremierPlan);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', amenerAuPremierPlan);
      window.removeEventListener('pageshow', amenerAuPremierPlan);
    };
  }, []);

  const enregistrer = (statut: string, res: string, duree: number) => {
    onSave({
      rdvId: rdv.id, numRef: rdv.numRef, client: rdv.client, telephone: rdv.telephone || '',
      conseillere, debut: debut.toISOString(), duree, statut, resultat: res, commentaire,
    });
  };

  /* Rendu dans un PORTAIL sur <body> : le conteneur de page applique une
     animation (`will-change: transform`), ce qui ferait que `position: fixed`
     se calerait sur la page — très haute — au lieu de l'écran. La fiche
     apparaissait alors tout en bas et il fallait faire défiler pour la voir.
     Le portail garantit qu'elle occupe toujours l'écran visible. */
  return createPortal(
    /* Overlay plein écran, aligné en haut et défilable sur mobile pour rester
       entièrement atteignable si son contenu dépasse la hauteur de l'écran. */
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain p-3 sm:p-4 outline-none"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto overflow-hidden">
        <div className="px-6 py-5 text-white text-center" style={{ background: revenu ? 'linear-gradient(135deg, #16a34a, #0f7a37)' : 'linear-gradient(135deg, #1a7a96, #12586d)' }}>
          <div className="flex items-center justify-center gap-2 mb-1 opacity-90">
            <PhoneCall size={18} className={revenu ? '' : 'animate-pulse'} />
            <span className="text-sm">{revenu ? 'Appel terminé — durée mesurée' : 'Appel en cours sur le téléphone…'}</span>
          </div>
          <div className="font-bold" style={{ fontSize: 20 }}>{rdv.client}</div>
          <button
            onClick={() => rdv.telephone && lancerAppel(rdv.telephone)}
            disabled={!rdv.telephone}
            className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-white/20 hover:bg-white/30 disabled:opacity-50">
            <Phone size={13} /> {rdv.telephone || 'Numéro inconnu'} · Rappeler
          </button>
          <div className="mt-3 font-mono font-bold tracking-widest" style={{ fontSize: 34 }}>{revenu ? fmtDuree(dureeAuto) : '••••'}</div>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <User size={13} /> Conseillère : <span className="font-semibold text-gray-700">{conseillere}</span>
          </div>

          {!revenu ? (
            <>
              <div className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <Smartphone size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <span>Passez votre appel dans l'application téléphone. Si le client décroche, la durée est <b>mesurée automatiquement</b> : revenez ici une fois raccroché. Sinon, indiquez tout de suite l'issue :</span>
              </div>
              <button onClick={() => enregistrer('Pas décroché', 'Pas de réponse', 0)}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2" style={{ backgroundColor: issueColor['Pas décroché'] }}>
                <PhoneOff size={16} /> Le client n'a pas décroché
              </button>
              <button onClick={() => enregistrer('Injoignable', 'Injoignable', 0)}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2" style={{ backgroundColor: issueColor['Injoignable'] }}>
                <PhoneOff size={16} /> Injoignable (occupé / faux numéro / éteint)
              </button>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-700 bg-green-50 border border-green-100 rounded-lg p-3 flex items-center gap-2">
                <Timer size={16} className="text-green-600" /> Durée mesurée sur le téléphone : <b>{fmtDureeLong(dureeAuto)}</b>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">Le client a-t-il décroché ?</label>
                <div className="grid grid-cols-3 gap-2">
                  {ISSUES.map(iss => (
                    <button key={iss} onClick={() => setStatut(iss)}
                      className="px-2 py-2 rounded-lg text-xs font-semibold border-2 transition-colors"
                      style={statut === iss
                        ? { backgroundColor: issueColor[iss], borderColor: issueColor[iss], color: '#fff' }
                        : { backgroundColor: '#fff', borderColor: '#d1d5db', color: '#4b5563' }}>
                      {iss}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Détail / suite à donner</label>
                <select className={iCls} value={resultat} onChange={e => setResultat(e.target.value)}>
                  {RESULTATS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Commentaire</label>
                <textarea className={iCls + ' resize-none'} rows={2} placeholder="Notes de l'appel..." value={commentaire} onChange={e => setCommentaire(e.target.value)} />
              </div>
              <button onClick={() => enregistrer(statut, resultat, statut === 'Décroché' ? dureeAuto : 0)}
                className="w-full px-4 py-2.5 rounded-lg text-sm text-white font-semibold flex items-center justify-center gap-2" style={{ backgroundColor: '#dc2626' }}>
                <PhoneOff size={16} /> Enregistrer l'appel{statut === 'Décroché' ? ` (${fmtDuree(dureeAuto)})` : ''}
              </button>
            </>
          )}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onCancel} className="w-full px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-500">Annuler (ne pas enregistrer)</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Carte statistique ─────────────────────────────────────────────────────────
export function Stat({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 px-4 py-3 flex items-center gap-3">
      <div className="p-2.5 rounded-lg" style={{ backgroundColor: color + '18', color }}>{icon}</div>
      <div>
        <div className="font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

// ── Page principale ─────────────────────────────────────────────────────────────
export function CallCenterPage() {
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const { user } = useAuth();
  const conseillere = user?.prenom || user?.name || user?.email?.split('@')[0] || 'Conseillère';

  const [logs, setLogs] = useLiveData<CallLog>(LOG_KEY(magasinId), []);

  // Source des contacts : TOUTES les ventes / factures du magasin (plus les RDV en ligne).
  const magKey = magasinId.toUpperCase();
  const [ventes, setVentes] = useState<VenteSupabase[]>(() => readVentesCache(magasinId));
  useEffect(() => {
    if (!magasinId) return;
    let mounted = true;
    const load = () => chargerVentes(magKey).then(rows => { if (mounted && rows.length) setVentes(rows); }).catch(() => {});
    load();
    const interval = setInterval(load, 10000);
    window.addEventListener('leclaire-sync-update', load);
    window.addEventListener('ventes-updated', load);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('leclaire-sync-update', load);
      window.removeEventListener('ventes-updated', load);
    };
  }, [magasinId, magKey]);

  const isAdmin = isAdminRole(user?.role);
  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const monthOptions = useMemo(() => listMonthOptions(ventes), [ventes]);

  // Clients du MOIS sélectionné, regroupés PAR VENDEUSE. Une conseillère ne voit
  // QUE ses propres clients (ceux à qui elle a vendu) ; un profil admin voit
  // toutes les vendeuses du magasin.
  const groupes = useMemo(() => {
    let contacts = buildContacts(ventes, month);
    if (!isAdmin) contacts = contacts.filter(c => matchesUser(c.vendeuse, user));
    return groupByVendeuse(contacts);
  }, [ventes, month, isAdmin, user]);

  const totalClients = useMemo(() => groupes.reduce((s, g) => s + g.contacts.length, 0), [groupes]);

  const [search, setSearch] = useState('');
  // Appel en cours, restauré depuis le localStorage : sur mobile le composeur
  // met l'application en arrière-plan, la fiche doit se rouvrir seule au retour.
  const [activeCall, setActiveCall] = useState<{ contact: CallContact; startedAt: string } | null>(() => {
    const p = readPendingCall();
    return p && p.magasinId === magasinId ? { contact: p.contact, startedAt: p.startedAt } : null;
  });

  // Lance l'appel et mémorise le contact pour la reprise au retour d'arrière-plan.
  const demarrerAppel = (contact: CallContact) => {
    savePendingCall(contact, magasinId);
    const p = readPendingCall();
    setActiveCall({ contact, startedAt: p?.startedAt || new Date().toISOString() });
    if (contact.telephone) lancerAppel(contact.telephone);
  };

  const terminerAppel = () => { clearPendingCall(); setActiveCall(null); };

  // Retour au premier plan (fin de l'appel) → réafficher la fiche à remplir.
  useEffect(() => {
    const restaurer = () => {
      if (document.visibilityState !== 'visible') return;
      const p = readPendingCall();
      if (p && p.magasinId === magasinId) setActiveCall({ contact: p.contact, startedAt: p.startedAt });
    };
    document.addEventListener('visibilitychange', restaurer);
    window.addEventListener('focus', restaurer);
    window.addEventListener('pageshow', restaurer);
    return () => {
      document.removeEventListener('visibilitychange', restaurer);
      window.removeEventListener('focus', restaurer);
      window.removeEventListener('pageshow', restaurer);
    };
  }, [magasinId]);
  const [tab, setTab] = useState<'clients' | 'historique'>('clients');

  // Filtrage recherche appliqué à l'intérieur de chaque groupe de vendeuse.
  const filteredGroupes = useMemo(() => {
    const q = search.toLowerCase();
    return groupes
      .map(g => ({
        vendeuse: g.vendeuse,
        contacts: g.contacts.filter(r => !q || [r.client, r.telephone, r.numRef, r.motif].some(v => (v || '').toLowerCase().includes(q))),
      }))
      .filter(g => g.contacts.length > 0);
  }, [groupes, search]);

  // Dernier appel par RDV (pour afficher l'état d'appel dans la liste).
  const lastCallByRdv = useMemo(() => {
    const map: Record<string, CallLog> = {};
    for (const l of logs) {
      const key = l.rdvId || l.numRef || l.client;
      if (!key) continue;
      if (!map[key] || new Date(l.debut) > new Date(map[key].debut)) map[key] = l;
    }
    return map;
  }, [logs]);

  const nbAppelsByRdv = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of logs) { const k = l.rdvId || l.numRef || l.client; if (k) map[k] = (map[k] || 0) + 1; }
    return map;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase();
    return [...logs]
      .filter(l => !q || [l.client, l.telephone, l.conseillere, l.resultat, l.commentaire].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.debut).getTime() - new Date(a.debut).getTime());
  }, [logs, search]);

  // Statistiques du jour.
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayLogs = logs.filter(l => new Date(l.debut).toDateString() === today);
    const tempsTotal = todayLogs.filter(l => l.statut === 'Décroché').reduce((s, l) => s + (l.duree || 0), 0);
    const aboutis = todayLogs.filter(l => l.statut === 'Décroché').length;
    const aRappeler = logs.filter(l => l.statut !== 'Décroché' || l.resultat === 'À rappeler').length;
    return { nbAppels: todayLogs.length, tempsTotal, aboutis, aRappeler };
  }, [logs]);

  const saveLog = (log: Omit<CallLog, 'id'>) => {
    const full: CallLog = { ...log, id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    setLogs([full, ...logs]);
    terminerAppel();
    setTab('historique');
  };

  return (
    <div className="flex flex-col gap-4 p-6" style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
      {activeCall && (
        <CallPanel
          key={activeCall.contact.id}
          rdv={activeCall.contact}
          startedAt={activeCall.startedAt}
          conseillere={conseillere}
          onSave={saveLog}
          onCancel={terminerAppel}
        />
      )}

      {/* En-tête */}
      <div className="bg-white rounded-lg shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg text-white" style={{ backgroundColor: TEAL }}><Phone size={20} /></div>
          <div>
            <h1 className="text-base font-bold text-gray-800">Call Center — Clients (Ventes & Factures)</h1>
            <p className="text-xs text-gray-500">Connectée : <span className="font-semibold">{conseillere}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white"
            value={month} onChange={e => setMonth(e.target.value)} title="Mois des ventes à rappeler">
            {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
            <Search size={14} className="ml-2 text-gray-400" />
            <input className="px-2 py-1.5 text-sm outline-none bg-transparent" style={{ width: 240 }}
              placeholder="Rechercher client, téléphone..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
          </div>
        </div>
      </div>

      {/* Statistiques du jour */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<PhoneCall size={18} />} value={String(stats.nbAppels)} label="Appels aujourd'hui" color="#1a7a96" />
        <Stat icon={<Timer size={18} />} value={fmtDureeLong(stats.tempsTotal)} label="Temps au téléphone (jour)" color="#7c3aed" />
        <Stat icon={<CheckCircle2 size={18} />} value={String(stats.aboutis)} label="Décrochés (jour)" color="#16a34a" />
        <Stat icon={<History size={18} />} value={String(stats.aRappeler)} label="À rappeler" color="#d97706" />
      </div>

      {/* Onglets */}
      <div className="flex gap-2">
        {([['clients', `Clients à appeler (${totalClients})`], ['historique', `Historique des appels (${logs.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-t-lg text-sm font-semibold"
            style={{ backgroundColor: tab === key ? '#fff' : 'transparent', color: tab === key ? TEAL : '#4b5563' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div className="bg-white rounded-lg rounded-tl-none shadow-sm p-5 -mt-4">
        {tab === 'clients' ? (
          filteredGroupes.length === 0 ? (
            <div className="text-center py-12 text-gray-400 border border-gray-200 rounded">
              Aucun client issu des ventes pour {monthLabel(month)}
              {!isAdmin ? ' (vos ventes)' : ''}.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {filteredGroupes.map(groupe => (
                <div key={groupe.vendeuse} className="border border-gray-200 rounded overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: TEAL + '14' }}>
                    <div className="flex items-center gap-2">
                      <User size={15} style={{ color: TEAL }} />
                      <span className="font-bold text-gray-800">{groupe.vendeuse}</span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: TEAL }}>
                      {groupe.contacts.length} client{groupe.contacts.length > 1 ? 's' : ''} à appeler
                    </span>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Client</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Téléphone</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Dernier achat</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Type</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Dernier appel</th>
                        <th className="text-center px-3 py-2.5 font-semibold text-gray-700 w-32">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupe.contacts.map(r => {
                        const last = lastCallByRdv[r.id] || lastCallByRdv[r.numRef] || lastCallByRdv[r.client];
                        const nb = nbAppelsByRdv[r.id] || nbAppelsByRdv[r.numRef] || nbAppelsByRdv[r.client] || 0;
                        return (
                          <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2 font-semibold text-gray-800">{r.client}</td>
                            <td className="px-3 py-2 text-gray-700">{r.telephone || <span className="text-gray-400">— aucun —</span>}</td>
                            <td className="px-3 py-2 text-gray-700">{fmtDate(r.rendezVous)}</td>
                            <td className="px-3 py-2 text-gray-600">{r.motif || '—'}</td>
                            <td className="px-3 py-2">
                              {last ? (
                                <div className="text-xs">
                                  <span className="px-2 py-0.5 rounded text-white font-semibold" style={{ backgroundColor: issueColor[last.statut] || resultatColor(last.resultat) }}>{last.statut || last.resultat}</span>
                                  <div className="text-gray-400 mt-0.5">{fmtDateTime(last.debut)}{last.statut === 'Décroché' ? ` · ${fmtDuree(last.duree)}` : ''}{nb > 1 ? ` · ${nb} appels` : ''}</div>
                                </div>
                              ) : <span className="text-xs text-gray-400">Jamais appelé</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => demarrerAppel(r)}
                                disabled={!r.telephone}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#16a34a' }}>
                                <Phone size={13} /> Appeler
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700"><span className="inline-flex items-center gap-1"><Clock size={12} /> Heure d'appel</span></th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Client</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Téléphone</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Statut</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Durée</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Conseillère</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Résultat</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">Aucun appel enregistré</td></tr>
                ) : filteredLogs.map(l => (
                  <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700 text-xs">{fmtDateTime(l.debut)}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">{l.client}</td>
                    <td className="px-3 py-2 text-gray-700">{l.telephone || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: issueColor[l.statut] || '#6b7280' }}>{l.statut || '—'}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">{l.statut === 'Décroché' ? fmtDuree(l.duree) : '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{l.conseillere}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: resultatColor(l.resultat) }}>{l.resultat}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{l.commentaire || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
