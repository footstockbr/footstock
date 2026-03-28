import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = {
  title: "Engajamento — Admin · Foot Stock",
};

export default function AdminEngajamentoPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#f0ead6] flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#c9a84c]" />
          Engajamento
        </h1>
        <p className="text-sm text-[#7a7060]">Métricas de retenção, DAU/MAU e comportamento</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="DAU" value="3.241" subValue="+5,2% vs ontem" />
        <StatCard label="MAU" value="8.241" subValue="usuários únicos" />
        <StatCard label="DAU/MAU" value="39,3%" subValue="stickiness" />
        <StatCard label="Sessão média" value="8,4 min" subValue="+1,2 min vs semana" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
          <h3 className="text-sm font-semibold text-[#f0ead6] mb-4">Retenção D1/D7/D30</h3>
          <div className="space-y-3">
            {[
              { label: "D1 (1 dia)", pct: 72 },
              { label: "D7 (7 dias)", pct: 45 },
              { label: "D30 (30 dias)", pct: 28 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#7a7060]">{item.label}</span>
                  <span className="text-[#c5b99a] font-mono">{item.pct}%</span>
                </div>
                <div className="h-1.5 bg-[rgba(201,168,76,.08)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#c9a84c] rounded-full"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
          <h3 className="text-sm font-semibold text-[#f0ead6] mb-4">Telas mais acessadas</h3>
          <div className="space-y-2">
            {[
              { screen: "Mercado", pct: 68 },
              { screen: "Portfólio", pct: 52 },
              { screen: "Notícias", pct: 41 },
              { screen: "Ativo (detail)", pct: 38 },
              { screen: "Comunidade", pct: 22 },
            ].map((item, i) => (
              <div key={item.screen} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#4a3d2a] w-4">{i + 1}</span>
                  <span className="text-sm text-[#c5b99a]">{item.screen}</span>
                </div>
                <span className="text-sm font-mono text-[#7a7060]">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
