import { useState, useMemo, useEffect } from 'react';
import { Search, X, Edit, MessageSquare, Plus, FileDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatAuditInfo, formatDate, AuditInfo } from '../../utils/auditUtils';
import { getMagasins } from '../../constants/magasins';
import { AddButton } from '../../components/AddButton';
import { chargerClients, upsertClient, subscribeClientsMagasin, readClientsCache, type ClientRow } from '../../services/clientsService';
import { chargerToutesLesVentes, subscriberToutesLesVentes, readVentesCache, type VenteSupabase } from '../../services/ventesService';
import { TENANT } from '../../config/tenant';
import { MODELE_CLIENTS, genererCatalogueCsv, telechargerCsv } from '../../utils/catalogueCsv';

// ── Fonction pour récupérer les magasins à jour ──────────────────────────────
const getAllMagasins = () => getMagasins().map(magasin => ({
  id: magasin.id,
  label: magasin.label.replace(`${TENANT.nom} `, ''),
}));

// Couleurs fixes des magasins historiques. Pour TOUT nouveau magasin (ex. bouake)
// absent de cette table, on calcule une couleur STABLE à partir de son id : sans
// cela, `backgroundColor` valait `undefined` → bouton blanc « invisible ».
const MAGASIN_COLORS: Record<string, string> = {
  abobo: '#2563eb', faya: '#16a34a', koumassi: '#d97706', palmeraie: '#7c3aed',
  yopougon: '#1a7a96', bingerville: '#db2777', man: '#0891b2', global: '#6b7280',
};
const PALETTE_FALLBACK = ['#0d9488', '#c026d3', '#ea580c', '#4f46e5', '#65a30d', '#0369a1', '#be123c', '#7c2d12'];
function magasinColor(id: string): string {
  if (MAGASIN_COLORS[id]) return MAGASIN_COLORS[id];
  // Hash déterministe de l'id → même couleur à chaque rendu / rechargement.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE_FALLBACK[h % PALETTE_FALLBACK.length];
}

