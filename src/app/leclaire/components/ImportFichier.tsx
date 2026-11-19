import { useMemo, useState, type ChangeEvent } from 'react'
import type { AppSettings, Shop, Transaction, User } from '../types'
import { formatFCFA, formatDate } from '../outils'
import * as svc from '../leclaireService'
import {
  analyser, lireTableur, planifier, preparer, valeurChoix, versLigneMouvement,
  type LignePreparee, type PlanLigne, type ResultatLecture,
} from '../importFichier'
import { nomACreer, type MagasinConnu } from '../reconnaissance'

/**
 * Import de mouvements depuis un fichier (administration LECLAIRE) : CSV de
 * l'export « Excel / CSV », ou tableau Excel. Tout est décidé
 * automatiquement, ligne par ligne, et reste modifiable dans l'aperçu :
 *  - magasin : colonne « Magasin », sinon « MAGASIN DE X » ou nom cité dans la
 *    ligne (magasins LECLAIRE, magasins OPTICLAIRE, villes de Côte d'Ivoire),
 *    sinon celui des lignes de la même période ; un magasin reconnu qui
 *    n'existe pas encore dans LECLAIRE est créé à l'import ;
 *  - personne : colonne « Personne », sinon la personne habituelle du
 *    magasin, sinon la personne choisie ;
 *  - lignes déjà présentes décochées, lignes illisibles signalées.
 */
interface Props {
  stores: Shop[]
  users: User[]
  transactions: Transaction[]
  categories: string[]
  currentUser: User
  settings: AppSettings
  /** Noms des magasins d'OPTICLAIRE (reconnus dans le fichier). */
  magasinsOpticlaire: string[]
  /** Nom donné aux magasins créés (règle d'OPTICLAIRE : « LECLAIRE X »). */
  nommerMagasin?: (nom: string) => string
  onAjouterMagasin: (nom: string) => Promise<Shop | null>
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
  onTermine: () => Promise<void> | void
  journal: (action: string, description: string) => void
}

