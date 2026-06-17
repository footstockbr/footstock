// ============================================================================
// FootStock Motor — Cron Job: classify-news-sentiment (item 15)
// Proxy HTTP para footstock-next/src/app/api/cron/classify-news-sentiment/route.ts.
// Classifica via LLM as noticias ainda nao classificadas (forward + backfill gradual).
// Schedule: */15 * * * * (a cada 15 min). No-op quando nao ha noticia pendente.
// ============================================================================

import { cronProxy } from '../cronProxy'

export async function classifyNewsSentimentJob(): Promise<void> {
  // failOnBodyErrors:false — falhas transitorias de LLM (timeout/parse) sao toleradas e
  // re-tentadas na proxima rodada; nao devem marcar o scheduler como vermelho.
  await cronProxy('classify-news-sentiment', { failOnBodyErrors: false })
}
