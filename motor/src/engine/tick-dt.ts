// ============================================================================
// FootStock Motor — Escala temporal do tick (DT) — resolução EXPLÍCITA
// (loop 06-17-motor-footstock-correcoes-variacoes / T3.3)
//
// Fonte ÚNICA da verdade do `dt` consumido por L1_OU, L2_Anchor, L3_GARCH e
// pelo tickDebug. Substitui o `parseFloat(process.env.MOTOR_TICK_DT_SECONDS ?? '1')`
// espalhado em 4 arquivos, que tornava o default 1.0 um ACIDENTE silencioso
// (Bug 1 do diagnóstico: env vazia => dt=1.0 => ruído de √dt inflado na abertura).
//
// Regra: o DT é sempre EXPLÍCITO e AUDITÁVEL. A resolução tem 3 fontes, nesta
// ordem de precedência, e cada uma carrega um rótulo `source` para log/auditoria:
//
//   1. `MOTOR_TICK_DT_SECONDS` (override explícito do operador) — qualquer valor
//      finito > 0. Valor inválido (não-finito, <= 0, lixo) é REJEITADO de forma
//      determinística (T3.4): NÃO derruba o motor (sem fail-fast que bloqueia
//      startup por env mal configurada) e NÃO segue silencioso. Emite um warn
//      ESTRUTURADO e cai no fallback de precedência (flag de recalibração, depois
//      default-safe legacy), resolvendo sempre num DT válido. O override inválido
//      jamais é usado e jamais passa despercebido.
//   2. `MOTOR_TICK_DT_FORMAL_RECALIBRATION=true` — alternativa DT=1.0 atrás de
//      flag. É a "recalibração formal": exige re-tunar sigma/cap por camada para
//      o passo unitário. Default OFF; só liga quando o quant ratificar.
//   3. DEFAULT-SAFE (nenhuma das acima) — replica a calibração legacy: o legacy
//      usava dt=1/390 num tick de 2s; produção hoje bate a 10s (5× mais lento),
//      então o dt por tick consistente com o legacy é 1/390 × (10/2) = 5/390.
//      Mantém o acúmulo de variância por tempo-de-parede igual ao legacy sem
//      mexer no sigma já calibrado das camadas.
//
// Decisão PENDENTE (não bloqueia o loop): ratificar "replicar legacy (5/390)" vs
// "recalibrar formalmente para DT=1" (donos: operador técnico + quant). Este
// módulo entrega o default-safe + a flag; trocar de lado é configuração, não
// reimplementação.
// ============================================================================

/**
 * DEFAULT-SAFE: dt legacy (1/390 por tick de 2s) ajustado ao tick de 10s de
 * produção (× 10/2 = 5). Documentado e auditável; NUNCA um default acidental.
 * 5 / 390 = 1 / 78 ≈ 0.0128205.
 */
export const MOTOR_TICK_DT_LEGACY_DEFAULT = 5 / 390

/**
 * Alternativa atrás de flag (`MOTOR_TICK_DT_FORMAL_RECALIBRATION=true`): passo
 * unitário. Exige recalibração formal de sigma/cap por camada antes de virar
 * default. Mantido explícito para o A/B do quant.
 */
export const MOTOR_TICK_DT_FORMAL_RECALIBRATION = 1.0

/**
 * Rótulo da fonte que resolveu o DT — para log estruturado e auditoria.
 * `invalid-env-fallback` (T3.4): `MOTOR_TICK_DT_SECONDS` foi fornecido mas é
 * inválido; o override foi rejeitado (com warn) e o valor veio do fallback de
 * precedência. Estado de primeira classe para auditoria determinística.
 */
export type DtSource =
  | 'explicit-env'
  | 'formal-recalibration-flag'
  | 'legacy-default-safe'
  | 'invalid-env-fallback'

export interface DtResolution {
  /** DT efetivo (segundos de pregão normalizados por tick), sempre finito > 0. */
  value: number
  /** De onde veio o valor (precedência aplicada). */
  source: DtSource
  /**
   * Presente SÓ no caminho de rejeição (T3.4): o valor cru de
   * `MOTOR_TICK_DT_SECONDS` que foi rejeitado por ser inválido. Ausente no
   * caminho feliz. Carrega o ofensor para auditoria sem mascarar o erro.
   */
  rejectedEnvValue?: string
}

/**
 * Memória de valores crus já avisados, por valor distinto, para que um env
 * persistentemente inválido (lido a cada tick por L1/L2/L3/tickDebug) avise UMA
 * vez por valor e não vire spam de log. Loud-once, não silencioso, não spam.
 */
const warnedInvalidRawValues = new Set<string>()

/** Reset do dedupe de warns — uso exclusivo de testes para isolamento. */
export function __resetTickDtWarnings(): void {
  warnedInvalidRawValues.clear()
}

/** Resolve o DT a partir do resto da precedência (flag de recalibração, depois default-safe). */
function resolveFromFlagOrDefault(envObj: NodeJS.ProcessEnv): DtResolution {
  if (envObj.MOTOR_TICK_DT_FORMAL_RECALIBRATION === 'true') {
    return { value: MOTOR_TICK_DT_FORMAL_RECALIBRATION, source: 'formal-recalibration-flag' }
  }
  return { value: MOTOR_TICK_DT_LEGACY_DEFAULT, source: 'legacy-default-safe' }
}

/**
 * Resolve o DT do tick de forma EXPLÍCITA e auditável a partir de um env.
 * Quando `MOTOR_TICK_DT_SECONDS` está presente mas inválido (não-finito, <= 0,
 * lixo), REJEITA de forma determinística (T3.4): emite um warn estruturado e cai
 * no fallback de precedência, retornando `source: 'invalid-env-fallback'` com o
 * `rejectedEnvValue`. Nunca usa o valor inválido e nunca segue em silêncio; não
 * lança (env mal configurada não derruba o motor).
 */
export function resolveTickDt(envObj: NodeJS.ProcessEnv = process.env): DtResolution {
  const raw = envObj.MOTOR_TICK_DT_SECONDS
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) {
      return { value: parsed, source: 'explicit-env' }
    }
    // T3.4: override presente mas inválido. Fallback determinístico + warn.
    const fallback = resolveFromFlagOrDefault(envObj)
    if (!warnedInvalidRawValues.has(raw)) {
      warnedInvalidRawValues.add(raw)
      console.warn(
        `[motor:tick-dt] MOTOR_TICK_DT_SECONDS inválido: "${raw}" ` +
          `(esperado número finito > 0). Override IGNORADO; usando dt=${fallback.value} ` +
          `(fallback: ${fallback.source}). Corrija ou remova a variável; ` +
          `DT inválido nunca é usado e nunca passa silencioso (T3.4).`,
      )
    }
    return { value: fallback.value, source: 'invalid-env-fallback', rejectedEnvValue: raw }
  }

  return resolveFromFlagOrDefault(envObj)
}

/**
 * DT efetivo (apenas o número). Lido dinamicamente a cada chamada para que o
 * harness/testes possam fixar `MOTOR_TICK_DT_SECONDS` por execução sem depender
 * da ordem de import (o antigo const de module-scope congelava o valor).
 */
export function getTickDt(envObj: NodeJS.ProcessEnv = process.env): number {
  return resolveTickDt(envObj).value
}
