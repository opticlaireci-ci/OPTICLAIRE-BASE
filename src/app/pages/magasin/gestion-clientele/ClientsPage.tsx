import { logger } from '../../../utils/logger';
import { AddButton } from '../../../components/AddButton';
import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router';
import { Search, X, Edit, MessageSquare, Plus, FileUp, FileDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { envoyerSmsBienvenue } from '../../../services/smsService';
import { upsertClient, chargerClients, readClientsCache, type ClientRow } from '../../../services/clientsService';
import { ImportCatalogueCsvDialog } from '../../../components/ImportCatalogueCsvDialog';
import { MODELE_CLIENTS, genererCatalogueCsv, telechargerCsv } from '../../../utils/catalogueCsv';

interface Client extends AuditInfo {
  id: string; numeroClient: string; nom: string; telephone: string; telephone2?: string;
  email?: string; adresse?: string; profession?: string; jourNaissance?: string;
  moisNaissance?: string; anneeNaissance?: string; matriculeAssurance?: string;
  entreprise?: string; notes?: string; solde: number; dateEdition: string; source?: string;
}

/** Convertit une ligne Firestore (snake_case) en Client (camelCase). */
function rowToClient(r: ClientRow): Client {
  return {
    id: r.id, numeroClient: r.numero_client, nom: r.nom, telephone: r.telephone,
    telephone2: r.telephone2 || '', email: r.email || '', adresse: r.adresse || '',
    profession: r.profession || '', jourNaissance: r.jour_naissance || '',
    moisNaissance: r.mois_naissance || '', anneeNaissance: r.annee_naissance || '',
    matriculeAssurance: r.matricule_assurance || '', entreprise: r.entreprise || '',
    notes: r.notes || '', solde: r.solde, dateEdition: r.date_edition, source: r.source,
  };
}

/** Conversion inverse : Client (camelCase) → ligne Firestore (snake_case). */
function clientToRow(c: Client, magasinId: string): Partial<ClientRow> {
  return {
    id: c.id,
    magasin_id: magasinId,
    numero_client: c.numeroClient,
    nom: c.nom,
    telephone: c.telephone,
    telephone2: c.telephone2,
    email: c.email,
    adresse: c.adresse,
    profession: c.profession,
    jour_naissance: c.jourNaissance,
    mois_naissance: c.moisNaissance,
    annee_naissance: c.anneeNaissance,
    matricule_assurance: c.matriculeAssurance,
    entreprise: c.entreprise,
    notes: c.notes,
    solde: c.solde,
    date_edition: c.dateEdition,
    source: c.source,
  };
}

const genNum = () => String(Math.floor(10000 + Math.random() * 90000));

const iCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
const roCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-500';
const selCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none bg-white';
const Lbl = ({req,children}:{req?:boolean;children:React.ReactNode}) => <div className="text-xs text-gray-600 mb-1">{children}{req&&<span className="text-red-500 ml-0.5">*</span>}</div>;
const fmtDate = (iso: string) => { try { const d=new Date(iso); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; } catch { return iso; } };
const fmtN = (c: Client) => c.jourNaissance&&c.moisNaissance&&c.anneeNaissance ? `${c.jourNaissance} - ${c.moisNaissance} - ${c.anneeNaissance}` : '—';
const PAGE_SIZE = 20;

function ModalClient({initial,onSave,onClose}:{initial?:Client;onSave:(c:Client)=>void;onClose:()=>void}) {
  const [form,setForm] = useState<Client>(initial??{id:Date.now().toString(),numeroClient:genNum(),nom:'',telephone:'',telephone2:'',email:'',adresse:'',profession:'',jourNaissance:'',moisNaissance:'',anneeNaissance:'',matriculeAssurance:'',entreprise:'',notes:'',solde:0,dateEdition:new Date().toISOString()});
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
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-700">Fermer</button>
          <button onClick={handleSave} className="px-5 py-2 rounded text-sm text-white font-semibold" style={{backgroundColor:'#1a7a96'}}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

export function ClientsPage() {
  const { magasinId } = useParams();
  const mid = magasinId??'';
  // Affichage INSTANTANÉ depuis le cache, puis rafraîchissement réseau.
  const [clients, setClients] = useState<Client[]>(() => readClientsCache(mid).map(rowToClient));
  // loading = false dès qu'un cache local existe (affichage immédiat).
  const [loading, setLoading] = useState<boolean>(() => readClientsCache(mid).length === 0);
  const [modal,setModal] = useState<{item?:Client}|null>(null);
  const [search,setSearch] = useState('');
  const [filterJour,setFilterJour] = useState('');
  const [filterDate,setFilterDate] = useState('');
  const [page,setPage] = useState(1);
  const [openImport,setOpenImport] = useState(false);

  const loadClients = async () => {
    if (!mid) return;
    try {
      const rows = await chargerClients(mid);
      setClients(rows.map(rowToClient));
    } catch (e) {
      logger.error('Erreur chargement clients:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Re-seed cache immédiat au changement de magasin.
    setClients(readClientsCache(mid).map(rowToClient));
    loadClients();
    const refresh = (e?: Event) => {
      const detail = (e as CustomEvent | undefined)?.detail;
      if (!detail?.magasinId || detail.magasinId?.toUpperCase() === mid.toUpperCase()) {
        loadClients();
      }
    };
    // Rafraîchissement AUTOMATIQUE : périodique + événements de mise à jour.
    const interval = setInterval(loadClients, 10000);
    const onCache = () => setClients(readClientsCache(mid).map(rowToClient));
    window.addEventListener('leclaire-clients-update', refresh);
    window.addEventListener('clients-updated', onCache);
    window.addEventListener('storage', onCache);
    return () => {
      clearInterval(interval);
      window.removeEventListener('leclaire-clients-update', refresh);
      window.removeEventListener('clients-updated', onCache);
      window.removeEventListener('storage', onCache);
    };
  }, [mid]);

  const filtered = useMemo(()=>clients.filter(c=>{ const mt=!search||[c.nom,c.numeroClient,c.telephone,c.email??'',c.adresse??'',c.profession??''].some(v=>v.toLowerCase().includes(search.toLowerCase())); const mj=!filterJour||fmtN(c).includes(filterJour); const md=!filterDate||(c.dateEdition??'').slice(0,10)===filterDate; return mt&&mj&&md; }),[clients,search,filterJour,filterDate]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const pageData=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const goPage=(p:number)=>setPage(Math.max(1,Math.min(p,totalPages)));
  const handleSave = async (c:Client)=>{
    const isUpdate = clients.find(m=>m.id===c.id);
    const clientWithAudit = isUpdate ? addUpdateAudit(c) : addCreateAudit(c);
    const ok = await upsertClient(clientToRow(c, mid));
    if (!ok) return;
    const next = isUpdate ? clients.map(m=>m.id===c.id?clientWithAudit:m) : [clientWithAudit,...clients];
    setClients(next);

    if (!isUpdate) {
      const smsEnvoye = envoyerSmsBienvenue({ nom: c.nom, telephone: c.telephone });
      if (smsEnvoye) logger.log(`✅ SMS de bienvenue envoyé à ${c.nom}`);
    }
  };

  /** Exporte les clients du magasin : sert aussi de gabarit vide pour l'import. */
  const handleExport = () => {
    telechargerCsv(genererCatalogueCsv(clients, MODELE_CLIENTS.colonnes), MODELE_CLIENTS.nom);
  };

  /**
   * Import ICC.csv : les doublons ont déjà été écartés par le dialogue. Le numéro
   * de client est attribué ici (il n'est pas dans le fichier), et l'import passe
   * par `upsertClient` — même chemin que la saisie manuelle.
   *
   * Aucun SMS de bienvenue n'est envoyé : un import de 500 lignes déclencherait
   * 500 SMS. Ce choix est volontaire.
   */
  const handleImport = async (nouvelles: Record<string, any>[]) => {
    const importes: Client[] = [];
    const echecs: string[] = [];
    for (let i = 0; i < nouvelles.length; i++) {
      const c = addCreateAudit({
        // Date.now() serait identique pour toutes les lignes d'un même import :
        // l'index garantit des identifiants uniques.
        id: `${Date.now()}-${i}`,
        numeroClient: genNum(),
        solde: 0,
        dateEdition: new Date().toISOString(),
        source: 'import-csv',
        ...nouvelles[i],
      }) as Client;
      const ok = await upsertClient(clientToRow(c, mid));
      if (ok) importes.push(c);
      else echecs.push(c.nom || '?');
    }
    if (importes.length) setClients([...importes, ...clients]);
    alert(
      `${importes.length} client(s) importé(s).` +
      (echecs.length ? `\n${echecs.length} non enregistré(s) : ${echecs.slice(0, 5).join(', ')}${echecs.length > 5 ? '…' : ''}` : '')
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 border-b border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-600">Gestion Clientèle</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
            <FileDown size={14}/> Exporter ICC.csv
          </button>
          <button onClick={()=>setOpenImport(true)} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
            <FileUp size={14}/> Importer Fichier
          </button>
          <AddButton onClick={()=>setModal({})} className="flex items-center gap-1.5 px-4 py-1.5 rounded text-white text-sm font-semibold" style={{backgroundColor:'#1a7a96'}}>
            <Plus size={14}/> Ajouter Client
          </AddButton>
        </div>
      </div>

      {openImport && (
        <ImportCatalogueCsvDialog
          titre="Clients"
          modele={MODELE_CLIENTS}
          existants={clients}
          onImporter={handleImport}
          onClose={()=>setOpenImport(false)}
        />
      )}
      <div className="flex flex-col gap-4 p-5">
        <h1 className="text-xl font-bold text-gray-800">Clients ({clients.length})</h1>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex flex-col gap-1" style={{width:280}}>
            <label className="text-xs text-gray-600">Infos Client...</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input className="px-2 py-1.5 text-sm outline-none flex-1 bg-transparent" placeholder="Infos Client..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
              {search&&<button onClick={()=>setSearch('')} className="px-2 text-gray-400"><X size={13}/></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1" style={{width:200}}>
            <label className="text-xs text-gray-600">Jour de Naissance...</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input className="px-2 py-1.5 text-sm outline-none flex-1 bg-transparent" placeholder="20-01 (Jour-Mois)" value={filterJour} onChange={e=>{setFilterJour(e.target.value);setPage(1);}}/>
              {filterJour&&<button onClick={()=>setFilterJour('')} className="px-2 text-gray-400"><X size={13}/></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1" style={{width:180}}>
            <label className="text-xs text-gray-600">Date Édition</label>
            <div className="flex items-center border border-gray-300 rounded bg-white overflow-hidden">
              <input type="date" className="px-2 py-1.5 text-sm outline-none flex-1 bg-transparent" value={filterDate} onChange={e=>{setFilterDate(e.target.value);setPage(1);}}/>
              {filterDate&&<button onClick={()=>setFilterDate('')} className="px-1 text-gray-400"><X size={13}/></button>}
            </div>
          </div>
          <div className="flex flex-col gap-1"><label className="text-xs text-gray-600">...</label><button className="flex items-center justify-center rounded text-white" style={{backgroundColor:'#1a7a96',width:38,height:34}}><Search size={15}/></button></div>
          <div className="flex-1"/>
          <div className="flex items-center gap-1 self-end">
            <button onClick={()=>goPage(1)} disabled={page===1} className="p-1 text-gray-500 disabled:opacity-30"><ChevronFirst size={14}/></button>
            <button onClick={()=>goPage(page-1)} disabled={page===1} className="p-1 text-gray-500 disabled:opacity-30"><ChevronLeft size={14}/></button>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=>(
              <button key={p} onClick={()=>goPage(p)} className={`w-7 h-7 rounded text-xs font-semibold ${page===p?'text-white':'text-gray-600 hover:bg-gray-100'}`} style={page===p?{backgroundColor:'#1a7a96'}:{}}>{p}</button>
            ))}
            <button onClick={()=>goPage(page+1)} disabled={page===totalPages} className="p-1 text-gray-500 disabled:opacity-30"><ChevronRight size={14}/></button>
            <button onClick={()=>goPage(totalPages)} disabled={page===totalPages} className="p-1 text-gray-500 disabled:opacity-30"><ChevronLast size={14}/></button>
          </div>
        </div>
        {/* Table — desktop */}
        <div className="hidden md:block border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{minWidth: '800px'}}>
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
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Créé par</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Modifié par</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Édition</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length===0?(
                <tr><td colSpan={12} className="text-center py-12 text-gray-400">Aucun client enregistré</td></tr>
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
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {c.createdBy ? (
                      <div>
                        <div className="font-medium">{c.createdBy}</div>
                        <div className="text-gray-400">{formatDate(c.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {c.updatedBy ? (
                      <div>
                        <div className="font-medium">{c.updatedBy}</div>
                        <div className="text-gray-400">{formatDate(c.updatedAt)}</div>
                      </div>
                    ) : '-'}
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

        {/* Cartes — mobile */}
        <div className="md:hidden flex flex-col gap-3">
          {pageData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: '#9ca3af', fontSize: 14 }}>Aucun client enregistré</div>
          ) : pageData.map((c) => (
            <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }}>
              {/* Card header: name + phone */}
              <div style={{ padding: '10px 14px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>N°({c.numeroClient}) {c.nom}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a7a96', marginTop: 2 }}>{c.telephone || '—'}</div>
                  {c.telephone2 && <div style={{ fontSize: 12, color: '#6b7280' }}>{c.telephone2}</div>}
                </div>
                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: '#c8f0c8', color: '#166534' }}>
                  Solde : {Number(c.solde).toFixed(2)}
                </span>
              </div>
              {/* Card body */}
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.adresse && <div style={{ fontSize: 12, color: '#374151' }}>Adresse : {c.adresse}</div>}
                {c.profession && <div style={{ fontSize: 12, color: '#374151' }}>Profession : {c.profession}</div>}
                {c.matriculeAssurance && <div style={{ fontSize: 12, color: '#374151' }}>NIF / Assurance : {c.matriculeAssurance}</div>}
                {c.email && <div style={{ fontSize: 12, color: '#6b7280' }}>{c.email}</div>}
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Naissance : {fmtN(c)}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Édition : {fmtDate(c.dateEdition)}</div>
              </div>
              {/* Card actions */}
              <div style={{ padding: '8px 14px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
                <button className="p-1.5 rounded border border-gray-300 text-gray-500 flex items-center gap-1" style={{ fontSize: 12 }}>
                  <MessageSquare size={12}/> SMS
                </button>
                <button onClick={() => setModal({ item: c })} className="p-1.5 rounded border border-amber-300 text-amber-600 flex items-center gap-1" style={{ fontSize: 12 }}>
                  <Edit size={12}/> Modifier
                </button>
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
