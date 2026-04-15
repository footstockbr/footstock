'use client'

// ============================================================================
// Foot Stock — AssessorClient (module-21)
// UI interativa do Assessor IA — seleção de ticker + exibição de análise
// Conectada a GET /api/v1/ai/analyze?ticker=XXX
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { Search, Bot, TrendingUp, TrendingDown, Minus, Zap, Globe, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AIAnalysis, PlanType } from '@/types'

interface Asset {
  ticker: string
  displayName: string
  division: string
  sentiment: string
}

interface RateLimitStatus {
  allowed: boolean
  remaining: number
  resetAt: number
}

interface AssessorClientProps {
  planType: PlanType
}

// Busca lista de ativos para o seletor
async function fetchAssets(): Promise<Asset[]> {
  const res = await fetch('/api/v1/assets', { credentials: 'include' })
  if (!res.ok) return []
  const json = await res.json()
  return (json.data ?? []) as Asset[]
}

// Busca status do rate limit
async function fetchRateLimit(): Promise<RateLimitStatus | null> {
  try {
    const res = await fetch('/api/v1/ai/analyze/rate-status', { credentials: 'include' })
    if (!res.ok) return null
    const json = await res.json()
    return json.data as RateLimitStatus
  } catch {
    return null
  }
}

// Analisa um ativo
async function analyzeAsset(ticker: string): Promise<(AIAnalysis & { isWebSearched: boolean; cached: boolean }) | null> {
  const res = await fetch(`/api/v1/ai/analyze?ticker=${encodeURIComponent(ticker)}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json?.error?.message ?? 'Erro ao gerar análise')
  }
  const json = await res.json()
  return json.data as AIAnalysis & { isWebSearched: boolean; cached: boolean }
}

// Cores e labels dos sentimentos / recomendações / risco
const SENTIMENT_CONFIG = {
  BULLISH:  { label: 'BULLISH',  color: '#2EBD85', icon: TrendingUp,   bg: 'rgba(46,189,133,.12)' },
  NEUTRAL:  { label: 'NEUTRO',   color: '#F0B90B', icon: Minus,        bg: 'rgba(240,185,11,.12)' },
  BEARISH:  { label: 'BEARISH',  color: '#F6465D', icon: TrendingDown, bg: 'rgba(246,70,93,.12)'  },
}

const RECOMENDACAO_CONFIG = {
  COMPRAR: { label: 'COMPRAR', color: '#2EBD85', bg: 'rgba(46,189,133,.15)'  },
  MANTER:  { label: 'MANTER',  color: '#F0B90B', bg: 'rgba(240,185,11,.15)'  },
  VENDER:  { label: 'VENDER',  color: '#F6465D', bg: 'rgba(246,70,93,.15)'   },
}

const RISCO_CONFIG = {
  BAIXO: { label: 'Risco Baixo',  color: '#2EBD85', bg: 'rgba(46,189,133,.12)'  },
  MEDIO: { label: 'Risco Médio',  color: '#F0B90B', bg: 'rgba(240,185,11,.12)'  },
  ALTO:  { label: 'Risco Alto',   color: '#F6465D', bg: 'rgba(246,70,93,.12)'   },
}

export default function AssessorClient({ planType }: AssessorClientProps) {
  const isLenda = planType === 'LENDA'

  const [assets, setAssets] = useState<Asset[]>([])
  const [search, setSearch] = useState('')
  const [selectedTicker, setSelectedTicker] = useState('')
  const [analysis, setAnalysis] = useState<(AIAnalysis & { isWebSearched: boolean; cached: boolean }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Carrega assets e rate limit na montagem
  useEffect(() => {
    fetchAssets().then(setAssets)
    fetchRateLimit().then(setRateLimit)
  }, [])

  // Assets filtrados pelo search (memoizado para evitar recálculo a cada render)
  const filtered = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.ticker.toLowerCase().includes(search.toLowerCase()) ||
          a.displayName.toLowerCase().includes(search.toLowerCase())
      ),
    [assets, search]
  )

  const handleSelect = (ticker: string) => {
    setSelectedTicker(ticker)
    setSearch(ticker)
    setShowDropdown(false)
    setAnalysis(null)
    setError(null)
  }

  const handleAnalyze = async () => {
    if (!selectedTicker) {
      setError('Selecione um ativo para analisar.')
      return
    }
    if (rateLimit && !rateLimit.allowed) {
      const resetTime = new Date(rateLimit.resetAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
      setError(`Limite de análises atingido. Disponível às ${resetTime} BRT.`)
      return
    }

    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const result = await analyzeAsset(selectedTicker)
      setAnalysis(result)
      // Atualiza rate limit
      const rl = await fetchRateLimit()
      if (rl) setRateLimit(rl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assessor indisponível. Tente em breve.')
    } finally {
      setLoading(false)
    }
  }

  const sentimentConfig = analysis ? SENTIMENT_CONFIG[analysis.sentimentoGeral as keyof typeof SENTIMENT_CONFIG] : null
  const recConfig = analysis ? RECOMENDACAO_CONFIG[analysis.recomendacao as keyof typeof RECOMENDACAO_CONFIG] : null
  const riscoConfig = analysis ? RISCO_CONFIG[analysis.nivelRisco as keyof typeof RISCO_CONFIG] : null

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header de plano */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLenda ? (
            <Badge variant="lenda" size="xs">Lenda — IA com Web Search</Badge>
          ) : (
            <Badge variant="craque" size="xs">Craque — IA com Dados do Ativo</Badge>
          )}
        </div>
        {rateLimit && (
          <span className="text-[11px] text-[#929AA5]">
            {rateLimit.allowed
              ? `${rateLimit.remaining} análise${rateLimit.remaining !== 1 ? 's' : ''} restante${rateLimit.remaining !== 1 ? 's' : ''}`
              : 'Limite atingido'}
          </span>
        )}
      </div>

      {/* Seletor de ativo */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#707A8A]" />
          <input
            type="text"
            placeholder="Buscar ativo... (ex: URU3, TIM3)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setShowDropdown(true)
              if (!e.target.value) {
                setSelectedTicker('')
                setAnalysis(null)
              }
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            data-testid="assessor-ticker-input"
            className="w-full h-11 rounded-lg border border-[rgba(240,185,11,.2)] bg-[#181A20] pl-9 pr-3 text-sm text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[rgba(240,185,11,.5)] transition-colors"
          />
        </div>

        {showDropdown && search && (
          <div
            data-testid="assessor-ticker-dropdown"
            role="listbox"
            className="absolute top-12 left-0 right-0 z-50 bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto"
          >
            {filtered.length > 0 ? (
              filtered.slice(0, 12).map((a) => (
                <button
                  key={a.ticker}
                  role="option"
                  onMouseDown={() => handleSelect(a.ticker)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-[rgba(240,185,11,.06)] transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[#F0B90B] text-xs font-semibold w-10">{a.ticker}</span>
                    <span className="text-[#EAECEF]">{a.displayName}</span>
                  </div>
                  <span className="text-[10px] text-[#929AA5]">Série {a.division}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-[#707A8A] text-center">
                Nenhum ativo encontrado
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botão analisar */}
      <Button
        variant="primary"
        size="lg"
        onClick={handleAnalyze}
        disabled={loading || !selectedTicker}
        data-testid="assessor-analyze-button"
        className="w-full"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-[#080b12]/40 border-t-[#080b12] animate-spin" aria-hidden="true" />
            Analisando{isLenda ? ' (pesquisando web)' : ''}...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Analisar com IA{selectedTicker ? ` — ${selectedTicker}` : ''}
          </span>
        )}
      </Button>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          data-testid="assessor-error"
          className="flex items-start gap-2 p-3 bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] rounded-lg"
        >
          <AlertCircle className="h-4 w-4 text-[#F6465D] shrink-0 mt-0.5" />
          <p className="text-sm text-[#F6465D]">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div data-testid="assessor-loading" aria-busy="true" aria-label="Carregando análise" className="space-y-3 animate-pulse">
          <div className="h-4 bg-[#1E2329] rounded w-3/4" />
          <div className="h-4 bg-[#1E2329] rounded w-full" />
          <div className="h-4 bg-[#1E2329] rounded w-5/6" />
          <div className="h-20 bg-[#1E2329] rounded" />
        </div>
      )}

      {/* Resultado da análise */}
      {analysis && !loading && (
        <div data-testid="assessor-result" className="space-y-4">
          {/* Header do resultado */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[#F0B90B] font-bold text-sm">{analysis.ticker}</span>
              <span className="text-[#929AA5] text-xs">{analysis.clubName}</span>
              {analysis.isWebSearched && (
                <span
                  data-testid="assessor-web-searched-badge"
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20"
                >
                  <Globe className="h-3 w-3" />
                  Web pesquisada
                </span>
              )}
              {analysis.cached && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[rgba(240,185,11,.1)] text-[#F0B90B]/70 border border-[rgba(240,185,11,.15)]">
                  <Clock className="h-3 w-3" />
                  Cache
                </span>
              )}
            </div>
          </div>

          {/* Badges de decisão */}
          <div className="flex flex-wrap gap-2">
            {sentimentConfig && (
              <div
                data-testid="assessor-sentiment-badge"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: sentimentConfig.bg, color: sentimentConfig.color }}
              >
                <sentimentConfig.icon className="h-3.5 w-3.5" />
                {sentimentConfig.label}
              </div>
            )}
            {recConfig && (
              <div
                data-testid="assessor-recommendation-badge"
                className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide"
                style={{ background: recConfig.bg, color: recConfig.color }}
              >
                {recConfig.label}
              </div>
            )}
            {riscoConfig && (
              <div
                data-testid="assessor-risk-badge"
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: riscoConfig.bg, color: riscoConfig.color }}
              >
                {riscoConfig.label}
              </div>
            )}
          </div>

          {/* Resumo */}
          <div
            data-testid="assessor-resumo"
            className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
          >
            <p className="text-sm text-[#EAECEF] leading-relaxed">{analysis.resumo}</p>
          </div>

          {/* Pontos positivos e negativos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {analysis.pontosPositivos.length > 0 && (
              <div
                data-testid="assessor-pontos-positivos"
                className="bg-[#1E2329] rounded-xl border border-[rgba(46,189,133,.15)] p-4"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-[#2EBD85]" />
                  <span className="text-[11px] font-semibold text-[#2EBD85] uppercase tracking-wider">
                    Pontos Positivos
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.pontosPositivos.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#EAECEF]">
                      <span className="text-[#2EBD85] shrink-0 mt-0.5">+</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.pontosNegativos.length > 0 && (
              <div
                data-testid="assessor-pontos-negativos"
                className="bg-[#1E2329] rounded-xl border border-[rgba(246,70,93,.15)] p-4"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingDown className="h-3.5 w-3.5 text-[#F6465D]" />
                  <span className="text-[11px] font-semibold text-[#F6465D] uppercase tracking-wider">
                    Pontos Negativos
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.pontosNegativos.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#EAECEF]">
                      <span className="text-[#F6465D] shrink-0 mt-0.5">-</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Notícias recentes */}
          {analysis.noticiasRecentes && analysis.noticiasRecentes.length > 0 && (
            <div
              data-testid="assessor-noticias"
              className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="h-3.5 w-3.5 text-[#F0B90B]" />
                <span className="text-[11px] font-semibold text-[#929AA5] uppercase tracking-wider">
                  Notícias Consideradas
                </span>
              </div>
              <ul className="space-y-1.5">
                {analysis.noticiasRecentes.map((n, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#929AA5]">
                    <span className="shrink-0">{n.emoji}</span>
                    {n.titulo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disclaimer educacional */}
          <p className="text-[10px] text-[#707A8A] text-center px-2 leading-relaxed">
            Esta análise é gerada por IA com fins educacionais e não constitui recomendação de investimento real.
            O Foot Stock é um simulador financeiro com moeda virtual.
          </p>
        </div>
      )}
    </div>
  )
}
