// ============================================================================
// FootStock — /club/relatorios — Relatórios consolidados do clube
// Auth obrigatória CLUB_PARTNER via (portal)/layout.tsx + withClubAuth().
// Exibe resumo mensal e anual com KPIs de volume, torcedores, crescimento.
// Rastreabilidade: US-025, US-036, FDD painel-admin §2.12, MILESTONE-9
// ============================================================================

import type { Metadata } from 'next'
import { BarChart3, TrendingUp, TrendingDown, Users, Calendar, Shield, FileText } from 'lucide-react'
import { withClubAuth } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Relatórios — Portal do Clube — FootStock',
}

function formatFS(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function ClubRelatoriosPage() {
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

  const now = new Date()
  const currentPrice = Number(asset.currentPrice)

  // Janelas temporais
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  // Torcedores (posições abertas)
  const [holdersNow, holdersStartMonth] = await Promise.all([
    prisma.position.count({ where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } } }),
    prisma.position.count({
      where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 }, createdAt: { lt: startOfMonth } },
    }),
  ])

  const holdersMoMDelta = holdersNow - holdersStartMonth
  const holdersMoMPct =
    holdersStartMonth > 0 ? Math.round((holdersMoMDelta / holdersStartMonth) * 100 * 10) / 10 : 0

  // Volume mensal
  const [volMonth, volLastMonth, volYear] = await Promise.all([
    prisma.transaction.aggregate({
      where: { asset: { ticker: clubId }, createdAt: { gte: startOfMonth } },
      _sum: { quantity: true },
    }),
    prisma.transaction.aggregate({
      where: {
        asset: { ticker: clubId },
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { quantity: true },
    }),
    prisma.transaction.aggregate({
      where: { asset: { ticker: clubId }, createdAt: { gte: startOfYear } },
      _sum: { quantity: true },
    }),
  ])

  const volMonthVal = Number(volMonth._sum.quantity ?? 0)
  const volLastMonthVal = Number(volLastMonth._sum.quantity ?? 0)
  const volYearVal = Number(volYear._sum.quantity ?? 0)

  const volMoMPct =
    volLastMonthVal > 0 ? Math.round(((volMonthVal - volLastMonthVal) / volLastMonthVal) * 100 * 10) / 10 : 0

  // Resumo por mês (últimos 6 meses)
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)

  const monthlyTrades = await prisma.transaction.findMany({
    where: { asset: { ticker: clubId }, createdAt: { gte: sixMonthsAgo } },
    select: { quantity: true, price: true, createdAt: true },
  })

  const monthlyMap = new Map<string, { volume: number; revenue: number; trades: number }>()
  for (const t of monthlyTrades) {
    const key = t.createdAt.toISOString().slice(0, 7)
    const existing = monthlyMap.get(key) ?? { volume: 0, revenue: 0, trades: 0 }
    monthlyMap.set(key, {
      volume: existing.volume + Number(t.quantity),
      revenue: existing.revenue + Number(t.quantity) * Number(t.price),
      trades: existing.trades + 1,
    })
  }

  const monthlyRows = Array.from(monthlyMap.entries())
    .map(([month, d]) => ({ month, ...d }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div data-testid="page-club-relatorios" className="max-w-xl mx-auto px-4 pt-6 pb-10 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5">
        <div className="w-12 h-12 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <FileText className="h-6 w-6 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold text-[#EAECEF]">Relatórios de {asset.displayName}</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Consolidado mensal e anual</p>
        </div>
        <span className="text-xs text-[#929AA5]">{now.getFullYear()}</span>
      </div>

      {/* Resumo do mês atual */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Torcedores ativos</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">{holdersNow.toLocaleString('pt-BR')}</p>
          <span className={`text-xs font-semibold mt-1 block ${holdersMoMDelta >= 0 ? 'text-[#4ade80]' : 'text-[#F6465D]'}`}>
            {holdersMoMDelta >= 0 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
            {holdersMoMDelta >= 0 ? '+' : ''}{holdersMoMPct}% MoM
          </span>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Volume este mes</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">{volMonthVal.toLocaleString('pt-BR')}</p>
          <span className={`text-xs font-semibold mt-1 block ${volMoMPct >= 0 ? 'text-[#4ade80]' : 'text-[#F6465D]'}`}>
            {volMoMPct >= 0 ? '+' : ''}{volMoMPct}% vs mês anterior
          </span>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Volume acumulado {now.getFullYear()}</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">{volYearVal.toLocaleString('pt-BR')}</p>
          <span className="text-[10px] text-[#929AA5] mt-0.5 block">acoes negociadas</span>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Valor de mercado</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">
            {(Number(asset.totalShares) * currentPrice / 1000).toFixed(1)}K
          </p>
          <span className="text-[10px] text-[#929AA5] mt-0.5 block">FS$ total float</span>
        </div>
      </div>

      {/* Histórico mensal */}
      {monthlyRows.length > 0 && (
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
          <h2 className="text-sm font-semibold text-[#EAECEF] mb-4">Histórico mensal (últimos 6 meses)</h2>
          <div className="space-y-2">
            <div className="grid grid-cols-4 text-[10px] text-[#4B5563] font-semibold uppercase mb-2">
              <span>Mês</span>
              <span className="text-right">Volume</span>
              <span className="text-right">Negócios</span>
              <span className="text-right">Volume FS$</span>
            </div>
            {monthlyRows.map((row) => (
              <div key={row.month} className="grid grid-cols-4 text-xs border-t border-[#2B3139] pt-2">
                <span className="text-[#929AA5] font-mono">{row.month.slice(0, 7)}</span>
                <span className="text-right text-[#EAECEF]">{row.volume.toLocaleString('pt-BR')}</span>
                <span className="text-right text-[#EAECEF]">{row.trades.toLocaleString('pt-BR')}</span>
                <span className="text-right text-[#929AA5]">
                  {row.revenue >= 1000
                    ? `${(row.revenue / 1000).toFixed(1)}K`
                    : row.revenue.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aviso */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(59,130,246,.06)] border border-[rgba(59,130,246,.15)]">
        <Shield className="h-4 w-4 text-[#3B82F6] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#929AA5]">
          Dados exclusivamente informativos. Não representam repasse financeiro ao clube.
        </p>
      </div>
    </div>
  )
}
