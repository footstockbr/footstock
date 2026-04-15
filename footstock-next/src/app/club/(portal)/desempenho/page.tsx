// ============================================================================
// Foot Stock — /club/desempenho — Histórico de preço e desempenho do ativo
// Auth obrigatória CLUB_PARTNER via (portal)/layout.tsx + withClubAuth().
// Exibe: preço atual, variações, histórico via PriceHistory, últimas ordens.
// Rastreabilidade: US-025, US-036, FDD painel-admin §2.12, MILESTONE-9
// ============================================================================

import type { Metadata } from 'next'
import { TrendingUp, TrendingDown, BarChart3, Activity, Trophy } from 'lucide-react'
import { withClubAuth } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Desempenho — Portal do Clube — Foot Stock',
}

function formatFS(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export default async function ClubDesempenhoPage() {
  const { clubId, clubName } = await withClubAuth()

  const asset = await prisma.asset.findUnique({
    where: { ticker: clubId },
    select: {
      id: true,
      ticker: true,
      displayName: true,
      currentPrice: true,
      openPrice: true,
      closePrice: true,
      totalShares: true,
    },
  })

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full text-[#929AA5] text-sm p-8">
        Clube {clubId} não encontrado no sistema.
      </div>
    )
  }

  const currentPrice = Number(asset.currentPrice)
  const openPrice = Number(asset.openPrice)
  const closePrice = Number(asset.closePrice)

  const change24h = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0
  const isPositive = change24h >= 0

  // PriceHistory dos últimos 30 dias
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const history = await prisma.priceHistory.findMany({
    where: {
      assetId: asset.id,
      timestamp: { gte: thirtyDaysAgo },
    },
    orderBy: { timestamp: 'asc' },
    take: 30,
    select: {
      timestamp: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
    },
  })

  const avgVolume =
    history.length > 0
      ? history.reduce((acc, h) => acc + Number(h.volume), 0) / history.length
      : 0

  // Últimas 10 ordens executadas
  const recentOrders = await prisma.order.findMany({
    where: {
      assetId: asset.id,
      status: 'FILLED',
    },
    orderBy: { executedAt: 'desc' },
    take: 10,
    select: { side: true, quantity: true, executedPrice: true, executedAt: true },
  })

  return (
    <div data-testid="page-club-desempenho" className="max-w-xl mx-auto px-4 pt-6 pb-10 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5">
        <div className="w-12 h-12 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <TrendingUp className="h-6 w-6 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold text-[#EAECEF]">Desempenho de {asset.displayName ?? clubName}</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Histórico de preço · Últimos 30 dias</p>
        </div>
        <span className="px-2.5 py-1 rounded-md bg-[rgba(240,185,11,.12)] text-[#F0B90B] text-xs font-bold font-mono">
          {asset.ticker}
        </span>
      </div>

      {/* KPIs de preço */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <p className="text-[10px] text-[#929AA5] mb-1">Preco atual</p>
          <p className="text-xl font-bold text-[#EAECEF]">{formatFS(currentPrice)}</p>
          <span className={`text-xs font-semibold mt-1 block ${isPositive ? 'text-[#4ade80]' : 'text-[#F6465D]'}`}>
            {isPositive
              ? <TrendingUp className="inline h-3 w-3 mr-0.5" />
              : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
            {formatPct(change24h)} vs abertura
          </span>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <p className="text-[10px] text-[#929AA5] mb-1">Volume medio (30d)</p>
          <p className="text-xl font-bold text-[#EAECEF]">{Math.round(avgVolume).toLocaleString('pt-BR')}</p>
          <span className="text-[10px] text-[#929AA5] mt-1 block">unidades / sessao</span>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <p className="text-[10px] text-[#929AA5] mb-1">Abertura</p>
          <p className="text-lg font-bold text-[#EAECEF]">{formatFS(openPrice)}</p>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <p className="text-[10px] text-[#929AA5] mb-1">Fechamento anterior</p>
          <p className="text-lg font-bold text-[#EAECEF]">{formatFS(closePrice)}</p>
        </div>
      </div>

      {/* Histórico de preço */}
      {history.length > 0 ? (
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
          <h2 className="text-sm font-semibold text-[#EAECEF] mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#F0B90B]" />
            Histórico de sessoes ({history.length} registros)
          </h2>
          <div className="space-y-2">
            <div className="grid grid-cols-5 text-[9px] text-[#4B5563] font-semibold uppercase mb-2">
              <span>Data</span>
              <span className="text-right">Abertura</span>
              <span className="text-right">Máx</span>
              <span className="text-right">Mín</span>
              <span className="text-right">Vol</span>
            </div>
            {history.slice(-10).map((h, i) => {
              const close = Number(h.close)
              const open = Number(h.open)
              const dayPositive = close >= open
              return (
                <div key={i} className="grid grid-cols-5 text-xs border-t border-[#2B3139] pt-1">
                  <span className="text-[#929AA5] font-mono text-[10px]">
                    {h.timestamp.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                  <span className={`text-right ${dayPositive ? 'text-[#4ade80]' : 'text-[#F6465D]'}`}>
                    {formatFS(open)}
                  </span>
                  <span className="text-right text-[#4ade80] text-[10px]">{formatFS(Number(h.high))}</span>
                  <span className="text-right text-[#F6465D] text-[10px]">{formatFS(Number(h.low))}</span>
                  <span className="text-right text-[#929AA5] text-[10px]">
                    {Number(h.volume).toLocaleString('pt-BR')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
          <div className="flex items-center gap-3 text-[#929AA5]">
            <Activity className="h-5 w-5" />
            <p className="text-sm">Nenhum histórico de preço nos últimos 30 dias.</p>
          </div>
        </div>
      )}

      {/* Últimas ordens executadas */}
      {recentOrders.length > 0 && (
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
          <h2 className="text-sm font-semibold text-[#EAECEF] mb-4">Últimas ordens executadas</h2>
          <div className="space-y-2.5">
            {recentOrders.map((o, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${o.side === 'BUY' ? 'bg-[rgba(74,222,128,.12)] text-[#4ade80]' : 'bg-[rgba(246,70,93,.12)] text-[#F6465D]'}`}>
                  {o.side === 'BUY' ? 'COMPRA' : 'VENDA'}
                </span>
                <span className="text-[#EAECEF]">{(o.quantity ?? 0).toLocaleString('pt-BR')} ações</span>
                <span className="text-[#929AA5]">{formatFS(Number(o.executedPrice ?? 0))}</span>
                <span className="text-[#4B5563] font-mono">
                  {o.executedAt
                    ? o.executedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nota disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(240,185,11,.06)] border border-[rgba(240,185,11,.12)]">
        <Trophy className="h-4 w-4 text-[#F0B90B] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#929AA5]">
          Dados exclusivamente informativos e agregados. Nenhum dado individual de investidor é exposto.
        </p>
      </div>
    </div>
  )
}
