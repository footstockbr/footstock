"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp,
  Briefcase,
  Newspaper,
  Trophy,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants/routes";
import { Drawer } from "@/components/ui/drawer";

const MAIN_TABS = [
  { label: "Mercado", icon: TrendingUp, href: ROUTES.MERCADO },
  { label: "Portfolio", icon: Briefcase, href: ROUTES.PORTFOLIO },
  { label: "Notícias", icon: Newspaper, href: ROUTES.NOTICIAS },
  { label: "Ligas", icon: Trophy, href: ROUTES.LIGAS },
];

const DRAWER_ITEMS = [
  { label: "Comunidade", href: ROUTES.COMUNIDADE, emoji: "💬" },
  { label: "Assessor IA", href: ROUTES.ASSESSOR, emoji: "🤖" },
  { label: "Glossário", href: ROUTES.GLOSSARIO, emoji: "📚" },
  { label: "Minha Conta", href: ROUTES.CONTA, emoji: "👤" },
  { label: "Planos", href: ROUTES.PLANOS, emoji: "⭐" },
];

function BottomTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        data-testid="bottom-tab-bar"
        className="fixed bottom-0 left-0 right-0 z-[200] h-14 flex items-center bg-[#0f0e0b] border-t border-[rgba(201,168,76,.1)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navegação principal"
      >
        {MAIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={`bottom-tab-${tab.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                isActive ? "text-[#c9a84c]" : "text-[#4a3d2a] hover:text-[#7a7060]"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}

        {/* Mais */}
        <button
          data-testid="bottom-tab-mais"
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[#4a3d2a] hover:text-[#7a7060] transition-colors"
          aria-label="Mais opções"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">Mais</span>
        </button>
      </nav>

      {/* Drawer — Mais */}
      <Drawer isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Mais — Foot Stock">
        <nav data-testid="drawer-mais-nav" className="flex flex-col gap-1">
          {DRAWER_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`drawer-mais-item-${item.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[rgba(201,168,76,.06)] transition-colors"
            >
              <span className="text-xl w-7 text-center">{item.emoji}</span>
              <span className="text-sm font-medium text-[#f0ead6]">{item.label}</span>
            </Link>
          ))}
        </nav>
      </Drawer>
    </>
  );
}

export { BottomTabBar };
