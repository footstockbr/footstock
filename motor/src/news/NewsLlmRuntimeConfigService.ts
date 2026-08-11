// ============================================================================
// FootStock Motor — NewsLlmRuntimeConfigService
// Substitui resolucao estatica de AI_PROVIDER/MODEL/cliente no carregamento.
// Cache curto + ultima configuracao valida. Node-only quando llm desligada.
// ============================================================================

import type Redis from 'ioredis'
import type { PrismaClient } from '@prisma/client'
import { getAdapterBySlug } from './llm-adapter-registry'
import { decryptToken } from './llm-token-crypto'
import {
  buildHealthSnapshot,
  LLM_HEALTH_REDIS_KEY,
  LLM_HEALTH_TTL_SECONDS,
  shouldAcceptHealthEvent,
  type LlmHealthReasonCode,
  type LlmHealthSnapshot,
  type LlmHealthState,
} from './llm-health'
import { logger } from '../utils/logger'

export interface ResolvedLlmRuntime {
  llmEnabled: boolean
  reason: 'ok' | 'llm_disabled_by_admin' | 'no_config' | 'no_active_provider' | 'token_missing' | 'adapter_unknown'
  configVersion: number
  providerId: string | null
  providerName: string | null
  adapterSlug: string | null
  apiKey: string | undefined
  baseURL: string | undefined
  model: string
}

interface DbConfigRow {
  llm_enabled: boolean
  active_provider_id: string | null
  config_version: number
}

interface DbProviderRow {
  id: string
  slug: string
  name: string
  enabled: boolean
  token_ciphertext: string | null
  deleted_at: Date | null
}

const CACHE_TTL_MS = 5_000

export class NewsLlmRuntimeConfigService {
  private cache: { at: number; value: ResolvedLlmRuntime } | null = null
  private lastValid: ResolvedLlmRuntime | null = null

  constructor(
    private readonly prisma?: PrismaClient,
    private readonly redis?: Redis,
  ) {}

  /** Invalida cache (hot switch dentro do TTL). */
  invalidate(): void {
    this.cache = null
  }

  async getRuntimeConfig(force = false): Promise<ResolvedLlmRuntime> {
    const now = Date.now()
    if (!force && this.cache && now - this.cache.at < CACHE_TTL_MS) {
      return this.cache.value
    }

    const resolved = await this.loadFromDbOrEnv()
    this.cache = { at: now, value: resolved }
    if (resolved.llmEnabled && resolved.reason === 'ok') {
      this.lastValid = resolved
    }
    return resolved
  }

  /**
   * Ultima configuracao valida conhecida (para degradacao graciosa em falha de leitura).
   * Se nunca houve config valida e a atual falha fechado, retorna Node-only.
   */
  getLastValidOrCurrent(current: ResolvedLlmRuntime): ResolvedLlmRuntime {
    if (current.reason === 'ok') return current
    if (this.lastValid) return this.lastValid
    return current
  }

  private nodeOnly(reason: ResolvedLlmRuntime['reason'], configVersion = 0): ResolvedLlmRuntime {
    return {
      llmEnabled: false,
      reason,
      configVersion,
      providerId: null,
      providerName: null,
      adapterSlug: null,
      apiKey: undefined,
      baseURL: undefined,
      model: 'node-only',
    }
  }

