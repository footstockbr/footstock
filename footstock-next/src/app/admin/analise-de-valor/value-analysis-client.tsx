'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  Info,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { humanizeLayer, newsImpactLabel, newsSentimentLabel } from '@/lib/admin/value-analysis'

type AssetOption = {
  id: string
  ticker: string
  displayName: string
  realName: string | null
  currentPrice: number
  priceChange24h: number
}

type CauseType =
  | 'ADMIN_ACTION'
  | 'NEWS'
  | 'MARKET_FLOW'
  | 'SIMULATED_ENGINE'
  | 'UNEXPLAINED'

type EvidenceGrade = 'DIRECT' | 'CORRELATED' | 'DEGRADED'
type QualityFlag =
  | 'ATTRIBUTION_COLUMN_MISSING'
  | 'ATTRIBUTION_PERSIST_FAILED'
  | 'ATTRIBUTION_PARSE_FAILED'
  | 'ATTRIBUTION_TRUNCATED'
  | 'NEWS_WITHOUT_ID'
  | 'NEWS_QUEUE_AGGREGATED'
  | 'ORDER_FLOW_SNAPSHOT_UNAVAILABLE'
  | 'ORDER_FLOW_INELIGIBLE_ONLY'
  | 'LEGACY_BACKFILL'
  | 'SYNTHETIC_HISTORY'
  | 'UNKNOWN_DEGRADED_REASON'

type EngineAttribution = {
  version: 1 | 2
  primaryCause: string
  primaryLayer: string | null
  confidence: 'alta' | 'media' | 'baixa'
  explanation: string
  previousPrice: number
  enginePrice: number
  finalPrice: number
  engineDelta: number
  agentImpactPct: number
  agentDelta: number
  syntheticVolume: number
  pendingBuyVolume: number
  pendingSellVolume: number
  orderImbalance: number
  sessionType: string
  layerContributions: {
    layer: string
    deltaPrice: number
    contributionPct: number
    direction: 'up' | 'down' | 'neutral'
    metadata?: Record<string, number>
  }[]
  appliedControls: string[]
  generatedAt: string
  tickId?: string
  tickCount?: number
  causalEvents?: {
    id: string
    type: string
    source: string
    occurredAt: string
    direction: 'up' | 'down' | 'neutral'
    magnitude: number
    newsId?: string
    title?: string
    layer?: string
  }[]
  qualityFlags?: QualityFlag[]
  primaryExplanation?: string
  evidenceSentence?: string
  caveatSentence?: string
}

type Movement = {
  id: string
  from: string
  to: string
  previousPrice: number
  newPrice: number
  open: number
  high: number
  low: number
  absoluteChange: number
  percentageChange: number
  intraperiodRangePct: number
  direction: 'up' | 'down'
  magnitude: 'neutra' | 'baixa' | 'moderada' | 'alta' | 'critica'
  volume: number
  volumeDelta: number
  sessionType: string
  source: string
  causeType: CauseType
  causeLabel: string
  confidence: 'alta' | 'media' | 'baixa'
  confidenceScore: number
  explanation: string
  diagnosticNotes: string[]
  orderFlow: {
    buyQuantity: number
    sellQuantity: number
    netQuantity: number
    orderCount: number
    averageExecutedPrice: number | null
  }
  engineAttribution: EngineAttribution | null
  evidenceGrade: EvidenceGrade
  qualityFlags: QualityFlag[]
  directEvidence: {
    type: string
    label: string
    eventId: string
    source: string
    occurredAt: string
  }[]
  correlatedEvidence: {
    type: string
    label: string
    eventId?: string
    occurredAt?: string
    confidenceScore: number
  }[]
  degradedReason: string | null
  degradedOwner: string | null
  primaryExplanation: string
  evidenceSentence: string
  caveatSentence: string
  evidenceWindow: {
    startsAt: string
    endsAt: string
    newsLookbackMinutes: number
    newsGraceMinutes: number
    adminLookbackMinutes: number
    adminGraceMinutes: number
  }
  evidence: {
    news: {
      id: string
      title: string
      source: string | null
      sentiment: string
      impact: string
      occurredAt: string
      href: string
    }[]
    adminActions: {
      id: string
      action: string
      reason: string | null
      previousPrice: number | null
      newPrice: number | null
      occurredAt: string
      href: string
    }[]
  }
}

type ValueAnalysisReport = {
  asset: {
    ticker: string
    cluster: string
    displayName: string
    realName: string | null
    currentPrice: number
    fairValue: number
    sentiment: string
    volume: number
  }
  period: {
    requestedDays: number
    mode: 'preset' | 'custom'
    start: string
    end: string
    pricePoints: number
    maxPricePoints: number
  }
  summary: {
    startPrice: number
    endPrice: number
    absoluteChange: number
    percentageChange: number
    movementsAnalyzed: number
    countsByCause: Record<CauseType, number>
    largestMovement: Movement | null
    positiveMovements: number
    negativeMovements: number
    highMagnitudeMovements: number
    averageAbsChange: number
    volatilityPct: number
    explainedPct: number
    averageConfidenceScore: number
    reliabilityLabel: 'alta' | 'media' | 'baixa'
    dominantCause: {
      type: CauseType
      label: string
      count: number
    }
    fairValueGapPct: number
    valuationLabel: string
    sourceBreakdown: Record<string, number>
    newsSentimentBreakdown: Record<string, number>
    adminActionBreakdown: Record<string, number>
    topMovements: Movement[]
    reportNarrative: string
    attributionCoveragePct: number
    denominator: {
      type: string
      count: number
      period: { start: string; end: string }
    }
    directCount: number
    correlatedCount: number
    degradedCount: number
    period: { start: string; end: string }
  }
  movements: Movement[]
  evidenceTotals: {
    news: number
    adminActions: number
  }
  motorContext: {
    cluster: string
    configSource: 'redis' | 'defaults'
    updatedAt: string | null
    updatedBy: string | null
    effectiveParameters: {
      sigma: number
      theta: number
      spreadBase: number
      garchAlpha: number
      garchBeta: number
      garchOmega: number
      garchVolCap: number
      ofiRho: number
      lambdaScale: number
      supplyAmpCap: number
      pressureSpreadTicks: number
      pressureAbsorptionTicks: number
      pressureSpotCapPct: number
      velocityCapPct: number
      circuitBreakerPct: number
      haltDurationSeconds: number
    }
  }
}

