import { logger } from '../../../utils/logger';
import { AddButton } from '../../../components/AddButton';
import { useState , useEffect, useRef} from 'react';
import { useParams } from 'react-router';
import { Plus, Trash2, Eye, X, FileText, Search, Download } from 'lucide-react';
import { addCreateAudit, addUpdateAudit, formatDate, AuditInfo } from '../../../utils/auditUtils';
import { genNumVenteFlash, genCodeBarre as genCB } from '../../../utils/autoNumbers';
import { useVenteProducts, findVenteProduct, useComptesBanque, useModesPaiement, useProfessions, useClientsMagasin, useAssurances } from '../../../utils/venteLookups';
import { autoSaveClient } from '../../../utils/autoClient';
import { useSupabaseSync } from '../../../hooks/useSupabaseSync';
import { ajouterVente, chargerVentes, VenteSupabase } from '../../../services/ventesService';
import { enregistrerVente } from '../../../services/inventaireService';
import { verifierStockVente, messageRuptures } from '../../../utils/stockVente';
import { StockParMagasin } from '../../../components/StockParMagasin';
import { useAuth } from '../../../contexts/AuthContext';

// ── helpers ───────────────────────────────────────────────────────────────────
const genNumClient = () => String(Math.floor(10000 + Math.random() * 90000));
const fmtN = (n: number) => n.toLocaleString('fr-FR');

// Convertit une vente Firestore (snake_case) vers le type VenteFlash (camelCase) attendu par l'UI.
const supabaseToVenteFlash = (v: VenteSupabase): VenteFlash => {
  const recap: any = v.recap || {};
  const total = (v.articles || []).reduce((s: number, a: any) => s + (parseFloat(a.total) || 0), 0);
  const remisePct = recap.remisePct || '';
  const valeurRemise = total * (parseFloat(remisePct) || 0) / 100;
  const totalNet = typeof v.total_net === 'number' && v.total_net > 0 ? v.total_net : total - valeurRemise;
  const totalAssurance = (v.bons_assurance || []).reduce((s: number, b: any) => s + (parseFloat(b.montant) || 0), 0);
  const acompteN = parseFloat(recap.acompte || '0') || 0;
  return {
    id: v.id,
    date: v.date,
    numeroClient: v.numero_client || '',
    client: v.client,
    civilite: v.civilite || '',
    telephone: v.telephone || '',
    soldeClient: v.solde_client || '',
    profession: v.profession || '',
    articles: (v.articles || []) as any,
    bonsAssurance: (v.bons_assurance || []) as any,
    total,
    remisePct,
    valeurRemise,
    totalNet,
    acompte: recap.acompte || '',
    modePaiement: recap.modePaiement || '',
    compteBanque: recap.compteBanque || '',
    details: recap.details || '',
    totalReste: totalNet - totalAssurance - acompteN,
    numFacture: recap.numFacture || v.id,
    createdBy: v.edite_par || '',
    createdAt: v.created_at || v.date,
  } as VenteFlash;
};
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

// ── types ──────────────────────────────────────────────────────────────────────
interface ArticleLigne { id: string; produitId?: string; designation: string; type?: 'monture' | 'accessoire' | 'traitement' | 'service' | 'autre'; stock: string; prix: string; remise: string; quantite: string; total: string; }
interface BonAssurance { id: string; assurance: string; numeroBon: string; date: string; matricule: string; montant: string; }
interface VenteFlash extends AuditInfo { id: string; date: string; numeroClient: string; client: string; civilite: string; telephone: string; soldeClient: string; profession?: string; jourNaissance?: string; moisNaissance?: string; anneeNaissance?: string; articles: ArticleLigne[]; bonsAssurance: BonAssurance[]; total: number; remisePct: string; valeurRemise: number; totalNet: number; acompte: string; modePaiement: string; compteBanque: string; details: string; totalReste: number; numFacture: string; }

const emptyArticle = (): ArticleLigne => ({ id: Date.now().toString() + Math.random(), designation: '', stock: '', prix: '', remise: '0', quantite: '1', total: '0' });

// ── styles plats (fond blanc, séparateurs pointillés) ─────────────────────────
const sep = 'border-b border-dashed border-gray-300';
const iCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';
const roCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-600';
const selCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white';

