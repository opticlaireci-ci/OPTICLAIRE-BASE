import { logger } from '../../../utils/logger';
import { AddButton } from '../../../components/AddButton';
import { useState , useEffect, useMemo, useRef} from 'react';
import { useLocation } from 'react-router';
import { useParams } from 'react-router';
import { Plus, Eye, X, FileText, Calendar, Printer, ArrowRightLeft, MoreHorizontal } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { autoSaveOphtalmologue, autoSaveCabinet } from '../../../utils/autoActeur';
import { autoSaveClient } from '../../../utils/autoClient';
import { useTypesVerre, useVerresList, findVerreByName, VerreRecord, useOphtalmologues, useCabinets, useProfessions, useClientRecordsMagasin, ClientRecord, useVenteProducts, findVenteProduct, VenteProduct } from '../../../utils/venteLookups';
import { genCodeBarre, genNumFacture } from '../../../utils/autoNumbers';
import { printHeaderHTML } from '../../../utils/documentHeader';
import { useSupabaseSync } from '../../../hooks/useSupabaseSync';
import { ajouterVente, chargerVentes, readVentesCache, supprimerVente, VenteSupabase } from '../../../services/ventesService';
import { loadFromSupabase, saveToSupabase } from '../../../services/supabaseRealtime';
import { useAuth } from '../../../contexts/AuthContext';
import { canEdit, canDelete } from '../../../utils/actionRights';
import { Pencil, Trash2 } from 'lucide-react';
import { TENANT } from '../../../config/tenant';

// ── helpers ───────────────────────────────────────────────────────────────────
const genNumClient = () => String(Math.floor(10000 + Math.random() * 90000));
const fmtN = (n: number) => n.toLocaleString('fr-FR');

// Convertit un devis Firestore (snake_case) vers le type DevisRecord attendu par l'UI.
const supabaseToDevis = (v: VenteSupabase): DevisRecord => {
  const recap: any = v.recap || {};
  return {
    id: v.id,
    date: v.date,
    numeroClient: v.numero_client || '',
    client: v.client,
    telephone: v.telephone || '',
    propositions: (v.verres || []) as any,
    numDevis: recap.numDevis || v.id,
    createdBy: v.edite_par || '',
    createdAt: v.created_at || v.date,
    _raw: v,
  } as DevisRecord;
};

// Reconstruit le ClientInfo complet du formulaire à partir d'un devis Firestore
// (mode édition : préremplissage de l'Étape I).
const venteToClientInfo = (v: VenteSupabase): ClientInfo => {
  const [an = '', mo = '', jo = ''] = (v.date_naissance || '').split('-');
  return {
    numeroClient: v.numero_client || genNumClient(),
    civilite: v.civilite || '',
    nom: (v.client || '').replace(/^(M\.|Mme|Mlle|Dr)\s+/, '').trim(),
    telephone1: v.telephone || '',
    telephone2: v.telephone2 || '',
    email: v.email || '',
    adresse: v.adresse || '',
    profession: v.profession || '',
    jourNaissance: jo, moisNaissance: mo, anneeNaissance: an,
    soldeClient: v.solde_client || '',
    matriculeAssurance: v.matricule_assurance || '',
    entreprise: v.entreprise || '',
    ophtalmologue: v.ophtalmologue || '',
    telOphtalmologue: v.tel_ophtalmologue || '',
    cabinetOphtalmologue: v.cabinet_ophtalmologue || '',
    telCabinet: v.tel_cabinet || '',
  };
};
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const money = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const toRoman = (n: number) => ROMAN[n] || String(n);

// ── types ──────────────────────────────────────────────────────────────────────
interface OeilData { sphere: string; cylindre: string; axe: string; dec: string; addition: string; hauteur: string; evLoin: string; evPres: string; quantite: string; prix: string; remise: string; }
interface VerreInfo { typeVerre: string; verre: string; traitement: string; matiere: string; diametre: string; oeilDroit: OeilData; oeilGauche: OeilData; ecartPupillaire: string; total: string; }
interface ArticleLigne { id: string; produitId?: string; codeBarre?: string; designation: string; type?: 'monture' | 'accessoire' | 'traitement' | 'service' | 'autre'; stock?: string; remise?: string; prix: string; quantite: string; total: string; }
interface PropositionData { verres: VerreInfo[]; articles: ArticleLigne[]; totalVerres: number; totalArticles: number; remisePct: string; valeurRemise: number; totalNet: number; }
interface ClientInfo { numeroClient: string; civilite: string; nom: string; telephone1: string; telephone2: string; email: string; adresse: string; profession: string; jourNaissance: string; moisNaissance: string; anneeNaissance: string; soldeClient: string; matriculeAssurance: string; entreprise: string; ophtalmologue: string; telOphtalmologue: string; cabinetOphtalmologue: string; telCabinet: string; }
interface DevisRecord extends AuditInfo { id: string; date: string; numeroClient: string; client: string; telephone: string; propositions: PropositionData[]; numDevis: string; _raw?: VenteSupabase; }

// ── styles ───────────────────────────────────────────────────────────────────
const iCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
const roCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-600';
const selCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
const Lbl = ({ children }: { children: React.ReactNode }) => <div className="text-xs text-gray-600 mb-1">{children}</div>;
const ReqLbl = ({ children }: { children: React.ReactNode }) => <div className="text-xs text-gray-600 mb-1">{children} <span className="text-red-500">*</span></div>;

const emptyOeil = (): OeilData => ({ sphere: '', cylindre: '', axe: '', dec: '', addition: '', hauteur: '', evLoin: '', evPres: '', quantite: '1', prix: '', remise: '' });
const emptyVerre = (): VerreInfo => ({ typeVerre: '', verre: '', traitement: '', matiere: '', diametre: '', oeilDroit: emptyOeil(), oeilGauche: emptyOeil(), ecartPupillaire: 'loin', total: '' });
const emptyProp = (): PropositionData => ({ verres: [], articles: [], totalVerres: 0, totalArticles: 0, remisePct: '0', valeurRemise: 0, totalNet: 0 });
const emptyClient = (): ClientInfo => ({ numeroClient: genNumClient(), civilite: '', nom: '', telephone1: '', telephone2: '', email: '', adresse: '', profession: '', jourNaissance: '', moisNaissance: '', anneeNaissance: '', soldeClient: '', matriculeAssurance: '', entreprise: '', ophtalmologue: '', telOphtalmologue: '', cabinetOphtalmologue: '', telCabinet: '' });

const VERRE_COLS: { key: keyof OeilData; label: string }[] = [
  { key: 'sphere', label: 'Sphère' }, { key: 'cylindre', label: 'Cylindre' }, { key: 'axe', label: 'Axe' },
  { key: 'dec', label: 'Dec' }, { key: 'addition', label: 'Addition' }, { key: 'hauteur', label: 'Hauteur' },
  { key: 'evLoin', label: 'E V Loin' }, { key: 'evPres', label: 'E V Près' }, { key: 'quantite', label: 'Quantité' },
  { key: 'prix', label: 'Prix' }, { key: 'remise', label: 'Remise' },
];
const purpleHdr = 'text-xs font-semibold text-white text-center px-1 py-1 whitespace-nowrap';
const purpleCell = 'border border-purple-400 bg-white px-0.5 py-0.5';
const vInput = 'w-full text-xs text-center border-none outline-none bg-transparent py-1';

