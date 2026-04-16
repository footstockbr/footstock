// ============================================================================
// FootStock — retryWithBackoff
// Utilitário de retry com exponential backoff para erros transitórios.
// Rastreabilidade: T-032 / Locking Otimista
// ============================================================================

export class ConcurrentUpdateError extends Error {
  readonly code = 'CONCURRENT_UPDATE'
  readonly statusCode = 409

  constructor(message = 'Conflito de concorrência. Recarregue e tente novamente.') {
    super(message)
    this.name = 'ConcurrentUpdateError'
  }
}

export class InsufficientBalanceError extends Error {
  readonly code = 'INSUFFICIENT_BALANCE'
  readonly statusCode = 402

  constructor(message = 'Saldo FS$ insuficiente para realizar a operação.') {
    super(message)
    this.name = 'InsufficientBalanceError'
  }
}

export interface RetryOptions {
  /** Número máximo de tentativas (incluindo a primeira). Default: 3 */
  maxAttempts?: number
  /** Delays em ms entre tentativas. Tamanho define quantas retries além da 1ª. Default: [50, 100, 200] */
  delays?: number[]
  /**
   * Predicado que determina se o erro é retryable.
   * Se retornar false, o erro é propagado imediatamente (sem mais tentativas).
   */
  isRetryable?: (err: unknown) => boolean
  /** Contexto para logging (ex: orderId, userId). */
  context?: Record<string, unknown>
}

const DEFAULT_DELAYS = [50, 100, 200]
/** Tentativas totais padrão: 1 inicial + 2 retries = 3. Alinhado com a spec T-032. */
const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Executa `fn` com retry em erros transitórios.
 *
 * - Por padrão, só faz retry em `ConcurrentUpdateError`.
 * - `InsufficientBalanceError` e outros erros não transitórios são propagados imediatamente.
 * - Após esgotar as tentativas (padrão: 3), propaga o último erro.
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => userService.deductBalance(userId, amount),
 *   { context: { userId, orderId } }
 * )
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const delays = options.delays ?? DEFAULT_DELAYS
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const isRetryable = options.isRetryable ?? ((err) => err instanceof ConcurrentUpdateError)
  const context = options.context ?? {}

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (!isRetryable(err)) {
        throw err
      }

      if (attempt >= maxAttempts) {
        // Esgotou tentativas — propagar
        break
      }

      const delay = delays[attempt - 1] ?? delays[delays.length - 1]
      console.warn('[retryWithBackoff] Tentativa %d/%d falhou. Aguardando %dms.', attempt, maxAttempts, delay, {
        ...context,
        errorCode: (err as ConcurrentUpdateError).code ?? 'UNKNOWN',
      })

      await sleep(delay)
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
