/**
 * Éléments communs aux onglets « Point hebdomadaire » et « Point Mobile Money »
 * de la page Mouvement : case de montant modifiable, nom modifiable, choix de
 * la semaine, données d'OPTICLAIRE de la semaine.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useLiveData } from '../../../hooks/useLiveData';
import { getMagasins, EVENEMENT_MAGASINS } from '../../../constants/magasins';
import { TENANT } from '../../../config/tenant';
import { chargerTousLesReglements, type ReglementSupabase } from '../../../services/reglementsService';
import type { VenteSupabase } from '../../../services/ventesService';
import { setVisibleInterval, PAGE_POLL_MS } from '../../../utils/visibleInterval';
import { ajouterJours, aujourdhui, libelleSemaine, lundiDe, type DonneesSemaine, type MagasinPoint, type MouvementAdministrationRecap, type MouvementCaisseRecap } from '../../../utils/pointsSemaine';

export const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/** Lit un montant tapé : « 1 200 000 », « 1.200.000 », « 15000 F »… */
export function lireMontant(texte: string): number | null {
  const t = String(texte || '').replace(/[\s  ]/g, '').replace(/f(cfa)?$/i, '');
  if (!t) return null;
  const neg = t.startsWith('-');
  const chiffres = t.replace(/[^0-9]/g, '');
  if (!chiffres) return null;
  return (neg ? -1 : 1) * Number(chiffres);
}

/**
 * Montant modifiable. Vider la case remet le calcul automatique ; Entrée ou
 * clic ailleurs enregistre. Une case modifiée à la main est en jaune.
 */
export function ChampMontant({
  valeur, auto, modifie, onChange, lectureSeule, style, testId, titre, gras,
}: {
  valeur: number;
  /** Montant calculé (absent : case sans calcul automatique). */
  auto?: number;
  modifie?: boolean;
  /** null : revenir au calcul automatique (ou vider une case sans calcul). */
  onChange: (v: number | null) => void;
  lectureSeule?: boolean;
  style?: CSSProperties;
  testId?: string;
  titre?: string;
  gras?: boolean;
}) {
  const [texte, setTexte] = useState<string | null>(null);
  // Texte au moment du clic : cliquer puis repartir sans rien changer n'enregistre rien.
  const [initial, setInitial] = useState('');
  const affiche = texte ?? (valeur ? fmt(valeur) : (auto === undefined ? '' : '0'));
  const info = titre ?? (modifie && auto !== undefined ? `Modifié à la main (calcul automatique : ${fmt(auto)}). Videz la case pour revenir au calcul.` : undefined);
  const base: CSSProperties = {
    width: '100%', minWidth: 0, background: modifie ? '#FEF08A' : 'transparent', border: 0, outline: 'none',
    textAlign: 'center', fontWeight: gras === false ? 500 : 700, fontVariantNumeric: 'tabular-nums', padding: '2px 4px',
    color: 'inherit', borderRadius: 3, ...style,
  };
  if (lectureSeule) return <span style={{ ...base, display: 'block' }} title={info} data-testid={testId}>{valeur ? fmt(valeur) : '0'}</span>;
  const valider = () => {
    if (texte === null) return;
    if (texte.trim() === initial.trim()) { setTexte(null); return; }
    const v = lireMontant(texte);
    setTexte(null);
    if (v === null) { onChange(null); return; }
    onChange(auto !== undefined && v === auto ? null : v);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={affiche}
      title={info}
      data-testid={testId}
      onFocus={e => { const t = valeur ? String(valeur) : ''; setTexte(t); setInitial(t); requestAnimationFrame(() => e.target.select()); }}
      onChange={e => setTexte(e.target.value)}
      onBlur={valider}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setTexte(null); (e.target as HTMLInputElement).blur(); }
      }}
      style={base}
    />
  );
}

