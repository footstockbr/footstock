import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trophy, TrendingUp, Users, BarChart3, Calendar, FileText } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Portal do Clube — Foot Stock",
};

const MENU_ITEMS = [
  { icon: TrendingUp, label: "Desempenho do Ativo", description: "Preco historico e volume", href: "#" },
  { icon: Users, label: "Base de Holders", description: "Quem investe no seu clube", href: "#" },
  { icon: BarChart3, label: "Relatorios", description: "Dados financeiros e esportivos", href: "#" },
  { icon: Calendar, label: "Calendario Esportivo", description: "Jogos e eventos que impactam", href: "#" },
  { icon: FileText, label: "Comunicados", description: "Publicar noticias oficiais", href: "#" },
];

function formatFS(value: number): string {
  return `FS$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `FS$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}M`;
  if (value >= 1_000) return `FS$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}K`;
  return formatFS(value);
}

export default async function ClubPortalPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  // Find the club partner's asset via favoriteClub (club slug)
  const clubSlug = auth.user.favoriteClub;
  if (!clubSlug) redirect("/");

  const asset = await prisma.asset.findUnique({
    where: { clubSlug },
  });

  if (!asset) redirect("/");

  // Count distinct holders (users with open positions on this asset)
  const holdersResult = await prisma.position.groupBy({
    by: ["userId"],
    where: { assetId: asset.id, status: "OPEN" },
  });
  const holdersCount = holdersResult.length;

  const currentPrice = asset.currentPrice.toNumber();
  const openPrice = asset.openPrice.toNumber();
  const changePct = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;
  const changeSign = changePct >= 0 ? "+" : "";
  const changeColor = changePct >= 0 ? "text-[#4ade80]" : "text-[#F6465D]";

  const volume = Number(asset.volume);
  const marketCap = asset.marketCap.toNumber();

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
      {/* Club header */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5 mb-6">
        <div className="w-14 h-14 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <Trophy className="h-7 w-7 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-bold text-[#EAECEF]">{asset.name}</h1>
            <Badge variant="craque" size="xs">{asset.ticker}</Badge>
          </div>
          <p className="text-sm text-[#929AA5]">Portal Oficial do Clube</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold font-mono text-[#EAECEF]">{formatFS(currentPrice)}</p>
          <p className={`text-sm font-mono ${changeColor}`}>
            {changeSign}{changePct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Holders"
          value={holdersCount.toLocaleString("pt-BR")}
          subValue="investidores"
        />
        <StatCard
          label="Volume (24h)"
          value={formatCompact(volume)}
          subValue="negociado"
        />
        <StatCard
          label="Market Cap"
          value={formatCompact(marketCap)}
          subValue="capitalizacao"
        />
      </div>

      {/* Menu */}
      <div className="flex flex-col gap-2">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-4 p-4 rounded-xl bg-[#1E2329] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.25)] hover:bg-[rgba(240,185,11,.04)] transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-[rgba(240,185,11,.1)] flex items-center justify-center flex-shrink-0">
                <Icon className="h-4.5 w-4.5 text-[#F0B90B]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#EAECEF]">{item.label}</p>
                <p className="text-xs text-[#929AA5]">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
