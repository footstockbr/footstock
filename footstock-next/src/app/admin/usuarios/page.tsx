import type { Metadata } from "next";
import { Users, Search, UserCheck, UserX } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PlanBadge } from "@/components/shared/plan-badge";
import { PlanType } from "@/lib/constants/plans";

export const metadata: Metadata = {
  title: "Usuários — Admin · Foot Stock",
};

const MOCK_USERS = [
  { id: 1, name: "Carlos Mendes", email: "carlos@email.com", plan: PlanType.CRAQUE, status: "ativo", joined: "Jan 2026" },
  { id: 2, name: "Ana Paula", email: "ana@email.com", plan: PlanType.JOGADOR, status: "ativo", joined: "Fev 2026" },
  { id: 3, name: "Roberto Silva", email: "roberto@email.com", plan: PlanType.LENDA, status: "ativo", joined: "Dez 2025" },
  { id: 4, name: "Fernanda Lima", email: "fernanda@email.com", plan: PlanType.JOGADOR, status: "suspenso", joined: "Mar 2026" },
  { id: 5, name: "Paulo Costa", email: "paulo@email.com", plan: PlanType.CRAQUE, status: "ativo", joined: "Jan 2026" },
];

export default function AdminUsuariosPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f0ead6] flex items-center gap-2">
            <Users className="h-5 w-5 text-[#c9a84c]" />
            Usuários
          </h1>
          <p className="text-sm text-[#7a7060]">Gestão e moderação de contas</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value="15.320" subValue="registrados" />
        <StatCard label="Ativos (30d)" value="8.241" subValue="53,8% DAU" />
        <StatCard label="Pagantes" value="234" subValue="Craque + Lenda" />
        <StatCard label="Suspensos" value="12" subValue="em revisão" />
      </div>

      <div className="bg-[#141210] rounded-xl border border-[rgba(201,168,76,.1)] p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4a3d2a]" />
            <input
              type="search"
              placeholder="Buscar por nome ou email..."
              className="h-9 w-full rounded-lg border border-[rgba(201,168,76,.18)] bg-[#0f0e0b] pl-9 pr-3 text-sm text-[#f0ead6] placeholder:text-[#4a3d2a] focus:outline-none"
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(201,168,76,.08)]">
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Usuário</th>
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Plano</th>
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Status</th>
              <th className="text-left py-2 text-xs text-[#7a7060] font-medium">Cadastro</th>
              <th className="text-right py-2 text-xs text-[#7a7060] font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_USERS.map((user) => (
              <tr key={user.id} className="border-b border-[rgba(201,168,76,.04)] hover:bg-[rgba(201,168,76,.02)]">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={user.name} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-[#f0ead6]">{user.name}</p>
                      <p className="text-xs text-[#7a7060]">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  <PlanBadge plan={user.plan} />
                </td>
                <td className="py-3">
                  <span className={`text-xs font-medium ${user.status === "ativo" ? "text-[#4ade80]" : "text-[#ef4444]"}`}>
                    {user.status}
                  </span>
                </td>
                <td className="py-3 text-xs text-[#7a7060]">{user.joined}</td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="p-1.5 rounded hover:bg-[rgba(74,222,128,.1)] text-[#7a7060] hover:text-[#4ade80] transition-colors">
                      <UserCheck className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-[rgba(239,68,68,.1)] text-[#7a7060] hover:text-[#ef4444] transition-colors">
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
