import type { Metadata } from "next";
import { User, Settings, LogOut, Shield, CreditCard, Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/shared/plan-badge";
import { PlanType } from "@/lib/constants/plans";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: "Minha Conta — Foot Stock",
};

export default function ContaPage() {
  return (
    <div data-testid="conta-page" className="px-4 pt-4 pb-6">
      {/* Profile header */}
      <div data-testid="conta-profile-header" className="flex items-center gap-4 bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 mb-4">
        <Avatar name="João Silva" size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-[#EAECEF]">João Silva</p>
          <p className="text-sm text-[#929AA5] truncate">joao@exemplo.com</p>
          <div className="mt-1">
            <PlanBadge plan={PlanType.JOGADOR} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-3 text-center">
          <p className="text-lg font-bold font-mono text-[#EAECEF]">0</p>
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide">Ordens</p>
        </div>
        <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-3 text-center">
          <p className="text-lg font-bold font-mono text-[#EAECEF]">0</p>
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide">Ligas</p>
        </div>
        <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.1)] p-3 text-center">
          <p className="text-lg font-bold font-mono text-[#EAECEF]">#—</p>
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide">Ranking</p>
        </div>
      </div>

      {/* Upgrade CTA */}
      <div data-testid="conta-upgrade-cta" className="bg-[rgba(240,185,11,.08)] rounded-lg border border-[rgba(240,185,11,.25)] p-4 mb-4">
        <p className="text-sm font-semibold text-[#F0B90B] mb-1">⭐ Faça upgrade para Craque</p>
        <p className="text-xs text-[#929AA5] mb-3">
          Dados em tempo real, assessor IA e muito mais por apenas R$ 19,90/mês
        </p>
        <Link href={ROUTES.PLANOS}>
          <Button data-testid="conta-upgrade-button" variant="plan" size="md" fullWidth>Ver planos</Button>
        </Link>
      </div>

      {/* Menu */}
      <div data-testid="conta-menu" className="flex flex-col gap-1">
        {[
          { icon: User, label: "Editar perfil", href: "#" },
          { icon: Bell, label: "Notificações", href: ROUTES.INBOX },
          { icon: CreditCard, label: "Plano e pagamento", href: ROUTES.PLANOS },
          { icon: Shield, label: "Privacidade e segurança", href: "#" },
          { icon: Settings, label: "Configurações", href: "#" },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            data-testid={`conta-menu-item-${item.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`}
            className="flex items-center gap-3 px-4 py-3.5 rounded-lg hover:bg-[rgba(240,185,11,.06)] transition-colors"
          >
            <item.icon className="h-5 w-5 text-[#929AA5]" />
            <span className="text-sm font-medium text-[#EAECEF]">{item.label}</span>
          </Link>
        ))}

        <hr className="my-2 border-[rgba(240,185,11,.08)]" />

        <button data-testid="conta-logout-button" className="flex items-center gap-3 px-4 py-3.5 rounded-lg hover:bg-[rgba(239,68,68,.08)] transition-colors text-left w-full">
          <LogOut className="h-5 w-5 text-[#F6465D]" />
          <span className="text-sm font-medium text-[#F6465D]">Sair da conta</span>
        </button>
      </div>
    </div>
  );
}
