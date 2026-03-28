import type { Order, CreateOrderInput, OrderStatus } from '@/types'

export class OrderService {
  async findAll(
    userId: string,
    filters?: { status?: OrderStatus; ticker?: string; page?: number; limit?: number }
  ): Promise<{ orders: Order[]; total: number }> {
    // TODO: Implementar via /auto-flow execute
    return { orders: [], total: 0 }
  }

  async findById(id: string, userId: string): Promise<Order | null> {
    // TODO: Implementar via /auto-flow execute
    return null
  }

  async create(userId: string, data: CreateOrderInput): Promise<Order> {
    // TODO: Implementar via /auto-flow execute
    // Valida: plano, saldo, halt, lock otimista
    throw new Error('Not implemented — run /auto-flow execute')
  }

  async cancel(id: string, userId: string): Promise<Order> {
    // TODO: Implementar via /auto-flow execute
    // Apenas PENDING pode ser cancelado; estorna saldo
    throw new Error('Not implemented — run /auto-flow execute')
  }
}

export const orderService = new OrderService()
