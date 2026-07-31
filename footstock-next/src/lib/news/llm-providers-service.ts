// ============================================================================
// FootStock — News LLM providers service (SUPER_ADMIN)
// Persistencia, CAS por versao, seed idempotente, masking de tokens.
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import {
  encryptToken,
  getTokenKeyVersion,
  serializeEncryptedToken,
} from '@/lib/news/llm-token-crypto'
import {
  listNativeSeedProviders,
  MAX_CUSTOM_PROVIDERS,
  resolveAdapterByName,
} from '@/lib/news/llm-adapter-registry'
import {
  buildHealthSnapshot,
  isSnapshotFresh,
  LLM_HEALTH_REDIS_KEY,
  type LlmHealthSnapshot,
} from '@/lib/news/llm-health'

export interface ProviderRow {
  id: string
  slug: string
  name: string
  enabled: boolean
  token_ciphertext: string | null
  token_key_version: number
  deleted_at: Date | null
  created_at: Date
  updated_at: Date
  created_by: string | null
}

export interface ConfigRow {
  id: string
  llm_enabled: boolean
  active_provider_id: string | null
  config_version: number
  updated_at: Date
  updated_by: string | null
}

export interface ProviderDto {
  id: string
  slug: string
  name: string
  enabled: boolean
  tokenConfigured: boolean
  isNative: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ConfigDto {
  llmEnabled: boolean
  activeProviderId: string | null
  configVersion: number
  updatedAt: string
  updatedBy: string | null
}

function toProviderDto(row: ProviderRow, activeProviderId: string | null): ProviderDto {
  const native = listNativeSeedProviders().some((n) => n.slug === row.slug)
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    enabled: row.enabled,
    tokenConfigured: Boolean(row.token_ciphertext),
    isNative: native,
    isActive: activeProviderId === row.id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export async function ensureLlmTablesSeeded(adminId?: string): Promise<void> {
  // Seed idempotente: config singleton + Kimi/Anthropic nativos.
  await prisma.$executeRaw`
    INSERT INTO news_llm_config (id, llm_enabled, active_provider_id, config_version, updated_at, updated_by)
    VALUES ('default', true, NULL, 1, NOW(), ${adminId ?? null})
    ON CONFLICT (id) DO NOTHING
  `

  for (const seed of listNativeSeedProviders()) {
    await prisma.$executeRaw`
      INSERT INTO news_llm_providers (id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by)
      VALUES (
        ${`seed-${seed.slug}`},
        ${seed.slug},
        ${seed.name},
        true,
        NULL,
        ${getTokenKeyVersion()},
        NULL,
        NOW(),
        NOW(),
        ${adminId ?? 'system'}
      )
      ON CONFLICT (slug) DO NOTHING
    `
  }

  // Se config sem active e existe provider nativo do env, seleciona.
  const configs = await prisma.$queryRaw<ConfigRow[]>`
    SELECT id, llm_enabled, active_provider_id, config_version, updated_at, updated_by
    FROM news_llm_config WHERE id = 'default' LIMIT 1
  `
  const cfg = configs[0]
  if (cfg && !cfg.active_provider_id && cfg.llm_enabled) {
    const envPref =
      (process.env.AI_PROVIDER ?? 'kimi').trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'kimi'
    const providers = await prisma.$queryRaw<ProviderRow[]>`
      SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
      FROM news_llm_providers
      WHERE slug = ${envPref} AND deleted_at IS NULL
      LIMIT 1
    `
    if (providers[0]) {
      await prisma.$executeRaw`
        UPDATE news_llm_config
        SET active_provider_id = ${providers[0].id},
            updated_at = NOW(),
            updated_by = ${adminId ?? 'system'}
        WHERE id = 'default' AND active_provider_id IS NULL
      `
    }
  }
}

export async function listProvidersAndConfig(): Promise<{
  providers: ProviderDto[]
  config: ConfigDto
  health: LlmHealthSnapshot
}> {
  await ensureLlmTablesSeeded()

  const configs = await prisma.$queryRaw<ConfigRow[]>`
    SELECT id, llm_enabled, active_provider_id, config_version, updated_at, updated_by
    FROM news_llm_config WHERE id = 'default' LIMIT 1
  `
  const cfg = configs[0]
  if (!cfg) {
    throw new Error('news_llm_config ausente apos seed')
  }

  const rows = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
    FROM news_llm_providers
    WHERE deleted_at IS NULL
    ORDER BY
      CASE slug WHEN 'kimi' THEN 0 WHEN 'anthropic' THEN 1 ELSE 2 END,
      created_at ASC
  `

  const providers = rows.map((r) => toProviderDto(r, cfg.active_provider_id))
  const config: ConfigDto = {
    llmEnabled: cfg.llm_enabled,
    activeProviderId: cfg.active_provider_id,
    configVersion: cfg.config_version,
    updatedAt: cfg.updated_at.toISOString(),
    updatedBy: cfg.updated_by,
  }

  const health = await readHealthSnapshot(config)
  return { providers, config, health }
}

async function readHealthSnapshot(config: ConfigDto): Promise<LlmHealthSnapshot> {
  if (!config.llmEnabled || !config.activeProviderId) {
    return buildHealthSnapshot({
      providerId: null,
      providerName: null,
      configVersion: config.configVersion,
      state: 'disabled',
      reasonCode: 'llm_disabled_by_admin',
    })
  }

  try {
    const raw = await redis.get(LLM_HEALTH_REDIS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LlmHealthSnapshot
      if (
        parsed.providerId === config.activeProviderId &&
        parsed.configVersion === config.configVersion &&
        isSnapshotFresh(parsed)
      ) {
        return parsed
      }
      if (
        parsed.providerId === config.activeProviderId &&
        parsed.configVersion === config.configVersion &&
        !isSnapshotFresh(parsed)
      ) {
        return buildHealthSnapshot({
          providerId: config.activeProviderId,
          providerName: null,
          configVersion: config.configVersion,
          state: 'unknown',
          reasonCode: 'stale',
        })
      }
    }
  } catch {
    // Redis indisponivel
  }

  return buildHealthSnapshot({
    providerId: config.activeProviderId,
    providerName: null,
    configVersion: config.configVersion,
    state: 'unknown',
    reasonCode: 'no_event',
  })
}

export async function createProvider(input: {
  name: string
  token: string
  adminId: string
}): Promise<ProviderDto> {
  await ensureLlmTablesSeeded(input.adminId)

  const adapter = resolveAdapterByName(input.name)
  if (!adapter) {
    const err = new Error('Adapter desconhecido. Use um nome allowlisted (ex: Kimi, Anthropic).')
    ;(err as Error & { code: string }).code = 'LLM-001'
    throw err
  }

  if (!input.token?.trim()) {
    const err = new Error('Token e obrigatorio.')
    ;(err as Error & { code: string }).code = 'LLM-002'
    throw err
  }

  const existing = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM news_llm_providers WHERE deleted_at IS NULL
  `
  if (Number(existing[0]?.c ?? 0) >= MAX_CUSTOM_PROVIDERS + listNativeSeedProviders().length) {
    const err = new Error('Limite de providers atingido.')
    ;(err as Error & { code: string }).code = 'LLM-003'
    throw err
  }

  // Duplicata por slug entre ativos.
  const activeDup = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
    FROM news_llm_providers
    WHERE slug = ${adapter.slug} AND deleted_at IS NULL
    LIMIT 1
  `
  if (activeDup.length) {
    const err = new Error(`Ja existe provider para adapter "${adapter.displayName}".`)
    ;(err as Error & { code: string }).code = 'LLM-004'
    throw err
  }

  const encrypted = encryptToken(input.token.trim())
  const ciphertext = serializeEncryptedToken(encrypted)
  const displayName = input.name.trim()

  // Revive soft-deleted com mesmo slug (ex: apos exclusao de Kimi/Anthropic).
  const soft = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
    FROM news_llm_providers
    WHERE slug = ${adapter.slug} AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    LIMIT 1
  `

  let id: string
  if (soft[0]) {
    id = soft[0].id
    await prisma.$executeRaw`
      UPDATE news_llm_providers
      SET name = ${displayName},
          enabled = true,
          token_ciphertext = ${ciphertext},
          token_key_version = ${encrypted.v},
          deleted_at = NULL,
          updated_at = NOW(),
          created_by = ${input.adminId}
      WHERE id = ${id}
    `
  } else {
    id = `prov_${adapter.slug}_${Date.now().toString(36)}`
    await prisma.$executeRaw`
      INSERT INTO news_llm_providers (
        id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
      ) VALUES (
        ${id},
        ${adapter.slug},
        ${displayName},
        true,
        ${ciphertext},
        ${encrypted.v},
        NULL,
        NOW(),
        NOW(),
        ${input.adminId}
      )
    `
  }

  const configs = await prisma.$queryRaw<ConfigRow[]>`
    SELECT id, llm_enabled, active_provider_id, config_version, updated_at, updated_by
    FROM news_llm_config WHERE id = 'default' LIMIT 1
  `
  const rows = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
    FROM news_llm_providers WHERE id = ${id} LIMIT 1
  `
  return toProviderDto(rows[0], configs[0]?.active_provider_id ?? null)
}

export async function applyProviderState(input: {
  expectedVersion: number
  /** Map providerId -> enabled */
  enabledMap: Record<string, boolean>
  /** Provider selecionado (radio). Null se todos desligados. */
  activeProviderId: string | null
  adminId: string
}): Promise<{ providers: ProviderDto[]; config: ConfigDto }> {
  await ensureLlmTablesSeeded(input.adminId)

  const configs = await prisma.$queryRaw<ConfigRow[]>`
    SELECT id, llm_enabled, active_provider_id, config_version, updated_at, updated_by
    FROM news_llm_config WHERE id = 'default' LIMIT 1
  `
  const cfg = configs[0]
  if (!cfg) throw new Error('config ausente')

  if (cfg.config_version !== input.expectedVersion) {
    const err = new Error('Conflito de versao. Recarregue e tente novamente.')
    ;(err as Error & { code: string }).code = 'LLM-409'
    throw err
  }

  const rows = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
    FROM news_llm_providers WHERE deleted_at IS NULL
  `

  // Aplica toggles
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(input.enabledMap, row.id)) {
      const next = Boolean(input.enabledMap[row.id])
      if (next !== row.enabled) {
        await prisma.$executeRaw`
          UPDATE news_llm_providers SET enabled = ${next}, updated_at = NOW()
          WHERE id = ${row.id}
        `
      }
    }
  }

