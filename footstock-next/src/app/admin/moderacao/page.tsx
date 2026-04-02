import type { Metadata } from "next";
import { ShieldAlert, Flag, CheckCircle, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Moderação — Admin · Foot Stock",
};

const REPORTS = [
  { id: 1, type: "post", content: "Conteúdo ofensivo no fórum", reporter: "carlos@email.com", status: "pendente", time: "há 10 min" },
  { id: 2, type: "user", content: "Spam de mensagens", reporter: "ana@email.com", status: "pendente", time: "há 45 min" },
  { id: 3, type: "post", content: "Informação financeira falsa", reporter: "roberto@email.com", status: "resolvido", time: "há 2h" },
];

export default function AdminModeracaoPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[#F0B90B]" />
          Moderação
        </h1>
        <p className="text-sm text-[#929AA5]">Denúncias, conteúdo e segurança da comunidade</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Denúncias Pendentes" value="2" subValue="aguardando revisão" />
        <StatCard label="Resolvidas (7d)" value="47" subValue="94% aprovação" />
        <StatCard label="Usuários Suspensos" value="12" subValue="ativos agora" />
      </div>

      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h2 className="text-sm font-semibold text-[#EAECEF] mb-3 flex items-center gap-2">
          <Flag className="h-4 w-4 text-[#F6465D]" />
          Fila de Moderação
        </h2>
        <div className="flex flex-col gap-3">
          {REPORTS.map((report) => (
            <div key={report.id} className="bg-[#181A20] rounded-lg border border-[rgba(240,185,11,.06)] p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={report.type === "user" ? "craque" : "default"} size="xs">{report.type}</Badge>
                    <span className={`text-xs font-medium ${
                      report.status === "pendente" ? "text-[#f59e0b]" : "text-[#4ade80]"
                    }`}>{report.status}</span>
                  </div>
                  <p className="text-sm text-[#c5b99a]">{report.content}</p>
                  <p className="text-xs text-[#929AA5] mt-1">Denunciado por: {report.reporter} · {report.time}</p>
                </div>
                {report.status === "pendente" && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="p-1.5 rounded hover:bg-[rgba(74,222,128,.1)] text-[#929AA5] hover:text-[#4ade80] transition-colors">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-[rgba(239,68,68,.1)] text-[#929AA5] hover:text-[#F6465D] transition-colors">
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