/** Nom modifiable (titre d'officine, de colonne, de ligne…). */
export function NomModifiable({ valeur, onChange, lectureSeule, style, testId, placeholder }: {
  valeur: string; onChange: (v: string) => void; lectureSeule?: boolean; style?: CSSProperties; testId?: string; placeholder?: string;
}) {
  const [texte, setTexte] = useState<string | null>(null);
  const base: CSSProperties = { width: '100%', minWidth: 0, background: 'transparent', border: 0, outline: 'none', font: 'inherit', color: 'inherit', textAlign: 'inherit', padding: 0, ...style };
  if (lectureSeule) return <span style={base} data-testid={testId}>{valeur}</span>;
  return (
    <input
      type="text"
      value={texte ?? valeur}
      placeholder={placeholder}
      data-testid={testId}
      title="Cliquer pour modifier"
      onFocus={() => setTexte(valeur)}
      onChange={e => setTexte(e.target.value)}
      onBlur={() => { if (texte !== null) { const v = texte.trim(); setTexte(null); if (v && v !== valeur) onChange(v); } }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setTexte(null); (e.target as HTMLInputElement).blur(); }
      }}
      style={base}
    />
  );
}

/** Titre du point : passe à la ligne (téléphone) ; ✎ pour le changer. */
export function TitrePoint({ titre, editable, onChange }: { titre: string; editable: boolean; onChange: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
      <h2 className="text-base font-bold text-gray-800" style={{ textAlign: 'center', margin: 0, overflowWrap: 'anywhere' }} data-testid="point-titre">{titre}</h2>
      {editable && (
        <PetitBouton titre="Modifier le titre" testId="point-titre-modifier" style={{ fontSize: 15 }} onClick={() => {
          const t = window.prompt('Titre du point (imprimé en haut de la page)', titre);
          if (t !== null && t.trim() && t.trim() !== titre) onChange(t.trim());
        }}>✎</PetitBouton>
      )}
    </div>
  );
}

/** Petit bouton d'action (déplacer, retirer, ajouter une ligne…). */
export function PetitBouton({ onClick, titre, children, style, testId }: { onClick: () => void; titre: string; children: ReactNode; style?: CSSProperties; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      data-testid={testId}
      data-sans-anti-double
      className="no-print"
      style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '0 3px', lineHeight: 1, color: 'inherit', opacity: 0.7, fontSize: 12, ...style }}
    >
      {children}
    </button>
  );
}

/** Bouton « + Ajouter … » (hors du blocage anti double-clic d'OPTICLAIRE : aucun envoi réseau direct). */
export function BoutonAjouter({ onClick, children, testId }: { onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-sans-anti-double
      data-testid={testId}
      className="px-3 py-1.5 rounded text-xs font-semibold border border-dashed border-gray-400 text-gray-600 hover:bg-gray-50"
    >
      {children}
    </button>
  );
}

/** Choix de la semaine + titre + bouton Imprimer. */
export function BarreSemaine({ semaine, onSemaine, onImprimer, enfants, testId }: {
  semaine: string; onSemaine: (s: string) => void; onImprimer: () => void; enfants?: ReactNode; testId?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-2 flex-wrap" data-testid={testId}>
      <button type="button" data-sans-anti-double onClick={() => onSemaine(ajouterJours(semaine, -7))} className="px-2 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50" title="Semaine précédente" aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
      <input
        type="date"
        className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        value={semaine}
        onChange={e => e.target.value && onSemaine(lundiDe(e.target.value))}
        aria-label="Semaine (n'importe quel jour de la semaine)"
        data-testid="point-semaine"
      />
      <button type="button" data-sans-anti-double onClick={() => onSemaine(ajouterJours(semaine, 7))} className="px-2 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50" title="Semaine suivante" aria-label="Semaine suivante"><ChevronRight size={16} /></button>
      <button type="button" data-sans-anti-double onClick={() => onSemaine(lundiDe(aujourdhui()))} className="px-2 py-1.5 rounded border border-gray-300 text-xs hover:bg-gray-50">Cette semaine</button>
      <span className="text-sm font-semibold text-gray-700">{libelleSemaine(semaine, 7)}</span>
      <div className="flex items-center gap-2 flex-wrap" style={{ marginLeft: 'auto' }}>
        {enfants}
        <button type="button" onClick={onImprimer} data-testid="point-imprimer" className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm font-semibold" style={{ backgroundColor: '#475569' }}>
          <Printer size={15} /> Imprimer
        </button>
      </div>
    </div>
  );
}

