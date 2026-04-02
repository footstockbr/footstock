// module-20: Erros padronizados de ligas — LEAGUE_050/051/080/081

export interface LeagueErrorDef {
  code: string
  status: number
  message: string
}

export const LEAGUE_ERRORS = {
  PLAN_RESTRICTION: {
    code: 'LEAGUE_050',
    status: 403,
    message: 'Criação de ligas de amigos disponível a partir do plano Craque.',
  },
  FULL: {
    code: 'LEAGUE_051',
    status: 422,
    message: 'Esta liga já atingiu o limite de participantes.',
  },
  NOT_FOUND: {
    code: 'LEAGUE_080',
    status: 404,
    message: 'Liga não encontrada.',
  },
  ALREADY_MEMBER: {
    code: 'LEAGUE_081',
    status: 409,
    message: 'Você já está participando desta liga.',
  },
  PRIVATE_INVITE_REQUIRED: {
    code: 'LEAGUE_085',
    status: 403,
    message: 'Esta liga é privada. Use o link de convite.',
  },
  LEAGUE_FINISHED: {
    code: 'LEAGUE_082',
    status: 422,
    message: 'Liga já encerrada.',
  },
  NOT_MEMBER: {
    code: 'LEAGUE_083',
    status: 403,
    message: 'Você não é membro desta liga.',
  },
  INVITE_ONLY_AMIGOS: {
    code: 'LEAGUE_084',
    status: 400,
    message: 'Convites disponíveis apenas para ligas de amigos.',
  },
} as const

export class LeagueError extends Error {
  code: string
  status: number

  constructor(def: LeagueErrorDef) {
    super(def.message)
    this.name = 'LeagueError'
    this.code = def.code
    this.status = def.status
  }
}
