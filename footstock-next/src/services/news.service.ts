// TODO: Implementar via /auto-flow execute

export class NewsService {
  async findAll(_options: { ticker?: string; impactCategory?: string; page?: number; limit?: number }): Promise<unknown[]> {
    return []
  }
}

export const newsService = new NewsService()
