// ============================================================================
// FootStock Motor — Cron Proxy (HTTP orchestrator pattern, Option C)
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

// O motor nao tem Sentry wired (nao ha @sentry/node em package.json). O canal canonico
// de alerta para o operador e um log estruturado `[ALERT][CODE]` (mesmo padrao de
// RSSFetcher e MarginCallChecker), capturado pelo agregador de logs do Railway.
// Trocar o corpo por Sentry.captureException(...) aqui se/quando o SDK for adicionado.
function emitCronAlert(code: string, message: string): void {
  logger.error(`[ALERT][${code}] ${message}`)
}

function readLocationHeader(response: { headers?: { get?: (name: string) => string | null } }): string {
  const get = response.headers?.get
  if (typeof get !== 'function') return '<no-location>'
  return get.call(response.headers, 'location') ?? '<no-location>'
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
    // redirect: 'manual' — NUNCA seguir 3xx automaticamente. Causa classica de cron 401
    // silencioso: FOOTSTOCK_NEXT_BASE_URL aponta para o apex (footstock.com.br) que faz
    // 301 -> www. Ao seguir o redirect, fetch DROPA o header Authorization no hop
    // cross-origin e o destino responde 401, mascarando a real causa (env apontando para
    // o apex). Com 'manual', o 3xx volta como resposta final e e tratado como erro DURO
    // abaixo, com alerta estruturado para o operador corrigir o env (-> www).
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
      redirect: 'manual',
      signal: controller.signal,
    })

    const durationMs = Date.now() - startedAt

    // 3xx: redirect nao seguido. Erro duro + alerta (env provavelmente no apex, deve ser www).
    if (response.status >= 300 && response.status < 400) {
      const location = readLocationHeader(response)
      emitCronAlert(
        'CRON_REDIRECT',
        `[cron/${jobName}] resposta 3xx HTTP ${response.status} apos ${durationMs}ms (location: ${location}). ` +
          `Provavel FOOTSTOCK_NEXT_BASE_URL no apex — use o host www final para preservar o header Authorization.`
      )
      throw new Error(
        `[cron-proxy] ${jobName} recebeu redirect HTTP ${response.status} -> ${location} (${durationMs}ms); ` +
          `ajuste FOOTSTOCK_NEXT_BASE_URL para o host final (www)`
      )
    }

    // 401: secret invalido/ausente OU Authorization perdido num hop de redirect anterior.
    if (response.status === 401) {
      emitCronAlert(
        'CRON_UNAUTHORIZED',
        `[cron/${jobName}] HTTP 401 apos ${durationMs}ms — CRON_SECRET invalido/ausente ou Authorization ` +
          `descartado em redirect. Verifique o secret e se a base URL ja e o host final.`
      )
      throw new Error(
        `[cron-proxy] ${jobName} nao autorizado: HTTP 401 (${durationMs}ms)`
      )
    }

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
