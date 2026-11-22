/**
 * Onglet « Charges & salaires » de la page Comptabilité → Mouvements :
 *  - Charges du mois : une ligne par officine, UNITÉ, FIBRE OPTIQUE, CIE,
 *    SODECI, SALAIRES (référence et montant), LOYER, PRIMES ; totaux et
 *    CHARGES TOTALES ;
 *  - Salaires des employés : NOM, FONCTION, SALAIRE DE BASE, EMPRUNT,
 *    SALAIRE FINAL (= salaire de base − emprunt) ; totaux.
 * Tout se modifie dans les cases ; lignes, colonnes et employés s'ajoutent ;
 * import Excel / CSV (et copier-coller depuis Excel), export Excel,
 * impression. Données dans une table protégée (administration, direction,
 * comptabilité).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { TENANT } from '../../../config/tenant';
import { getCurrentUser } from '../../../utils/auditUtils';
import { nouvelId, texteSur } from '../../../utils/pointsSemaine';
import {
  COULEURS_NOUVELLES_CHARGES, ajouterMois, chargesDuMois, estMois, importerCharges, importerSalaires, libelleMois, lignesEffectives,
  moisCourant, salaireFinal, salairesDuMois, tableauCharges, tableauSalaires, totauxCharges, totauxSalaires,
  type ChargesMois, type Employe, type LigneCharge, type LigneMois, type SalairesMois,
} from '../../../utils/chargesSalaires';
import { chargerMois, enregistrerMois, TableChargesAbsente } from '../../../services/chargesSalairesService';
import { lireCsv, lireTableur } from '../../../leclaire/importFichier';
import { BoutonAjouter, ChampMontant, NomModifiable, PetitBouton, deplacer, fmt, useMagasinsPoint } from './pointsCommun';
import { htmlCharges, htmlSalaires, imprimerDocument } from './chargesImpression';

const BORD = '1px solid #1f2937';
const cellule: CSSProperties = { border: BORD, padding: '2px 4px', fontSize: 13, textAlign: 'center', whiteSpace: 'nowrap' };
const bouton = 'px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50';

type Etat = { ligne: LigneMois | null; precedent: LigneMois | null; modele: LigneMois | null };

/** Texte modifiable qui peut être vidé (référence, nom, fonction). */
function TexteCase({ valeur, onChange, lectureSeule, style, testId, placeholder }: {
  valeur: string; onChange: (v: string) => void; lectureSeule?: boolean; style?: CSSProperties; testId?: string; placeholder?: string;
}) {
  const [t, setT] = useState<string | null>(null);
  const base: CSSProperties = { width: '100%', minWidth: 0, background: 'transparent', border: 0, outline: 'none', font: 'inherit', color: 'inherit', textAlign: 'center', padding: '2px 2px', ...style };
  if (lectureSeule) return <span style={{ ...base, display: 'block' }} data-testid={testId}>{valeur}</span>;
  return (
    <input
      type="text" value={t ?? valeur} placeholder={placeholder} data-testid={testId}
      onFocus={() => setT(valeur)}
      onChange={e => setT(e.target.value)}
      onBlur={() => { if (t !== null) { const v = t.trim(); setT(null); if (v !== valeur) onChange(v); } }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setT(null); (e.target as HTMLInputElement).blur(); } }}
      style={base}
    />
  );
}

