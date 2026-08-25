// ============================================================================
// FootStock — Sell Preview Contract
// DTO unico do preview de venda consumido pelo modal SELL (OrderForm).
//
// Motivacao (fonte 08-24, criterio 1): antes desta rota o modal de venda lia o
// preco de `useMarketTick` e nao tinha nenhuma nocao de inventario. O usuario
// so descobria que nao podia vender depois do POST, via ORDER_050. Aqui o
// servidor devolve, numa unica leitura coerente, o que o usuario possui, o que
// esta reservado em ordens abertas, o que sobra para vender, o preco medio e o
// preco corrente ja com o delay do plano aplicado.
//
// Invariantes do contrato:
//  - O DTO tem EXATAMENTE os catorze campos de SELL_PREVIEW_FIELDS. Campo novo
//    exige bump aqui e no teste de integracao (comparacao de chaves).
//  - `currentPrice` NUNCA vem de `Asset.currentPrice` direto: sempre da saida de
//    `applyPriceDelay()`, para que JOGADOR/CRAQUE jamais vejam preco real.
//  - Ausencia de posicao NAO e 404: e 200 com `hasPosition: false`, quantidades
//    zero e `avgPrice: null`. O ativo existe; a posicao e que nao.
// ============================================================================

/** Status da posicao LONG do usuario no ativo, ou null se ele nunca teve o ativo. */
export type SellPreviewPositionStatus = 'OPEN' | 'CLOSED'

export interface SellPreviewDto {
  /** Id do ativo (Asset.id), estavel mesmo quando o ticker chega por alias. */
  assetId: string
  /** Id da posicao LONG encontrada (aberta ou a ultima fechada), ou null. */
  positionId: string | null
  /** Ticker canonico ja resolvido pelo AliasService (FLA3 -> URU3). */
  ticker: string
  /** Nome de exibicao do ativo, para o modal nao mostrar so o codigo. */
  displayName: string
  /** OPEN, CLOSED ou null. Distingue "nunca teve" de "teve e zerou". */
  positionStatus: SellPreviewPositionStatus | null
  /** true quando existe posicao LONG ABERTA com quantidade > 0. */
  hasPosition: boolean
  /** Quantidade total possuida na posicao aberta. */
  ownedQty: number
  /** Quantidade travada em ordens SELL OPEN/PARTIAL (OCO conta uma vez por grupo). */
  reservedQty: number
  /** ownedQty - reservedQty, com piso em zero. Fonte unica do gate do submit. */
  availableQty: number
  /** Preco medio de compra da posicao aberta, ou null quando nao ha posicao. */
  avgPrice: number | null
  /** Preco corrente ja atrasado conforme o plano (nunca o preco real para JOGADOR/CRAQUE). */
  currentPrice: number
  /** ISO 8601 do instante a que `currentPrice` se refere. */
  currentPriceAsOf: string
  /** true quando o plano do usuario aplica atraso na cotacao. */
  isPriceDelayed: boolean
  /** Atraso do plano em minutos (0 para LENDA). */
  priceDelayMinutes: number
}

/**
 * Chaves canonicas do DTO, na ordem do contrato.
 * Usado pelo teste de integracao para provar "sem campo extra e sem campo
 * faltante" sem depender de inspecao manual.
 */
export const SELL_PREVIEW_FIELDS = [
  'assetId',
  'positionId',
  'ticker',
  'displayName',
  'positionStatus',
  'hasPosition',
  'ownedQty',
  'reservedQty',
  'availableQty',
  'avgPrice',
  'currentPrice',
  'currentPriceAsOf',
  'isPriceDelayed',
  'priceDelayMinutes',
] as const satisfies readonly (keyof SellPreviewDto)[]

export interface BuildSellPreviewInput {
  assetId: string
  ticker: string
  displayName: string
  ownedQty: number
  reservedQty: number
  availableQty: number
  avgPrice: number
  positionId: string | null
  positionStatus: SellPreviewPositionStatus | null
  /** Saida de applyPriceDelay(): preco ja atrasado conforme o plano. */
  delayedPrice: {
    currentPrice: number
    timestamp: string
    isDelayed: boolean
    delayMinutes: number
  }
}

/**
 * Monta o DTO a partir da disponibilidade de venda (OrderService) e do preco ja
 * atrasado (DelayService). Ponto unico onde `avgPrice: 0` vira `null`: sem
 * posicao aberta nao existe preco medio, e zero seria mentira aritmetica no P/L
 * estimado do modal.
 */
export function buildSellPreviewDto(input: BuildSellPreviewInput): SellPreviewDto {
  const hasPosition = input.ownedQty > 0
  return {
    assetId: input.assetId,
    positionId: input.positionId,
    ticker: input.ticker,
    displayName: input.displayName,
    positionStatus: input.positionStatus,
    hasPosition,
    ownedQty: input.ownedQty,
    reservedQty: input.reservedQty,
    availableQty: input.availableQty,
    avgPrice: hasPosition ? input.avgPrice : null,
    currentPrice: input.delayedPrice.currentPrice,
    currentPriceAsOf: input.delayedPrice.timestamp,
    isPriceDelayed: input.delayedPrice.isDelayed,
    priceDelayMinutes: input.delayedPrice.delayMinutes,
  }
}
