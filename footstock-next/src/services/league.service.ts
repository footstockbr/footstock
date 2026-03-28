// TODO: Implementar via /auto-flow execute

export class LeagueService {
  async findAll(_options: { type?: string; status?: string; page?: number; limit?: number }): Promise<unknown[]> {
    return []
  }

  async findById(_leagueId: string): Promise<unknown | null> {
    return null
  }

  async create(_userId: string, _data: unknown): Promise<unknown> {
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async join(_leagueId: string, _userId: string): Promise<void> {
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async getRanking(_leagueId: string): Promise<unknown[]> {
    return []
  }
}

export const leagueService = new LeagueService()