export function ChargesSalaires({ mois, onMois, editable }: { mois: string; onMois: (m: string) => void; editable: boolean }) {
  const magasins = useMagasinsPoint();
  const tenant = TENANT.nom;
  const [vue, setVueBrut] = useState<'charges' | 'salaires'>(() => { try { return sessionStorage.getItem('opticlaire_charges_vue') === 'salaires' ? 'salaires' : 'charges'; } catch { return 'charges'; } });
  const setVue = (v: 'charges' | 'salaires') => { setVueBrut(v); try { sessionStorage.setItem('opticlaire_charges_vue', v); } catch { /* navigation privée */ } };
  const [etat, setEtatBrut] = useState<Etat | null>(null);
  const etatRef = useRef<Etat | null>(null);
  const setEtat = (e: Etat | null) => { etatRef.current = e; setEtatBrut(e); };
  const [erreur, setErreur] = useState<string | null>(null);
  const [absente, setAbsente] = useState(false);
  const [statut, setStatut] = useState('');
  const [message, setMessage] = useState('');
  const [collage, setCollage] = useState<string | null>(null);
  const file = useRef<Promise<void>>(Promise.resolve());
  const fichierCharges = useRef<HTMLInputElement>(null);
  const fichierSalaires = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    try {
      const r = await chargerMois(mois);
      setEtat(r); setErreur(null); setAbsente(false);
    } catch (e: any) {
      setAbsente(e instanceof TableChargesAbsente);
      setErreur(e?.message || String(e));
    }
  }, [mois]);
  useEffect(() => { setEtat(null); setMessage(''); setStatut(''); void charger(); }, [charger]);

  const charges = useMemo(() => (etat ? chargesDuMois(etat.ligne, etat.modele, magasins, tenant) : null), [etat, magasins, tenant]);
  const salaires = useMemo(() => (etat ? salairesDuMois(etat.ligne, etat.modele) : null), [etat]);
  const lignes = useMemo(() => (charges ? lignesEffectives(charges, magasins, tenant) : []), [charges, magasins, tenant]);
  const totC = charges ? totauxCharges(charges, lignes) : null;
  const totS = salaires ? totauxSalaires(salaires) : null;
  const moisModele = etat?.modele?.charges?.moisSource || etat?.modele?.salaires?.moisSource || '';

  /** Change le mois affiché et l'enregistre (le mois est créé au premier changement). */
  const modifier = (f: (c: { charges: ChargesMois; salaires: SalairesMois; lignes: LigneCharge[] }) => { charges?: ChargesMois; salaires?: SalairesMois }) => {
    const e = etatRef.current;
    if (!e || !editable) return;
    const ch = chargesDuMois(e.ligne, e.modele, magasins, tenant);
    const actuel = { charges: ch, salaires: salairesDuMois(e.ligne, e.modele), lignes: lignesEffectives(ch, magasins, tenant) };
    const maj = f(actuel);
    const complet = { charges: maj.charges ?? actuel.charges, salaires: maj.salaires ?? actuel.salaires };
    const auteur = getCurrentUser();
    const quand = new Date().toISOString();
    const nouveau = !e.ligne;
    setEtat({ ...e, ligne: { mois, charges: complet.charges, salaires: complet.salaires, modifie_par: auteur, modifie_le: quand } });
    setStatut('Enregistrement…');
    const envoi = nouveau ? complet : maj;
    file.current = file.current.then(async () => {
      try {
        await enregistrerMois(mois, envoi, auteur);
        const src = etatRef.current?.modele?.charges?.moisSource || etatRef.current?.modele?.salaires?.moisSource || '';
        if (!src || src <= mois) {
          const modele = { charges: { ...complet.charges, moisSource: mois }, salaires: { ...complet.salaires, moisSource: mois } };
          await enregistrerMois('modele', modele, auteur);
          if (etatRef.current) setEtat({ ...etatRef.current, modele: { mois: 'modele', ...modele } });
        }
        setStatut(`Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
        setErreur(null);
      } catch (err: any) {
        setStatut('');
        setErreur(`Non enregistré : ${err?.message || err}`);
      }
    });
  };
  const changerCharges = (f: (c: ChargesMois, l: LigneCharge[]) => ChargesMois) => modifier(a => ({ charges: f({ ...a.charges, lignes: a.lignes }, a.lignes) }));
  const changerSalaires = (f: (s: SalairesMois) => SalairesMois) => modifier(a => ({ salaires: f(a.salaires) }));
  const setCase = (ligneId: string, colId: string, champ: 'ref' | 'montant', v: string | number | null) => changerCharges(c => {
    const cases = { ...c.cases, [ligneId]: { ...(c.cases[ligneId] || {}) } };
    const cell = { ...(cases[ligneId][colId] || {}) };
    if (v === null || v === '') delete cell[champ]; else (cell as any)[champ] = v;
    cases[ligneId][colId] = cell;
    return { ...c, cases };
  });
  const setEmploye = (id: string, champs: Partial<Employe>) => changerSalaires(s => ({ ...s, employes: s.employes.map(x => (x.id === id ? { ...x, ...champs } : x)) }));

  const importer = async (fichier: File | undefined, type: 'charges' | 'salaires') => {
    if (!fichier) return;
    try {
      const tableau = await lireTableur(fichier);
      if (type === 'salaires') {
        let res: ReturnType<typeof importerSalaires> | null = null;
        modifier(a => { res = importerSalaires(tableau, a.salaires); return { salaires: res.salaires }; });
        const r = res as ReturnType<typeof importerSalaires> | null;
        setMessage(r ? `Fichier « ${fichier.name} » : ${r.ajoutes} employé(s) ajouté(s), ${r.misAJour} mis à jour.` : '');
      } else {
        let res: ReturnType<typeof importerCharges> | null = null;
        modifier(a => { res = importerCharges(tableau, { ...a.charges, lignes: a.lignes }, a.lignes); return { charges: res.charges }; });
        const r = res as ReturnType<typeof importerCharges> | null;
        setMessage(r ? `Fichier « ${fichier.name} » : ${r.cases} case(s) remplie(s)${r.lignesAjoutees.length ? ` ; lignes ajoutées : ${r.lignesAjoutees.join(', ')}` : ''}${r.colonnesAjoutees.length ? ` ; charges ajoutées : ${r.colonnesAjoutees.join(', ')}` : ''}.` : '');
      }
    } catch (e: any) {
      setMessage(`Import impossible : ${e?.message || e}`);
    }
  };
  const exporter = async (type: 'charges' | 'salaires') => {
    if (!charges || !salaires) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const aoa = type === 'charges' ? tableauCharges(charges, lignes) : tableauSalaires(salaires);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), type === 'charges' ? 'Charges' : 'Salaires');
    XLSX.writeFile(wb, `${type === 'charges' ? 'Charges' : 'Salaires'}_${mois}.xlsx`);
  };
  const titreCharges = `CHARGES DU MOIS — ${libelleMois(mois)}`;
  const titreSalaires = `FICHE SALARIALE ${tenant} — ${libelleMois(mois)}`;
  /** Impression comme une facture de vente : en-tête de l'enseigne avec le logo. */
  const imprimer = async () => {
    if (!charges || !salaires) return;
    // En-tête chargé seulement à l'impression (module des documents d'OPTICLAIRE).
    const { printHeaderHTML } = await import('../../../utils/documentHeader');
    const quand = etat?.ligne?.modifie_le ? new Date(etat.ligne.modifie_le) : null;
    const infos = {
      entete: printHeaderHTML(),
      mois: libelleMois(mois),
      editePar: getCurrentUser(),
      modifie: etat?.ligne?.modifie_par
        ? `${etat.ligne.modifie_par}${quand && !Number.isNaN(quand.getTime()) ? `, le ${quand.toLocaleDateString('fr-FR')}` : ''}`
        : undefined,
    };
    if (vue === 'charges') imprimerDocument(htmlCharges(charges, lignes, infos), titreCharges);
    else imprimerDocument(htmlSalaires(salaires, infos), titreSalaires);
  };

  const quandModifie = etat?.ligne?.modifie_le ? new Date(etat.ligne.modifie_le) : null;
  const infoMois = !etat ? '' : etat.ligne
    ? `Modifié${etat.ligne.modifie_par ? ` par ${etat.ligne.modifie_par}` : ''}${quandModifie && !Number.isNaN(quandModifie.getTime()) ? ` le ${quandModifie.toLocaleDateString('fr-FR')} à ${quandModifie.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
    : moisModele ? `Tout est repris de ${libelleMois(moisModele)} (officines, références et montants des charges, employés, salaires et emprunts) : modifiez seulement ce qui change ce mois-ci.` : 'Mois pas encore enregistré.';

  return (
    <div className="flex flex-col gap-4" data-testid="charges-salaires">
      {/* Mois */}
      <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-2 flex-wrap">
        <button type="button" data-sans-anti-double onClick={() => onMois(ajouterMois(mois, -1))} className="px-2 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50" title="Mois précédent" aria-label="Mois précédent"><ChevronLeft size={16} /></button>
        <input type="month" className="border border-gray-300 rounded px-2 py-1.5 text-sm" value={mois} onChange={e => estMois(e.target.value) && onMois(e.target.value)} aria-label="Mois" data-testid="charges-mois" />
        <button type="button" data-sans-anti-double onClick={() => onMois(ajouterMois(mois, 1))} className="px-2 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50" title="Mois suivant" aria-label="Mois suivant"><ChevronRight size={16} /></button>
        <button type="button" data-sans-anti-double onClick={() => onMois(moisCourant())} className="px-2 py-1.5 rounded border border-gray-300 text-xs hover:bg-gray-50">Ce mois-ci</button>
        <span className="text-sm font-semibold text-gray-700">{libelleMois(mois)}</span>
        <div className="flex items-center gap-1 flex-wrap" style={{ marginLeft: 'auto' }} role="tablist">
          {([['charges', 'Charges du mois'], ['salaires', 'Salaires des employés']] as const).map(([id, lib]) => (
            <button key={id} type="button" role="tab" aria-selected={vue === id} data-sans-anti-double data-testid={`charges-vue-${id}`} onClick={() => setVue(id)}
              className="px-3 py-1.5 rounded text-sm font-semibold" style={vue === id ? { backgroundColor: '#0d9488', color: '#fff' } : { color: '#475569', border: '1px solid #d1d5db' }}>
              {lib}
            </button>
          ))}
          <button type="button" onClick={() => void imprimer()} disabled={!etat} data-testid="charges-imprimer" className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: '#475569' }}>
            <Printer size={15} /> Imprimer
          </button>
        </div>
      </div>

      {erreur && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }} data-testid="charges-erreur">
          {erreur}
          {!absente && <button type="button" data-sans-anti-double className="ml-2 underline" onClick={() => void charger()}>Réessayer</button>}
        </div>
      )}

      {!etat && !erreur && <div className="bg-white rounded-lg shadow-sm p-6 text-sm text-gray-500 text-center">Chargement…</div>}

      {etat && charges && salaires && totC && totS && (
        <>
          <div className="text-xs text-gray-500 px-1" data-testid="charges-info">
            {infoMois}{statut && <> · <span data-testid="charges-statut">{statut}</span></>}
            {' · '}<button type="button" data-sans-anti-double className="underline" title="Relire le mois (modifications faites sur un autre poste)" onClick={() => { void file.current.then(charger); }}>Actualiser</button>
            {message && <div className="mt-1" style={{ color: '#065F46' }} data-testid="charges-message">{message}</div>}
          </div>

          {vue === 'charges' ? (
            <div className="bg-white rounded-lg shadow-sm p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-800">{titreCharges}</span>
                {editable && (
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginLeft: 'auto' }}>
                    <BoutonAjouter testId="charges-ajouter-ligne" onClick={() => changerCharges(c => {
                      const l = [...c.lignes]; const iBas = l.findIndex(x => x.bas);
                      const n = { id: nouvelId('ln'), nom: 'NOUVELLE LIGNE' };
                      if (iBas === -1) l.push(n); else l.splice(iBas, 0, n);
                      return { ...c, lignes: l };
                    })}>+ Ajouter une ligne</BoutonAjouter>
                    <BoutonAjouter testId="charges-ajouter-colonne" onClick={() => changerCharges(c => ({
                      ...c, colonnes: [...c.colonnes, { id: nouvelId('ch'), nom: 'NOUVELLE CHARGE', reference: true, couleur: COULEURS_NOUVELLES_CHARGES[c.colonnes.length % COULEURS_NOUVELLES_CHARGES.length] }],
                    }))}>+ Ajouter une charge</BoutonAjouter>
                    <button type="button" data-sans-anti-double className={bouton} onClick={() => fichierCharges.current?.click()}>↑ Importer (Excel / CSV)</button>
                    <input ref={fichierCharges} type="file" accept=".xlsx,.xls,.csv,.txt,.ods" hidden data-testid="charges-fichier" onChange={e => { void importer(e.target.files?.[0], 'charges'); e.target.value = ''; }} />
                  </div>
                )}
                <button type="button" data-sans-anti-double className={bouton} style={editable ? undefined : { marginLeft: 'auto' }} onClick={() => void exporter('charges')}>↓ Excel</button>
              </div>
              <div className="overflow-x-auto">
                <table className="no-mobile-scroll" style={{ borderCollapse: 'collapse', width: '100%' }} data-testid="charges-tableau">
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ ...cellule, background: '#F2F2F2', fontSize: 13, fontWeight: 800, minWidth: 110 }}>OFFICINES</th>
                      {charges.colonnes.map((col, ci) => (
                        <th key={col.id} colSpan={col.reference ? 2 : 1} style={{ ...cellule, background: col.couleur, color: texteSur(col.couleur), fontWeight: 800 }}>
                          <NomModifiable valeur={col.nom} lectureSeule={!editable} style={{ textAlign: 'center', fontWeight: 800, fontSize: 14 }} testId="charges-colonne-nom"
                            onChange={nom => changerCharges(c => ({ ...c, colonnes: c.colonnes.map(x => (x.id === col.id ? { ...x, nom } : x)) }))} />
                          {editable && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 400 }}>
                              <PetitBouton titre="Déplacer à gauche" onClick={() => changerCharges(c => ({ ...c, colonnes: deplacer(c.colonnes, ci, -1) }))}>◀</PetitBouton>
                              <PetitBouton titre="Déplacer à droite" onClick={() => changerCharges(c => ({ ...c, colonnes: deplacer(c.colonnes, ci, 1) }))}>▶</PetitBouton>
                              <label className="text-[10px]" style={{ display: 'flex', alignItems: 'center', gap: 2 }} title="Colonne RÉFÉRENCE (numéro de compteur, de contrat…)">
                                <input type="checkbox" checked={col.reference} onChange={e => changerCharges(c => ({ ...c, colonnes: c.colonnes.map(x => (x.id === col.id ? { ...x, reference: e.target.checked } : x)) }))} /> réf.
                              </label>
                              <PetitBouton titre="Retirer la colonne" onClick={() => { if (window.confirm(`Retirer la colonne « ${col.nom} » ?`)) changerCharges(c => ({ ...c, colonnes: c.colonnes.filter(x => x.id !== col.id) })); }}>✕</PetitBouton>
                            </div>
                          )}
                        </th>
                      ))}
                      {editable && <th rowSpan={2} style={{ border: 0 }} />}
                    </tr>
                    <tr>
                      {charges.colonnes.flatMap(col => [
                        ...(col.reference ? [<th key={col.id + 'r'} style={{ ...cellule, background: col.couleur, fontSize: 10, fontWeight: 500, minWidth: 104 }}>RÉFÉRENCE</th>] : []),
                        <th key={col.id + 'm'} style={{ ...cellule, background: col.couleur, fontSize: 10, fontWeight: 500, minWidth: 86 }}>MONTANT</th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, li) => (
                      <tr key={l.id} data-testid="charges-ligne">
                        <td style={{ ...cellule, background: '#F2F2F2', fontWeight: 700 }}>
                          <NomModifiable valeur={l.nom} lectureSeule={!editable} style={{ textAlign: 'center', fontWeight: 700 }} testId="charges-ligne-nom"
                            onChange={nom => changerCharges((c, ls) => ({ ...c, lignes: ls.map(x => (x.id === l.id ? { ...x, nom } : x)) }))} />
                        </td>
                        {charges.colonnes.flatMap(col => {
                          const v = charges.cases[l.id]?.[col.id];
                          return [
                            ...(col.reference ? [
                              <td key={col.id + 'r'} style={{ ...cellule, background: col.couleur, padding: 1, fontSize: 12 }}>
                                <TexteCase valeur={v?.ref || ''} lectureSeule={!editable} onChange={t => setCase(l.id, col.id, 'ref', t)} testId="charges-ref" />
                              </td>,
                            ] : []),
                            <td key={col.id + 'm'} style={{ ...cellule, background: col.couleur, padding: 1 }}>
                              <ChampMontant valeur={Number(v?.montant) || 0} lectureSeule={!editable} onChange={x => setCase(l.id, col.id, 'montant', x)} testId="charges-montant" />
                            </td>,
                          ];
                        })}
                        {editable && (
                          <td style={{ padding: '0 0 0 4px', whiteSpace: 'nowrap' }}>
                            <PetitBouton titre="Monter" onClick={() => changerCharges((c, ls) => ({ ...c, lignes: deplacer(ls, li, -1) }))}>▲</PetitBouton>
                            <PetitBouton titre="Retirer la ligne" onClick={() => {
                              if (!window.confirm(`Retirer la ligne « ${l.nom} » ?`)) return;
                              changerCharges((c, ls) => ({ ...c, lignes: ls.filter(x => x.id !== l.id), retires: l.magasinId ? [...c.retires.filter(r => r !== l.magasinId), l.magasinId] : c.retires }));
                            }}>✕</PetitBouton>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...cellule, fontWeight: 800, borderTop: '2px solid #1f2937', background: '#F2F2F2' }}>TOTAL</td>
                      {charges.colonnes.map(col => (
                        <td key={col.id} colSpan={col.reference ? 2 : 1} style={{ ...cellule, fontWeight: 800, borderTop: '2px solid #1f2937', background: col.couleur }} data-testid="charges-total-colonne">{fmt(totC.parColonne[col.id])}</td>
                      ))}
                      {editable && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 flex-wrap" style={{ justifyContent: 'center' }}>
                <span className="text-sm font-bold px-4 py-2" style={{ background: '#D9D9D9', border: BORD }}>CHARGES TOTALES</span>
                <span className="text-xl font-extrabold px-4 py-1.5" style={{ background: '#D9D9D9', border: BORD }} data-testid="charges-totales">{fmt(totC.total)}</span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-800">{titreSalaires}</span>
                {editable && (
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginLeft: 'auto' }}>
                    <BoutonAjouter testId="salaires-ajouter" onClick={() => changerSalaires(s => ({ ...s, employes: [...s.employes, { id: nouvelId('emp'), nom: 'NOUVEL EMPLOYÉ', fonction: '', salaireBase: 0, emprunt: 0 }] }))}>+ Ajouter un employé</BoutonAjouter>
                    {totS.emprunt > 0 && (
                      <button type="button" data-sans-anti-double className={bouton} data-testid="salaires-emprunts-zero" onClick={() => {
                        if (!window.confirm(`Remettre à 0 les emprunts de tous les employés pour ${libelleMois(mois).toLowerCase()} ?`)) return;
                        changerSalaires(x => ({ ...x, employes: x.employes.map(y => ({ ...y, emprunt: 0 })) }));
                        setMessage('Emprunts remis à 0 pour ce mois.');
                      }}>Remettre les emprunts à 0</button>
                    )}
                    <button type="button" data-sans-anti-double className={bouton} onClick={() => fichierSalaires.current?.click()}>↑ Importer (Excel / CSV)</button>
                    <input ref={fichierSalaires} type="file" accept=".xlsx,.xls,.csv,.txt,.ods" hidden data-testid="salaires-fichier" onChange={e => { void importer(e.target.files?.[0], 'salaires'); e.target.value = ''; }} />
                    <button type="button" data-sans-anti-double className={bouton} data-testid="salaires-coller" onClick={() => setCollage(c => (c === null ? '' : null))}>Coller depuis Excel</button>
                  </div>
                )}
                <button type="button" data-sans-anti-double className={bouton} style={editable ? undefined : { marginLeft: 'auto' }} onClick={() => void exporter('salaires')}>↓ Excel</button>
              </div>
              {collage !== null && (
                <div className="flex flex-col gap-2 p-3 rounded" style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
                  <span className="text-xs text-gray-600">Dans Excel, sélectionnez les colonnes NOM, FONCTION, SALAIRE (et EMPRUNT si besoin), copiez, puis collez ici. Un employé déjà dans la liste (même nom) est mis à jour.</span>
                  <textarea className="border border-gray-300 rounded p-2 text-xs font-mono" rows={6} value={collage} onChange={e => setCollage(e.target.value)} data-testid="salaires-collage" />
                  <div className="flex gap-2">
                    <button type="button" data-sans-anti-double className="px-3 py-1.5 rounded text-xs font-semibold text-white" style={{ background: '#0d9488' }} data-testid="salaires-collage-valider" onClick={() => {
                      let res: ReturnType<typeof importerSalaires> | null = null;
                      modifier(a => { res = importerSalaires(lireCsv(collage || ''), a.salaires); return { salaires: res.salaires }; });
                      const r = res as ReturnType<typeof importerSalaires> | null;
                      setMessage(r ? `${r.ajoutes} employé(s) ajouté(s), ${r.misAJour} mis à jour.` : '');
                      setCollage(null);
                    }}>Ajouter à la liste</button>
                    <button type="button" data-sans-anti-double className={bouton} onClick={() => setCollage(null)}>Annuler</button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="no-mobile-scroll" style={{ borderCollapse: 'collapse', width: '100%' }} data-testid="salaires-tableau">
                  <thead>
                    <tr>
                      <th style={{ ...cellule, background: '#D9D9D9', width: 40 }}>N°</th>
                      <th style={{ ...cellule, background: '#D9D9D9', minWidth: 130 }}>NOM</th>
                      <th style={{ ...cellule, background: '#D9D9D9', minWidth: 150 }}>FONCTION</th>
                      <th style={{ ...cellule, background: '#00FF00', minWidth: 120 }}>SALAIRE DE BASE</th>
                      <th style={{ ...cellule, background: '#F8CBAD', minWidth: 110 }}>EMPRUNT</th>
                      <th style={{ ...cellule, background: '#92D050', minWidth: 120 }}>SALAIRE FINAL</th>
                      {editable && <th style={{ border: 0 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {salaires.employes.length === 0 && (
                      <tr><td colSpan={editable ? 7 : 6} style={{ ...cellule, color: '#6b7280', padding: 16, whiteSpace: 'normal' }}>
                        Aucun employé pour ce mois. Ajoutez-les un par un, importez votre fichier Excel (colonnes NOM, FONCTION, SALAIRE) ou collez-les depuis Excel.
                      </td></tr>
                    )}
                    {salaires.employes.map((x, i) => (
                      <tr key={x.id} data-testid="salaires-ligne">
                        <td style={{ ...cellule, background: '#F2F2F2', fontSize: 11 }}>{i + 1}</td>
                        <td style={{ ...cellule, background: '#F2F2F2', padding: 1 }}>
                          <TexteCase valeur={x.nom} lectureSeule={!editable} onChange={v => v && setEmploye(x.id, { nom: v })} style={{ fontWeight: 600 }} testId="salaires-nom" />
                        </td>
                        <td style={{ ...cellule, padding: 1 }}>
                          <TexteCase valeur={x.fonction} lectureSeule={!editable} onChange={v => setEmploye(x.id, { fonction: v })} testId="salaires-fonction" />
                        </td>
                        <td style={{ ...cellule, background: '#CCFFCC', padding: 1 }}>
                          <ChampMontant valeur={x.salaireBase} lectureSeule={!editable} onChange={v => setEmploye(x.id, { salaireBase: v ?? 0 })} testId="salaires-base" />
                        </td>
                        <td style={{ ...cellule, background: '#FCE4D6', padding: 1 }}>
                          <ChampMontant valeur={x.emprunt} lectureSeule={!editable} onChange={v => setEmploye(x.id, { emprunt: v ?? 0 })} testId="salaires-emprunt" />
                        </td>
                        <td style={{ ...cellule, background: '#E2EFDA', fontWeight: 800, color: salaireFinal(x) < 0 ? '#B91C1C' : undefined }} data-testid="salaires-final">{fmt(salaireFinal(x))}</td>
                        {editable && (
                          <td style={{ padding: '0 0 0 4px', whiteSpace: 'nowrap' }}>
                            <PetitBouton titre="Monter" onClick={() => changerSalaires(s => ({ ...s, employes: deplacer(s.employes, i, -1) }))}>▲</PetitBouton>
                            <PetitBouton titre="Retirer l'employé" onClick={() => { if (window.confirm(`Retirer ${x.nom} de la fiche de ${libelleMois(mois).toLowerCase()} ?`)) changerSalaires(s => ({ ...s, employes: s.employes.filter(y => y.id !== x.id) })); }}>✕</PetitBouton>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ ...cellule, background: '#C00000', color: '#fff', fontWeight: 800, fontSize: 15, borderTop: '2px solid #1f2937' }}>TOTAL ({salaires.employes.length} employé{salaires.employes.length > 1 ? 's' : ''})</td>
                      <td style={{ ...cellule, background: '#00FF00', fontWeight: 800, fontSize: 15, borderTop: '2px solid #1f2937' }} data-testid="salaires-total-base">{fmt(totS.base)}</td>
                      <td style={{ ...cellule, background: '#F8CBAD', fontWeight: 800, fontSize: 15, borderTop: '2px solid #1f2937' }} data-testid="salaires-total-emprunt">{fmt(totS.emprunt)}</td>
                      <td style={{ ...cellule, background: '#92D050', fontWeight: 800, fontSize: 15, borderTop: '2px solid #1f2937' }} data-testid="salaires-total-final">{fmt(totS.final)}</td>
                      {editable && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

