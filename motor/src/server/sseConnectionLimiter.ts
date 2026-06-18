// ============================================================================
// SSE connection limiter (S6 — 06-18)
// Cap GLOBAL de conexoes SSE abertas (market + news combinados). Cada conexao
// abre um subscriber Redis + heartbeat; sem cap, um cliente abusivo (ou um bug de
// reconexao) pode exaurir conexoes Redis e file descriptors do processo.
// Cap via MOTOR_MAX_SSE_CONNECTIONS (default 5000). Acquire/release devem ser
// pareados pelo handler (acquire antes do writeHead 200; release no cleanup unico).
// ============================================================================

const MAX_SSE_CONNECTIONS = (() => {
  const n = parseInt(process.env.MOTOR_MAX_SSE_CONNECTIONS ?? '5000', 10)
  return Number.isFinite(n) && n > 0 ? n : 5000
})()

let active = 0

/** Reserva um slot. Retorna false se o cap global ja foi atingido (handler deve 429). */
export function tryAcquireSseSlot(): boolean {
  if (active >= MAX_SSE_CONNECTIONS) return false
  active += 1
  return true
}

/** Libera um slot previamente adquirido. Idempotente contra underflow. */
export function releaseSseSlot(): void {
  active = active > 0 ? active - 1 : 0
}

export function activeSseConnections(): number {
  return active
}

export { MAX_SSE_CONNECTIONS }
