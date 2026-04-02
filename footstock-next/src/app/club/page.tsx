import type { Metadata } from "next";
import { Trophy, TrendingUp, Users, BarChart3, Calendar, FileText } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: "Portal do Clube — Foot Stock",
};

const MENU_ITEMS = [
  { icon: TrendingUp, label: "Desempenho do Ativo", description: "Preço histórico e volume", href: "#" },
  { icon: Users, label: "Base de Holders", description: "Quem investe no seu clube", href: "#" },
  { icon: BarChart3, label: "Relatórios", description: "Dados financeiros e esportivos", href: "#" },
  { icon: Calendar, label: "Calendário Esportivo", description: "Jogos e eventos que impactam", href: "#" },
  { icon: FileText, label: "Comunicados", description: "Publicar notícias oficiais", href: "#" },
];

export default function ClubPortalPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
      {/* Club header */}
      <div className="flex items-center gap-4 bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.18)] p-5 mb-6">
        <div className="w-14 h-14 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
          <Trophy className="h-7 w-7 text-[#F0B90B]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-bold text-[#EAECEF]">Flamengo</h1>
            <Badge variant="craque" size="xs">FLAM4</Badge>
          </div>
          <p className="text-sm text-[#929AA5]">Portal Oficial do Clube</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold font-mono text-[#EAECEF]">FS$ 87,40</p>
          <p className="text-sm font-mono text-[#4ade80]">+3,2%</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Holders" value="4.821" subValue="investidores" />
        <StatCard label="Volume (24h)" value="FS$ 124K" subValue="negociado" />
        <StatCard label="Market Cap" value="FS$ 8,74M" subValue="capitalização" />
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

      <div className="mt-6 text-center">
        <Link href={ROUTES.MERCADO} className="text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors">
          ← Voltar ao mercado
        </Link>
      </div>
    </div>
  );
}
