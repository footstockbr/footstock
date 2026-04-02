'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { ROUTES } from '@/lib/constants/routes'
import { signOut } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export function DesktopSidebar() {
  const pathname = usePathname()
  const currentPath = pathname ?? ''
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { data: user } = useCurrentUser()
  const isAdminAccount = Boolean(user?.adminRole)

  const items = [
    { href: ROUTES.DASHBOARD, label: 'Dashboard' },
    { href: ROUTES.MERCADO, label: 'Mercado' },
    { href: ROUTES.PORTFOLIO, label: 'Carteira' },
    { href: ROUTES.NOTICIAS, label: 'Noticias' },
    { href: ROUTES.LIGAS, label: 'Ligas' },
    { href: ROUTES.PERFIL, label: 'Perfil' },
    ...(isAdminAccount ? [{ href: ROUTES.ADMIN, label: 'Admin' }] : []),
  ]

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)

    try {
      await signOut()
    } catch {
      setIsLoggingOut(false)
    }
  }

  return (
    <aside className="hidden md:flex md:w-64 md:h-dvh md:sticky md:top-0 md:self-start md:flex-col md:border-r md:border-border-default md:bg-bg-surface/70 md:relative md:z-40 md:pointer-events-auto md:overflow-hidden">
      <div className="h-14 border-b border-border-default px-4 flex items-center">
        <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2">
          <Image
            src="/logo-foot.png"
            alt="Foot Stock"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
            priority
          />
          <span className="text-sm font-semibold text-text-primary">Foot Stock</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Menu principal desktop">
        {items.map((item) => {
          const isActive = currentPath === item.href || (item.href !== ROUTES.DASHBOARD && currentPath.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center rounded-md px-3 py-2 text-sm min-h-[44px] transition-colors',
                isActive
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-border-default p-3">
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className={cn(
            'w-full rounded-md px-3 py-2 text-sm min-h-[44px] text-left transition-colors',
            isLoggingOut
              ? 'cursor-not-allowed text-text-muted bg-bg-card/40'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          )}
        >
          {isLoggingOut ? 'Saindo...' : 'Sair'}
        </button>
      </div>
    </aside>
  )
}
