/**
 * Onglet « Point hebdomadaire » de la page Mouvement : RECETTES de chaque
 * officine, jour par jour, récapitulatif des entrées (montant déposé) et
 * recette assurance — comme le point papier. Les recettes se remplissent
 * seules avec les encaissements d'OPTICLAIRE (rien qui vienne d'une
 * assurance) ; la recette assurance se tape à la main ; toute case reste
 * modifiable ; on peut ajouter des officines, des lignes et des assurances ;
 * impression A4.
 */
import { useMemo, type CSSProperties } from 'react';
import { useLiveData } from '../../../hooks/useLiveData';
import { addCreateAudit, addUpdateAudit } from '../../../utils/auditUtils';
import type { VenteSupabase } from '../../../services/ventesService';
import {
  JOURS_POINT, CLE_POINT_HEBDO, CLE_MODELE_HEBDO, CLE_POINT_MOBILE, CLE_MODELE_MOBILE,
  ajouterJours, blocsEffectifs, calculerHebdo, calculerMobile, jourMois, libelleSemaine,
  modeleHebdoDefaut, modeleMobileDefaut, normaliserDocHebdo, normaliserDocMobile, nouvelId,
  type DocHebdo, type DocMobile, type DonneesSemaine, type ModeleHebdo, type ModeleMobile, type MouvementAdministrationRecap, type Operation,
} from '../../../utils/pointsSemaine';
import { BarreSemaine, BoutonAjouter, ChampMontant, NomModifiable, PetitBouton, TitrePoint, deplacer, echapper, fmt, ligneAudit, useDonneesPoints } from './pointsCommun';
import { htmlPointHebdo, imprimer } from './pointsImpression';

const BORD = '1px solid #1f2937';
const cellule: CSSProperties = { border: BORD, padding: '3px 4px', fontSize: 12, textAlign: 'center' };
const BLEU = '#8EA9DB';

type ElementModele<M> = { id: string; modele: M };

export function PointHebdomadaire({ semaine, onSemaine, ventes, ventesChargees, mouvementsAdministration, editable }: {
  semaine: string; onSemaine: (s: string) => void;
  ventes: VenteSupabase[]; ventesChargees: boolean; mouvementsAdministration: MouvementAdministrationRecap[]; editable: boolean;
}) {
  const { donnees, pret } = useDonneesPoints(semaine, ventes, mouvementsAdministration);
  // `key` : chaque semaine a sa propre donnée enregistrée (rien ne déborde d'une semaine à l'autre).
  return <SemaineHebdo key={semaine} semaine={semaine} onSemaine={onSemaine} donnees={donnees} pret={pret && ventesChargees} editable={editable} />;
}

