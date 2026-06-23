/**
 * Constantes de UI do painel admin.
 * Todos os componentes admin devem importar daqui em vez de redefinir localmente.
 *
 * NOTA (FIX-12): a fonte única de pricing é `PLAN_AMOUNTS_CENTS`
 * (`@/lib/constants/plan-amounts-cents`). Qualquer valor monetário aqui DERIVA
 * dela — nunca redefina preços hardcoded neste arquivo.
 */

import { PLAN_AMOUNTS_CENTS } from '@/lib/constants/plan-amounts-cents'

// ── Planos ──────────────────────────────────────────────────────────────────

export const PLAN_LABELS: Record<string, string> = {
  JOGADOR: 'Jogador',
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
}

/** Cores hex canônicas por plano (para uso em gráficos, badges inline, etc.) */
export const PLAN_HEX_COLORS: Record<string, string> = {
  JOGADOR: '#929AA5',
  CRAQUE: '#00B1EA',
  LENDA: '#F0B90B',
}

/**
 * Preços mensais em BRL por plano, DERIVADOS da SSoT `PLAN_AMOUNTS_CENTS`
 * (centavos / 100). FIX-12: nunca hardcodar; garante "preço exibido == valor
 * cobrado". MRR de verdade deve vir de `Subscription.amount`, não de count*price.
 */
export const PLAN_PRICE_VALUES: Record<string, number> = {
  JOGADOR: PLAN_AMOUNTS_CENTS.JOGADOR.monthly / 100,
  CRAQUE: PLAN_AMOUNTS_CENTS.CRAQUE.monthly / 100,
  LENDA: PLAN_AMOUNTS_CENTS.LENDA.monthly / 100,
}

/** Mapeamento para variante de Badge (componente UI interno) */
export const PLAN_BADGE_VARIANTS: Record<string, 'jogador' | 'craque' | 'lenda'> = {
  JOGADOR: 'jogador',
  CRAQUE: 'craque',
  LENDA: 'lenda',
}

// ── Impacto de Notícia ───────────────────────────────────────────────────────

/** Labels canônicos de categoria de impacto — use SEMPRE estes, não redefina localmente */
export const IMPACT_CATEGORY_LABELS: Record<string, string> = {
  FINANCEIRA_CRITICA: 'Financeira Crítica',
  ESPORTIVA_MAJORITARIA: 'Esportiva Majoritária',
  MERCADO_ATIVOS: 'Mercado de Ativos',
  INTEGRIDADE_SAUDE: 'Integridade/Saúde',
  INSTITUCIONAL: 'Institucional',
  ESPORTIVA_MENOR: 'Esportiva Menor',
}

/** Opções para select de impacto (value + label canônico) */
export const IMPACT_CATEGORY_OPTIONS = Object.entries(IMPACT_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label })
)

// ── Sentimento ───────────────────────────────────────────────────────────────

/** Cores hex por sentimento */
export const SENTIMENT_HEX_COLORS: Record<string, string> = {
  BULLISH: '#2EBD85',
  BEARISH: '#F6465D',
  NEUTRAL: '#F0B90B',
}

/** Labels por sentimento */
export const SENTIMENT_LABELS: Record<string, string> = {
  BULLISH: 'Bullish',
  BEARISH: 'Bearish',
  NEUTRAL: 'Neutral',
}

/** Opções para select de sentimento */
export const SENTIMENT_OPTIONS = [
  { value: 'BULLISH', label: 'Bullish (Positivo)' },
  { value: 'BEARISH', label: 'Bearish (Negativo)' },
  { value: 'NEUTRAL', label: 'Neutral' },
] as const

// ── Gateways de Pagamento ────────────────────────────────────────────────────

/**
 * Metadados canônicos por gateway.
 * Aceita tanto lowercase (stripe, mercadopago) quanto UPPER_SNAKE_CASE (MERCADO_PAGO).
 */
export const GATEWAY_META: Record<string, { label: string; color: string; emoji: string }> = {
  stripe:       { label: 'Stripe',       color: '#635BFF', emoji: '💳' },
  mercadopago:  { label: 'Mercado Pago', color: '#00B1EA', emoji: '🟦' },
  MERCADO_PAGO: { label: 'Mercado Pago', color: '#00B1EA', emoji: '🟦' },
  pix:          { label: 'PIX',          color: '#00D4FF', emoji: '💸' },
  PIX:          { label: 'PIX',          color: '#00D4FF', emoji: '💸' },
  paypal:       { label: 'PayPal',       color: '#003087', emoji: '🅿️' },
  PAYPAL:       { label: 'PayPal',       color: '#003087', emoji: '🅿️' },
  pagseguro:    { label: 'PagSeguro',    color: '#f97316', emoji: '🟧' },
  PAGSEGURO:    { label: 'PagSeguro',    color: '#f97316', emoji: '🟧' },
  manual:       { label: 'Manual',       color: '#929AA5', emoji: '📝' },
}

/** Helper: retorna metadados do gateway com fallback seguro */
export function getGatewayMeta(code: string) {
  return GATEWAY_META[code] ?? { label: code, color: '#929AA5', emoji: '💳' }
}

// ── Status de Assinatura ─────────────────────────────────────────────────────

/** Labels e classes Tailwind de cor por status de assinatura */
export const SUBSCRIPTION_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE:            { label: 'Ativo',                     color: 'text-[#2EBD85]' },
  TRIAL:             { label: 'Trial',                     color: 'text-[#F0B90B]' },
  CANCELLATION_LOCK: { label: 'Cancelamento em andamento', color: 'text-[#F0B90B]' },
  PAST_DUE:          { label: 'Pagamento pendente',        color: 'text-[#F6465D]' },
  CANCELLED:         { label: 'Cancelado',                 color: 'text-[#929AA5]' },
  EXPIRED:           { label: 'Expirado',                  color: 'text-[#929AA5]' },
}
