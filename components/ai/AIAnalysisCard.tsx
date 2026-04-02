// ============================================================================
// Foot Stock — AIAnalysisCard (module-21/TASK-3/ST005)
// Card completo com análise do Assessor IA — todos os campos da AIAnalysis
// ============================================================================

'use client'

import { CheckCircle, XCircle, Globe, Zap, Bot } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingSkeleton } from '@/components/ai/LoadingSkeleton'
import { aiResponseParser } from '@/lib/services/AIResponseParser'
import { cn } from '@/lib/utils/cn'
import type { AIAnalysis } from '@/lib/types/ai'

interface AIAnalysisCardProps {
  analysis: AIAnalysis | undefined
  isLoading: boolean
}

function formatTimeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'menos de 1 minuto atrás'
  if (mins === 1) return '1 minuto atrás'
  return `${mins} minutos atrás`
}

// ---------------------------------------------------------------------------
// Sub-componentes internos
// ---------------------------------------------------------------------------

function RecommendationBadge({ recomendacao }: { recomendacao: AIAnalysis['recomendacao'] }) {
  const map: Record<AIAnalysis['recomendacao'], string> = {
    COMPRAR: 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30',
    MANTER:  'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30',
    VENDER:  'bg-red-500/20 text-red-400 ring-1 ring-red-500/30',
  }
  return (
    <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', map[recomendacao])}>
      {recomendacao}
    </span>
  )
}

function RiskBadge({ risco }: { risco: AIAnalysis['risco'] }) {
  const map: Record<AIAnalysis['risco'], string> = {
    BAIXO: 'text-emerald-400',
    MEDIO: 'text-yellow-400',
    ALTO:  'text-red-400',
  }
  return (
    <span className={cn('text-sm font-medium', map[risco])}>
      Risco {risco}
    </span>
  )
}

function SentimentGauge({ sentimento }: { sentimento: number }) {
  // Normalizar de [-1,1] para [0%,100%]
  const pct = ((sentimento + 1) / 2) * 100
  const clamped = Math.min(100, Math.max(0, pct))

  const barColor =
    sentimento > 0.2
      ? 'bg-emerald-400'
      : sentimento < -0.2
      ? 'bg-red-400'
      : 'bg-yellow-400'

  const label =
    sentimento > 0.2 ? 'Positivo' : sentimento < -0.2 ? 'Negativo' : 'Neutro'

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Sentimento do mercado</p>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-[#1e2a3a]"
        role="meter"
        aria-valuenow={sentimento}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-label={`Sentimento: ${label} (${sentimento.toFixed(2)} de 1)`}
      >
        <div
          className={cn('absolute left-0 top-0 h-full rounded-full transition-all', barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500" aria-hidden="true">
        {label} ({sentimento >= 0 ? '+' : ''}{sentimento.toFixed(2)})
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

/**
 * Card completo da análise do Assessor IA.
 * Estados: loading (skeleton), undefined (empty state), preenchido.
 */
export function AIAnalysisCard({ analysis, isLoading }: AIAnalysisCardProps) {
  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (!analysis) {
    return (
      <EmptyState
        title="Selecione um ticker para começar a análise"
        description="Escolha um dos 40 clubes disponíveis e clique em Analisar."
        className="rounded-xl border border-[#1e2a3a] bg-[#0f1923]"
      />
    )
  }

  const isFallback = aiResponseParser.isFallback(analysis)

  return (
    <article
      className="w-full space-y-5 rounded-xl border border-[#1e2a3a] bg-[#0f1923] p-5"
      aria-label={`Análise do ticker ${analysis.ticker}`}
    >
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-100">{analysis.ticker}</h2>
        <RecommendationBadge recomendacao={analysis.recomendacao} />
        <RiskBadge risco={analysis.risco} />

        {analysis.cached && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-slate-700/40 px-2 py-0.5 text-xs text-slate-400"
            title={`Análise de ${formatTimeAgo(analysis.generatedAt)}`}
          >
            <Zap className="h-3 w-3" aria-hidden="true" />
            Cache
          </span>
        )}

        {analysis.isWebSearched && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
            <Globe className="h-3 w-3" aria-hidden="true" />
            Web Search
          </span>
        )}
      </div>

      {/* Aviso de fallback */}
      {isFallback && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
          Análise simplificada disponível — dados completos indisponíveis no momento.
        </div>
      )}

      {/* Resumo */}
      <div className="rounded-lg bg-[#1a2230] px-4 py-3">
        <p className="text-sm leading-relaxed text-slate-100">{analysis.resumo}</p>
      </div>

      {/* Pontos positivos / negativos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-500">
            Pontos Positivos
          </p>
          <ul className="space-y-1">
            {analysis.pontos_positivos.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">
            Pontos Negativos
          </p>
          <ul className="space-y-1">
            {analysis.pontos_negativos.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sentimento */}
      <SentimentGauge sentimento={analysis.sentimento} />

      {/* Notícias relevantes */}
      {analysis.noticias_relevantes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notícias Relevantes
          </p>
          <ul className="space-y-1">
            {analysis.noticias_relevantes.map((n, i) => (
              <li key={i} className="text-sm text-slate-400">
                — {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-center gap-2 border-t border-[#1e2a3a] pt-4 text-xs text-slate-500">
        <Bot className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
        <span>
          <strong>Gerado por IA</strong> — Esta análise é educacional e não constitui recomendação financeira real.
        </span>
      </div>
    </article>
  )
}
