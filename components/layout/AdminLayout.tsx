import Link from 'next/link'
import Image from 'next/image'
import { ROUTES } from '@/lib/constants/routes'

const sidebarLinks = [
  { href: ROUTES.ADMIN, label: 'Dashboard' },
  { href: ROUTES.ADMIN_USUARIOS, label: 'Usuarios' },
  { href: ROUTES.ADMIN_ATIVOS, label: 'Ativos' },
  { href: ROUTES.ADMIN_NOTICIAS, label: 'Noticias' },
]

/**
 * Layout do painel administrativo.
 * Sidebar de navegacao no desktop, header-only no mobile.
 */
export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-bg-primary">
      {/* Sidebar — visivel apenas no desktop */}
      <aside className="hidden md:flex md:flex-col md:w-60 border-r border-border-default bg-bg-surface">
        <div className="flex items-center h-14 px-4 border-b border-border-default">
          <Link href={ROUTES.ADMIN} className="flex items-center gap-2">
            <Image
              src="/logo-foot.png"
              alt="Foot Stock"
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
              priority
            />
            <span className="text-sm font-semibold text-text-primary">Admin</span>
          </Link>
        </div>
        <nav className="flex-1 py-4 px-3" aria-label="Menu administrativo">
          <ul className="flex flex-col gap-1">
            {sidebarLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-card rounded-md transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Conteudo principal */}
      <div className="flex-1 flex flex-col">
        {/* Header mobile — visivel apenas no mobile */}
        <header className="md:hidden sticky top-0 z-sticky bg-bg-surface/90 backdrop-blur-sm border-b border-border-default">
          <div className="flex items-center h-14 px-4">
            <Link href={ROUTES.ADMIN} className="flex items-center gap-2">
              <Image
                src="/logo-foot.png"
                alt="Foot Stock"
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
                priority
              />
              <span className="text-sm font-semibold text-text-primary">Admin</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
