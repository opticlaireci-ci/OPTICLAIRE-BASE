/**
 * Atelier → « Commande de verre » : sous-onglets « Passer commande » (magasin)
 * et « Réception commande » (assistante administrative). Voir
 * services/commandesVerreService.ts pour le parcours complet.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Eye, FileText, CheckCircle2, PackageCheck, Send, Clock, Camera } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMagasins } from '../hooks/useMagasins';
import { useCommandesVerre } from '../hooks/useCommandesVerre';
import { useTypesVerre, useVerresList, useTraitementOptions, useFournisseurs } from '../utils/venteLookups';
import { getMagasinLabel, memeMagasin } from '../constants/magasins';
import { afficherPdfBlob } from '../utils/inAppViewer';
import {
  ROLES_RECEPTION_VERRE, STATUT_ENVOYEE, STATUT_EN_ATTENTE, STATUT_ARRIVEE,
  libelleStatutMagasin, libelleStatutReception, passerCommandeVerre, confirmerCommandeVerre,
  signalerArriveeVerre, marquerArriveesVues, lireOrdonnance, preparerOrdonnance,
  type CommandeVerre, type LigneVerre, type FichierOrdonnance,
} from '../services/commandesVerreService';

export type SousOngletVerre = 'passer' | 'reception';

const formatDate = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
};
const formatDateHeure = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};
const nomUtilisateur = (u: any) => `${u?.prenom || ''} ${u?.nom || ''}`.trim() || u?.email || 'Utilisateur';

const couleurStatut = (statut: string) =>
  statut === STATUT_ARRIVEE ? 'bg-green-100 text-green-800 border-green-300'
  : statut === STATUT_EN_ATTENTE ? 'bg-orange-100 text-orange-800 border-orange-300'
  : 'bg-blue-100 text-blue-800 border-blue-300';

/** Résumé court des verres : « OD Varilux 1.6 · OG Varilux 1.6 ». */
const resumeVerres = (verres: LigneVerre[]) =>
  verres.map(v => `${v.oeil} ${v.verre}${v.quantite > 1 ? ` ×${v.quantite}` : ''}`).join(' · ') || '-';

const ligneVide = (oeil: 'OD' | 'OG'): LigneVerre => ({
  oeil, typeVerre: '', verre: '', traitement: '', matiere: '',
  sphere: '', cylindre: '', axe: '', addition: '', diametre: '', quantite: 1,
});

// ── Ordonnance : affichage ──────────────────────────────────────────────────

async function ouvrirOrdonnance(c: CommandeVerre, setImage: (src: string | null) => void) {
  const f = await lireOrdonnance(c);
  if (!f) { alert("Ordonnance introuvable pour cette commande."); return; }
  if (f.type === 'application/pdf') {
    await afficherPdfBlob(f.blob, { titre: `Ordonnance — ${c.client} (${c.numero})`, nomFichier: f.nom });
  } else {
    setImage(URL.createObjectURL(f.blob));
  }
}

// ── Nouvelle commande ───────────────────────────────────────────────────────

