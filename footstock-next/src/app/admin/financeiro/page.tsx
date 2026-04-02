import type { Metadata } from 'next'
import { AdminFinanceiroClient } from '@/components/admin/AdminFinanceiroClient'

export const metadata: Metadata = {
  title: 'Dashboard Financeiro | Admin FootStock',
  description: 'MRR, ARR, churn e status dos gateways de pagamento',
}

export default function AdminFinanceiroPage() {
  return <AdminFinanceiroClient />
}
