import type { Metadata } from "next";
import { Network } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { AfiliadosNovoButton } from "@/components/admin/AfiliadosNovoButton";
import { CopyCodeButton } from "@/components/admin/CopyCodeButton";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Afiliados — Admin · FootStock",
};

export default async function AdminAfiliadosPage() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [affiliates, activeCount, totalCount, conversions30d, paidTotal] =
    await Promise.all([
      prisma.affiliateCode.findMany({
        include: {
          user: { select: { name: true } },
          transactions: { select: { id: true, amount: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.affiliateCode.count({ where: { active: true } }),
      prisma.affiliateCode.count(),
      prisma.affiliateTransaction.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.affiliateTransaction.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
    ]);

  const paidSum = paidTotal._sum.amount?.toNumber() ?? 0;

  return (
    <div className="p-6" data-testid="page-admin-afiliados">
      <div className="flex items-center justify-between mb-6" data-testid="admin-afiliados-header">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Network className="h-5 w-5 text-[#F0B90B]" />
            Afiliados
          </h1>
          <p className="text-sm text-[#929AA5]">Programa de indicação e comissões</p>
        </div>
        <AfiliadosNovoButton />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6" data-testid="admin-afiliados-stats">
        <StatCard
          label="Afiliados Ativos"
          value={String(activeCount)}
          subValue={`de ${totalCount} cadastrados`}
        />
        <StatCard
          label="Conversões (30d)"
          value={String(conversions30d)}
          subValue="últimos 30 dias"
        />
        <StatCard
          label="Comissões Pagas"
          value={`FS$ ${paidSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue="total pago"
        />
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4" data-testid="admin-afiliados-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(240,185,11,.08)]">
              <th className="text-left py-2 text-xs text-[#929AA5] font-medium">Afiliado</th>
              <th className="text-left py-2 text-xs text-[#929AA5] font-medium">Código</th>
              <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Conversões</th>
              <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Receita</th>
              <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {affiliates.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-[#929AA5]">
                  Nenhum afiliado cadastrado.
                </td>
              </tr>
            ) : (
              affiliates.map((affiliate) => {
                const conversions = affiliate.transactions.filter(
                  (t) => t.status === "PAID" || t.status === "PROCESSING"
                ).length;
                const revenue = affiliate.transactions
                  .filter((t) => t.status === "PAID")
                  .reduce((sum, t) => sum + t.amount.toNumber(), 0);

                const typeLabel: Record<string, string> = {
                  INFLUENCIADOR: "Influenciador",
                  TIME_PARCEIRO: "Time Parceiro",
                  USER: "Usuário",
                };
                const typeBadgeVariant =
                  affiliate.affiliateType === "INFLUENCIADOR" || affiliate.affiliateType === "TIME_PARCEIRO"
                    ? "default"
                    : "info";

                return (
                  <tr key={affiliate.id} className="border-b border-[rgba(240,185,11,.04)]">
                    <td className="py-2.5 text-sm text-[#c5b99a]">
                      <div>
                        <span>{affiliate.user?.name ?? '—'}</span>
                        <Badge variant={typeBadgeVariant} size="xs" className="ml-2">
                          {typeLabel[affiliate.affiliateType] ?? affiliate.affiliateType}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono text-[#F0B90B] bg-[rgba(240,185,11,.08)] px-1.5 py-0.5 rounded">
                          {affiliate.code}
                        </code>
                        <CopyCodeButton
                          code={affiliate.code}
                          testid={`admin-afiliados-copy-code-${affiliate.code}`}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-sm text-[#EAECEF]">{conversions}</td>
                    <td className="py-2.5 text-right font-mono text-sm text-[#4ade80]">
                      FS$ {revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 text-right">
                      <Badge variant={affiliate.active ? "default" : "warning"} size="xs">
                        {affiliate.active ? "ativo" : "pausado"}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
