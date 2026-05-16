// ============================================================================
// Auth.js v5 - Credentials authorize + Supabase->Prisma backfill (TASK-3/Item 3)
// ----------------------------------------------------------------------------
// Pure functions used by the Credentials provider em `src/auth.ts` e pelo
// route handler `src/app/api/v1/auth/login/route.ts` (dual-stack fallback).
//
//  - `authorizeCredentials(credentials)`: Zod parse + bcrypt.compare contra
//    `user.passwordHash` do Prisma. Aplica timing defense via dummy bcrypt
//    quando o user nao existe ou ainda nao tem hash. Retorna nullable; o
//    caller (Auth.js OU /api/v1/auth/login) decide o que fazer com null.
//
//  - `backfillPasswordHash(userId, plaintext)`: hash bcrypt(12) +
//    `prisma.user.updateMany({ where: { id, passwordHash: null }, ... })`.
//    Race-safe por construcao: segundo concorrente vira no-op porque o
//    WHERE deixa de bater apos o primeiro UPDATE commitar.
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
    if (!user) return null
    // user existe mas sem passwordHash: o caller (login/route.ts) podera
    // tentar o fallback Supabase + backfill se a flag estiver ligada.
    return null
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return null

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

/**
 * Backfill silencioso do `passwordHash` para users que ainda autenticam via
 * Supabase. Race-safe: `updateMany` filtra por `passwordHash: null`, entao
 * o segundo login concorrente do mesmo user vira no-op (count=0).
 *
 * Nunca lanca: a logica chamadora (rota /login) usa fire-and-forget
 * (`void backfillPasswordHash(...)`) e o sucesso/falha so afeta o proximo
 * login - nao o atual.
 */
export async function backfillPasswordHash(
  userId: string,
  plaintext: string,
): Promise<{ applied: boolean }> {
  try {
    const hash = await bcrypt.hash(plaintext, 12)
    const result = await prisma.user.updateMany({
      where: { id: userId, passwordHash: null },
      data: { passwordHash: hash, updatedAt: new Date() },
    })
    return { applied: result.count > 0 }
  } catch {
    return { applied: false }
  }
}
