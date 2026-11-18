/**
 * LECLAIRE — affichage des justificatifs rangés dans l'espace privé
 * « leclaire-justificatifs ». Le fichier est chargé à la demande :
 *  - photo : affichée en contenu `data:` (la politique de sécurité du site
 *    n'autorise pas les images `blob:`) ;
 *  - PDF : affiché dans un cadre en `blob:` (autorisé pour les cadres).
 * Un justificatif tout juste choisi (pas encore enregistré) est affiché tel quel.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Transaction } from '../types'
import { lireJustificatif } from '../leclaireService'

type Etat = { etat: 'vide' | 'chargement' | 'pret' | 'erreur'; url?: string; type?: string; erreur?: string }

const estPdf = (type?: string, nom?: string) => type === 'application/pdf' || /\.pdf$/i.test(nom || '')

const lireEnDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result || ''))
  r.onerror = () => reject(r.error || new Error('Lecture du fichier impossible.'))
  r.readAsDataURL(b)
})

/** Contenu affichable du justificatif d'un mouvement. */
export function useJustificatif(t: Pick<Transaction, 'attachmentPath' | 'attachmentData' | 'attachmentType' | 'attachmentName'> | null | undefined, actif = true): Etat {
  const [etat, setEtat] = useState<Etat>({ etat: 'vide' })
  const chemin = t?.attachmentPath
  const direct = t?.attachmentData
  const type = t?.attachmentType
  const nom = t?.attachmentName
  useEffect(() => {
    if (direct) { setEtat({ etat: 'pret', url: direct, type }); return }
    if (!chemin || !actif) { setEtat({ etat: 'vide' }); return }
    let annule = false
    let urlBlob: string | undefined
    setEtat({ etat: 'chargement' })
    lireJustificatif(chemin)
      .then(async (blob) => {
        const leType = type || blob.type
        if (estPdf(leType, nom)) {
          urlBlob = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }))
          if (annule) { URL.revokeObjectURL(urlBlob); return }
          setEtat({ etat: 'pret', url: urlBlob, type: 'application/pdf' })
        } else {
          const url = await lireEnDataUrl(leType && blob.type !== leType ? new Blob([blob], { type: leType }) : blob)
          if (!annule) setEtat({ etat: 'pret', url, type: leType })
        }
      })
      .catch((e) => { if (!annule) setEtat({ etat: 'erreur', erreur: e instanceof Error ? e.message : String(e) }) })
    return () => { annule = true; if (urlBlob) URL.revokeObjectURL(urlBlob) }
  }, [chemin, direct, type, nom, actif])
  return etat
}

/** Le mouvement a-t-il un justificatif (enregistré ou en cours de saisie) ? */
export const aJustificatif = (t: Pick<Transaction, 'attachmentPath' | 'attachmentData'>) => !!(t.attachmentPath || t.attachmentData)

function Message({ children, couleur = 'var(--color-muted)' }: { children: ReactNode; couleur?: string }) {
  return <p className="text-xs text-center py-6 px-3" style={{ color: couleur }}>{children}</p>
}

/** Aperçu en grand (photo ou PDF). */
export function ApercuFichier({ t }: { t: Transaction }) {
  const e = useJustificatif(t)
  if (e.etat === 'chargement' || e.etat === 'vide') return <Message>Chargement du justificatif…</Message>
  if (e.etat === 'erreur') return <Message couleur="var(--color-expense)">{e.erreur}</Message>
  return estPdf(e.type, t.attachmentName)
    ? <iframe src={e.url} className="w-full h-96 rounded" title={t.attachmentName} />
    : <img src={e.url} alt={t.attachmentName} className="max-w-full mx-auto rounded" />
}

/** Vignette (liste des justificatifs) : chargée quand elle devient visible. */
export function Miniature({ t }: { t: Transaction }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const obs = new IntersectionObserver((entrees) => {
      if (entrees.some(x => x.isIntersecting)) { setVisible(true); obs.disconnect() }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])
  const e = useJustificatif(t, visible)
  return (
    <div ref={ref} className="w-full h-full flex items-center justify-center">
      {e.etat === 'pret'
        ? <img src={e.url} alt={t.attachmentName} className="w-full h-full object-cover" />
        : e.etat === 'erreur'
          ? <span className="text-xs px-2 text-center" style={{ color: 'var(--color-expense)' }}>Justificatif illisible</span>
          : <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Chargement…</span>}
    </div>
  )
}

/** Bouton « télécharger » : charge le fichier au clic puis l'enregistre. */
export function BoutonTelecharger({ t, className, style, children }: { t: Transaction; className?: string; style?: CSSProperties; children: ReactNode }) {
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const telecharger = async () => {
    setErreur(null)
    let url = t.attachmentData
    let aRevoquer: string | undefined
    try {
      setOccupe(true)
      if (!url && t.attachmentPath) {
        const blob = await lireJustificatif(t.attachmentPath)
        url = aRevoquer = URL.createObjectURL(blob)
      }
      if (!url) return
      const a = document.createElement('a')
      a.href = url
      a.download = t.attachmentName || 'justificatif'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setOccupe(false)
      if (aRevoquer) setTimeout(() => URL.revokeObjectURL(aRevoquer!), 30000)
    }
  }
  return (
    <button type="button" onClick={telecharger} disabled={occupe} className={className} style={style} title={erreur || 'Télécharger le justificatif'}>
      {occupe ? '…' : erreur ? '⚠' : children}
    </button>
  )
}