// ── types ──────────────────────────────────────────────────────────────────────
interface Client extends AuditInfo {
  id: string; numeroClient: string; nom: string; telephone: string;
  telephone2?: string; email?: string; adresse?: string; profession?: string;
  jourNaissance?: string; moisNaissance?: string; anneeNaissance?: string;
  matriculeAssurance?: string; entreprise?: string; notes?: string;
  solde: number; dateEdition: string; magasinId?: string; magasinLabel?: string; source?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const genNum = () => String(Math.floor(10000 + Math.random() * 90000));

// ── Mapping Firestore (snake_case) ↔ UI (camelCase) ───────────────────────────
const magLabelOf = (id?: string) => {
  if (!id || id === 'global') return 'Global';
  return getAllMagasins().find(m => m.id === id)?.label ?? id;
};

function rowToClient(r: ClientRow): Client {
  const any = r as any;
  return {
    id: r.id, numeroClient: r.numero_client, nom: r.nom, telephone: r.telephone,
    telephone2: r.telephone2, email: r.email, adresse: r.adresse, profession: r.profession,
    jourNaissance: r.jour_naissance, moisNaissance: r.mois_naissance, anneeNaissance: r.annee_naissance,
    matriculeAssurance: r.matricule_assurance, entreprise: r.entreprise, notes: r.notes,
    solde: r.solde ?? 0, dateEdition: r.date_edition, source: r.source,
    magasinId: r.magasin_id, magasinLabel: magLabelOf(r.magasin_id),
    createdBy: any.createdBy, createdAt: any.createdAt, updatedBy: any.updatedBy, updatedAt: any.updatedAt,
  } as Client;
}

function clientToRow(c: Client): Partial<ClientRow> {
  return {
    id: c.id, magasin_id: c.magasinId || 'global', numero_client: c.numeroClient,
    nom: c.nom, telephone: c.telephone, telephone2: c.telephone2, email: c.email,
    adresse: c.adresse, profession: c.profession, jour_naissance: c.jourNaissance,
    mois_naissance: c.moisNaissance, annee_naissance: c.anneeNaissance,
    matricule_assurance: c.matriculeAssurance, entreprise: c.entreprise, notes: c.notes,
    solde: c.solde ?? 0, date_edition: c.dateEdition, source: c.source,
    // Champs d'audit conservés tels quels (camelCase) pour un aller-retour propre
    ...(c.createdBy ? { createdBy: c.createdBy } as any : {}),
    ...(c.createdAt ? { createdAt: c.createdAt } as any : {}),
    ...(c.updatedBy ? { updatedBy: c.updatedBy } as any : {}),
    ...(c.updatedAt ? { updatedAt: c.updatedAt } as any : {}),
  } as Partial<ClientRow>;
}

// Clients dérivés des ventes Firestore (pour les clients jamais enregistrés en fiche)
function extractFromVentesRows(ventes: VenteSupabase[]): Client[] {
  const out: Client[] = [];
  const seen = new Set<string>();
  ventes.forEach(v => {
    const num = v.numero_client;
    if (!num || seen.has(num)) return;
    seen.add(num);
    const a = parseFloat((v.recap as any)?.acompte) || 0;
    const as2 = ((v.bons_assurance as any[]) || []).reduce((s: number, b: any) => s + (parseFloat(b.montantPrisEnCharge) || 0), 0);
    out.push({
      id: `v-${num}`, numeroClient: num, nom: v.client || '', telephone: v.telephone || '',
      solde: (v.total_net || 0) - a - as2, dateEdition: v.date || new Date().toISOString(),
      source: 'vente', magasinId: v.magasin_id, magasinLabel: magLabelOf(v.magasin_id),
    } as Client);
  });
  return out;
}

const iCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
const roCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-500';
const selCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white';
const Lbl = ({req,children}:{req?:boolean;children:React.ReactNode}) => <div className="text-xs text-gray-600 mb-1">{children}{req&&<span className="text-red-500 ml-0.5">*</span>}</div>;
const fmtDate = (iso: string) => { try { const d=new Date(iso); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; } catch { return iso; } };
const fmtN = (c: Client) => c.jourNaissance&&c.moisNaissance&&c.anneeNaissance ? `${c.jourNaissance} - ${c.moisNaissance} - ${c.anneeNaissance}` : '—';
const PAGE_SIZE = 20;

// ── Modal formulaire ──────────────────────────────────────────────────────────
function ModalClient({initial,onSave,onClose}:{initial?:Client;onSave:(c:Client)=>void;onClose:()=>void}) {
  const magasins = getAllMagasins();
  const [form,setForm] = useState<Client>(initial??{id:Date.now().toString(),numeroClient:genNum(),nom:'',telephone:'',telephone2:'',email:'',adresse:'',profession:'',jourNaissance:'',moisNaissance:'',anneeNaissance:'',matriculeAssurance:'',entreprise:'',notes:'',solde:0,dateEdition:new Date().toISOString(),magasinId:'global',magasinLabel:'Global'});
  const set = (k:keyof Client) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(f=>({...f,[k]:e.target.value}));
  const handleSave = () => { if(!form.nom){alert('Nom requis');return;} if(!form.telephone){alert('Téléphone requis');return;} onSave({...form,dateEdition:new Date().toISOString()}); onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4" style={{backgroundColor:'rgba(0,0,0,0.45)'}}>
      <div className="bg-white rounded-lg shadow-2xl w-full" style={{maxWidth:900,maxHeight:'85vh',overflowY:'auto'}}>
        <div className="p-6 flex flex-col gap-5">
          <div className="flex gap-4">
            <div style={{width:130}}><Lbl req>N° Client</Lbl><input className={roCls+' font-mono font-bold'} readOnly value={form.numeroClient}/></div>
            <div className="flex-1"><Lbl req>Nom & Prénoms Client</Lbl><input className={iCls} value={form.nom} onChange={set('nom')}/></div>
            <div style={{width:180}}><Lbl req>N° Téléphone I</Lbl><input className={iCls} value={form.telephone} onChange={set('telephone')}/></div>
            <div style={{width:180}}><Lbl>N° Téléphone II</Lbl><input className={iCls} value={form.telephone2??''} onChange={set('telephone2')}/></div>
            <div className="flex-1"><Lbl>Email</Lbl><input type="email" className={iCls} value={form.email??''} onChange={set('email')}/></div>
          </div>
          <div className="flex gap-4">
            <div style={{width:200}}><Lbl>Magasin</Lbl>
              <select className={selCls} value={form.magasinId??'global'} onChange={e=>{const mag=magasins.find(m=>m.id===e.target.value); setForm(f=>({...f,magasinId:e.target.value,magasinLabel:mag?.label??'Global'}));}}>
                <option value="global">— Global —</option>
                {magasins.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div style={{width:200}}><Lbl>Adresse</Lbl>
              <select className={selCls} value={form.adresse??''} onChange={set('adresse')}>
                <option value="">Adresse...</option>
                {['Abobo','Adjamé','Cocody','Koumassi','Marcory','Plateau','Treichville','Yopougon'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{width:200}}><Lbl>Profession</Lbl>
              <select className={selCls} value={form.profession??''} onChange={set('profession')}>
                <option value="">Profession...</option>
                {['Commerçant(e)','Enseignant(e)','Étudiant(e)','Fonctionnaire','Infirmier(ère)','Médecin','Retraité(e)','Sans emploi'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div><Lbl>Jour de Naissance</Lbl>
              <div className="flex gap-1">
                <input className={iCls} style={{width:70}} placeholder="Jour" value={form.jourNaissance??''} onChange={set('jourNaissance')}/>
                <input className={iCls} style={{width:70}} placeholder="Mois" value={form.moisNaissance??''} onChange={set('moisNaissance')}/>
                <input className={iCls} style={{width:90}} placeholder="Année" value={form.anneeNaissance??''} onChange={set('anneeNaissance')}/>
              </div>
            </div>
          </div>
          <div className="flex gap-4 items-end pb-4 border-b border-dashed border-gray-200">
            <div style={{width:320}}><Lbl>Matricule Assurance</Lbl><input className={iCls} style={{backgroundColor:'#fff8f0'}} value={form.matriculeAssurance??''} onChange={set('matriculeAssurance')}/></div>
            <div style={{width:240}}><Lbl>Carte Assuré(e)</Lbl>
              <div className="flex border border-gray-300 rounded overflow-hidden">
                <span className="px-3 py-1.5 text-xs text-gray-500 bg-white flex-1">Aucun Fichier</span>
                <label className="px-3 py-1.5 text-xs font-semibold cursor-pointer text-white" style={{backgroundColor:'#e09a2b'}}>Charger<input type="file" className="hidden"/></label>
              </div>
            </div>
            <div className="flex-1"><Lbl>Entreprise</Lbl><select className={selCls} value={form.entreprise??''} onChange={set('entreprise')}><option value="">Entreprise...</option></select></div>
          </div>
          <div><Lbl>Notes</Lbl><textarea className={iCls+' resize-none'} rows={2} value={form.notes??''} onChange={set('notes')}/></div>

          {/* Informations d'audit */}
          {initial && (initial.createdBy || initial.updatedBy) && (
            <div className="border-t border-gray-200 pt-3 mt-2">
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
                {initial.createdBy && (
                  <div>
                    <span className="font-semibold text-gray-600">Créé par:</span>
                    <div>{formatAuditInfo(initial).created}</div>
                  </div>
                )}
                {initial.updatedBy && (
                  <div>
                    <span className="font-semibold text-gray-600">Modifié par:</span>
                    <div>{formatAuditInfo(initial).updated}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-700">Fermer</button>
          <button onClick={handleSave} className="px-5 py-2 rounded text-sm text-white font-semibold" style={{backgroundColor:'#1a7a96'}}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export function ClientPage() {
  // Affichage INSTANTANÉ depuis le cache, puis temps réel Firestore.
  const [fsClients, setFsClients] = useState<Client[]>(
    () => [...getAllMagasins().map(m => m.id), 'global'].flatMap(id => readClientsCache(id).map(rowToClient)),
  );
  const [ventesRows, setVentesRows] = useState<VenteSupabase[]>(() => readVentesCache('ALL'));
  const [modal, setModal] = useState<{item?:Client}|null>(null);
  const [search, setSearch] = useState('');
  const [filterMagasin, setFilterMagasin] = useState('');
  const [filterJour, setFilterJour] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [page, setPage] = useState(1);
  const [magasins, setMagasins] = useState(getAllMagasins());

  // Recharger les magasins périodiquement et au focus de la page
  useEffect(() => {
    const reloadMagasins = () => {
      setMagasins(getAllMagasins());
    };

    // Recharger au montage
    reloadMagasins();

    // Recharger toutes les 2 secondes
    const interval = setInterval(reloadMagasins, 2000);

    // Recharger quand la fenêtre reprend le focus
    window.addEventListener('focus', reloadMagasins);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', reloadMagasins);
    };
  }, []);

  // ── Chargement DIRECT des clients depuis Firestore (+ temps réel onSnapshot) ──
  // Modèle du STOCK/tableau de bord : ce qu'un navigateur écrit, tous le voient.
  // Clé stable = ensemble des ids de magasins. L'effet se ré-abonne UNIQUEMENT
  // quand un magasin est ajouté/retiré (et non à chaque rechargement 2 s de la
  // liste), ce qui garantit que les clients d'un nouveau magasin remontent.
  const magasinIdsKey = useMemo(
    () => [...magasins.map(m => m.id), 'global'].sort().join(','),
    [magasins],
  );
  useEffect(() => {
    const ids = magasinIdsKey.split(',');
    const byMag = new Map<string, Client[]>();
    const flush = () => setFsClients(Array.from(byMag.values()).flat());
    const unsubs = ids.map(id => {
      chargerClients(id).then(rows => { byMag.set(id, rows.map(rowToClient)); flush(); });
      return subscribeClientsMagasin(id, rows => { byMag.set(id, rows.map(rowToClient)); flush(); });
    });
    return () => unsubs.forEach(u => u());
  }, [magasinIdsKey]);

  // ── Chargement DIRECT des ventes depuis Firestore (pour clients dérivés) ──────
  useEffect(() => {
    chargerToutesLesVentes().then(setVentesRows);
    const map = new Map<string, VenteSupabase>();
    const apply = () => setVentesRows(Array.from(map.values()));
    const unsub = subscriberToutesLesVentes(
      v => { map.set(v.id, v); apply(); },
      v => { map.set(v.id, v); apply(); },
      id => { map.delete(id); apply(); },
    );
    return () => unsub();
  }, []);

  // Agrégation : fiches clients Firestore + clients dérivés des ventes
  const allClients = useMemo(() => {
    const venteClients = extractFromVentesRows(ventesRows);
    const seen = new Set<string>();
    const result: Client[] = [];
    fsClients.forEach(c => { if (!seen.has(c.numeroClient)) { seen.add(c.numeroClient); result.push(c); } });
    venteClients.forEach(c => { if (!seen.has(c.numeroClient)) { seen.add(c.numeroClient); result.push(c); } });
    return result;
  }, [fsClients, ventesRows, magasins]);

  const filtered = useMemo(() => allClients.filter(c => {
    const mt = !search || [c.nom,c.numeroClient,c.telephone,c.email??'',c.adresse??'',c.profession??''].some(v=>v.toLowerCase().includes(search.toLowerCase()));
    const mm = !filterMagasin || (c.magasinLabel??'').toLowerCase().includes(filterMagasin.toLowerCase()) || (c.magasinId??'') === filterMagasin;
    const mj = !filterJour || fmtN(c).includes(filterJour);
    const md = !filterDate || (c.dateEdition??'').slice(0,10) === filterDate;
    return mt && mm && mj && md;
  }), [allClients, search, filterMagasin, filterJour, filterDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const goPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));

  const handleSave = (c: Client) => {
    // Ajouter les informations d'audit
    const isUpdate = fsClients.find(m=>m.id===c.id);
    const clientWithAudit = isUpdate ? addUpdateAudit(c) : addCreateAudit(c);

    // Mise à jour optimiste locale, puis écriture DIRECTE dans Firestore
    // (partagée avec tous les navigateurs ; onSnapshot resynchronise ensuite).
    setFsClients(prev => isUpdate
      ? prev.map(m => m.id === c.id ? clientWithAudit : m)
      : [clientWithAudit, ...prev]);
    upsertClient(clientToRow(clientWithAudit));
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }} className="px-5 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-700" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Base de Données Clients — Tous Magasins</span>
          <div className="flex gap-1 flex-wrap">
            {magasins.map(m => {
              const count = allClients.filter(c=>c.magasinId===m.id).length;
              return (
                <button key={m.id} onClick={()=>setFilterMagasin(filterMagasin===m.id?'':m.id)}
                  className="px-2 py-0.5 rounded text-xs font-semibold text-white transition-opacity"
                  style={{backgroundColor:magasinColor(m.id), opacity:filterMagasin&&filterMagasin!==m.id?0.4:1}}>
                  {m.label} ({count})
                </button>
              );
            })}
            {filterMagasin && <button onClick={()=>setFilterMagasin('')} className="px-2 py-0.5 rounded text-xs border border-gray-300 text-gray-600">Tous</button>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Export seul : l'import se fait depuis la page Clients d'un magasin,
              car un client doit être rattaché à un magasin précis. */}
          <button
            onClick={()=>telechargerCsv(genererCatalogueCsv(filtered, MODELE_CLIENTS.colonnes), MODELE_CLIENTS.nom)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
            <FileDown size={14}/> Exporter ICC.csv
          </button>
          <AddButton onClick={()=>setModal({})} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-white text-sm font-semibold" style={{backgroundColor:'#1a7a96'}}>
            <Plus size={14}/> Ajouter Client
          </AddButton>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <h1 className="text-xl font-bold text-gray-800" style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}>Clients ({allClients.length})</h1>

        {/* Filtres */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Infos Client...</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input className="px-2 py-1.5 text-sm outline-none flex-1 bg-transparent" placeholder="Infos Client..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
              {search&&<button onClick={()=>setSearch('')} className="px-2 text-gray-400"><X size={13}/></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Jour de Naissance...</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input className="px-2 py-1.5 text-sm outline-none flex-1 bg-transparent" placeholder="20-01" value={filterJour} onChange={e=>{setFilterJour(e.target.value);setPage(1);}}/>
              {filterJour&&<button onClick={()=>setFilterJour('')} className="px-2 text-gray-400"><X size={13}/></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Date Édition</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input type="date" className="px-2 py-1.5 text-sm outline-none flex-1 bg-transparent" value={filterDate} onChange={e=>{setFilterDate(e.target.value);setPage(1);}}/>
              {filterDate&&<button onClick={()=>setFilterDate('')} className="px-1 text-gray-400"><X size={13}/></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">...</label>
            <button className="flex items-center justify-center rounded text-white" style={{backgroundColor:'#1a7a96',height:34}}><Search size={15}/></button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={()=>goPage(1)} disabled={page===1} className="p-1 text-gray-500 disabled:opacity-30"><ChevronFirst size={14}/></button>
            <button onClick={()=>goPage(page-1)} disabled={page===1} className="p-1 text-gray-500 disabled:opacity-30"><ChevronLeft size={14}/></button>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=>(
              <button key={p} onClick={()=>goPage(p)} className={`w-7 h-7 rounded text-xs font-semibold ${page===p?'text-white':'text-gray-600 hover:bg-gray-100'}`} style={page===p?{backgroundColor:'#1a7a96'}:{}}>{p}</button>
            ))}
            <button onClick={()=>goPage(page+1)} disabled={page===totalPages} className="p-1 text-gray-500 disabled:opacity-30"><ChevronRight size={14}/></button>
            <button onClick={()=>goPage(totalPages)} disabled={page===totalPages} className="p-1 text-gray-500 disabled:opacity-30"><ChevronLast size={14}/></button>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-200">
                <th className="px-3 py-2.5 w-8"><input type="checkbox"/></th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">N°<br/>Client</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Nom & Prénoms</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Téléphone</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Email</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Adresse</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Profession</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Jour de<br/>Naissance</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-700">Solde</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Magasin</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Créé par</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Modifié par</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Édition</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length===0?(
                <tr><td colSpan={13} className="text-center py-12 text-gray-400">Aucun client enregistré</td></tr>
              ):pageData.map((c,i)=>(
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-center text-gray-500 text-xs">{(page-1)*PAGE_SIZE+i+1}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-gray-700">{c.numeroClient}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">N°({c.numeroClient}) {c.nom}</td>
                  <td className="px-3 py-2 text-gray-600">{c.telephone||'—'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{c.email||'—'}</td>
                  <td className="px-3 py-2 text-gray-600">{c.adresse||'—'}</td>
                  <td className="px-3 py-2 text-gray-600 uppercase text-xs">{c.profession||'—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtN(c)}</td>
                  <td className="px-3 py-2 text-center"><span className="inline-block px-2 py-0.5 rounded text-sm font-bold" style={{backgroundColor:'#c8f0c8',color:'#166534',minWidth:48}}>{Number(c.solde).toFixed(2)}</span></td>
                  <td className="px-3 py-2">
                    {c.magasinId && c.magasinId !== 'global' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold text-white" style={{backgroundColor:magasinColor(c.magasinId)}}>{c.magasinLabel??c.magasinId}</span>
                    ) : <span className="text-xs text-gray-400">{c.magasinLabel??'—'}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {c.createdBy ? (
                      <div>
                        <div className="font-medium">{c.createdBy}</div>
                        <div className="text-gray-400">{formatDate(c.createdAt)}</div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {c.updatedBy ? (
                      <div>
                        <div className="font-medium">{c.updatedBy}</div>
                        <div className="text-gray-400">{formatDate(c.updatedAt)}</div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs text-gray-500 whitespace-nowrap">{fmtDate(c.dateEdition)}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <button className="p-1 rounded border border-gray-300 text-gray-500"><MessageSquare size={11}/></button>
                      <button onClick={()=>setModal({item:c})} className="p-1 rounded border border-gray-300 text-amber-500"><Edit size={11}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {pageData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>Aucun client enregistré</div>
          ) : pageData.map((c, i) => (
            <div key={c.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {/* Top: name + magasin badge */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e3a5f' }}>{c.nom || '—'}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>N° {c.numeroClient}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                  {c.magasinId && c.magasinId !== 'global' ? (
                    <span style={{ background: magasinColor(c.magasinId), color: '#fff', borderRadius: 9999, padding: '0.15rem 0.55rem', fontSize: '0.7rem', fontWeight: 700 }}>
                      {c.magasinLabel ?? c.magasinId}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{c.magasinLabel ?? '—'}</span>
                  )}
                  <span style={{ background: '#c8f0c8', color: '#166534', borderRadius: 9999, padding: '0.1rem 0.55rem', fontSize: '0.75rem', fontWeight: 700 }}>
                    {Number(c.solde).toFixed(2)}
                  </span>
                </div>
              </div>
              {/* Contact info tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.3rem', marginBottom: '0.4rem' }}>
                {c.telephone && (
                  <div style={{ fontSize: '0.8125rem', color: '#374151' }}>
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', display: 'block' }}>Téléphone</span>
                    {c.telephone}
                  </div>
                )}
                {c.email && (
                  <div style={{ fontSize: '0.8125rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', display: 'block' }}>Email</span>
                    {c.email}
                  </div>
                )}
                {c.adresse && (
                  <div style={{ fontSize: '0.8125rem', color: '#374151' }}>
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', display: 'block' }}>Adresse</span>
                    {c.adresse}
                  </div>
                )}
              </div>
              {/* Ventes count placeholder + actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', paddingTop: '0.5rem', marginTop: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fmtDate(c.dateEdition)}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="p-1 rounded border border-gray-300 text-gray-500"><MessageSquare size={13}/></button>
                  <button onClick={()=>setModal({item:c})} className="p-1 rounded border border-gray-300 text-amber-500"><Edit size={13}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-500">{filtered.length} client(s) — page {page} / {totalPages}</div>
      </div>

      {modal&&<ModalClient initial={modal.item} onSave={handleSave} onClose={()=>setModal(null)}/>}
    </div>
  );
}
