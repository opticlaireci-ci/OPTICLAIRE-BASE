import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  Phone, PhoneCall, Search, X, Clock, Timer, CheckCircle2, History, User, Store,
  Plus, Upload, Trash2, FileText, Loader2,
} from 'lucide-react';
import { parseEtatClientPdf } from '../utils/callCenterPdf';
import { doc, onSnapshot, setDoc } from '../utils/firestoreCompat';
import { db } from '../utils/firebaseClient';
import { useAuth } from '../contexts/AuthContext';
import { getActiveMagasins, getMagasins, getMagasinLabel, type Magasin } from '../constants/magasins';
import { chargerVentes, readVentesCache, type VenteSupabase } from '../services/ventesService';
import {
  buildContacts, groupByVendeuse, listMonthOptions, monthLabel, currentMonthKey,
  matchesUser, isAdminRole, extrasToContacts, parseClientsCsv, EXTRA_KEY,
  type CallContact, type ExtraContact,
} from '../utils/callCenter';
import {
  CallPanel, Stat, type CallLog, LOG_KEY, issueColor, resultatColor,
  fmtDuree, fmtDureeLong, fmtDateTime, fmtDate, lancerAppel,
} from './magasin/gestion-clientele/CallCenterPage';
import { PALMERAIE_2024_SEED, PALMERAIE_MAGASIN_ID } from '../data/palmeraieCallCenter2024';
import { PALMERAIE_2025_SEED } from '../data/palmeraieCallCenter2025';
import { PALMERAIE_2026_SEED } from '../data/palmeraieCallCenter2026';
import { Combobox } from '../components/Combobox';
import { savePendingCall, readPendingCall, clearPendingCall } from '../utils/pendingCall';

const PALMERAIE_SEED = [...PALMERAIE_2024_SEED, ...PALMERAIE_2025_SEED, ...PALMERAIE_2026_SEED];

const TEAL = '#1a7a96';

/**
 * Relit le cache localStorage de tous les magasins pour une clé de document
 * donnée. Sert à afficher la liste INSTANTANÉMENT au montage : le temps réel
 * repose sur un sondage HTTP (~6 s), sans cache la page resterait vide jusqu'au
 * premier cycle. Les données sont ensuite remplacées par le snapshot réseau.
 */
function readCacheByMagasin<T>(magasins: Magasin[], keyOf: (id: string) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const m of magasins) {
    try {
      const raw = localStorage.getItem(keyOf(m.id));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out[m.id] = parsed as T[];
    } catch {}
  }
  return out;
}

/**
 * CALL CENTER GLOBAL — tableau de bord IDENTIQUE à celui d'un magasin, mais
 * agrégé sur TOUS les magasins.
 *
 * Mêmes cartes statistiques (appels du jour, temps au téléphone, décrochés, à
 * rappeler) et mêmes onglets « Clients à appeler » / « Historique des appels ».
 * Les magasins sont listés DYNAMIQUEMENT : tout nouveau magasin apparaît ici.
 * Dans l'onglet clients, les clients du mois se positionnent sous leur magasin
 * respectif, regroupés par vendeuse (chaque conseillère appelle ses clients).
 */
