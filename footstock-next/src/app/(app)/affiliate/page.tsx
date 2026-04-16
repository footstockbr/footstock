// ============================================================================
// FootStock — Portal do Afiliado (/affiliate)
// Acesso restrito: apenas TIME_PARCEIRO e INFLUENCIADOR (withAffiliateAuth).
// Usuários NORMAL são redirecionados para /affiliate/sem-permissao (403).
// Rastreabilidade: T-001 (Gap 6), US-036, US-037, RF-017
// ============================================================================

import type { Metadata } from 'next'
import { withAffiliateAuth } from '@/lib/auth/affiliate-auth'
import { AffiliatePortalClient } from '@/components/affiliate/AffiliatePortalClient'

export const metadata: Metadata = {
  title: 'Portal do Afiliado — FootStock',
  description: 'Acompanhe suas comissões, indicações e dados bancários.',
}

export default async function AffiliatePage() {
  // Server-side auth: redireciona para /affiliate/sem-permissao se não elegível
  const ctx = await withAffiliateAuth()

  return (
    <div data-testid="affiliate-page" className="px-4 py-4 flex flex-col gap-4">
      <h1 className="text-lg font-bold text-[#EAECEF]">Portal do Afiliado</h1>
      <AffiliatePortalClient
        affiliateCode={ctx.code}
        affiliateType={ctx.affiliateType}
        commissionPercentage={ctx.commissionPercentage}
      />
    </div>
  )
}
