// RegionalCorrelation — Correlação entre clubes do mesmo estado
// Aplicado após L5_KyleLambda, antes de VelocityCap

/** Mapa estado → tickers */
const STATE_CLUBS: Record<string, string[]> = {
  RJ: ['FLA', 'VAS', 'BOT', 'FLU'],
  SP: ['COR', 'PAL', 'SAO', 'SAN', 'SPA', 'PON'],
  RS: ['GRE', 'INT'],
  MG: ['ATH_MG', 'CAM', 'CRU', 'AME'],
  PR: ['ATH', 'CFC'],
  BA: ['BAH', 'VIT'],
  CE: ['FOR', 'CEC'],
}

/** Rivalidade especial (aumenta correlação) */
const RIVALRY_BOOST: Record<string, number> = {
  'FLA-VAS': 0.15,
  'VAS-FLA': 0.15,
  'COR-PAL': 0.20,
  'PAL-COR': 0.20,
  'GRE-INT': 0.18,
  'INT-GRE': 0.18,
  'CAM-CRU': 0.15,
  'CRU-CAM': 0.15,
}

/** Base de correlação regional */
const BASE_RHO = 0.3

/** Duração do efeito em ticks */
const DECAY_TICKS = 10

interface CorrelationEffect {
  delta: number
  remainingTicks: number
}

export class RegionalCorrelation {
  private effects: Map<string, CorrelationEffect[]> = new Map()

  /** Retorna tickers do mesmo estado que o ativo fornecido */
  private getPeers(ticker: string): string[] {
    for (const [, tickers] of Object.entries(STATE_CLUBS)) {
      if (tickers.includes(ticker)) {
        return tickers.filter((t) => t !== ticker)
      }
    }
    return []
  }

  /** Calcula rho para um par de ativos */
  private getRho(ticker: string, peer: string): number {
    const key = `${ticker}-${peer}`
    return BASE_RHO + (RIVALRY_BOOST[key] ?? 0)
  }

  /**
   * Aplica correlação regional quando um ativo se move
   * @param ticker ativo que se moveu
   * @param delta variação de preço (normalizada)
   * @returns deltas adicionais para ativos correlacionados
   */
  apply(ticker: string, delta: number): Record<string, number> {
    const peers = this.getPeers(ticker)
    const result: Record<string, number> = {}

    for (const peer of peers) {
      const rho = this.getRho(ticker, peer)
      const correlatedDelta = delta * rho

      // Acumular efeito com decaimento
      const existing = this.effects.get(peer) ?? []
      existing.push({ delta: correlatedDelta, remainingTicks: DECAY_TICKS })
      this.effects.set(peer, existing)

      result[peer] = correlatedDelta
    }

    return result
  }

  /** Avança um tick e aplica decaimento */
  tick(): void {
    for (const [ticker, effects] of this.effects.entries()) {
      const remaining = effects
        .map((e) => ({ ...e, remainingTicks: e.remainingTicks - 1 }))
        .filter((e) => e.remainingTicks > 0)

      if (remaining.length === 0) {
        this.effects.delete(ticker)
      } else {
        this.effects.set(ticker, remaining)
      }
    }
  }

  /** Efeito acumulado pendente para um ticker */
  getPendingEffect(ticker: string): number {
    const effects = this.effects.get(ticker) ?? []
    return effects.reduce((sum, e) => sum + e.delta, 0)
  }
}
