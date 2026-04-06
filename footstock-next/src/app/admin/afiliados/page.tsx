import type { Metadata } from "next";
import { Network, Plus, Copy } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Afiliados — Admin · Foot Stock",
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Network className="h-5 w-5 text-[#F0B90B]" />
            Afiliados
          </h1>
          <p className="text-sm text-[#929AA5]">Programa de indicacao e comissoes</p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo afiliado
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Afiliados Ativos"
          value={String(activeCount)}
          subValue={`de ${totalCount} cadastrados`}
        />
        <StatCard
          label="Conversoes (30d)"
          value={String(conversions30d)}
          subValue="ultimos 30 dias"
        />
        <StatCard
          label="Comissoes Pagas"
          value={`FS$ ${paidSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue="total pago"
        />
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(240,185,11,.08)]">
              <th className="text-left py-2 text-xs text-[#929AA5] font-medium">Afiliado</th>
              <th className="text-left py-2 text-xs text-[#929AA5] font-medium">Codigo</th>
              <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Conversoes</th>
              <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Receita</th>
              <th className="text-right py-2 text-xs text-[#929AA5] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {affiliates.map((affiliate) => {
              const conversions = affiliate.transactions.length;
              const revenue = affiliate.transactions.reduce(
                (sum, t) => sum + t.amount.toNumber(),
                0
              );

              return (
                <tr key={affiliate.id} className="border-b border-[rgba(240,185,11,.04)]">
                  <td className="py-2.5 text-sm text-[#c5b99a]">{affiliate.user.name}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono text-[#F0B90B] bg-[rgba(240,185,11,.08)] px-1.5 py-0.5 rounded">
                        {affiliate.code}
                      </code>
                      <button className="text-[#707A8A] hover:text-[#929AA5] transition-colors">
                        <Copy className="h-3 w-3" />
                      </button>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
