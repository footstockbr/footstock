// ============================================================================
// FootStock — Sinal de degradacao silenciosa (FIX-14)
// ----------------------------------------------------------------------------
// Torna OBSERVAVEL todo ponto que antes degradava em silencio:
//   - fail-open do rate-limiter (Redis offline / EVAL falhou) — src/lib/redis.ts
//   - live_mode indeterminado no Mercado Pago — src/lib/gateways/mercadopago.ts
//   - webhook secret ausente (CONFIG_MISSING) — src/lib/gateways/webhook-validator.ts
//
// O sinal NUNCA altera o fluxo da request — apenas EMITE. Dois niveis:
//   - 'warn'  -> degradacao tolerada que precisa de visibilidade (ex: fail-open)
//   - 'alert' -> degradacao critica (config faltando) que exige acao do operador
//
// Canais (sempre best-effort, jamais lancam excecao):
//   - stdout (console.warn/error) -> visivel em `railway logs` mesmo sem Sentry
//   - Sentry (captureMessage + breadcrumb)
//
// Throttle por chave (level:signal) para nao inundar logs sob outage continuo
// (default 60s). Sem dependencia de Redis: o ponto de fail-open do rate-limiter
// ocorre JUSTAMENTE quando o Redis esta indisponivel, entao o sinal precisa
// funcionar sem ele. Manter sem import de '@/lib/redis' tambem evita ciclo de
// import (redis.ts importa este modulo).
// ============================================================================

import * as Sentry from '@sentry/nextjs'

export type DegradationLevel = 'warn' | 'alert'

export type DegradationContext = Record<string, string | number | boolean | null | undefined>

const _lastEmit = new Map<string, number>()

function shouldEmit(key: string, throttleMs: number, now: number): boolean {
  if (throttleMs <= 0) return true
  const prev = _lastEmit.get(key)
  if (prev !== undefined && now - prev < throttleMs) return false
  _lastEmit.set(key, now)
  return true
}

function formatContext(context?: DegradationContext): string {
  if (!context) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(context)) {
    if (v === undefined || v === null) continue
    parts.push(`${k}=${v}`)
  }
  return parts.length ? ' ' + parts.join(' ') : ''
}

export interface EmitOptions {
  level?: DegradationLevel
  /** ms minimo entre emissoes da mesma `signal` (anti-flood). 0 desliga o throttle. */
  throttleMs?: number
  context?: DegradationContext
}

/**
 * Emite um sinal observavel para um ponto antes silencioso. Fail-open total:
 * qualquer erro de transporte (Sentry/console) e engolido — instrumentacao
 * jamais quebra o caminho da request.
 * @returns `true` quando efetivamente emitiu (passou pelo throttle); util p/ teste.
 */
export function emitDegradationSignal(signal: string, options: EmitOptions = {}): boolean {
  const level = options.level ?? 'warn'
  const throttleMs = options.throttleMs ?? 60_000
  const now = Date.now()

  if (!shouldEmit(`${level}:${signal}`, throttleMs, now)) return false

  const tag = level === 'alert' ? 'ALERT' : 'WARN'
  const line = `[DEGRADATION:${tag}] signal=${signal}${formatContext(options.context)}`

  try {
    if (level === 'alert') console.error(line)
    else console.warn(line)
  } catch {
    /* ignora: stdout indisponivel nunca quebra o caller */
  }

  try {
    Sentry.addBreadcrumb({
      category: 'degradation',
      level: level === 'alert' ? 'error' : 'warning',
      message: signal,
      data: options.context,
    })
    Sentry.captureMessage(`degradation:${signal}`, {
      level: level === 'alert' ? 'error' : 'warning',
      tags: { signal, degradation_level: level },
      extra: options.context as Record<string, unknown> | undefined,
    })
  } catch {
    /* ignora: transporte Sentry nunca quebra o caller */
  }

  return true
}

/** Limpa o estado de throttle. Apenas para testes deterministas. */
export function __resetDegradationThrottle(): void {
  _lastEmit.clear()
}
