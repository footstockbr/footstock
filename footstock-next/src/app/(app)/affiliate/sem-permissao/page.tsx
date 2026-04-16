// ============================================================================
// FootStock — /affiliate/sem-permissao
// Página 403: usuário autenticado sem elegibilidade de afiliado.
// ============================================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Acesso Restrito — FootStock',
}

export default function AfiliadoSemPermissaoPage() {
  return (
    <div
      data-testid="affiliate-sem-permissao-page"
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-4"
    >
      <div className="text-4xl">🔒</div>
      <h1 className="text-lg font-bold text-[#EAECEF]">Área Exclusiva para Afiliados</h1>
      <p className="text-sm text-[#7D8694] max-w-xs">
        Este portal é exclusivo para parceiros credenciados (influenciadores e times parceiros).
        Entre em contato com nossa equipe para saber como se tornar um afiliado.
      </p>
      <Link
        href={ROUTES.HOME}
        className="mt-2 text-sm text-[#4CAF50] underline underline-offset-2"
      >
        Voltar ao início
      </Link>
    </div>
  )
}
