import 'server-only'

import type { Adapter, AdapterUser } from '@auth/core/adapters'
import { PrismaAdapter } from '@auth/prisma-adapter'
import type { PrismaClient } from '@prisma/client'

/**
 * Wrapper sobre PrismaAdapter (Auth.js v5) que bloqueia auto-create de User rows.
 *
 * Razao: schema.prisma define `User.cpfHash` como required+unique e onboarding
 * fields (cpf age verification, consent, plan) so existem no flow Prisma-first
 * (NXAUTH-06). Adapter default chamaria `createUser` em magic link p/ email
 * inexistente OR Google sign-in p/ email novo, deixando linhas parciais.
 *
 * Comportamento:
 *  - createUser: lanca AUTHJS_AUTOCREATE_BLOCKED. Auth.js trata como erro de
 *    sign-in e redireciona para callback de error com code conhecido.
 *  - linkAccount: idem se userId nao referencia User existente. PrismaAdapter
 *    nao costuma criar User aqui, mas defendemos.
 *  - demais operacoes (getUser*, createSession, updateUser, deleteSession,
 *    createVerificationToken, useVerificationToken) passam direto para o
 *    adapter base.
 */
export class AuthjsAutoCreateBlockedError extends Error {
  code = 'AUTHJS_AUTOCREATE_BLOCKED' as const

  constructor(message = 'Auth.js auto-create de User bloqueado pelo wrapper (NXAUTH-03A)') {
    super(message)
    this.name = 'AuthjsAutoCreateBlockedError'
  }
}

export function createAuthjsAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(prisma)

  const wrapped: Adapter = {
    ...base,

    async createUser(_user: Omit<AdapterUser, 'id'>): Promise<AdapterUser> {
      throw new AuthjsAutoCreateBlockedError()
    },

    linkAccount: (async (account) => {
      if (!base.linkAccount) {
        throw new Error('PrismaAdapter.linkAccount indisponivel')
      }
      const existing = await prisma.user.findUnique({ where: { id: account.userId } })
      if (!existing) {
        throw new AuthjsAutoCreateBlockedError(
          `linkAccount rejeitado: userId=${account.userId} nao existe (anti auto-create)`,
        )
      }
      return base.linkAccount(account)
    }) as Adapter['linkAccount'],
  }

  return wrapped
}
