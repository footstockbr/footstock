// RSSFeedParser — Parser de feeds RSS para o motor de notícias

export interface ParsedArticle {
  title: string
  link: string
  pubDate: Date
  source: string
  content: string
  guid: string
}

export class RSSFeedParser {
  /**
   * Faz parse de XML RSS para array de artigos normalizados
   */
  parse(xml: string, sourceName: string): ParsedArticle[] {
    const articles: ParsedArticle[] = []

    // Regex simples para extrair items sem dependência de DOM parser
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    const items = [...xml.matchAll(itemRegex)]

    for (const item of items) {
      const content = item[1]

      const title = this.extractTag(content, 'title') ?? ''
      const link = this.extractTag(content, 'link') ?? ''
      const pubDateStr = this.extractTag(content, 'pubDate') ?? ''
      const description = this.extractTag(content, 'description') ?? ''
      const guid = this.extractTag(content, 'guid') ?? link

      if (!title || !link) continue

      articles.push({
        title: this.cleanText(title),
        link: link.trim(),
        pubDate: pubDateStr ? new Date(pubDateStr) : new Date(),
        source: sourceName,
        content: this.cleanText(description),
        guid: guid.trim(),
      })
    }

    return articles
  }

  private extractTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`, 'i'))
    return match?.[1]?.trim() ?? null
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]+>/g, '') // remove HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  /**
   * Remove artigos duplicados por URL/guid
   */
  deduplicate(articles: ParsedArticle[]): ParsedArticle[] {
    const seen = new Set<string>()
    return articles.filter((a) => {
      if (seen.has(a.guid)) return false
      seen.add(a.guid)
      return true
    })
  }
}
