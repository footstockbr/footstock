// ============================================================================
// Foot Stock — Affiliate Dashboard (Server Component)
// Portal de influenciadores afiliados: métricas, histórico e dados bancários.
// Rastreabilidade: INT-084, US-036, TASK-3/ST004
// ============================================================================

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { withAffiliateAuth } from '@/lib/auth/affiliate-auth'
import { AffiliateMetrics } from '@/components/affiliate/AffiliateMetrics'
import { AffiliateHistory } from '@/components/affiliate/AffiliateHistory'
import { AffiliateBankConfig } from '@/components/affiliate/AffiliateBankConfig'
import { Skeleton } from '@/components/ui/Skeleton'
import type { AffiliateMetrics as AffiliateMetricsData } from '@/types/club'

export const metadata: Metadata = {
  title: 'Meu Painel | Foot Stock Afiliados',
  description: 'Acompanhe suas conversões e comissões como afiliado Foot Stock.',
  robots: 'noindex, nofollow',
}

// ---------------------------------------------------------------------------
// Fetch de métricas (server-side)
// ---------------------------------------------------------------------------

async function fetchAffiliateMetrics(): Promise<AffiliateMetricsData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/v1/affiliate/me`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json() as { success: boolean; data: AffiliateMetricsData }
    return json.data ?? null
  } catch {
    return null
  }
}

interface BankDataMasked {
  banco: string
  agencia: string
  conta: string
  pixKey: string
  cnpj: string
}

async function fetchBankData(): Promise<BankDataMasked | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/v1/affiliate/me/bank`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json() as { success: boolean; data: BankDataMasked | null }
    return json.data ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AffiliateDashboardPage() {
  // Valida sessão e garante código de afiliado ativo
  await withAffiliateAuth()

  const [metrics, bankData] = await Promise.all([
    fetchAffiliateMetrics(),
    fetchBankData(),
  ])

  return (
    <main className="space-y-8">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Meu Painel de Afiliado</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Acompanhe seus resultados e gerencie seus dados de repasse
        </p>
      </div>

      {/* Métricas e link */}
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[80px] w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[100px] rounded-lg" />
              ))}
            </div>
          </div>
        }
      >
        <AffiliateMetrics metrics={metrics} />
      </Suspense>

      {/* Histórico de conversões */}
      <Suspense fallback={<Skeleton className="h-[240px] w-full rounded-lg" />}>
        <AffiliateHistory conversions={metrics?.conversions ?? []} />
      </Suspense>

      {/* Configuração de dados bancários */}
      <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-6">
        <AffiliateBankConfig initialData={bankData} />
      </div>

      {/* Nota informativa */}
      <p className="text-xs text-zinc-600" aria-live="polite">
        Comissões são processadas mensalmente. Dados bancários armazenados com criptografia.
      </p>
    </main>
  )
}
