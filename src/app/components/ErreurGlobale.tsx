import { Component, type ReactNode } from 'react';

/**
 * FILET DE SÉCURITÉ GLOBAL
 *
 * Sans lui, la moindre erreur d'affichage dans une page démonte TOUTE
 * l'application → écran blanc, sans explication. Ici on affiche un message
 * clair avec un bouton « Recharger ». Une première erreur déclenche aussi un
 * rechargement automatique (une seule fois par minute, pour éviter les boucles) :
 * c'est le cas typique d'une page restée ouverte pendant une mise à jour du site.
 */
const CLE_RECHARGEMENT = 'opticlaire_erreur_rechargee_a';

export class ErreurGlobale extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null };

  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }

  componentDidCatch(erreur: Error) {
    console.error('Erreur d’affichage :', erreur);
    try {
      const derniere = Number(localStorage.getItem(CLE_RECHARGEMENT) || 0);
      if (Date.now() - derniere > 60_000) {
        localStorage.setItem(CLE_RECHARGEMENT, String(Date.now()));
        // Une copie locale abîmée est une cause fréquente : on la nettoie
        // avant de recharger (session et ventes non envoyées conservées).
        const reparation: Promise<void> = (window as any).__opticlaireReparer?.('caches') || Promise.resolve();
        reparation.finally(() => setTimeout(() => window.location.reload(), 500));
      }
    } catch { /* stockage indisponible : l'utilisateur rechargera via le bouton */ }
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#d6e4ea', color: '#1a6f8c', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Un problème d’affichage est survenu</div>
        <div style={{ fontSize: 14, maxWidth: 420 }}>Vos données ne sont pas perdues. Rechargez la page pour continuer.</div>
        <button
          onClick={() => {
            const reparation: Promise<void> = (window as any).__opticlaireReparer?.('caches') || Promise.resolve();
            reparation.finally(() => window.location.reload());
          }}
          style={{ padding: '10px 24px', borderRadius: 8, border: 0, background: '#1a7a96', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Recharger
        </button>
      </div>
    );
  }
}
