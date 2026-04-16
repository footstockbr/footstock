// ============================================================================
// FootStock — /club — Dashboard do Clube Parceiro
// Autenticação exclusiva CLUB_PARTNER via withClubAuth().
// Dados SEMPRE agregados — nenhum dado individual ou PII exposto (ADMIN_051).
// KPIs: totalFans, fansByPlan (donut), currentPrice, priceChange24h,
//        sentimentScore (gauge), leagueEngagement, totalShares,
//        topHolderPercentage, monthlyGrowth (sparkline 6 meses).
// Rastreabilidade: US-025, US-036, FDD painel-admin §2.12, MILESTONE-9, TASK-015
// ============================================================================

import type { Metadata } from 'next'
import { Trophy, Users, TrendingUp, TrendingDown, Wallet, BarChart3, Shield, Activity, Info } from 'lucide-react'
import { withClubAuth } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Portal do Clube — FootStock',
}

function formatFS(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCompact(value: number): string {
  if (value >= 1_000_000)
    return `FS$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}M`
  if (value >= 1_000)
    return `FS$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`
  return formatFS(value)
}

function getGrowthPct(monthly: { month: string; newFans: number }[]): number {
  if (monthly.length < 2) return 0
  const last = monthly[monthly.length - 1].newFans
  const prev = monthly[monthly.length - 2].newFans
  if (prev === 0) return last > 0 ? 100 : 0
  return Math.round(((last - prev) / prev) * 1000) / 10
}

function getSentimentLabel(score: number): { label: string; color: string } {
  if (score >= 0.5) return { label: 'Muito Positivo', color: '#4ade80' }
  if (score >= 0.2) return { label: 'Positivo', color: '#86efac' }
  if (score > -0.2) return { label: 'Neutro', color: '#929AA5' }
  if (score > -0.5) return { label: 'Negativo', color: '#fca5a5' }
  return { label: 'Muito Negativo', color: '#F6465D' }
}

// Donut SVG simples sem dependências externas
function DonutChart({
  jogador,
  craque,
  lenda,
  total,
}: {
  jogador: number
  craque: number
  lenda: number
  total: number
}) {
  if (total === 0) {
    return (
      <div className="flex items-center justify-center w-24 h-24 rounded-full border-4 border-[#2B3139] text-[#929AA5] text-xs">
        0
      </div>
    )
  }
  const r = 36
  const circ = 2 * Math.PI * r
  const jogadorArc = (jogador / total) * circ
  const craqueArc = (craque / total) * circ
  const lendaArc = (lenda / total) * circ
  const offsets = [0, jogadorArc, jogadorArc + craqueArc]

  const segments = [
    { arc: jogadorArc, color: '#929AA5', label: 'Jogador', count: jogador, offset: offsets[0] },
    { arc: craqueArc, color: '#2196F3', label: 'Craque', count: craque, offset: offsets[1] },
    { arc: lendaArc, color: '#F0B90B', label: 'Lenda', count: lenda, offset: offsets[2] },
  ]

  return (
    <div className="flex items-center gap-4">
      <svg width={96} height={96} viewBox="0 0 96 96" className="flex-shrink-0">
        <circle cx={48} cy={48} r={r} fill="none" stroke="#1E2329" strokeWidth={16} />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={48}
            cy={48}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={16}
            strokeDasharray={`${seg.arc} ${circ - seg.arc}`}
            strokeDashoffset={-seg.offset + circ * 0.25}
            transform="rotate(-90 48 48)"
          />
        ))}
        <text x={48} y={52} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#EAECEF">
          {total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-xs">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-[#929AA5]">{seg.label}</span>
            <span className="text-[#EAECEF] font-semibold ml-1">{seg.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Mini sparkline SVG para o gráfico de linha de 6 meses
function SparkLine({ data }: { data: number[] }) {
  if (data.length < 2) return <p className="text-xs text-[#929AA5]">Dados insuficientes</p>
  const max = Math.max(...data, 1)
  const w = 200
  const h = 48
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * (h - 6) - 3
    return `${x},${y}`
  })
  const polyline = pts.join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={polyline} fill="none" stroke="#F0B90B" strokeWidth={2} strokeLinejoin="round" />
      {pts.map((pt, i) => {
        const [x, y] = pt.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={3} fill="#F0B90B" />
      })}
    </svg>
  )
}

// Sentiment gauge bar
function SentimentGauge({ score }: { score: number }) {
  const { label, color } = getSentimentLabel(score)
  // Normalizar de [-1, 1] para [0, 100]
  const pct = Math.round(((score + 1) / 2) * 100)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#929AA5]">Negativo</span>
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <span className="text-xs text-[#929AA5]">Positivo</span>
      </div>
      <div className="relative h-3 bg-[#2B3139] rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
        <div
          className="absolute top-0 w-0.5 h-3 bg-[#EAECEF]"
          style={{ left: '50%' }}
        />
      </div>
      <p className="text-center text-xs font-mono text-[#EAECEF]">
        {score > 0 ? '+' : ''}{score.toFixed(1)}
      </p>
    </div>
  )
}

