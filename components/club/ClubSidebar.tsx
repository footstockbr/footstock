'use client'
// ============================================================================
// Foot Stock — ClubSidebar
// Sidebar do portal do clube parceiro com nav e logout.
// Rastreabilidade: INT-084, US-025, TASK-1/ST001
// ============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { signOut } from '@/lib/auth'
import { ROUTES } from '@/lib/constants/routes'

const NAV_ITEMS = [
  { href: ROUTES.CLUB, label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
]

export function ClubSidebar() {
  const pathname = usePathname()
  const currentPath = pathname ?? ''
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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
    <>
      {/* Header mobile */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#080808]/95 backdrop-blur-sm md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <svg
              width="24"
              height="24"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Foot Stock logo"
            >
              <circle cx="16" cy="16" r="16" fill="#C9A84C" fillOpacity="0.15" />
              <path
                d="M16 6L20 14H28L22 19L24 27L16 22L8 27L10 19L4 14H12L16 6Z"
                fill="#C9A84C"
              />
            </svg>
            <span className="text-sm font-semibold tracking-wide text-zinc-100">
              Portal do Clube
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className={cn(
              'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 transition-colors',
              isLoggingOut
                ? 'cursor-not-allowed text-zinc-600'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
            )}
            aria-label="Sair do portal"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:w-60 md:h-dvh md:sticky md:top-0 md:self-start md:flex-shrink-0 md:flex-col md:border-r md:border-white/5 md:bg-[#080808] md:p-4">
        <div className="mb-6 flex items-center gap-2">
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Foot Stock logo"
          >
            <circle cx="16" cy="16" r="16" fill="#C9A84C" fillOpacity="0.15" />
            <path
              d="M16 6L20 14H28L22 19L24 27L16 22L8 27L10 19L4 14H12L16 6Z"
              fill="#C9A84C"
            />
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A84C]">
              Portal do Clube
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1" aria-label="Navegação do portal do clube">
          {NAV_ITEMS.map((item) => {
            const isActive =
              currentPath === item.href ||
              (item.href !== ROUTES.CLUB && currentPath.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors min-h-[44px]',
                  isActive
                    ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-4 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors min-h-[44px]',
              isLoggingOut
                ? 'cursor-not-allowed text-zinc-600'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            )}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
