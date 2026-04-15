// ============================================================================
// Foot Stock Motor — MarketEngineService
// Orquestrador das 10 camadas quantitativas + agentes de liquidez.
// Re-exporta MarketEngine com interface de serviço explícita.
// ============================================================================

/**
 * MarketEngineService — Ponto de entrada público do motor de mercado.
 *
 * Orquestra:
 *   - 10 camadas quantitativas (L1_OrnsteinUhlenbeck → L10_CircuitBreaker)
 *   - Correlação inter-ativos por cluster (CorrelationLayer)
 *   - Agentes de liquidez (LiquidityAgents — 5 perfis canônicos)
 *   - Order book, execução de ordens, margin calls, juros de alavancagem
 *
 * Pipeline de preços por tick:
 *   [guard isPaused] → L1→L2→L3→L4→L5→L6→L7→L8→L9→[Correlation]→L10(CB trigger)
 *
 * Estado persistido em `delivery.json` e banco via Prisma.
 * Configuração por cluster: `engineConfig.ts` com hot-reload do banco (TTL 60s).
 *
 * Para uso externo: importe MarketEngineService e chame start()/stop().
 * Para admin/debug: use os métodos de controle e consulte lastLayerResults.
 */
export { MarketEngine as MarketEngineService } from './MarketEngine'
export type { MarketEngine } from './MarketEngine'