/** Magasins d'OPTICLAIRE (liste à jour : un magasin ajouté apparaît seul). */
export function useMagasinsPoint(): MagasinPoint[] {
  const lire = () => getMagasins().map(m => ({ id: String(m.id), label: String(m.label || m.id) }));
  const [magasins, setMagasins] = useState<MagasinPoint[]>(lire);
  useEffect(() => {
    const maj = () => { const s = lire(); setMagasins(p => (JSON.stringify(p) === JSON.stringify(s) ? p : s)); };
    window.addEventListener(EVENEMENT_MAGASINS, maj);
    window.addEventListener('storage', maj);
    window.addEventListener('focus', maj);
    return () => {
      window.removeEventListener(EVENEMENT_MAGASINS, maj);
      window.removeEventListener('storage', maj);
      window.removeEventListener('focus', maj);
    };
  }, []);
  return magasins;
}

/**
 * Données d'OPTICLAIRE nécessaires aux points (règlements clients, entrées de
 * caisse). Les ventes et les mouvements de la comptabilité viennent de la page
 * Mouvement. Les règlements des assurances ne sont pas lus.
 */
export function useDonneesPoints(semaine: string, ventes: VenteSupabase[], mouvementsAdministration: MouvementAdministrationRecap[]): { donnees: DonneesSemaine; pret: boolean } {
  const magasins = useMagasinsPoint();
  const [reglements, setReglements] = useState<ReglementSupabase[] | null>(null);
  const [mouvementsCaisse] = useLiveData<MouvementCaisseRecap>('leclaire_mouvements_caisse', []);
  useEffect(() => {
    let annule = false;
    const load = () => chargerTousLesReglements()
      .then(rows => { if (!annule) setReglements(rows); })
      .catch(() => { if (!annule) setReglements(r => r ?? []); });
    load();
    const stop = setVisibleInterval(load, PAGE_POLL_MS);
    window.addEventListener('reglements-updated', load);
    return () => { annule = true; stop(); window.removeEventListener('reglements-updated', load); };
  }, []);
  const donnees = useMemo<DonneesSemaine>(() => ({
    semaine,
    tenant: TENANT.nom,
    magasins,
    ventes,
    reglements: reglements || [],
    mouvementsCaisse: mouvementsCaisse || [],
    mouvementsAdministration: mouvementsAdministration || [],
  }), [semaine, magasins, ventes, reglements, mouvementsCaisse, mouvementsAdministration]);
  return { donnees, pret: reglements !== null };
}

/** Échappe un texte pour le document imprimé. */
export function echapper(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Déplace un élément d'une liste (sens -1 / +1). */
export function deplacer<T>(liste: T[], index: number, sens: number): T[] {
  const j = index + sens;
  if (j < 0 || j >= liste.length) return liste;
  const l = [...liste];
  [l[index], l[j]] = [l[j], l[index]];
  return l;
}

/** « Modifié par X le 22/11/2026 à 10:15 » */
export function ligneAudit(doc: { createdBy?: string; createdAt?: string; updatedBy?: string; updatedAt?: string } | undefined): string {
  if (!doc) return 'Calculé automatiquement — rien n’a encore été modifié à la main pour cette semaine.';
  const quand = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : ` le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  if (doc.updatedBy) return `Modifié par ${doc.updatedBy}${quand(doc.updatedAt)}`;
  if (doc.createdBy) return `Modifié par ${doc.createdBy}${quand(doc.createdAt)}`;
  return '';
}
