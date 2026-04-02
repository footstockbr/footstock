// Configuração de feeds RSS para o motor de notícias

export interface FeedConfig {
  name: string
  url: string
  language: 'pt-BR'
  category: 'sports' | 'football' | 'general'
  pollingIntervalMs: number
}

export const RSS_FEEDS: FeedConfig[] = [
  {
    name: 'ESPN Brasil',
    url: 'https://www.espn.com.br/espn/rss/futebol/noticias',
    language: 'pt-BR',
    category: 'football',
    pollingIntervalMs: 5 * 60 * 1000, // 5 min
  },
  {
    name: 'Globo Esporte',
    url: 'https://globoesporte.globo.com/rss/futebol/',
    language: 'pt-BR',
    category: 'football',
    pollingIntervalMs: 5 * 60 * 1000,
  },
  {
    name: 'Lance!',
    url: 'https://www.lance.com.br/rss.xml',
    language: 'pt-BR',
    category: 'sports',
    pollingIntervalMs: 5 * 60 * 1000,
  },
]
