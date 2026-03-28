import type { Metadata } from "next";
import { Trophy, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = {
  title: "Ligas — Foot Stock",
};

export default function LigasPage() {
  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#f0ead6] flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#c9a84c]" />
          Minhas Ligas
        </h1>
        <Button variant="primary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Criar
        </Button>
      </div>

      {/* Ranking geral */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <StatCard label="Ranking Geral" value="#1.247" subValue="de 15.320 jogadores" />
        <StatCard label="Melhor Liga" value="—" subValue="Entre em uma liga" />
      </div>

      <EmptyState
        icon={<Trophy />}
        title="Você não está em nenhuma liga"
        description="Entre em uma liga pública ou crie sua própria para competir com amigos e outros jogadores"
      />

      <div className="mt-6 bg-[#141210] rounded-lg border border-[rgba(201,168,76,.18)] p-4">
        <h2 className="text-sm font-semibold text-[#f0ead6] mb-3">Ligas Públicas em Destaque</h2>
        <div className="flex flex-col gap-2">
          {["Liga Nacional Foot Stock", "Liga Série A Pro", "Desafio Semana #12"].map((liga) => (
            <div key={liga} className="flex items-center justify-between py-2 border-b border-[rgba(201,168,76,.06)] last:border-0">
              <div>
                <p className="text-sm font-medium text-[#f0ead6]">{liga}</p>
                <p className="text-xs text-[#7a7060]">247 participantes</p>
              </div>
              <Button variant="outline" size="sm">Entrar</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
