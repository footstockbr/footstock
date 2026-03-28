"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionIndicator } from "./session-indicator";
import { MarketSession } from "@/lib/constants/market";
import { ROUTES } from "@/lib/constants/routes";

interface AppHeaderProps {
  session?: MarketSession;
  notificationCount?: number;
  className?: string;
}

function AppHeader({
  session = MarketSession.FECHADO,
  notificationCount = 0,
  className,
}: AppHeaderProps) {
  return (
    <header
      data-testid="header"
      className={cn(
        "sticky top-0 z-[200] h-14 flex items-center justify-between px-4 border-b border-[rgba(201,168,76,.1)]",
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
colors: primary (#C9A84C), background transparente
elements: Bola de futebol + elemento gráfico financeiro
avoid: Texto, complexidade excessiva, gradientes ruidosos
        */}
        <img
          src="/logo-foot.png"
          alt="Foot Stock"
          width={32}
          height={32}
          className="w-8 h-8 object-contain"
        />
        <span className="text-base font-bold text-[#f0ead6] tracking-tight hidden sm:block">
          Foot Stock
        </span>
      </Link>

      {/* Right actions */}
      <div data-testid="header-actions" className="flex items-center gap-3">
        <SessionIndicator session={session} showLabel={false} />
        <Link
          data-testid="header-notification-button"
          href={ROUTES.INBOX}
          className="relative p-2 rounded-md text-[#7a7060] hover:text-[#f0ead6] hover:bg-[#0f0e0b] transition-colors"
          aria-label={`Notificações${notificationCount > 0 ? ` — ${notificationCount} novas` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#c9a84c] rounded-full" />
          )}
        </Link>
      </div>
    </header>
  );
}

export { AppHeader };