  private async loadFromDbOrEnv(): Promise<ResolvedLlmRuntime> {
    if (!this.prisma) {
      return this.resolveFromEnvFallback()
    }

    try {
      const configs = await this.prisma.$queryRaw<DbConfigRow[]>`
        SELECT llm_enabled, active_provider_id, config_version
        FROM news_llm_config
        WHERE id = 'default'
        LIMIT 1
      `

      if (!configs.length) {
        // Primeiro boot sem configuracao legivel: falhar fechado em Node-only.
        return this.nodeOnly('no_config')
      }

      const cfg = configs[0]
      if (!cfg.llm_enabled || !cfg.active_provider_id) {
        return this.nodeOnly('llm_disabled_by_admin', cfg.config_version)
      }

      const providers = await this.prisma.$queryRaw<DbProviderRow[]>`
        SELECT id, slug, name, enabled, token_ciphertext, deleted_at
        FROM news_llm_providers
        WHERE id = ${cfg.active_provider_id}
        LIMIT 1
      `
      const provider = providers[0]
      if (!provider || provider.deleted_at || !provider.enabled) {
        return this.nodeOnly('no_active_provider', cfg.config_version)
      }

      const adapter = getAdapterBySlug(provider.slug)
      if (!adapter) {
        return this.nodeOnly('adapter_unknown', cfg.config_version)
      }

      let apiKey: string | undefined
      if (provider.token_ciphertext) {
        try {
          apiKey = decryptToken(provider.token_ciphertext)
        } catch (err) {
          logger.error(
            `[NewsLlmRuntime] falha ao decriptar token do provider id=${provider.id}: ${
              err instanceof Error ? err.message : 'unknown'
            }`,
          )
          return this.nodeOnly('token_missing', cfg.config_version)
        }
      } else {
        // Compatibilidade inicial com envs existentes (seed nativo sem token no DB).
        apiKey = this.envKeyForSlug(provider.slug)
      }

      if (!apiKey) {
        return this.nodeOnly('token_missing', cfg.config_version)
      }

      const baseURL =
        adapter.protocol === 'anthropic-compatible'
          ? (process.env.KIMI_BASE_URL ?? adapter.baseURL)?.trim()
          : undefined

      const model =
        provider.slug === 'kimi'
          ? (process.env.KIMI_MODEL ?? adapter.defaultModel).trim()
          : adapter.defaultModel

      return {
        llmEnabled: true,
        reason: 'ok',
        configVersion: cfg.config_version,
        providerId: provider.id,
        providerName: provider.name,
        adapterSlug: provider.slug,
        apiKey,
        baseURL,
        model,
      }
    } catch (err) {
      logger.warn(
        `[NewsLlmRuntime] leitura DB falhou, tentando env fallback: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      )
      if (this.lastValid) return this.lastValid
      return this.resolveFromEnvFallback()
    }
  }

  private envKeyForSlug(slug: string): string | undefined {
    if (slug === 'kimi') return process.env.KIMI_API_KEY
    if (slug === 'anthropic') return process.env.ANTHROPIC_API_KEY
    return undefined
  }

  /**
   * Fallback legado: AI_PROVIDER + chaves de env (sem linha em news_llm_config).
   * Usado apenas quando a tabela ainda nao existe ou prisma ausente.
   */
  private resolveFromEnvFallback(): ResolvedLlmRuntime {
    const provider =
      (process.env.AI_PROVIDER ?? 'anthropic').trim().toLowerCase() !== 'kimi' ? 'anthropic' : 'kimi'
    const adapter = getAdapterBySlug(provider)
    if (!adapter) return this.nodeOnly('adapter_unknown')

    const apiKey = this.envKeyForSlug(provider)
    if (!apiKey) {
      // Boot sem config legivel e sem env: Node-only fechado.
      return this.nodeOnly('no_config')
    }

    return {
      llmEnabled: true,
      reason: 'ok',
      configVersion: 0,
      providerId: `env:${provider}`,
      providerName: adapter.displayName,
      adapterSlug: provider,
      apiKey,
      baseURL:
        provider === 'kimi'
          ? (process.env.KIMI_BASE_URL ?? adapter.baseURL)?.trim()
          : undefined,
      model:
        provider === 'kimi'
          ? (process.env.KIMI_MODEL ?? adapter.defaultModel).trim()
          : adapter.defaultModel,
    }
  }

  async publishHealth(
    partial: {
      state: LlmHealthState
      reasonCode: LlmHealthReasonCode
    },
    runtime?: ResolvedLlmRuntime,
  ): Promise<void> {
    if (!this.redis) return
    const rt = runtime ?? (await this.getRuntimeConfig())

    if (!rt.llmEnabled) {
      const snap = buildHealthSnapshot({
        providerId: null,
        providerName: null,
        configVersion: rt.configVersion,
        state: 'disabled',
        reasonCode: 'llm_disabled_by_admin',
      })
      await this.writeHealth(snap)
      return
    }

    const event = {
      providerId: rt.providerId,
      configVersion: rt.configVersion,
    }
    if (
      !shouldAcceptHealthEvent(event, {
        providerId: rt.providerId,
        configVersion: rt.configVersion,
        llmEnabled: rt.llmEnabled,
      })
    ) {
      return
    }

    const snap = buildHealthSnapshot({
      providerId: rt.providerId,
      providerName: rt.providerName,
      configVersion: rt.configVersion,
      state: partial.state,
      reasonCode: partial.reasonCode,
    })
    await this.writeHealth(snap)
  }

  private async writeHealth(snapshot: LlmHealthSnapshot): Promise<void> {
    if (!this.redis) return
    try {
      // Snapshot sanitizado: sem token, ciphertext ou corpo bruto.
      await this.redis.set(
        LLM_HEALTH_REDIS_KEY,
        JSON.stringify(snapshot),
        'EX',
        LLM_HEALTH_TTL_SECONDS,
      )
    } catch (err) {
      logger.warn(
        `[NewsLlmRuntime] falha ao gravar health snapshot: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      )
    }
  }
}

/** Singleton lazy para o motor (preenchido em index.ts). */
let _runtimeSingleton: NewsLlmRuntimeConfigService | null = null

export function setNewsLlmRuntimeService(svc: NewsLlmRuntimeConfigService): void {
  _runtimeSingleton = svc
}

export function getNewsLlmRuntimeService(): NewsLlmRuntimeConfigService {
  if (!_runtimeSingleton) {
    _runtimeSingleton = new NewsLlmRuntimeConfigService()
  }
  return _runtimeSingleton
}