const CAUSE_LABELS: Record<CauseType, string> = {
  ADMIN_ACTION: 'Admin',
  NEWS: 'Notícia',
  MARKET_FLOW: 'Mercado',
  SIMULATED_ENGINE: 'Motor',
  UNEXPLAINED: 'Sem causa',
}

const CAUSE_BADGE: Record<CauseType, 'default' | 'success' | 'error' | 'warning' | 'info'> = {
  ADMIN_ACTION: 'warning',
  NEWS: 'info',
  MARKET_FLOW: 'success',
  SIMULATED_ENGINE: 'default',
  UNEXPLAINED: 'error',
}

const MAGNITUDE_LABEL: Record<Movement['magnitude'], string> = {
  neutra: 'Neutra',
  baixa: 'Baixa',
  moderada: 'Moderada',
  alta: 'Alta',
  critica: 'Crítica',
}

const CONFIDENCE_BADGE: Record<Movement['confidence'], 'success' | 'warning' | 'error'> = {
  alta: 'success',
  media: 'warning',
  baixa: 'error',
}

const EVIDENCE_GRADE_LABEL: Record<EvidenceGrade, string> = {
  DIRECT: 'Direta',
  CORRELATED: 'Correlacionada',
  DEGRADED: 'Degradada',
}

const EVIDENCE_GRADE_BADGE: Record<EvidenceGrade, 'success' | 'warning' | 'error'> = {
  DIRECT: 'success',
  CORRELATED: 'warning',
  DEGRADED: 'error',
}

const EVIDENCE_FILTERS: Array<{ value: 'ALL' | EvidenceGrade; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'DIRECT', label: 'Diretas' },
  { value: 'CORRELATED', label: 'Correlacionadas' },
  { value: 'DEGRADED', label: 'Degradadas' },
]

// Flags de qualidade em linguagem humana; o codigo tecnico fica no title/export.
const QUALITY_FLAG_LABELS: Record<QualityFlag, string> = {
  ATTRIBUTION_COLUMN_MISSING: 'Coluna de atribuição ausente no banco',
  ATTRIBUTION_PERSIST_FAILED: 'Falha ao gravar a atribuição',
  ATTRIBUTION_TRUNCATED: 'Atribuição truncada (payload grande)',
  ATTRIBUTION_PARSE_FAILED: 'Atribuição ilegível pelo parser',
  NEWS_WITHOUT_ID: 'Notícia sem identificador',
  NEWS_QUEUE_AGGREGATED: 'Várias notícias agregadas na fila',
  ORDER_FLOW_SNAPSHOT_UNAVAILABLE: 'Snapshot do book indisponível',
  ORDER_FLOW_INELIGIBLE_ONLY: 'Apenas ordens inelegíveis no book',
  LEGACY_BACKFILL: 'Histórico legado reprocessado',
  SYNTHETIC_HISTORY: 'Histórico sintético (simulação)',
  UNKNOWN_DEGRADED_REASON: 'Degradação sem motivo registrado',
}

function qualityFlagLabel(flag: QualityFlag): string {
  return QUALITY_FLAG_LABELS[flag] ?? flag
}

const CAUSAL_EVENT_TYPE_LABELS: Record<string, string> = {
  NEWS: 'Notícia',
  ADMIN_ACTION: 'Ação administrativa',
  ORDER_FLOW: 'Fluxo de ordens',
  LAYER: 'Influência do motor',
  CONTROL: 'Controle do motor',
  SYNTHETIC_AGENT: 'Agentes simulados',
  CORRELATION: 'Correlação de mercado',
  NUDGE: 'Destravamento de atividade',
}

function causalEventTypeLabel(type: string): string {
  return CAUSAL_EVENT_TYPE_LABELS[type] ?? type
}

