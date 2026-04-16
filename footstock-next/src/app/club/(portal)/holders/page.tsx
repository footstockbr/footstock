// ============================================================================
// FootStock — /club/holders — Distribuição de holders (anonimizado)
// Auth obrigatória CLUB_PARTNER via (portal)/layout.tsx + withClubAuth().
// REGRA LGPD (ADMIN_051): NUNCA expor PII. Apenas dados agregados.
// Rastreabilidade: US-025, US-036, FDD painel-admin §2.12, MILESTONE-9
// ============================================================================

import type { Metadata } from 'next'
import { Users, Shield, BarChart3, TrendingUp, Trophy } from 'lucide-react'
import { withClubAuth } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Holders — Portal do Clube — FootStock',
}

function formatFS(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function ClubHoldersPage() {
  const { clubId } = await withClubAuth()

  const asset = await prisma.asset.findUnique({
    where: { ticker: clubId },
    select: { id: true, displayName: true, currentPrice: true, totalShares: true },
  })

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full text-[#929AA5] text-sm p-8">
        Clube {clubId} não encontrado no sistema.
      </div>
    )
  }

  const currentPrice = Number(asset.currentPrice)
  const totalSharesNum = Number(asset.totalShares)

  // Posições abertas — apenas quantidade e plano do usuário (sem nome/email)
  const openPositions = await prisma.position.findMany({
    where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
    select: {
      quantity: true,
      user: { select: { planType: true } },
    },
    orderBy: { quantity: 'desc' },
  })

  const totalHolders = openPositions.length
  const totalInvested = openPositions.reduce((acc, p) => acc + Number(p.quantity) * currentPrice, 0)

  // Faixas de concentração (anonimizadas)
  const ranges = [
    { label: 'Pequenos (1–9 ações)', min: 1, max: 9 },
    { label: 'Médios (10–49 ações)', min: 10, max: 49 },
    { label: 'Grandes (50–199 ações)', min: 50, max: 199 },
    { label: 'Baleias (200+ ações)', min: 200, max: Infinity },
  ]

  const distribution = ranges.map((r) => {
    const count = openPositions.filter(
      (p) => Number(p.quantity) >= r.min && Number(p.quantity) <= r.max
    ).length
    const pct = totalHolders > 0 ? Math.round((count / totalHolders) * 100) : 0
    return { ...r, count, pct }
  })

  // Top 5 maiores posições (sem identificação)
  const top5 = openPositions.slice(0, 5).map((p, i) => ({
    rank: i + 1,
    quantity: Number(p.quantity),
    value: Number(p.quantity) * currentPrice,
    share: totalSharesNum > 0 ? (Number(p.quantity) / totalSharesNum) * 100 : 0,
    planType: p.user.planType,
  }))

  // Distribuição por plano
  const byPlan = {
    JOGADOR: openPositions.filter((p) => p.user.planType === 'JOGADOR').length,
    CRAQUE: openPositions.filter((p) => p.user.planType === 'CRAQUE').length,
    LENDA: openPositions.filter((p) => p.user.planType === 'LENDA').length,
  }

  return (
    <div data-testid="page-club-holders" className="max-w-xl mx-auto px-4 pt-6 pb-10 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5">
        <div className="w-12 h-12 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <Users className="h-6 w-6 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold text-[#EAECEF]">Holders de {asset.displayName}</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Distribuição de investidores · Dados agregados</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Total de holders</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">{totalHolders.toLocaleString('pt-BR')}</p>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Capital total investido</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">
            {totalInvested >= 1000
              ? `FS$ ${(totalInvested / 1000).toFixed(1)}K`
              : formatFS(totalInvested)}
          </p>
        </div>
      </div>

      {/* Distribuição por faixa */}
      <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
        <h2 className="text-sm font-semibold text-[#EAECEF] mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#F0B90B]" />
          Distribuição por tamanho de posição
        </h2>
        <div className="space-y-3">
          {distribution.map((r) => (
            <div key={r.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#929AA5]">{r.label}</span>
                <span className="text-[#EAECEF] font-semibold">{r.count} ({r.pct}%)</span>
              </div>
              <div className="h-2 bg-[#2B3139] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#F0B90B] rounded-full transition-all"
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribuição por plano */}
      <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
        <h2 className="text-sm font-semibold text-[#EAECEF] mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#F0B90B]" />
          Distribuição por plano
        </h2>
        <div className="space-y-2.5">
          {[
            { label: 'Jogador', count: byPlan.JOGADOR, color: '#929AA5' },
            { label: 'Craque', count: byPlan.CRAQUE, color: '#2196F3' },
            { label: 'Lenda', count: byPlan.LENDA, color: '#F0B90B' },
          ].map((plan) => (
            <div key={plan.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: plan.color }} />
                <span className="text-[#929AA5]">{plan.label}</span>
              </div>
              <span className="text-[#EAECEF] font-semibold">{plan.count.toLocaleString('pt-BR')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 posições (anonimizadas) */}
      {top5.length > 0 && (
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
          <h2 className="text-sm font-semibold text-[#EAECEF] mb-4">Top 5 posições (anonimizadas)</h2>
          <div className="space-y-2.5">
            {top5.map((p) => (
              <div key={p.rank} className="flex items-center justify-between text-xs">
                <span className="text-[#F0B90B] font-bold w-6">#{p.rank}</span>
                <span className="text-[#EAECEF]">{p.quantity.toLocaleString('pt-BR')} ações</span>
                <span className="text-[#929AA5]">{p.share.toFixed(2)}% do total</span>
                <span className="text-[#929AA5]">{formatFS(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LGPD disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(59,130,246,.06)] border border-[rgba(59,130,246,.15)]">
        <Shield className="h-4 w-4 text-[#3B82F6] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#929AA5]">
          <span className="text-[#EAECEF] font-medium">Proteção LGPD</span> — Nenhum dado individual é exposto.
          Todos os registros são exclusivamente agregados e anonimizados.
        </p>
      </div>
    </div>
  )
}
