// ============================================================================
// FootStock — Frescor do tick do motor (fonte unica)
//
// Antes deste modulo existiam TRES limiares independentes para a mesma pergunta
// ("o motor esta vivo?"), com valores diferentes:
//   - middleware/motorOnlineCheck.ts .............. 10s
//   - app/api/v1/health/motor/route.ts ............ 10s
//   - services/OrderService.ts (MOTOR_TICK_STALE_S) 30s
//
// O motor publica heartbeat a cada 10s e o front pergunta a cada 10s. Com um
// limiar tambem de 10s, os tres periodos batem: qualquer atraso de rede, GC ou
// jitter do scheduler joga a idade do tick para o outro lado da linha e o
// usuario ve "motor offline" com o motor rodando normalmente. A margem real
// medida no incidente de 2026-09-02 era de ~0.09s no pior caso.
//
// 25s = 2 heartbeats perdidos + folga. Detecta motor morto em menos de meio
// minuto e nao confunde jitter com queda. Fica abaixo do TTL das chaves de
// heartbeat (HEARTBEAT_TTL_S = 60s no motor), entao a deteccao continua vindo
// do limiar, nunca da expiracao da chave.
//
// Todo consumidor de "o tick esta fresco?" no web DEVE importar daqui.
// ============================================================================

/** Limiar default, em segundos, para considerar o ultimo tick ainda valido. */
export const DEFAULT_TICK_STALE_S = 25

/** Piso e teto de sanidade para o override por ambiente. */
export const MIN_TICK_STALE_S = 1
export const MAX_TICK_STALE_S = 60

/** Nome da variavel de ambiente que sobrescreve o limiar. */
export const TICK_STALE_ENV_KEY = 'MOTOR_TICK_STALE_S'

let warnedAboutInvalidEnv = false

/**
 * Resolve o limiar de frescor.
 *
 * Usa Number() e nao parseInt(): parseInt('25s') devolve 25 silenciosamente e
 * parseInt('') devolve NaN — os dois escondem um valor mal configurado. Number()
 * so aceita um numero inteiro; qualquer outra coisa cai no default com um aviso
 * emitido uma unica vez (o limiar e consultado a cada ordem criada e a cada
 * request de health; avisar sempre inundaria o log).
 */
export function getTickStaleThresholdS(): number {
  const raw = process.env[TICK_STALE_ENV_KEY]
  if (raw === undefined || raw.trim() === '') return DEFAULT_TICK_STALE_S

  const parsed = Number(raw)
  const valid =
    Number.isInteger(parsed) && parsed >= MIN_TICK_STALE_S && parsed <= MAX_TICK_STALE_S

  if (!valid) {
    if (!warnedAboutInvalidEnv) {
      warnedAboutInvalidEnv = true
      console.warn(
        `[tick-freshness] ${TICK_STALE_ENV_KEY}=${JSON.stringify(raw)} invalido ` +
          `(esperado inteiro entre ${MIN_TICK_STALE_S} e ${MAX_TICK_STALE_S}); ` +
          `usando o default de ${DEFAULT_TICK_STALE_S}s.`
      )
    }
    return DEFAULT_TICK_STALE_S
  }

  return parsed
}

/**
 * Decide se um tick com `ageS` segundos de idade ainda conta como fresco.
 *
 * Idade nao-finita (NaN de um parse que falhou, Infinity) e tratada como NAO
 * fresca: um timestamp ilegivel no Redis e indistinguivel de motor morto e o
 * lado seguro e o pessimista.
 */
export function isTickFresh(ageS: number, thresholdS: number = getTickStaleThresholdS()): boolean {
  if (!Number.isFinite(ageS)) return false
  return ageS <= thresholdS
}

/** Apenas para testes: zera a trava do aviso de env invalida. */
export function __resetTickFreshnessWarning(): void {
  warnedAboutInvalidEnv = false
}