const SOURCE_LABELS: Record<string, string> = {
  MOTOR: 'Motor de preços',
  GBM: 'Sintético (GBM)',
  REAL: 'Mercado real',
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

const ADMIN_ACTION_SHORT_LABELS: Record<string, string> = {
  ADJUST_PRICE: 'Ajuste de preço',
  INJECT_NEWS: 'Injeção de notícia',
  NEWS_INJECT: 'Injeção de notícia',
  PAUSE_ASSET: 'Pausa do ativo',
  RESUME_ASSET: 'Retomada do ativo',
  HALT_ASSET: 'Suspensão do ativo',
  RELEASE_HALT: 'Liberação de suspensão',
  FORCE_CIRCUIT_BREAKER: 'Circuit breaker manual',
  HALT_ALL: 'Suspensão geral',
  RESUME_ALL: 'Retomada geral',
}

function adminActionShortLabel(action: string): string {
  return ADMIN_ACTION_SHORT_LABELS[action] ?? action
}

const PERIOD_OPTIONS = [
  { value: '1', label: '1 dia' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
]
const MOVEMENTS_PAGE_SIZE = 20

function formatCurrency(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPct(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

function formatSignedCurrency(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatCurrency(value)}`
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR')
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function objectEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1])
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const DEFAULT_END_DATE = toDateInputValue(new Date())
const DEFAULT_START_DATE = toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function reportToMarkdown(report: ValueAnalysisReport): string {
  const lines = [
    `# Análise de valor - ${report.asset.ticker}`,
    '',
    `Ativo: ${report.asset.displayName}`,
    `Período: ${formatDateTime(report.period.start)} até ${formatDateTime(report.period.end)}`,
    `Preço inicial: ${formatCurrency(report.summary.startPrice)}`,
    `Preço final: ${formatCurrency(report.summary.endPrice)}`,
    `Variação acumulada: ${formatPct(report.summary.percentageChange)}`,
    `Causa dominante: ${report.summary.dominantCause.label}`,
    `Confiabilidade média: ${report.summary.averageConfidenceScore}% (${report.summary.reliabilityLabel})`,
    `Cobertura causal direta: ${report.summary.attributionCoveragePct}% de ${report.summary.denominator.count} movimento(s) com rawChange != 0`,
    `Configuração do motor: ${report.motorContext.configSource === 'redis' ? 'admin/Redis' : 'defaults do motor'}`,
    `Cluster: ${report.motorContext.cluster}`,
    `Parâmetros efetivos: sigma=${report.motorContext.effectiveParameters.sigma}, theta=${report.motorContext.effectiveParameters.theta}, OFI rho=${report.motorContext.effectiveParameters.ofiRho}, velocity cap=${report.motorContext.effectiveParameters.velocityCapPct}%/tick, circuit breaker=${report.motorContext.effectiveParameters.circuitBreakerPct}%`,
    '',
    '## Resumo executivo',
    report.summary.reportNarrative,
    '',
    '## Movimentos',
    ...report.movements.map((movement) => [
      '',
      `### ${formatDateTime(movement.to)} - ${formatPct(movement.percentageChange)}`,
      `Preço: ${formatCurrency(movement.previousPrice)} -> ${formatCurrency(movement.newPrice)}`,
      `Causa provável: ${movement.causeLabel}`,
      `Grade de evidência: ${movement.evidenceGrade}`,
      `Flags: ${movement.qualityFlags.map((flag) => `${qualityFlagLabel(flag)} (${flag})`).join(', ') || 'nenhuma'}`,
      `Confiança: ${movement.confidenceScore}%`,
      `Explicação: ${movement.primaryExplanation}`,
      `Evidência: ${movement.evidenceSentence}`,
      `Ressalva: ${movement.caveatSentence}`,
      `Notas: ${movement.diagnosticNotes.join(' | ')}`,
    ].join('\n')),
  ]
  return lines.join('\n')
}

function getApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  const error = record.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  return fallback
}

async function fetchAssets(): Promise<AssetOption[]> {
  const res = await fetch('/api/v1/admin/assets', { credentials: 'include' })
  const payload = await res.json()
  if (!res.ok) throw new Error(getApiError(payload, 'Não foi possível carregar os ativos.'))
  return payload.data ?? []
}

async function fetchReport(paramsInput: {
  ticker: string
  days: string
  startDate: string
  endDate: string
}): Promise<ValueAnalysisReport> {
  const params = new URLSearchParams({ ticker: paramsInput.ticker })
  if (paramsInput.days === 'custom') {
    params.set('start', paramsInput.startDate)
    params.set('end', paramsInput.endDate)
  } else {
    params.set('days', paramsInput.days)
  }
  const res = await fetch(`/api/v1/admin/value-analysis?${params.toString()}`, {
    credentials: 'include',
  })
  const payload = await res.json()
  if (!res.ok) throw new Error(getApiError(payload, 'Não foi possível gerar a análise.'))
  return payload.data
}

export function ValueAnalysisClient() {
  const [assets, setAssets] = useState<AssetOption[]>([])
  const [selectedTicker, setSelectedTicker] = useState('')
  const [days, setDays] = useState('7')
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE)
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE)
  const [report, setReport] = useState<ValueAnalysisReport | null>(null)
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    let active = true
    setAssetsLoading(true)
    fetchAssets()
      .then((items) => {
        if (!active) return
        setAssets(items)
        setSelectedTicker((current) => current || items[0]?.ticker || '')
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os ativos.')
      })
      .finally(() => {
        if (active) setAssetsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const assetOptions = useMemo(
    () =>
      assets.map((asset) => ({
        value: asset.ticker,
        label: `${asset.ticker} · ${asset.displayName}`,
      })),
    [assets],
  )

  const selectedAsset = assets.find((asset) => asset.ticker === selectedTicker)

  async function handleGenerate() {
    if (!selectedTicker || reportLoading) return
    if (days === 'custom' && (!startDate || !endDate || startDate > endDate)) {
      setError('Informe um período personalizado válido.')
      return
    }
    setReportLoading(true)
    setError(null)
    try {
      const data = await fetchReport({ ticker: selectedTicker, days, startDate, endDate })
      setReport(data)
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : 'Não foi possível gerar a análise.')
    } finally {
      setReportLoading(false)
    }
  }

  async function handleCopySummary() {
    if (!report) return
    const text = reportToMarkdown(report)
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  function handleDownloadMarkdown() {
    if (!report) return
    downloadText(`analise-valor-${report.asset.ticker}.md`, reportToMarkdown(report), 'text/markdown;charset=utf-8')
  }

  function handleDownloadJson() {
    if (!report) return
    downloadText(`analise-valor-${report.asset.ticker}.json`, JSON.stringify(report, null, 2), 'application/json;charset=utf-8')
  }

  return (
    <div data-testid="page-admin-analise-valor" className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-[#EAECEF]">Análise de valor</h1>
          <p className="text-xs text-[#929AA5]">
            Relatório por ativo com variações de preço, causa provável e evidências registradas.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_140px_auto] lg:min-w-[720px]">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase text-[#929AA5]">Ativo</span>
            <NativeSelect
              value={selectedTicker}
              onValueChange={setSelectedTicker}
              disabled={assetsLoading || reportLoading}
              placeholder={assetsLoading ? 'Carregando ativos...' : 'Escolha uma ação'}
              options={assetOptions}
              data-testid="value-analysis-asset-select"
              triggerClassName="h-10 border-[rgba(240,185,11,.18)] bg-[#1E2329] text-[#EAECEF]"
            />
          </label>

          {days === 'custom' && (
            <div className="grid grid-cols-2 gap-2 sm:col-span-3">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase text-[#929AA5]">Início</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  max={endDate}
                  disabled={reportLoading}
                  className="h-10 w-full rounded-md border border-[rgba(240,185,11,.18)] bg-[#1E2329] px-3 text-sm text-[#EAECEF]"
                  data-testid="value-analysis-start-date"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase text-[#929AA5]">Fim</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  min={startDate}
                  disabled={reportLoading}
                  className="h-10 w-full rounded-md border border-[rgba(240,185,11,.18)] bg-[#1E2329] px-3 text-sm text-[#EAECEF]"
                  data-testid="value-analysis-end-date"
                />
              </label>
            </div>
          )}

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase text-[#929AA5]">Período</span>
            <NativeSelect
              value={days}
              onValueChange={setDays}
              disabled={reportLoading}
              options={PERIOD_OPTIONS}
              data-testid="value-analysis-period-select"
              triggerClassName="h-10 border-[rgba(240,185,11,.18)] bg-[#1E2329] text-[#EAECEF]"
            />
          </label>

          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!selectedTicker || assetsLoading}
            isLoading={reportLoading}
            className="mt-5 gap-2"
            data-testid="value-analysis-generate-button"
          >
            <Search className="h-4 w-4" />
            Gerar relatório
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-[rgba(246,70,93,.28)] bg-[rgba(246,70,93,.08)] p-4 text-sm text-[#F6465D]">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!report && !error && (
        <div className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-6">
          <div className="flex items-start gap-3">
            <FileSearch className="mt-1 h-5 w-5 flex-shrink-0 text-[#F0B90B]" />
            <div>
              <h2 className="text-sm font-semibold text-[#EAECEF]">
                Escolha uma ação para gerar a análise
              </h2>
              <p className="mt-1 text-sm text-[#929AA5]">
                O relatório cruza candles de preço, notícias associadas ao ticker e ações administrativas registradas.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedAsset && !report && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard label="Ativo selecionado" value={selectedAsset.ticker} detail={selectedAsset.displayName} />
          <MetricCard label="Preço atual" value={formatCurrency(selectedAsset.currentPrice)} detail="valor em tempo real do cadastro" />
          <MetricCard label="Variação 24h" value={formatPct(selectedAsset.priceChange24h)} trend={selectedAsset.priceChange24h} />
        </div>
      )}

      {report && (
        <>
          <ReportSummary
            report={report}
            onRefresh={handleGenerate}
            loading={reportLoading}
            onCopySummary={handleCopySummary}
            onDownloadMarkdown={handleDownloadMarkdown}
            onDownloadJson={handleDownloadJson}
            copyState={copyState}
          />
          <ReportTabs report={report} />
        </>
      )}
    </div>
  )
}

function ReportTabs({ report }: { report: ValueAnalysisReport }) {
  return (
    <Tabs defaultValue="resumo" className="space-y-4">
      <TabsList
        label="Seções do relatório de análise de valor"
        className="grid w-full grid-cols-2 rounded-lg border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-1 sm:flex"
      >
        <TabsTrigger value="resumo" className="px-3 sm:flex-1">Resumo</TabsTrigger>
        <TabsTrigger value="causas" className="px-3 sm:flex-1">Causas</TabsTrigger>
        <TabsTrigger value="movimentos" className="px-3 sm:flex-1">Movimentos</TabsTrigger>
        <TabsTrigger value="metodologia" className="px-3 sm:flex-1">Metodologia</TabsTrigger>
      </TabsList>

      <TabsContent value="resumo" className="space-y-4">
        <ExecutiveDiagnosis report={report} />
        <TopMovements report={report} />
      </TabsContent>

      <TabsContent value="causas">
        <CauseBreakdown report={report} />
      </TabsContent>

      <TabsContent value="movimentos">
        <MovementList movements={report.movements} />
      </TabsContent>

      <TabsContent value="metodologia">
        <MethodologyPanel report={report} />
      </TabsContent>
    </Tabs>
  )
}

function MetricCard({
  label,
  value,
  detail,
  trend,
}: {
  label: string
  value: string
  detail?: string
  trend?: number
}) {
  return (
    <div className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-4">
      <p className="text-[11px] font-semibold uppercase text-[#929AA5]">{label}</p>
      <p className={cn('mt-2 text-lg font-bold text-[#EAECEF]', trend && trend < 0 && 'text-[#F6465D]', trend && trend > 0 && 'text-[#2EBD85]')}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-[#929AA5]">{detail}</p>}
    </div>
  )
}

function ReportSummary({
  report,
  onRefresh,
  loading,
  onCopySummary,
  onDownloadMarkdown,
  onDownloadJson,
  copyState,
}: {
  report: ValueAnalysisReport
  onRefresh: () => Promise<void>
  loading: boolean
  onCopySummary: () => Promise<void>
  onDownloadMarkdown: () => void
  onDownloadJson: () => void
  copyState: 'idle' | 'copied' | 'failed'
}) {
  const trend = report.summary.percentageChange

  return (
    <section className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-[#EAECEF]">
              {report.asset.ticker} · {report.asset.displayName}
            </h2>
            <Badge variant={trend >= 0 ? 'success' : 'error'} size="xs">
              {formatPct(trend)}
            </Badge>
            <Badge variant="default" size="xs">
              sentimento {newsSentimentLabel(report.asset.sentiment)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[#929AA5]">
            {formatDateTime(report.period.start)} até {formatDateTime(report.period.end)} · {report.period.pricePoints} pontos de preço
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[#c5b99a] line-clamp-4 md:line-clamp-none">
            {report.summary.reportNarrative}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void onCopySummary()}
            className="gap-2 self-start"
            data-testid="value-analysis-copy-summary"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyState === 'copied' ? 'Copiado' : copyState === 'failed' ? 'Falhou' : 'Copiar'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDownloadMarkdown}
            className="gap-2 self-start"
            data-testid="value-analysis-download-md"
          >
            <Download className="h-3.5 w-3.5" />
            MD
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDownloadJson}
            className="gap-2 self-start"
            data-testid="value-analysis-download-json"
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={loading}
            onClick={() => void onRefresh()}
            className="gap-2 self-start"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Preço inicial" value={formatCurrency(report.summary.startPrice)} />
        <MetricCard label="Preço final" value={formatCurrency(report.summary.endPrice)} />
        <MetricCard label="Mudança total" value={formatSignedCurrency(report.summary.absoluteChange)} trend={trend} />
        <MetricCard
          label="Cobertura causal"
          value={`${report.summary.attributionCoveragePct}%`}
          detail={`${report.summary.directCount}/${report.summary.denominator.count} diretos no período`}
        />
      </div>
    </section>
  )
}

function ExecutiveDiagnosis({ report }: { report: ValueAnalysisReport }) {
  const trend = report.summary.percentageChange
  const dominantPct = report.summary.movementsAnalyzed > 0
    ? Math.round((report.summary.dominantCause.count / report.summary.movementsAnalyzed) * 100)
    : 0

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <div className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">Diagnóstico executivo</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <InsightTile
            icon={<Target className="h-4 w-4" />}
            label="Causa dominante"
            value={report.summary.dominantCause.label}
            detail={`${dominantPct}% das mudanças classificadas`}
          />
          <InsightTile
            icon={<Activity className="h-4 w-4" />}
            label="Volatilidade observada"
            value={formatPct(report.summary.volatilityPct)}
            detail={`média por mudança: ${formatPct(report.summary.averageAbsChange)}`}
          />
          <InsightTile
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Cobertura causal"
            value={`${report.summary.attributionCoveragePct}%`}
            detail={`${report.summary.directCount} diretos · ${report.summary.correlatedCount} correlacionados · ${report.summary.degradedCount} degradados`}
          />
        </div>

        <div className="mt-4 rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase text-[#929AA5]">Calibração do motor aplicada</p>
              <p className="mt-1 text-xs text-[#c5b99a]">
                Cluster {report.motorContext.cluster} · {report.motorContext.configSource === 'redis' ? 'configuração salva pelo admin' : 'defaults do motor'}
                {report.motorContext.updatedAt ? ` · atualizada em ${formatDateTime(report.motorContext.updatedAt)}` : ''}
              </p>
            </div>
            <a
              href="/admin/motor"
              className="text-xs font-semibold text-[#F0B90B] hover:text-[#EAECEF]"
            >
              Alterar camadas
            </a>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
            <MiniStat label="Sigma" value={report.motorContext.effectiveParameters.sigma.toFixed(4)} />
            <MiniStat label="Theta" value={report.motorContext.effectiveParameters.theta.toFixed(2)} />
            <MiniStat label="OFI rho" value={report.motorContext.effectiveParameters.ofiRho.toFixed(4)} />
            <MiniStat label="Vel. cap" value={`${report.motorContext.effectiveParameters.velocityCapPct}%`} />
            <MiniStat label="CB" value={`${report.motorContext.effectiveParameters.circuitBreakerPct}%`} />
            <MiniStat label="Halt" value={`${report.motorContext.effectiveParameters.haltDurationSeconds}s`} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-4">
          <p className="text-[11px] font-semibold uppercase text-[#929AA5]">Leitura do período</p>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-[#c5b99a] md:grid-cols-2">
            <p>
              O ativo fechou o recorte com {formatPct(trend)} de variação acumulada, com {report.summary.positiveMovements} movimentos de alta e {report.summary.negativeMovements} de baixa.
            </p>
            <p>
              {report.summary.highMagnitudeMovements} mudança(s) tiveram magnitude alta ou crítica. Esses pontos merecem revisão manual antes de comunicar uma causa como conclusiva.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-4">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-[#F0B90B]" />
          <h2 className="text-sm font-semibold text-[#EAECEF]">Valor justo</h2>
        </div>

        <div className="mt-4 space-y-3">
          <MetricCard
            label="Valor justo cadastrado"
            value={report.asset.fairValue > 0 ? formatCurrency(report.asset.fairValue) : 'Indisponível'}
          />
          <MetricCard
            label="Desvio contra valor justo"
            value={report.asset.fairValue > 0 ? formatPct(report.summary.fairValueGapPct) : 'Sem base'}
            detail={report.summary.valuationLabel}
            trend={report.summary.fairValueGapPct}
          />
          <div className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3 text-xs leading-5 text-[#929AA5]">
            A leitura de valor justo compara o preço final do período com a referência interna cadastrada. Ela não explica causalidade sozinha, mas mostra se a variação deixou o ativo distante da base de avaliação.
          </div>
        </div>
      </div>
    </section>
  )
}

function InsightTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
      <div className="flex items-center gap-2 text-[#F0B90B]">
        {icon}
        <span className="text-[11px] font-semibold uppercase text-[#929AA5]">{label}</span>
      </div>
      <p className="mt-3 text-base font-bold text-[#EAECEF]">{value}</p>
      <p className="mt-1 text-xs text-[#929AA5]">{detail}</p>
    </div>
  )
}

function CauseBreakdown({ report }: { report: ValueAnalysisReport }) {
  const entries = Object.entries(report.summary.countsByCause) as [CauseType, number][]
  const total = Math.max(report.summary.movementsAnalyzed, 1)

  return (
    <section className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-[#F0B90B]" />
        <h2 className="text-sm font-semibold text-[#EAECEF]">Distribuição das causas prováveis</h2>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {entries.map(([cause, count]) => {
            const pctValue = Math.round((count / total) * 100)
            return (
              <div key={cause} className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant={CAUSE_BADGE[cause]} size="xs">{CAUSE_LABELS[cause]}</Badge>
                  <span className="text-xs text-[#929AA5]">{count} movimento(s) · {pctValue}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1E2329]">
                  <div
                    className="h-full rounded-full bg-[#F0B90B]"
                    style={{ width: `${pctValue}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-3">
          <BreakdownBox
            title="Grade de evidência"
            entries={[
              ['DIRECT', report.summary.directCount],
              ['CORRELATED', report.summary.correlatedCount],
              ['DEGRADED', report.summary.degradedCount],
            ]}
            empty="Sem movimentos."
          />
          <BreakdownBox
            title="Fontes dos candles"
            entries={objectEntries(report.summary.sourceBreakdown).map(([key, count]) => [sourceLabel(key), count] as [string, number])}
            empty="Sem movimentos."
          />
          <BreakdownBox
            title="Sentimento das notícias"
            entries={objectEntries(report.summary.newsSentimentBreakdown).map(([key, count]) => [`Sentimento ${newsSentimentLabel(key)}`, count] as [string, number])}
            empty="Sem notícias no recorte."
          />
          <BreakdownBox
            title="Ações administrativas"
            entries={objectEntries(report.summary.adminActionBreakdown).map(([key, count]) => [adminActionShortLabel(key), count] as [string, number])}
            empty="Sem ações no recorte."
          />
        </div>
      </div>
    </section>
  )
}

function BreakdownBox({
  title,
  entries,
  empty,
}: {
  title: string
  entries: [string, number][]
  empty: string
}) {
  return (
    <div className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
      <h3 className="text-[11px] font-semibold uppercase text-[#929AA5]">{title}</h3>
      {entries.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {entries.map(([label, count]) => (
            <li key={label} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-[#c5b99a]">{label}</span>
              <span className="font-mono text-[#EAECEF]">{count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[#929AA5]">{empty}</p>
      )}
    </div>
  )
}

function TopMovements({ report }: { report: ValueAnalysisReport }) {
  if (report.summary.topMovements.length === 0) return null

  return (
    <section className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[#F0B90B]" />
        <h2 className="text-sm font-semibold text-[#EAECEF]">Pontos críticos do período</h2>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {report.summary.topMovements.map((movement) => (
          <div key={movement.id} className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={movement.direction === 'up' ? 'success' : 'error'} size="xs">
                {formatPct(movement.percentageChange)}
              </Badge>
              <Badge variant={CAUSE_BADGE[movement.causeType]} size="xs">
                {movement.causeLabel}
              </Badge>
              <Badge variant={EVIDENCE_GRADE_BADGE[movement.evidenceGrade]} size="xs">
                {EVIDENCE_GRADE_LABEL[movement.evidenceGrade]}
              </Badge>
              {movement.engineAttribution && (
                <Badge variant="success" size="xs">
                  registrado pelo motor
                </Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-[#929AA5]">{formatDateTime(movement.to)}</p>
            <p className="mt-1 text-sm font-semibold text-[#EAECEF]">{formatCurrency(movement.newPrice)}</p>
            <p className="mt-2 text-xs leading-5 text-[#c5b99a]">{movement.primaryExplanation}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#929AA5]">
              <span>Ordens: {formatNumber(movement.orderFlow.orderCount)}</span>
              <span>Saldo: {formatNumber(movement.orderFlow.netQuantity)}</span>
              <span>Compras: {formatNumber(movement.orderFlow.buyQuantity)}</span>
              <span>Vendas: {formatNumber(movement.orderFlow.sellQuantity)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MovementList({ movements }: { movements: Movement[] }) {
  const [visibleCount, setVisibleCount] = useState(MOVEMENTS_PAGE_SIZE)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [gradeFilter, setGradeFilter] = useState<'ALL' | EvidenceGrade>('ALL')

  useEffect(() => {
    setVisibleCount(MOVEMENTS_PAGE_SIZE)
    setExpandedIds(new Set())
  }, [movements, gradeFilter])

  const filteredMovements = gradeFilter === 'ALL'
    ? movements
    : movements.filter((movement) => movement.evidenceGrade === gradeFilter)

  if (filteredMovements.length === 0) {
    return (
      <section className="space-y-3">
        <EvidenceFilter value={gradeFilter} onChange={setGradeFilter} movements={movements} />
        <div className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-6 text-sm text-[#929AA5]">
          Nenhuma mudança de preço foi encontrada para este filtro.
        </div>
      </section>
    )
  }

  const visibleMovements = filteredMovements.slice(0, visibleCount)
  const remainingCount = Math.max(0, filteredMovements.length - visibleMovements.length)

  function toggleMovement(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#EAECEF]">Linha do tempo das mudanças</h2>
          <p className="text-xs text-[#929AA5]">
            Exibindo {visibleMovements.length} de {filteredMovements.length} variações filtradas. Abra um item para ver evidências e notas.
          </p>
        </div>
      </div>
      <EvidenceFilter value={gradeFilter} onChange={setGradeFilter} movements={movements} />

      {visibleMovements.map((movement) => {
        const expanded = expandedIds.has(movement.id)
        return (
        <article
          key={movement.id}
          className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-3 sm:p-4"
          data-testid="value-analysis-movement-card"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => toggleMovement(movement.id)}
                className="flex w-full flex-wrap items-center gap-2 text-left"
                aria-expanded={expanded}
                data-testid="value-analysis-movement-toggle"
              >
                {movement.direction === 'up' ? (
                  <ArrowUpRight className="h-4 w-4 text-[#2EBD85]" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-[#F6465D]" />
                )}
                <span className="font-mono text-sm font-semibold text-[#EAECEF]">
                  {formatCurrency(movement.previousPrice)} → {formatCurrency(movement.newPrice)}
                </span>
                <Badge variant={movement.direction === 'up' ? 'success' : 'error'} size="xs">
                  {formatPct(movement.percentageChange)}
                </Badge>
                <Badge variant={CAUSE_BADGE[movement.causeType]} size="xs">
                  {movement.causeLabel}
                </Badge>
                <Badge variant={EVIDENCE_GRADE_BADGE[movement.evidenceGrade]} size="xs" data-testid={`value-analysis-grade-${movement.evidenceGrade}`}>
                  {EVIDENCE_GRADE_LABEL[movement.evidenceGrade]}
                </Badge>
                {movement.engineAttribution && (
                  <Badge variant="success" size="xs">
                    registrado pelo motor
                  </Badge>
                )}
                <Badge variant={CONFIDENCE_BADGE[movement.confidence]} size="xs">
                  {movement.confidenceScore}% confiança
                </Badge>
                <span className="ml-auto text-xs font-semibold text-[#F0B90B]">
                  {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                </span>
              </button>
              <p className="mt-2 text-sm leading-6 text-[#c5b99a] line-clamp-2">{movement.primaryExplanation}</p>
            </div>
            <div className="text-left text-xs text-[#929AA5] lg:text-right">
              <p>{formatDateTime(movement.from)} → {formatDateTime(movement.to)}</p>
              <p>magnitude {MAGNITUDE_LABEL[movement.magnitude]} · volume {formatNumber(movement.volume)}</p>
            </div>
          </div>

          {expanded && (
            <div data-testid="value-analysis-movement-details">
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
                <MiniStat label="Abertura" value={formatCurrency(movement.open)} />
                <MiniStat label="Máxima" value={formatCurrency(movement.high)} />
                <MiniStat label="Mínima" value={formatCurrency(movement.low)} />
                <MiniStat label="Range" value={formatPct(movement.intraperiodRangePct)} />
                <MiniStat label="Volume +" value={formatNumber(movement.volumeDelta)} />
                <MiniStat label="Fonte" value={sourceLabel(movement.source)} />
              </div>

              <div className="mt-3 rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={EVIDENCE_GRADE_BADGE[movement.evidenceGrade]} size="xs">
                    {EVIDENCE_GRADE_LABEL[movement.evidenceGrade]}
                  </Badge>
                  {movement.qualityFlags.map((flag) => (
                    <Badge key={flag} variant="warning" size="xs" title={flag}>{qualityFlagLabel(flag)}</Badge>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-[#c5b99a] md:grid-cols-3">
                  <p>{movement.primaryExplanation}</p>
                  <p>{movement.evidenceSentence}</p>
                  <p>{movement.caveatSentence}</p>
                </div>
                {movement.degradedReason && (
                  <p className="mt-2 text-xs text-[#F6465D]">
                    Degradação: {movement.degradedReason}{movement.degradedOwner ? ` · dono ${movement.degradedOwner}` : ''}
                  </p>
                )}
              </div>

              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase text-[#929AA5]">
                  Ordens executadas na janela (preenchem ao preço já calculado: consequência, não causa)
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
                  <MiniStat label="Ordens" value={formatNumber(movement.orderFlow.orderCount)} />
                  <MiniStat label="Compras" value={formatNumber(movement.orderFlow.buyQuantity)} />
                  <MiniStat label="Vendas" value={formatNumber(movement.orderFlow.sellQuantity)} />
                  <MiniStat label="Saldo" value={formatNumber(movement.orderFlow.netQuantity)} />
                  <MiniStat
                    label="Preço médio"
                    value={movement.orderFlow.averageExecutedPrice === null ? 'n/d' : formatCurrency(movement.orderFlow.averageExecutedPrice)}
                  />
                </div>
              </div>

              {movement.engineAttribution && (
                <div className="mt-4 rounded-lg border border-[rgba(46,189,133,.22)] bg-[#0B0E11] p-3">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase text-[#2EBD85]">Rastro causal do motor</h3>
                      <p className="mt-1 text-xs leading-5 text-[#c5b99a]">
                        Causa primária: {movement.engineAttribution.primaryLayer
                          ? humanizeLayer(movement.engineAttribution.primaryLayer)
                          : movement.engineAttribution.primaryCause}
                        {movement.engineAttribution.primaryLayer ? (
                          <span className="text-[#5a6470]"> (camada técnica {movement.engineAttribution.primaryLayer})</span>
                        ) : null}
                      </p>
                    </div>
                    <span className="text-xs text-[#929AA5]">
                      gerado em {formatDateTime(movement.engineAttribution.generatedAt)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                    <MiniStat label="Preço inicial" value={formatCurrency(movement.engineAttribution.previousPrice)} />
                    <MiniStat label="Após camadas" value={formatCurrency(movement.engineAttribution.enginePrice)} />
                    <MiniStat label="Preço final" value={formatCurrency(movement.engineAttribution.finalPrice)} />
                    <MiniStat label="Agentes" value={formatPct(movement.engineAttribution.agentImpactPct)} />
                    <MiniStat label="Vol. sintético" value={formatNumber(movement.engineAttribution.syntheticVolume)} />
                  </div>

                  <div className="mt-2">
                    <p className="text-[11px] font-semibold uppercase text-[#929AA5]">
                      Book antes do cálculo do preço (pressão elegível como causa)
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <MiniStat label="Compras pendentes" value={formatNumber(movement.engineAttribution.pendingBuyVolume)} />
                      <MiniStat label="Vendas pendentes" value={formatNumber(movement.engineAttribution.pendingSellVolume)} />
                      <MiniStat label="Saldo do book" value={formatNumber(movement.engineAttribution.orderImbalance)} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {(movement.engineAttribution.causalEvents ?? []).slice(0, 6).map((event) => (
                      <div
                        key={`${movement.id}-${event.id}`}
                        className="rounded-md border border-[rgba(46,189,133,.18)] bg-[#161A1F] px-3 py-2 text-xs"
                      >
                        <p className="font-medium text-[#EAECEF]">
                          {causalEventTypeLabel(event.type)} · {event.title ?? humanizeLayer(event.layer ?? event.source)}
                        </p>
                        <p className="mt-1 text-[#929AA5]">{event.newsId ? `notícia ${event.newsId} · ` : ''}{formatDateTime(event.occurredAt)}</p>
                      </div>
                    ))}
                    {movement.engineAttribution.layerContributions.slice(0, 6).map((layer) => (
                      <div
                        key={`${movement.id}-${layer.layer}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-[rgba(240,185,11,.08)] bg-[#161A1F] px-3 py-2 text-xs"
                        title={layer.layer}
                      >
                        <span className="min-w-0 truncate font-medium text-[#EAECEF]">{humanizeLayer(layer.layer)}</span>
                        <span className="flex-shrink-0 font-mono text-[#c5b99a]">
                          {formatSignedCurrency(layer.deltaPrice)} · {formatPct(layer.contributionPct).replace('+', '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h3 className="text-[11px] font-semibold uppercase text-[#929AA5]">Notas diagnósticas</h3>
                  <span className="text-xs text-[#929AA5]">
                    janela: {formatDateTime(movement.evidenceWindow.startsAt)} até {formatDateTime(movement.evidenceWindow.endsAt)}
                  </span>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {movement.diagnosticNotes.map((note) => (
                    <li key={note} className="flex gap-2 text-xs leading-5 text-[#c5b99a]">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#F0B90B]" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {(movement.evidence.news.length > 0 || movement.evidence.adminActions.length > 0) && (
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {movement.evidence.news.length > 0 && (
                    <EvidenceBox title="Notícias relacionadas">
                      {movement.evidence.news.map((item) => (
                        <li key={item.id} className="space-y-1">
                          <a
                            href={item.href}
                            className="inline-flex items-start gap-1 text-sm text-[#EAECEF] hover:text-[#F0B90B]"
                          >
                            <span>{item.title}</span>
                            <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0" />
                          </a>
                          <p className="text-xs text-[#929AA5]">
                            {formatDateTime(item.occurredAt)} · sentimento {newsSentimentLabel(item.sentiment)} · impacto {newsImpactLabel(item.impact)}
                            {item.source ? ` · ${item.source}` : ''}
                          </p>
                        </li>
                      ))}
                    </EvidenceBox>
                  )}

                  {movement.evidence.adminActions.length > 0 && (
                    <EvidenceBox title="Ações administrativas">
                      {movement.evidence.adminActions.map((item) => (
                        <li key={item.id} className="space-y-1">
                          <a
                            href={item.href}
                            className="inline-flex items-center gap-1 text-sm text-[#EAECEF] hover:text-[#F0B90B]"
                          >
                            <span>{adminActionShortLabel(item.action)}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                          <p className="text-xs text-[#929AA5]">
                            {formatDateTime(item.occurredAt)}
                            {item.previousPrice !== null && item.newPrice !== null
                              ? ` · ${formatCurrency(item.previousPrice)} para ${formatCurrency(item.newPrice)}`
                              : ''}
                          </p>
                          {item.reason && <p className="text-xs text-[#c5b99a]">{item.reason}</p>}
                        </li>
                      ))}
                    </EvidenceBox>
                  )}
                </div>
              )}

              {(movement.directEvidence.length > 0 || movement.correlatedEvidence.length > 0) && (
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {movement.directEvidence.length > 0 && (
                    <EvidenceBox title="Evidência direta">
                      {movement.directEvidence.map((item) => (
                        <li key={item.eventId} className="space-y-1">
                          <p className="text-sm text-[#EAECEF]">{causalEventTypeLabel(item.type)} · {humanizeLayer(item.label)}</p>
                          <p className="text-xs text-[#929AA5]">{humanizeLayer(item.source)} · {formatDateTime(item.occurredAt)}</p>
                        </li>
                      ))}
                    </EvidenceBox>
                  )}
                  {movement.correlatedEvidence.length > 0 && (
                    <EvidenceBox title="Correlação temporal">
                      {movement.correlatedEvidence.map((item) => (
                        <li key={`${item.type}-${item.eventId ?? item.label}`} className="space-y-1">
                          <p className="text-sm text-[#EAECEF]">
                            {causalEventTypeLabel(item.type)} · {item.type === 'ADMIN_ACTION' ? adminActionShortLabel(item.label) : item.label}
                          </p>
                          <p className="text-xs text-[#929AA5]">
                            confiança máxima {item.confidenceScore}%{item.occurredAt ? ` · ${formatDateTime(item.occurredAt)}` : ''}
                          </p>
                        </li>
                      ))}
                    </EvidenceBox>
                  )}
                </div>
              )}
            </div>
          )}
        </article>
        )
      })}

      {remainingCount > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setVisibleCount((count) => count + MOVEMENTS_PAGE_SIZE)}
            data-testid="value-analysis-load-more-movements"
          >
            Carregar mais {Math.min(MOVEMENTS_PAGE_SIZE, remainingCount)} movimentos
          </Button>
        </div>
      )}
    </section>
  )
}

function EvidenceFilter({
  value,
  onChange,
  movements,
}: {
  value: 'ALL' | EvidenceGrade
  onChange: (value: 'ALL' | EvidenceGrade) => void
  movements: Movement[]
}) {
  const counts = movements.reduce<Record<EvidenceGrade, number>>((acc, movement) => {
    acc[movement.evidenceGrade] += 1
    return acc
  }, { DIRECT: 0, CORRELATED: 0, DEGRADED: 0 })

  return (
    <div className="flex flex-wrap gap-2" data-testid="value-analysis-evidence-filters">
      {EVIDENCE_FILTERS.map((item) => {
        const count = item.value === 'ALL' ? movements.length : counts[item.value]
        const selected = value === item.value
        return (
          <Button
            key={item.value}
            type="button"
            variant={selected ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => onChange(item.value)}
            data-testid={`value-analysis-filter-${item.value}`}
          >
            {item.label} ({count})
          </Button>
        )
      })}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-2">
      <p className="text-[10px] font-semibold uppercase text-[#929AA5]">{label}</p>
      <p className="mt-1 truncate font-mono text-xs text-[#EAECEF]">{value}</p>
    </div>
  )
}

function EvidenceBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
      <h3 className="text-[11px] font-semibold uppercase text-[#929AA5]">{title}</h3>
      <ul className="mt-3 space-y-3">{children}</ul>
    </div>
  )
}

function MethodologyPanel({ report }: { report: ValueAnalysisReport }) {
  // Janelas reais vindas do payload (toda movement carrega as mesmas constantes
  // da rota); fallback apenas quando o relatorio nao tem movimentos.
  const windows = report.movements[0]?.evidenceWindow
  const newsLookbackMinutes = windows?.newsLookbackMinutes ?? 120
  const newsGraceMinutes = windows?.newsGraceMinutes ?? 2
  const adminLookbackMinutes = windows?.adminLookbackMinutes ?? 10
  const adminGraceMinutes = windows?.adminGraceMinutes ?? 2
  return (
    <section className="rounded-xl border border-[rgba(240,185,11,.1)] bg-[#1E2329] p-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-[#F0B90B]" />
        <h2 className="text-sm font-semibold text-[#EAECEF]">Critério de leitura</h2>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
        <MethodCard
          title="1. Direta"
          text="Só recebe grade direta quando há rastro gravado em price_history.attribution pelo motor antes da persistência do candle."
        />
        <MethodCard
          title="2. Correlacionada"
          text="Notícias, ações administrativas e ordens próximas entram como correlação temporal quando não há rastro causal direto."
        />
        <MethodCard
          title="3. Degradada"
          text="Histórico GBM, legado, coluna ausente ou parser inválido são marcados como degradados com flags de qualidade."
        />
        <MethodCard
          title="4. Confiança"
          text="Movimentos correlacionados e degradados nunca usam confiança alta nem linguagem de causa confirmada."
        />
        <MethodCard
          title="5. Parâmetros do motor"
          text={`A leitura considera a configuração efetiva do cluster ${report.motorContext.cluster}: sigma, theta, OFI, velocity cap e circuit breaker da aba Motor.`}
        />
      </div>

      <div className="mt-4 rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3 text-xs leading-5 text-[#929AA5]">
        Recorte atual: {report.period.requestedDays} dia(s), limite de {report.period.maxPricePoints} pontos de preço. Notícias entram na correlação se publicadas até {newsLookbackMinutes} minutos antes da variação (absorção gradual) e no máximo {newsGraceMinutes} minutos depois; ações administrativas só são correlacionadas se registradas até {adminLookbackMinutes} minutos antes ou {adminGraceMinutes} minutos depois do candle. A tela deve ser lida como análise operacional de evidências internas, não como laudo financeiro definitivo.
      </div>
    </section>
  )
}

function MethodCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-[rgba(240,185,11,.08)] bg-[#0B0E11] p-3">
      <h3 className="text-xs font-semibold text-[#EAECEF]">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-[#929AA5]">{text}</p>
    </div>
  )
}
