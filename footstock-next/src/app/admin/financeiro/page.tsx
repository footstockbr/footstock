import type { Metadata } from "next";
import { CreditCard, TrendingUp, TrendingDown } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = {
  title: "Financeiro — Admin · Foot Stock",
};

const TRANSACTIONS = [
  { id: 1, type: "assinatura", user: "Carlos M.", plan: "Craque", amount: "R$ 19,90", date: "28/03/2026", status: "pago" },
  { id: 2, type: "assinatura", user: "Roberto S.", plan: "Lenda", amount: "R$ 39,90", date: "27/03/2026", status: "pago" },
  { id: 3, type: "reembolso", user: "Ana P.", plan: "Craque", amount: "R$ 19,90", date: "26/03/2026", status: "processando" },
  { id: 4, type: "assinatura", user: "Paulo C.", plan: "Craque", amount: "R$ 19,90", date: "25/03/2026", status: "pago" },
];

export default function AdminFinanceiroPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#f0ead6] flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#c9a84c]" />
          Financeiro
        </h1>
        <p className="text-sm text-[#7a7060]">Assinaturas, receitas e reembolsos</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="MRR" value="R$ 28.450" subValue="+12% vs mês anterior" />
        <StatCard label="ARR (projetado)" value="R$ 341.400" subValue="base atual" />
        <StatCard label="Churn Rate" value="2,4%" subValue="últimos 30 dias" />
        <StatCard label="LTV médio" value="R$ 142" subValue="por assinante" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
          <h3 className="text-sm font-semibold text-[#f0ead6] mb-1 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#4ade80]" />
            Novos Assinantes
          </h3>
          <p className="text-2xl font-bold font-mono text-[#4ade80]">+18</p>
          <p className="text-xs text-[#7a7060]">este mês</p>
        </div>
        <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
          <h3 className="text-sm font-semibold text-[#f0ead6] mb-1 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-[#ef4444]" />
            Cancelamentos
          </h3>
          <p className="text-2xl font-bold font-mono text-[#ef4444]">−5</p>
          <p className="text-xs text-[#7a7060]">este mês</p>
        </div>
      </div>

      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
        <h2 className="text-sm font-semibold text-[#f0ead6] mb-3">Transações Recentes</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(201,168,76,.08)]">
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Usuário</th>
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Plano</th>
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Valor</th>
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Data</th>
              <th className="text-right py-2 text-xs text-[#7a7060] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {TRANSACTIONS.map((tx) => (
              <tr key={tx.id} className="border-b border-[rgba(201,168,76,.04)]">
                <td className="py-2.5 text-sm text-[#c5b99a]">{tx.user}</td>
                <td className="py-2.5 text-xs text-[#7a7060]">{tx.plan}</td>
                <td className="py-2.5 text-sm font-mono text-[#f0ead6]">{tx.amount}</td>
                <td className="py-2.5 text-xs text-[#7a7060]">{tx.date}</td>
                <td className="py-2.5 text-right">
                  <span className={`text-xs font-medium ${
                    tx.status === "pago" ? "text-[#4ade80]" : "text-[#f59e0b]"
                  }`}>
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
