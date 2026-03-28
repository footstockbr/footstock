import type { Metadata } from "next";
import { Users, TrendingUp, CreditCard, AlertCircle, Activity } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = {
  title: "Admin Dashboard — Foot Stock",
};

const RECENT_ALERTS = [
  { id: 1, level: "warn", message: "Circuit breaker ativado — CORI4 (−12%)", time: "há 5 min" },
  { id: 2, level: "info", message: "3.241 usuários ativos agora", time: "há 10 min" },
  { id: 3, level: "error", message: "Erro na integração de dados esportivos", time: "há 32 min" },
];

export default function AdminDashboardPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f0ead6]">Dashboard</h1>
          <p className="text-sm text-[#7a7060]">Visão geral do sistema em tempo real</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-xs text-[#4ade80]">Sistema operacional</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Usuários Totais" value="15.320" subValue="+127 hoje" />
        <StatCard label="Volume (24h)" value="FS$ 4,2M" subValue="+18% vs ontem" />
        <StatCard label="Receita MRR" value="R$ 28.450" subValue="234 assinantes" />
        <StatCard label="Ordens Abertas" value="1.847" subValue="tempo real" />
      </div>

      {/* Charts placeholder */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
          <h3 className="text-sm font-semibold text-[#f0ead6] mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#c9a84c]" />
            Volume de Negociações
          </h3>
          <div className="h-32 flex items-center justify-center">
            <p className="text-xs text-[#4a3d2a]">Gráfico — integração com backend pendente</p>
          </div>
        </div>
        <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
          <h3 className="text-sm font-semibold text-[#f0ead6] mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-[#c9a84c]" />
            Novos Usuários (30 dias)
          </h3>
          <div className="h-32 flex items-center justify-center">
            <p className="text-xs text-[#4a3d2a]">Gráfico — integração com backend pendente</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
        <h3 className="text-sm font-semibold text-[#f0ead6] mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#c9a84c]" />
          Alertas Recentes
        </h3>
        <div className="flex flex-col gap-2">
          {RECENT_ALERTS.map((alert) => (
            <div key={alert.id} className="flex items-start gap-3 py-2 border-b border-[rgba(201,168,76,.06)] last:border-0">
              <AlertCircle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                alert.level === "error" ? "text-[#ef4444]" :
                alert.level === "warn" ? "text-[#f59e0b]" : "text-[#60a5fa]"
              }`} />
              <div className="flex-1">
                <p className="text-sm text-[#c5b99a]">{alert.message}</p>
                <p className="text-xs text-[#4a3d2a] mt-0.5">{alert.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
