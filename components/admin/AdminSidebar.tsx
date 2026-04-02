'use client'
// ============================================================================
// Foot Stock — AdminSidebar
// Sidebar do painel admin com links filtrados por role e navegação mobile por tabs.
// Rastreabilidade: INT-085, TASK-1/ST004
// ============================================================================

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Cpu,
  Users,
  BarChart3,
  Newspaper,
  DollarSign,
  Shield,
  Megaphone,
  Bell,
  MoreHorizontal,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { canAccess, type AdminResource } from '@/lib/auth/canAccess'
import { signOut } from '@/lib/auth'
import { ROUTES } from '@/lib/constants/routes'
import type { AdminRole } from '@/lib/enums'

interface NavItem {
  href: string
  label: string
  resource: AdminResource
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', resource: 'admin:dashboard', icon: <LayoutDashboard size={18} /> },
  { href: '/admin/motor', label: 'Motor', resource: 'motor:read', icon: <Cpu size={18} /> },
  { href: '/admin/engajamento', label: 'Engajamento', resource: 'forum:moderate', icon: <BarChart3 size={18} /> },
  { href: '/admin/noticias', label: 'Notícias', resource: 'news:read', icon: <Newspaper size={18} /> },
  { href: '/admin/usuarios', label: 'Usuários', resource: 'users:read', icon: <Users size={18} /> },
  { href: '/admin/financeiro', label: 'Financeiro', resource: 'financial:read', icon: <DollarSign size={18} /> },
  { href: '/admin/moderacao', label: 'Moderação', resource: 'forum:moderate', icon: <Shield size={18} /> },
  { href: '/admin/patrocinadores', label: 'Patrocinadores', resource: 'assets:write', icon: <Megaphone size={18} /> },
]

const PRIMARY_MOBILE_HREFS = new Set([
  '/admin',
  '/admin/motor',
  '/admin/engajamento',
  '/admin/noticias',
  '/admin/usuarios',
])

interface AdminSidebarProps {
  adminRole: AdminRole
}

export function AdminSidebar({ adminRole }: AdminSidebarProps) {
  const pathname = usePathname()
  const currentPath = pathname ?? ''
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => canAccess(adminRole, item.resource)),
    [adminRole]
  )

  const mobilePrimaryItems = useMemo(
    () => visibleItems.filter((item) => PRIMARY_MOBILE_HREFS.has(item.href)),
    [visibleItems]
  )

  const mobileSecondaryItems = useMemo(
    () => visibleItems.filter((item) => !PRIMARY_MOBILE_HREFS.has(item.href)),
    [visibleItems]
  )

  const isMoreActive = mobileSecondaryItems.some(
    (item) => currentPath === item.href || (item.href !== '/admin' && currentPath.startsWith(item.href))
  )

  const activeItem = visibleItems.find(
    (item) => currentPath === item.href || (item.href !== '/admin' && currentPath.startsWith(item.href))
  )

  const roleLabel = {
    SUPER_ADMIN: 'SuperAdmin',
    ADMINISTRADOR: 'Administrador',
    MONITOR: 'Monitor',
    EDITOR: 'Editor',
    MODERADOR: 'Moderador',
    CLUB_PARTNER: 'Clube Parceiro',
  }[adminRole] ?? adminRole

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)

    try {
      await signOut()
    } catch {
      setIsLoggingOut(false)
    }
  }

  const NavLinks = () => (
    <nav aria-label="Navegação do painel admin">
      {visibleItems.map((item) => {
        const isActive = currentPath === item.href || (item.href !== '/admin' && currentPath.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors min-h-[44px]',
              isActive
                ? 'bg-accent/20 text-accent'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Header mobile do painel admin */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">{activeItem?.label ?? 'Admin'}</p>
            <p className="text-[11px] text-accent">{roleLabel}</p>
          </div>

          <div className="flex items-center gap-1">
            <Link
              href={ROUTES.NOTIFICACOES}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Notificações"
            >
              <Bell size={18} />
            </Link>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className={cn(
                'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 transition-colors',
                isLoggingOut
                  ? 'cursor-not-allowed text-zinc-600'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              )}
              aria-label="Sair do painel admin"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar desktop (fixa) */}
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 p-4 md:flex">
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            Admin Panel
          </span>
        </div>
        <div className="flex-1">
          <NavLinks />
        </div>
        <div className="mt-4 border-t border-zinc-800 pt-4">
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
            <LogOut size={18} />
            <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
          </button>
        </div>
      </aside>

      {/* Bottom tabs mobile do painel admin */}
      <nav
        aria-label="Navegação principal admin"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <div className="flex h-14">
          {mobilePrimaryItems.map((item) => {
            const isActive = currentPath === item.href || (item.href !== '/admin' && currentPath.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                  isActive ? 'text-accent' : 'text-zinc-400 hover:text-zinc-100'
                )}
              >
                {item.icon}
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            )
          })}

          {mobileSecondaryItems.length > 0 && (
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              aria-current={isMoreActive ? 'page' : undefined}
              className={cn(
                'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                isMoreActive ? 'text-accent' : 'text-zinc-400 hover:text-zinc-100'
              )}
            >
              <MoreHorizontal size={18} />
              <span className="text-[10px] font-medium leading-none">Mais</span>
            </button>
          )}
        </div>
      </nav>

      {/* Sheet "Mais" no mobile */}
      {isMoreOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setIsMoreOpen(false)}
            aria-label="Fechar menu de módulos extras"
          />

          <aside className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-zinc-800 bg-zinc-950 p-4 md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">Módulos admin</h2>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="space-y-1" aria-label="Módulos extras do admin">
              {mobileSecondaryItems.map((item) => {
                const isActive =
                  currentPath === item.href || (item.href !== '/admin' && currentPath.startsWith(item.href))

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMoreOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-accent/20 text-accent'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </aside>
        </>
      )}
    </>
  )
}
