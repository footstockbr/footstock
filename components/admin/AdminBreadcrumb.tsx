'use client'
// ============================================================================
// Foot Stock — AdminBreadcrumb
// Breadcrumb de navegação do painel admin.
// Rastreabilidade: INT-085, TASK-1/ST004
// ============================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import { ROUTES } from '@/lib/constants'

const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Admin',
  motor: 'Motor',
  engajamento: 'Engajamento',
  noticias: 'Notícias',
  usuarios: 'Usuários',
  financeiro: 'Financeiro',
  moderacao: 'Moderação',
  patrocinadores: 'Patrocinadores',
  login: 'Login',
}

interface AdminBreadcrumbProps {
  items?: { label: string; href?: string }[]
}

export function AdminBreadcrumb({ items: _items }: AdminBreadcrumbProps = {}) {
  const pathname = usePathname()

  // Remove (admin) route group prefix
  const segments = (pathname ?? '')
    .split('/')
    .filter(Boolean)

  const crumbs: { label: string; href: string }[] = []
  let currentPath = ''

  for (const seg of segments) {
    currentPath += `/${seg}`
    const label = SEGMENT_LABELS[seg] ?? seg
    crumbs.push({ label, href: currentPath })
  }

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-zinc-500 mb-4">
      <Link href={ROUTES.ADMIN} className="flex items-center gap-1 hover:text-zinc-300 transition-colors">
        <Home size={14} />
      </Link>
      {crumbs.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight size={14} />
          {index === crumbs.length - 1 ? (
            <span className="text-zinc-300">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-zinc-300 transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
