import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { created, list, error, errors } from '@/lib/api'
import { orderService, AppError } from '@/lib/services/OrderService'
import { CreateOrderSchema } from '@/lib/validators/order'

// POST /api/v1/orders — cria ordem com validação de plano
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const body = await request.json()
    const parsed = CreateOrderSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation(
        parsed.error.errors.map((e) => e.message).join('; ')
      )
    }

    const order = await orderService.createOrder(auth.user.id, parsed.data)
    return created({ order })
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return error(err.code, err.message, err.statusCode, err.details)
    }
    return errors.server()
  }
}

// GET /api/v1/orders — lista ordens paginadas do usuário
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  const userId = auth.user.id

  try {
    const { searchParams } = request.nextUrl
    const filters = {
      status: searchParams.get('status') ?? undefined,
      assetId: searchParams.get('assetId') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 100) : 20,
    }

    const result = await orderService.getOrders(userId, filters)
    return list(result.data, result.pagination)
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return error(err.code, err.message, err.statusCode)
    }
    return errors.server()
  }
}
