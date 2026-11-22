/**
 * Onglet « Point Mobile Money » de la page Mouvement : tous les dépôts reçus
 * dans la semaine, jour par jour et magasin par magasin — d'abord le tableau
 * global (avec le total par jour et la part Orange Money / Wave / TPE), puis
 * un tableau par moyen de paiement — comme le point papier. Rempli seul avec
 * les encaissements d'OPTICLAIRE ; toute case reste modifiable ; on peut
 * ajouter des colonnes et des moyens de paiement ; impression A4 paysage.
 */
import { useMemo, type CSSProperties } from 'react';
import { useLiveData } from '../../../hooks/useLiveData';
import { addCreateAudit, addUpdateAudit } from '../../../utils/auditUtils';
import type { VenteSupabase } from '../../../services/ventesService';
import {
  JOURS_POINT, CLE_POINT_MOBILE, CLE_MODELE_MOBILE, COULEURS_COLONNES,
  calculerMobile, colonnesEffectives, libelleSemaine, modeleMobileDefaut, normaliserDocMobile, nouvelId, texteSur,
  type DocMobile, type DonneesSemaine, type ModeleMobile, type MouvementAdministrationRecap, type Moyen,
} from '../../../utils/pointsSemaine';
import { BarreSemaine, BoutonAjouter, ChampMontant, NomModifiable, PetitBouton, TitrePoint, deplacer, echapper, fmt, ligneAudit, useDonneesPoints } from './pointsCommun';
import { htmlPointMobile, imprimer } from './pointsImpression';

const BORD = '1px solid #1f2937';
const cellule: CSSProperties = { border: BORD, padding: '3px 4px', fontSize: 13, textAlign: 'center', whiteSpace: 'nowrap' };
const couleurColonne = (i: number) => COULEURS_COLONNES[i % COULEURS_COLONNES.length];
const COULEURS_NOUVEAUX = ['#70AD47', '#7030A0', '#C00000', '#FFC000', '#00B050', '#5B9BD5'];

type ElementModele<M> = { id: string; modele: M };

export function PointMobileMoney({ semaine, onSemaine, ventes, ventesChargees, mouvementsAdministration, editable }: {
  semaine: string; onSemaine: (s: string) => void;
  ventes: VenteSupabase[]; ventesChargees: boolean; mouvementsAdministration: MouvementAdministrationRecap[]; editable: boolean;
}) {
  const { donnees, pret } = useDonneesPoints(semaine, ventes, mouvementsAdministration);
  return <SemaineMobile key={semaine} semaine={semaine} onSemaine={onSemaine} donnees={donnees} pret={pret && ventesChargees} editable={editable} />;
}

