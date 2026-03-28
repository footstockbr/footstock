import type { Metadata } from "next";
import { Coins, TrendingUp, Calendar, Info } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Dividendos — Foot Stock",
};

const MOCK_HISTORY = [
  {
    id: 1,
    ticker: "FLAM4",
    club: "Flamengo",
    amount: "FS$ 0,85",
    type: "Rendimento",
    date: "Mar 2026",
    status: "pago",
  },
  {
    id: 2,
    ticker: "PALM4",
    club: "Palmeiras",
    amount: "FS$ 0,42",
    type: "Rendimento",
    date: "Mar 2026",
    status: "pago",
  },
  {
    id: 3,
    ticker: "CORI4",
    club: "Corinthians",
    amount: "FS$ 0,31",
    type: "Título",
    date: "Fev 2026",
    status: "pago",
  },
];

export default function DividendosPage() {
  const isLocked = false; // TODO: verificar plano — disponível a partir do Craque

  return (
    <div className="px-4 pt-4">
      <h1 className="text-lg font-bold text-[#f0ead6] mb-1 flex items-center gap-2">
        <Coins className="h-5 w-5 text-[#c9a84c]" />
        Dividendos
      </h1>
      <p className="text-sm text-[#7a7060] mb-4">Rendimentos e bonificações das suas cotas</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <StatCard label="Total Recebido" value="FS$ 1,58" subValue="últimos 30 dias" />
        <StatCard label="Próximo Pagamento" value="—" subValue="Sem posições elegíveis" />
      </div>

      {/* Info card */}
      <div className="bg-[rgba(96,165,250,.06)] rounded-lg border border-[rgba(96,165,250,.2)] p-4 mb-6 flex gap-3">
        <Info className="h-4 w-4 text-[#60a5fa] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#93c5fd] mb-0.5">Como funcionam os dividendos?</p>
          <p className="text-xs text-[#7a7060] leading-relaxed">
            Clubes distribuem rendimentos com base em desempenho esportivo, títulos e patrocínios.
            Você recebe proporcionalmente às cotas que possui.
          </p>
        </div>
      </div>

      {/* History */}
      <h2 className="text-sm font-semibold text-[#f0ead6] mb-3 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[#7a7060]" />
        Histórico de Pagamentos
      </h2>

      {MOCK_HISTORY.length > 0 ? (
        <div className="flex flex-col gap-2">
          {MOCK_HISTORY.map((item) => (
            <div
              key={item.id}
              className="bg-[#141210] rounded-lg border border-[rgba(201,168,76,.1)] p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[rgba(201,168,76,.12)] flex items-center justify-center">
                  <span className="text-xs font-bold font-mono text-[#c9a84c]">{item.ticker.slice(0, 2)}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#f0ead6]">{item.ticker}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-[#7a7060]">{item.date}</span>
                    <span className="text-[10px] text-[#4a3d2a]">·</span>
                    <Badge variant="default" size="xs">{item.type}</Badge>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold font-mono text-[#4ade80]">{item.amount}</p>
                <p className="text-[10px] text-[#4ade80] opacity-70">Pago</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<TrendingUp />}
          title="Nenhum dividendo ainda"
          description="Invista em clubes para começar a receber rendimentos automáticos"
        />
      )}
    </div>
  );
}
