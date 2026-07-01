'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MOTOR_LAYERS_DEFAULTS } from '@/lib/constants/motor-layers'
import type {
  MotorLayersConfig,
  ClusterKey,
  SessionKey,
  OUClusterParams,
  OFIClusterParams,
  SessionParams,
} from '@/lib/types/admin'

const FULL_DEFAULTS: MotorLayersConfig = {
  ...MOTOR_LAYERS_DEFAULTS,
  updatedAt: null,
  updatedBy: null,
}

const CLUSTERS: ClusterKey[] = ['A_TOP', 'A_MID', 'A_SMALL', 'B_LIQUID', 'B_ILLIQ']
const SESSIONS: SessionKey[] = ['PRE_OPENING', 'TRADING', 'CLOSING_CALL', 'AFTER_MARKET', 'CLOSED']

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchLayers(): Promise<MotorLayersConfig> {
  const res = await fetch('/api/v1/admin/motor/layers', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch layers')
  const { data } = await res.json()
  return data as MotorLayersConfig
}

async function saveLayers(config: MotorLayersConfig): Promise<MotorLayersConfig> {
  const res = await fetch('/api/v1/admin/motor/layers', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json?.error?.message ?? 'Erro ao salvar camadas')
  }
  const { data } = await res.json()
  return data as MotorLayersConfig
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  defaultValue?: number
  warn?: boolean
  warnText?: string
}

function SliderField({ label, value, min, max, step, format, onChange, defaultValue, warn, warnText }: SliderFieldProps) {
  const isChanged = defaultValue !== undefined && Math.abs(value - defaultValue) > step * 0.4
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#929AA5]">
          {label}
          {isChanged && (
            <span
              title="Alterado do padrão"
              className="w-1.5 h-1.5 rounded-full bg-[#F0B90B] inline-block"
            />
          )}
        </span>
        <span className={cn('text-[12px] font-mono font-bold', warn ? 'text-[#F6465D]' : 'text-[#F0B90B]')}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#F0B90B] h-1"
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-[#3A3F4A]">{format(min)}</span>
        <span className="text-[9px] text-[#3A3F4A]">{format(max)}</span>
      </div>
      {warn && warnText && (
        <p className="text-[10px] text-[#F6465D] mt-1">{warnText}</p>
      )}
    </div>
  )
}

interface LayerCardProps {
  badge: string
  name: string
  description: string
  color: string
  expanded: boolean
  onToggle: () => void
  onReset: () => void
  enabled: boolean
  onToggleEnabled: () => void
  summary: string
  children: React.ReactNode
  testid: string
}

