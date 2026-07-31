/**
 * Runtime LLM habilitado para suites legadas do NewsClassifier.
 * Evita short-circuit Node-only apos integracao do NewsLlmRuntimeConfigService.
 */
import type {
  NewsLlmRuntimeConfigService,
  ResolvedLlmRuntime,
} from '../../NewsLlmRuntimeConfigService'

export const TEST_ENABLED_RUNTIME: ResolvedLlmRuntime = {
  llmEnabled: true,
  reason: 'ok',
  configVersion: 1,
  providerId: 'test-provider',
  providerName: 'Test Provider',
  adapterSlug: 'anthropic',
  apiKey: 'sk-test-fixture',
  baseURL: undefined,
  model: 'claude-sonnet-4-20250514',
}

export function makeEnabledRuntime(
  overrides: Partial<ResolvedLlmRuntime> = {},
): NewsLlmRuntimeConfigService {
  const value: ResolvedLlmRuntime = { ...TEST_ENABLED_RUNTIME, ...overrides }
  return {
    getRuntimeConfig: jest.fn().mockResolvedValue(value),
    publishHealth: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn(),
    getLastValidOrCurrent: jest.fn((current: ResolvedLlmRuntime) => current),
  } as unknown as NewsLlmRuntimeConfigService
}
