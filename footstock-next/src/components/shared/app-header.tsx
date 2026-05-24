"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { MarketSessionBadge } from "@/components/market/MarketSessionBadge";
import { ROUTES } from "@/lib/constants/routes";

// Dynamic import — evita SSR issues com hooks client-only + React Query
const NotificationBell = dynamic(
  () => import("@/components/notifications/NotificationBell").then((m) => ({ default: m.NotificationBell })),
  {
    ssr: false,
    loading: () => <div className="w-[44px] h-[44px]" aria-hidden="true" />,
  }
)

interface AppHeaderProps {
  className?: string;
}

function AppHeader({ className }: AppHeaderProps) {
  return (
    <header
      data-testid="header"
      className={cn(
        "sticky top-0 z-[200] h-14 flex items-center justify-between px-4 border-b border-[rgba(240,185,11,.1)]",
        "bg-[rgba(15,14,11,0.92)] backdrop-blur-md",
        className
      )}
    >
      {/* Logo */}
      <Link
        data-testid="header-logo"
        href={ROUTES.MERCADO}
        aria-label="FootStock — A bolsa do futebol"
        className="flex min-w-0 items-center gap-2 md:hidden"
      >
        {/* @ASSET_PLACEHOLDER
name: logo-foot
type: image
extension: png
aspect_ratio: 1:1
dimensions: 32x32
description: Logo símbolo do FootStock. Bola de futebol estilizada com elementos financeiros, fundo transparente, design minimalista premium.
context: Header do app, ícone de navegação
style: Minimalista, linhas finas, dourado sobre preto
mood: Premium, esportivo, financeiro
colors: primary (#F0B90B), background transparente
elements: Bola de futebol + elemento gráfico financeiro
avoid: Texto, complexidade excessiva, gradientes ruidosos
        */}
        <Image
          src="/logo-foot.png"
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          className="w-8 h-8 shrink-0 object-contain"
        />
        <div className="flex min-w-0 flex-col justify-center leading-none">
          <span className="truncate text-sm font-bold text-[#F0B90B] tracking-tight">
            FootStock
          </span>
          <span className="mt-0.5 truncate text-[10px] font-medium text-[#F0B90B]/80 tracking-[0.02em]">
            A bolsa do futebol
          </span>
        </div>
      </Link>

      {/* Right actions */}
      <div data-testid="header-actions" className="flex items-center gap-2">
        {/* Mobile (≤640px): compact — s�� dot. Desktop: label + countdown + tooltip */}
        <MarketSessionBadge compact className="sm:hidden" />
        <MarketSessionBadge className="hidden sm:flex" />
        <div data-tour="notification-bell" className="inline-flex items-center">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}

export { AppHeader };
