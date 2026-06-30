// Orquestracao pura dos DOIS efeitos canonicos de pausar/retomar o motor inteiro,
// extraida de MotorPageClient para permitir teste em ambiente node (sem DOM) e
// para tornar observavel o gate de aceite da Task 009 (loop 06-29): pausar exige
// efeito B (bloquear ordens via global-halt) E efeito C (HALT_ALL no market) — a
// UI nunca pode pausar so com B. A reconciliacao (GET global-halt) e o estado da
// UI permanecem no componente; aqui fica apenas a sequencia de rede + decisao.
//
// Pausar  = B (POST global-halt) -> C (HALT_ALL no market).
// Retomar = C (RESUME_ALL no market) -> B (DELETE global-halt), para nunca abrir
// janela em que ordens entrem com o motor ainda em transicao.

import type { GlobalHaltFlow } from '@/lib/utils/global-halt-confirm'

export type OrchestratorFetch = typeof fetch

export interface GlobalHaltOutcome {
  // Mensagem de erro fail-loud (canal unico admin-motor-pause-error); null = sucesso.
  error: string | null
  // RESUME_ALL preserva suspensoes de circuit breaker — quando o fluxo de retomada
  // confirma os dois efeitos, o componente le os KPIs para sinalizar CB preservado.
  checkCbPreserved: boolean
}

// Sucesso confirmado apenas em respostas 2xx COM success=true no corpo. Qualquer
// outro status (429, 4xx, 5xx) e falha explicita (criterio de aceite 4).
function isConfirmed(res: Response, body: { success?: boolean } | null): boolean {
  return res.ok && body?.success === true
}

async function readBody(res: Response): Promise<{ success?: boolean } | null> {
  return res.json().catch(() => null)
}

export async function orchestrateGlobalHalt(
  flow: GlobalHaltFlow,
  reason: string,
  fetchFn: OrchestratorFetch
): Promise<GlobalHaltOutcome> {
  const isResuming = flow === 'resume'

  try {
    if (!isResuming) {
      // PAUSAR — efeito B antes de C.
      const haltRes = await fetchFn('/api/v1/admin/motor/global-halt', {
        method: 'POST',
        credentials: 'include',
      })
      const haltBody = await readBody(haltRes)
      if (!isConfirmed(haltRes, haltBody)) {
        return {
          error: 'Falha ao bloquear novas ordens. O motor não foi pausado; estado reconciliado pelo servidor.',
          checkCbPreserved: false,
        }
      }
      // Efeito C — pausa duravel do motor real (HALT_ALL, contrato duravel da Task 003).
      const marketRes = await fetchFn('/api/v1/admin/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'HALT_ALL', reason }),
      })
      const marketBody = await readBody(marketRes)
      if (!isConfirmed(marketRes, marketBody)) {
        return {
          error:
            marketRes.status === 429
              ? 'Ordens bloqueadas, mas o limite de ações por minuto impediu pausar o motor. Tente novamente em instantes.'
              : 'Ordens bloqueadas, mas o motor real não confirmou a pausa. Estado reconciliado pelo servidor.',
          checkCbPreserved: false,
        }
      }
      // Ambos confirmaram.
      return { error: null, checkCbPreserved: false }
    }

    // RETOMAR — efeito C antes de B.
    const marketRes = await fetchFn('/api/v1/admin/market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type: 'RESUME_ALL', reason }),
    })
    const marketBody = await readBody(marketRes)
    if (!isConfirmed(marketRes, marketBody)) {
      return {
        error:
          marketRes.status === 429
            ? 'Limite de ações por minuto atingido. As ordens seguem bloqueadas; tente novamente em instantes.'
            : 'Falha ao retomar o motor. As ordens seguem bloqueadas; estado reconciliado pelo servidor.',
        checkCbPreserved: false,
      }
    }
    // Efeito B — libera ordens.
    const haltRes = await fetchFn('/api/v1/admin/motor/global-halt', {
      method: 'DELETE',
      credentials: 'include',
    })
    const haltBody = await readBody(haltRes)
    if (!isConfirmed(haltRes, haltBody)) {
      return {
        error: 'Motor retomado, mas a liberação de ordens não confirmou. Estado reconciliado pelo servidor.',
        checkCbPreserved: false,
      }
    }
    // Ambos confirmaram: o componente le os KPIs para sinalizar CB preservado.
    return { error: null, checkCbPreserved: true }
  } catch {
    return {
      error: 'Erro de rede ao orquestrar a ação. O estado exibido foi reconciliado pelo servidor.',
      checkCbPreserved: false,
    }
  }
}
