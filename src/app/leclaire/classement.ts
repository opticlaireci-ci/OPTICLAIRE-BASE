/**
 * LECLAIRE — classement automatique des mouvements déjà enregistrés sans
 * magasin, et magasin proposé à la saisie.
 *
 * Pour chaque mouvement sans magasin (ou dont le magasin n'existe plus) :
 *  1. le nom de magasin enregistré avec le mouvement (magasin supprimé ou
 *     renommé depuis) ;
 *  2. sinon le magasin cité dans sa description, son commentaire ou son
 *     bénéficiaire (« CAUTION MAGASIN BINGERVILLE ») ;
 *  3. sinon le magasin des autres mouvements de la MÊME PERSONNE à la même
 *     période (45 jours au plus) : une mission, des travaux.
 * Un magasin reconnu qui n'existe pas encore dans LECLAIRE est proposé à la
 * création.
 */
import type { Shop, Transaction } from './types'
import { catalogueMagasins, coeur, deduireParPeriode, reconnaitre, type MagasinConnu } from './reconnaissance'
import { magasinDuMouvement } from './importFichier'

export interface Proposition {
  mouvement: Transaction
  magasin: MagasinConnu
  origine: 'nom-enregistre' | 'mention' | 'nom' | 'periode'
  /** Mouvement de la même période qui a donné le magasin. */
  depuis?: Transaction
}

export function proposerClassement(transactions: Transaction[], magasins: Shop[], opticlaire: string[] = []): Proposition[] {
  const cat = catalogueMagasins(magasins, opticlaire)
  const parId = new Map(cat.filter(m => m.id).map(m => [m.id as string, m]))
  const nouveaux = new Map<string, MagasinConnu>()
  const unique = (m: MagasinConnu) => (m.id ? m : (nouveaux.get(m.cle) || (nouveaux.set(m.cle, m), m)))

  const etats = transactions.map(t => {
    const existant = magasinDuMouvement(t, magasins)
    if (existant) return { magasin: parId.get(existant.id) || null, origine: null as Proposition['origine'] | null, aClasser: false }
    if (t.storeName && t.storeName.trim()) {
      // Magasin supprimé ou renommé : même cœur de nom qu'un magasin LECLAIRE,
      // sinon recréé sous son nom exact.
      const cle = coeur(t.storeName)
      const m = cat.find(x => x.id && x.cle === cle) || { cle, nom: t.storeName.trim(), id: null, source: 'enregistre' as const }
      return { magasin: unique(m), origine: 'nom-enregistre' as const, aClasser: true }
    }
    const r = reconnaitre([t.description, t.comment, t.beneficiaryOrSource], cat, true)
    return { magasin: r.magasin ? unique(r.magasin) : null, origine: r.magasin ? (r.par as 'mention' | 'nom') : null, aClasser: true }
  })
  // Même personne, même période : les mouvements déjà rattachés servent de repère.
  const refs = deduireParPeriode(transactions.map((t, i) => ({ date: t.date, groupe: t.userId, cle: etats[i].magasin?.cle || null })))

  const out: Proposition[] = []
  transactions.forEach((t, i) => {
    const e = etats[i]
    if (!e.aClasser) return
    if (e.magasin && e.origine) out.push({ mouvement: t, magasin: e.magasin, origine: e.origine })
    else if (refs[i] >= 0 && etats[refs[i]].magasin) out.push({ mouvement: t, magasin: etats[refs[i]].magasin as MagasinConnu, origine: 'periode', depuis: transactions[refs[i]] })
  })
  return out
}

/**
 * Magasin proposé à la saisie d'un mouvement : celui cité dans le texte
 * (magasin LECLAIRE existant), sinon null.
 */
export function magasinCite(textes: string | string[], magasins: Shop[]): Shop | null {
  const r = reconnaitre(textes, catalogueMagasins(magasins, [], []), false)
  return r.magasin?.id ? magasins.find(m => m.id === r.magasin!.id) || null : null
}

/** Magasin habituel d'une personne : celui de son mouvement le plus récent. */
export function magasinHabituel(transactions: Transaction[], personneId: string, magasins: Shop[]): Shop | null {
  let meilleur: { t: Transaction; m: Shop } | null = null
  for (const t of transactions) {
    if (t.userId !== personneId) continue
    const m = magasinDuMouvement(t, magasins)
    if (!m) continue
    if (!meilleur || t.date > meilleur.t.date || (t.date === meilleur.t.date && t.createdAt > meilleur.t.createdAt)) meilleur = { t, m }
  }
  return meilleur?.m ?? null
}