// ── Impression du devis ─────────────────────────────────────────────────────
function imprimerDevis(d: DevisRecord, magasinId: string) {
  const fmtD = (s: string) => s ? new Date(s).toLocaleDateString('fr-FR') : '—';
  const money = (n: number) => (n || 0).toLocaleString('fr-FR');

  const propositionsHTML = (d.propositions || []).map((p, i) => {
    if ((!p.verres || p.verres.length === 0) && (!p.articles || p.articles.length === 0)) return '';
    const verresRows = (p.verres || []).map(v => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #ddd;">${v.verre || v.typeVerre || '—'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:center;">${v.oeilDroit?.sphere || '—'} / ${v.oeilDroit?.cylindre || '—'} × ${v.oeilDroit?.axe || '—'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:center;">${v.oeilGauche?.sphere || '—'} / ${v.oeilGauche?.cylindre || '—'} × ${v.oeilGauche?.axe || '—'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;">${v.traitement || '—'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-weight:600;">${money(parseFloat(v.total || '0'))}</td>
      </tr>`).join('');
    const articlesRows = (p.articles || []).map(a => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #ddd;" colspan="3">${a.designation || '—'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:center;">Qté ${a.quantite || '1'}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-weight:600;">${money(parseFloat(a.total || '0'))}</td>
      </tr>`).join('');
    const total = (p.totalVerres || 0) + (p.totalArticles || 0);
    const totalNet = i === 0 ? (p.totalNet || total) : total;
    return `
      <div class="section">
        <div class="section-title">Proposition ${['I','II','III'][i] || i + 1}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#7b3fa0;color:#fff;">
            <th style="padding:6px 8px;text-align:left;">Verre / Article</th>
            <th style="padding:6px 8px;">Œil Droit (Sph/Cyl/Axe)</th>
            <th style="padding:6px 8px;">Œil Gauche (Sph/Cyl/Axe)</th>
            <th style="padding:6px 8px;">Traitement / Détail</th>
            <th style="padding:6px 8px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>
            ${verresRows || ''}
            ${articlesRows || ''}
            ${(!verresRows && !articlesRows) ? '<tr><td colspan="5" style="padding:10px;text-align:center;color:#999;">Aucun élément</td></tr>' : ''}
          </tbody>
        </table>
        <div style="text-align:right;margin-top:6px;font-size:13px;">
          ${i === 0 && p.valeurRemise ? `<div>Remise (${p.remisePct || '0'}%) : <strong>-${money(p.valeurRemise)}</strong></div>` : ''}
          <div style="font-weight:700;color:#7b3fa0;">Total Net : ${money(totalNet)} FCFA</div>
        </div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/>
<title>Devis ${d.numDevis} — ${TENANT.nomComplet}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 30px; }
  @media print { body { padding: 15px; } .no-print { display: none; } }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 11px; font-weight: 700; color: #7b3fa0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; border-left: 3px solid #7b3fa0; padding-left: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 12px; }
  .info-row { display: flex; gap: 6px; }
  .info-label { color: #777; min-width: 110px; }
  .info-val { font-weight: 600; }
  .badge { display: inline-block; background: #f3e8fb; color: #7b3fa0; border-radius: 4px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
  .title { font-size: 20px; font-weight: 700; color: #7b3fa0; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #7b3fa0; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
  .footer { margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 16px; font-size: 11px; color: #888; }
</style></head>
<body>
  <button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer</button>
  ${printHeaderHTML(magasinId || '', { date: d.date })}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
    <div class="title">DEVIS | PROFORMA</div>
    <div style="text-align:right;font-size:11px;color:#555;line-height:1.7;">
      <div class="badge">N° ${d.numDevis}</div>
      <div style="margin-top:8px;">Date : <strong>${fmtD(d.date)}</strong></div>
      <div>N° Client : <strong>${d.numeroClient}</strong></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Informations Client</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">Nom :</span><span class="info-val">${d.client || '—'}</span></div>
      <div class="info-row"><span class="info-label">Téléphone :</span><span class="info-val">${d.telephone || '—'}</span></div>
    </div>
  </div>
  ${propositionsHTML || '<p style="color:#999;">Aucune proposition renseignée.</p>'}
  <div class="footer">
    <div>Devis valable 30 jours. Ce document ne constitue pas une facture.</div>
    <div>Édité par : <strong>${d.createdBy || '—'}</strong></div>
  </div>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer le devis.'); return; }
  w.document.write(html);
  w.document.close();
}

// ── Étape I ───────────────────────────────────────────────────────────────────
function EtapeI({ data, onChange, magasinId }: { data: ClientInfo; onChange: (d: ClientInfo) => void; magasinId: string }) {
  const set = (k: keyof ClientInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...data, [k]: e.target.value });
  const ophtalmologues = useOphtalmologues();
  const cabinets = useCabinets();
  const professions = useProfessions();
  const clientsRecords = useClientRecordsMagasin(magasinId);
  const [showClientSug, setShowClientSug] = useState(false);
  const clientBoxRef = useRef<HTMLDivElement>(null);

  const CIVILITES = ['M.', 'Mme', 'Mlle', 'Dr'];

  const clientSuggestions = useMemo(() => {
    const q = (data.nom || '').trim().toLowerCase();
    if (!q) return [];
    return clientsRecords
      .filter(c =>
        (c.nom || '').toLowerCase().includes(q) ||
        (c.telephone || '').toLowerCase().includes(q) ||
        (c.numeroClient || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clientsRecords, data.nom]);

  const adressesConnues = useMemo(() => {
    const quartiers = ['Abobo', 'Adjamé', 'Cocody', 'Koumassi', 'Marcory', 'Plateau', 'Treichville', 'Yopougon', 'Bingerville', 'Port-Bouët', 'Riviera', 'Angré'];
    const fromClients = clientsRecords.map(c => (c.adresse || '').trim()).filter(Boolean);
    return [...new Set([...fromClients, ...quartiers])].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [clientsRecords]);

  const splitCivilite = (nomComplet: string): { civilite: string; nom: string } => {
    const parts = (nomComplet || '').trim().split(' ');
    if (parts.length > 1 && CIVILITES.includes(parts[0])) {
      return { civilite: parts[0], nom: parts.slice(1).join(' ') };
    }
    return { civilite: '', nom: nomComplet || '' };
  };

  const selectClient = (c: ClientRecord) => {
    const { civilite, nom } = splitCivilite(c.nom || '');
    onChange({
      ...data,
      numeroClient: c.numeroClient || data.numeroClient,
      civilite: c.civilite || civilite || data.civilite,
      nom,
      telephone1: c.telephone || '',
      telephone2: c.telephone2 || '',
      email: c.email || '',
      adresse: c.adresse || '',
      profession: c.profession || '',
      jourNaissance: c.jourNaissance || '',
      moisNaissance: c.moisNaissance || '',
      anneeNaissance: c.anneeNaissance || '',
      soldeClient: c.solde != null ? String(c.solde) : data.soldeClient,
      matriculeAssurance: c.matriculeAssurance || '',
      entreprise: c.entreprise || '',
    });
    setShowClientSug(false);
  };

  const handleNomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...data, nom: e.target.value });
    setShowClientSug(e.target.value.trim().length > 0);
  };

  useEffect(() => {
    if (!showClientSug) return;
    const onDocClick = (ev: MouseEvent) => {
      if (clientBoxRef.current && !clientBoxRef.current.contains(ev.target as Node)) {
        setShowClientSug(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showClientSug]);

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="grid grid-cols-6 gap-3">
        <div><ReqLbl>N° Client</ReqLbl><input className={roCls + ' font-mono font-bold text-blue-700'} readOnly value={data.numeroClient} /></div>
        <div><Lbl>Civilité</Lbl>
          <select className={selCls} value={data.civilite} onChange={set('civilite')}>
            <option value="">Civilité...</option>
            <option>M.</option><option>Mme</option><option>Mlle</option><option>Dr</option>
          </select>
        </div>
        <div className="col-span-2 relative" ref={clientBoxRef}><ReqLbl>Nom & Prénoms Client</ReqLbl>
          <input
            className={iCls}
            placeholder="Nom & Prénoms..."
            value={data.nom}
            onChange={handleNomChange}
            onFocus={() => { if ((data.nom || '').trim()) setShowClientSug(true); }}
            autoComplete="off"
          />
          {showClientSug && clientSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-xl max-h-72 overflow-y-auto">
              {clientSuggestions.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectClient(c)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
                >
                  <div className="text-xs font-semibold text-gray-800">{c.nom}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-gray-500">
                    {c.numeroClient && <span>N°&nbsp;: {c.numeroClient}</span>}
                    {c.telephone && <span>Tél.&nbsp;: {c.telephone}</span>}
                    {c.profession && <span>{c.profession}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div><ReqLbl>N° Téléphone I</ReqLbl><input className={iCls} value={data.telephone1} onChange={set('telephone1')} /></div>
        <div><Lbl>N° Téléphone II</Lbl><input className={iCls} value={data.telephone2} onChange={set('telephone2')} /></div>
      </div>
      <div className="grid grid-cols-6 gap-3">
        <div className="col-span-2"><Lbl>Email</Lbl><input type="email" className={iCls} value={data.email} onChange={set('email')} /></div>
        <div className="col-span-2"><Lbl>Adresse</Lbl>
          <input className={iCls} placeholder="Adresse..." list="devis-adresses-list" value={data.adresse} onChange={set('adresse')} />
          <datalist id="devis-adresses-list">
            {adressesConnues.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
        <div className="col-span-2"><Lbl>Profession</Lbl>
          <input className={iCls} placeholder="Profession..." list="devis-professions-list" value={data.profession} onChange={set('profession')} />
          <datalist id="devis-professions-list">
            {professions.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-3">
        <div className="col-span-3 flex gap-2">
          <div className="flex-1"><Lbl>Jour de Naissance</Lbl><input className={iCls} placeholder="Jour" value={data.jourNaissance} onChange={set('jourNaissance')} /></div>
          <div className="flex-1"><Lbl>&nbsp;</Lbl><input className={iCls} placeholder="Mois" value={data.moisNaissance} onChange={set('moisNaissance')} /></div>
          <div className="flex-1"><Lbl>&nbsp;</Lbl><input className={iCls} placeholder="Année" value={data.anneeNaissance} onChange={set('anneeNaissance')} /></div>
        </div>
        <div><Lbl>Solde Client</Lbl><input className={iCls} value={data.soldeClient} onChange={set('soldeClient')} /></div>
      </div>
      <div className="grid grid-cols-6 gap-3 items-end">
        <div className="col-span-3"><Lbl>Matricule Assurance</Lbl><input className={iCls} style={{ backgroundColor: '#fff8f0' }} value={data.matriculeAssurance} onChange={set('matriculeAssurance')} /></div>
        <div className="col-span-2">
          <Lbl>Carte Assuré(e)</Lbl>
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <span className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 flex-1">Aucun Fichier</span>
            <label className="px-3 py-1.5 text-xs font-semibold cursor-pointer text-white" style={{ backgroundColor: '#e09a2b' }}>
              Charger <input type="file" className="hidden" />
            </label>
          </div>
        </div>
        <div><Lbl>Entreprise</Lbl>
          <input className={iCls} placeholder="Entreprise..." value={data.entreprise} onChange={set('entreprise')} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div><Lbl>Ophtalmologue</Lbl>
          <input className={iCls} placeholder="Ophtalmologue..." list="devis-ophtalmo-list" value={data.ophtalmologue} onChange={set('ophtalmologue')} />
          <datalist id="devis-ophtalmo-list">
            {ophtalmologues.map(o => <option key={o} value={o} />)}
          </datalist>
        </div>
        <div><Lbl>N° Téléphone Ophtalmologue</Lbl><input className={iCls} value={data.telOphtalmologue} onChange={set('telOphtalmologue')} /></div>
        <div><Lbl>Cabinet Ophtalmologue</Lbl>
          <input className={iCls} placeholder="Cabinet Ophtalmologue..." list="devis-cabinet-list" value={data.cabinetOphtalmologue} onChange={set('cabinetOphtalmologue')} />
          <datalist id="devis-cabinet-list">
            {cabinets.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div><Lbl>N° Téléphone Cabinet Ophtalmologue</Lbl><input className={iCls} value={data.telCabinet} onChange={set('telCabinet')} /></div>
      </div>
    </div>
  );
}

// ── Tableau Oeil ──────────────────────────────────────────────────────────────
function OeilRow({ label, data, onChange }: { label: string; data: OeilData; onChange: (d: OeilData) => void }) {
  const set = (k: keyof OeilData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...data, [k]: e.target.value });
  return (
    <tr>
      <td className="border border-purple-400 bg-purple-700 text-white text-xs font-semibold px-2 py-1 whitespace-nowrap">{label}</td>
      {VERRE_COLS.map(({ key }) =>
        key === 'quantite' ? (
          <td key={key} className={purpleCell}>
            <select className="w-full text-xs border-none outline-none bg-white text-center py-1" value={data[key]} onChange={set(key)}>
              {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
            </select>
          </td>
        ) : (
          <td key={key} className={purpleCell}><input className={vInput} value={data[key]} onChange={set(key)} /></td>
        )
      )}
    </tr>
  );
}

// ── Bloc Verre ────────────────────────────────────────────────────────────────
function VerreBlock({ data, index, total, onChange, onRemove }: { data: VerreInfo; index: number; total: number; onChange: (d: VerreInfo) => void; onRemove: () => void }) {
  const typesVerre = useTypesVerre();
  const verresList = useVerresList();
  const [showVerreSug, setShowVerreSug] = useState(false);
  const verreBoxRef = useRef<HTMLDivElement>(null);
  const calcTotal = (od: OeilData, og: OeilData): string => {
    const lineTotal = (o: OeilData) => {
      const p = parseFloat(o.prix) || 0;
      const q = parseFloat(o.quantite) || 1;
      const r = parseFloat(o.remise) || 0;
      return p * q * (1 - r / 100);
    };
    return String(Math.round(lineTotal(od) + lineTotal(og)));
  };

  // Suggestions filtrées à partir de ce que l'on tape, restreintes au type choisi.
  const verreSuggestions = useMemo(() => {
    const q = (data.verre || '').trim().toLowerCase();
    if (!q) return [];
    return verresList
      .filter(v => {
        if (data.typeVerre && v.typeVerre && v.typeVerre.toLowerCase() !== data.typeVerre.toLowerCase()) return false;
        return (
          v.verre?.toLowerCase().includes(q) ||
          v.traitement?.toLowerCase().includes(q) ||
          v.matiere?.toLowerCase().includes(q) ||
          v.fournisseur?.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [verresList, data.verre, data.typeVerre]);

  useEffect(() => {
    if (!showVerreSug) return;
    const onDocClick = (e: MouseEvent) => {
      if (verreBoxRef.current && !verreBoxRef.current.contains(e.target as Node)) setShowVerreSug(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showVerreSug]);

  const set = (k: keyof VerreInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...data, [k]: e.target.value });

  const selectVerre = (v: VerreRecord) => {
    // Le prix du verre se répartit à parts égales dans chaque œil (OD + OG).
    const prixUnitaire = (Number(v.prixVerre) || 0) / 2;
    const prixStr = prixUnitaire ? String(prixUnitaire) : data.oeilDroit.prix;
    const oeilDroit = { ...data.oeilDroit, prix: prixStr };
    const oeilGauche = { ...data.oeilGauche, prix: prixStr };
    onChange({
      ...data,
      verre: v.verre,
      typeVerre: v.typeVerre || data.typeVerre,
      traitement: v.traitement || data.traitement,
      matiere: v.matiere || data.matiere,
      diametre: v.diametre || data.diametre,
      oeilDroit,
      oeilGauche,
      total: calcTotal(oeilDroit, oeilGauche),
    });
    setShowVerreSug(false);
  };

  const handleVerreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const found = findVerreByName(verresList, val);
    setShowVerreSug(val.trim().length > 0);
    const prixUnitaire = found ? (Number(found.prixVerre) || 0) / 2 : 0;
    const oeilDroit = found && prixUnitaire ? { ...data.oeilDroit, prix: String(prixUnitaire) } : data.oeilDroit;
    const oeilGauche = found && prixUnitaire ? { ...data.oeilGauche, prix: String(prixUnitaire) } : data.oeilGauche;
    onChange({
      ...data,
      verre: val,
      traitement: found ? found.traitement : data.traitement,
      matiere: found ? found.matiere : data.matiere,
      diametre: found ? found.diametre : data.diametre,
      oeilDroit,
      oeilGauche,
      total: calcTotal(oeilDroit, oeilGauche),
    });
  };
  return (
    <div className="rounded-lg p-3 flex flex-col gap-3" style={{ backgroundColor: '#c96fe8' }}>
      <div className="flex items-center justify-between">
        <span className="text-white text-xs font-bold uppercase tracking-widest">Verre {index + 1}</span>
        {total > 1 && (
          <button onClick={onRemove} className="flex items-center gap-1 px-2 py-1 rounded text-white text-xs font-semibold" style={{ backgroundColor: '#e05252' }}>
            <X size={12} /> Supprimer
          </button>
        )}
      </div>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 grid grid-cols-5 gap-2 min-w-0">
          <div><div className={purpleHdr}>Type Verre</div>
            <select className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.typeVerre} onChange={set('typeVerre')}>
              <option value="">Type Verre</option>
              {typesVerre.length > 0
                ? typesVerre.map(t => <option key={t}>{t}</option>)
                : (<><option>Unifocal</option><option>Bifocal</option><option>Progressif</option></>)
              }
            </select>
          </div>
          <div className="col-span-2 relative" ref={verreBoxRef}>
            <div className={purpleHdr}>Verre</div>
            <input
              className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white"
              placeholder="Commencez à écrire le verre..."
              value={data.verre}
              onChange={handleVerreChange}
              onFocus={() => { if ((data.verre || '').trim()) setShowVerreSug(true); }}
              autoComplete="off"
            />
            {showVerreSug && verreSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-purple-300 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                {verreSuggestions.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectVerre(v)}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-purple-100 last:border-0"
                  >
                    <div className="text-xs font-semibold text-purple-900">{v.verre}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-gray-600">
                      {v.typeVerre && <span>Type&nbsp;: {v.typeVerre}</span>}
                      {v.traitement && <span>Traitement&nbsp;: {v.traitement}</span>}
                      {v.matiere && <span>Matière&nbsp;: {v.matiere}</span>}
                      {v.diametre && <span>Ø&nbsp;: {v.diametre}</span>}
                      {v.fournisseur && <span>Fourn.&nbsp;: {v.fournisseur}</span>}
                      {v.garantie && <span>Garantie&nbsp;: {v.garantie}</span>}
                      {v.prixVerre ? <span className="font-semibold text-purple-700">{Number(v.prixVerre).toLocaleString('fr-FR')} F</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div><div className={purpleHdr}>Traitement</div><input className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.traitement} onChange={set('traitement')} /></div>
          <div><div className={purpleHdr}>Matière</div><input className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.matiere} onChange={set('matiere')} /></div>
        </div>
        <div style={{ minWidth: 80 }}><div className={purpleHdr}>Diamètre</div><input className="w-full text-xs border border-purple-300 rounded px-2 py-1 bg-white" value={data.diametre} onChange={set('diametre')} /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth: 700 }}>
          <thead><tr style={{ backgroundColor: '#b050d0' }}>
            <th className="w-20 px-2 text-white text-xs py-1"></th>
            {VERRE_COLS.map(c => <th key={c.key} className={purpleHdr}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            <OeilRow label="Oeil Droit" data={data.oeilDroit} onChange={d => {
              const next = { ...data, oeilDroit: d };
              onChange({ ...next, total: calcTotal(d, next.oeilGauche) });
            }} />
            <OeilRow label="Oeil Gauche" data={data.oeilGauche} onChange={d => {
              const next = { ...data, oeilGauche: d };
              onChange({ ...next, total: calcTotal(next.oeilDroit, d) });
            }} />
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-6 px-2 flex-wrap">
        <span className="text-white text-sm tracking-widest font-medium">E c a r t &nbsp; P u p i l l a i r e</span>
        <label className="flex items-center gap-1 text-white text-sm cursor-pointer">
          <input type="radio" name={`ecart-${index}`} value="loin" checked={data.ecartPupillaire === 'loin'} onChange={set('ecartPupillaire')} /> Loin
        </label>
        <label className="flex items-center gap-1 text-white text-sm cursor-pointer">
          <input type="radio" name={`ecart-${index}`} value="pres" checked={data.ecartPupillaire === 'pres'} onChange={set('ecartPupillaire')} /> Près
        </label>
        <div className="flex-1" />
        <div className="flex flex-col items-end gap-1">
          <span className="text-white text-xs font-semibold">Total</span>
          <input className="border border-purple-200 rounded px-2 py-1 text-sm bg-purple-50 w-40 font-semibold text-purple-900 text-right" readOnly value={data.total ? Number(data.total).toLocaleString('fr-FR') : '0'} />
        </div>
      </div>
    </div>
  );
}

// ── Bloc Montures / Accessoires / Traitements / Services ────────────────────────
function ArticlesBlock({ articles, onChange, magasinId, idSuffix }: { articles: ArticleLigne[]; onChange: (a: ArticleLigne[]) => void; magasinId: string; idSuffix: string }) {
  const [search, setSearch] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchMonture, setSearchMonture] = useState('');
  const [searchService, setSearchService] = useState('');
  const products = useVenteProducts(magasinId);

  const allDl = `dev-produits-${idSuffix}`;
  const montureDl = `dev-monture-acc-${idSuffix}`;
  const traitDl = `dev-trait-service-${idSuffix}`;

  // Montures / accessoires : on ne propose QUE les articles réellement présents
  // dans CE magasin (stock reçu par bon de distribution ou de transfert > 0).
  // Un article détenu par un autre magasin, mais absent de celui-ci, ne doit
  // pas apparaître dans la liste de choix du devis (même règle que la Facture).
  const disponible = (p: VenteProduct) => p.stock == null || p.stock > 0;
  const allOptions = [...new Set(
    products.filter(disponible).flatMap(p => [p.label, p.codeBarre].filter(Boolean))
  )];
  const montureAccOptions = [...new Set(
    products.filter(p => (p.type === 'monture' || p.type === 'accessoire') && (p.stock ?? 0) > 0)
      .flatMap(p => [p.label, p.codeBarre].filter(Boolean))
  )];
  const traitServiceOptions = [...new Set(
    products.filter(p => p.type === 'verre' || p.type === 'service').map(p => p.label).filter(Boolean)
  )];

  const productToLigne = (p: VenteProduct): ArticleLigne => ({
    id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7),
    produitId: p.produitId,
    codeBarre: p.codeBarre || genCodeBarre(),
    designation: p.label,
    type: p.type === 'verre' ? 'traitement' : (p.type as ArticleLigne['type']),
    stock: p.stock === null ? '' : String(p.stock),
    prix: String(p.prix ?? ''),
    remise: '0',
    quantite: '1',
    total: String(Math.round(p.prix || 0)),
  });

  const addFromSearch = (value: string, filter: (p: VenteProduct) => boolean, clear: () => void) => {
    const found = findVenteProduct(products.filter(filter), value);
    if (found) { onChange([...articles, productToLigne(found)]); clear(); }
  };

  const addLigne = () => onChange([...articles, {
    id: Date.now().toString(), codeBarre: genCodeBarre(), designation: '', stock: '', prix: '', remise: '0', quantite: '1', total: '',
  }]);

  const updateLigne = (id: string, key: keyof ArticleLigne, val: string) => {
    onChange(articles.map(a => {
      if (a.id !== id) return a;
      let updated = { ...a, [key]: val } as ArticleLigne;
      if (key === 'designation') {
        const found = findVenteProduct(products, val);
        if (found) {
          updated = {
            ...updated,
            produitId: found.produitId,
            codeBarre: found.codeBarre || updated.codeBarre,
            type: found.type === 'verre' ? 'traitement' : (found.type as ArticleLigne['type']),
            stock: found.stock === null ? updated.stock : String(found.stock),
            prix: String(found.prix ?? ''),
          };
        }
      }
      const p = parseFloat(updated.prix) || 0;
      const q = parseFloat(updated.quantite) || 1;
      const r = parseFloat(updated.remise || '0') || 0;
      updated.total = String(Math.round(p * q * (1 - r / 100)));
      return updated;
    }));
  };

  const removeLigne = (id: string) => onChange(articles.filter(a => a.id !== id));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-white border border-gray-300">
              <th className="text-left px-3 py-2.5 font-semibold text-gray-800 border border-gray-300">Monture | Accessoire | Traitement | Service</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Code Barre</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Stock</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Prix</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Remise</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Quantité</th>
              <th className="px-3 py-2.5 font-semibold text-gray-800 border border-gray-300 text-center">Total</th>
              <th className="px-3 py-2.5 border border-gray-300 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 && (
              <tr><td colSpan={8} className="text-center text-gray-400 text-sm py-6 border border-gray-200">Aucun article — cliquez sur <strong>+ Ajouter</strong></td></tr>
            )}
            {articles.map(a => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls} placeholder="Désignation..." list={allDl} value={a.designation} onChange={e => updateLigne(a.id, 'designation', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={roCls + ' font-mono text-xs text-center'} readOnly value={a.codeBarre || ''} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls + ' text-center'} value={a.stock || ''} onChange={e => updateLigne(a.id, 'stock', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls + ' text-center'} type="number" value={a.prix} onChange={e => updateLigne(a.id, 'prix', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls + ' text-center'} type="number" min="0" max="100" value={a.remise || '0'} onChange={e => updateLigne(a.id, 'remise', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={iCls + ' text-center'} type="number" min="1" value={a.quantite} onChange={e => updateLigne(a.id, 'quantite', e.target.value)} />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <input className={roCls + ' text-center font-semibold'} readOnly value={a.total} />
                </td>
                <td className="px-2 py-1 border border-gray-200 text-center">
                  <button onClick={() => removeLigne(a.id)} className="text-red-500 hover:text-red-700"><X size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <datalist id={allDl}>{allOptions.map((opt, i) => <option key={i} value={opt} />)}</datalist>
      <datalist id={montureDl}>{montureAccOptions.map((opt, i) => <option key={i} value={opt} />)}</datalist>
      <datalist id={traitDl}>{traitServiceOptions.map((opt, i) => <option key={i} value={opt} />)}</datalist>

      <AddButton onClick={addLigne} className="self-start flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-white" style={{ backgroundColor: '#1a7a96' }}>
        <Plus size={14} /> Ajouter un Article
      </AddButton>

      <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
        <div className="flex items-start gap-6 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-blue-500 text-sm font-medium">Recherche...............</span>
            <input className={iCls} list={allDl} placeholder="Recherche libre (tout produit)..." value={search}
              onChange={e => { const v = e.target.value; setSearch(v); addFromSearch(v, () => true, () => setSearch('')); }} />
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4 min-w-0">
            <div>
              <div className="text-sm text-gray-400 mb-1 text-center">Code Barre</div>
              <input className={iCls} placeholder="Scanner / saisir..." value={searchCode}
                onChange={e => { const v = e.target.value; setSearchCode(v); const found = products.find(p => p.codeBarre && p.codeBarre.toLowerCase() === v.trim().toLowerCase()); if (found) { onChange([...articles, productToLigne(found)]); setSearchCode(''); } }} />
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1 text-center">Monture Accessoire</div>
              <input className={iCls} list={montureDl} placeholder="Référence ou marque..." value={searchMonture}
                onChange={e => { const v = e.target.value; setSearchMonture(v); addFromSearch(v, p => p.type === 'monture' || p.type === 'accessoire', () => setSearchMonture('')); }} />
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1 text-center">Traitement Service</div>
              <input className={iCls} list={traitDl} placeholder="Verre, traitement ou service..." value={searchService}
                onChange={e => { const v = e.target.value; setSearchService(v); addFromSearch(v, p => p.type === 'verre' || p.type === 'service', () => setSearchService('')); }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Étape II ──────────────────────────────────────────────────────────────────
function EtapeII({ propositions, onChange, magasinId, client }: { propositions: PropositionData[]; onChange: (p: PropositionData[]) => void; magasinId: string; client: ClientInfo }) {
  const [activeTab, setActiveTab] = useState(0);
  const [datePrescription, setDatePrescription] = useState('');
  const [showOrdo, setShowOrdo] = useState(false);
  const [loadingOrdo, setLoadingOrdo] = useState(false);
  const [ordoList, setOrdoList] = useState<{ date: string; numero: string; verres: VerreInfo[] }[]>([]);

  // Retrouve le client par numéro, téléphone ou nom.
  const matchClient = (v: VenteSupabase): boolean => {
    const nc = (client.numeroClient || '').trim();
    if (nc && (v.numero_client || '').trim() === nc) return true;
    const tel = (client.telephone1 || '').trim();
    if (tel && (v.telephone || '').trim() === tel) return true;
    const nom = (client.nom || '').trim().toLowerCase();
    if (nom && (v.client || '').replace(/^(M\.|Mme|Mlle|Dr)\s+/, '').trim().toLowerCase() === nom) return true;
    return false;
  };

  // Extrait les verres d'une vente : soit VerreInfo[] (facture), soit
  // PropositionData[] (devis → on prend la 1re proposition).
  const extractVerres = (raw: any): VerreInfo[] => {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (raw[0] && Array.isArray(raw[0].verres)) return (raw[0].verres || []) as VerreInfo[];
    return raw as VerreInfo[];
  };

  const buildOrdo = (ventes: VenteSupabase[]) =>
    ventes
      .filter(v => matchClient(v))
      .map(v => ({
        date: v.created_at || v.date || '',
        numero: (v.recap && ((v.recap as any).numFacture || (v.recap as any).numDevis || (v.recap as any).numero)) || v.id,
        verres: extractVerres(v.verres).map(vr => ({ ...emptyVerre(), ...vr, total: (vr as any).total ?? (vr as any).totalVerres ?? '' })),
      }))
      .filter(o => o.verres.length > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const openOrdonnances = async () => {
    if (!client.numeroClient && !client.nom && !client.telephone1) {
      alert("Veuillez d'abord renseigner le client (Étape I) pour charger ses anciennes ordonnances.");
      return;
    }
    setShowOrdo(true);
    setLoadingOrdo(true);
    setOrdoList(buildOrdo(readVentesCache(magasinId)));
    try {
      const fresh = await chargerVentes(magasinId);
      setOrdoList(buildOrdo(fresh));
    } catch { /* on garde le cache */ }
    setLoadingOrdo(false);
  };

  const applyOrdonnance = (verres: VerreInfo[]) => {
    const cloned = verres.map(v => ({ ...emptyVerre(), ...v }));
    const p = propositions[activeTab];
    const totalVerres = cloned.reduce((sum, vr) => sum + (parseFloat(vr.total) || 0), 0);
    updateProp(activeTab, { ...p, verres: cloned, totalVerres });
    setShowOrdo(false);
  };

  const updateProp = (i: number, p: PropositionData) => {
    // Toujours resynchroniser la remise (%) et le Total Net (somme finale) avec les
    // totaux courants, quel que soit le champ modifié (verres, articles, remise).
    const totalBrut = (p.totalVerres || 0) + (p.totalArticles || 0);
    const pct = parseFloat(p.remisePct || '0') || 0;
    const valeurRemise = totalBrut * pct / 100;
    const totalNet = totalBrut - valeurRemise;
    const next = [...propositions];
    next[i] = { ...p, valeurRemise, totalNet };
    onChange(next);
  };

  const addVerre = (propIdx: number) => {
    const p = propositions[propIdx];
    updateProp(propIdx, { ...p, verres: [...p.verres, emptyVerre()] });
  };

  const removeVerre = (propIdx: number, vIdx: number) => {
    const p = propositions[propIdx];
    updateProp(propIdx, { ...p, verres: p.verres.filter((_, i) => i !== vIdx) });
  };

  const updateVerre = (propIdx: number, vIdx: number, v: VerreInfo) => {
    const p = propositions[propIdx];
    const verres = [...p.verres];
    verres[vIdx] = v;
    const totalVerres = verres.reduce((sum, vr) => sum + (parseFloat(vr.total) || 0), 0);
    updateProp(propIdx, { ...p, verres, totalVerres });
  };

  const updateArticles = (propIdx: number, articles: ArticleLigne[]) => {
    const p = propositions[propIdx];
    const totalArticles = articles.reduce((sum, a) => sum + (parseFloat(a.total) || 0), 0);
    updateProp(propIdx, { ...p, articles, totalArticles });
  };

  const prop = propositions[activeTab];

  return (
    <div className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <div className="text-sm font-bold text-gray-700">Informations</div>
          <div className="text-sm font-bold text-gray-700">Verres Traitements Montures Accessoires Autres</div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Date Presciption</span>
          <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white">
            <input type="date" className="px-3 py-1.5 text-sm outline-none" value={datePrescription} onChange={e => setDatePrescription(e.target.value)} />
            <span className="px-2 text-gray-400"><Calendar size={14} /></span>
          </div>
        </div>
        <button type="button" onClick={openOrdonnances} className="px-4 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#e09a2b' }}>
          Dernière Ordonnance
        </button>
        <AddButton onClick={() => addVerre(activeTab)} className="flex items-center gap-1 px-4 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#e09a2b' }}>
          <Plus size={14} /> Ajouter Verre
        </AddButton>
      </div>

      {/* Instructions */}
      <p className="text-xs text-gray-500 italic">
        Cliquez sur le bouton suivant en bleu <span className="inline-block w-3 h-3 rounded-full bg-blue-500 align-middle mx-0.5"></span> pour renseigner chaque étape de la proposition. Ensuite passez à la proposition suivante.
      </p>

      {/* Tabs Propositions */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {['Proposition I', 'Proposition II', 'Proposition III'].map((label, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === i ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5 align-middle"></span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu proposition */}
      <div className="flex flex-col gap-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest">INFORMATIONS VERRES</div>

        {prop.verres.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 rounded-lg border-2 border-dashed border-purple-300 text-purple-400">
            <span className="text-sm">Aucun verre — cliquez sur <strong>Ajouter Verre</strong></span>
          </div>
        )}

        {prop.verres.map((v, vi) => (
          <VerreBlock
            key={vi}
            index={vi}
            total={prop.verres.length}
            data={v}
            onChange={updated => updateVerre(activeTab, vi, updated)}
            onRemove={() => removeVerre(activeTab, vi)}
          />
        ))}

        {/* Montures / Accessoires / Traitements / Services */}
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-2">Montures · Accessoires · Traitements · Autres</div>
        <ArticlesBlock
          articles={prop.articles}
          onChange={arts => updateArticles(activeTab, arts)}
          magasinId={magasinId}
          idSuffix={`p${activeTab}`}
        />

        <div className="flex">
          <button
            onClick={() => setActiveTab(i => Math.min(i + 1, 2))}
            className="flex items-center gap-1 px-4 py-2 rounded text-white text-sm font-semibold"
            style={{ backgroundColor: '#2563eb' }}
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-white mr-1"></span>
            Suivant
          </button>
        </div>
      </div>

      {/* Modale : anciennes ordonnances du client */}
      {showOrdo && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowOrdo(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ backgroundColor: '#f5eefb' }}>
              <div>
                <div className="text-sm font-bold text-purple-900">Anciennes ordonnances</div>
                <div className="text-xs text-gray-500">{client.nom || client.numeroClient || client.telephone1 || 'Client'} — appliquées à la {['Proposition I','Proposition II','Proposition III'][activeTab]}</div>
              </div>
              <button type="button" onClick={() => setShowOrdo(false)} className="text-gray-500 hover:text-gray-800"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-3">
              {loadingOrdo && ordoList.length === 0 && (
                <div className="text-center text-sm text-gray-500 py-8">Chargement des ordonnances…</div>
              )}
              {!loadingOrdo && ordoList.length === 0 && (
                <div className="text-center text-sm text-gray-500 py-8">Aucune ordonnance trouvée pour ce client.</div>
              )}
              {ordoList.map((o, idx) => (
                <div key={`${o.numero}-${idx}`} className="border border-purple-200 rounded-lg p-3 hover:border-purple-400">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-purple-900">
                      {formatDate(o.date)} <span className="text-gray-400">· {o.numero}</span>
                    </div>
                    <button type="button" onClick={() => applyOrdonnance(o.verres)} className="px-3 py-1 rounded text-white text-xs font-semibold" style={{ backgroundColor: '#9b45c7' }}>
                      Charger
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {o.verres.map((v, vi) => (
                      <div key={vi} className="text-[11px] text-gray-600 flex flex-wrap gap-x-3">
                        <span className="font-semibold text-gray-800">{v.verre || v.typeVerre || `Verre ${vi + 1}`}</span>
                        <span>OD&nbsp;: {v.oeilDroit?.sphere || '—'} / {v.oeilDroit?.cylindre || '—'} × {v.oeilDroit?.axe || '—'}</span>
                        <span>OG&nbsp;: {v.oeilGauche?.sphere || '—'} / {v.oeilGauche?.cylindre || '—'} × {v.oeilGauche?.axe || '—'}</span>
                        {v.traitement && <span>{v.traitement}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Étape III ─────────────────────────────────────────────────────────────────
function EtapeIII({ propositions, onChange, onEnregistrer }: { propositions: PropositionData[]; onChange: (p: PropositionData[]) => void; onEnregistrer: () => void }) {
  const updateRemise = (i: number, val: string) => {
    const p = propositions[i];
    const total = p.totalVerres + p.totalArticles;
    const pct = parseFloat(val) || 0;
    const valeurRemise = total * pct / 100;
    const next = [...propositions];
    next[i] = { ...p, remisePct: val, valeurRemise, totalNet: total - valeurRemise };
    onChange(next);
  };

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        {propositions.map((p, i) => {
          const total = p.totalVerres + p.totalArticles;
          return (
            <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col gap-2">
              <div className="text-sm font-bold text-gray-800">Proposition {['I','II','III'][i]}</div>
              <div className="text-xs text-gray-600">Verres = <span className="font-semibold">{fmtN(p.totalVerres)}</span></div>
              <div className="text-xs text-gray-600">Traitements + Montures + Accessoires + Autres = <span className="font-semibold">{fmtN(p.totalArticles)}</span></div>
              <div className="text-sm font-bold text-gray-800">Total = {fmtN(total)}</div>
              {i === 0 && (
                <div className="flex gap-2 mt-1">
                  <div className="flex-1">
                    <Lbl>Remise %</Lbl>
                    <input type="number" className={iCls} value={p.remisePct} onChange={e => updateRemise(i, e.target.value)} />
                  </div>
                  <div className="flex-1">
                    <Lbl>Valeur Remise</Lbl>
                    <input className={roCls} readOnly value={fmtN(p.valeurRemise)} />
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1">Total Net</div>
            </div>
          );
        })}
      </div>

      {/* Résumé totaux nets */}
      <div className="grid grid-cols-3 gap-4">
        {propositions.map((p, i) => {
          const total = p.totalVerres + p.totalArticles;
          const totalNet = i === 0 ? p.totalNet : total;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="text-sm font-bold text-gray-700">Proposition {['I','II','III'][i]} - {fmtN(totalNet)}</div>
              <div className="text-lg font-bold text-gray-800">{fmtN(totalNet)}</div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button onClick={onEnregistrer} className="px-6 py-2.5 rounded text-white font-semibold text-sm shadow" style={{ backgroundColor: '#1a7a96' }}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

// ── Formulaire Devis ──────────────────────────────────────────────────────────
const SIDEBAR_STEPS = [
  { label: 'I- Informations Client & Ophtalmologue', sub: '* Informations Obligatoires...' },
  { label: 'II- Dossier Informations', sub: 'Verres Traitements Montures\nAccessoires Autres...' },
  { label: 'III- Récapitulatif Devis', sub: 'Récapitulatif Dossier...' },
];

function FormulaireDevis({ magasinId, onRetour, onSaved, devisInitial }: { magasinId: string; onRetour: () => void; onSaved: () => void; devisInitial?: DevisRecord }) {
  const { user } = useAuth();
  const enEdition = !!devisInitial;
  const [step, setStep] = useState(0);
  const [client, setClient] = useState<ClientInfo>(() => devisInitial?._raw ? venteToClientInfo(devisInitial._raw) : emptyClient());
  const [propositions, setPropositions] = useState<PropositionData[]>(() => {
    const props = devisInitial?.propositions;
    return props && props.length ? props : [emptyProp(), emptyProp(), emptyProp()];
  });

  const handleEnregistrer = () => {
    if (!client.nom) { alert('Veuillez renseigner le client (Étape I).'); return; }
    const record: DevisRecord = {
      id: devisInitial?.id || Date.now().toString(),
      date: devisInitial?.date || new Date().toISOString(),
      numeroClient: client.numeroClient,
      client: `${client.civilite} ${client.nom}`.trim(),
      telephone: client.telephone1,
      propositions,
      numDevis: devisInitial?.numDevis || `DEV-${Date.now().toString().slice(-6)}`,
    };
    // Sauvegarder dans Supabase (source de vérité, partagé entre navigateurs)
    ajouterVente({
      id: record.id,
      magasin_id: magasinId,
      type: 'devis',
      date: record.date,
      numero_client: client.numeroClient,
      client: `${client.civilite} ${client.nom}`.trim(),
      civilite: client.civilite,
      telephone: client.telephone1,
      telephone2: client.telephone2,
      email: client.email,
      adresse: client.adresse,
      profession: client.profession,
      verres: propositions as any,
      articles: [],
      bons_assurance: [],
      recap: { numDevis: record.numDevis } as any,
      total_brut: 0,
      total_net: 0,
      edite_par: user?.nom || user?.prenom || user?.email || '',
      statut: 'devis',
    } as any).catch(e => logger.error('❌ sync devis Supabase:', e));

    // Auto-enregistrer le client dans la base du magasin
    autoSaveClient({
      numeroClient: client.numeroClient,
      civilite: client.civilite,
      nom: client.nom,
      telephone1: client.telephone1,
      telephone2: client.telephone2,
      email: client.email,
      adresse: client.adresse,
      profession: client.profession,
      jourNaissance: client.jourNaissance,
      moisNaissance: client.moisNaissance,
      anneeNaissance: client.anneeNaissance,
      soldeClient: client.soldeClient,
      matriculeAssurance: client.matriculeAssurance,
      entreprise: client.entreprise,
    }, magasinId);
    // Auto-enregistrer ophtalmologue et cabinet dans Gestion des Acteurs
    if (client.ophtalmologue) autoSaveOphtalmologue(client.ophtalmologue, client.telOphtalmologue);
    if (client.cabinetOphtalmologue) autoSaveCabinet(client.cabinetOphtalmologue, client.telCabinet);

    // Enregistrer automatiquement dans Demande de Devis (Firestore partagé)
    // — uniquement à la CRÉATION (pas en édition, pour éviter les doublons).
    if (!enEdition) (async () => {
      try {
        const demandeKey = `leclaire_demande_devis_${magasinId}`;
        const existingDemandes = await loadFromSupabase<any>(demandeKey, []);
        const nouvelleDemande = addCreateAudit({
          id: `devis-${record.id}`,
          numReference: record.numDevis,
          client: `${client.civilite} ${client.nom}`.trim(),
          commentaire: '',
          statut: 'Enregistré',
          date: new Date().toISOString().slice(0, 10),
        });
        await saveToSupabase(demandeKey, [nouvelleDemande, ...existingDemandes]);
        window.dispatchEvent(new CustomEvent('leclaire-devis-update', { detail: { magasinId } }));
      } catch {}
    })();

    onSaved();
    onRetour();
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#d6e4ea' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white shadow-sm">
        <span className="text-lg font-bold text-gray-800">{enEdition ? 'Modifier Devis | Proforma' : 'Nouveau Devis | Proforma'}</span>
        <button onClick={onRetour} className="px-4 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
          Devis | Proforma
        </button>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 bg-white shadow-sm flex flex-col py-4 gap-1">
          {SIDEBAR_STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`text-left px-4 py-3 text-xs transition-colors border-l-2 ${step === i ? 'border-blue-600 bg-blue-50 text-red-600 font-semibold' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}
            >
              <div className={step === i ? 'font-bold text-red-600' : 'font-semibold text-gray-700'}>{s.label.split('\n')[0]}</div>
              {s.sub && <div className="text-gray-400 mt-0.5" style={{ fontSize: 10 }}>{s.sub}</div>}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 bg-white m-4 rounded-lg shadow-sm overflow-hidden">
          {step === 0 && <EtapeI data={client} onChange={setClient} magasinId={magasinId} />}
          {step === 1 && <EtapeII propositions={propositions} onChange={setPropositions} magasinId={magasinId} client={client} />}
          {step === 2 && <EtapeIII propositions={propositions} onChange={setPropositions} onEnregistrer={handleEnregistrer} />}

          {step < 2 && (
            <div className="px-5 pb-5 flex justify-end border-t border-gray-100 pt-4">
              <button onClick={() => setStep(s => s + 1)} className="px-5 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Liste Devis ───────────────────────────────────────────────────────────────
function ListeDevis({ magasinId, onNouveau, onModifier }: { magasinId: string; onNouveau: () => void; onModifier?: (d: DevisRecord) => void }) {
  const { user } = useAuth();
  // Les conseillères et opticiens ne peuvent JAMAIS modifier ni supprimer un devis/proforma.
  const roleBloque = ['conseillere', 'opticien'].includes(user?.role || '');
  const peutModifier = !roleBloque && canEdit(user);
  const peutSupprimer = !roleBloque && canDelete(user);
  // Affichage INSTANTANÉ depuis le cache, puis rafraîchissement Firestore.
  const [devis, setDevis] = useState<DevisRecord[]>(
    () => readVentesCache(magasinId).filter(v => v.type === 'devis').map(supabaseToDevis),
  );
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<DevisRecord | null>(null);

  useEffect(() => {
    let annule = false;
    setDevis(readVentesCache(magasinId).filter(v => v.type === 'devis').map(supabaseToDevis));
    const load = () => chargerVentes(magasinId).then((rows: VenteSupabase[]) => {
      if (!annule) setDevis(rows.filter(v => v.type === 'devis').map(supabaseToDevis));
    }).catch(() => {});
    load();
    const interval = setInterval(load, 10000);
    const onUpdate = () => load();
    window.addEventListener('ventes-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      annule = true;
      clearInterval(interval);
      window.removeEventListener('ventes-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [magasinId]);

  const filtered = devis
    .filter(d =>
      [d.client, d.numeroClient, d.numDevis].some(s => s.toLowerCase().includes(search.toLowerCase()))
    )
    // Ordre d'arrivée : du plus récent au plus ancien → nouveaux devis en haut.
    .sort((a, b) => ((b.createdAt || b.date || '')).localeCompare(a.createdAt || a.date || ''));

  const handleSupprimer = async (d: DevisRecord) => {
    if (!window.confirm(`Supprimer définitivement le devis ${d.numDevis} de ${d.client} ?`)) return;
    const ok = await supprimerVente(d.id);
    if (ok) setDevis(prev => prev.filter(x => x.id !== d.id));
    else alert('❌ La suppression a échoué. Réessayez.');
  };

  // Migration Devis → Vente : après validation du client, on convertit le
  // devis (Proposition I) en vente/facture. Le même enregistrement change de
  // type 'devis' → 'vente' : il quitte donc la liste des devis et apparaît
  // dans Vente | Facture.
  const handleConvertir = async (d: DevisRecord) => {
    const props = d.propositions || [];
    const prop = props.find(p => (p.verres?.length || 0) + (p.articles?.length || 0) > 0) || props[0];
    if (!prop) { alert('Ce devis ne contient aucune proposition à convertir.'); return; }
    if (!window.confirm(`Convertir le devis ${d.numDevis} de ${d.client} en vente / facture ?\n\nLa Proposition I sera utilisée. Le devis quittera la liste des devis.`)) return;

    const total = (prop.totalVerres || 0) + (prop.totalArticles || 0);
    const totalNet = prop.totalNet || total;
    const numFacture = genNumFacture();
    const raw = d._raw;
    try {
      await ajouterVente({
        id: d.id, // même id → mise à jour en place (le devis devient une vente)
        magasin_id: magasinId,
        type: 'vente',
        date: new Date().toISOString(),
        numero_client: d.numeroClient,
        client: d.client,
        civilite: raw?.civilite || '',
        telephone: d.telephone,
        telephone2: raw?.telephone2 || '',
        email: raw?.email || '',
        adresse: raw?.adresse || '',
        profession: raw?.profession || '',
        verres: (prop.verres || []) as any,
        articles: (prop.articles || []) as any,
        bons_assurance: [],
        recap: { numFacture, numDevis: d.numDevis, remisePct: prop.remisePct || '0', acompte: '0', modePaiement: '', rdvRetrait: '' } as any,
        total_brut: total,
        total_net: totalNet,
        edite_par: user?.nom || user?.prenom || user?.email || '',
        statut: 'vente',
      } as any);
      setDevis(prev => prev.filter(x => x.id !== d.id));
      window.dispatchEvent(new CustomEvent('ventes-updated'));
      alert(`✅ Devis converti en vente (facture ${numFacture}).\nRetrouvez-le dans Vente | Facture.`);
    } catch (e) {
      logger.error('❌ Conversion devis → vente:', e);
      alert('❌ La conversion a échoué. Réessayez.');
    }
  };

  return (
    <>
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4">
            <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: '#1a7a96' }}>
              <span className="text-white font-semibold">Détail — {detail.numDevis}</span>
              <button onClick={() => setDetail(null)} className="text-white"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">N° Client</span><div className="font-mono font-bold text-blue-700">{detail.numeroClient}</div></div>
              <div><span className="text-gray-500">Client</span><div className="font-semibold">{detail.client}</div></div>
              <div><span className="text-gray-500">Date</span><div>{fmt(detail.date)}</div></div>
              <div><span className="text-gray-500">N° Devis</span><div className="font-mono">{detail.numDevis}</div></div>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button onClick={() => imprimerDevis(detail, magasinId)} className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#7b3fa0' }}>
                <Printer size={15} /> Imprimer
              </button>
              <button onClick={() => { const d = detail; setDetail(null); handleConvertir(d); }} className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a9c5b' }}>
                <ArrowRightLeft size={15} /> Convertir en vente
              </button>
              <button onClick={() => setDetail(null)} className="px-4 py-2 rounded border border-gray-300 text-sm">Fermer</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Devis | Proforma</h1>
            <p className="text-sm text-gray-500 mt-0.5">Devis proforma enregistrés</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: '#e3f2fd' }}>
              <div className="text-lg font-bold text-blue-700">{devis.length}</div>
              <div className="text-xs text-blue-500">Devis</div>
            </div>
            <AddButton onClick={onNouveau} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-semibold text-sm shadow" style={{ backgroundColor: '#1a7a96' }}>
              <Plus size={16} /> Devis | Proforma
            </AddButton>
          </div>
        </div>

        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white max-w-sm">
          <FileText size={15} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Rechercher par client, N° devis..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                <th className="text-center px-3 py-3 w-10">#</th>
                <th className="text-left px-4 py-3">N° Devis</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Propositions</th>
                <th className="text-left px-4 py-3">Édition</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">Aucun devis enregistré</td></tr>
              ) : filtered.map((d, idx) => {
                const props = (d.propositions || []).filter(p => (p.verres?.length || 0) > 0 || (p.articles?.length || 0) > 0);
                return (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-3 py-3 text-center text-gray-500">{idx + 1}</td>
                  <td className="px-4 py-3 font-mono text-blue-700">{d.numDevis}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <span className="font-mono text-gray-500">N°({d.numeroClient})</span>{' '}
                      <span className="font-semibold text-gray-800">{d.client}</span>
                    </div>
                    {d.telephone && <div className="text-xs text-gray-500 mt-0.5">Téléphone: {d.telephone}</div>}
                  </td>
                  {/* Récapitulatif des propositions (calqué sur la maquette). */}
                  <td className="px-4 py-3">
                    {props.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <table className="border-collapse text-xs" style={{ minWidth: 420 }}>
                        <thead>
                          <tr className="text-white" style={{ backgroundColor: '#3b8ba5' }}>
                            <th className="border border-white/40 px-2 py-1.5"></th>
                            <th className="border border-white/40 px-2 py-1.5 text-left font-semibold">Verres</th>
                            <th className="border border-white/40 px-2 py-1.5 text-left font-semibold">Traitements Montures<br/>Accessoires Autres</th>
                            <th className="border border-white/40 px-2 py-1.5 text-left font-semibold whitespace-nowrap">Remise</th>
                            <th className="border border-white/40 px-2 py-1.5 text-left font-semibold whitespace-nowrap">Total Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {props.map((p, pi) => {
                            // La remise est un pourcentage appliqué au total (verres +
                            // traitements/montures/…) ; le Total Net est la somme FINALE
                            // après remise. On recalcule ici pour ne jamais dépendre
                            // d'une valeur figée éventuellement périmée.
                            const totalBrut = (p.totalVerres || 0) + (p.totalArticles || 0);
                            const pct = parseFloat(p.remisePct || '0') || 0;
                            const valeurRemise = totalBrut * pct / 100;
                            const totalNet = totalBrut - valeurRemise;
                            return (
                            <tr key={pi} style={{ backgroundColor: '#eaf3f6' }}>
                              <td className="border border-white px-2 py-1.5 font-bold text-[#1a6f8c] whitespace-nowrap">
                                P-{toRoman(pi + 1)}
                              </td>
                              <td className="border border-white px-2 py-1.5 text-right font-semibold text-gray-700">{money(p.totalVerres)}</td>
                              <td className="border border-white px-2 py-1.5 text-right font-semibold text-gray-700">{money(p.totalArticles)}</td>
                              <td className="border border-white px-2 py-1.5 text-gray-700 whitespace-nowrap">
                                {pct}%{valeurRemise > 0 && <span className="text-gray-500"> (-{money(valeurRemise)})</span>}
                              </td>
                              <td className="border border-white px-2 py-1.5 text-right font-bold text-gray-900">{money(totalNet)}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </td>
                  {/* Édition : date/heure + éditeur puis grille de boutons d'action. */}
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="text-xs text-gray-600 whitespace-nowrap">
                        <div>{formatDate(d.updatedAt || d.createdAt)}</div>
                        <div className="font-semibold text-gray-800 mt-0.5">{d.updatedBy || d.createdBy || '—'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 flex-shrink-0">
                        <button onClick={() => setDetail(d)} title="Voir / Détails" className="flex items-center justify-center rounded text-white" style={{ width: 30, height: 28, backgroundColor: '#475569' }}><MoreHorizontal size={15} /></button>
                        <button onClick={() => imprimerDevis(d, magasinId)} title="Imprimer le devis" className="flex items-center justify-center rounded text-white" style={{ width: 30, height: 28, backgroundColor: '#f97316' }}><Printer size={15} /></button>
                        {peutModifier && onModifier ? (
                          <button onClick={() => onModifier(d)} title="Modifier" className="flex items-center justify-center rounded text-white" style={{ width: 30, height: 28, backgroundColor: '#f59e0b' }}><Pencil size={15} /></button>
                        ) : <span />}
                        <button onClick={() => handleConvertir(d)} title="Convertir en vente" className="flex items-center justify-center rounded text-white" style={{ width: 30, height: 28, backgroundColor: '#16a34a' }}><ArrowRightLeft size={15} /></button>
                        {peutSupprimer && (
                          <button onClick={() => handleSupprimer(d)} title="Supprimer" className="flex items-center justify-center rounded text-white" style={{ width: 30, height: 28, backgroundColor: '#dc2626' }}><Trash2 size={15} /></button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-gray-500">Total : {filtered.length} devis</div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DevisProformaPage() {
  const location = useLocation();
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const openDirectly = (location.state as any)?.openFormulaire === true;
  const [vue, setVue] = useState<'liste' | 'formulaire'>(openDirectly ? 'formulaire' : 'liste');
  const [refresh, setRefresh] = useState(0);
  const [devisEnEdition, setDevisEnEdition] = useState<DevisRecord | null>(null);

  return (
    <div style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
      {vue === 'liste'
        ? <ListeDevis
            key={refresh}
            magasinId={magasinId}
            onNouveau={() => { setDevisEnEdition(null); setVue('formulaire'); }}
            onModifier={(d) => { setDevisEnEdition(d); setVue('formulaire'); }}
          />
        : <FormulaireDevis
            magasinId={magasinId}
            devisInitial={devisEnEdition || undefined}
            onRetour={() => { setDevisEnEdition(null); setVue('liste'); }}
            onSaved={() => setRefresh(r => r + 1)}
          />
      }
    </div>
  );
}
