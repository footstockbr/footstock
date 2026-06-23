// ============================================================================
// FootStock — Rate Limit Helpers (TASK-026)
// Utilitários compartilhados: headers, normalização de IP, factory helpers.
// ============================================================================

import type { NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitInfo {
  limit: number
  remaining: number
  /** Timestamp Unix em SEGUNDOS quando a janela reseta */
  resetTimestampSeconds: number
}

// ─── IP Normalization ─────────────────────────────────────────────────────────

/**
 * Normaliza endereços IP para uso como chave Redis:
 * - Remove prefixo IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4)
 * - Trunca IPv6 puro ao prefixo /64 (evita explosão de chaves por SLAAC)
 * - Extrai o primeiro IP de lista X-Forwarded-For
 */
export function normalizeIp(rawIp: string): string {
  // Extrai primeiro IP de lista "1.2.3.4, 5.6.7.8"
  const ip = rawIp.split(',')[0]?.trim() ?? rawIp

  // IPv4-mapped IPv6: ::ffff:1.2.3.4 → 1.2.3.4
  const ipv4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (ipv4Mapped?.[1]) return ipv4Mapped[1]

  // IPv6 puro: truncar ao prefixo /64 (4 primeiros grupos)
  if (ip.includes(':')) {
    const expanded = expandIPv6(ip)
    const groups = expanded.split(':')
    return groups.slice(0, 4).join(':') + '::/64'
  }

  return ip
}

/**
 * ST009 — Resolve o IP do cliente a partir do hop CONFIÁVEL, mitigando X-Forwarded-For
 * spoof. A cadeia XFF cresce à direita conforme passa por cada proxy: o cliente pode
 * forjar entradas à ESQUERDA, mas não consegue forjar a entrada que o proxy confiável
 * acrescenta. Por isso o IP real é o (`trustedProxyHops`)-ésimo a partir da direita.
 *
 * `x-real-ip` (quando presente) é setado pelo edge confiável e tem precedência.
 * Usar a entrada esquerda da XFF (como `normalizeIp(rawHeader)` fazia) permitia ao
 * atacante rotacionar a chave de rate-limit e poluir o log com IPs arbitrários.
 *
 * @param headers     objeto com `get(name)` (Headers do request)
 * @param trustedProxyHops  nº de proxies confiáveis entre app e internet (default 1)
 */
export function resolveTrustedClientIp(
  headers: { get(name: string): string | null },
  trustedProxyHops = 1
): string {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return normalizeIp(realIp)

  const xff = headers.get('x-forwarded-for')
  if (!xff) return '0.0.0.0'

  const chain = xff
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (chain.length === 0) return '0.0.0.0'

  const hops = Math.max(1, Math.trunc(trustedProxyHops))
  // Hop confiável = (hops)-ésimo a partir da direita. Clamp em 0 para cadeias mais
  // curtas que o nº de hops configurado (degrada para o IP mais à esquerda disponível).
  const idx = Math.max(0, chain.length - hops)
  return normalizeIp(chain[idx] ?? chain[chain.length - 1]!)
}

/** Expande notação comprimida IPv6 (::) para forma completa */
function expandIPv6(ip: string): string {
  if (!ip.includes('::')) return ip
  const [left, right] = ip.split('::')
  const leftGroups = left ? left.split(':') : []
  const rightGroups = right ? right.split(':') : []
  const missing = 8 - leftGroups.length - rightGroups.length
  const fill = Array(missing).fill('0')
  return [...leftGroups, ...fill, ...rightGroups].join(':')
}

// ─── Header Helper ────────────────────────────────────────────────────────────

/**
 * Aplica headers X-RateLimit-* a qualquer NextResponse.
 * Deve ser chamado em TODAS as respostas dos 6 endpoints críticos (não só 429).
 *
 * @param retryAfterSeconds — passar apenas em respostas 429 (RFC 9110)
 */
export function applyRateLimitHeaders(
  res: NextResponse,
  info: RateLimitInfo,
  retryAfterSeconds?: number
): NextResponse {
  res.headers.set('X-RateLimit-Limit', String(info.limit))
  res.headers.set('X-RateLimit-Remaining', String(Math.max(0, info.remaining)))
  res.headers.set('X-RateLimit-Reset', String(info.resetTimestampSeconds))
  if (retryAfterSeconds !== undefined) {
    res.headers.set('Retry-After', String(Math.max(0, Math.ceil(retryAfterSeconds))))
  }
  return res
}

/**
 * Converte timestamp em ms (retorno do SlidingWindowRateLimiter) para seconds.
 * Reset = 0 quando não há janela ativa (Redis indisponível).
 */
export function msToResetSeconds(resetMs: number): number {
  if (!resetMs) return 0
  return Math.floor(resetMs / 1000)
}

/**
 * Calcula segundos para Retry-After a partir de reset timestamp em ms.
 */
export function retryAfterFromReset(resetMs: number): number {
  if (!resetMs) return 0
  return Math.max(0, Math.ceil((resetMs - Date.now()) / 1000))
}
