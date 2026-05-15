// ============================================================================
// Foot Stock Motor — Cron Proxy (HTTP orchestrator pattern, Option C)
// Em vez de duplicar logica de footstock-next/src/lib/{services,jobs,prisma},
// o motor (leader-elected) dispara HTTP autenticado para a route do next.
// Idempotencia, retries e regras de negocio ficam na unica fonte da verdade.
// Decisao: pending-actions/foot-stock.md > FS-SCHED-W1-2026-05-15 (Opcao C).
// ============================================================================

import { logger } from '../utils/logger'

const DEFAULT_TIMEOUT_MS = 60_000

interface CronProxyOptions {
  apiVersion?: 'v0' | 'v1'
  timeoutMs?: number
}

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `[cron-proxy] Variavel obrigatoria ausente: ${key}. Defina no .env do motor (Railway service motor).`
    )
  }
  return value
}

function buildUrl(jobName: string, apiVersion: 'v0' | 'v1'): string {
  const base = getRequiredEnv('FOOTSTOCK_NEXT_BASE_URL').replace(/\/$/, '')
  const prefix = apiVersion === 'v1' ? '/api/v1/cron' : '/api/cron'
  return `${base}${prefix}/${jobName}`
}

export async function cronProxy(
  jobName: string,
  options: CronProxyOptions = {}
): Promise<void> {
  const { apiVersion = 'v0', timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const cronSecret = getRequiredEnv('CRON_SECRET')
  const url = buildUrl(jobName, apiVersion)
  const startedAt = Date.now()

  logger.info(`[cron/${jobName}] Iniciando job (proxy ${apiVersion} -> ${url})`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: controller.signal,
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '<no-body>')
      logger.error(
        `[cron/${jobName}] HTTP ${response.status} apos ${durationMs}ms — body: ${bodyText.slice(0, 500)}`
      )
      throw new Error(
        `[cron-proxy] ${jobName} falhou: HTTP ${response.status} (${durationMs}ms)`
      )
    }

    const payloadText = await response.text().catch(() => '')
    const payloadSummary =
      payloadText.length > 0 ? payloadText.slice(0, 200) : '<empty>'

    logger.info(
      `[cron/${jobName}] Job concluido em ${durationMs}ms (HTTP ${response.status}) — payload: ${payloadSummary}`
    )
  } catch (err) {
    const durationMs = Date.now() - startedAt
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error(
        `[cron/${jobName}] Timeout apos ${durationMs}ms (limite ${timeoutMs}ms)`
      )
      throw new Error(`[cron-proxy] ${jobName} timeout em ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
