"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  TrendingUp,
  Briefcase,
  Newspaper,
  Trophy,
  MoreHorizontal,
  X,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
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
  { label: "Dividendos", href: ROUTES.DIVIDENDOS, emoji: "💰" },
  { label: "Comunidade", href: ROUTES.COMUNIDADE, emoji: "💬" },
  { label: "Assessor IA", href: ROUTES.ASSESSOR, emoji: "🤖" },
  { label: "Glossário", href: ROUTES.GLOSSARIO, emoji: "📚" },
  { label: "Minha Conta", href: ROUTES.CONTA, emoji: "👤" },
  { label: "Planos", href: ROUTES.PLANOS, emoji: "⭐" },
];

function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setMoreOpen(false);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.auth.signOut();
      document.cookie = "fs-admin-role=; path=/; max-age=0";
      router.replace(ROUTES.HOME);
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <>
      <nav
        data-testid="bottom-tab-bar"
        className="fixed bottom-0 left-0 right-0 z-[200] h-14 flex items-center bg-[#181A20] border-t border-[rgba(240,185,11,.1)] md:hidden"
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
              data-tour={
                tab.label === "Portfolio" ? "portfolio-tab" :
                tab.label === "Ligas" ? "leagues-tab" :
                undefined
              }
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                isActive ? "text-[#F0B90B]" : "text-[#707A8A] hover:text-[#929AA5]"
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
          data-tour="glossary-link"
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[#707A8A] hover:text-[#929AA5] transition-colors"
          aria-label="Mais opções (inclui Glossário)"
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
              className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[rgba(240,185,11,.06)] transition-colors"
            >
              <span className="text-xl w-7 text-center">{item.emoji}</span>
              <span className="text-sm font-medium text-[#EAECEF]">{item.label}</span>
            </Link>
          ))}

          <hr className="my-1 border-[rgba(240,185,11,.08)]" />

          <button
            type="button"
            data-testid="drawer-mais-item-sair"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors w-full text-left",
              isLoggingOut
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-[rgba(239,68,68,.08)]"
            )}
          >
            <LogOut className="w-7 h-5 text-[#F6465D] flex-shrink-0" />
            <span className="text-sm font-medium text-[#F6465D]">
              {isLoggingOut ? "Saindo..." : "Sair da conta"}
            </span>
          </button>
        </nav>
      </Drawer>
    </>
  );
}

export { BottomTabBar };
