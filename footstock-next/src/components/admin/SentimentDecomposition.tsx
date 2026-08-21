'use client'

import { Pause, Clock, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type SentimentStalenessState = 'FRESCO' | 'OBSOLETO' | 'PAUSADO' | 'NUNCA_ESCRITO'

interface SentimentComponentEntry {
  value: number
  weight: number
  label?: string
}

export interface SentimentDecompositionProps {
  sentiment: string | null
  sentimentScore: number | null
  sentimentReason: string | null
  sentimentComponents: Record<string, SentimentComponentEntry> | null
  sentimentUpdatedAt: string | null
  sentimentStaleness: SentimentStalenessState
  sentimentAgeSeconds: number | null
  isHalted: boolean
  variant?: 'inline' | 'panel'
  loading?: boolean
}

const SENTIMENT_LABEL: Record<string, { label: string; color: string }> = {
  BULLISH: { label: 'Bullish', color: '#2EBD85' },
  BEARISH: { label: 'Bearish', color: '#F6465D' },
  NEUTRAL: { label: 'Neutro', color: '#929AA5' },
}

function formatAge(ageSeconds: number | null): string {
  if (ageSeconds === null) return ''
  if (ageSeconds < 60) return `${ageSeconds}s`
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}min`
  return `${Math.floor(ageSeconds / 3600)}h`
}

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(-1, Math.min(1, score))
  const pct = ((clamped + 1) / 2) * 100

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full bg-[#2B3139] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: clamped < 0
              ? `linear-gradient(90deg, #F6465D ${100 - Math.abs(clamped) * 100}%, #2B3139 100%)`
              : `linear-gradient(90deg, #2B3139 0%, #2EBD85 ${clamped * 100}%)`,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 rounded-sm bg-[#EAECEF]"
          style={{ left: `${pct}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>
      <span className="text-[11px] font-mono text-[#EAECEF] min-w-[36px] text-right">
        {clamped >= 0 ? '+' : ''}{clamped.toFixed(2)}
      </span>
    </div>
  )
}

function ComponentGrid({ components }: { components: Record<string, SentimentComponentEntry> }) {
  const entries = ['N', 'M', 'F'] as const

  return (
    <div className="grid grid-cols-3 gap-2">
      {entries.map((key) => {
        const entry = components[key]
        if (!entry || entry.weight === 0) {
          return (
            <div key={key} className="bg-[#0d1117] rounded-lg p-2 border border-[rgba(240,185,11,.06)]">
              <div className="text-[10px] text-[#707A8A] font-medium">{key}</div>
              <div className="text-[11px] text-[#707A8A] mt-0.5">
                {entry?.weight === 0 ? 'Desativado (peso 0)' : 'Sem dados'}
              </div>
            </div>
          )
        }
        return (
          <div key={key} className="bg-[#0d1117] rounded-lg p-2 border border-[rgba(240,185,11,.06)]">
            <div className="text-[10px] text-[#707A8A] font-medium">
              {key}{entry.label ? ` — ${entry.label}` : ''}
            </div>
            <div className="text-[11px] font-mono text-[#EAECEF] mt-0.5">
              {entry.value >= 0 ? '+' : ''}{entry.value.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#707A8A]">
              peso {entry.weight.toFixed(1)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SentimentDecomposition({
  sentiment,
  sentimentScore,
  sentimentReason,
  sentimentComponents,
  sentimentUpdatedAt,
  sentimentStaleness,
  sentimentAgeSeconds,
  isHalted,
  variant = 'panel',
  loading = false,
}: SentimentDecompositionProps) {
  if (loading) {
    return (
      <div className="p-3 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-48" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    )
  }

  if (sentimentStaleness === 'NUNCA_ESCRITO') {
    return (
      <div
        data-testid="admin-motor-club-sentiment-detail-empty"
        className="flex items-center gap-2 p-3 text-[#707A8A]"
      >
        <Clock className="h-3.5 w-3.5" />
        <span className="text-[11px]">
          Nunca calculado
          <span className="ml-1 text-[10px]">— O motor ainda nao gravou sentimento para este ativo</span>
        </span>
      </div>
    )
  }

  if (!sentiment && sentimentScore === null) {
    return (
      <div
        data-testid="admin-motor-club-sentiment-detail-error"
        className="flex items-center gap-2 p-3 text-[#F6465D]"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-[11px]">Dados indisponiveis — nao foi possivel carregar o sentimento</span>
      </div>
    )
  }

  const sentimentMeta = SENTIMENT_LABEL[sentiment ?? 'NEUTRAL'] ?? SENTIMENT_LABEL.NEUTRAL
  const isObsolete = sentimentStaleness === 'OBSOLETO'
  const isPaused = sentimentStaleness === 'PAUSADO' || isHalted

  const borderColor = isObsolete
    ? 'border-amber-500/30'
    : isPaused
    ? 'border-blue-500/30'
    : 'border-[rgba(240,185,11,.08)]'

  const isInline = variant === 'inline'

  return (
    <div
      data-testid="admin-motor-club-sentiment-detail"
      className={cn('p-3 space-y-2.5 border rounded-lg', borderColor)}
    >
      {/* Header: label + score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: sentimentMeta.color }}>
            {sentimentMeta.label}
          </span>
          {isPaused && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400">
              <Pause className="h-3 w-3" />
              Congelado por halt
            </span>
          )}
        </div>
        {isObsolete && sentimentAgeSeconds !== null && (
          <span
            data-testid="admin-motor-club-sentiment-staleness"
            className="text-[10px] text-amber-400"
          >
            Dados de ha {formatAge(sentimentAgeSeconds)}
          </span>
        )}
      </div>

      {/* Score bar */}
      {sentimentScore !== null && <ScoreBar score={sentimentScore} />}

      {/* Reason */}
      {sentimentReason && (
        <p
          className={cn(
            'text-[11px] text-[#929AA5] leading-relaxed',
            isInline && 'line-clamp-2'
          )}
        >
          {sentimentReason}
        </p>
      )}

      {/* Components */}
      {sentimentComponents && Object.keys(sentimentComponents).length > 0 && (
        <ComponentGrid components={sentimentComponents} />
      )}

      {/* Divergencia admin/publico (item 022) */}
      <p className="text-[10px] text-[#707A8A] leading-tight">
        Admin: tempo real. Area publica: atraso conforme plano (JOGADOR 60min, CRAQUE 30min, LENDA tempo real).
      </p>

      {/* Footer: timestamp + last flip */}
      <div className="flex items-center justify-between text-[10px] text-[#707A8A]">
        {sentimentUpdatedAt && (
          <span>
            Atualizado ha {formatAge(
              sentimentAgeSeconds ?? Math.floor((Date.now() - new Date(sentimentUpdatedAt).getTime()) / 1000)
            )}
          </span>
        )}
        {!isPaused && !isObsolete && sentimentUpdatedAt && (
          <span className="text-emerald-500/60">Fresco</span>
        )}
      </div>
    </div>
  )
}
