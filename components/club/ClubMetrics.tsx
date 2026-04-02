'use client'
// ============================================================================
// Foot Stock — ClubMetrics
// Grid de KPIs do clube com formatação pt-BR e skeleton loading.
// Rastreabilidade: INT-084, US-025, TASK-2/ST002
// ============================================================================

import { Users, TrendingUp, Wallet, Trophy } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import type { ClubMetricsData } from '@/types/club'

interface ClubMetricsProps {
  metrics: ClubMetricsData | undefined
}

const ptBR = new Intl.NumberFormat('pt-BR')
const ptBRDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatFS(value: number): string {
  return `FS$ ${ptBRDecimal.format(value)}`
}

export function ClubMetrics({ metrics }: ClubMetricsProps) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Métricas do clube"
    >
      {/* Total de Fãs — destaque visual */}
      <StatCard
        label="Total de Fãs"
        value={metrics ? ptBR.format(metrics.totalFans) : '—'}
        icon={<Users size={16} />}
        isLoading={!metrics}
        className="border-[#C9A84C]/40"
        aria-label={`Total de Fãs: ${metrics ? ptBR.format(metrics.totalFans) : 'carregando'}`}
      />

      {/* FS$ Movimentado */}
      <StatCard
        label="FS$ Movimentado"
        value={metrics ? formatFS(metrics.totalFsMovimentado) : '—'}
        icon={<TrendingUp size={16} />}
        isLoading={!metrics}
      />

      {/* Valor Médio da Carteira */}
      <StatCard
        label="Valor Médio Carteira"
        value={metrics ? formatFS(metrics.avgPortfolioValue) : '—'}
        icon={<Wallet size={16} />}
        isLoading={!metrics}
      />

      {/* Ligas */}
      <StatCard
        label="Ligas Participando"
        value={metrics ? ptBR.format(metrics.leagueParticipation) : '—'}
        icon={<Trophy size={16} />}
        isLoading={!metrics}
      />
    </div>
  )
}
