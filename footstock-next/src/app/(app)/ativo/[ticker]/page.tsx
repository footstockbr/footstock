import type { Metadata } from "next";
import { ChevronLeft, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { AtivoClient } from "./ativo-client";

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker} — Foot Stock` };
}

export default async function AtivoPage({ params }: Props) {
  const { ticker } = await params;

  return (
    <div className="flex flex-col">
      {/* Header com back + ação */}
      <div className="sticky top-14 z-[100] flex items-center justify-between px-4 py-3 bg-[#181A20] border-b border-[rgba(240,185,11,.1)]">
        <Link
          href={ROUTES.MERCADO}
          className="flex items-center gap-1 text-sm text-[#929AA5] hover:text-[#EAECEF] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Mercado
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-[#EAECEF]">{ticker}</span>
          <Badge variant="success" size="sm">BULLISH</Badge>
        </div>
        <Link
          href="#operar"
          className="flex items-center gap-1.5 bg-[#F0B90B] text-[#0B0E11] text-sm font-semibold px-3 py-1.5 rounded-md hover:bg-[#FCD535] transition-colors"
        >
          <ShoppingCart className="h-4 w-4" />
          Operar
        </Link>
      </div>

      {/* Price hero */}
      <div className="px-4 pt-4 pb-3 border-b border-[rgba(240,185,11,.08)]">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 border border-[rgba(240,185,11,.18)]"
            style={{ background: "linear-gradient(145deg, #F0B90B, #8a6820)" }}
          >
            {ticker.slice(0, 3)}
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#EAECEF]">{ticker}</h1>
            <p className="text-sm text-[#929AA5]">Clube da Série A</p>
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold font-mono text-[#EAECEF]">FS$ 87,50</span>
          <span className="text-sm font-medium text-[#2EBD85]">▲ +2,30%</span>
        </div>
        <p className="text-xs text-[#707A8A] mt-0.5">Última atualização: agora</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-[rgba(240,185,11,.08)]">
        <StatCard label="Volume 24h" value="2.340" />
        <StatCard label="Variação 7d" value="+12,4%" subValue="Tendência de alta" subValueColor="positive" />
        <StatCard label="Máx. 24h" value="FS$ 91,00" />
        <StatCard label="Mín. 24h" value="FS$ 85,20" />
      </div>

      {/* Interactive tabs (client component) */}
      <AtivoClient ticker={ticker} />
    </div>
  );
}
