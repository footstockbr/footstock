// ============================================================================
// FootStock Motor — Nudge constants
// Decisao I7: garantir que nenhum ativo fique mais de 5 minutos sem variar.
// Apos NUDGE_TICKS ticks consecutivos sem mudanca de preco, injeta micro-choque
// de NUDGE_DELTA na direcao do fairValue. Reseta contador a cada movimento real.
// ============================================================================

// 150 ticks × 2s/tick = 300s = 5 minutos sem variacao -> dispara nudge.
export const NUDGE_TICKS = 150

// Magnitude do micro-choque: ±0.01 (porte do legacy FootStock-new2.jsx L1167-L1170).
export const NUDGE_DELTA = 0.01

// Preco minimo do motor — deve ser menor que o menor IPO B_ILLIQ (ABT3 = 2.65).
// NAO usar como piso do preco publicado: R$1 e uma ANCORA ECONOMICA, nao uma
// protecao numerica. Aplicar este valor como floor do preco distorce o retorno de
// ativos sub-R$1 (um ativo a R$0,50 era catapultado a R$1 -> retorno artificial).
// Hoje NUDGE_MIN_PRICE permanece apenas como referencia de deteccao do floor legado
// na auto-recovery de warm-start (MarketEngine: dbPrice <= NUDGE_MIN_PRICE * 1.5),
// onde o sentido E justamente "preso historicamente na ancora R$1".
export const NUDGE_MIN_PRICE = 1.0

// PRICE_EPSILON — piso PURAMENTE NUMERICO do preco publicado (Task T4.5).
// Separa a protecao numerica (impedir preco <= 0 -> divisao por zero / underflow em
// retornos delta/preco) da ancora economica (R$1). Valor = 0.01 (1 centavo): o menor
// preco representavel em BRL com 2 casas. Por sobreviver ao arredondamento a 2 casas,
// garante preco SEMPRE estritamente positivo (>= 0.01) mesmo apos toFixed(2), eliminando
// qualquer reintroducao de divisao por zero. Ativos sub-R$1 (R$0,02 .. R$0,99) fluem sem
// distorcao: o piso so atua como rede numerica, nunca como ancora de retorno.
export const PRICE_EPSILON = 0.01

// ----------------------------------------------------------------------------
// Tolerancia do criterio de inatividade (Task T4.4).
//
// Substitui a antiga igualdade a 2 casas decimais por uma tolerancia
// percentual/absoluta: um delta dentro da tolerancia conta como ESTAVEL
// (alimenta o contador de inatividade), e acima da tolerancia conta como
// MOVIMENTO REAL (reseta o contador).
//
//   limiar = max(NUDGE_TOL_PCT * |referencia|, NUDGE_TOL_ABS)   (o MAIOR, nunca a soma)
//
// Default behavior-preserving: AMBAS as tolerancias = 0, o que mantem o criterio
// na igualdade estrita a 2 casas anterior (byte-identico ao motor legado, sem
// drift no golden baseline). A tolerancia e um mecanismo ATIVAVEL via config:
// elevar NUDGE_TOL_ABS e/ou NUDGE_TOL_PCT acima de zero passa a absorver ruido
// de centavos sem tocar no restante do pipeline do nudge. Trocar estes defaults
// e uma decisao de comportamento de mercado (exige regenerar o golden baseline),
// nao um efeito colateral deste criterio.
export const NUDGE_TOL_PCT = 0.0
export const NUDGE_TOL_ABS = 0.0

/** Classificacao do movimento de preco para o criterio de inatividade do nudge. */
export type NudgeMoveClass = 'invalid' | 'moved' | 'stable'

/**
 * Decide, a partir de um delta de preco, se o ativo MOVEU de fato (acima do
 * ruido) ou permaneceu ESTAVEL dentro da tolerancia. Pura e deterministica.
 *
 * Criterio canonico (Task T4.4):
 *   - limiar = max(tolPct * |referencia|, tolAbs)  -> o MAIOR, nunca a soma.
 *   - |delta| <= limiar            -> 'stable' (dentro da tolerancia; conta inatividade).
 *   - |delta| >  limiar            -> 'moved'  (movimento real; reseta contador).
 *   - limiar == 0 (ambas tols 0)   -> igualdade estrita a 2 casas (comportamento legado).
 *   - entrada nao-finita (NaN/null/undefined) em qualquer argumento
 *                                  -> 'invalid' (o chamador deve abortar o nudge
 *                                     defensivamente, sem disparo silencioso).
 *
 * Nunca lanca excecao: entrada invalida vira o sentinel 'invalid'.
 */
export function classifyNudgeMove(
  delta: number,
  referencia: number,
  tolPct: number = NUDGE_TOL_PCT,
  tolAbs: number = NUDGE_TOL_ABS,
): NudgeMoveClass {
  // Defensivo: qualquer argumento nao-finito (NaN, Infinity, null, undefined) aborta.
  if (![delta, referencia, tolPct, tolAbs].every((v) => Number.isFinite(v))) {
    return 'invalid'
  }

  const threshold = Math.max(tolPct * Math.abs(referencia), tolAbs)

  if (threshold <= 0) {
    // Tolerancia desativada: igualdade estrita a 2 casas (legado).
    const moved = +(referencia + delta).toFixed(2) !== +referencia.toFixed(2)
    return moved ? 'moved' : 'stable'
  }

  return Math.abs(delta) > threshold ? 'moved' : 'stable'
}