const carte = 'bg-white rounded-2xl p-5 space-y-3'
const ombre = { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
const champ = 'w-full rounded-lg border border-border px-3 py-2 text-sm'
const AUTO = '__auto__'

function origineTexte(p: PlanLigne): string {
  switch (p.origine) {
    case 'colonne': return 'colonne « Magasin »'
    case 'mention': return 'cité dans la ligne'
    case 'nom': return 'cité dans la ligne'
    case 'periode': return `même période (ligne ${p.depuisLigne})`
    case 'defaut': return 'magasin par défaut'
    case 'choix': return 'choisi'
    default: return p.ambigu ? 'plusieurs magasins cités' : ''
  }
}

export default function ImportFichier({ stores, users, transactions, categories, currentUser, settings, magasinsOpticlaire, nommerMagasin, onAjouterMagasin, onToast, onTermine, journal }: Props) {
  const nomFinal = (m: MagasinConnu) => (m.id ? m.nom : nomACreer(m, nommerMagasin))
  const [nomFichier, setNomFichier] = useState('')
  const [lecture, setLecture] = useState<ResultatLecture | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [personneMode, setPersonneMode] = useState<string>(AUTO)
  const [magasinDefaut, setMagasinDefaut] = useState('')
  const [choixMagasin, setChoixMagasin] = useState<Record<number, string>>({})
  const [coches, setCoches] = useState<Record<number, boolean>>({})
  const [creerAuto, setCreerAuto] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [progres, setProgres] = useState<string | null>(null)
  const [rapport, setRapport] = useState<{ ajoutes: number; parMagasin: Array<[string, number]>; dejaLa: number; crees: string[] } | null>(null)

  const choisir = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErreur(null); setRapport(null); setChoixMagasin({}); setCoches({})
    try {
      const r = analyser(await lireTableur(f))
      if (!r.lignes.length) throw new Error('Aucun mouvement dans ce fichier.')
      setLecture(r)
      setNomFichier(f.name)
    } catch (err) {
      setLecture(null)
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  const lignes: LignePreparee[] = useMemo(() => (lecture ? preparer(lecture.lignes, transactions) : []), [lecture, transactions])
  const personneChoisie = personneMode === AUTO ? currentUser.id : personneMode
  const plan: PlanLigne[] = useMemo(() => planifier(lignes, {
    magasins: stores, opticlaire: magasinsOpticlaire, existants: transactions, personnes: users,
    personneChoisie, personneAuto: personneMode === AUTO, magasinDefaut, choix: choixMagasin,
  }), [lignes, stores, magasinsOpticlaire, transactions, users, personneChoisie, personneMode, magasinDefaut, choixMagasin])

  const nomPersonne = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users])
  /** Magasin retenu (null si à créer et création automatique désactivée). */
  const magasinDe = (i: number): MagasinConnu | null => {
    const m = plan[i]?.magasin
    return m && (m.id || creerAuto) ? m : null
  }
  // Décochées d'office : lignes déjà présentes, et lignes corrigées (autre montant) pour ne rien compter deux fois.
  const estCoche = (l: LignePreparee) => !l.erreur && (coches[l.numero] ?? (!l.dejaPresent && l.semblable === undefined))
  const indicesAImporter = lignes.map((l, i) => i).filter(i => estCoche(lignes[i]) && magasinDe(i))
  const sansMagasin = lignes.filter((l, i) => estCoche(l) && !magasinDe(i)).length
  const nbDeja = lignes.filter(l => l.dejaPresent).length
  const nbSemblables = lignes.filter(l => l.semblable !== undefined).length
  const nbErreurs = lignes.filter(l => l.erreur).length

  // Magasins reconnus qui n'existent pas encore dans LECLAIRE (lignes cochées).
  const aCreer = useMemo(() => {
    const m = new Map<string, { nom: string; n: number }>()
    lignes.forEach((l, i) => {
      const mag = plan[i]?.magasin
      if (mag && !mag.id && estCoche(l)) { const x = m.get(mag.cle) || { nom: nomFinal(mag), n: 0 }; x.n++; m.set(mag.cle, x) }
    })
    return [...m.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, plan, coches])
  // Options de magasin de chaque ligne : magasins LECLAIRE + magasins reconnus à créer.
  const optionsNouveaux = aCreer.map(([cle, x]) => ({ valeur: `nouveau:${cle}`, nom: `${x.nom} (nouveau)` }))
  const tousNouveaux = useMemo(() => {
    const m = new Map<string, string>()
    plan.forEach(p => { if (p.magasin && !p.magasin.id) m.set(p.magasin.cle, nomFinal(p.magasin)) })
    return m
  }, [plan])

  const repartition = (indices: number[]) => {
    const parMagasin = new Map<string, number>()
    for (const i of indices) { const m = magasinDe(i); const n = m ? nomFinal(m) : '—'; parMagasin.set(n, (parMagasin.get(n) || 0) + 1) }
    return [...parMagasin.entries()]
  }
  const parPersonne = (indices: number[]) => {
    const m = new Map<string, number>()
    for (const i of indices) { const n = nomPersonne.get(plan[i].personneId) || '—'; m.set(n, (m.get(n) || 0) + 1) }
    return [...m.entries()]
  }
  const resume = {
    entrees: indicesAImporter.filter(i => lignes[i].type === 'income').reduce((s, i) => s + (lignes[i].montant || 0), 0),
    sorties: indicesAImporter.filter(i => lignes[i].type === 'expense').reduce((s, i) => s + (lignes[i].montant || 0), 0),
    parMagasin: repartition(indicesAImporter),
    parPersonne: parPersonne(indicesAImporter),
  }

  const importer = async () => {
    if (!indicesAImporter.length) return
    setEnCours(true); setRapport(null)
    try {
      // 1) Magasins reconnus à créer.
      const crees = new Map<string, Shop>()
      for (const i of indicesAImporter) {
        const m = magasinDe(i)!
        if (m.id || crees.has(m.cle)) continue
        setProgres(`création du magasin ${nomFinal(m)}`)
        const shop = await onAjouterMagasin(nomFinal(m))
        if (!shop) throw new Error(`Le magasin « ${nomFinal(m)} » n'a pas pu être créé : import arrêté, rien n'a été importé.`)
        crees.set(m.cle, shop)
      }
      const shopDe = (i: number): Shop | undefined => {
        const m = magasinDe(i)!
        return m.id ? stores.find(s => s.id === m.id) || crees.get(m.cle) : crees.get(m.cle)
      }
      // 2) Catégories nouvelles, puis mouvements.
      const maintenant = new Date().toISOString()
      const nouvellesCategories = [...new Set(indicesAImporter.map(i => lignes[i].categorie || 'Autre'))].filter(c => !categories.includes(c))
      if (nouvellesCategories.length) await svc.ajouterCategories(nouvellesCategories)
      const lignesBase = indicesAImporter.map(i => versLigneMouvement(lignes[i], shopDe(i), plan[i].personneId, maintenant))
      const ajoutes = await svc.insererMouvementsImportes(lignesBase, (fait, total) => setProgres(`${fait} / ${total}`))
      const parMagasin = repartition(indicesAImporter)
      setRapport({ ajoutes, parMagasin, dejaLa: indicesAImporter.length - ajoutes, crees: [...crees.values()].map(s => s.name) })
      journal('IMPORT', `Import du fichier « ${nomFichier} » : ${ajoutes} mouvement(s) (${parMagasin.map(([n, c]) => `${n} : ${c}`).join(', ')})${crees.size ? ` ; magasins créés : ${[...crees.values()].map(s => s.name).join(', ')}` : ''}`)
      onToast(`${ajoutes} mouvement(s) importé(s).`, 'success')
      setChoixMagasin({})
      await onTermine()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setEnCours(false); setProgres(null)
    }
  }

  const personnes = users.filter(u => u.compte || u.id === personneChoisie)

  return (
    <div className="space-y-5 fade-up" data-testid="lc-import-fichier">
      <div className={carte} style={ombre}>
        <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>Importer des mouvements depuis un fichier</h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Fichier CSV (comme l'export « Excel / CSV » de LECLAIRE) ou tableau Excel. LECLAIRE reconnaît tout seul le magasin de
          chaque ligne (colonne « Magasin », ou magasin cité dans la ligne — magasins LECLAIRE et OPTICLAIRE, villes de Côte
          d'Ivoire —, sinon celui des lignes de la même période) et la personne (colonne « Personne », sinon la personne
          habituelle du magasin). Les magasins reconnus qui n'existent pas encore sont créés. Vous vérifiez tout avant l'import ;
          un même fichier importé deux fois n'ajoute rien la seconde fois.
        </p>
        <label className="block w-full py-2.5 rounded-xl text-sm font-bold text-white text-center cursor-pointer" style={{ background: 'var(--color-navy)', fontFamily: 'var(--font-display)' }}>
          {nomFichier ? `Fichier : ${nomFichier} — en choisir un autre` : '1. Choisir le fichier (CSV ou Excel)'}
          <input type="file" accept=".csv,.txt,.xlsx,.xls,.ods,text/csv" onChange={choisir} className="hidden" data-testid="lc-fichier" />
        </label>
        {erreur && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--color-expense-light)', color: 'var(--color-expense)' }} data-testid="lc-fichier-erreur">{erreur}</p>}
      </div>

      {lecture && (
        <div className={carte} style={ombre} data-testid="lc-import-reconnu">
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>2. Ce que LECLAIRE a reconnu</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Personne</label>
              <select value={personneMode} onChange={e => setPersonneMode(e.target.value)} className={champ} data-testid="lc-import-personne">
                <option value={AUTO}>Automatique (colonne « Personne », sinon personne habituelle du magasin, sinon vous)</option>
                {personnes.map(u => <option key={u.id} value={u.id}>Toutes les lignes : {u.name}{u.id === currentUser.id ? ' (vous)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Lignes où aucun magasin n'est reconnu (facultatif)</label>
              <select value={magasinDefaut} onChange={e => setMagasinDefaut(e.target.value)} className={champ} data-testid="lc-import-magasin-defaut">
                <option value="">— Laisser à choisir —</option>
                {stores.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          {aCreer.length > 0 && (
            <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ background: '#ECFDF5', color: '#065F46' }} data-testid="lc-import-a-creer">
              <p>
                Magasins reconnus, pas encore dans LECLAIRE : {aCreer.map(([, x]) => `${x.nom} (${x.n} ligne${x.n > 1 ? 's' : ''})`).join(', ')}.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={creerAuto} onChange={e => setCreerAuto(e.target.checked)} data-testid="lc-import-creer-auto" />
                Les créer automatiquement à l'import
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs" data-testid="lc-import-repartition">
            {resume.parMagasin.map(([n, c]) => (
              <div key={n} className="rounded-xl px-3 py-2" style={{ background: '#F8FAFC' }}><p style={{ color: '#94A3B8' }}>Magasin</p><p className="font-semibold">{n} : {c}</p></div>
            ))}
            {resume.parPersonne.map(([n, c]) => (
              <div key={`p-${n}`} className="rounded-xl px-3 py-2" style={{ background: '#EFF6FF' }}><p style={{ color: '#94A3B8' }}>Personne</p><p className="font-semibold">{n} : {c}</p></div>
            ))}
          </div>
        </div>
      )}

      {lecture && (
        <div className={carte} style={ombre} data-testid="lc-import-apercu">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>3. Vérifier les lignes</h3>
            <div className="flex gap-2 text-xs">
              <button onClick={() => setCoches(Object.fromEntries(lignes.map(l => [l.numero, true])))} className="underline" style={{ color: 'var(--color-blue)' }}>Tout cocher</button>
              <button onClick={() => setCoches(Object.fromEntries(lignes.map(l => [l.numero, false])))} className="underline" style={{ color: 'var(--color-muted)' }}>Tout décocher</button>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }} data-testid="lc-import-resume">
            {lignes.length} ligne(s) lue(s) · <strong style={{ color: '#0F172A' }}>{indicesAImporter.length} à importer</strong>
            {nbDeja > 0 && <> · {nbDeja} déjà dans LECLAIRE (décochée{nbDeja > 1 ? 's' : ''})</>}
            {nbSemblables > 0 && <> · <span style={{ color: '#C2410C' }}>{nbSemblables} déjà dans LECLAIRE avec un autre montant (décochée{nbSemblables > 1 ? 's' : ''}, à vérifier)</span></>}
            {nbErreurs > 0 && <> · <span style={{ color: 'var(--color-expense)' }}>{nbErreurs} illisible(s)</span></>}
            {sansMagasin > 0 && <> · <span style={{ color: '#C2410C' }}>{sansMagasin} sans magasin</span></>}
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs no-mobile-scroll">
              <thead style={{ background: '#F8FAFC', color: 'var(--color-muted)' }}>
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Montant</th>
                  <th className="p-2 text-left">Magasin</th>
                  <th className="p-2 text-left">État</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => {
                  const p = plan[i]
                  const m = magasinDe(i)
                  const valeur = valeurChoix(m)
                  const nouveauHorsListe = m && !m.id && !optionsNouveaux.some(o => o.valeur === valeur)
                  return (
                    <tr key={l.numero} className="border-t border-border align-top" style={{ opacity: estCoche(l) ? 1 : 0.55 }} data-testid="lc-import-ligne">
                      <td className="p-2">
                        <input type="checkbox" checked={estCoche(l)} disabled={!!l.erreur} onChange={e => setCoches(c => ({ ...c, [l.numero]: e.target.checked }))} />
                      </td>
                      <td className="p-2 whitespace-nowrap">{l.date ? formatDate(l.date) : '—'}</td>
                      <td className="p-2" style={{ minWidth: 180 }}>
                        <span className="font-semibold" style={{ color: '#0F172A' }}>{l.description || '—'}</span>
                        <span className="block" style={{ color: '#94A3B8' }}>{[l.categorie, l.beneficiaire, l.commentaire].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className="p-2 text-right whitespace-nowrap num font-semibold" style={{ color: l.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)' }}>
                        {l.montant != null ? `${l.type === 'income' ? '+' : '−'}${formatFCFA(l.montant, settings.currency)}` : '—'}
                      </td>
                      <td className="p-2" style={{ minWidth: 170 }}>
                        <select value={valeur} onChange={e => setChoixMagasin(c => ({ ...c, [l.numero]: e.target.value }))} className="w-full rounded-md border border-border px-1.5 py-1 text-xs" data-testid="lc-import-magasin-ligne">
                          <option value="">— Choisir —</option>
                          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          {[...tousNouveaux.entries()].map(([cle, nom]) => <option key={cle} value={`nouveau:${cle}`}>{nom} (nouveau)</option>)}
                          {nouveauHorsListe && m && <option value={valeur}>{nomFinal(m)} (nouveau)</option>}
                        </select>
                        {m && <span className="block mt-0.5" style={{ color: p.origine === 'periode' || p.origine === 'defaut' ? '#0369A1' : 'var(--color-income)' }} data-testid="lc-import-origine">{origineTexte(p)}</span>}
                        {!m && p?.ambigu && <span className="block mt-0.5" style={{ color: '#C2410C' }}>plusieurs magasins cités</span>}
                        <span className="block mt-0.5" style={{ color: '#94A3B8' }}>
                          pour {nomPersonne.get(p?.personneId) || '—'}{p?.personneOrigine === 'habituelle' ? ' (habituel du magasin)' : p?.personneOrigine === 'colonne' ? ' (colonne « Personne »)' : ''}
                        </span>
                      </td>
                      <td className="p-2" style={{ minWidth: 110 }}>
                        {l.erreur
                          ? <span style={{ color: 'var(--color-expense)' }}>Illisible : {l.erreur}</span>
                          : l.dejaPresent
                            ? <span style={{ color: '#C2410C' }}>Déjà dans LECLAIRE</span>
                            : l.semblable !== undefined
                              ? <span style={{ color: '#C2410C' }} data-testid="lc-import-semblable">Déjà dans LECLAIRE avec {formatFCFA(l.semblable, settings.currency)} : ligne corrigée ? Cochez seulement si c'est un autre achat ; sinon corrigez le montant du mouvement existant.</span>
                            : !m
                              ? <span style={{ color: '#C2410C' }}>Magasin à choisir</span>
                              : <span style={{ color: 'var(--color-income)' }}>Nouveau</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-income-light)' }}><p style={{ color: 'var(--color-income)' }}>Entrées</p><p className="font-semibold num">{formatFCFA(resume.entrees, settings.currency)}</p></div>
            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-expense-light)' }}><p style={{ color: 'var(--color-expense)' }}>Sorties</p><p className="font-semibold num">{formatFCFA(resume.sorties, settings.currency)}</p></div>
          </div>

          <button
            onClick={importer}
            disabled={enCours || !indicesAImporter.length}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #059669, #10B981)', fontFamily: 'var(--font-display)' }}
            data-testid="lc-importer"
          >
            {enCours ? `Import en cours… ${progres || ''}` : `4. Importer ${indicesAImporter.length} mouvement(s)`}
          </button>
          {sansMagasin > 0 && <p className="text-xs" style={{ color: '#C2410C' }}>{sansMagasin} ligne(s) cochée(s) sans magasin ne seront pas importées : choisissez leur magasin dans la liste, ou un magasin pour les lignes non reconnues.</p>}
        </div>
      )}

      {rapport && (
        <div className={carte} style={ombre} data-testid="lc-import-rapport">
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-income)' }}>Import terminé</h3>
          <p className="text-xs" style={{ color: '#334155' }}>
            {rapport.ajoutes} mouvement(s) ajouté(s){rapport.dejaLa > 0 ? ` · ${rapport.dejaLa} déjà importé(s) auparavant, non ajouté(s)` : ''}.
            {rapport.crees.length > 0 && <> Magasins créés : {rapport.crees.join(', ')}.</>}
          </p>
          <ul className="text-xs" style={{ color: '#334155' }}>
            {rapport.parMagasin.map(([n, c]) => <li key={n}>{n} : {c} ligne(s)</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
