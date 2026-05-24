import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminRole } from '@/lib/enums'
import type { User } from '@/types'

export interface ImpactMatrixDTO {
  financeiraCritica: number
  esportivaMajoritaria: number
  mercadoAtivos: number
  integridadeSaude: number
  institucional: number
  esportivaMenor: number
}

/**
 * GET /api/v1/admin/motor/impact-matrix
 * Retorna a configuração atual da matriz de impacto
 */
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  // Dev fallback
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser = { id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User', adminRole: adminRole as AdminRole } as unknown as User
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return errors.forbidden()
  }

  try {
    const config = await prisma.impactMatrixConfig.findUnique({
      where: { id: 'default' },
    })

    if (!config) {
      // Se não existe, criar padrão
      const newConfig = await prisma.impactMatrixConfig.create({
        data: { id: 'default' },
      })
      return ok({
        financeiraCritica: parseFloat(String(newConfig.financeiraCritica)),
        esportivaMajoritaria: parseFloat(String(newConfig.esportivaMajoritaria)),
        mercadoAtivos: parseFloat(String(newConfig.mercadoAtivos)),
        integridadeSaude: parseFloat(String(newConfig.integridadeSaude)),
        institucional: parseFloat(String(newConfig.institucional)),
        esportivaMenor: parseFloat(String(newConfig.esportivaMenor)),
      })
    }

    return ok({
      financeiraCritica: parseFloat(String(config.financeiraCritica)),
      esportivaMajoritaria: parseFloat(String(config.esportivaMajoritaria)),
      mercadoAtivos: parseFloat(String(config.mercadoAtivos)),
      integridadeSaude: parseFloat(String(config.integridadeSaude)),
      institucional: parseFloat(String(config.institucional)),
      esportivaMenor: parseFloat(String(config.esportivaMenor)),
    })
  } catch (error) {
    console.error('Impact matrix GET error:', error)
    return errors.server()
  }
}

/**
 * PUT /api/v1/admin/motor/impact-matrix
 * Atualiza a configuração da matriz de impacto
 * Body: ImpactMatrixDTO
 */
export async function PUT(request: NextRequest) {
  let auth = await getAuthUser()

  // Dev fallback
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser = { id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User', adminRole: adminRole as AdminRole } as unknown as User
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  try {
    const body = await request.json() as ImpactMatrixDTO

    // Validar valores (0 a 0.10 = 0% a 10%)
    const validateValue = (v: number) => {
      const num = parseFloat(String(v))
      return Math.max(0, Math.min(0.1, num))
    }

    const updated = await prisma.impactMatrixConfig.upsert({
      where: { id: 'default' },
      update: {
        financeiraCritica: validateValue(body.financeiraCritica),
        esportivaMajoritaria: validateValue(body.esportivaMajoritaria),
        mercadoAtivos: validateValue(body.mercadoAtivos),
        integridadeSaude: validateValue(body.integridadeSaude),
        institucional: validateValue(body.institucional),
        esportivaMenor: validateValue(body.esportivaMenor),
        updatedBy: auth.user.id,
      },
      create: {
        id: 'default',
        financeiraCritica: validateValue(body.financeiraCritica),
        esportivaMajoritaria: validateValue(body.esportivaMajoritaria),
        mercadoAtivos: validateValue(body.mercadoAtivos),
        integridadeSaude: validateValue(body.integridadeSaude),
        institucional: validateValue(body.institucional),
        esportivaMenor: validateValue(body.esportivaMenor),
        updatedBy: auth.user.id,
      },
    })

    return ok({
      financeiraCritica: parseFloat(String(updated.financeiraCritica)),
      esportivaMajoritaria: parseFloat(String(updated.esportivaMajoritaria)),
      mercadoAtivos: parseFloat(String(updated.mercadoAtivos)),
      integridadeSaude: parseFloat(String(updated.integridadeSaude)),
      institucional: parseFloat(String(updated.institucional)),
      esportivaMenor: parseFloat(String(updated.esportivaMenor)),
    })
  } catch (error) {
    console.error('Impact matrix PUT error:', error)
    return errors.server()
  }
}
