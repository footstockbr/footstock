// TODO: Implementar via /auto-flow execute

export class ForumService {
  async findAll(_options: { sort?: string; ticker?: string; page?: number; limit?: number }): Promise<unknown[]> {
    return []
  }

  async create(_userId: string, _content: string, _ticker?: string): Promise<unknown> {
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async like(_postId: string): Promise<void> {
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async remove(_postId: string, _adminId: string): Promise<void> {
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const forumService = new ForumService()