function LayerCard({ badge, name, description, color, expanded, onToggle, onReset, enabled, onToggleEnabled, summary, children, testid }: LayerCardProps) {
  return (
    <div
      data-testid={testid}
      className="rounded-xl border transition-all"
      style={{
        background: expanded ? '#1E2329' : '#181A20',
        borderColor: expanded ? `${color}55` : 'rgba(240,185,11,.08)',
      }}
    >
      <div
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        role="button"
        tabIndex={0}
        data-testid={`${testid}-toggle`}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono shrink-0"
          style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
        >
          {badge}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-[#EAECEF] leading-tight">{name}</div>
          {!expanded && (
            <div className="text-[10px] text-[#929AA5] font-mono truncate mt-0.5">{summary}</div>
          )}
          {expanded && (
            <div className="text-[10px] text-[#929AA5] mt-0.5">{description}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Indicador "desligada" visível mesmo com o card recolhido (Zero Silêncio). */}
          {!enabled && (
            <span
              data-testid={`${testid}-off-badge`}
              className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[rgba(246,70,93,.15)] text-[#F6465D] border border-[rgba(246,70,93,.3)]"
            >
              off
            </span>
          )}
          {expanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReset() }}
              className="text-[9px] px-2 py-0.5 rounded border border-[rgba(240,185,11,.15)] text-[#929AA5] hover:text-[#F0B90B] transition-colors"
              title="Resetar para padrão"
            >
              ↺ reset
            </button>
          )}
          {/* Toggle liga/desliga a camada do motor (ao lado do reset). */}
          {expanded && (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={enabled ? `Desligar camada ${name}` : `Ligar camada ${name}`}
              data-testid={`${testid}-enabled-toggle`}
              onClick={(e) => { e.stopPropagation(); onToggleEnabled() }}
              className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0"
              style={{ background: enabled ? '#2EBD85' : '#5E6673' }}
              title={enabled ? 'Camada ativa — clique para desligar' : 'Camada desligada — clique para ligar'}
            >
              <span
                className="inline-block h-3 w-3 rounded-full bg-white transition-transform"
                style={{ transform: enabled ? 'translateX(14px)' : 'translateX(2px)' }}
              />
            </button>
          )}
          <span className="text-[#52585F] text-[10px]">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div
          className="px-4 pb-4 pt-2 border-t"
          style={{ borderColor: `${color}22` }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface ClusterTabsProps {
  active: ClusterKey
  onSelect: (c: ClusterKey) => void
}

interface ClusterTabsPropsExtended extends ClusterTabsProps {
  prefix?: string
}

function ClusterTabs({ active, onSelect, prefix = 'admin-motor' }: ClusterTabsPropsExtended) {
  const labels: Record<ClusterKey, string> = {
    A_TOP: 'A-Top', A_MID: 'A-Mid', A_SMALL: 'A-Sm', B_LIQUID: 'B-Liq', B_ILLIQ: 'B-Ill',
  }
  return (
    <div className="flex gap-1 mb-3">
      {CLUSTERS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          data-testid={`${prefix}-cluster-tab-${c.toLowerCase()}`}
          aria-pressed={active === c}
          className={cn(
            'flex-1 py-1 rounded text-[9px] font-bold transition-all',
            active === c
              ? 'bg-[#F0B90B] text-[#080B12]'
              : 'bg-[#0B0E11] text-[#929AA5] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.3)]'
          )}
        >
          {labels[c]}
        </button>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type LayerId =
  | 'ou' | 'fundamentalReversion' | 'garch' | 'ofi' | 'kylesLambda'
  | 'supplyScaling' | 'pressureQueue' | 'velocityCap' | 'circuitBreaker' | 'sessionManagement'

export function MotorCamadas() {
  const queryClient = useQueryClient()
  const [config, setConfig] = useState<MotorLayersConfig>(FULL_DEFAULTS)
  const [expanded, setExpanded] = useState<Partial<Record<LayerId, boolean>>>({})
  const [ouCluster, setOuCluster] = useState<ClusterKey>('A_TOP')
  const [ofiCluster, setOfiCluster] = useState<ClusterKey>('A_TOP')
  const [isSaved, setIsSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  // Prevents overwriting local edits when serverConfig changes after save
  const initializedRef = useRef(false)

  const { data: serverConfig, isLoading } = useQuery({
    queryKey: ['motor-layers'],
    queryFn: fetchLayers,
    staleTime: 60_000,
  })

  // Only initialize from server once — avoids race condition on save response
  useEffect(() => {
    if (serverConfig && !initializedRef.current) {
      setConfig(serverConfig)
      setHasUnsavedChanges(false)
      initializedRef.current = true
    }
  }, [serverConfig])

  // Clear save error whenever the user modifies any field
  useEffect(() => { setSaveError(null) }, [config])

  const saveMutation = useMutation({
    mutationFn: saveLayers,
    onSuccess: (data) => {
      // Update only metadata fields — preserve any local edits made during the request
      setConfig((prev) => ({ ...prev, updatedAt: data.updatedAt, updatedBy: data.updatedBy }))
      queryClient.setQueryData(['motor-layers'], data)
      setHasUnsavedChanges(false)
      setIsSaved(true)
      setSaveError(null)
      setTimeout(() => setIsSaved(false), 2500)
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar')
    },
  })

  const toggle = useCallback((id: LayerId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const resetLayer = useCallback((id: LayerId) => {
    setHasUnsavedChanges(true)
    setConfig((prev) => ({
      ...prev,
      [id]: (MOTOR_LAYERS_DEFAULTS as Record<string, unknown>)[id],
    }))
  }, [])

  // Toggle liga/desliga por camada. O circuit breaker usa seu próprio `circuitBreaker.enabled`
  // (mesmo campo do toggle do KPI); as demais camadas usam `layerToggles[id]`.
  const layerEnabled = (id: LayerId): boolean =>
    id === 'circuitBreaker' ? config.circuitBreaker.enabled : config.layerToggles[id]

  const setLayerEnabled = useCallback((id: LayerId) => {
    setHasUnsavedChanges(true)
    setConfig((prev) => {
      if (id === 'circuitBreaker') {
        return { ...prev, circuitBreaker: { ...prev.circuitBreaker, enabled: !prev.circuitBreaker.enabled } }
      }
      return { ...prev, layerToggles: { ...prev.layerToggles, [id]: !prev.layerToggles[id] } }
    })
  }, [])

  // Typed updaters
  const setGlobal = <K extends keyof Omit<MotorLayersConfig, 'ou' | 'ofi' | 'sessionManagement' | 'updatedAt' | 'updatedBy'>>(
    layer: K,
    key: string,
    value: number
  ) => {
    setHasUnsavedChanges(true)
    setConfig((prev) => ({
      ...prev,
      [layer]: { ...(prev[layer] as Record<string, unknown>), [key]: value },
    }))
  }

  const setOUParam = (cluster: ClusterKey, key: keyof OUClusterParams, value: number) => {
    setHasUnsavedChanges(true)
    setConfig((prev) => ({
      ...prev,
      ou: {
        clusters: {
          ...prev.ou.clusters,
          [cluster]: { ...prev.ou.clusters[cluster], [key]: value },
        },
      },
    }))
  }

  const setOFIParam = (cluster: ClusterKey, key: keyof OFIClusterParams, value: number) => {
    setHasUnsavedChanges(true)
    setConfig((prev) => ({
      ...prev,
      ofi: {
        clusters: {
          ...prev.ofi.clusters,
          [cluster]: { ...prev.ofi.clusters[cluster], [key]: value },
        },
      },
    }))
  }

  const setSessionParam = (session: SessionKey, key: keyof SessionParams, value: number) => {
    setHasUnsavedChanges(true)
    setConfig((prev) => ({
      ...prev,
      sessionManagement: {
        sessions: {
          ...prev.sessionManagement.sessions,
          [session]: { ...prev.sessionManagement.sessions[session], [key]: value },
        },
      },
    }))
  }

  const garchSum = config.garch.alpha + config.garch.beta
  const garchWarn    = garchSum >= 0.99  // preventive warning zone
  const garchInvalid = garchSum >= 1.0   // server will reject — block save

  const sessionLabels: Record<SessionKey, string> = {
    PRE_OPENING: 'Pré-abertura',
    TRADING: 'Negociação',
    CLOSING_CALL: 'Call',
    AFTER_MARKET: 'After-market',
    CLOSED: 'Fechado',
  }

  const sessionColors: Record<SessionKey, string> = {
    PRE_OPENING: '#F97316',
    TRADING: '#EAB308',
    CLOSING_CALL: '#06B6D4',
    AFTER_MARKET: '#7C3AED',
    CLOSED: '#EF4444',
  }

  if (isLoading) {
    return (
      <div data-testid="admin-motor-camadas-loading" className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div data-testid="admin-motor-camadas" className="space-y-3">
      {/* Header */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#EAECEF]">Camadas do Motor</h2>
            <p className="text-[11px] text-[#929AA5] mt-0.5">
              10 camadas configuráveis (tuning). Alterações aplicam-se ao próximo ciclo de negociação.
            </p>
            <p data-testid="admin-motor-camadas-tuning-note" className="text-[10px] text-[#929AA5] mt-1">
              Ajustar ou desligar uma camada apenas afina o comportamento do motor. Não pausa o motor nem
              bloqueia ordens: para isso use o botão Pausar no topo da página.
            </p>
            {config.updatedAt && (
              <p className="text-[10px] text-[#52585F] mt-1">
                Última atualização: {new Date(config.updatedAt).toLocaleString('pt-BR')}
              </p>
            )}
            {hasUnsavedChanges && (
              <p
                data-testid="admin-motor-camadas-unsaved-state"
                className="text-[10px] text-[#F0B90B] mt-1"
              >
                Alterações não salvas
              </p>
            )}
          </div>
          <Button
            data-testid="admin-motor-camadas-save-button"
            variant="primary"
            size="sm"
            onClick={() => saveMutation.mutate(config)}
            disabled={saveMutation.isPending || isSaved || garchInvalid}
            isLoading={saveMutation.isPending}
            className="shrink-0 text-[11px]"
            title={garchInvalid ? 'GARCH inválido: α + β ≥ 1.0' : hasUnsavedChanges ? 'Salvar alterações pendentes' : undefined}
          >
            {isSaved ? '✓ Salvo!' : hasUnsavedChanges ? '💾 Salvar alterações' : '💾 Salvar Camadas'}
          </Button>
        </div>
        {saveError && (
          <p className="text-[11px] text-[#F6465D] mt-2">{saveError}</p>
        )}
      </div>

      {/* L1: Ornstein-Uhlenbeck */}
      <LayerCard
        badge="L1"
        name="Ornstein-Uhlenbeck"
        description="Processo de reversão à média que gera o ruído de preço por cluster de ativo"
        color="#4E9AF1"
        expanded={!!expanded.ou}
        onToggle={() => toggle('ou')}
        onReset={() => resetLayer('ou')}
        enabled={layerEnabled('ou')}
        onToggleEnabled={() => setLayerEnabled('ou')}
        summary={`σ=${config.ou.clusters[ouCluster].sigma.toFixed(4)} θ=${config.ou.clusters[ouCluster].theta.toFixed(2)} spread=${config.ou.clusters[ouCluster].spread_base.toFixed(3)}`}
        testid="admin-motor-layer-ou"
      >
        <ClusterTabs active={ouCluster} onSelect={setOuCluster} prefix="admin-motor-layer-ou" />
        <div className="space-y-3">
          <SliderField
            label="Sigma (volatilidade)"
            value={config.ou.clusters[ouCluster].sigma}
            min={0.0001} max={0.02} step={0.0001}
            format={(v) => v.toFixed(4)}
            onChange={(v) => setOUParam(ouCluster, 'sigma', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.ou.clusters[ouCluster].sigma}
          />
          <SliderField
            label="Theta (velocidade de reversão)"
            value={config.ou.clusters[ouCluster].theta}
            min={0.01} max={1.0} step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setOUParam(ouCluster, 'theta', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.ou.clusters[ouCluster].theta}
          />
          <SliderField
            label="Spread Base (bid-ask)"
            value={config.ou.clusters[ouCluster].spread_base}
            min={0.0001} max={0.05} step={0.0001}
            format={(v) => `${(v * 100).toFixed(2)}%`}
            onChange={(v) => setOUParam(ouCluster, 'spread_base', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.ou.clusters[ouCluster].spread_base}
          />
        </div>
      </LayerCard>

      {/* L2: Fundamental Reversion */}
      <LayerCard
        badge="L2"
        name="Fundamental Reversion"
        description="Força de atração do preço em direção ao valor fundamental do ativo"
        color="#2EBD85"
        expanded={!!expanded.fundamentalReversion}
        onToggle={() => toggle('fundamentalReversion')}
        onReset={() => resetLayer('fundamentalReversion')}
        enabled={layerEnabled('fundamentalReversion')}
        onToggleEnabled={() => setLayerEnabled('fundamentalReversion')}
        summary={`reversion_rate=${config.fundamentalReversion.reversion_rate.toFixed(4)}`}
        testid="admin-motor-layer-fundamental"
      >
        <SliderField
          label="Reversion Rate"
          value={config.fundamentalReversion.reversion_rate}
          min={0.0001} max={0.05} step={0.0001}
          format={(v) => v.toFixed(4)}
          onChange={(v) => setGlobal('fundamentalReversion', 'reversion_rate', v)}
          defaultValue={MOTOR_LAYERS_DEFAULTS.fundamentalReversion.reversion_rate}
        />
      </LayerCard>

      {/* L3: GARCH Lite */}
      <LayerCard
        badge="L3"
        name="GARCH Lite"
        description="Volatilidade condicional com heteroscedasticidade. Alpha + Beta deve ser < 1 para estacionariedade"
        color="#F0B90B"
        expanded={!!expanded.garch}
        onToggle={() => toggle('garch')}
        onReset={() => resetLayer('garch')}
        enabled={layerEnabled('garch')}
        onToggleEnabled={() => setLayerEnabled('garch')}
        summary={`ω=${config.garch.omega.toFixed(6)} α=${config.garch.alpha.toFixed(2)} β=${config.garch.beta.toFixed(2)} cap=${config.garch.vol_cap.toFixed(1)}×`}
        testid="admin-motor-layer-garch"
      >
        <div className="space-y-3">
          {garchWarn && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${garchInvalid ? 'bg-[rgba(246,70,93,.15)] border-[rgba(246,70,93,.4)]' : 'bg-[rgba(246,70,93,.1)] border-[rgba(246,70,93,.2)]'}`}>
              <span className="text-[#F6465D] text-sm">{garchInvalid ? '🚫' : '⚠'}</span>
              <p className="text-[10px] text-[#F6465D]">
                {garchInvalid
                  ? `α + β = ${garchSum.toFixed(3)} ≥ 1.0 — inválido. Salvar bloqueado até reduzir α ou β.`
                  : `α + β = ${garchSum.toFixed(3)} ≥ 0.99 — próximo do limite de estacionariedade. Reduza α ou β antes de salvar.`
                }
              </p>
            </div>
          )}
          <SliderField
            label="Omega (variância base)"
            value={config.garch.omega}
            min={0.0000001} max={0.0001} step={0.0000001}
            format={(v) => v.toExponential(1)}
            onChange={(v) => setGlobal('garch', 'omega', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.garch.omega}
          />
          <SliderField
            label="Alpha (peso do choque²)"
            value={config.garch.alpha}
            min={0.01} max={0.50} step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setGlobal('garch', 'alpha', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.garch.alpha}
            warn={garchWarn}
          />
          <SliderField
            label="Beta (peso da variância anterior)"
            value={config.garch.beta}
            min={0.01} max={0.99} step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setGlobal('garch', 'beta', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.garch.beta}
            warn={garchWarn}
          />
          <SliderField
            label="Vol Cap (multiplicador máximo)"
            value={config.garch.vol_cap}
            min={1.0} max={5.0} step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={(v) => setGlobal('garch', 'vol_cap', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.garch.vol_cap}
          />
        </div>
      </LayerCard>

      {/* L4: OFI */}
      <LayerCard
        badge="L4"
        name="Order Flow Imbalance"
        description="Desequilíbrio do fluxo de ordens com decaimento exponencial. Rho mais alto = memória mais longa"
        color="#9C6CF7"
        expanded={!!expanded.ofi}
        onToggle={() => toggle('ofi')}
        onReset={() => resetLayer('ofi')}
        enabled={layerEnabled('ofi')}
        onToggleEnabled={() => setLayerEnabled('ofi')}
        summary={`ρ(${ofiCluster})=${config.ofi.clusters[ofiCluster].rho.toFixed(3)}`}
        testid="admin-motor-layer-ofi"
      >
        <ClusterTabs active={ofiCluster} onSelect={setOfiCluster} prefix="admin-motor-layer-ofi" />
        <SliderField
          label="Rho (fator de decaimento OFI)"
          value={config.ofi.clusters[ofiCluster].rho}
          min={0.5} max={0.9999} step={0.001}
          format={(v) => v.toFixed(4)}
          onChange={(v) => setOFIParam(ofiCluster, 'rho', v)}
          defaultValue={MOTOR_LAYERS_DEFAULTS.ofi.clusters[ofiCluster].rho}
        />
      </LayerCard>

      {/* L5: Kyle's Lambda */}
      <LayerCard
        badge="L5"
        name="Kyle's Lambda"
        description="Impacto de mercado de Amihud-Kyle: escala o coeficiente de impacto λ derivado do cluster"
        color="#F77B4E"
        expanded={!!expanded.kylesLambda}
        onToggle={() => toggle('kylesLambda')}
        onReset={() => resetLayer('kylesLambda')}
        enabled={layerEnabled('kylesLambda')}
        onToggleEnabled={() => setLayerEnabled('kylesLambda')}
        summary={`scale=${config.kylesLambda.lambda_scale.toFixed(2)}×`}
        testid="admin-motor-layer-kyles-lambda"
      >
        <SliderField
          label="Lambda Scale (fator de escala)"
          value={config.kylesLambda.lambda_scale}
          min={0.1} max={5.0} step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => setGlobal('kylesLambda', 'lambda_scale', v)}
          defaultValue={MOTOR_LAYERS_DEFAULTS.kylesLambda.lambda_scale}
        />
      </LayerCard>

      {/* L6: Supply Scaling */}
      <LayerCard
        badge="L6"
        name="Supply Scaling"
        description="Amplificação de movimentos de preço por desequilíbrio de oferta/demanda no book"
        color="#4EF1B0"
        expanded={!!expanded.supplyScaling}
        onToggle={() => toggle('supplyScaling')}
        onReset={() => resetLayer('supplyScaling')}
        enabled={layerEnabled('supplyScaling')}
        onToggleEnabled={() => setLayerEnabled('supplyScaling')}
        summary={`amp_cap=${config.supplyScaling.amp_cap.toFixed(1)}×`}
        testid="admin-motor-layer-supply-scaling"
      >
        <SliderField
          label="Amplification Cap (máximo de amplificação)"
          value={config.supplyScaling.amp_cap}
          min={1.0} max={5.0} step={0.1}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(v) => setGlobal('supplyScaling', 'amp_cap', v)}
          defaultValue={MOTOR_LAYERS_DEFAULTS.supplyScaling.amp_cap}
        />
      </LayerCard>

      {/* L7: Pressure Queue */}
      <LayerCard
        badge="L7"
        name="Pressure Queue"
        description="Fila de pressão cumulativa: alarga spread, captura spot sob pressão e controla o nudge L7.5 de baixa atividade (±FS$0,01)"
        color="#F1C04E"
        expanded={!!expanded.pressureQueue}
        onToggle={() => toggle('pressureQueue')}
        onReset={() => resetLayer('pressureQueue')}
        enabled={layerEnabled('pressureQueue')}
        onToggleEnabled={() => setLayerEnabled('pressureQueue')}
        summary={`spread=${config.pressureQueue.pressure_spread_ticks}t absorb=${config.pressureQueue.absorption_ticks}t cap=±${(config.pressureQueue.spot_cap * 100).toFixed(1)}%`}
        testid="admin-motor-layer-pressure-queue"
      >
        <div className="space-y-3">
          <SliderField
            label="Pressure Spread Ticks (ticks antes do spread alargar)"
            value={config.pressureQueue.pressure_spread_ticks}
            min={1} max={100} step={1}
            format={(v) => `${v}t`}
            onChange={(v) => setGlobal('pressureQueue', 'pressure_spread_ticks', Math.round(v))}
            defaultValue={MOTOR_LAYERS_DEFAULTS.pressureQueue.pressure_spread_ticks}
          />
          <SliderField
            label="Absorption Ticks (ticks para absorver pressão)"
            value={config.pressureQueue.absorption_ticks}
            min={5} max={200} step={5}
            format={(v) => `${v}t`}
            onChange={(v) => setGlobal('pressureQueue', 'absorption_ticks', Math.round(v))}
            defaultValue={MOTOR_LAYERS_DEFAULTS.pressureQueue.absorption_ticks}
          />
          <SliderField
            label="Spot Cap (movimento máximo de spot)"
            value={config.pressureQueue.spot_cap}
            min={0.001} max={0.10} step={0.001}
            format={(v) => `±${(v * 100).toFixed(1)}%`}
            onChange={(v) => setGlobal('pressureQueue', 'spot_cap', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.pressureQueue.spot_cap}
          />
        </div>
      </LayerCard>

      {/* L8: Velocity Cap */}
      <LayerCard
        badge="L8"
        name="Velocity Cap"
        description="Limite máximo de variação de preço por tick, evitando movimentos abruptos"
        color="#E84EF1"
        expanded={!!expanded.velocityCap}
        onToggle={() => toggle('velocityCap')}
        onReset={() => resetLayer('velocityCap')}
        enabled={layerEnabled('velocityCap')}
        onToggleEnabled={() => setLayerEnabled('velocityCap')}
        summary={`max/tick=±${(config.velocityCap.max_per_tick * 100).toFixed(3)}%`}
        testid="admin-motor-layer-velocity-cap"
      >
        <SliderField
          label="Max Per Tick (variação máxima por tick)"
          value={config.velocityCap.max_per_tick}
          min={0.0001} max={0.05} step={0.0001}
          format={(v) => `±${(v * 100).toFixed(3)}%`}
          onChange={(v) => setGlobal('velocityCap', 'max_per_tick', v)}
          defaultValue={MOTOR_LAYERS_DEFAULTS.velocityCap.max_per_tick}
        />
      </LayerCard>

      {/* L9: Circuit Breaker */}
      <LayerCard
        badge="L9"
        name="Circuit Breaker"
        description="Halt automático quando variação acumulada excede threshold. Cobre proteção de mercado"
        color="#F6465D"
        expanded={!!expanded.circuitBreaker}
        onToggle={() => toggle('circuitBreaker')}
        onReset={() => resetLayer('circuitBreaker')}
        enabled={layerEnabled('circuitBreaker')}
        onToggleEnabled={() => setLayerEnabled('circuitBreaker')}
        summary={`trigger=±${(config.circuitBreaker.halt_trigger * 100).toFixed(0)}% dur=${config.circuitBreaker.halt_duration_s}s`}
        testid="admin-motor-layer-circuit-breaker"
      >
        <div className="space-y-3">
          <SliderField
            label="Halt Trigger (variação que aciona circuit breaker)"
            value={config.circuitBreaker.halt_trigger}
            min={0.01} max={0.50} step={0.01}
            format={(v) => `±${(v * 100).toFixed(0)}%`}
            onChange={(v) => setGlobal('circuitBreaker', 'halt_trigger', v)}
            defaultValue={MOTOR_LAYERS_DEFAULTS.circuitBreaker.halt_trigger}
          />
          <SliderField
            label="Halt Duration (duração do halt em segundos)"
            value={config.circuitBreaker.halt_duration_s}
            min={10} max={3600} step={10}
            format={(v) => `${v}s`}
            onChange={(v) => setGlobal('circuitBreaker', 'halt_duration_s', Math.round(v))}
            defaultValue={MOTOR_LAYERS_DEFAULTS.circuitBreaker.halt_duration_s}
          />
        </div>
      </LayerCard>

      {/* L10: Session Management */}
      <LayerCard
        badge="L10"
        name="Session Management"
        description="Multiplicadores de volatilidade por sessão de mercado canônica do motor"
        color="#929AA5"
        expanded={!!expanded.sessionManagement}
        onToggle={() => toggle('sessionManagement')}
        onReset={() => resetLayer('sessionManagement')}
        enabled={layerEnabled('sessionManagement')}
        onToggleEnabled={() => setLayerEnabled('sessionManagement')}
        summary={SESSIONS.map((s) => `${s.slice(0,2)}:${config.sessionManagement.sessions[s].vol_multiplier.toFixed(1)}×`).join(' ')}
        testid="admin-motor-layer-session"
      >
        <div className="space-y-3">
          {SESSIONS.map((session) => (
            <div key={session} className="flex items-center gap-3">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: sessionColors[session] }}
              />
              <div className="flex-1">
                <SliderField
                  label={sessionLabels[session]}
                  value={config.sessionManagement.sessions[session].vol_multiplier}
                  min={0} max={5.0} step={0.05}
                  format={(v) => `${v.toFixed(2)}×`}
                  onChange={(v) => setSessionParam(session, 'vol_multiplier', v)}
                  defaultValue={MOTOR_LAYERS_DEFAULTS.sessionManagement.sessions[session].vol_multiplier}
                />
              </div>
            </div>
          ))}
        </div>
      </LayerCard>

      {/* Save footer */}
      <div className="flex items-center gap-3">
        <Button
          data-testid="admin-motor-camadas-save-footer-button"
          variant="primary"
          size="md"
          fullWidth
          onClick={() => saveMutation.mutate(config)}
          disabled={saveMutation.isPending || isSaved || garchInvalid}
          isLoading={saveMutation.isPending}
          title={garchInvalid ? 'GARCH inválido: α + β ≥ 1.0' : hasUnsavedChanges ? 'Salvar alterações pendentes' : undefined}
        >
          {isSaved ? '✓ Camadas Salvas!' : hasUnsavedChanges ? '💾 Salvar alterações' : '💾 Salvar Todas as Camadas'}
        </Button>
        <Button
          data-testid="admin-motor-camadas-reset-all-button"
          variant="secondary"
          size="md"
          onClick={() => { setHasUnsavedChanges(true); setConfig(FULL_DEFAULTS) }}
          disabled={saveMutation.isPending}
          className="shrink-0"
        >
          ↺ Padrões
        </Button>
      </div>
    </div>
  )
}