function NouvelleCommande({ magasinId, onFermer, onCommandee }: {
  magasinId?: string;
  onFermer: () => void;
  onCommandee: (c: CommandeVerre) => void;
}) {
  const { user } = useAuth();
  const magasins = useMagasins();
  const typesVerre = useTypesVerre();
  const verresCatalogue = useVerresList();
  const traitements = useTraitementOptions();
  const fournisseurs = useFournisseurs();
  const [magasin, setMagasin] = useState(magasinId || user?.magasinActuel || user?.magasinIds?.[0] || '');
  const [client, setClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [numeroFacture, setNumeroFacture] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [observations, setObservations] = useState('');
  const [lignes, setLignes] = useState<LigneVerre[]>([ligneVide('OD'), ligneVide('OG')]);
  const [commanderOeil, setCommanderOeil] = useState<{ OD: boolean; OG: boolean }>({ OD: true, OG: true });
  const [ordonnance, setOrdonnance] = useState<FichierOrdonnance | null>(null);
  const [preparation, setPreparation] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const majLigne = (oeil: 'OD' | 'OG', champ: keyof LigneVerre, valeur: string) =>
    setLignes(prev => prev.map(l => l.oeil !== oeil ? l : {
      ...l, [champ]: champ === 'quantite' ? Math.max(1, parseInt(valeur, 10) || 1) : valeur,
    }));
  /** OG = mêmes verres que l'OD (le plus fréquent), réglages de correction exceptés. */
  const copierODversOG = () => setLignes(prev => {
    const od = prev.find(l => l.oeil === 'OD')!;
    return prev.map(l => l.oeil === 'OG'
      ? { ...l, typeVerre: od.typeVerre, verre: od.verre, traitement: od.traitement, matiere: od.matiere, diametre: od.diametre }
      : l);
  });

  const choisirFichier = async (f?: File | null) => {
    if (!f) return;
    setPreparation(true);
    try {
      setOrdonnance(await preparerOrdonnance(f));
    } catch (e: any) {
      setOrdonnance(null);
      alert(`❌ ${e?.message || e}`);
    } finally {
      setPreparation(false);
    }
  };

  const commander = async () => {
    const verres = lignes.filter(l => commanderOeil[l.oeil]);
    if (!magasin) { alert('Choisissez le magasin qui passe la commande.'); return; }
    if (!client.trim()) { alert('Indiquez le nom du client.'); return; }
    if (verres.length === 0) { alert('Cochez au moins un œil (OD ou OG) à commander.'); return; }
    const sansVerre = verres.find(v => !v.verre.trim());
    if (sansVerre) { alert(`Indiquez le verre à commander pour l'œil ${sansVerre.oeil === 'OD' ? 'droit (OD)' : 'gauche (OG)'}.`); return; }
    if (!ordonnance) { alert("Téléchargez l'ordonnance du client avant de commander."); return; }
    setEnvoi(true);
    try {
      const c = await passerCommandeVerre({
        magasinId: magasin,
        magasinLabel: getMagasinLabel(magasin),
        client, telephone, numeroFacture, fournisseur, observations,
        verres: verres.map(v => ({ ...v, verre: v.verre.trim() })),
        ordonnance,
        creePar: nomUtilisateur(user),
      });
      onCommandee(c);
    } catch (e: any) {
      alert(`❌ La commande n'a pas pu être enregistrée.\n\n${e?.message || e}\n\nVos saisies sont conservées : réessayez.`);
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const etiquette = 'block text-xs font-semibold text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-6" style={{ zIndex: 1300 }} data-testid="nouvelle-commande-verre">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-bold text-gray-800">Nouvelle commande de verre</h2>
          <button onClick={onFermer} className="text-gray-500 hover:text-gray-800" title="Fermer"><X size={22} /></button>
        </div>

        <div className="p-5 space-y-5">
          <datalist id="cv-types">{typesVerre.map(t => <option key={t} value={t} />)}</datalist>
          <datalist id="cv-verres">{[...new Set(verresCatalogue.map(v => v.verre).filter(Boolean))].map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="cv-traitements">{traitements.map(t => <option key={t} value={t} />)}</datalist>
          <datalist id="cv-fournisseurs">{fournisseurs.map(f => <option key={f} value={f} />)}</datalist>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className={etiquette}>Magasin demandeur *</label>
              {magasinId ? (
                <div className={`${champ} bg-gray-50 font-semibold`}>{getMagasinLabel(magasinId)}</div>
              ) : (
                <select className={champ} value={magasin} onChange={e => setMagasin(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {magasins.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={etiquette}>Nom du client *</label>
              <input className={champ} value={client} onChange={e => setClient(e.target.value)} placeholder="Nom et prénoms" />
            </div>
            <div>
              <label className={etiquette}>Téléphone du client</label>
              <input className={champ} value={telephone} onChange={e => setTelephone(e.target.value)} />
            </div>
            <div>
              <label className={etiquette}>N° de facture</label>
              <input className={champ} value={numeroFacture} onChange={e => setNumeroFacture(e.target.value)} placeholder="FA-…" />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">Verres à commander</h3>
              <button type="button" onClick={copierODversOG} className="text-xs text-blue-700 hover:underline">
                Même verre pour l'OG que pour l'OD
              </button>
            </div>
            <div className="space-y-3">
              {lignes.map(l => (
                <div key={l.oeil} className={`border rounded-lg p-3 ${commanderOeil[l.oeil] ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                  <label className="flex items-center gap-2 mb-2 font-semibold text-sm text-gray-800">
                    <input type="checkbox" checked={commanderOeil[l.oeil]}
                      onChange={e => setCommanderOeil(prev => ({ ...prev, [l.oeil]: e.target.checked }))} />
                    {l.oeil === 'OD' ? 'Œil droit (OD)' : 'Œil gauche (OG)'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    <div className="col-span-2">
                      <label className={etiquette}>Verre *</label>
                      <input className={champ} list="cv-verres" value={l.verre} onChange={e => majLigne(l.oeil, 'verre', e.target.value)} disabled={!commanderOeil[l.oeil]} />
                    </div>
                    <div>
                      <label className={etiquette}>Type de verre</label>
                      <input className={champ} list="cv-types" value={l.typeVerre} onChange={e => majLigne(l.oeil, 'typeVerre', e.target.value)} disabled={!commanderOeil[l.oeil]} />
                    </div>
                    <div>
                      <label className={etiquette}>Traitement</label>
                      <input className={champ} list="cv-traitements" value={l.traitement} onChange={e => majLigne(l.oeil, 'traitement', e.target.value)} disabled={!commanderOeil[l.oeil]} />
                    </div>
                    <div>
                      <label className={etiquette}>Matière / indice</label>
                      <input className={champ} value={l.matiere} onChange={e => majLigne(l.oeil, 'matiere', e.target.value)} disabled={!commanderOeil[l.oeil]} />
                    </div>
                    <div>
                      <label className={etiquette}>Quantité</label>
                      <input className={champ} type="number" min={1} value={l.quantite} onChange={e => majLigne(l.oeil, 'quantite', e.target.value)} disabled={!commanderOeil[l.oeil]} />
                    </div>
                    {(['sphere', 'cylindre', 'axe', 'addition', 'diametre'] as const).map(k => (
                      <div key={k}>
                        <label className={etiquette}>{{ sphere: 'Sphère', cylindre: 'Cylindre', axe: 'Axe', addition: 'Addition', diametre: 'Diamètre' }[k]}</label>
                        <input className={champ} value={l[k]} onChange={e => majLigne(l.oeil, k, e.target.value)} disabled={!commanderOeil[l.oeil]} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={etiquette}>Fournisseur / verrier</label>
              <input className={champ} list="cv-fournisseurs" value={fournisseur} onChange={e => setFournisseur(e.target.value)} />
            </div>
            <div>
              <label className={etiquette}>Observations</label>
              <input className={champ} value={observations} onChange={e => setObservations(e.target.value)} placeholder="Urgence, précisions…" />
            </div>
          </section>

          <section className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            <label className={etiquette}>Ordonnance du client * (photo ou PDF)</label>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Téléphone / tablette : l'appareil photo s'ouvre directement. */}
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-100 text-blue-900 font-semibold text-sm cursor-pointer hover:bg-blue-200">
                <Camera size={16} /> Prendre une photo
                <input type="file" accept="image/*" capture="environment" className="hidden" data-testid="photo-ordonnance"
                  onChange={e => { choisirFichier(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-100 text-amber-900 font-semibold text-sm cursor-pointer hover:bg-amber-200">
                <FileText size={16} /> {ordonnance ? "Changer l'ordonnance" : "Télécharger l'ordonnance"}
                <input type="file" accept="image/*,application/pdf" className="hidden" data-testid="fichier-ordonnance"
                  onChange={e => { choisirFichier(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {preparation && <span className="text-sm text-gray-500">Préparation du fichier…</span>}
              {ordonnance && !preparation && (
                <span className="flex items-center gap-2 text-sm text-green-700">
                  {ordonnance.type.startsWith('image/')
                    ? <img src={ordonnance.contenu} alt="Aperçu de l'ordonnance" className="border rounded" style={{ height: 56, width: 'auto', maxWidth: 120, objectFit: 'cover' }} />
                    : <FileText size={18} />}
                  ✓ {ordonnance.nom}
                </span>
              )}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 px-5 py-3 border-t bg-gray-50 rounded-b-lg">
          <button onClick={onFermer} className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100">Annuler</button>
          <button onClick={commander} disabled={envoi || preparation}
            className="inline-flex items-center gap-2 px-6 py-2 rounded bg-blue-700 text-white font-bold hover:bg-blue-800 disabled:opacity-60">
            <Send size={16} /> {envoi ? 'Envoi…' : 'COMMANDER'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fiche d'une commande ────────────────────────────────────────────────────

function FicheCommande({ c, onFermer, onOrdonnance }: { c: CommandeVerre; onFermer: () => void; onOrdonnance: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-6" style={{ zIndex: 1300 }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-bold text-gray-800">Commande {c.numero}</h2>
          <button onClick={onFermer} className="text-gray-500 hover:text-gray-800" title="Fermer"><X size={22} /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><span className="text-gray-500">Magasin : </span><strong>{c.magasinLabel || getMagasinLabel(c.magasinId)}</strong></div>
            <div><span className="text-gray-500">Client : </span><strong>{c.client}</strong>{c.telephone ? ` — ${c.telephone}` : ''}</div>
            <div><span className="text-gray-500">N° facture : </span>{c.numeroFacture || '-'}</div>
            <div><span className="text-gray-500">Fournisseur : </span>{c.fournisseur || '-'}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border text-xs">
              <thead className="bg-gray-100">
                <tr>{['Œil', 'Verre', 'Type', 'Traitement', 'Matière', 'Sph', 'Cyl', 'Axe', 'Add', 'Diam', 'Qté'].map(h => <th key={h} className="px-2 py-1 border text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {c.verres.map(v => (
                  <tr key={v.oeil}>
                    {[v.oeil, v.verre, v.typeVerre, v.traitement, v.matiere, v.sphere, v.cylindre, v.axe, v.addition, v.diametre, String(v.quantite)].map((x, i) => <td key={i} className="px-2 py-1 border">{x || '-'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.observations && <div><span className="text-gray-500">Observations : </span>{c.observations}</div>}
          <ul className="space-y-1 text-gray-700">
            <li>📝 Commandée le {formatDateHeure(c.date)} par {c.creePar || '-'}</li>
            <li>{c.dateConfirmation ? `✅ Confirmée le ${formatDateHeure(c.dateConfirmation)} par ${c.confirmePar || '-'}` : '⏳ Pas encore confirmée'}</li>
            <li>{c.dateArrivee ? `📦 Verre arrivé le ${formatDateHeure(c.dateArrivee)} (${c.arriveePar || '-'})` : '📦 Verre pas encore arrivé'}</li>
          </ul>
          <button onClick={onOrdonnance} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-100 text-amber-900 font-semibold hover:bg-amber-200">
            <FileText size={16} /> Voir l'ordonnance
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Onglet ──────────────────────────────────────────────────────────────────

/**
 * `magasinId` : page Atelier d'un magasin (commandes de ce magasin). Absent :
 * Atelier du tableau de bord général (toutes les commandes visibles).
 */
export function CommandeVerreTab({ magasinId, sousOngletInitial }: { magasinId?: string; sousOngletInitial?: SousOngletVerre }) {
  const { user } = useAuth();
  const estReception = ROLES_RECEPTION_VERRE.includes(user?.role || '');
  const [sousOnglet, setSousOnglet] = useState<SousOngletVerre>(sousOngletInitial || (estReception ? 'reception' : 'passer'));
  const { commandes, chargement, erreur, recharger } = useCommandesVerre(magasinId);
  const [formulaire, setFormulaire] = useState(false);
  const [fiche, setFiche] = useState<CommandeVerre | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [filtre, setFiltre] = useState<'a-traiter' | 'envoyees' | 'attente' | 'arrivees' | 'toutes'>('a-traiter');
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState('');

  // Le magasin ouvre ses commandes : les arrivées sont « vues », l'icône cesse de clignoter.
  const estDuMagasin = !!magasinId && (user?.magasinIds || []).some(m => memeMagasin(m, magasinId));
  useEffect(() => {
    if (!estDuMagasin || estReception || chargement) return;
    marquerArriveesVues(commandes).catch(() => { /* réessayé au prochain affichage */ });
  }, [commandes, chargement, estDuMagasin, estReception]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return commandes.filter(c => {
      if (sousOnglet === 'reception') {
        if (filtre === 'a-traiter' && c.statut === STATUT_ARRIVEE) return false;
        if (filtre === 'envoyees' && c.statut !== STATUT_ENVOYEE) return false;
        if (filtre === 'attente' && c.statut !== STATUT_EN_ATTENTE) return false;
        if (filtre === 'arrivees' && c.statut !== STATUT_ARRIVEE) return false;
      }
      return !q || [c.numero, c.client, c.magasinLabel, c.telephone, c.numeroFacture, resumeVerres(c.verres)]
        .some(x => String(x || '').toLowerCase().includes(q));
    });
  }, [commandes, sousOnglet, filtre, recherche]);

  const compte = (s: string) => commandes.filter(c => c.statut === s).length;
  const par = nomUtilisateur(user);

  const confirmer = async (c: CommandeVerre) => {
    setEnCours(c.id);
    try {
      await confirmerCommandeVerre(c, par);
      setMessage(`✅ Commande ${c.numero} confirmée : le magasin ${c.magasinLabel} la voit « En attente ».`);
      recharger();
    } catch (e: any) {
      alert(`❌ Confirmation impossible : ${e?.message || e}`);
    } finally { setEnCours(''); }
  };
  const arrivee = async (c: CommandeVerre) => {
    if (!confirm(`Le verre de la commande ${c.numero} (${c.client}) est-il arrivé ?\n\nLe magasin ${c.magasinLabel} sera prévenu.`)) return;
    setEnCours(c.id);
    try {
      await signalerArriveeVerre(c, par);
      setMessage(`📦 Verre arrivé : le magasin ${c.magasinLabel} est prévenu (commande ${c.numero}).`);
      recharger();
    } catch (e: any) {
      alert(`❌ Enregistrement impossible : ${e?.message || e}`);
    } finally { setEnCours(''); }
  };
  const voirOrdonnance = (c: CommandeVerre) => ouvrirOrdonnance(c, setImage).catch(e => alert(`❌ ${e?.message || e}`));

  const onglet = (id: SousOngletVerre, libelle: string, nb?: number) => (
    <button
      onClick={() => setSousOnglet(id)}
      data-testid={`sous-onglet-${id}`}
      className={`px-5 py-2.5 text-sm font-semibold border-b-2 ${sousOnglet === id ? 'border-blue-700 text-blue-800 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
    >
      {libelle}{nb ? <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs">{nb}</span> : null}
    </button>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm" data-testid="commande-verre">
      <div className="flex border-b bg-gray-50 rounded-t-lg overflow-x-auto">
        {onglet('passer', 'Passer commande')}
        {onglet('reception', 'Réception commande', estReception ? compte(STATUT_ENVOYEE) : undefined)}
      </div>

      <div className="p-4 space-y-3">
        {message && (
          <div className="flex items-start justify-between gap-3 p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
            <span>{message}</span>
            <button onClick={() => setMessage('')} title="Fermer"><X size={16} /></button>
          </div>
        )}
        {erreur && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">⚠️ {erreur}</div>}

        <div className="flex items-center gap-3 flex-wrap">
          {sousOnglet === 'passer' && (
            <button onClick={() => setFormulaire(true)} data-testid="nouvelle-commande"
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-green-600 text-white font-bold hover:bg-green-700">
              <Plus size={18} /> NOUVELLE COMMANDE
            </button>
          )}
          {sousOnglet === 'reception' && (
            <div className="flex gap-1 flex-wrap">
              {([
                ['a-traiter', 'À traiter'], ['envoyees', `À confirmer (${compte(STATUT_ENVOYEE)})`],
                ['attente', `En attente (${compte(STATUT_EN_ATTENTE)})`], ['arrivees', `Arrivées (${compte(STATUT_ARRIVEE)})`], ['toutes', 'Toutes'],
              ] as const).map(([id, libelle]) => (
                <button key={id} onClick={() => setFiltre(id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtre === id ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-300'}`}>
                  {libelle}
                </button>
              ))}
            </div>
          )}
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher (client, n°, magasin…)"
            className="ml-auto w-full sm:w-64 px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>

        {chargement && commandes.length === 0 ? (
          <div className="py-10 text-center text-gray-500 text-sm">Chargement des commandes…</div>
        ) : filtrees.length === 0 ? (
          <div className="py-10 text-center text-gray-500 text-sm">
            {sousOnglet === 'passer' ? 'Aucune commande de verre. Cliquez sur « NOUVELLE COMMANDE ».' : 'Aucune commande dans cette liste.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 820 }} data-testid={`liste-${sousOnglet}`}>
              <thead>
                <tr className="bg-gray-100 text-left text-gray-700">
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">Date</th>
                  {!magasinId && <th className="px-3 py-2">Magasin</th>}
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Verres</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrees.map(c => {
                  const nouvelleArrivee = sousOnglet === 'passer' && c.statut === STATUT_ARRIVEE && !c.arriveeVue;
                  return (
                    <tr key={c.id} className={nouvelleArrivee ? 'bg-green-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{c.numero}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(c.date)}</td>
                      {!magasinId && <td className="px-3 py-2 whitespace-nowrap">{c.magasinLabel}</td>}
                      <td className="px-3 py-2">{c.client}</td>
                      <td className="px-3 py-2 text-xs text-gray-700" style={{ maxWidth: 260 }}>{resumeVerres(c.verres)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${couleurStatut(c.statut)}`}>
                          {c.statut === STATUT_ARRIVEE ? <PackageCheck size={12} /> : c.statut === STATUT_EN_ATTENTE ? <Clock size={12} /> : <Send size={12} />}
                          {sousOnglet === 'reception' ? libelleStatutReception(c.statut) : libelleStatutMagasin(c.statut)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end items-center gap-1.5">
                          <button onClick={() => setFiche(c)} title="Détail" className="p-1.5 rounded border text-gray-700 hover:bg-gray-100"><Eye size={15} /></button>
                          <button onClick={() => voirOrdonnance(c)} title="Ordonnance" className="p-1.5 rounded border text-amber-800 hover:bg-amber-50"><FileText size={15} /></button>
                          {sousOnglet === 'reception' && estReception && c.statut === STATUT_ENVOYEE && (
                            <button onClick={() => confirmer(c)} disabled={enCours === c.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap">
                              <CheckCircle2 size={14} /> CONFIRMER LA COMMANDE
                            </button>
                          )}
                          {sousOnglet === 'reception' && estReception && c.statut === STATUT_EN_ATTENTE && (
                            <button onClick={() => arrivee(c)} disabled={enCours === c.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-60 whitespace-nowrap">
                              <PackageCheck size={14} /> VERRE ARRIVÉ
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
        )}
      </div>

      {formulaire && (
        <NouvelleCommande
          magasinId={magasinId}
          onFermer={() => setFormulaire(false)}
          onCommandee={c => {
            setFormulaire(false);
            setMessage(`✅ Commande ${c.numero} envoyée : elle est dans « Réception commande » et attend la confirmation de l'assistante administrative.`
              // Administration : signale que le stockage des ordonnances n'est pas encore installé.
              + (!c.ordonnance?.chemin && estReception ? " (Ordonnance rangée dans la base : exécutez STOCKAGE_ORDONNANCES_2026-10-28.sql pour utiliser le stockage de fichiers.)" : ''));
            recharger();
          }}
        />
      )}
      {fiche && <FicheCommande c={fiche} onFermer={() => setFiche(null)} onOrdonnance={() => voirOrdonnance(fiche)} />}
      {image && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4" style={{ zIndex: 1310 }} onClick={() => { URL.revokeObjectURL(image); setImage(null); }}>
          <img src={image} alt="Ordonnance" className="max-h-full max-w-full rounded shadow-xl bg-white" />
          <button className="absolute top-4 right-4 text-white" title="Fermer"><X size={28} /></button>
        </div>
      )}
    </div>
  );
}
