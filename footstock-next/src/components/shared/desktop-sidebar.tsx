"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants/routes";

const BASE_NAV_ITEMS = [
  { href: ROUTES.MERCADO, label: "Mercado" },
  { href: ROUTES.PORTFOLIO, label: "Carteira" },
  { href: ROUTES.DIVIDENDOS, label: "Dividendos" },
  { href: ROUTES.NOTICIAS, label: "Notícias" },
  { href: ROUTES.LIGAS, label: "Ligas" },
  { href: ROUTES.COMUNIDADE, label: "Comunidade" },
  { href: ROUTES.ASSESSOR, label: "Assessor IA" },
  { href: ROUTES.GLOSSARIO, label: "Glossário" },
  { href: ROUTES.PERFIL, label: "Perfil" },
];

function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathname ?? "";
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.auth.signOut();
      document.cookie = "fs-admin-role=; path=/; max-age=0";
      router.replace(ROUTES.LOGIN);
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <aside data-testid="sidebar" className="hidden md:flex md:w-64 md:flex-col md:flex-shrink-0 md:h-dvh md:sticky md:top-0 md:border-r md:border-[rgba(240,185,11,.1)] md:bg-[#0B0E11]/70">
      <div className="h-14 border-b border-[rgba(240,185,11,.1)] px-4 flex items-center">
        <Link
          data-testid="sidebar-logo"
          href={ROUTES.MERCADO}
          aria-label="FootStock — A bolsa do futebol"
          className="flex min-w-0 items-center gap-2"
        >
          <Image
            src="/logo-foot.png"
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 object-contain"
            priority
          />
          <div className="flex min-w-0 flex-col justify-center leading-none">
            <span className="truncate text-sm font-bold text-[#F0B90B] tracking-tight">
              FootStock
            </span>
            <span className="mt-0.5 truncate text-[9px] font-medium text-[#F0B90B]/80 tracking-[0.02em]">
              A bolsa do futebol
            </span>
          </div>
        </Link>
      </div>

      <nav data-testid="sidebar-nav" className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Menu principal desktop">
        {BASE_NAV_ITEMS.map((item) => {
          const isActive =
            currentPath === item.href ||
            (item.href !== ROUTES.MERCADO && currentPath.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`sidebar-nav-item-${item.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`}
              data-tour={
                item.label === "Glossário" ? "glossary-link" :
                item.label === "Carteira" ? "portfolio-tab" :
                item.label === "Ligas" ? "leagues-tab" :
                undefined
              }
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm min-h-[44px] transition-colors",
                isActive
                  ? "bg-[rgba(240,185,11,.12)] text-[#F0B90B] border border-[rgba(240,185,11,.25)]"
                  : "text-[#929AA5] hover:text-[#EAECEF] hover:bg-[#1E2329]"
              )}
            >
              {item.label}
            </Link>
          );
        })}

      </nav>

      <div data-testid="sidebar-footer" className="mt-auto border-t border-[rgba(240,185,11,.1)] p-3">
        <button
          data-testid="sidebar-logout-button"
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm min-h-[44px] transition-colors",
            isLoggingOut
              ? "cursor-not-allowed text-[#707A8A] bg-[#1E2329]/40"
              : "text-[#929AA5] hover:text-[#EAECEF] hover:bg-[#1E2329]"
          )}
        >
          <LogOut size={18} aria-hidden="true" />
          <span>{isLoggingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>
    </aside>
  );
}

export { DesktopSidebar };