export function CallCenterGlobalPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  // Le/la responsable du Call Center PILOTE l'activité : il/elle consulte et
  // appelle, mais ne modifie pas le fichier client — pas d'ajout, d'import ni de
  // suppression de clients.
  const peutModifierClients = user?.role !== 'responsable_call_center';
  const conseillere = user?.prenom || user?.name || user?.email?.split('@')[0] || 'Conseillère';

  // Liste des magasins, rafraîchie si un magasin est ajouté/modifié.
  const [magasins, setMagasins] = useState<Magasin[]>(() => getActiveMagasins());
  useEffect(() => {
    const refresh = () => setMagasins(getActiveMagasins());
    window.addEventListener('storage', refresh);
    window.addEventListener('leclaire-sync-update', refresh);
    window.addEventListener('supabase-realtime-update', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('leclaire-sync-update', refresh);
      window.removeEventListener('supabase-realtime-update', refresh);
    };
  }, []);

  // Ventes par magasin (Firestore direct + polling), pour construire les contacts.
  const [ventesByMag, setVentesByMag] = useState<Record<string, VenteSupabase[]>>(() => {
    const init: Record<string, VenteSupabase[]> = {};
    for (const m of getMagasins()) init[m.id] = readVentesCache(m.id);
    return init;
  });
  useEffect(() => {
    let mounted = true;
    const loadAll = () => {
      for (const m of magasins) {
        chargerVentes(m.id.toUpperCase())
          .then(rows => { if (mounted && rows.length) setVentesByMag(prev => ({ ...prev, [m.id]: rows })); })
          .catch(() => {});
      }
    };
    loadAll();
    const interval = setInterval(loadAll, 15000);
    window.addEventListener('ventes-updated', loadAll);
    return () => { mounted = false; clearInterval(interval); window.removeEventListener('ventes-updated', loadAll); };
  }, [magasins]);

  // Journaux d'appels par magasin (temps réel Firestore, partagés entre navigateurs).
  // Amorcé depuis le cache local : le tableau s'affiche immédiatement, sans
  // attendre le premier cycle de sondage réseau (~6 s).
  const [logsByMag, setLogsByMag] = useState<Record<string, CallLog[]>>(() =>
    readCacheByMagasin<CallLog>(getMagasins(), LOG_KEY),
  );
  useEffect(() => {
    const unsubs = magasins.map(m =>
      onSnapshot(
        doc(db, 'app_data', LOG_KEY(m.id)),
        snap => {
          const value = (snap.exists() ? (snap.data()?.value ?? []) : []) as CallLog[];
          setLogsByMag(prev => ({ ...prev, [m.id]: value }));
          try { localStorage.setItem(LOG_KEY(m.id), JSON.stringify(value)); } catch {}
        },
        () => {},
      ),
    );
    return () => unsubs.forEach(u => u());
  }, [magasins]);

  // Enregistre un appel dans le journal du magasin concerné (Firestore direct).
  const saveLogForMagasin = (magasinId: string, log: Omit<CallLog, 'id'>) => {
    const full: CallLog = { ...log, id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    const next = [full, ...(logsByMag[magasinId] || [])];
    setLogsByMag(prev => ({ ...prev, [magasinId]: next }));
    const key = LOG_KEY(magasinId);
    setDoc(doc(db, 'app_data', key), { key, value: next, updated_at: new Date().toISOString() }, { merge: true })
      .catch(() => {});
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  };

  // Clients ajoutés/importés par magasin (temps réel Firestore), amorcés depuis
  // le cache local pour un affichage instantané au chargement de la page.
  const [extrasByMag, setExtrasByMag] = useState<Record<string, ExtraContact[]>>(() =>
    readCacheByMagasin<ExtraContact>(getMagasins(), EXTRA_KEY),
  );
  // Horodatage de notre dernière écriture locale par clé de document. Le temps
  // réel étant assuré par polling (~6s), un cycle déjà en vol peut renvoyer une
  // version ANTÉRIEURE à notre suppression et l'écraser (« le client revient »).
  // On ignore donc tout snapshot plus ancien que notre dernière écriture.
  const lastWriteAtRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const unsubs = magasins.map(m =>
      onSnapshot(
        doc(db, 'app_data', EXTRA_KEY(m.id)),
        snap => {
          const data = snap.exists() ? snap.data() : null;
          const value = (data?.value ?? []) as ExtraContact[];
          const incomingAt = data?.updated_at as string | undefined;
          const lastAt = lastWriteAtRef.current[EXTRA_KEY(m.id)];
          if (lastAt && incomingAt && incomingAt < lastAt) return; // snapshot périmé
          setExtrasByMag(prev => ({ ...prev, [m.id]: value }));
          try { localStorage.setItem(EXTRA_KEY(m.id), JSON.stringify(value)); } catch {}
        },
        () => {},
      ),
    );
    return () => unsubs.forEach(u => u());
  }, [magasins]);

  // Suppressions définitives des clients pré-chargés (« tombstones ») : sans
  // cela, le pré-chargement ré-insérerait au rechargement les clients Palmeraie
  // supprimés (ids `seed_palm_...`).
  const DELETED_KEY = `${EXTRA_KEY(PALMERAIE_MAGASIN_ID)}_deleted`;
  // Amorcé depuis le cache local : évite de réafficher brièvement les clients
  // pré-chargés déjà supprimés le temps que le réseau réponde.
  const [deletedSeeds, setDeletedSeeds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`${EXTRA_KEY(PALMERAIE_MAGASIN_ID)}_deleted`);
      const parsed = raw ? JSON.parse(raw) : null;
      return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
    } catch { return new Set<string>(); }
  });
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'app_data', DELETED_KEY),
      snap => {
        const data = snap.exists() ? snap.data() : null;
        const incomingAt = data?.updated_at as string | undefined;
        const lastAt = lastWriteAtRef.current[DELETED_KEY];
        if (lastAt && incomingAt && incomingAt < lastAt) { setDeletedLoaded(true); return; }
        setDeletedSeeds(new Set((data?.value ?? []) as string[]));
        setDeletedLoaded(true);
      },
      () => setDeletedLoaded(true),
    );
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pré-chargement (une seule fois, idempotent) des clients Palmeraie importés
  // depuis les états clients PDF. On attend que les snapshots Firestore (clients
  // + tombstones) aient chargé, puis on ajoute uniquement les entrées manquantes
  // ET non supprimées (ids déterministes `seed_palm_...`).
  const seededPalmRef = useRef(false);
  useEffect(() => {
    if (seededPalmRef.current) return;
    if (!deletedLoaded) return; // on attend la liste des suppressions
    if (!magasins.some(m => m.id === PALMERAIE_MAGASIN_ID)) return;
    const current = extrasByMag[PALMERAIE_MAGASIN_ID];
    if (current === undefined) return; // snapshot pas encore chargé
    const existingIds = new Set(current.map(e => e.id));
    const missing = PALMERAIE_SEED.filter(
      e => !existingIds.has(e.id) && !deletedSeeds.has(e.id),
    );
    seededPalmRef.current = true;
    if (missing.length > 0) persistExtras(PALMERAIE_MAGASIN_ID, [...current, ...missing]);
  }, [magasins, extrasByMag, deletedLoaded, deletedSeeds]);

  const persistExtras = (magasinId: string, next: ExtraContact[]) => {
    setExtrasByMag(prev => ({ ...prev, [magasinId]: next }));
    const key = EXTRA_KEY(magasinId);
    const updatedAt = new Date().toISOString();
    lastWriteAtRef.current[key] = updatedAt; // garde anti-écrasement par polling
    setDoc(doc(db, 'app_data', key), { key, value: next, updated_at: updatedAt }, { merge: true })
      .catch(() => {});
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  };

  const addExtras = (magasinId: string, items: Omit<ExtraContact, 'id' | 'createdAt'>[]) => {
    if (!peutModifierClients) return;
    const now = new Date().toISOString();
    const created = items.map((it, i) => ({
      ...it,
      id: `x_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      createdAt: now,
    }));
    persistExtras(magasinId, [...(extrasByMag[magasinId] || []), ...created]);
  };

  // Enregistre une suppression définitive de client pré-chargé (tombstone).
  const persistDeletedSeeds = (next: Set<string>) => {
    setDeletedSeeds(next);
    const value = Array.from(next);
    const updatedAt = new Date().toISOString();
    lastWriteAtRef.current[DELETED_KEY] = updatedAt;
    setDoc(
      doc(db, 'app_data', DELETED_KEY),
      { key: DELETED_KEY, value, updated_at: updatedAt },
      { merge: true },
    ).catch(() => {});
    try { localStorage.setItem(DELETED_KEY, JSON.stringify(value)); } catch {}
  };

  const removeExtra = (magasinId: string, extraId: string) => {
    if (!peutModifierClients) return;
    persistExtras(magasinId, (extrasByMag[magasinId] || []).filter(e => e.id !== extraId));
    // Client pré-chargé Palmeraie : on mémorise la suppression pour qu'elle ne
    // soit pas ré-insérée au prochain chargement.
    if (magasinId === PALMERAIE_MAGASIN_ID && extraId.startsWith('seed_palm_')) {
      persistDeletedSeeds(new Set(deletedSeeds).add(extraId));
    }
  };

  // Nettoyage unique : retire les clients importés par erreur dans YOPOUGON pour
  // juillet, août et septembre 2025. Exécuté une seule fois (drapeau localStorage)
  // pour ne pas ré-supprimer d'éventuels clients légitimes ajoutés ensuite.
  const cleanupYopRef = useRef(false);
  useEffect(() => {
    if (cleanupYopRef.current || !peutModifierClients) return;
    const FLAG = 'leclaire_callcenter_cleanup_yop_jas2025';
    try { if (localStorage.getItem(FLAG)) { cleanupYopRef.current = true; return; } } catch {}
    const current = extrasByMag['yopougon'];
    if (current === undefined) return; // snapshot pas encore chargé
    const badMonths = new Set(['2025-07', '2025-08', '2025-09']);
    const kept = current.filter(e => !badMonths.has(e.month));
    cleanupYopRef.current = true;
    try { localStorage.setItem(FLAG, '1'); } catch {}
    if (kept.length !== current.length) persistExtras('yopougon', kept);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasByMag]);

  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const monthOptions = useMemo(() => {
    const all: VenteSupabase[] = [];
    for (const list of Object.values(ventesByMag)) all.push(...list);
    // On part des mois issus des ventes (+ mois courant), puis on ajoute aussi
    // les mois des clients ajoutés/importés (ex. listes Palmeraie 2024) afin
    // qu'ils soient sélectionnables même sans vente sur ces mois.
    const set = new Set<string>(listMonthOptions(all, 100));
    for (const list of Object.values(extrasByMag)) for (const e of list) if (e.month) set.add(e.month);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [ventesByMag, extrasByMag]);

  const [search, setSearch] = useState('');
  // L'onglet peut être imposé par l'URL (?tab=rappeler) — utilisé par les
  // raccourcis du tableau de bord Call Center.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabUrl = searchParams.get('tab');
  const [tab, setTab] = useState<'clients' | 'historique' | 'rappeler' | 'decroches'>(
    tabUrl === 'rappeler' || tabUrl === 'decroches' || tabUrl === 'historique' ? tabUrl : 'clients',
  );
  useEffect(() => {
    if (tabUrl === 'rappeler' || tabUrl === 'decroches' || tabUrl === 'historique' || tabUrl === 'clients') {
      setTab(tabUrl);
    }
  }, [tabUrl]);
  const changerTab = (t: typeof tab) => {
    setTab(t);
    setSearchParams(t === 'clients' ? {} : { tab: t }, { replace: true });
  };
  // Magasin sélectionné ('ALL' = tous). Réinitialisé si le magasin disparaît.
  const [selectedMag, setSelectedMag] = useState<string>('ALL');
  useEffect(() => {
    if (selectedMag !== 'ALL' && !magasins.some(m => m.id === selectedMag)) setSelectedMag('ALL');
  }, [magasins, selectedMag]);
  // Appel en cours : on retient le magasin pour journaliser au bon endroit.
  // Restauré depuis le localStorage : sur mobile, le composeur met l'application
  // en arrière-plan et la fiche doit se rouvrir automatiquement au retour.
  const [activeCall, setActiveCall] = useState<{ contact: CallContact; magasinId: string; startedAt: string } | null>(
    () => readPendingCall(),
  );

  // Lance l'appel et mémorise le contact pour la reprise au retour d'arrière-plan.
  const demarrerAppel = (contact: CallContact, magasinId: string) => {
    savePendingCall(contact, magasinId);
    setActiveCall(readPendingCall());
    if (contact.telephone) lancerAppel(contact.telephone);
  };

  const terminerAppel = () => { clearPendingCall(); setActiveCall(null); };

  // Retour au premier plan (fin de l'appel) → réafficher la fiche à remplir.
  useEffect(() => {
    const restaurer = () => {
      if (document.visibilityState !== 'visible') return;
      const p = readPendingCall();
      if (p) setActiveCall(p);
    };
    document.addEventListener('visibilitychange', restaurer);
    window.addEventListener('focus', restaurer);
    window.addEventListener('pageshow', restaurer);
    return () => {
      document.removeEventListener('visibilitychange', restaurer);
      window.removeEventListener('focus', restaurer);
      window.removeEventListener('pageshow', restaurer);
    };
  }, []);
  // Modal d'ajout manuel d'un client (rattaché à un magasin + le mois courant).
  const [addModal, setAddModal] = useState<{ magasinId: string } | null>(null);
  // Import CSV : on cible un magasin puis on ouvre le sélecteur de fichier.
  const importTargetRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Import PDF « ÉTAT CLIENT » (parsing automatique nom + Téléphone I + mois).
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  // Dernier import PDF (pour pouvoir l'annuler d'un clic en cas d'erreur de
  // magasin). Persisté en localStorage pour survivre à un rechargement.
  const LAST_IMPORT_KEY = 'leclaire_callcenter_last_pdf_import';
  const [lastImport, setLastImport] = useState<
    { magasinId: string; ids: string[]; label: string } | null
  >(() => {
    try {
      const raw = localStorage.getItem(LAST_IMPORT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const rememberLastImport = (v: { magasinId: string; ids: string[]; label: string } | null) => {
    setLastImport(v);
    try {
      if (v) localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(v));
      else localStorage.removeItem(LAST_IMPORT_KEY);
    } catch {}
  };

  const openImport = (magasinId: string) => {
    if (!peutModifierClients) return;
    importTargetRef.current = magasinId;
    fileInputRef.current?.click();
  };

  const openImportPdf = (magasinId: string) => {
    if (!peutModifierClients) return;
    importTargetRef.current = magasinId;
    pdfInputRef.current?.click();
  };

  const handlePdfFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const magasinId = importTargetRef.current;
    e.target.value = ''; // permet de réimporter les mêmes fichiers
    if (!files.length || !magasinId || !peutModifierClients) return;

    // Sécurité anti-erreur : on rappelle clairement le magasin cible.
    const okCible = window.confirm(
      `Vous allez importer ${files.length} fichier(s) PDF dans le magasin :\n\n➡  ${getMagasinLabel(magasinId)}\n\nConfirmer l'import dans CE magasin ?`,
    );
    if (!okCible) return;

    setPdfImporting(true);
    try {
      const existing = extrasByMag[magasinId] || [];
      const toAdd: ExtraContact[] = [];
      const seen = new Set(existing.map(x => `${x.month}|${x.client.toLowerCase()}`));
      const now = new Date().toISOString();
      const resume: string[] = [];

      for (const file of files) {
        try {
          const { month: pdfMonth, clients } = await parseEtatClientPdf(file);
          const targetMonth = pdfMonth || month;
          let added = 0;
          clients.forEach((c, i) => {
            const key = `${targetMonth}|${c.client.toLowerCase()}`;
            if (seen.has(key)) return; // évite les doublons (idempotent par nom+mois)
            seen.add(key);
            toAdd.push({
              id: `pdf_${targetMonth}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
              client: c.client,
              telephone: c.telephone,
              month: targetMonth,
              createdAt: now,
            });
            added++;
          });
          resume.push(`${file.name} → ${monthLabel(targetMonth)} : ${added} nouveau(x) client(s)`);
        } catch (err) {
          resume.push(`${file.name} → échec de lecture`);
        }
      }

      if (toAdd.length > 0) {
        persistExtras(magasinId, [...existing, ...toAdd]);
        // Mémorise ce lot pour permettre une annulation en un clic.
        rememberLastImport({
          magasinId,
          ids: toAdd.map(c => c.id),
          label: getMagasinLabel(magasinId),
        });
      }
      alert(
        `Import PDF terminé — ${getMagasinLabel(magasinId)}\n\n${resume.join('\n')}\n\nTotal ajouté : ${toAdd.length} client(s).`,
      );
    } finally {
      setPdfImporting(false);
    }
  };

  // Annule le dernier import PDF : retire d'un coup le lot de clients importé.
  const undoLastImport = () => {
    if (!lastImport || !peutModifierClients) return;
    const { magasinId, ids, label } = lastImport;
    if (!window.confirm(`Annuler le dernier import (${ids.length} client(s)) dans ${label} ?`)) return;
    const idSet = new Set(ids);
    persistExtras(magasinId, (extrasByMag[magasinId] || []).filter(e => !idSet.has(e.id)));
    rememberLastImport(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const magasinId = importTargetRef.current;
    e.target.value = ''; // permet de réimporter le même fichier
    if (!file || !magasinId || !peutModifierClients) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseClientsCsv(String(reader.result || ''));
      if (rows.length === 0) { alert('Aucun client trouvé dans le fichier. Format attendu : nom, téléphone (, vendeuse).'); return; }
      addExtras(magasinId, rows.map(r => ({ client: r.client, telephone: r.telephone, vendeuse: r.vendeuse, month })));
      alert(`${rows.length} client(s) importé(s) dans ${getMagasinLabel(magasinId)} pour ${monthLabel(month)}.`);
    };
    reader.readAsText(file);
  };

  // Magasins visibles selon la sélection ('ALL' = tous).
  const visibleMagasins = useMemo(
    () => (selectedMag === 'ALL' ? magasins : magasins.filter(m => m.id === selectedMag)),
    [magasins, selectedMag],
  );

  // Tous les logs aplati (stats + historique), limités aux magasins visibles.
  const allLogs = useMemo(() => {
    const list: (CallLog & { magasinId: string })[] = [];
    for (const m of visibleMagasins) for (const l of (logsByMag[m.id] || [])) list.push({ ...l, magasinId: m.id });
    return list;
  }, [visibleMagasins, logsByMag]);

  // Contacts par magasin, regroupés par vendeuse (mois + rôle appliqués).
  const magasinsData = useMemo(() => {
    return visibleMagasins.map(m => {
      let contacts = [
        ...buildContacts(ventesByMag[m.id] || [], month),
        ...extrasToContacts(extrasByMag[m.id] || [], month, m.id),
      ];
      if (!isAdmin) contacts = contacts.filter(c => matchesUser(c.vendeuse, user));
      const q = search.toLowerCase();
      const groupes = groupByVendeuse(contacts)
        .map(g => ({
          vendeuse: g.vendeuse,
          contacts: g.contacts.filter(r => !q || [r.client, r.telephone, r.numRef, r.motif].some(v => (v || '').toLowerCase().includes(q))),
        }))
        .filter(g => g.contacts.length > 0);
      const total = groupes.reduce((s, g) => s + g.contacts.length, 0);
      return { magasin: m, groupes, total };
    });
  }, [visibleMagasins, ventesByMag, extrasByMag, month, isAdmin, user, search]);

  const totalClients = useMemo(() => magasinsData.reduce((s, d) => s + d.total, 0), [magasinsData]);

  const lastCallByRdv = useMemo(() => {
    const map: Record<string, CallLog> = {};
    for (const l of allLogs) {
      const key = l.rdvId || l.numRef || l.client;
      if (!key) continue;
      if (!map[key] || new Date(l.debut) > new Date(map[key].debut)) map[key] = l;
    }
    return map;
  }, [allLogs]);

  const nbAppelsByRdv = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of allLogs) { const k = l.rdvId || l.numRef || l.client; if (k) map[k] = (map[k] || 0) + 1; }
    return map;
  }, [allLogs]);

  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase();
    return [...allLogs]
      .filter(l => !q || [l.client, l.telephone, l.conseillere, l.resultat, l.commentaire, getMagasinLabel(l.magasinId)].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.debut).getTime() - new Date(a.debut).getTime());
  }, [allLogs, search]);

  /**
   * Numéros à rappeler : on ne garde que le DERNIER appel de chaque client, et
   * seulement s'il appelle un rappel (pas décroché, injoignable, ou résultat
   * « À rappeler »). Un client rappelé et joint depuis disparaît donc de la liste.
   */
  const aRappelerList = useMemo(() => {
    const dernier = new Map<string, (typeof allLogs)[number]>();
    for (const l of allLogs) {
      const cle = `${l.magasinId}__${(l.telephone || l.client || '').trim().toLowerCase()}`;
      const prec = dernier.get(cle);
      if (!prec || new Date(l.debut).getTime() > new Date(prec.debut).getTime()) dernier.set(cle, l);
    }
    const q = search.toLowerCase();
    return Array.from(dernier.values())
      .filter(l => l.statut !== 'Décroché' || l.resultat === 'À rappeler')
      .filter(l => !q || [l.client, l.telephone, l.conseillere, l.resultat, l.commentaire, getMagasinLabel(l.magasinId)].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.debut).getTime() - new Date(a.debut).getTime());
  }, [allLogs, search]);

  /** Appels décrochés du jour, du plus récent au plus ancien. */
  const decrochesList = useMemo(() => {
    const today = new Date().toDateString();
    const q = search.toLowerCase();
    return allLogs
      .filter(l => l.statut === 'Décroché' && new Date(l.debut).toDateString() === today)
      .filter(l => !q || [l.client, l.telephone, l.conseillere, l.resultat, l.commentaire, getMagasinLabel(l.magasinId)].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.debut).getTime() - new Date(a.debut).getTime());
  }, [allLogs, search]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayLogs = allLogs.filter(l => new Date(l.debut).toDateString() === today);
    const tempsTotal = todayLogs.filter(l => l.statut === 'Décroché').reduce((s, l) => s + (l.duree || 0), 0);
    const aboutis = todayLogs.filter(l => l.statut === 'Décroché').length;
    return { nbAppels: todayLogs.length, tempsTotal, aboutis, aRappeler: aRappelerList.length };
  }, [allLogs, aRappelerList]);

  // Relance d'un client depuis la liste « À rappeler ».
  const rappeler = (l: (typeof allLogs)[number]) => {
    const contact: CallContact = {
      id: `rappel__${l.id}`,
      numRef: l.numRef || '',
      client: l.client,
      telephone: l.telephone,
      motif: 'Rappel',
      rendezVous: l.debut,
      date: l.debut,
      vendeuse: l.conseillere || '',
      magasinId: (l.magasinId || '').toUpperCase(),
      source: 'vente',
    };
    demarrerAppel(contact, l.magasinId);
  };

  return (
    <div className="flex flex-col gap-4 p-6" style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
      {activeCall && (
        <CallPanel
          key={activeCall.contact.id}
          rdv={activeCall.contact}
          startedAt={activeCall.startedAt}
          conseillere={conseillere}
          onSave={log => { saveLogForMagasin(activeCall.magasinId, log); terminerAppel(); changerTab('historique'); }}
          onCancel={terminerAppel}
        />
      )}

      {/* En-tête */}
      <div className="bg-white rounded-lg shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg text-white" style={{ backgroundColor: TEAL }}><Phone size={20} /></div>
          <div>
            <h1 className="text-base font-bold text-gray-800">Call Center — Tous les magasins (Ventes &amp; Factures)</h1>
            <p className="text-xs text-gray-500">Connectée : <span className="font-semibold">{conseillere}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Combobox
            value={selectedMag}
            onChange={setSelectedMag}
            options={[{ value: 'ALL', label: 'Tous les magasins' }, ...magasins.map(m => ({ value: m.id, label: m.label }))]}
            placeholder="Magasin…"
            title="Magasin à afficher"
            width={200}
          />
          <Combobox
            value={month}
            onChange={setMonth}
            options={monthOptions.map(m => ({ value: m, label: monthLabel(m) }))}
            placeholder="Mois…"
            title="Mois des ventes à rappeler"
            width={170}
          />
          <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
            <Search size={14} className="ml-2 text-gray-400" />
            <input className="px-2 py-1.5 text-sm outline-none bg-transparent" style={{ width: 240 }}
              placeholder="Rechercher client, téléphone, magasin..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="px-1.5 text-gray-400"><X size={12} /></button>}
          </div>
        </div>
      </div>

      {/* Statistiques du jour */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<PhoneCall size={18} />} value={String(stats.nbAppels)} label="Appels aujourd'hui" color="#1a7a96" />
        <Stat icon={<Timer size={18} />} value={fmtDureeLong(stats.tempsTotal)} label="Temps au téléphone (jour)" color="#7c3aed" />
        {/* Cliquable : ouvre la liste des appels décrochés du jour. */}
        <button
          type="button"
          onClick={() => changerTab('decroches')}
          title="Voir la liste des appels décrochés aujourd'hui"
          className="text-left rounded-lg transition hover:opacity-90 hover:ring-2"
          style={{ ['--tw-ring-color' as any]: '#16a34a' }}>
          <Stat icon={<CheckCircle2 size={18} />} value={String(stats.aboutis)} label="Décrochés (jour)" color="#16a34a" />
        </button>
        {/* Cliquable : ouvre la liste des numéros à rappeler. */}
        <button
          type="button"
          onClick={() => changerTab('rappeler')}
          title="Voir la liste des numéros à rappeler"
          className="text-left rounded-lg transition hover:opacity-90 hover:ring-2"
          style={{ ['--tw-ring-color' as any]: '#d97706' }}>
          <Stat icon={<History size={18} />} value={String(stats.aRappeler)} label="À rappeler" color="#d97706" />
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-2">
        {([
          ['clients', `Clients à appeler (${totalClients})`],
          ['rappeler', `À rappeler (${aRappelerList.length})`],
          ['decroches', `Décrochés du jour (${decrochesList.length})`],
          ['historique', `Historique des appels (${allLogs.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => changerTab(key)}
            className="px-4 py-2 rounded-t-lg text-sm font-semibold"
            style={{ backgroundColor: tab === key ? '#fff' : 'transparent', color: tab === key ? TEAL : '#4b5563' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div className="bg-white rounded-lg rounded-tl-none shadow-sm p-5 -mt-4">
        {tab === 'clients' ? (
          magasins.length === 0 ? (
            <div className="text-center py-12 text-gray-400 border border-gray-200 rounded">Aucun magasin actif.</div>
          ) : (
            <div className="flex flex-col gap-6">
              {magasinsData.map(({ magasin, groupes, total }) => (
                <div key={magasin.id}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Store size={16} style={{ color: TEAL }} />
                    <span className="font-bold text-gray-800">{magasin.label}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: TEAL }}>
                      {total} client{total > 1 ? 's' : ''} à appeler
                    </span>
                    <div className="flex-1" />
                    {peutModifierClients && (<>
                    <button
                      onClick={() => setAddModal({ magasinId: magasin.id })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: TEAL }}>
                      <Plus size={13} /> Ajouter un client
                    </button>
                    <button
                      onClick={() => openImport(magasin.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border"
                      style={{ borderColor: TEAL, color: TEAL }}>
                      <Upload size={13} /> Importer (CSV)
                    </button>
                    <button
                      onClick={() => openImportPdf(magasin.id)}
                      disabled={pdfImporting}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: '#9a3412' }}
                      title="Importer un ou plusieurs états clients PDF (le mois est détecté automatiquement)">
                      {pdfImporting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                      {pdfImporting ? 'Import…' : 'Importer (PDF)'}
                    </button>
                    {lastImport && lastImport.magasinId === magasin.id && (
                      <button
                        onClick={undoLastImport}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border"
                        style={{ borderColor: '#b91c1c', color: '#b91c1c' }}
                        title="Retirer le dernier lot de clients importé par PDF">
                        <Trash2 size={13} /> Annuler le dernier import ({lastImport.ids.length})
                      </button>
                    )}
                    </>)}
                  </div>
                  {total === 0 ? (
                    <div className="text-sm text-gray-400 border border-gray-200 rounded px-4 py-4">
                      Aucun client pour {monthLabel(month)}{!isAdmin ? ' (vos ventes)' : ''}.
                      {peutModifierClients && ' Utilisez « Ajouter un client » ou « Importer (CSV) ».'}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {groupes.map(groupe => (
                        <div key={groupe.vendeuse} className="border border-gray-200 rounded overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: TEAL + '14' }}>
                            <div className="flex items-center gap-2">
                              <User size={15} style={{ color: TEAL }} />
                              <span className="font-bold text-gray-800">{groupe.vendeuse}</span>
                            </div>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: TEAL }}>
                              {groupe.contacts.length} client{groupe.contacts.length > 1 ? 's' : ''}
                            </span>
                          </div>
                          {/* Desktop table */}
                          <div className="hidden md:block">
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
                                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50" style={r.source === 'import' ? { backgroundColor: '#fff7ed' } : undefined}>
                                    <td className="px-3 py-2 font-semibold text-gray-800">{r.client}</td>
                                    <td className="px-3 py-2 text-gray-700">{r.telephone || <span className="text-gray-400">— aucun —</span>}</td>
                                    <td className="px-3 py-2 text-gray-700">{fmtDate(r.rendezVous)}</td>
                                    <td className="px-3 py-2">
                                      {r.source === 'import' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: '#fed7aa', color: '#9a3412' }}>
                                          <Upload size={11} /> Ajouté / Importé
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: TEAL + '22', color: TEAL }}>
                                          <Store size={11} /> {r.motif || 'Vente'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {last ? (
                                        <div className="text-xs">
                                          <span className="px-2 py-0.5 rounded text-white font-semibold" style={{ backgroundColor: issueColor[last.statut] || resultatColor(last.resultat) }}>{last.statut || last.resultat}</span>
                                          <div className="text-gray-400 mt-0.5">{fmtDateTime(last.debut)}{last.statut === 'Décroché' ? ` · ${fmtDuree(last.duree)}` : ''}{nb > 1 ? ` · ${nb} appels` : ''}</div>
                                        </div>
                                      ) : <span className="text-xs text-gray-400">Jamais appelé</span>}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          onClick={() => demarrerAppel(r, magasin.id)}
                                          disabled={!r.telephone}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                          style={{ backgroundColor: '#16a34a' }}>
                                          <Phone size={13} /> Appeler
                                        </button>
                                        {peutModifierClients && r.source === 'import' && r.extraId && (
                                          <button
                                            onClick={() => { if (window.confirm('Retirer ce client importé ?')) removeExtra(magasin.id, r.extraId!); }}
                                            title="Retirer ce client importé"
                                            className="p-1.5 rounded border border-gray-300 text-red-400 hover:bg-red-50">
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          </div>
                          {/* Mobile cards */}
                          <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px' }}>
                            {groupe.contacts.map(r => {
                              const last = lastCallByRdv[r.id] || lastCallByRdv[r.numRef] || lastCallByRdv[r.client];
                              const nb = nbAppelsByRdv[r.id] || nbAppelsByRdv[r.numRef] || nbAppelsByRdv[r.client] || 0;
                              return (
                                <div key={r.id} style={{ backgroundColor: r.source === 'import' ? '#fff7ed' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                    <span style={{ fontWeight: 700, fontSize: 'clamp(13px, 3.5vw, 15px)', color: '#1f2937' }}>{r.client}</span>
                                    {r.source === 'import' ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: '#fed7aa', color: '#9a3412' }}>
                                        <Upload size={10} /> Importé
                                      </span>
                                    ) : (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: TEAL + '22', color: TEAL }}>
                                        <Store size={10} /> {r.motif || 'Vente'}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                                    <PhoneCall size={12} style={{ display: 'inline', marginRight: 4, color: TEAL }} />{r.telephone || <span style={{ color: '#9ca3af' }}>— aucun —</span>}
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                                    Dernier achat: {fmtDate(r.rendezVous)}
                                    {last && (
                                      <span style={{ marginLeft: 8 }}>
                                        · <span style={{ display: 'inline', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#fff', backgroundColor: issueColor[last.statut] || resultatColor(last.resultat) }}>{last.statut || last.resultat}</span>
                                        {nb > 1 && <span style={{ marginLeft: 4, color: '#9ca3af' }}>{nb} appels</span>}
                                      </span>
                                    )}
                                    {!last && <span style={{ marginLeft: 8, color: '#9ca3af' }}>· Jamais appelé</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={() => demarrerAppel(r, magasin.id)}
                                      disabled={!r.telephone}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: r.telephone ? 1 : 0.4 }}>
                                      <Phone size={13} /> Appeler
                                    </button>
                                    {peutModifierClients && r.source === 'import' && r.extraId && (
                                      <button
                                        onClick={() => { if (window.confirm('Retirer ce client importé ?')) removeExtra(magasin.id, r.extraId!); }}
                                        style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#ef4444', cursor: 'pointer' }}>
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : tab === 'decroches' ? (
          <>
            {/* Desktop table */}
            <div className="hidden md:block border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Client</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Téléphone</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Magasin</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700"><span className="inline-flex items-center gap-1"><Clock size={12} /> Heure</span></th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Durée</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Conseillère</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Résultat</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Commentaire</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {decrochesList.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun appel décroché aujourd'hui</td></tr>
                  ) : decrochesList.map(l => (
                    <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800">{l.client}</td>
                      <td className="px-3 py-2 text-gray-700 font-mono">{l.telephone || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 font-semibold">{getMagasinLabel(l.magasinId)}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{fmtDateTime(l.debut)}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">{fmtDuree(l.duree)}</td>
                      <td className="px-3 py-2 text-gray-700">{l.conseillere || '—'}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: resultatColor(l.resultat) }}>{l.resultat || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{l.commentaire || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => rappeler(l)}
                          disabled={!l.telephone}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ backgroundColor: '#16a34a' }}>
                          <Phone size={13} /> Rappeler
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {decrochesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>Aucun appel décroché aujourd'hui</div>
              ) : decrochesList.map(l => (
                <div key={l.id} style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: 'clamp(13px, 3.5vw, 15px)', color: '#1f2937' }}>{l.client}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, color: '#fff', backgroundColor: resultatColor(l.resultat) }}>{l.resultat || '—'}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151', marginBottom: '3px' }}><PhoneCall size={12} style={{ display: 'inline', marginRight: 4, color: '#16a34a' }} />{l.telephone || '—'}</div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#6b7280', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span><Store size={11} style={{ display: 'inline', marginRight: 3 }} />{getMagasinLabel(l.magasinId)}</span>
                    <span><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{fmtDateTime(l.debut)}</span>
                    <span>Durée: {fmtDuree(l.duree)}</span>
                    {l.conseillere && <span>· {l.conseillere}</span>}
                  </div>
                  {l.commentaire && <div style={{ fontSize: '12px', color: '#4b5563', marginBottom: '8px', fontStyle: 'italic' }}>{l.commentaire}</div>}
                  <button
                    onClick={() => rappeler(l)}
                    disabled={!l.telephone}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: l.telephone ? 1 : 0.4 }}>
                    <Phone size={13} /> Rappeler
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : tab === 'rappeler' ? (
          <>
            {/* Desktop table */}
            <div className="hidden md:block border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Client</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Téléphone</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Magasin</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700"><span className="inline-flex items-center gap-1"><Clock size={12} /> Dernier appel</span></th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Statut</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Résultat</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Conseillère</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Commentaire</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {aRappelerList.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun numéro à rappeler 🎉</td></tr>
                  ) : aRappelerList.map(l => (
                    <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800">{l.client}</td>
                      <td className="px-3 py-2 text-gray-700 font-mono">{l.telephone || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 font-semibold">{getMagasinLabel(l.magasinId)}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{fmtDateTime(l.debut)}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: issueColor[l.statut] || '#6b7280' }}>{l.statut || '—'}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ backgroundColor: resultatColor(l.resultat) }}>{l.resultat || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{l.conseillere || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{l.commentaire || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => rappeler(l)}
                          disabled={!l.telephone}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ backgroundColor: '#d97706' }}>
                          <Phone size={13} /> Rappeler
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {aRappelerList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>Aucun numéro à rappeler</div>
              ) : aRappelerList.map(l => (
                <div key={l.id} style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: 'clamp(13px, 3.5vw, 15px)', color: '#1f2937' }}>{l.client}</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 7px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, color: '#fff', backgroundColor: issueColor[l.statut] || '#6b7280' }}>{l.statut || '—'}</span>
                      <span style={{ padding: '2px 7px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, color: '#fff', backgroundColor: resultatColor(l.resultat) }}>{l.resultat || '—'}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151', marginBottom: '3px' }}><PhoneCall size={12} style={{ display: 'inline', marginRight: 4, color: '#d97706' }} />{l.telephone || '—'}</div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#6b7280', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span><Store size={11} style={{ display: 'inline', marginRight: 3 }} />{getMagasinLabel(l.magasinId)}</span>
                    <span><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{fmtDateTime(l.debut)}</span>
                    {l.conseillere && <span>· {l.conseillere}</span>}
                  </div>
                  {l.commentaire && <div style={{ fontSize: '12px', color: '#4b5563', marginBottom: '8px', fontStyle: 'italic' }}>{l.commentaire}</div>}
                  <button
                    onClick={() => rappeler(l)}
                    disabled={!l.telephone}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '6px', backgroundColor: '#d97706', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: l.telephone ? 1 : 0.4 }}>
                    <Phone size={13} /> Rappeler
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700"><span className="inline-flex items-center gap-1"><Clock size={12} /> Heure d'appel</span></th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Client</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Magasin</th>
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
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun appel enregistré</td></tr>
                  ) : filteredLogs.map(l => (
                    <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700 text-xs">{fmtDateTime(l.debut)}</td>
                      <td className="px-3 py-2 font-semibold text-gray-800">{l.client}</td>
                      <td className="px-3 py-2 text-gray-700 font-semibold">{getMagasinLabel(l.magasinId)}</td>
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
            {/* Mobile cards */}
            <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>Aucun appel enregistré</div>
              ) : filteredLogs.map(l => (
                <div key={l.id} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: 'clamp(13px, 3.5vw, 15px)', color: '#1f2937' }}>{l.client}</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 7px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, color: '#fff', backgroundColor: issueColor[l.statut] || '#6b7280' }}>{l.statut || '—'}</span>
                      {l.resultat && <span style={{ padding: '2px 7px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, color: '#fff', backgroundColor: resultatColor(l.resultat) }}>{l.resultat}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151', marginBottom: '3px' }}><PhoneCall size={12} style={{ display: 'inline', marginRight: 4, color: TEAL }} />{l.telephone || '—'}</div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#6b7280', marginBottom: l.commentaire ? '6px' : '0', flexWrap: 'wrap' }}>
                    <span><Store size={11} style={{ display: 'inline', marginRight: 3 }} />{getMagasinLabel(l.magasinId)}</span>
                    <span><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{fmtDateTime(l.debut)}</span>
                    {l.statut === 'Décroché' && <span>· {fmtDuree(l.duree)}</span>}
                    {l.conseillere && <span>· {l.conseillere}</span>}
                  </div>
                  {l.commentaire && <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px', fontStyle: 'italic' }}>{l.commentaire}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Inputs fichiers cachés — absents si l'utilisateur n'a pas le droit d'importer. */}
      {peutModifierClients && (<>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={handleFile}
      />

      {/* Input fichier caché pour l'import PDF « ÉTAT CLIENT » (multi-fichiers). */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={handlePdfFiles}
      />
      </>)}

      {/* Modal d'ajout manuel d'un client. */}
      {addModal && peutModifierClients && (
        <AddClientModal
          magasinLabel={getMagasinLabel(addModal.magasinId)}
          monthLbl={monthLabel(month)}
          onCancel={() => setAddModal(null)}
          onSave={data => { addExtras(addModal.magasinId, [{ ...data, month }]); setAddModal(null); }}
        />
      )}
    </div>
  );
}

// ── Modal d'ajout manuel d'un client ────────────────────────────────────────────
function AddClientModal({
  magasinLabel, monthLbl, onCancel, onSave,
}: {
  magasinLabel: string; monthLbl: string;
  onCancel: () => void;
  onSave: (data: { client: string; telephone: string; vendeuse: string }) => void;
}) {
  const [client, setClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [vendeuse, setVendeuse] = useState('');
  const iCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white focus:border-blue-400 w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-800">Ajouter un client — {magasinLabel}</span>
          <button onClick={onCancel}><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <p className="text-xs text-gray-500">Ce client sera ajouté à la liste d'appels de <b>{monthLbl}</b>.</p>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Nom du client <span className="text-red-500">*</span></label>
            <input className={iCls} placeholder="Nom du client..." value={client} onChange={e => setClient(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Téléphone</label>
            <input className={iCls} placeholder="Numéro de téléphone..." value={telephone} onChange={e => setTelephone(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Conseillère (optionnel)</label>
            <input className={iCls} placeholder="Assigner à une conseillère..." value={vendeuse} onChange={e => setVendeuse(e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-1">Laissez vide pour le placer dans « Clients importés ».</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onCancel} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
          <button
            onClick={() => {
              if (!client.trim() && !telephone.trim()) { alert('Renseignez au moins un nom ou un téléphone.'); return; }
              onSave({ client: client.trim(), telephone: telephone.trim(), vendeuse: vendeuse.trim() });
            }}
            className="px-4 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: TEAL }}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

export default CallCenterGlobalPage;