export default async function ClubPortalPage() {
  // Autenticação CLUB_PARTNER obrigatória — redireciona para /club/login se falhar
  const clubCtx = await withClubAuth()
  const { clubId, clubName } = clubCtx

  // Buscar ativo do clube com dados expandidos
  const asset = await prisma.asset.findUnique({
    where: { ticker: clubId },
    select: {
      id: true,
      ticker: true,
      displayName: true,
      currentPrice: true,
      openPrice: true,
      sentiment: true,
      totalShares: true,
    },
  })

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full text-[#929AA5] text-sm">
        Clube {clubId} não encontrado no sistema.
      </div>
    )
  }

  const currentPrice = Number(asset.currentPrice)
  const openPrice = Number(asset.openPrice)
  const totalSharesNum = Number(asset.totalShares)

  // ── KPI: Variação 24h ─────────────────────────────────────────────
  const priceChange24h = openPrice > 0
    ? ((currentPrice - openPrice) / openPrice) * 100
    : 0
  const pricePositive = priceChange24h >= 0

  // ── KPI: Sentimento ──────────────────────────────────────────────
  const sentimentMap: Record<string, number> = { BULLISH: 0.7, BEARISH: -0.7, NEUTRAL: 0 }
  const sentimentScore = sentimentMap[asset.sentiment] ?? 0

  // ── KPI 1: Total de fãs com posição aberta ──────────────────────
  const fansResult = await prisma.position.findMany({
    where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
    select: { userId: true },
    distinct: ['userId'],
  })
  const totalFans = fansResult.length
  const fanUserIds = fansResult.map((f) => f.userId)

  // ── KPI 2: Distribuição por plano ───────────────────────────────
  const fanUsers = await prisma.user.findMany({
    where: { id: { in: fanUserIds } },
    select: { planType: true },
  })
  const fansByPlan = {
    JOGADOR: fanUsers.filter((u) => u.planType === 'JOGADOR').length,
    CRAQUE: fanUsers.filter((u) => u.planType === 'CRAQUE').length,
    LENDA: fanUsers.filter((u) => u.planType === 'LENDA').length,
  }

  // ── KPI 3: Valor médio da carteira dos fãs ────────────────────
  const openPositions = await prisma.position.findMany({
    where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
    select: { quantity: true },
    orderBy: { quantity: 'desc' },
  })
  const portfolioValues = openPositions.map((p) => Number(p.quantity) * currentPrice)
  const avgPortfolioValue =
    portfolioValues.length > 0
      ? portfolioValues.reduce((a, b) => a + b, 0) / portfolioValues.length
      : 0

  // ── KPI: Top holder percentage ────────────────────────────────
  const topHolderQty = openPositions.length > 0 ? Number(openPositions[0].quantity) : 0
  const topHolderPercentage = totalSharesNum > 0
    ? Math.round((topHolderQty / totalSharesNum) * 10000) / 100
    : 0

  // ── KPI: Engajamento em ligas ─────────────────────────────────
  const leagueEngagement = fanUserIds.length > 0
    ? await prisma.leagueMember.count({
        where: {
          userId: { in: fanUserIds },
          league: { status: 'ACTIVE' },
        },
      })
    : 0

  // ── KPI 4 + 5: Crescimento mensal dos últimos 6 meses ────────
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const monthlyRaw = await prisma.position.findMany({
    where: { assetId: asset.id, createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const monthlyMap = new Map<string, number>()
  for (const pos of monthlyRaw) {
    const key = pos.createdAt.toISOString().slice(0, 7)
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1)
  }
  const monthlyGrowth = Array.from(monthlyMap.entries()).map(([month, newFans]) => ({
    month,
    newFans,
  }))
  const growthPct = getGrowthPct(monthlyGrowth)
  const growthSign = growthPct >= 0 ? '+' : ''
  const growthColor = growthPct >= 0 ? 'text-[#4ade80]' : 'text-[#F6465D]'
  const sparkData = monthlyGrowth.map((m) => m.newFans)

  return (
    <div data-testid="page-club" className="max-w-xl mx-auto px-4 pt-6 pb-10 space-y-5">
      {/* Cabeçalho do clube */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5">
        <div className="w-14 h-14 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <Trophy className="h-7 w-7 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#EAECEF]">{asset.displayName ?? clubName}</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Portal Oficial · Somente leitura</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="px-2.5 py-1 rounded-md bg-[rgba(240,185,11,.12)] text-[#F0B90B] text-xs font-bold font-mono">
            {asset.ticker}
          </span>
          <span className="px-2 py-0.5 rounded bg-[rgba(146,154,165,.15)] text-[#929AA5] text-[10px] font-medium">
            Somente leitura
          </span>
        </div>
      </div>

      {/* KPIs rápidos — linha 1: Torcedores, Preço atual, Variação 24h */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Torcedores</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">{totalFans.toLocaleString('pt-BR')}</p>
          <p className="text-[10px] text-[#929AA5] mt-0.5">investidores ativos</p>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Preço atual</span>
          </div>
          <p className="text-xl font-bold text-[#EAECEF]">{formatFS(currentPrice)}</p>
          <p className="text-[10px] text-[#929AA5] mt-0.5">por ação</p>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            {pricePositive ? (
              <TrendingUp className="h-4 w-4 text-[#4ade80]" />
            ) : (
              <TrendingDown className="h-4 w-4 text-[#F6465D]" />
            )}
            <span className="text-[10px] text-[#929AA5]">Variação 24h</span>
          </div>
          <p className={`text-xl font-bold ${pricePositive ? 'text-[#4ade80]' : 'text-[#F6465D]'}`}>
            {pricePositive ? '+' : ''}{priceChange24h.toFixed(1)}%
          </p>
          <p className="text-[10px] text-[#929AA5] mt-0.5">vs abertura</p>
        </div>
      </div>

      {/* KPIs linha 2: Carteira média, Ações em circulação, Maior holder, Engajamento ligas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Carteira média</span>
          </div>
          <p className="text-lg font-bold text-[#EAECEF]">{formatCompact(avgPortfolioValue)}</p>
          <p className="text-[10px] text-[#929AA5] mt-0.5">por investidor</p>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Ações em circulação</span>
          </div>
          <p className="text-lg font-bold text-[#EAECEF]">{totalSharesNum.toLocaleString('pt-BR')}</p>
          <p className="text-[10px] text-[#929AA5] mt-0.5">total float</p>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Maior holder</span>
          </div>
          <p className="text-lg font-bold text-[#EAECEF]">{topHolderPercentage.toFixed(1)}%</p>
          <p className="text-[10px] text-[#929AA5] mt-0.5">do total (anônimo)</p>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-[#F0B90B]" />
            <span className="text-[10px] text-[#929AA5]">Em ligas ativas</span>
          </div>
          <p className="text-lg font-bold text-[#EAECEF]">{leagueEngagement.toLocaleString('pt-BR')}</p>
          <p className="text-[10px] text-[#929AA5] mt-0.5">torcedores competindo</p>
        </div>
      </div>

      {/* Distribuição por plano — donut */}
      <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
        <h2 className="text-sm font-semibold text-[#EAECEF] mb-4">Distribuição por plano</h2>
        <DonutChart
          jogador={fansByPlan.JOGADOR}
          craque={fansByPlan.CRAQUE}
          lenda={fansByPlan.LENDA}
          total={totalFans}
        />
      </div>

      {/* Sentimento — gauge */}
      <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
        <h2 className="text-sm font-semibold text-[#EAECEF] mb-4">Sentimento do mercado</h2>
        <SentimentGauge score={sentimentScore} />
      </div>

      {/* Crescimento mensal — gráfico de linha 6 meses */}
      <div className="bg-[#1E2329] rounded-xl border border-[#2B3139] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#EAECEF]">Crescimento mensal (6 meses)</h2>
          <span className={`text-sm font-bold ${growthColor}`}>
            {growthSign}{growthPct}%
          </span>
        </div>
        {sparkData.length >= 2 ? (
          <div className="overflow-x-auto">
            <SparkLine data={sparkData} />
            <div className="flex justify-between mt-1">
              {monthlyGrowth.map((m) => (
                <span key={m.month} className="text-[10px] text-[#929AA5]">
                  {m.month.slice(5)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#929AA5]">Dados insuficientes para exibir o gráfico.</p>
        )}
      </div>

      {/* Nota: sem repasse financeiro ao clube */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(59,130,246,.06)] border border-[rgba(59,130,246,.15)]">
        <Info className="h-4 w-4 text-[#3B82F6] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#929AA5]">
          <span className="text-[#EAECEF] font-medium">Dados informativos apenas</span> — sem repasse financeiro ao clube.
          As métricas exibidas neste portal são exclusivamente informativas e não representam
          nenhum tipo de receita, royalties ou repasse financeiro da plataforma para o clube.
        </p>
      </div>

      {/* Aviso LGPD */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(240,185,11,.06)] border border-[rgba(240,185,11,.12)]">
        <Shield className="h-4 w-4 text-[#F0B90B] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#929AA5]">
          Todos os dados exibidos são <span className="text-[#EAECEF]">exclusivamente agregados</span>.
          Nenhum dado individual, nome ou informação pessoal dos torcedores é exposto neste portal.
        </p>
      </div>
    </div>
  )
}
