'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'

interface ScoreHistoryPoint {
  date: string   // YYYY-MM-DD
  rank: number
  score: number
}

interface ScoreHistoryResponse {
  data: {
    breakdown: Record<string, unknown>
    scoreTotal: number
    rank: number
    lastScoreAt: string
    history: ScoreHistoryPoint[]
  }
}

function fetchMyScore(leagueId: string): Promise<ScoreHistoryResponse> {
  return fetch(`/api/v1/leagues/${leagueId}/my-score`).then((r) => r.json())
}

interface Props {
  leagueId: string
}

/**
 * LeagueScoreHistory — gráfico de evolução do score total ao longo dos dias da liga.
 * Exibe linha de tendência simples baseada em snapshots diários.
 */
export function LeagueScoreHistory({ leagueId }: Props) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['league-my-score', leagueId],
    queryFn: () => fetchMyScore(leagueId),
    staleTime: 5 * 60 * 1000,
  })

  if (isPending) {
    return (
      <div className="rounded-xl border border-[#2a2724] p-4 bg-[#1a1816]">
        <div className="h-4 w-36 bg-white/10 rounded animate-pulse mb-4" />
        <div className="h-24 bg-white/5 rounded animate-pulse" />
      </div>
    )
  }

  if (isError || !data?.data?.history?.length) {
    return (
      <div className="rounded-xl border border-[#2a2724] p-4 bg-[#1a1816] flex flex-col items-center justify-center gap-2 min-h-[100px]">
        <TrendingUp className="h-6 w-6 text-gray-600" aria-hidden="true" />
        <p className="text-xs text-gray-500">Sem histórico ainda. Volte amanhã.</p>
      </div>
    )
  }

  const history = data.data.history
  const scores = history.map((h) => h.score)
  const maxScore = Math.max(...scores, 1)
  const minScore = Math.min(...scores, 0)
  const range = maxScore - minScore || 1

  const width = 280
  const height = 80
  const padX = 8
  const padY = 8

  const points = history.map((h, i) => {
    const x = padX + ((i / Math.max(history.length - 1, 1)) * (width - padX * 2))
    const y = padY + ((1 - (h.score - minScore) / range) * (height - padY * 2))
    return { x, y, ...h }
  })

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const lastPoint = points[points.length - 1]!
  const currentScore = data.data.scoreTotal

  return (
    <div className="rounded-xl border border-[#2a2724] p-4 bg-[#1a1816]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Evolução do Score
        </h3>
        <span className="text-sm font-bold text-[#F0B90B]">
          {currentScore.toFixed(1)} pts
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        aria-label={`Gráfico de evolução do score — atual: ${currentScore.toFixed(1)} pts`}
        role="img"
      >
        {/* Linha de fundo */}
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="#2a2724"
          strokeWidth="1"
        />

        {/* Área preenchida */}
        <polygon
          points={`${padX},${height - padY} ${polyline} ${lastPoint.x},${height - padY}`}
          fill="#F0B90B"
          fillOpacity="0.08"
        />

        {/* Linha do gráfico */}
        <polyline
          points={polyline}
          fill="none"
          stroke="#F0B90B"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Ponto atual */}
        <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill="#F0B90B" />
      </svg>

      {/* Datas início/fim */}
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600">{history[0]!.date}</span>
        <span className="text-[10px] text-gray-600">{history[history.length - 1]!.date}</span>
      </div>
    </div>
  )
}
