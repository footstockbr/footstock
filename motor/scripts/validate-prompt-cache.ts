// Validacao controlada do prompt caching do NewsClassifier contra a API real.
// Faz 3 chamadas com prefixo estatico identico (>= gate 1024 tok) e inspeciona
// cache_creation_input_tokens (1a chamada) vs cache_read_input_tokens (2a/3a).
// Uso: npx ts-node scripts/validate-prompt-cache.ts
// NAO faz parte do build (scripts/ fora de rootDir). Roda ad-hoc.

import { NewsClassifier } from '../src/news/NewsClassifier'
import type { RawNewsItem } from '../src/news/NewsQueue'

// Redis stub em memoria: so precisa de exists/set/decr/incr para o token bucket.
class FakeRedis {
  private store = new Map<string, number>()
  async exists(k: string) { return this.store.has(k) ? 1 : 0 }
  async set(k: string, v: number) { this.store.set(k, Number(v)); return 'OK' }
  async decr(k: string) { const n = (this.store.get(k) ?? 0) - 1; this.store.set(k, n); return n }
  async incr(k: string) { const n = (this.store.get(k) ?? 0) + 1; this.store.set(k, n); return n }
}

// Mapa de tickers realista (40 ativos x ~4-6 aliases) para o prefixo estatico
// cruzar o gate de 1024 tokens, replicando o tamanho de producao sem precisar
// do Prisma/DB. Sem isso o prefixo fica pequeno e o cache nem engata.
const REAL_TICKERS = [
  'URU3', 'POR3', 'FOG3', 'TFN3', 'GUE3', 'TOR3', 'LEM3', 'BAL3', 'FUR3', 'VOA3',
  'CON3', 'LEA3', 'LEB3', 'COE3', 'CAV3', 'DRA3', 'LDI3', 'PAN3', 'VOZ3', 'GAP3',
  'TIG3', 'DOU3', 'LEP3', 'PER3', 'IND3', 'TUB3', 'NAF3', 'TIV3', 'FAS3', 'MAC3',
  'ABT3', 'LEI3', 'TIS3', 'GAV3', 'ESM4', 'VER3', 'TIM4', 'COL3', 'MEN4', 'RAP3',
]
const ALIASES = ['clube', 'time', 'equipe', 'agremiacao', 'esquadrao', 'tricolor']
const tickerMapLine = REAL_TICKERS
  .map((t) => `${t}=${ALIASES.join(',')}`)
  .join(' | ')

const ITEMS: RawNewsItem[] = [
  { url: 'https://x/1', title: 'Urubu da Gavea FC anuncia novo tecnico para a proxima temporada', description: 'Diretoria fecha contrato apos reuniao', source: 'ESPN', publishedAt: new Date().toISOString() },
  { url: 'https://x/2', title: 'Porco Alviverde vence classico e assume lideranca do campeonato', description: 'Vitoria por 2 a 0 fora de casa', source: 'GloboEsporte', publishedAt: new Date().toISOString() },
  { url: 'https://x/3', title: 'Lesao de craque preocupa torcida do Urubu da Gavea FC antes da final', description: 'Departamento medico avalia', source: 'Lance', publishedAt: new Date().toISOString() },
]

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY ausente no ambiente. Abortando.')
    process.exit(1)
  }
  console.log(`[validate] cache_mode=${process.env.NEWS_CLASSIFIER_PROMPT_CACHE ?? '1h(default)'} format=${process.env.NEWS_CLASSIFIER_PROMPT_FORMAT ?? 'split(default)'}`)

  const redis = new FakeRedis() as unknown as import('ioredis').default
  const classifier = new NewsClassifier(redis)

  // Injeta o mapa realista direto (sem Prisma) e recomputa o prefixo + gate.
  const internal = classifier as unknown as {
    tickerMapLine: string
    rebuildStaticPrefix: () => Promise<void>
    staticPrefix: string
    cacheEligible: boolean
  }
  internal.tickerMapLine = tickerMapLine
  await internal.rebuildStaticPrefix()
  console.log(`[validate] prefixo estatico: ${internal.staticPrefix.length} chars, cacheEligible=${internal.cacheEligible}`)

  for (let i = 0; i < ITEMS.length; i++) {
    console.log(`\n[validate] ===== Chamada ${i + 1} =====`)
    const res = await classifier.classify(ITEMS[i])
    console.log(`[validate] resultado: ${JSON.stringify(res)}`)
  }

  console.log('\n[validate] Concluido. Procure as linhas [NewsClassifier.metrics] acima:')
  console.log('[validate]   - 1a chamada deve ter cache_creation_input_tokens > 0, cache_read = 0')
  console.log('[validate]   - 2a/3a chamada devem ter cache_read_input_tokens > 0 (cache_hit=true)')
}

main().catch((e) => { console.error(e); process.exit(1) })