  // Rele apos toggles
  const after = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
    FROM news_llm_providers WHERE deleted_at IS NULL
  `

  const anyEnabled = after.some((r) => r.enabled)
  let llmEnabled = anyEnabled
  let activeProviderId: string | null = null

  if (!anyEnabled) {
    llmEnabled = false
    activeProviderId = null
  } else {
    // Radio so em linha habilitada; exige exatamente um ativo.
    const candidate = input.activeProviderId
    const activeRow = after.find((r) => r.id === candidate)
    if (!candidate || !activeRow || !activeRow.enabled) {
      const err = new Error('Selecione exatamente um provider habilitado.')
      ;(err as Error & { code: string }).code = 'LLM-005'
      throw err
    }
    activeProviderId = activeRow.id
    llmEnabled = true
  }

  const updated = await prisma.$executeRaw`
    UPDATE news_llm_config
    SET llm_enabled = ${llmEnabled},
        active_provider_id = ${activeProviderId},
        config_version = config_version + 1,
        updated_at = NOW(),
        updated_by = ${input.adminId}
    WHERE id = 'default' AND config_version = ${input.expectedVersion}
  `

  // Prisma $executeRaw returns number of rows in some drivers; if 0, CAS failed.
  if (typeof updated === 'number' && updated === 0) {
    const err = new Error('Conflito de versao. Recarregue e tente novamente.')
    ;(err as Error & { code: string }).code = 'LLM-409'
    throw err
  }

  return listProvidersAndConfig().then(({ providers, config }) => ({ providers, config }))
}

export async function deleteProvider(input: {
  id: string
  confirmName: string
  adminId: string
}): Promise<{ providers: ProviderDto[]; config: ConfigDto }> {
  await ensureLlmTablesSeeded(input.adminId)

  const rows = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, slug, name, enabled, token_ciphertext, token_key_version, deleted_at, created_at, updated_at, created_by
    FROM news_llm_providers WHERE id = ${input.id} AND deleted_at IS NULL LIMIT 1
  `
  const row = rows[0]
  if (!row) {
    const err = new Error('Provider nao encontrado.')
    ;(err as Error & { code: string }).code = 'LLM-404'
    throw err
  }

