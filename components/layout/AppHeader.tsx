import Link from 'next/link'
import { ROUTES } from '@/lib/constants/routes'

/** Header do app autenticado com logo, indicador de sessao e notificacoes */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-sticky bg-bg-surface/90 backdrop-blur-sm border-b border-border-default">
      <div className="flex items-center justify-between h-14 px-4">
        <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2">
          <span className="text-lg font-bold text-accent">FS</span>
          <span className="text-sm font-semibold text-text-primary hidden sm:block">
            Foot Stock
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {/* SessionIndicator — placeholder — implementado em module-7 */}
          <div
            className="w-2 h-2 rounded-full bg-session-negociacao"
            aria-hidden="true"
            title="Mercado aberto"
          />

          {/* NotificationBell — placeholder — implementado em modulo de notificacoes */}
          <Link
            href={ROUTES.NOTIFICACOES}
            className="w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-card transition-colors"
            aria-label="Notificacoes"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  )
}
