import type { Metadata } from 'next'
import { ArrowLeft, Copy, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const affiliate = await prisma.affiliateCode.findUnique({
    where: { id },
    select: { user: { select: { name: true } } },
  })
  return {
    title: `Afiliado: ${affiliate?.user.name ?? id} — Admin · FootStock`,
  }
}

export default async function AfiliadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const affiliate = await prisma.affiliateCode.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!affiliate) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold text-[#EAECEF]">Afiliado não encontrado</h2>
          <Link
            href="/admin/afiliados"
            className="text-sm text-[#F0B90B] hover:text-[#d4ad52] mt-4 inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para afiliados
          </Link>
        </div>
      </div>
    )
  }

  const conversions = affiliate.transactions.filter(t => t.status === 'PAID' || t.status === 'PROCESSING').length
  const totalCommission = affiliate.transactions.reduce((sum, t) => sum + t.amount.toNumber(), 0)
  const pendingCommission = affiliate.transactions
    .filter(t => t.status === 'PENDING')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0)

  const referralUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://footstock.app'}/ref/${affiliate.code}`

  const typeLabel: Record<string, string> = {
    INFLUENCIADOR: 'Influenciador',
    TIME_PARCEIRO: 'Time Parceiro',
    USER: 'Usuário',
  }

  const statusColor: Record<string, string> = {
    PENDING: 'text-[#929AA5]',
    PROCESSING: 'text-[#F0B90B]',
    PAID: 'text-[#4ade80]',
    VOIDED: 'text-[#ef4444]',
  }

  return (
    <div className="p-6" data-testid="page-admin-afiliado-detail">
      <Link
        href="/admin/afiliados"
        className="text-sm text-[#F0B90B] hover:text-[#d4ad52] mb-4 inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para afiliados
      </Link>

      <div className="mb-6 border-b border-[rgba(240,185,11,.1)] pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#EAECEF]">{affiliate.user.name}</h1>
            <p className="text-sm text-[#929AA5]">{affiliate.user.email}</p>
            <Badge variant="default" size="sm" className="mt-2">
              {typeLabel[affiliate.affiliateType] ?? affiliate.affiliateType}
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#929AA5] mb-1">Código</p>
            <code className="text-base font-mono text-[#F0B90B] bg-[rgba(240,185,11,.08)] px-3 py-1.5 rounded block">
              {affiliate.code}
            </code>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6" data-testid="afiliado-stats">
        <StatCard
          label="Conversões"
          value={String(conversions)}
          subValue={`${affiliate.transactions.length} transações`}
        />
        <StatCard
          label="Total de Comissões"
          value={`FS$ ${totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue={`${pendingCommission > 0 ? `FS$ ${pendingCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} pendente` : 'sem pendência'}`}
        />
        <StatCard
          label="Link de Referência"
          value={affiliate.code}
          subValue="copiar e compartilhar"
        />
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 mb-6" data-testid="afiliado-referral-link">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs text-[#929AA5] mb-1">Link de Referência</p>
            <code className="text-sm font-mono text-[#EAECEF] break-all">{referralUrl}</code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(referralUrl)
              alert('Link copiado!')
            }}
            className="flex-shrink-0 p-2 hover:bg-[rgba(240,185,11,.1)] rounded transition-colors"
            aria-label="Copiar link"
          >
            <Copy className="h-4 w-4 text-[#F0B90B]" />
          </button>
        </div>
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4" data-testid="afiliado-commission-history">
        <h3 className="text-sm font-semibold text-[#EAECEF] mb-4">Histórico de Comissões</h3>

        {affiliate.transactions.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#929AA5]">Nenhuma transação registrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(240,185,11,.08)]">
                  <th className="text-left py-2 text-xs text-[#929AA5] font-medium">Data</th>
                  <th className="text-left py-2 text-xs text-[#929AA5] font-medium">Tipo</th>
                  <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Valor</th>
                  <th className="text-center py-2 text-xs text-[#929AA5] font-medium">Status</th>
                  <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Pago em</th>
                </tr>
              </thead>
              <tbody>
                {affiliate.transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-[rgba(240,185,11,.04)]">
                    <td className="py-2.5 text-[#EAECEF]">
                      {new Date(tx.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2.5 text-[#929AA5]">{tx.transactionType}</td>
                    <td className="py-2.5 text-right font-mono text-[#4ade80]">
                      FS$ {tx.amount.toNumber().toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`text-xs font-medium ${statusColor[tx.status] || 'text-[#929AA5]'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[#929AA5]">
                      {tx.paidAt ? new Date(tx.paidAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