function SemaineHebdo({ semaine, onSemaine, donnees, pret, editable }: {
  semaine: string; onSemaine: (s: string) => void; donnees: DonneesSemaine; pret: boolean; editable: boolean;
}) {
  const [docs, setDocs] = useLiveData<DocHebdo>(CLE_POINT_HEBDO(semaine), []);
  const [modeles, setModeles] = useLiveData<ElementModele<ModeleHebdo>>(CLE_MODELE_HEBDO, []);
  const [docsMobile] = useLiveData<DocMobile>(CLE_POINT_MOBILE(semaine), []);
  const [modelesMobile] = useLiveData<ElementModele<ModeleMobile>>(CLE_MODELE_MOBILE, []);
  const { magasins, tenant } = donnees;

  const enregistre = docs.find(d => d && d.semaine === semaine);
  const doc = useMemo(() => {
    const defaut = modeleHebdoDefaut(magasins, tenant);
    const modele = normaliserDocHebdo({ modele: modeles[0]?.modele } as Partial<DocHebdo>, semaine, defaut).modele;
    return normaliserDocHebdo(enregistre, semaine, modele);
  }, [enregistre, modeles, magasins, tenant, semaine]);
  const vueMobile = useMemo(() => {
    const defaut = modeleMobileDefaut(magasins, tenant);
    const modele = normaliserDocMobile({ modele: modelesMobile[0]?.modele } as Partial<DocMobile>, semaine, defaut).modele;
    return calculerMobile(normaliserDocMobile(docsMobile.find(d => d && d.semaine === semaine), semaine, modele), donnees);
  }, [docsMobile, modelesMobile, magasins, tenant, semaine, donnees]);
  const vue = useMemo(() => calculerHebdo(doc, donnees, { orange: vueMobile.parCle.orange, wave: vueMobile.parCle.wave, tpe: vueMobile.parCle.tpe }), [doc, donnees, vueMobile]);
  const titre = doc.titre || `POINT HEBDOMADAIRE ${libelleSemaine(semaine, 6)}`;

  /** Enregistre la semaine (créée au premier changement avec le modèle du moment). */
  const enregistrer = (maj: (d: DocHebdo) => DocHebdo, modeleAussi = false) => {
    if (!editable) return;
    const base: DocHebdo = { ...doc, modele: { ...doc.modele, blocs: blocsEffectifs(doc.modele, magasins, tenant) } };
    const suivant = maj(base);
    const audite = enregistre ? addUpdateAudit(suivant) : addCreateAudit(suivant);
    setDocs([audite]);
    if (modeleAussi) setModeles([{ id: 'modele', modele: audite.modele }]);
  };
  const changerModele = (f: (m: ModeleHebdo) => ModeleHebdo) => enregistrer(d => ({ ...d, modele: f(d.modele) }), true);
  const changerValeurs = (f: (v: DocHebdo['valeurs']) => DocHebdo['valeurs']) => enregistrer(d => ({ ...d, valeurs: f(d.valeurs) }));

  const setCase = (blocId: string, j: number, v: number | null) => changerValeurs(val => {
    const t = { ...(val.cases[blocId] || {}) };
    if (v === null) delete t[j]; else t[j] = v;
    return { ...val, cases: { ...val.cases, [blocId]: t } };
  });
  const setRecap = (id: string, v: number | null) => changerValeurs(val => {
    const r = { ...val.recap };
    if (v === null) delete r[id]; else r[id] = v;
    return { ...val, recap: r };
  });
  const setAssManuelle = (colId: string, index: number, v: number | null) => changerValeurs(val => {
    const l = [...(val.assurancesManuelles[colId] || [])];
    l[index] = v ?? 0;
    return { ...val, assurancesManuelles: { ...val.assurancesManuelles, [colId]: l } };
  });
  const retirerAssManuelle = (colId: string, index: number) => changerValeurs(val => ({
    ...val, assurancesManuelles: { ...val.assurancesManuelles, [colId]: (val.assurancesManuelles[colId] || []).filter((_, i) => i !== index) },
  }));

  const retires = doc.modele.retires
    .map(id => magasins.find(m => m.id.toUpperCase() === String(id).toUpperCase()))
    .filter((m): m is NonNullable<typeof m> => !!m);

  const lancerImpression = () => {
    const pied = `Imprimé le ${new Date().toLocaleDateString('fr-FR')} — ${ligneAudit(enregistre)}`;
    imprimer(htmlPointHebdo(vue, titre, pied), echapper(titre));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="point-hebdo">
      <BarreSemaine
        semaine={semaine}
        onSemaine={onSemaine}
        onImprimer={lancerImpression}
        enfants={editable ? <BoutonAjouter testId="point-ajouter-officine" onClick={() => changerModele(m => ({ ...m, blocs: [...m.blocs, { id: nouvelId('bloc'), nom: 'NOUVELLE OFFICINE' }] }))}>+ Ajouter une officine</BoutonAjouter> : undefined}
      />

      <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex flex-col gap-1">
        <TitrePoint titre={titre} editable={editable} onChange={t => enregistrer(d => ({ ...d, titre: t }))} />
        <p className="text-xs text-gray-500" style={{ textAlign: 'center' }}>
          Recettes remplies automatiquement avec les encaissements d’OPTICLAIRE (acomptes, règlements clients, entrées), sans rien qui vienne des assurances. Recette assurance : à taper.
          {editable ? ' Cliquez sur un montant pour le changer ; videz la case pour revenir au calcul. En jaune : modifié à la main.' : ' Lecture seule.'}
          {' À l’impression, seules les officines qui ont des recettes dans la semaine sont imprimées.'}
          {!pret && ' — Chargement des ventes et règlements…'}
        </p>
        <p className="text-xs text-gray-400" style={{ textAlign: 'center' }} data-testid="point-audit">{ligneAudit(enregistre)}</p>
      </div>

      {/* Officines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {vue.blocs.map((b, bi) => (
          <div key={b.bloc.id} className="bg-white" style={{ border: '2px solid #1f2937' }} data-testid="point-officine">
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '2px solid #1f2937', padding: '4px 4px', fontWeight: 700, fontSize: 13 }}>
              {editable && <PetitBouton titre="Déplacer à gauche" onClick={() => changerModele(m => ({ ...m, blocs: deplacer(m.blocs, bi, -1) }))}>◀</PetitBouton>}
              <NomModifiable valeur={b.bloc.nom} lectureSeule={!editable} onChange={nom => changerModele(m => ({ ...m, blocs: m.blocs.map(x => x.id === b.bloc.id ? { ...x, nom } : x) }))} style={{ textAlign: 'center', fontWeight: 700 }} testId="point-officine-nom" />
              {editable && <PetitBouton titre="Déplacer à droite" onClick={() => changerModele(m => ({ ...m, blocs: deplacer(m.blocs, bi, 1) }))}>▶</PetitBouton>}
              {editable && (
                <PetitBouton titre="Retirer du point" testId="point-officine-retirer" onClick={() => {
                  if (!window.confirm(`Retirer « ${b.bloc.nom} » du point ?${b.bloc.magasinId ? ' (il pourra être remis)' : ''}`)) return;
                  changerModele(m => ({
                    ...m,
                    blocs: m.blocs.filter(x => x.id !== b.bloc.id),
                    retires: b.bloc.magasinId ? [...m.retires.filter(r => r !== b.bloc.magasinId), b.bloc.magasinId] : m.retires,
                  }));
                }}>✕</PetitBouton>
              )}
            </div>
            <table className="no-mobile-scroll" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...cellule, fontSize: 11, width: '44%' }}>JOURS</th>
                  <th style={{ ...cellule, fontSize: 11, background: BLEU }}>RECETTES</th>
                </tr>
              </thead>
              <tbody>
                {JOURS_POINT.map((jour, j) => (
                  <tr key={jour}>
                    <td style={{ ...cellule, fontSize: 10, lineHeight: 1.1 }}>
                      {jour}<span style={{ display: 'block', fontSize: 9, color: '#6b7280' }}>{jourMois(ajouterJours(semaine, j))}</span>
                    </td>
                    <td style={{ ...cellule, background: BLEU, padding: 1 }}>
                      <ChampMontant
                        valeur={b.cases[j].valeur}
                        auto={b.cases[j].auto}
                        modifie={b.cases[j].modifie}
                        lectureSeule={!editable}
                        onChange={v => setCase(b.bloc.id, j, v)}
                        style={{ fontSize: 14 }}
                        testId="point-recette"
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cellule, fontWeight: 700, borderTop: '2px solid #1f2937' }}>TOTAL</td>
                  <td style={{ ...cellule, fontWeight: 700, fontSize: 15, background: BLEU, borderTop: '2px solid #1f2937' }} data-testid="point-officine-total">{fmt(b.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {editable && retires.length > 0 && (
        <p className="text-xs text-gray-500">
          Retiré{retires.length > 1 ? 's' : ''} du point :{' '}
          {retires.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ', '}
              {m.label}{' '}
              <button type="button" data-sans-anti-double className="underline text-blue-600" onClick={() => changerModele(mo => ({ ...mo, retires: mo.retires.filter(r => String(r).toUpperCase() !== m.id.toUpperCase()) }))}>remettre</button>
            </span>
          ))}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Récapitulatif des entrées */}
        <div className="bg-white rounded-lg shadow-sm p-4" data-testid="point-recap">
          <table className="no-mobile-scroll" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th colSpan={editable ? 3 : 2} style={{ background: '#D6DCE4', padding: '5px 4px', fontSize: 13 }}>RÉCAPITULATIF DES ENTRÉES</th></tr>
            </thead>
            <tbody>
              {vue.recap.map((r, ri) => (
                <tr key={r.ligne.id} data-testid="point-recap-ligne">
                  <td style={{ ...cellule, background: '#D0CECE', fontWeight: 700, fontSize: 11 }}>
                    <NomModifiable valeur={r.ligne.libelle} lectureSeule={!editable} style={{ textAlign: 'center', fontWeight: 700 }} onChange={libelle => changerModele(m => ({ ...m, recap: m.recap.map(x => x.id === r.ligne.id ? { ...x, libelle } : x) }))} />
                  </td>
                  <td style={{ ...cellule, width: '32%', padding: 1 }}>
                    <ChampMontant valeur={r.valeur} auto={r.auto} modifie={r.modifie} lectureSeule={!editable} onChange={v => setRecap(r.ligne.id, v)} style={{ fontSize: 14 }} testId="point-recap-montant" />
                  </td>
                  {editable && (
                    <td style={{ padding: '0 0 0 4px', whiteSpace: 'nowrap', width: 1 }}>
                      <select
                        value={r.ligne.operation}
                        onChange={e => changerModele(m => ({ ...m, recap: m.recap.map(x => x.id === r.ligne.id ? { ...x, operation: e.target.value as Operation } : x) }))}
                        className="border border-gray-300 rounded text-xs px-1 py-0.5"
                        title="Effet sur le montant déposé"
                        data-testid="point-recap-operation"
                      >
                        <option value="plus">+ ajouté</option>
                        <option value="moins">− retiré</option>
                        <option value="info">non compté</option>
                      </select>
                      <PetitBouton titre="Monter" onClick={() => changerModele(m => ({ ...m, recap: deplacer(m.recap, ri, -1) }))}>▲</PetitBouton>
                      <PetitBouton titre="Retirer la ligne" onClick={() => { if (window.confirm(`Retirer la ligne « ${r.ligne.libelle} » ?`)) changerModele(m => ({ ...m, recap: m.recap.filter(x => x.id !== r.ligne.id) })); }}>✕</PetitBouton>
                    </td>
                  )}
                </tr>
              ))}
              <tr><td colSpan={editable ? 3 : 2} style={{ height: 12 }} /></tr>
              <tr>
                <td style={{ ...cellule, background: '#D0CECE', fontWeight: 700, fontSize: 14 }}>MONTANT DÉPOSÉ</td>
                <td style={{ ...cellule, background: '#00B0F0', fontWeight: 800, fontSize: 18 }} data-testid="point-montant-depose">{fmt(vue.montantDepose)}</td>
                {editable && <td />}
              </tr>
            </tbody>
          </table>
          {editable && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <BoutonAjouter testId="point-ajouter-ligne-recap" onClick={() => changerModele(m => ({ ...m, recap: [...m.recap, { id: nouvelId('rc'), libelle: 'NOUVELLE LIGNE', source: 'manuel', operation: 'plus' }] }))}>+ Ajouter une ligne</BoutonAjouter>
              <span className="text-xs text-gray-500">Montant déposé = lignes « + ajouté » − lignes « − retiré ». Frais Wave et OM : 1 % des dépôts Orange Money + Wave du point Mobile Money.</span>
            </div>
          )}
        </div>

        {/* Recette assurance et sous-traitance */}
        <div className="bg-white rounded-lg shadow-sm p-4" data-testid="point-assurances">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {vue.assurances.map(a => {
              const st = !!a.colonne.sousTraitance;
              return (
                <div key={a.colonne.id} style={{ minWidth: 104, flex: '1 1 104px', maxWidth: 170 }} data-testid="point-assurance">
                  <div style={{ background: st ? '#ED7D31' : '#4472C4', color: st ? '#000' : '#fff', fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '3px 2px' }}>
                    {st ? 'SOUS-TRAITANCE' : 'RECETTE ASSURANCE'}
                  </div>
                  <table className="no-mobile-scroll" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ ...cellule, background: '#E7E6E6', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <NomModifiable valeur={a.colonne.nom} lectureSeule={!editable} style={{ textAlign: 'center', fontWeight: 700 }} testId="point-assurance-nom"
                              onChange={nom => changerModele(m => ({ ...m, assurances: m.assurances.map(x => x.id === a.colonne.id ? { ...x, nom } : x) }))} />
                            {editable && (
                              <PetitBouton titre="Retirer la colonne" onClick={() => { if (window.confirm(`Retirer la colonne « ${a.colonne.nom} » ?`)) changerModele(m => ({ ...m, assurances: m.assurances.filter(x => x.id !== a.colonne.id) })); }}>✕</PetitBouton>
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.lignes.map(l => (
                        <tr key={l.cle}>
                          <td style={{ ...cellule, padding: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <ChampMontant valeur={l.valeur} lectureSeule={!editable} onChange={v => setAssManuelle(a.colonne.id, l.index, v)} testId="point-assurance-montant" />
                              {editable && a.lignes.length > 1 && <PetitBouton titre="Retirer la ligne" onClick={() => retirerAssManuelle(a.colonne.id, l.index)}>✕</PetitBouton>}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!st && (
                        <tr><td style={{ ...cellule, background: '#2F5597', color: '#fff', fontWeight: 700, fontSize: 13 }} data-testid="point-assurance-total">{fmt(a.total)}</td></tr>
                      )}
                    </tbody>
                  </table>
                  {editable && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                      <BoutonAjouter testId="point-ajouter-montant-assurance" onClick={() => changerValeurs(val => {
                        const l = val.assurancesManuelles[a.colonne.id] || [];
                        return { ...val, assurancesManuelles: { ...val.assurancesManuelles, [a.colonne.id]: [...(l.length ? l : [0]), 0] } };
                      })}>+ montant</BoutonAjouter>
                      <label className="text-[11px] text-gray-600" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="checkbox" checked={st} onChange={e => changerModele(m => ({ ...m, assurances: m.assurances.map(x => x.id === a.colonne.id ? { ...x, sousTraitance: e.target.checked } : x) }))} />
                        sous-traitance (non comptée)
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {editable && <BoutonAjouter testId="point-ajouter-assurance" onClick={() => changerModele(m => ({ ...m, assurances: [...m.assurances, { id: nouvelId('ass'), nom: 'NOUVELLE ASSURANCE' }] }))}>+ Ajouter une assurance</BoutonAjouter>}
            <span className="text-xs text-gray-500">
              Recettes assurances : <b data-testid="point-total-assurances">{fmt(vue.totalAssurances)}</b>
              {vue.totalSousTraitance ? <> · sous-traitance (non comptée) : {fmt(vue.totalSousTraitance)}</> : null}
              {' '}— montants tapés ici (les règlements d’assurance enregistrés dans OPTICLAIRE ne sont pas repris).
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
