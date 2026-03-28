import type { Metadata } from "next";
import { HandshakeIcon, Plus, DollarSign } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Patrocinadores — Admin · Foot Stock",
};

const SPONSORS = [
  { id: 1, name: "TechBet Ltda", club: "Flamengo", type: "master", value: "R$ 50.000/mês", status: "ativo" },
  { id: 2, name: "FinanceApp SA", club: "Palmeiras", type: "secundário", value: "R$ 20.000/mês", status: "ativo" },
  { id: 3, name: "SportGear Inc", club: "Corinthians", type: "master", value: "R$ 35.000/mês", status: "negociação" },
];

export default function AdminPatrocinadoresPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f0ead6] flex items-center gap-2">
            <HandshakeIcon className="h-5 w-5 text-[#c9a84c]" />
            Patrocinadores
          </h1>
          <p className="text-sm text-[#7a7060]">Contratos e receita de patrocínio</p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo patrocinador
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Contratos Ativos" value="12" subValue="3 em negociação" />
        <StatCard label="Receita Mensal" value="R$ 420K" subValue="patrocínios" />
        <StatCard label="Cobertura de Clubes" value="18/40" subValue="45% com patrocínio" />
      </div>

      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
        <div className="flex flex-col gap-3">
          {SPONSORS.map((sponsor) => (
            <div key={sponsor.id} className="flex items-center justify-between py-2 border-b border-[rgba(201,168,76,.04)] last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(201,168,76,.1)] flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-[#c9a84c]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#f0ead6]">{sponsor.name}</p>
                  <p className="text-xs text-[#7a7060]">{sponsor.club} · {sponsor.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-[#c5b99a]">{sponsor.value}</span>
                <Badge variant={sponsor.status === "ativo" ? "default" : "warning"} size="xs">
                  {sponsor.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
