// ============================================================================
// Foot Stock Motor — Contratos Cross-Module (module-2 Shared Foundations)
// Re-exports tipados dos artefatos de module-2 consumidos pelo motor Railway.
// Atualizar paths conforme estrutura real do workspace Next.js.
// ============================================================================

/**
 * Enum de tipos de sessão de mercado (B3 Bovespa).
 * Owner: module-2/TASK-1 — lib/constants/market.ts (MarketSession)
 * Alinhamento: 'PRE_ABERTURA' | 'NEGOCIACAO' | 'CALL' | 'AFTER_MARKET' | 'FECHADO'
 * No motor: importar de '../types/motor.types' como SessionType
 */
export type { SessionType } from './motor.types'

/**
 * Mapa de cores por SessionType (hex).
 * Owner: module-2/TASK-1 — lib/constants/market.ts (SESSION_COLORS)
 * Valores: PRE_ABERTURA=#c9a84c, NEGOCIACAO=#8b5cf6, CALL=#06b6d4,
 *          AFTER_MARKET=#7c3aed, FECHADO=#ef4444
 * No motor: cores não são consumidas diretamente — apenas SessionType e volatilityMultiplier
 */
// SESSION_COLORS não é importada no motor (uso exclusivo no Next.js)

/**
 * Intervalo do tick do motor em milissegundos.
 * Owner: module-2/TASK-1 — lib/constants/market.ts
 * Valor configurável via env: MOTOR_TICK_INTERVAL_MS (default: 2000ms)
 * No motor: ler de process.env.MOTOR_TICK_INTERVAL_MS ?? 2000
 */
// MOTOR_TICK_MS não é importada — configurada via variável de ambiente no Railway
