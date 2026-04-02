'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Admin',
  motor: 'Motor de Mercado',
  engajamento: 'Engajamento',
  noticias: 'Notícias',
  usuarios: 'Usuários',
  financeiro: 'Financeiro',
  moderacao: 'Moderação',
  clubes: 'Clubes',
  patrocinadores: 'Patrocinadores',
  afiliados: 'Afiliados',
}

export function AdminBreadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const crumbs = segments.map((seg, idx) => ({
    label: SEGMENT_LABELS[seg] ?? seg,
    href: '/' + segments.slice(0, idx + 1).join('/'),
    isLast: idx === segments.length - 1,
  }))

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Navegação" className="flex items-center gap-1 text-xs text-[#929AA5] mb-5">
      {crumbs.map((crumb, idx) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {idx > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
          {crumb.isLast ? (
            <span className="text-[#c5b99a] font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-[#c5b99a] transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
