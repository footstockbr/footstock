import type { Metadata } from "next";
import { Gauge, Play, Pause, RotateCcw } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Motor de Mercado — Admin · Foot Stock",
};

const SESSIONS = [
  { name: "PRÉ_ABERTURA", status: "concluído", time: "08:00–10:00" },
  { name: "NEGOCIAÇÃO", status: "ativo", time: "10:00–17:00" },
  { name: "CALL", status: "pendente", time: "17:00–17:15" },
  { name: "AFTER_MARKET", status: "pendente", time: "17:15–18:00" },
  { name: "FECHADO", status: "pendente", time: "18:00–08:00" },
];

export default function AdminMotorPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f0ead6] flex items-center gap-2">
            <Gauge className="h-5 w-5 text-[#c9a84c]" />
            Motor de Mercado
          </h1>
          <p className="text-sm text-[#7a7060]">Controle das sessões e parâmetros de precificação</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">
            <RotateCcw className="h-4 w-4 mr-1" /> Resetar
          </Button>
          <Button variant="destructive" size="sm">
            <Pause className="h-4 w-4 mr-1" /> Pausar mercado
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Sessão Atual" value="NEGOCIAÇÃO" subValue="desde 10:00" />
        <StatCard label="Ordens/min" value="847" subValue="pico hoje: 2.341" />
        <StatCard label="Circuit Breakers" value="2" subValue="ativos agora" />
      </div>

      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4 mb-4">
        <h2 className="text-sm font-semibold text-[#f0ead6] mb-3">Sessões do Dia</h2>
        <div className="flex flex-col gap-2">
          {SESSIONS.map((session) => (
            <div key={session.name} className="flex items-center justify-between py-2 border-b border-[rgba(201,168,76,.06)] last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  session.status === "ativo" ? "bg-[#4ade80] animate-pulse" :
                  session.status === "concluído" ? "bg-[#7a7060]" : "bg-[#4a3d2a]"
                }`} />
                <span className="text-sm font-mono text-[#c5b99a]">{session.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#7a7060]">{session.time}</span>
                <Badge variant={session.status === "ativo" ? "default" : "warning"} size="xs">
                  {session.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
        <h2 className="text-sm font-semibold text-[#f0ead6] mb-3">Parâmetros GARCH/Kyle</h2>
        <p className="text-xs text-[#4a3d2a]">Configuração de parâmetros — integração com backend pendente</p>
      </div>
    </div>
  );
}
