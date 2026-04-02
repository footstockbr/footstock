"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { SessionIndicator } from "@/components/market/session-indicator";
import { ROUTES } from "@/lib/constants/routes";

// Dynamic import — evita SSR issues com Supabase hooks + React Query
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
      <Link data-testid="header-logo" href={ROUTES.MERCADO} className="flex items-center gap-2 shrink-0">
        {/* @ASSET_PLACEHOLDER
name: logo-foot
type: image
extension: png
aspect_ratio: 1:1
dimensions: 32x32
description: Logo símbolo do Foot Stock. Bola de futebol estilizada com elementos financeiros, fundo transparente, design minimalista premium.
context: Header do app, ícone de navegação
style: Minimalista, linhas finas, dourado sobre preto
mood: Premium, esportivo, financeiro
colors: primary (#F0B90B), background transparente
elements: Bola de futebol + elemento gráfico financeiro
avoid: Texto, complexidade excessiva, gradientes ruidosos
        */}
        <Image
          src="/logo-foot.png"
          alt="Foot Stock"
          width={32}
          height={32}
          className="w-8 h-8 object-contain"
        />
        <span className="text-base font-bold text-[#EAECEF] tracking-tight hidden sm:block">
          Foot Stock
        </span>
      </Link>

      {/* Right actions */}
      <div data-testid="header-actions" className="flex items-center gap-2">
        {/* Mobile (≤640px): compact — só dot. Desktop: label + countdown */}
        <SessionIndicator compact className="sm:hidden" />
        <SessionIndicator className="hidden sm:flex" />
        <NotificationBell />
      </div>
    </header>
  );
}

export { AppHeader };