function Lbl({ req, children }: { req?: boolean; children: React.ReactNode }) {
  return <div className="text-xs text-gray-600 mb-1">{children}{req && <span className="text-red-500 ml-0.5">*</span>}</div>;
}

// ── Modal Bon Assurance ───────────────────────────────────────────────────────
function ModalBonAssurance({ onAdd, onClose }: { onAdd: (b: BonAssurance) => void; onClose: () => void }) {
  const [form, setForm] = useState<BonAssurance>({ id: Date.now().toString(), assurance: '', numeroBon: '', date: '', matricule: '', montant: '' });
  const assurancesEnr = useAssurances();
  const set = (k: keyof BonAssurance) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-800">Bon Assurance</span>
          <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div><Lbl>Assurance</Lbl>
            <select className={selCls} value={form.assurance} onChange={set('assurance')}>
              <option value="">Choisir Assurance...</option>
              {(assurancesEnr.length > 0 ? assurancesEnr : ['CNPS','MUGEF-CI','SANLAM','AXA','NSIA','COLINA']).map(a => <option key={a}>{a}</option>)}
              <option>Autre</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl>N° Bon</Lbl><input className={iCls} value={form.numeroBon} onChange={set('numeroBon')} /></div>
            <div><Lbl>Date</Lbl><input type="date" className={iCls} value={form.date} onChange={set('date')} /></div>
            <div><Lbl>Matricule</Lbl><input className={iCls} value={form.matricule} onChange={set('matricule')} /></div>
            <div><Lbl>Montant Pris en Charge</Lbl><input type="number" className={iCls} value={form.montant} onChange={set('montant')} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-700">Annuler</button>
          <button onClick={() => { onAdd(form); onClose(); }} className="px-4 py-2 rounded text-sm text-white font-semibold" style={{ backgroundColor: '#1a7a96' }}>Ajouter</button>
        </div>
      </div>
    </div>
  );
}

