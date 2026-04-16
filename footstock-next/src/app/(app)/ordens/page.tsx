import type { Metadata } from 'next'
import { OrderHistory } from '@/components/orders/OrderHistory'

export const metadata: Metadata = {
  title: 'Minhas Ordens | FootStock',
  description: 'Histórico de ordens de compra e venda de ativos.',
}

export default function OrdensPage() {
  return (
    <div data-testid="page-ordens" className="flex flex-col gap-0 pb-20">
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-bold text-[#EAECEF] mb-4">Minhas Ordens</h1>
        <OrderHistory />
      </div>
    </div>
  )
}