function SemaineMobile({ semaine, onSemaine, donnees, pret, editable }: {
  semaine: string; onSemaine: (s: string) => void; donnees: DonneesSemaine; pret: boolean; editable: boolean;
}) {
  const [docs, setDocs] = useLiveData<DocMobile>(CLE_POINT_MOBILE(semaine), []);
  const [modeles, setModeles] = useLiveData<ElementModele<ModeleMobile>>(CLE_MODELE_MOBILE, []);
  const { magasins, tenant } = donnees;

  const enregistre = docs.find(d => d && d.semaine === semaine);
  const doc = useMemo(() => {
    const defaut = modeleMobileDefaut(magasins, tenant);
    const modele = normaliserDocMobile({ modele: modeles[0]?.modele } as Partial<DocMobile>, semaine, defaut).modele;
    return normaliserDocMobile(enregistre, semaine, modele);
  }, [enregistre, modeles, magasins, tenant, semaine]);
  const vue = useMemo(() => calculerMobile(doc, donnees), [doc, donnees]);
  const titre = doc.titre || `POINT MOBILE MONEY ${libelleSemaine(semaine, vue.jours.length)}`;

  const enregistrer = (maj: (d: DocMobile) => DocMobile, modeleAussi = false) => {
    if (!editable) return;
    const base: DocMobile = { ...doc, modele: { ...doc.modele, colonnes: colonnesEffectives(doc.modele, magasins, tenant) } };
    const suivant = maj(base);
    const audite = enregistre ? addUpdateAudit(suivant) : addCreateAudit(suivant);
    setDocs([audite]);
    if (modeleAussi) setModeles([{ id: 'modele', modele: audite.modele }]);
  };
  const changerModele = (f: (m: ModeleMobile) => ModeleMobile) => enregistrer(d => ({ ...d, modele: f(d.modele) }), true);
  const avecMoyen = (m: ModeleMobile, moyen: Moyen) => (m.moyens.some(x => x.id === moyen.id) ? m : { ...m, moyens: [...m.moyens, moyen] });
  const setCase = (moyenId: string, colId: string, j: number, v: number | null) => enregistrer(d => {
    const parCol = { ...(d.valeurs.cases[moyenId] || {}) };
    const t = { ...(parCol[colId] || {}) };
    if (v === null) delete t[j]; else t[j] = v;
    parCol[colId] = t;
    return { ...d, valeurs: { cases: { ...d.valeurs.cases, [moyenId]: parCol } } };
  });

  const retires = doc.modele.retires
    .map(id => magasins.find(m => m.id.toUpperCase() === String(id).toUpperCase()))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const nonPrecise = vue.moyens.find(m => m.moyen.cle === 'mobile' && m.total !== 0);

  const lancerImpression = () => {
    const pied = `Imprimé le ${new Date().toLocaleDateString('fr-FR')} — ${ligneAudit(enregistre)}`;
    imprimer(htmlPointMobile(vue, titre, pied), echapper(titre));
  };

  const enTeteColonne = (c: typeof vue.colonnes[number], ci: number) => (
    <th key={c.id} style={{ ...cellule, background: couleurColonne(ci), color: texteSur(couleurColonne(ci)), fontSize: 11, fontWeight: 600 }}>
      <NomModifiable valeur={c.nom} lectureSeule={!editable} style={{ textAlign: 'center', fontWeight: 700, width: `${Math.ceil(c.nom.length * 1.15) + 1}ch`, display: 'block', margin: '0 auto' }} testId="point-colonne-nom"
        onChange={nom => changerModele(m => ({ ...m, colonnes: m.colonnes.map(x => x.id === c.id ? { ...x, nom } : x) }))} />
      {editable && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
        <PetitBouton titre="Déplacer à gauche" onClick={() => changerModele(m => ({ ...m, colonnes: deplacer(m.colonnes, ci, -1) }))}>◀</PetitBouton>
        <PetitBouton titre="Déplacer à droite" onClick={() => changerModele(m => ({ ...m, colonnes: deplacer(m.colonnes, ci, 1) }))}>▶</PetitBouton>
        {(
          <PetitBouton titre="Retirer la colonne" testId="point-colonne-retirer" onClick={() => {
            if (!window.confirm(`Retirer la colonne « ${c.nom} » ?${c.magasinId ? ' (elle pourra être remise)' : ''}`)) return;
            changerModele(m => ({
              ...m,
              colonnes: m.colonnes.filter(x => x.id !== c.id),
              retires: c.magasinId ? [...m.retires.filter(r => r !== c.magasinId), c.magasinId] : m.retires,
            }));
          }}>✕</PetitBouton>
        )}
      </div>
      )}
    </th>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="point-mobile">
      <BarreSemaine
        semaine={semaine}
        onSemaine={onSemaine}
        onImprimer={lancerImpression}
        enfants={editable ? (
          <>
            <label className="text-xs text-gray-600 flex items-center gap-1">
              <input type="checkbox" checked={doc.modele.dimanche} onChange={e => changerModele(m => ({ ...m, dimanche: e.target.checked }))} data-testid="point-dimanche" /> Dimanche
            </label>
            <BoutonAjouter testId="point-ajouter-colonne" onClick={() => changerModele(m => ({ ...m, colonnes: [...m.colonnes, { id: nouvelId('col'), nom: 'NOUVELLE COLONNE' }] }))}>+ Ajouter une colonne</BoutonAjouter>
            <BoutonAjouter testId="point-ajouter-moyen" onClick={() => changerModele(m => ({
              ...m, moyens: [...m.moyens, { id: nouvelId('moy'), nom: 'NOUVEAU MOYEN', couleur: COULEURS_NOUVEAUX[m.moyens.length % COULEURS_NOUVEAUX.length] }],
            }))}>+ Ajouter un moyen de paiement</BoutonAjouter>
          </>
        ) : undefined}
      />

      <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex flex-col gap-1">
        <TitrePoint titre={titre} editable={editable} onChange={t => enregistrer(d => ({ ...d, titre: t }))} />
        <p className="text-xs text-gray-500" style={{ textAlign: 'center' }}>
          Rempli automatiquement avec les encaissements d’OPTICLAIRE (acomptes, règlements, entrées) payés par Orange Money, Wave, carte (TPE / Visa)…
          {editable ? ' Cliquez sur un montant pour le changer ; videz la case pour revenir au calcul. En jaune : modifié à la main.' : ' Lecture seule.'}
          {!pret && ' — Chargement des ventes et règlements…'}
        </p>
        <p className="text-xs text-gray-400" style={{ textAlign: 'center' }} data-testid="point-audit">{ligneAudit(enregistre)}</p>
        {nonPrecise && (
          <p className="text-xs" style={{ textAlign: 'center', color: '#92400E' }} data-testid="point-non-precise">
            {fmt(nonPrecise.total)} F payés « Mobile Money » sans préciser Orange ou Wave : ils sont dans le tableau « {nonPrecise.moyen.nom} ».
            {editable && ' Pour les ranger, tapez le montant dans le bon tableau puis 0 dans la case « non précisé ».'}
          </p>
        )}
      </div>

      {/* Tableau global */}
      <div className="bg-white rounded-lg shadow-sm p-3">
        <div className="text-sm font-bold text-gray-800 mb-2">TOUS LES DÉPÔTS DE LA SEMAINE</div>
        <div className="overflow-x-auto">
          <table className="no-mobile-scroll" style={{ borderCollapse: 'collapse', width: '100%' }} data-testid="point-global">
            <thead>
              <tr>
                <th style={{ ...cellule, background: '#D9D9D9', fontSize: 11 }}>JOUR</th>
                {vue.colonnes.map(enTeteColonne)}
                <th style={{ ...cellule, background: '#00B0F0', fontSize: 11 }}>TOTAL</th>
                {vue.moyens.map(m => <th key={m.moyen.id} style={{ ...cellule, background: m.moyen.couleur, color: texteSur(m.moyen.couleur), fontSize: 11 }}>{m.moyen.nom}</th>)}
              </tr>
            </thead>
            <tbody>
              {vue.jours.map(j => (
                <tr key={j}>
                  <td style={{ ...cellule, background: '#D9D9D9', fontSize: 11 }}>{JOURS_POINT[j]}</td>
                  {vue.colonnes.map((c, ci) => <td key={c.id} style={{ ...cellule, background: couleurColonne(ci) }}>{fmt(vue.global[ci][j])}</td>)}
                  <td style={{ ...cellule, background: '#00B0F0', fontWeight: 700 }} data-testid="point-global-total-jour">{fmt(vue.totauxJour[j])}</td>
                  {vue.moyens.map(m => <td key={m.moyen.id} style={{ ...cellule, background: m.moyen.couleur, color: texteSur(m.moyen.couleur), fontWeight: 700 }}>{fmt(m.totauxJour[j])}</td>)}
                </tr>
              ))}
              <tr>
                <td style={{ ...cellule, fontWeight: 700, borderTop: '2px solid #1f2937' }}>TOTAL</td>
                {vue.totauxColonne.map((t, ci) => <td key={ci} style={{ ...cellule, fontWeight: 700, borderTop: '2px solid #1f2937' }}>{fmt(t)}</td>)}
                <td style={{ ...cellule, fontWeight: 800, borderTop: '2px solid #1f2937' }} data-testid="point-global-total">{fmt(vue.total)}</td>
                {vue.moyens.map(m => <td key={m.moyen.id} style={{ ...cellule, fontWeight: 800, borderTop: '2px solid #1f2937' }} data-testid="point-global-total-moyen">{fmt(m.total)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        {editable && retires.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Colonne{retires.length > 1 ? 's' : ''} retirée{retires.length > 1 ? 's' : ''} :{' '}
            {retires.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ', '}{m.label}{' '}
                <button type="button" data-sans-anti-double className="underline text-blue-600" onClick={() => changerModele(mo => ({ ...mo, retires: mo.retires.filter(r => String(r).toUpperCase() !== m.id.toUpperCase()) }))}>remettre</button>
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Un tableau par moyen de paiement */}
      {vue.moyens.map((m, mi) => (
        <div key={m.moyen.id} className="bg-white rounded-lg shadow-sm p-3" data-testid="point-moyen">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: m.moyen.couleur, color: texteSur(m.moyen.couleur), padding: '4px 8px', fontWeight: 700, fontSize: 13 }}>
            {editable && m.dansModele && <PetitBouton titre="Monter" onClick={() => changerModele(mo => ({ ...mo, moyens: deplacer(mo.moyens, mi, -1) }))}>▲</PetitBouton>}
            <NomModifiable valeur={m.moyen.nom} lectureSeule={!editable} style={{ fontWeight: 700 }} testId="point-moyen-nom"
              onChange={nom => changerModele(mo => { const x = avecMoyen(mo, m.moyen); return { ...x, moyens: x.moyens.map(y => y.id === m.moyen.id ? { ...y, nom } : y) }; })} />
            <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }} data-testid="point-moyen-total">{fmt(m.total)}</span>
            {editable && m.dansModele && (
              <PetitBouton titre="Retirer ce tableau" onClick={() => {
                if (!window.confirm(`Retirer le tableau « ${m.moyen.nom} » ?${m.moyen.cle ? ' Il reviendra seul si des dépôts de ce moyen sont enregistrés dans la semaine.' : ''}`)) return;
                changerModele(mo => ({ ...mo, moyens: mo.moyens.filter(y => y.id !== m.moyen.id) }));
              }}>✕</PetitBouton>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="no-mobile-scroll" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...cellule, background: '#D9D9D9', fontSize: 11 }}>JOUR</th>
                  {vue.colonnes.map((c, ci) => <th key={c.id} style={{ ...cellule, background: couleurColonne(ci), color: texteSur(couleurColonne(ci)), fontSize: 11, minWidth: 92 }}>{c.nom}</th>)}
                  <th style={{ ...cellule, background: m.moyen.couleur, color: texteSur(m.moyen.couleur), fontSize: 11 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {vue.jours.map(j => (
                  <tr key={j}>
                    <td style={{ ...cellule, background: '#D9D9D9', fontSize: 11 }}>{JOURS_POINT[j]}</td>
                    {m.colonnes.map((c, ci) => (
                      <td key={c.colonne.id} style={{ ...cellule, background: couleurColonne(ci), padding: 1 }}>
                        <ChampMontant
                          valeur={c.cases[j].valeur} auto={c.cases[j].auto} modifie={c.cases[j].modifie} lectureSeule={!editable} gras={false}
                          onChange={v => {
                            if (!m.dansModele) enregistrer(d => {
                              const parCol = { ...(d.valeurs.cases[m.moyen.id] || {}) };
                              const t = { ...(parCol[c.colonne.id] || {}) };
                              if (v === null) delete t[j]; else t[j] = v;
                              parCol[c.colonne.id] = t;
                              return { ...d, modele: avecMoyen(d.modele, m.moyen), valeurs: { cases: { ...d.valeurs.cases, [m.moyen.id]: parCol } } };
                            }, true);
                            else setCase(m.moyen.id, c.colonne.id, j, v);
                          }}
                          testId="point-depot"
                        />
                      </td>
                    ))}
                    <td style={{ ...cellule, background: m.moyen.couleur, color: texteSur(m.moyen.couleur), fontWeight: 700 }}>{fmt(m.totauxJour[j])}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cellule, fontWeight: 700, borderTop: '2px solid #1f2937' }}>TOTAL</td>
                  {m.colonnes.map(c => <td key={c.colonne.id} style={{ ...cellule, fontWeight: 700, borderTop: '2px solid #1f2937' }}>{fmt(c.total)}</td>)}
                  <td style={{ ...cellule, fontWeight: 800, borderTop: '2px solid #1f2937' }}>{fmt(m.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
