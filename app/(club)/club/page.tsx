// ============================================================================
// Foot Stock — Club Dashboard (Server Component)
// Portal somente leitura para clubes parceiros: métricas, charts e afiliado.
// Dados NUNCA individuais — apenas agregados e anonimizados (ADMIN_051).
// Rastreabilidade: INT-084, US-025, US-036, TASK-2/ST005
// ============================================================================

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { withClubAuth } from '@/lib/auth/club-auth'
import { ClubMetrics } from '@/components/club/ClubMetrics'
import { FansByPlanChart } from '@/components/club/FansByPlan'
import { MonthlyGrowthChart } from '@/components/club/MonthlyGrowth'
import { AffiliatePanel } from '@/components/club/AffiliatePanel'
import { AffiliateConfig } from '@/components/club/AffiliateConfig'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ClubMetricsData } from '@/types/club'

interface RoyaltyEntry {
  id: string
  period: string
  amount: number
  status: 'PENDENTE' | 'PAGO'
}

interface ClubAffiliateData {
  referralLink: string
  totalRoyalties: number
  royalties: RoyaltyEntry[]
  commissionPct: number
}

// ---------------------------------------------------------------------------
// Metadata dinâmica
// ---------------------------------------------------------------------------

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { clubName } = await withClubAuth()
    return {
      title: `Portal ${clubName} | Foot Stock`,
      description: `Métricas do clube ${clubName} na plataforma Foot Stock.`,
      robots: 'noindex, nofollow',
    }
  } catch {
    return { title: 'Portal do Clube | Foot Stock', robots: 'noindex, nofollow' }
  }
}

// ---------------------------------------------------------------------------
// Fetch de métricas (server-side)
// ---------------------------------------------------------------------------

async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies()
  return cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
}

async function fetchClubMetrics(): Promise<ClubMetricsData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const cookieHeader = await getCookieHeader()
    const res = await fetch(`${baseUrl}/api/v1/club/metrics`, {
      cache: 'no-store',
      headers: { Cookie: cookieHeader },
    })
    if (!res.ok) return null
    const json = await res.json() as { success: boolean; data: ClubMetricsData }
    return json.data ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fetch de royalties/afiliado (server-side)
// ---------------------------------------------------------------------------

async function fetchClubAffiliate(): Promise<ClubAffiliateData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const cookieHeader = await getCookieHeader()
    const res = await fetch(`${baseUrl}/api/v1/club/affiliate`, {
      cache: 'no-store',
      headers: { Cookie: cookieHeader },
    })
    if (!res.ok) return null
    const json = await res.json() as { success: boolean; data: ClubAffiliateData }
    return json.data ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ClubDashboardPage() {
  const clubContext = await withClubAuth()
  const { clubName, clubId } = clubContext

  const [metrics, affiliateData] = await Promise.all([
    fetchClubMetrics(),
    fetchClubAffiliate(),
  ])

  return (
    <main className="space-y-8 p-4 md:p-8">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Portal {clubName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Visão geral das métricas de torcedores e desempenho do clube
        </p>
      </div>

      {/* KPIs */}
      <Suspense fallback={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-lg" />
        ))}
      </div>}>
        <ClubMetrics metrics={metrics ?? undefined} />
      </Suspense>

      {/* Charts */}
      <Suspense fallback={<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-[280px] rounded-lg" />
        <Skeleton className="h-[280px] rounded-lg" />
      </div>}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-6">
            <FansByPlanChart fansByPlan={metrics?.fansByPlan} />
          </div>
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-6">
            <MonthlyGrowthChart monthlyGrowth={metrics?.monthlyGrowth} />
          </div>
        </div>
      </Suspense>

      {/* Painel de Afiliado */}
      <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-6">
        <AffiliatePanel
          clubId={clubId}
          royalties={affiliateData?.royalties ?? []}
          totalRoyalties={affiliateData?.totalRoyalties ?? 0}
        />
      </div>

      {/* Configuração de dados bancários */}
      <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-6">
        <AffiliateConfig clubId={clubId} initialData={null} />
      </div>

      {/* Nota informativa */}
      <p className="text-xs text-zinc-600" aria-live="polite">
        Dados atualizados a cada 15 minutos. Todas as métricas são agregadas e anonimizadas — nenhum dado
        individual de torcedor é exibido.
      </p>
    </main>
  )
}
