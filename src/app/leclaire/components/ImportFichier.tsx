import { useMemo, useState, type ChangeEvent } from 'react'
import type { AppSettings, Shop, Transaction, User } from '../types'
import { formatFCFA, formatDate } from '../outils'
import * as svc from '../leclaireService'
import {
  analyser, detecterMagasin, lireTableur, normaliser, preparer, versLigneMouvement,
  type Detection, type LignePreparee, type ResultatLecture,
} from '../importFichier'

/**
 * Import de mouvements depuis un fichier (administration LECLAIRE) : CSV de
 * l'export « Excel / CSV », ou tableau Excel. Aperçu ligne par ligne avant
 * l'import : magasin de chaque ligne (cité dans la ligne ou par défaut,
 * modifiable), lignes déjà présentes décochées, lignes illisibles signalées.
 */
interface Props {
  stores: Shop[]
  users: User[]
  transactions: Transaction[]
  categories: string[]
  currentUser: User
  settings: AppSettings
  onAjouterMagasin: (nom: string) => Promise<Shop | null>
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
  onTermine: () => Promise<void> | void
  journal: (action: string, description: string) => void
}

const carte = 'bg-white rounded-2xl p-5 space-y-3'
const ombre = { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
const champ = 'w-full rounded-lg border border-border px-3 py-2 text-sm'

export default function ImportFichier({ stores, users, transactions, categories, currentUser, settings, onAjouterMagasin, onToast, onTermine, journal }: Props) {
  const [nomFichier, setNomFichier] = useState('')
  const [lecture, setLecture] = useState<ResultatLecture | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [personneId, setPersonneId] = useState(currentUser.id)
  const [magasinDefaut, setMagasinDefaut] = useState('')
  const [choixMagasin, setChoixMagasin] = useState<Record<number, string>>({})
  const [coches, setCoches] = useState<Record<number, boolean>>({})
  const [nouveauMagasin, setNouveauMagasin] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [progres, setProgres] = useState<string | null>(null)
  const [rapport, setRapport] = useState<{ ajoutes: number; parMagasin: Array<[string, number]>; dejaLa: number } | null>(null)

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
  const detections: Record<number, Detection> = useMemo(
    () => Object.fromEntries(lignes.map(l => [l.numero, detecterMagasin(l, stores)])), [lignes, stores])
  const personneParNom = useMemo(() => new Map(users.map(u => [normaliser(u.name), u.id])), [users])

  const magasinDe = (l: LignePreparee) => choixMagasin[l.numero] ?? detections[l.numero]?.magasinId ?? magasinDefaut
  const personneDe = (l: LignePreparee) => (l.personneTexte && personneParNom.get(normaliser(l.personneTexte))) || personneId
  const estCoche = (l: LignePreparee) => !l.erreur && (coches[l.numero] ?? !l.dejaPresent)
  const aImporter = lignes.filter(l => estCoche(l) && magasinDe(l))
  const sansMagasin = lignes.filter(l => estCoche(l) && !magasinDe(l)).length
  const inconnus = [...new Set(lignes.map(l => detections[l.numero]?.inconnu).filter(Boolean) as string[])]

  const repartition = (liste: LignePreparee[]) => {
    const parMagasin = new Map<string, number>()
    for (const l of liste) { const n = stores.find(m => m.id === magasinDe(l))?.name || '—'; parMagasin.set(n, (parMagasin.get(n) || 0) + 1) }
    return [...parMagasin.entries()]
  }
  const resume = {
    entrees: aImporter.filter(l => l.type === 'income').reduce((s, l) => s + (l.montant || 0), 0),
    sorties: aImporter.filter(l => l.type === 'expense').reduce((s, l) => s + (l.montant || 0), 0),
    parMagasin: repartition(aImporter),
  }

  const creerMagasin = async (nom: string) => {
    const n = nom.trim()
    if (!n) return
    // Champ vidé tout de suite : un nom tapé pendant la création n'est pas effacé.
    setNouveauMagasin('')
    const m = await onAjouterMagasin(n)
    if (m) { if (!magasinDefaut) setMagasinDefaut(m.id) }
    else setNouveauMagasin(v => v || n)
  }

  const importer = async () => {
    if (!aImporter.length) return
    setEnCours(true); setRapport(null)
    try {
      const maintenant = new Date().toISOString()
      const nouvellesCategories = [...new Set(aImporter.map(l => l.categorie || 'Autre'))].filter(c => !categories.includes(c))
      if (nouvellesCategories.length) await svc.ajouterCategories(nouvellesCategories)
      const lignesBase = aImporter.map(l => versLigneMouvement(l, stores.find(m => m.id === magasinDe(l)), personneDe(l), maintenant))
      const ajoutes = await svc.insererMouvementsImportes(lignesBase, (fait, total) => setProgres(`${fait} / ${total}`))
      const parMagasin = repartition(aImporter)
      setRapport({ ajoutes, parMagasin, dejaLa: aImporter.length - ajoutes })
      journal('IMPORT', `Import du fichier « ${nomFichier} » : ${ajoutes} mouvement(s) (${parMagasin.map(([n, c]) => `${n} : ${c}`).join(', ')})`)
      onToast(`${ajoutes} mouvement(s) importé(s).`, 'success')
      await onTermine()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setEnCours(false); setProgres(null)
    }
  }

  const nbDeja = lignes.filter(l => l.dejaPresent).length
  const nbErreurs = lignes.filter(l => l.erreur).length
  const personnes = users.filter(u => u.compte || u.id === personneId)

  return (
    <div className="space-y-5 fade-up" data-testid="lc-import-fichier">
      <div className={carte} style={ombre}>
        <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>Importer des mouvements depuis un fichier</h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Fichier CSV (comme l'export « Excel / CSV » de LECLAIRE) ou tableau Excel, avec au moins les colonnes Date, Type,
          Description, Entrée et Sortie. Chaque ligne va dans le magasin qu'elle cite (colonne « Magasin », ou nom du magasin
          dans la description ou le commentaire) ; sinon dans le magasin par défaut. Vous vérifiez tout avant l'import, et un
          même fichier importé deux fois n'ajoute rien la seconde fois.
        </p>
        <label className="block w-full py-2.5 rounded-xl text-sm font-bold text-white text-center cursor-pointer" style={{ background: 'var(--color-navy)', fontFamily: 'var(--font-display)' }}>
          {nomFichier ? `Fichier : ${nomFichier} — en choisir un autre` : '1. Choisir le fichier (CSV ou Excel)'}
          <input type="file" accept=".csv,.txt,.xlsx,.xls,.ods,text/csv" onChange={choisir} className="hidden" data-testid="lc-fichier" />
        </label>
        {erreur && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--color-expense-light)', color: 'var(--color-expense)' }} data-testid="lc-fichier-erreur">{erreur}</p>}
      </div>

      {lecture && (
        <div className={carte} style={ombre}>
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>2. Pour qui et dans quel magasin</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Personne à qui affecter les mouvements{lecture.aColonnePersonne ? ' (si la colonne « Personne » ne la reconnaît pas)' : ''}</label>
              <select value={personneId} onChange={e => setPersonneId(e.target.value)} className={champ} data-testid="lc-import-personne">
                {personnes.map(u => <option key={u.id} value={u.id}>{u.name}{u.id === currentUser.id ? ' (vous)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Magasin par défaut (lignes qui ne citent aucun magasin)</label>
              <select value={magasinDefaut} onChange={e => setMagasinDefaut(e.target.value)} className={champ} data-testid="lc-import-magasin-defaut">
                <option value="">— Choisir —</option>
                {stores.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          {/* Touche Entrée ou bouton « + Créer ». Pas de verrou anti-double-clic
              d'OPTICLAIRE ici (data-sans-anti-double) : le champ est vidé dès le
              clic et un magasin du même nom n'est jamais recréé, on peut donc
              créer plusieurs magasins à la suite sans attendre. */}
          <form className="flex gap-2" data-sans-anti-double onSubmit={e => { e.preventDefault(); creerMagasin(nouveauMagasin) }}>
            <input value={nouveauMagasin} onChange={e => setNouveauMagasin(e.target.value)} placeholder="Nouveau magasin (ex. : Bouaké)" className={champ} data-testid="lc-import-nouveau-magasin" />
            <button type="submit" disabled={!nouveauMagasin.trim()} className="px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex-shrink-0" style={{ background: 'var(--color-navy)' }}>+ Créer</button>
          </form>
          {inconnus.length > 0 && (
            <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ background: '#FFF7ED', color: '#9A3412' }}>
              <p>Magasins du fichier inconnus dans LECLAIRE : {inconnus.map(n => `« ${n} »`).join(', ')}.</p>
              <button onClick={async () => { for (const n of inconnus) await creerMagasin(n) }} className="underline font-semibold">Les créer</button>
            </div>
          )}
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
            {lignes.length} ligne(s) lue(s) · <strong style={{ color: '#0F172A' }}>{aImporter.length} à importer</strong>
            {nbDeja > 0 && <> · {nbDeja} déjà dans LECLAIRE (décochée{nbDeja > 1 ? 's' : ''})</>}
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
                {lignes.map(l => {
                  const d = detections[l.numero]
                  const m = magasinDe(l)
                  const choisiAMain = choixMagasin[l.numero] !== undefined
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
                      <td className="p-2" style={{ minWidth: 150 }}>
                        <select value={m} onChange={e => setChoixMagasin(c => ({ ...c, [l.numero]: e.target.value }))} className="w-full rounded-md border border-border px-1.5 py-1 text-xs" data-testid="lc-import-magasin-ligne">
                          <option value="">— Choisir —</option>
                          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {!choisiAMain && d?.par === 'texte' && <span className="block mt-0.5" style={{ color: 'var(--color-income)' }}>cité dans la ligne</span>}
                        {!choisiAMain && d?.par === 'colonne' && <span className="block mt-0.5" style={{ color: 'var(--color-income)' }}>colonne « Magasin »</span>}
                        {!choisiAMain && d?.ambigu && <span className="block mt-0.5" style={{ color: '#C2410C' }}>plusieurs magasins cités</span>}
                      </td>
                      <td className="p-2" style={{ minWidth: 110 }}>
                        {l.erreur
                          ? <span style={{ color: 'var(--color-expense)' }}>Illisible : {l.erreur}</span>
                          : l.dejaPresent
                            ? <span style={{ color: '#C2410C' }}>Déjà dans LECLAIRE</span>
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-income-light)' }}><p style={{ color: 'var(--color-income)' }}>Entrées</p><p className="font-semibold num">{formatFCFA(resume.entrees, settings.currency)}</p></div>
            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-expense-light)' }}><p style={{ color: 'var(--color-expense)' }}>Sorties</p><p className="font-semibold num">{formatFCFA(resume.sorties, settings.currency)}</p></div>
            {resume.parMagasin.map(([n, c]) => (
              <div key={n} className="rounded-xl px-3 py-2" style={{ background: '#F8FAFC' }}><p style={{ color: '#94A3B8' }}>{n}</p><p className="font-semibold">{c} mouvement(s)</p></div>
            ))}
          </div>

          <button
            onClick={importer}
            disabled={enCours || !aImporter.length}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #059669, #10B981)', fontFamily: 'var(--font-display)' }}
            data-testid="lc-importer"
          >
            {enCours ? `Import en cours… ${progres || ''}` : `4. Importer ${aImporter.length} mouvement(s)`}
          </button>
          {sansMagasin > 0 && <p className="text-xs" style={{ color: '#C2410C' }}>{sansMagasin} ligne(s) cochée(s) sans magasin ne seront pas importées : choisissez un magasin par défaut ou ligne par ligne.</p>}
        </div>
      )}

      {rapport && (
        <div className={carte} style={ombre} data-testid="lc-import-rapport">
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-income)' }}>Import terminé</h3>
          <p className="text-xs" style={{ color: '#334155' }}>
            {rapport.ajoutes} mouvement(s) ajouté(s){rapport.dejaLa > 0 ? ` · ${rapport.dejaLa} déjà importé(s) auparavant, non ajouté(s)` : ''}.
          </p>
          <ul className="text-xs" style={{ color: '#334155' }}>
            {rapport.parMagasin.map(([n, c]) => <li key={n}>{n} : {c} ligne(s)</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