  if (input.confirmName.trim() !== row.name) {
    const err = new Error('Confirmacao nominal incorreta.')
    ;(err as Error & { code: string }).code = 'LLM-006'
    throw err
  }

  const configs = await prisma.$queryRaw<ConfigRow[]>`
    SELECT id, llm_enabled, active_provider_id, config_version, updated_at, updated_by
    FROM news_llm_config WHERE id = 'default' LIMIT 1
  `
  const cfg = configs[0]

  // Se e o ativo: atomicamente Node-only antes de soft-delete + limpa credencial.
  if (cfg && cfg.active_provider_id === row.id) {
    await prisma.$executeRaw`
      UPDATE news_llm_config
      SET llm_enabled = false,
          active_provider_id = NULL,
          config_version = config_version + 1,
          updated_at = NOW(),
          updated_by = ${input.adminId}
      WHERE id = 'default'
    `
  }

  await prisma.$executeRaw`
    UPDATE news_llm_providers
    SET deleted_at = NOW(),
        token_ciphertext = NULL,
        enabled = false,
        updated_at = NOW()
    WHERE id = ${row.id}
  `

  // Adapter nativo: recria seed sem token (lista sempre mostra Kimi/Anthropic se deletados).
  // Spec exige exclusao inclusive de Kimi/Anthropic; apos delete eles somem ate re-seed manual.
  // Nao re-seed automatico para honrar exclusao confirmada.

  return listProvidersAndConfig().then(({ providers, config }) => ({ providers, config }))
}

export function sanitizeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Erro interno'
  // Nunca vazar ciphertext / tokens em mensagens
  if (/sk-|ciphertext|token_ciphertext|Bearer\s/i.test(msg)) {
    return 'Erro interno ao processar credencial.'
  }
  return msg
}

export function getErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code
  }
  return 'LLM-500'
}
