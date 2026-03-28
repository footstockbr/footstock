import type { Metadata } from "next";
import { Network, Plus, Copy } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Afiliados — Admin · Foot Stock",
};

const AFFILIATES = [
  { id: 1, name: "Pedro Alves", code: "PEDRO2026", conversions: 47, revenue: "R$ 936", status: "ativo" },
  { id: 2, name: "Marina Costa", code: "MARINA10", conversions: 31, revenue: "R$ 618", status: "ativo" },
  { id: 3, name: "Lucas Ferreira", code: "LUCAS_FS", conversions: 12, revenue: "R$ 240", status: "pausado" },
];

export default function AdminAfiliadosPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f0ead6] flex items-center gap-2">
            <Network className="h-5 w-5 text-[#c9a84c]" />
            Afiliados
          </h1>
          <p className="text-sm text-[#7a7060]">Programa de indicação e comissões</p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo afiliado
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Afiliados Ativos" value="38" subValue="de 51 cadastrados" />
        <StatCard label="Conversões (30d)" value="182" subValue="+23 vs mês anterior" />
        <StatCard label="Comissões Pagas" value="R$ 3.640" subValue="este mês" />
      </div>

      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(201,168,76,.08)]">
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Afiliado</th>
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Código</th>
              <th className="text-right py-2 text-xs text-[#7a7060] font-medium">Conversões</th>
              <th className="text-right py-2 text-xs text-[#7a7060] font-medium">Receita</th>
              <th className="text-right py-2 text-xs text-[#7a7060] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {AFFILIATES.map((affiliate) => (
              <tr key={affiliate.id} className="border-b border-[rgba(201,168,76,.04)]">
                <td className="py-2.5 text-sm text-[#c5b99a]">{affiliate.name}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs font-mono text-[#c9a84c] bg-[rgba(201,168,76,.08)] px-1.5 py-0.5 rounded">
                      {affiliate.code}
                    </code>
                    <button className="text-[#4a3d2a] hover:text-[#7a7060] transition-colors">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </td>
                <td className="py-2.5 text-right font-mono text-sm text-[#f0ead6]">{affiliate.conversions}</td>
                <td className="py-2.5 text-right font-mono text-sm text-[#4ade80]">{affiliate.revenue}</td>
                <td className="py-2.5 text-right">
                  <Badge variant={affiliate.status === "ativo" ? "default" : "warning"} size="xs">
                    {affiliate.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
