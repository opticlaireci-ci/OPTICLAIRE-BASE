import { useState, type ReactNode } from 'react'
import type { User, View } from '../types'
import { isPrivilegedRole } from '../types'
import { roleLabel } from '../outils'
import Logo from './Logo'

interface NavItem {
  id: View
  label: string
  icon: ReactNode
  adminOnly?: boolean
}

const mainNav: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    id: 'movements',
    label: 'Mouvements',
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  },
  {
    id: 'stores',
    label: 'Magasins',
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 20v-6h6v6" /></svg>,
  },
  {
    id: 'statistics',
    label: 'Statistiques',
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
  {
    id: 'categories',
    label: 'Catégories',
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
  },
  {
    id: 'justificatifs',
    label: 'Justificatifs',
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>,
  },
]

const secondaryNav: NavItem[] = [
  {
    id: 'history',
    label: 'Historique',
    adminOnly: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    id: 'users',
    label: 'Utilisateurs',
    adminOnly: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  },
  {
    id: 'import',
    label: 'Reprise des données',
    adminOnly: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
  },
  {
    id: 'settings',
    label: 'Paramètres',
    adminOnly: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
]

const viewTitles: Record<View, string> = {
  dashboard: 'Tableau de bord',
  movements: 'Mouvements',
  stores: 'Magasins',
  statistics: 'Statistiques',
  categories: 'Récap par catégorie',
  justificatifs: 'Justificatifs',
  history: 'Historique des actions',
  users: 'Gestion des utilisateurs',
  settings: 'Paramètres',
  import: 'Reprise des données',
}

interface Props {
  currentUser: User
  view: View
  onChangeView: (v: View) => void
  onLogout: () => void
  /** Revenir à OPTICLAIRE (sans se déconnecter). */
  onRetour: () => void
  children: ReactNode
}

function NavBtn({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-left transition-all duration-150 group relative"
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
        color: active ? 'white' : 'rgba(255,255,255,0.45)',
        fontWeight: active ? 600 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'
          ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'
        }
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
          style={{ background: '#38BDF8' }}
        />
      )}
      <span className="flex-shrink-0">{item.icon}</span>
      <span style={{ fontFamily: active ? 'var(--font-display)' : 'var(--font-sans)' }}>{item.label}</span>
    </button>
  )
}

export default function Layout({ currentUser, view, onChangeView, onLogout, onRetour, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebar = (
    <div
      className="flex flex-col h-full select-none"
      style={{ background: 'linear-gradient(180deg, #0B1D3A 0%, #091628 100%)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <div>
            <Logo size={34} variant="dark" />
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', letterSpacing: '0.18em', fontFamily: 'var(--font-display)', marginTop: '6px' }}>
              GESTION FINANCIÈRE
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {mainNav.map((item) => (
          <NavBtn
            key={item.id}
            item={item}
            active={view === item.id}
            onClick={() => { onChangeView(item.id); setMobileOpen(false) }}
          />
        ))}

        {isPrivilegedRole(currentUser.role) && (
          <>
            <div className="my-3 mx-1" style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />
            {secondaryNav.map((item) => (
              <NavBtn
                key={item.id}
                item={item}
                active={view === item.id}
                onClick={() => { onChangeView(item.id); setMobileOpen(false) }}
              />
            ))}
          </>
        )}
      </nav>

      {/* User area */}
      <div className="px-3 pb-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
        {/* Data shared notice */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
          style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.15)' }}
        >
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#38BDF8' }} />
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
            {isPrivilegedRole(currentUser.role)
              ? 'Vue globale : tous les utilisateurs'
              : 'Vos données personnelles uniquement'}
          </p>
        </div>

        {/* User */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1D6FA4, #0EA5E9)', color: 'white', fontFamily: 'var(--font-display)' }}
          >
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: 'var(--font-display)' }}>{currentUser.name}</p>
            <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {roleLabel(currentUser.role)}
            </p>
          </div>
        </div>

        <button
          onClick={() => { setMobileOpen(false); onRetour() }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 mb-1"
          style={{ color: 'rgba(255,255,255,0.75)', background: 'rgba(56,189,248,0.12)' }}
          data-testid="lc-retour-opticlaire"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span style={{ fontFamily: 'var(--font-display)' }}>Retour à OPTICLAIRE</span>
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.12)'
            ;(e.currentTarget as HTMLElement).style.color = '#FCA5A5'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span style={{ fontFamily: 'var(--font-display)' }}>Déconnexion</span>
        </button>
      </div>
    </div>
  )

  return (
    // Téléphone et tablette : pleine largeur, menu par le bouton ☰ et barre du
    // bas. Ordinateur (écran large) : menu toujours affiché à gauche et contenu
    // sur toute la largeur (les écrans passent alors en mise en page large).
    <div className="w-full flex" style={{ height: '100dvh', background: 'var(--color-surface)' }}>
      <aside className="hidden lg:block w-[248px] flex-shrink-0 h-full" data-testid="lc-menu-fixe">{sidebar}</aside>
      <div
        className="relative flex-1 min-w-0 flex flex-col overflow-hidden"
        style={{ height: '100dvh', background: 'var(--color-surface)' }}
      >
        {/* Navigation drawer (opened via the hamburger) */}
        {mobileOpen && (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <div className="relative w-[232px] h-full z-10">{sidebar}</div>
          </div>
        )}

        {/* Top bar */}
        <header
          className="h-14 flex items-center justify-between px-4 flex-shrink-0"
          style={{
            background: 'white',
            borderBottom: '1px solid var(--color-border)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="p-2 rounded-xl transition-colors lg:hidden"
              style={{ color: 'var(--color-navy)' }}
              onClick={() => setMobileOpen(true)}
              aria-label="Menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1
              className="text-sm lg:text-base font-semibold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-navy)', letterSpacing: '0.01em' }}
            >
              {viewTitles[view]}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onRetour}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)', fontFamily: 'var(--font-display)' }}
              title="Revenir à OPTICLAIRE"
            >
              ← OPTICLAIRE
            </button>
            <Logo size={22} />
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #0B1D3A, #152D58)', color: 'white', fontFamily: 'var(--font-display)' }}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 lg:px-8 lg:py-6">
          <div className="w-full max-w-[1200px] mx-auto">{children}</div>
        </main>

        {/* Barre du bas : téléphone et tablette (sur ordinateur, le menu de gauche la remplace) */}
        <nav
          className="absolute bottom-0 left-0 right-0 z-30 flex items-stretch lg:hidden"
          style={{
            background: 'white',
            borderTop: '1px solid var(--color-border)',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {[
          {
            id: 'dashboard' as View,
            label: 'Accueil',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
          },
          {
            id: 'movements' as View,
            label: 'Mouvements',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
          },
          {
            id: 'stores' as View,
            label: 'Magasins',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 20v-6h6v6" /></svg>,
          },
          {
            id: 'statistics' as View,
            label: 'Stats',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
          },
        ].map(({ id, label, icon }) => {
          const active = view === id
          return (
            <button
              key={id}
              onClick={() => { onChangeView(id); setMobileOpen(false) }}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors"
              style={{ color: active ? 'var(--color-navy)' : '#94A3B8' }}
            >
              <span style={{ color: active ? 'var(--color-blue)' : '#94A3B8' }}>{icon}</span>
              <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem' }}>{label}</span>
              {active && <span className="w-1 h-1 rounded-full" style={{ background: 'var(--color-blue)' }} />}
            </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
