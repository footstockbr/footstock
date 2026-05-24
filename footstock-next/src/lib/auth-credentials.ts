// ============================================================================
// Auth.js v5 - Credentials authorize (TASK-3/Item 3)
// ----------------------------------------------------------------------------
// Pure function used by the Credentials provider em `src/auth.ts` e pelo
// route handler `src/app/api/v1/auth/login/route.ts`.
//
//  - `authorizeCredentials(credentials)`: Zod parse + bcrypt.compare contra
//    `user.passwordHash` do Prisma. Aplica timing defense via dummy bcrypt
//    quando o user nao existe ou ainda nao tem hash. Retorna nullable; o
//    caller decide o que fazer com null (falha de autenticacao).
// ============================================================================

import bcrypt from 'bcryptjs'

import { prisma } from '@/lib/prisma'
import type { AdminRole, PlanType } from '@/lib/enums'

// Schema local minimo (mirror do route POST). loginSchema do
// src/lib/schemas/auth.schema.ts exige min(8) para uso em formularios; aqui
// queremos apenas garantir tipos + presenca, deixando o veredito de match
// para o bcrypt.compare (constant-time real) abaixo.
import { z } from 'zod'

const AuthorizeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// 60-char dummy bcrypt-shaped string ($2a$12$ + 53 chars). bcrypt.compare
// percorre o custo factor 12 da mesma forma para qualquer hash com este
// shape, fornecendo o delay constante necessario para esconder o caminho
// "user nao existe" / "user sem passwordHash".
const DUMMY_HASH = '$2a$12$' + '.'.repeat(53)

// Shape compativel com next-auth `User` (id obrigatorio, demais opcionais)
// + campos custom propagados em jwt/session callbacks de src/auth.ts.
export interface AuthorizedUser {
  id: string
  email: string
  name: string | null
  adminRole: AdminRole | null
  // null para staff (ADMIN/CLUB_PARTNER): nao tem plano.
  planType: PlanType | null
  userType: string
  favoriteClub: string | null
}

export async function authorizeCredentials(
  credentials: Partial<Record<'email' | 'password', unknown>> | undefined,
): Promise<AuthorizedUser | null> {
  const parsed = AuthorizeSchema.safeParse(credentials)
  if (!parsed.success) {
    // Mesmo em payload invalido executamos o dummy bcrypt para nao vazar
    // o caminho rapido "validation error" via timing diferencial.
    await bcrypt.compare('x', DUMMY_HASH).catch(() => false)
    return null
  }

  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })

  // Timing defense: sempre rodar bcrypt.compare uma vez, mesmo quando nao
  // existe user ou nao existe hash. O resultado e descartado.
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH).catch(() => false)
    // user existe mas sem passwordHash: deve recuperar acesso via magic-link
    // (/esqueci-senha). Sem hash nao ha autenticacao por credenciais.
    return null
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return null

  // ID-NEW-001 (Codex round 2): negar autenticacao para usuarios nao-ACTIVE.
  // Estado canonico em prisma.user.status (UserStatus: ACTIVE | SUSPENDED |
  // BANNED). Banido/suspenso com senha correta NAO deve obter cookie de sessao.
  // O timing ja esta equalizado (bcrypt.compare ocorreu acima); negar aqui nao
  // expoe diferencial sobre o caminho de senha errada.
  if ((user.status as string | null) !== 'ACTIVE') return null

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    adminRole: (user.adminRole as AdminRole | null) ?? null,
    planType: (user.planType as PlanType | null) ?? null,
    userType: (user.userType as string | null) ?? '',
    favoriteClub: (user.favoriteClub as string | null) ?? null,
  }
}