// ── Formulaire Vente Flash ────────────────────────────────────────────────────
function FormulaireVenteFlash({ magasinId, onRetour, onSaved }: { magasinId: string; onRetour: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [numeroClient] = useState(genNumClient);
  const [civilite, setCivilite] = useState('');
  const [client, setClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [soldeClient, setSoldeClient] = useState('');
  const [profession, setProfession] = useState('');
  const [jourNaissance, setJourNaissance] = useState('');
  const [moisNaissance, setMoisNaissance] = useState('');
  const [anneeNaissance, setAnneeNaissance] = useState('');
  const [articles, setArticles] = useState<ArticleLigne[]>([]);
  const [codeBarre] = useState(() => genCB());
  const [montureAcc, setMontureAcc] = useState('');
  const [traitementSvc, setTraitementSvc] = useState('');
  const [remisePct, setRemisePct] = useState('');
  const [bonsAssurance, setBonsAssurance] = useState<BonAssurance[]>([]);
  const [showBonModal, setShowBonModal] = useState(false);
  const [acompte, setAcompte] = useState('');
  const [modePaiement, setModePaiement] = useState('');
  const [compteBanque, setCompteBanque] = useState('');
  const [details, setDetails] = useState('');
  const [numFacture] = useState(() => genNumVenteFlash());
  const [succes, setSucces] = useState(false);
  const savingRef = useRef(false);
  const products = useVenteProducts(magasinId);
  // On ne propose que ce qui est réellement disponible dans le magasin, comme la
  // Vente/Facture : un article géré en stock et épuisé (`stock <= 0`) est retiré
  // de la liste, tandis que verres et services (`stock === null`, non gérés en
  // stock) restent toujours proposés.
  const productOptions = [...new Set(
    products.filter(p => p.stock == null || p.stock > 0).map(p => p.label).filter(Boolean),
  )];
  const modesPaiement = useModesPaiement();
  const comptesBanque = useComptesBanque();
  const professions = useProfessions();
  const clientsList = useClientsMagasin(magasinId);

  const updateArticle = (id: string, key: keyof ArticleLigne, val: string) => {
    setArticles(prev => prev.map(a => {
      if (a.id !== id) return a;
      let u = { ...a, [key]: val };
      if (key === 'designation') {
        const found = findVenteProduct(products, val);
        if (found) {
          const type = found.type === 'verre' ? 'traitement' : found.type;
          u = { ...u, type, produitId: found.produitId, stock: found.stock == null ? '' : String(found.stock), prix: String(found.prix ?? '') };
          const p = found.prix || 0;
          const q = parseFloat(u.quantite) || 1;
          const r = parseFloat(u.remise) || 0;
          u.total = (p * q * (1 - r / 100)).toFixed(0);
          return u;
        }
      }
      const p = parseFloat(key === 'prix' ? val : u.prix) || 0;
      const r = parseFloat(key === 'remise' ? val : u.remise) || 0;
      const q = parseFloat(key === 'quantite' ? val : u.quantite) || 1;
      u.total = (p * q * (1 - r / 100)).toFixed(0);
      return u;
    }));
  };

  const total = articles.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
  const remisePctN = parseFloat(remisePct) || 0;
  const valeurRemise = total * remisePctN / 100;
  const totalAssurance = bonsAssurance.reduce((s, b) => s + (parseFloat(b.montant) || 0), 0);
  const totalNet = total - valeurRemise;
  const acompteN = parseFloat(acompte) || 0;
  const totalReste = totalNet - totalAssurance - acompteN;

  const handleEnregistrer = async () => {
    if (!client) { alert('Veuillez renseigner le client.'); return; }

    // Contrôle du STOCK, identique à la Vente/Facture : une monture ou un
    // accessoire absent du magasin (aucun bon de distribution ni de transfert
    // reçu, ou tout déjà vendu) ne peut pas être vendu. La Vente Flash affichait
    // le stock sans jamais l'imposer : le stock partait donc en négatif.
    const ruptures = verifierStockVente(articles, products);
    if (ruptures.length > 0) {
      alert(messageRuptures(ruptures));
      return;
    }

    // Garde anti-double : empêche un double enregistrement (double-clic / re-render).
    if (savingRef.current) return;
    savingRef.current = true;
    const vente: VenteFlash = {
      id: Date.now().toString(), date: new Date().toISOString(),
      numeroClient, client: `${civilite} ${client}`.trim(), civilite, telephone, soldeClient,
      profession, jourNaissance, moisNaissance, anneeNaissance,
      articles, bonsAssurance, total, remisePct, valeurRemise, totalNet,
      acompte, modePaiement, compteBanque, details, totalReste, numFacture,
    };
    // Pousser la vente vers Supabase : les totaux seront recalculés par le trigger
    try {
      await ajouterVente({
        id: vente.id,
        magasin_id: magasinId,
        type: 'vente',
        date: vente.date,
        numero_client: numeroClient,
        client: `${civilite} ${client}`.trim(),
        civilite,
        telephone,
        profession,
        solde_client: soldeClient,
        verres: [],
        articles: articles as any,
        bons_assurance: bonsAssurance as any,
        recap: { remisePct, acompte, modePaiement, compteBanque, details, numFacture },
        total_brut: 0,
        total_net: 0,
        edite_par: user?.nom || user?.prenom || user?.email || '',
        statut: 'en_cours',
      } as any);
    } catch (err) {
      logger.error('❌ Push vente Supabase:', err);
    }

    // Décrémenter le stock réel du magasin EN ARRIÈRE-PLAN (pas d'await) pour
    // que l'écran de succès s'affiche immédiatement sans attendre la mise à jour du stock.
    {
      const items = articles
        .filter(a => a.type === 'monture' || a.type === 'accessoire')
        .map(a => ({
          id: (a.produitId || a.designation).trim(),
          type: a.type as 'monture' | 'accessoire',
          designation: a.designation.trim(),
          quantite: parseFloat(a.quantite) || 0,
          prixVente: parseFloat(a.prix) || 0,
        }));
      if (items.length > 0) {
        enregistrerVente({ magasinId: magasinId.toUpperCase(), bonReference: numFacture, items })
          .then(() => window.dispatchEvent(new CustomEvent('leclaire-sync-update')))
          .catch(err => logger.error('❌ Décrément stock vente flash:', err));
      }
    }

    // Auto-enregistrer le client dans la base du magasin
    autoSaveClient({
      numeroClient,
      civilite,
      nom: client,
      telephone1: telephone,
      soldeClient,
      profession,
      jourNaissance,
      moisNaissance,
      anneeNaissance,
    }, magasinId);

    savingRef.current = false;
    setSucces(true);
    setTimeout(() => { setSucces(false); onSaved(); onRetour(); }, 1200);
  };

  return (
    <div className="bg-white min-h-screen flex flex-col">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3 ${sep}`}>
        <span className="text-base font-bold text-gray-800">Nouvelle Vente | Facture</span>
        <button onClick={onRetour} className="px-4 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#1a7a96' }}>
          Ventes | Factures
        </button>
      </div>

      {/* Client */}
      <div className={`px-5 py-4 ${sep}`}>
        <datalist id="vf-clients-datalist">
          {clientsList.map((c, i) => <option key={i} value={c} />)}
        </datalist>
        <datalist id="vf-professions-datalist">
          {professions.map((p, i) => <option key={i} value={p} />)}
        </datalist>
        <div className="flex gap-4 mb-3">
          <div style={{ width: 180 }}>
            <Lbl req>N° Client</Lbl>
            <input className={roCls + ' font-mono font-bold text-blue-700'} readOnly value={numeroClient} />
          </div>
          <div style={{ width: 140 }}>
            <Lbl>Civilité</Lbl>
            <select className={selCls} value={civilite} onChange={e => setCivilite(e.target.value)}>
              <option value=""></option>
              <option>M.</option><option>Mme</option><option>Mlle</option><option>Dr</option>
            </select>
          </div>
          <div className="flex-1">
            <Lbl req>Nom / Prénoms</Lbl>
            <input
              className={iCls}
              list="vf-clients-datalist"
              placeholder="Nom du client..."
              value={client}
              onChange={e => setClient(e.target.value)}
            />
          </div>
          <div style={{ width: 220 }}>
            <Lbl req>N° Téléphone I</Lbl>
            <input className={iCls} value={telephone} onChange={e => setTelephone(e.target.value)} />
          </div>
          <div style={{ width: 200 }}>
            <Lbl>Solde Client</Lbl>
            <input className={iCls} value={soldeClient} onChange={e => setSoldeClient(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-4">
          <div style={{ width: 260 }}>
            <Lbl>Profession</Lbl>
            <input
              className={iCls}
              list="vf-professions-datalist"
              placeholder="Profession..."
              value={profession}
              onChange={e => setProfession(e.target.value)}
            />
          </div>
          <div style={{ width: 100 }}>
            <Lbl>Jour Naiss.</Lbl>
            <input
              className={iCls}
              placeholder="JJ"
              maxLength={2}
              value={jourNaissance}
              onChange={e => setJourNaissance(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </div>
          <div style={{ width: 140 }}>
            <Lbl>Mois Naiss.</Lbl>
            <select className={selCls} value={moisNaissance} onChange={e => setMoisNaissance(e.target.value)}>
              <option value="">—</option>
              {['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'].map((m, i) => (
                <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 120 }}>
            <Lbl>Année Naiss.</Lbl>
            <input
              className={iCls}
              placeholder="AAAA"
              maxLength={4}
              value={anneeNaissance}
              onChange={e => setAnneeNaissance(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
        </div>
      </div>

      {/* Table articles */}
      <div className={sep}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-dashed border-gray-300">
              <th className="text-left px-5 py-2.5 font-semibold text-gray-700">Monture | Accessoire | Traitement | Service</th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-700 w-24">Stock</th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-700 w-24">Prix</th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-700 w-24">Remise</th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-700 w-28">Quantité</th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-700 w-32">Total</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 && (
              <tr className="border-b border-dashed border-gray-200">
                <td colSpan={7} className="px-5 py-3 text-sm text-gray-400 italic">— aucun article —</td>
              </tr>
            )}
            {articles.map(a => (
              <tr key={a.id} className="border-b border-dashed border-gray-200">
                <td className="px-5 py-2">
                  <input
                    className={iCls}
                    placeholder="Désignation..."
                    list="vf-montures-datalist"
                    value={a.designation}
                    onChange={e => updateArticle(a.id, 'designation', e.target.value)}
                  />
                </td>
                <td className="px-3 py-2"><input className={iCls} value={a.stock} onChange={e => updateArticle(a.id, 'stock', e.target.value)} /></td>
                <td className="px-3 py-2"><input type="number" className={iCls} value={a.prix} onChange={e => updateArticle(a.id, 'prix', e.target.value)} /></td>
                <td className="px-3 py-2"><input type="number" className={iCls} value={a.remise} onChange={e => updateArticle(a.id, 'remise', e.target.value)} /></td>
                <td className="px-3 py-2">
                  <select className={selCls} value={a.quantite} onChange={e => updateArticle(a.id, 'quantite', e.target.value)}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n}>{n}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><input className={roCls + ' font-semibold'} readOnly value={fmtN(parseFloat(a.total) || 0)} /></td>
                <td className="px-2 py-2">
                  <button onClick={() => setArticles(p => p.filter(x => x.id !== a.id))} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="vf-montures-datalist">
          {productOptions.map((opt, i) => <option key={i} value={opt} />)}
        </datalist>
        <div className="px-5 pb-1">
          {/* Stock réel de chaque magasin pour les articles saisis. */}
          <StockParMagasin lignes={articles} products={products} magasinId={magasinId} />
        </div>
        <div className="px-5 py-2">
          <AddButton onClick={() => setArticles(p => [...p, emptyArticle()])} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <Plus size={13} /> Ajouter une ligne
          </AddButton>
        </div>
      </div>

      {/* Recherche */}
      <div className={`px-5 py-4 ${sep}`} style={{ backgroundColor: '#f9f9f9' }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: '#1a7a96' }}>Recherche.............</span>
          <div className="flex items-end gap-4">
            <div>
              <div className="text-xs text-gray-600 mb-1">Code Barre</div>
              <input className={roCls} style={{ width: 160 }} readOnly value={codeBarre} />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Monture Accessoire</div>
              <input
                className={iCls}
                style={{ width: 180 }}
                list="vf-montures-datalist"
                placeholder="Référence ou marque..."
                value={montureAcc}
                onChange={e => {
                  const v = e.target.value;
                  setMontureAcc(v);
                  const found = findVenteProduct(products, v);
                  if (found) {
                    const p = found.prix || 0;
                    setArticles(prev => [...prev, {
                      id: Date.now().toString() + Math.random(),
                      produitId: found.produitId,
                      designation: found.label,
                      type: (found.type === 'verre' ? 'traitement' : found.type) as ArticleLigne['type'],
                      stock: found.stock == null ? '' : String(found.stock),
                      prix: String(found.prix ?? ''),
                      remise: '0',
                      quantite: '1',
                      total: String(Math.round(p)),
                    }]);
                    setMontureAcc('');
                  }
                }}
              />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Traitement Service</div>
              <input className={iCls} style={{ width: 170 }} value={traitementSvc} onChange={e => setTraitementSvc(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Barre grise vide */}
      <div className={`h-6 ${sep}`} style={{ backgroundColor: '#e8e8e8' }}></div>

      {/* Totaux */}
      <div className={`px-5 py-4 ${sep}`}>
        <div className="flex gap-4">
          <div className="flex-1">
            <Lbl>Total</Lbl>
            <input className={roCls} readOnly value={fmtN(total)} />
          </div>
          <div className="flex-1">
            <Lbl>Remise %</Lbl>
            <input type="number" className={iCls} value={remisePct} onChange={e => setRemisePct(e.target.value)} />
          </div>
          <div className="flex-1">
            <Lbl>Valeur Remise</Lbl>
            <input className={roCls} readOnly value={fmtN(valeurRemise)} />
          </div>
          <div className="flex-1">
            <Lbl>Total Net</Lbl>
            <input className={roCls + ' font-bold text-blue-700'} readOnly value={fmtN(totalNet)} />
          </div>
        </div>
      </div>

      {/* Bon Assurance */}
      <div className={`px-5 py-4 ${sep}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-700">Bon Assurance</span>
          <AddButton onClick={() => setShowBonModal(true)} className="px-5 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#e09a2b' }}>
            Ajouter Bon Assurance
          </AddButton>
        </div>
        {bonsAssurance.map(b => (
          <div key={b.id} className="flex justify-between items-center px-3 py-1.5 rounded bg-orange-50 text-sm mb-1">
            <span>{b.assurance} — {b.numeroBon}</span>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-green-700">{fmtN(parseFloat(b.montant) || 0)} F CFA</span>
              <button onClick={() => setBonsAssurance(p => p.filter(x => x.id !== b.id))} className="text-red-400"><X size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Acompte / Mode paiement */}
      <div className={`px-5 py-4 ${sep}`}>
        <div className="flex gap-4 items-end">
          <div style={{ width: 220 }}>
            <Lbl>Acompte</Lbl>
            <input type="number" className={iCls} value={acompte} onChange={e => setAcompte(e.target.value)} />
          </div>
          <div className="flex-1">
            <Lbl>Mode de Paiement</Lbl>
            <select className={selCls} value={modePaiement} onChange={e => setModePaiement(e.target.value)}>
              <option value="">Choisir Mode de Paiement...</option>
              {modesPaiement.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <Lbl>Compte Banque</Lbl>
            <select className={selCls} value={compteBanque} onChange={e => setCompteBanque(e.target.value)}>
              <option value="">Choisir Compte Banque...</option>
              {comptesBanque.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <Lbl>Détails</Lbl>
            <input className={iCls} value={details} onChange={e => setDetails(e.target.value)} />
          </div>
          <div>
            <Lbl>Pièce Jointe</Lbl>
            <label className="flex items-center justify-center border border-gray-300 rounded cursor-pointer hover:bg-amber-50" style={{ width: 42, height: 36, backgroundColor: '#fef9ec' }}>
              <Download size={16} className="text-amber-700" />
              <input type="file" className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Total Reste + N° Facture */}
      <div className={`px-5 py-4 ${sep}`}>
        <div className="flex gap-4">
          <div style={{ width: 220 }}>
            <Lbl>Total Reste</Lbl>
            <input
              className={roCls + ' font-bold'}
              readOnly
              value={fmtN(totalReste)}
              style={{ color: totalReste > 0 ? '#e53e3e' : '#38a169' }}
            />
          </div>
          <div style={{ width: 200 }}>
            <Lbl>N° Vente</Lbl>
            <input className={roCls + ' font-mono font-semibold text-blue-700'} readOnly value={numFacture} />
          </div>
        </div>
      </div>

      {/* Footer Enregistrer */}
      <div className="flex justify-end px-5 py-4">
        <button
          onClick={handleEnregistrer}
          className="px-5 py-2 rounded text-white font-semibold text-sm"
          style={{ backgroundColor: succes ? '#38a169' : '#1a7a96' }}
        >
          {succes ? '✓ Enregistré !' : 'Enregistrer'}
        </button>
      </div>

      {showBonModal && <ModalBonAssurance onAdd={b => setBonsAssurance(p => [...p, b])} onClose={() => setShowBonModal(false)} />}
    </div>
  );
}

// ── Liste des ventes flash ────────────────────────────────────────────────────
function ListeVentesFlash({ magasinId, onNouvelle }: { magasinId: string; onNouvelle: () => void }) {
  const [ventes, setVentes] = useState<VenteFlash[]>([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<VenteFlash | null>(null);

  // Lecture DIRECTE Firestore (cohérent sur tous les navigateurs). Ne garde que les ventes flash.
  useEffect(() => {
    let annule = false;
    chargerVentes(magasinId).then((rows: VenteSupabase[]) => {
      if (annule) return;
      const flash = rows
        .filter(v => v.type === 'vente')
        .filter(v => { const r: any = v.recap || {}; return typeof r.numFacture === 'string' && r.numFacture.startsWith('VF-'); })
        .map(supabaseToVenteFlash);
      setVentes(flash);
    }).catch(() => { if (!annule) setVentes([]); });
    return () => { annule = true; };
  }, [magasinId]);

  const filtered = ventes.filter(v =>
    [v.client, v.numeroClient, v.numFacture].some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4">
            <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: '#1a7a96' }}>
              <span className="text-white font-semibold">Détail — {detail.numFacture}</span>
              <button onClick={() => setDetail(null)} className="text-white"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">N° Client</span><div className="font-mono font-bold text-blue-700">{detail.numeroClient}</div></div>
                <div><span className="text-gray-500">Client</span><div className="font-semibold" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{detail.client}</div></div>
                <div><span className="text-gray-500">Total Net</span><div className="font-bold">{fmtN(detail.totalNet)} F CFA</div></div>
                <div><span className="text-gray-500">Total Reste</span><div className="font-bold" style={{ color: detail.totalReste > 0 ? '#e53e3e' : '#38a169' }}>{fmtN(detail.totalReste)} F CFA</div></div>
              </div>
              {detail.articles.length > 0 && (
                <div className="border border-gray-200 rounded overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: '#e8e8e8' }}>
                        <th className="px-2 py-1.5 text-left font-semibold border border-gray-200">Désignation</th>
                        <th className="px-2 py-1.5 text-center font-semibold border border-gray-200">Stock</th>
                        <th className="px-2 py-1.5 text-center font-semibold border border-gray-200">Qté</th>
                        <th className="px-2 py-1.5 text-right font-semibold border border-gray-200">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.articles.map(a => {
                        const s = parseFloat(a.stock || '0');
                        const q = parseFloat(a.quantite || '0');
                        const hasStock = a.stock !== '' && a.stock != null;
                        const color = s <= 0 ? '#c62828' : s < q ? '#e65100' : '#2e7d32';
                        return (
                          <tr key={a.id} className="bg-white">
                            <td className="px-2 py-1.5 border border-gray-200 font-medium">{a.designation || '—'}</td>
                            <td className="px-2 py-1.5 text-center border border-gray-200 font-semibold">
                              {hasStock ? <span style={{ color }}>{s}</span> : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-center border border-gray-200">{a.quantite}</td>
                            <td className="px-2 py-1.5 text-right border border-gray-200 font-semibold">{fmtN(parseFloat(a.total || '0'))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 pb-5">
              <button onClick={() => setDetail(null)} className="px-4 py-2 rounded border border-gray-300 text-sm">Fermer</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5 p-6" style={{ backgroundColor: '#d6e4ea', minHeight: '100vh' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Ventes | Factures</h1>
            <p className="text-sm text-gray-500 mt-0.5">Ventes Flash enregistrées</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: '#e3f2fd' }}>
              <div className="text-lg font-bold text-blue-700">{ventes.length}</div>
              <div className="text-xs text-blue-500">Ventes</div>
            </div>
            <div className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: '#fff3e0' }}>
              <div className="text-base font-bold text-orange-700">{fmtN(ventes.reduce((s, v) => s + v.totalNet, 0))}</div>
              <div className="text-xs text-orange-500">CA (FCFA)</div>
            </div>
            <AddButton onClick={onNouvelle} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-semibold text-sm shadow" style={{ backgroundColor: '#1a7a96' }}>
              <Plus size={16} /> Ventes | Factures
            </AddButton>
          </div>
        </div>

        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white max-w-sm">
          <FileText size={15} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Rechercher par client, N°..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                <th className="px-4 py-3 w-10 text-center">#</th>
                <th className="text-left px-4 py-3">N° Facture</th>
                <th className="text-left px-4 py-3">N° Client</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-right px-4 py-3">Total Net</th>
                <th className="text-right px-4 py-3">Reste</th>
                <th className="text-left px-4 py-3">Créé par</th>
                <th className="text-left px-4 py-3">Modifié par</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">Aucune vente enregistrée</td></tr>
              ) : [...filtered].sort((a, b) => (a.numFacture || '').localeCompare(b.numFacture || '', 'fr')).map((v, idx) => (
                <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-center text-xs text-gray-400 font-medium">{idx + 1}</td>
                  <td className="px-4 py-2 font-mono text-blue-700">{v.numFacture}</td>
                  <td className="px-4 py-2 font-mono">{v.numeroClient}</td>
                  <td className="px-4 py-2 font-semibold">{v.client}</td>
                  <td className="px-4 py-2 text-gray-500">{fmt(v.date)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmtN(v.totalNet)}</td>
                  <td className="px-4 py-2 text-right font-semibold" style={{ color: v.totalReste > 0 ? '#e53e3e' : '#38a169' }}>{fmtN(v.totalReste)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {v.createdBy ? (
                      <div>
                        <div className="font-medium">{v.createdBy}</div>
                        <div className="text-gray-400">{formatDate(v.createdAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {v.updatedBy ? (
                      <div>
                        <div className="font-medium">{v.updatedBy}</div>
                        <div className="text-gray-400">{formatDate(v.updatedAt)}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => setDetail(v)} className="text-blue-500 hover:text-blue-700"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-gray-500">Total : {filtered.length} vente(s)</div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function VenteFlashPage() {
  const { magasinId = '' } = useParams<{ magasinId: string }>();
  const [vue, setVue] = useState<'liste' | 'formulaire'>('formulaire');
  const [refresh, setRefresh] = useState(0);
  return vue === 'liste'
    ? <ListeVentesFlash key={refresh} magasinId={magasinId} onNouvelle={() => setVue('formulaire')} />
    : <FormulaireVenteFlash magasinId={magasinId} onRetour={() => setVue('liste')} onSaved={() => setRefresh(r => r + 1)} />;
}
