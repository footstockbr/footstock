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
  /**
   * Quando true (default), um corpo JSON com `errors > 0` é tratado como falha do job
   * (lança erro) mesmo com HTTP 2xx. Sem isto, um cron que liquidou posições mas falhou em
   * algumas ficaria "verde" no scheduler, mascarando inconsistências financeiras.
   * Jobs cujo contrato aceita falha parcial silenciosa podem passar false explicitamente.
   */
  failOnBodyErrors?: boolean
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
  const { apiVersion = 'v0', timeoutMs = DEFAULT_TIMEOUT_MS, failOnBodyErrors = true } = options
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

    // Falha parcial reportada no corpo: HTTP 2xx não basta. Se a route devolveu um contador
    // de falha no TOPO do JSON (`errors` ou `failed`) com N > 0, o job processou com
    // inconsistências e o scheduler NÃO deve marcar sucesso (senão um cancelamento que falhou
    // em fechar posição passa despercebido).
    // LIMITAÇÃO CONHECIDA: contadores ANINHADOS (ex.: dunning devolve { dunning: { errors } })
    // NÃO são detectados aqui. Rotas devem expor um contador de falha no topo da resposta para
    // serem cobertas; caso contrário continuam "verdes" mesmo com falha parcial.
    if (failOnBodyErrors && payloadText.length > 0) {
      let bodyErrors: number | undefined
      try {
        const parsed = JSON.parse(payloadText) as { errors?: unknown; failed?: unknown }
        const counter = typeof parsed.errors === 'number' ? parsed.errors
          : typeof parsed.failed === 'number' ? parsed.failed
          : undefined
        bodyErrors = counter
      } catch {
        // corpo não-JSON: não dá para inferir erros — segue como sucesso HTTP
      }
      if (bodyErrors !== undefined && bodyErrors > 0) {
        logger.error(
          `[cron/${jobName}] Job reportou ${bodyErrors} falha(s) apos ${durationMs}ms — payload: ${payloadSummary}`
        )
        throw new Error(
          `[cron-proxy] ${jobName} concluiu com ${bodyErrors} falha(s) (HTTP ${response.status}, ${durationMs}ms)`
        )
      }
    }

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
