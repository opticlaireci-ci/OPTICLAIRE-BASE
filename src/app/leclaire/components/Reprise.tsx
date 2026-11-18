import { useMemo, useState, type ChangeEvent } from 'react'
import type { CompteOpticlaire } from '../leclaireService'
import { formatFCFA, roleLabel } from '../outils'
import {
  ANCIENNE_BASE_CLE, ANCIENNE_BASE_URL, executerReprise, lireAncienneBase, lireFichierSauvegarde, proposerCorrespondances,
  type AncienneBase, type Proposition, type Rapport,
} from '../reprise'

/**
 * Reprise des données de l'ancienne application LECLAIRE (administration).
 * Lecture seule de l'ancienne base ; rejouable sans doublon.
 */
interface Props {
  comptes: CompteOpticlaire[]
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
  onTermine: () => void
  journal: (action: string, description: string) => void
}

const carte = 'bg-white rounded-2xl p-5 space-y-3'
const ombre = { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }

function taille(octets: number) {
  if (octets >= 1024 * 1024) return (octets / 1024 / 1024).toFixed(1) + ' Mo'
  return Math.max(1, Math.round(octets / 1024)) + ' Ko'
}

export default function Reprise({ comptes, onToast, onTermine, journal }: Props) {
  const [url, setUrl] = useState(ANCIENNE_BASE_URL)
  const [cle, setCle] = useState(ANCIENNE_BASE_CLE)
  const [reglage, setReglage] = useState(false)
  const [lecture, setLecture] = useState(false)
  const [base, setBase] = useState<AncienneBase | null>(null)
  const [propositions, setPropositions] = useState<Record<string, Proposition>>({})
  const [choix, setChoix] = useState<Record<string, string>>({})
  const [reglages, setReglages] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [etape, setEtape] = useState<{ nom: string; fait: number; total: number } | null>(null)
  const [rapport, setRapport] = useState<Rapport | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const preparer = (b: AncienneBase) => {
    const p = proposerCorrespondances(b.users, comptes)
    setBase(b)
    setPropositions(p)
    setChoix(Object.fromEntries(Object.entries(p).map(([id, x]) => [id, x.compte])))
    setReglages(!!b.settings)
    setRapport(null)
  }

  const lire = async () => {
    setErreur(null)
    setLecture(true)
    try {
      preparer(await lireAncienneBase(url, cle))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setLecture(false)
    }
  }

  const lireFichier = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErreur(null)
    try {
      preparer(lireFichierSauvegarde(await f.text()))
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  const resume = useMemo(() => {
    if (!base) return null
    const avecFichier = base.transactions.filter(t => typeof t.attachmentData === 'string' && t.attachmentData.startsWith('data:'))
    const octets = avecFichier.reduce((s, t) => s + Math.round(((t.attachmentData as string).length - (t.attachmentData as string).indexOf(',') - 1) * 0.75), 0)
    const entrees = base.transactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const sorties = base.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const parPersonne = new Map<string, number>()
    for (const t of base.transactions) parPersonne.set(String(t.userId || ''), (parPersonne.get(String(t.userId || '')) || 0) + 1)
    return { avecFichier: avecFichier.length, octets, entrees, sorties, parPersonne }
  }, [base])

  const lancer = async () => {
    if (!base) return
    setEnCours(true)
    setErreur(null)
    setRapport(null)
    try {
      const r = await executerReprise(base, choix, { reglages }, undefined, (nom, fait, total) => setEtape({ nom, fait, total }))
      setRapport(r)
      journal('IMPORT', `Reprise de l'ancienne application : ${r.mouvements.repris} mouvement(s), ${r.justificatifs.repris} justificatif(s), ${r.personnes.reprises} personne(s)`)
      onToast(r.erreurs.length ? `Reprise terminée avec ${r.erreurs.length} remarque(s).` : 'Reprise terminée.', r.erreurs.length ? 'info' : 'success')
      onTermine()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      onToast('La reprise s’est arrêtée : relancez-la, rien ne sera repris en double.', 'error')
      onTermine()
    } finally {
      setEnCours(false)
      setEtape(null)
    }
  }

  const sansCompte = base ? base.users.filter(u => !choix[u.id]).length : 0

  return (
    <div className="max-w-2xl space-y-5 fade-up" data-testid="lc-reprise">
      <div className={carte} style={ombre}>
        <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>
          Reprendre les données de l'ancienne application LECLAIRE
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Les mouvements, justificatifs, magasins, catégories, paramètres et l'historique de l'ancienne application sont copiés
          ici. L'ancienne base est seulement <strong>lue</strong> : rien n'y est modifié ni supprimé. La reprise peut être relancée
          sans créer de doublon (un mouvement déjà repris n'est pas réécrit).
        </p>
        <button
          onClick={lire}
          disabled={lecture || enCours}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
          style={{ background: 'var(--color-navy)', fontFamily: 'var(--font-display)' }}
          data-testid="lc-lire-ancienne"
        >
          {lecture ? 'Lecture de l’ancienne base…' : '1. Lire l’ancienne base LECLAIRE'}
        </button>
        <button type="button" onClick={() => setReglage(v => !v)} className="text-xs underline" style={{ color: 'var(--color-muted)' }}>
          {reglage ? 'Masquer' : 'Adresse de l’ancienne base / fichier de secours'}
        </button>
        {reglage && (
          <div className="space-y-2">
            <label className="block text-xs" style={{ color: 'var(--color-muted)' }}>Adresse du projet Supabase de l'ancienne application</label>
            <input value={url} onChange={e => setUrl(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            <label className="block text-xs" style={{ color: 'var(--color-muted)' }}>Clé publique (anon) de l'ancienne application</label>
            <input value={cle} onChange={e => setCle(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-xs font-mono" />
            <label className="block text-xs pt-2" style={{ color: 'var(--color-muted)' }}>
              Ou fichier de secours (.json) : dans le SQL Editor de l'ancien projet, exécutez
              <code className="mx-1">select json_agg(t) from kv_store_7bfd382c t;</code> puis enregistrez le résultat dans un fichier.
            </label>
            <input type="file" accept="application/json,.json,.txt" onChange={lireFichier} className="text-xs" />
          </div>
        )}
        {erreur && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--color-expense-light)', color: 'var(--color-expense)' }} data-testid="lc-reprise-erreur">{erreur}</p>}
      </div>

      {base && resume && (
        <div className={carte} style={ombre} data-testid="lc-reprise-resume">
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)' }}>2. Ce qui sera repris</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Mouvements', String(base.transactions.length)],
              ['Justificatifs', `${resume.avecFichier} (${taille(resume.octets)})`],
              ['Entrées', formatFCFA(resume.entrees, base.settings?.currency || 'FCFA')],
              ['Sorties', formatFCFA(resume.sorties, base.settings?.currency || 'FCFA')],
              ['Magasins', String(base.stores.length)],
              ['Personnes', String(base.users.length)],
              ['Catégories', String(base.categories.length)],
              ['Historique', `${base.auditLogs.length} ligne(s)`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl px-3 py-2" style={{ background: '#F8FAFC' }}>
                <p style={{ color: '#94A3B8' }}>{l}</p>
                <p className="font-semibold num" style={{ color: '#0F172A' }}>{v}</p>
              </div>
            ))}
          </div>

          <h4 className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: 'var(--color-muted)' }}>Compte OPTICLAIRE de chaque personne</h4>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            Proposé d'après l'e-mail (ou le nom). La personne retrouve ses mouvements en se connectant à OPTICLAIRE avec ce compte,
            une fois « Accès LECLAIRE » coché. Sans compte, ses mouvements sont repris quand même (visibles par l'administration)
            et pourront être rattachés plus tard (Utilisateurs → Rattacher à un compte).
          </p>
          <div className="space-y-2">
            {base.users.map(u => {
              const p = propositions[u.id]
              const c = comptes.find(x => x.compte === choix[u.id])
              return (
                <div key={u.id} className="rounded-xl border border-border px-3 py-2 space-y-1.5" data-testid="lc-reprise-personne">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{u.name}</span>
                    <span className="text-xs" style={{ color: '#94A3B8' }}>
                      {u.email || 'sans e-mail'} · {roleLabel(u.role)} · {resume.parPersonne.get(u.id) || 0} mouvement(s)
                    </span>
                  </div>
                  <select
                    value={choix[u.id] || ''}
                    onChange={e => setChoix(x => ({ ...x, [u.id]: e.target.value }))}
                    disabled={enCours}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="">— Aucun compte (reprise non rattachée) —</option>
                    {comptes.map(cp => <option key={cp.compte} value={cp.compte}>{cp.nom} ({cp.email}){cp.acces ? '' : ' — accès LECLAIRE non coché'}</option>)}
                  </select>
                  {choix[u.id] && p?.compte === choix[u.id] && p.par && (
                    <p className="text-xs" style={{ color: 'var(--color-income)' }}>Proposé : même {p.par === 'email' ? 'e-mail' : 'nom'}</p>
                  )}
                  {c && !c.acces && <p className="text-xs" style={{ color: '#C2410C' }}>Pensez à cocher « Accès LECLAIRE » sur la fiche de ce compte.</p>}
                </div>
              )
            })}
          </div>

          {base.settings && (
            <label className="flex items-center gap-2 text-xs pt-1" style={{ color: '#334155' }}>
              <input type="checkbox" checked={reglages} onChange={e => setReglages(e.target.checked)} disabled={enCours} />
              Reprendre aussi les paramètres (devise {base.settings.currency}, découvert {base.settings.allowOverdraft ? 'autorisé' : 'interdit'},
              justificatif {base.settings.requireAttachment ? 'obligatoire' : 'facultatif'}, nom « {base.settings.companyName} »)
            </label>
          )}

          <button
            onClick={lancer}
            disabled={enCours}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #059669, #10B981)', fontFamily: 'var(--font-display)' }}
            data-testid="lc-lancer-reprise"
          >
            {enCours ? 'Reprise en cours… gardez cette page ouverte' : `3. Lancer la reprise${sansCompte ? ` (${sansCompte} personne(s) sans compte)` : ''}`}
          </button>
          {etape && (
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>{etape.nom} : {etape.fait} / {etape.total}</p>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
                <div className="h-full" style={{ width: `${etape.total ? Math.round((etape.fait / etape.total) * 100) : 0}%`, background: 'var(--color-income)', transition: 'width .2s' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {rapport && (
        <div className={carte} style={ombre} data-testid="lc-reprise-rapport">
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-income)' }}>Reprise terminée</h3>
          <ul className="text-xs space-y-1" style={{ color: '#334155' }}>
            <li>Mouvements repris : <strong>{rapport.mouvements.repris}</strong>{rapport.mouvements.dejaPresents ? ` · déjà présents : ${rapport.mouvements.dejaPresents}` : ''}{rapport.mouvements.ignores ? ` · ignorés : ${rapport.mouvements.ignores}` : ''}</li>
            <li>Justificatifs repris : <strong>{rapport.justificatifs.repris}</strong>{rapport.justificatifs.echecs ? ` · non repris : ${rapport.justificatifs.echecs}` : ''}</li>
            <li>Personnes ajoutées : {rapport.personnes.reprises} (rattachées à un compte : {rapport.personnes.rattachees}, sans compte : {rapport.personnes.sansCompte})</li>
            <li>Magasins ajoutés : {rapport.magasins} · catégories ajoutées : {rapport.categories}{rapport.reglages ? ' · paramètres repris' : ''}</li>
            <li>Lignes d'historique reprises : {rapport.historique}</li>
          </ul>
          {rapport.erreurs.length > 0 && (
            <div className="rounded-lg px-3 py-2 space-y-1" style={{ background: '#FFF7ED' }}>
              <p className="text-xs font-semibold" style={{ color: '#C2410C' }}>Remarques ({rapport.erreurs.length})</p>
              {rapport.erreurs.slice(0, 50).map((e, i) => <p key={i} className="text-xs" style={{ color: '#9A3412' }}>{e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
