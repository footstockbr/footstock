import { Info } from 'lucide-react'

interface AssetFinancials {
  marketCap?: number | null
  ipoPrice?: number | null
  equityValue?: number | null
  freeFloat?: number | null
  totalShares?: number | null
  [key: string]: unknown
}

interface AssetForStats {
  ticker: string
  displayName: string
  currentPrice: number
  currentSupply: number
  totalShares: number
  financials: AssetFinancials | null
  sentiment: string
}

interface AssetStatsProps {
  asset: AssetForStats
  fairValuePremium: number | null
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'N/D'
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'N/D'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
}

function formatPremium(value: number): string {
  if (value === 0) return 'Preço Justo'
  const abs = Math.abs(value).toFixed(2).replace('.', ',')
  return value < 0 ? `-${abs}% (Desconto)` : `+${abs}% (Prêmio)`
}

interface StatCardProps {
  label: string
  value: string
  tooltip: string
  valueColor?: string
}

function StatCard({ label, value, tooltip, valueColor }: StatCardProps) {
  return (
    <div className="bg-[#141210] rounded-lg p-3 border border-[#2a2010]">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs text-[#7a7060]">{label}</span>
        <span title={tooltip} aria-label={tooltip} className="cursor-help">
          <Info className="w-3 h-3 text-[#4a3d2a]" />
        </span>
      </div>
      <span
        className="text-sm font-mono font-semibold"
        style={{ color: valueColor ?? '#F0EAD6' }}
      >
        {value}
      </span>
    </div>
  )
}

export function AssetStats({ asset, fairValuePremium }: AssetStatsProps) {
  if (!asset.financials) {
    return (
      <div
        data-testid="asset-stats"
        className="flex items-center justify-center p-8 text-sm text-[#7a7060]"
      >
        Dados financeiros não disponíveis para este ativo.
      </div>
    )
  }

  const f = asset.financials
  const marketCap =
    f.marketCap ?? asset.currentPrice * asset.currentSupply

  const premiumColor =
    fairValuePremium == null
      ? '#F0EAD6'
      : fairValuePremium < 0
      ? '#22c55e'
      : fairValuePremium > 0
      ? '#ef4444'
      : '#7a7060'

  return (
    <div
      data-testid="asset-stats"
      className="grid grid-cols-2 md:grid-cols-3 gap-3 p-1"
    >
      <StatCard
        label="Market Cap"
        value={formatCurrency(marketCap)}
        tooltip="Valor total de mercado = preço atual × ações em circulação"
      />
      <StatCard
        label="Preço IPO"
        value={formatCurrency(f.ipoPrice as number | null)}
        tooltip="Preço de lançamento inicial do ativo na plataforma"
      />
      <StatCard
        label="Equity Value"
        value={formatCurrency(f.equityValue as number | null)}
        tooltip="Valor patrimonial estimado do clube"
      />
      <StatCard
        label="Free Float"
        value={formatPercent(f.freeFloat as number | null)}
        tooltip="Percentual de ações disponíveis para negociação pelo público"
      />
      <StatCard
        label="Total de Ações"
        value={(f.totalShares as number | null ?? asset.totalShares)?.toLocaleString('pt-BR') ?? 'N/D'}
        tooltip="Quantidade total de ações emitidas pelo clube"
      />
      <StatCard
        label="Ações em Circulação"
        value={asset.currentSupply.toLocaleString('pt-BR')}
        tooltip="Ações atualmente em circulação no mercado"
      />
      <StatCard
        label="Prêmio/Desconto"
        value={fairValuePremium !== null ? formatPremium(fairValuePremium) : 'N/D'}
        tooltip="Diferença entre o preço atual e o valor intrínseco estimado do clube"
        valueColor={premiumColor}
      />
    </div>
  )
}
