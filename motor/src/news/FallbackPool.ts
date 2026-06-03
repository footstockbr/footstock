// ============================================================================
// FootStock Motor — FallbackPool
// Pool de 20 notícias estáticas cobrindo ≥10 tickers.
// Ativado quando feeds RSS estão offline > 15min.
// Rastreabilidade: INT-046, INT-048
// ============================================================================

import type Redis from 'ioredis'
import type { RawNewsItem } from './NewsQueue'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

// ---------------------------------------------------------------------------
// Pool estático (20 notícias, ≥10 tickers distintos)
// ---------------------------------------------------------------------------

const FALLBACK_POOL: RawNewsItem[] = [
  {
    url: 'https://ge.globo.com/futebol/noticia/placeholder-uru3-001',
    title: '[URU3] Urubu da Gavea goleia rival e assume liderança',
    description: 'Ativo URU3 reage com forte pressão compradora após vitória expressiva.',
    source: 'Globo Esporte',
    publishedAt: '2026-01-15T10:00:00.000Z',
  },
  {
    url: 'https://www.espnbrasil.com.br/futebol/noticia/placeholder-por3-001',
    title: '[POR3] Porco do Parque anuncia contratação de peso',
    description: 'Reforço ofensivo eleva expectativa de desempenho esportivo e financeiro.',
    source: 'ESPN Brasil',
    publishedAt: '2026-01-16T14:00:00.000Z',
  },
  {
    url: 'https://www.lance.com.br/noticia/placeholder-rap3-001',
    title: '[RAP3] Raposa do Mineirao perde capitão por lesão',
    description: 'Desfalque relevante aumenta incerteza de curto prazo para o ativo RAP3.',
    source: 'Lance!',
    publishedAt: '2026-01-17T09:00:00.000Z',
  },
  {
    url: 'https://ge.globo.com/futebol/noticia/placeholder-bal3-001',
    title: '[PEI3] Baleia da Vila sofre goleada e cai na tabela',
    description: 'Sequência negativa pressiona sentimento e aumenta volatilidade no papel.',
    source: 'Globo Esporte',
    publishedAt: '2026-01-18T20:00:00.000Z',
  },
  {
    url: 'https://www.espnbrasil.com.br/futebol/noticia/placeholder-imo3-001',
    title: '[IMO3] Imortal da Arena empata sem gols em jogo morno',
    description: 'Resultado neutro mantém investidores cautelosos no curto prazo.',
    source: 'ESPN Brasil',
    publishedAt: '2026-01-19T18:00:00.000Z',
  },
  {
    url: 'https://www.lance.com.br/noticia/placeholder-tim3-001',
    title: '[TIM3] Timao do Sao Jorge conquista título em virada dramática',
    description: 'Conquista relevante fortalece tese esportiva e impulsiona o sentimento.',
    source: 'Lance!',
    publishedAt: '2026-01-20T22:00:00.000Z',
  },
  {
    url: 'https://ge.globo.com/futebol/noticia/placeholder-col3-001',
    title: '[COL3] Colorado do Beira-Rio perde zagueiro por suspensão',
    description: 'Desfalque defensivo reduz expectativa de resultados nas próximas rodadas.',
    source: 'Globo Esporte',
    publishedAt: '2026-01-21T11:00:00.000Z',
  },
  {
    url: 'https://www.espnbrasil.com.br/futebol/noticia/placeholder-gal3-001',
    title: '[GAL3] Galo da Lagoinha vence no último lance e mantém invencibilidade',
    description: 'Resultado amplia confiança dos investidores no ativo GAL3.',
    source: 'ESPN Brasil',
    publishedAt: '2026-01-22T19:00:00.000Z',
  },
  {
    url: 'https://www.lance.com.br/noticia/placeholder-tri3-001',
    title: '[TRI3] Tricolor do Morumbi anuncia novo técnico internacional',
    description: 'Mudança no comando técnico aumenta expectativa de recuperação de performance.',
    source: 'Lance!',
    publishedAt: '2026-01-23T15:00:00.000Z',
  },
  {
    url: 'https://ge.globo.com/futebol/noticia/placeholder-dou3-001',
    title: '[CBA3] Dourado do Pantanal vende destaque para o exterior',
    description: 'Negócio melhora caixa e gera leitura positiva para fundamentos do clube.',
    source: 'Globo Esporte',
    publishedAt: '2026-01-24T12:00:00.000Z',
  },
  {
    url: 'https://www.espnbrasil.com.br/futebol/noticia/placeholder-uru3-002',
    title: '[URU3] Urubu da Gavea sofre derrota inesperada e gera pressão interna',
    description: 'Notícia negativa reduz apetite comprador e pode ampliar oscilações.',
    source: 'ESPN Brasil',
    publishedAt: '2026-01-25T22:00:00.000Z',
  },
  {
    url: 'https://www.lance.com.br/noticia/placeholder-por3-002',
    title: '[POR3] Porco do Parque vence clássico e confirma favoritismo',
    description: 'Sequência de bons resultados sustenta tendência de alta no ativo.',
    source: 'Lance!',
    publishedAt: '2026-01-26T17:00:00.000Z',
  },
  {
    url: 'https://ge.globo.com/futebol/noticia/placeholder-tri3-001',
    title: '[BMP3] Tricolor da Fonte Nova fecha reforço para o setor ofensivo',
    description: 'Movimento reforça elenco e melhora percepção de competitividade.',
    source: 'Globo Esporte',
    publishedAt: '2026-01-27T10:00:00.000Z',
  },
  {
    url: 'https://www.espnbrasil.com.br/futebol/noticia/placeholder-lep3-001',
    title: '[LEP3] Leao do Pici é eliminado precocemente em mata-mata',
    description: 'Queda em competição amplia risco esportivo no curto prazo.',
    source: 'ESPN Brasil',
    publishedAt: '2026-01-28T21:00:00.000Z',
  },
  {
    url: 'https://www.lance.com.br/noticia/placeholder-leb3-001',
    title: '[LEA3] Leao da Barra confirma permanência do artilheiro',
    description: 'Renovação fortalece continuidade tática e estabilidade de expectativas.',
    source: 'Lance!',
    publishedAt: '2026-01-29T13:00:00.000Z',
  },
  {
    url: 'https://ge.globo.com/futebol/noticia/placeholder-fog3-001',
    title: '[REG3] Estrela do General anuncia patrocínio máster recorde',
    description: 'Nova receita recorrente eleva potencial de valuation no médio prazo.',
    source: 'Globo Esporte',
    publishedAt: '2026-01-30T09:00:00.000Z',
  },
  {
    url: 'https://www.espnbrasil.com.br/futebol/noticia/placeholder-rap3-002',
    title: '[RAP3] Raposa do Mineirao vence clássico estadual e sobe na tabela',
    description: 'Vitória relevante gera melhora de sentimento e retomada de fluxo comprador.',
    source: 'ESPN Brasil',
    publishedAt: '2026-01-31T20:00:00.000Z',
  },
  {
    url: 'https://www.lance.com.br/noticia/placeholder-imo3-002',
    title: '[IMO3] Imortal da Arena perde atacante principal por lesão',
    description: 'Departamento médico confirma desfalque prolongado e pressão sobre resultados.',
    source: 'Lance!',
    publishedAt: '2026-02-01T11:00:00.000Z',
  },
  {
    url: 'https://ge.globo.com/futebol/noticia/placeholder-bal3-002',
    title: '[PEI3] Baleia da Vila anuncia novo patrocínio e plano financeiro',
    description: 'Reestruturação melhora perspectiva de caixa e reduz percepção de risco.',
    source: 'Globo Esporte',
    publishedAt: '2026-02-02T15:00:00.000Z',
  },
  {
    url: 'https://www.espnbrasil.com.br/futebol/noticia/placeholder-gal3-002',
    title: '[GAL3] Galo da Lagoinha conquista campeonato estadual de virada',
    description: 'Título reforça momentum esportivo e pode sustentar valorização do ativo.',
    source: 'ESPN Brasil',
    publishedAt: '2026-02-03T22:00:00.000Z',
  },
]

// ---------------------------------------------------------------------------
// Classe FallbackPool
// ---------------------------------------------------------------------------

export class FallbackPool {
  /** Retorna cópia do pool completo (20 itens) */
  static getAll(): RawNewsItem[] {
    return [...FALLBACK_POOL]
  }

  /**
   * Retorna `count` itens aleatórios via Fisher-Yates shuffle.
   * Se count > pool.length, retorna todos os itens disponíveis.
   */
  static getRandom(count: number = 5): RawNewsItem[] {
    const shuffled = [...FALLBACK_POOL]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, Math.min(count, shuffled.length))
  }

  /**
   * Verifica se o fallback deve ser ativado consultando news:last_fetch no Redis.
   * Fail-open: retorna true (ativar fallback) se Redis indisponível.
   */
  static async isActivated(redis: Redis): Promise<boolean> {
    try {
      const lastFetch = await redis.get('news:last_fetch')
      if (!lastFetch) return true // nunca buscou
      const elapsed = Date.now() - Number(lastFetch)
      return elapsed > FIFTEEN_MINUTES_MS
    } catch {
      return true // Redis indisponível — fail-open
    }
  }
}
