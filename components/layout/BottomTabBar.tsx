'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { ROUTES } from '@/lib/constants/routes'

const BASE_TABS = [
  {
    href: ROUTES.DASHBOARD,
    label: 'Dashboard',
    icon: (active: boolean) => (
      <svg
        className="w-5 h-5"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </svg>
    ),
  },
  {
    href: ROUTES.MERCADO,
    label: 'Mercado',
    icon: (active: boolean) => (
      <svg
        className="w-5 h-5"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
        />
      </svg>
    ),
  },
  {
    href: ROUTES.PORTFOLIO,
    label: 'Carteira',
    icon: (active: boolean) => (
      <svg
        className="w-5 h-5"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
        />
      </svg>
    ),
  },
  {
    href: ROUTES.NOTICIAS,
    label: 'Noticias',
    icon: (active: boolean) => (
      <svg
        className="w-5 h-5"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
        />
      </svg>
    ),
  },
  {
    href: ROUTES.LIGAS,
    label: 'Ligas',
    icon: (active: boolean) => (
      <svg
        className="w-5 h-5"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"
        />
      </svg>
    ),
  },
  {
    href: ROUTES.PERFIL,
    label: 'Perfil',
    icon: (active: boolean) => (
      <svg
        className="w-5 h-5"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
    ),
  },
]

/**
 * Barra de navegacao inferior — presente em todas as telas autenticadas.
 * Altura 56px + padding bottom para safe area (iOS notch/home indicator).
 */
export function BottomTabBar() {
  const pathname = usePathname()
  const currentPath = pathname ?? ''
  const tabs = BASE_TABS

  return (
    <nav
      aria-label="Navegacao principal"
      className="fixed bottom-0 left-0 right-0 z-sticky bg-bg-surface border-t border-border-default pb-safe md:hidden"
    >
      <div className="flex h-14">
        {tabs.map((tab) => {
          const isActive =
            currentPath === tab.href ||
            (tab.href !== ROUTES.DASHBOARD && currentPath.startsWith(tab.href))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5',
                'min-w-[44px] min-h-[44px]',
                'transition-colors duration-fast',
                isActive ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {tab.icon(isActive)}
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
