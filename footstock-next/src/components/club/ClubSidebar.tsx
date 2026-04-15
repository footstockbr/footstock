"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  BarChart3,
  Calendar,
  FileText,
  LogOut,
  ChevronRight,
  Trophy,
  MoreHorizontal,
  X,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants/routes";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: ROUTES.CLUB, label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: `${ROUTES.CLUB}/desempenho`, label: "Desempenho", icon: TrendingUp },
  { href: `${ROUTES.CLUB}/holders`, label: "Holders", icon: Users },
  { href: `${ROUTES.CLUB}/relatorios`, label: "Relatórios", icon: BarChart3 },
  { href: `${ROUTES.CLUB}/calendario`, label: "Calendário", icon: Calendar },
  { href: `${ROUTES.CLUB}/comunicados`, label: "Comunicados", icon: FileText },
];

// Itens exibidos diretamente no bottom tab bar mobile
const PRIMARY_MOBILE_HREFS = new Set([
  ROUTES.CLUB,
  `${ROUTES.CLUB}/desempenho`,
  `${ROUTES.CLUB}/holders`,
  `${ROUTES.CLUB}/relatorios`,
]);

export function ClubSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathname ?? "";
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const mobilePrimaryItems = NAV_ITEMS.filter((item) =>
    PRIMARY_MOBILE_HREFS.has(item.href)
  );
  const mobileSecondaryItems = NAV_ITEMS.filter(
    (item) => !PRIMARY_MOBILE_HREFS.has(item.href)
  );

  const isMoreActive = mobileSecondaryItems.some(
    (item) =>
      currentPath === item.href ||
      (!item.exact && currentPath.startsWith(item.href))
  );

  const activeItem = NAV_ITEMS.find((item) =>
    item.exact ? currentPath === item.href : currentPath.startsWith(item.href)
  );

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // Logout via API: registra ClubAccessLog, invalida sessão Supabase e limpa cookies HttpOnly
      await fetch('/api/v1/club/auth/logout', { method: 'POST', credentials: 'include' });
      // Limpar sessão Supabase no cliente (fallback)
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.auth.signOut();
      // fs-admin-role é não-httpOnly — pode ser limpo no cliente como reforço
      document.cookie = "fs-admin-role=; path=/; max-age=0";
      router.replace('/club/login');
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <>
      {/* ── Sidebar — desktop ───────────────────────────────────────────────── */}
      <aside data-testid="club-sidebar" className="hidden md:flex w-64 h-dvh flex-shrink-0 border-r border-[rgba(240,185,11,.1)] flex-col bg-[#0B0E11]/70 sticky top-0">
        <div className="h-14 flex items-center px-4 border-b border-[rgba(240,185,11,.1)] gap-2">
          <Image
            src="/logo-foot.png"
            alt="Foot Stock"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
          <div>
            <span className="text-sm font-bold text-[#EAECEF]">Portal do Clube</span>
          </div>
        </div>

        <nav data-testid="club-sidebar-nav" className="flex-1 py-2 overflow-y-auto" aria-label="Navegação do portal do clube">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? currentPath === item.href
              : currentPath.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`club-sidebar-nav-item-${item.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-[rgba(240,185,11,.1)] text-[#F0B90B] font-medium"
                    : "text-[#929AA5] hover:text-[#EAECEF] hover:bg-[rgba(240,185,11,.05)]"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div data-testid="club-sidebar-footer" className="border-t border-[rgba(240,185,11,.1)] p-3 space-y-1">
          <Link
            data-testid="club-sidebar-back-mercado-link"
            href={ROUTES.MERCADO}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#929AA5] hover:text-[#EAECEF] hover:bg-[#1E2329] transition-colors min-h-[44px]"
          >
            <Trophy className="h-4 w-4 flex-shrink-0" />
            <span>Voltar ao mercado</span>
          </Link>
          <button
            data-testid="club-sidebar-logout-button"
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors min-h-[44px]",
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

      {/* ── Mobile: header sticky ──────────────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 border-b border-[rgba(240,185,11,.1)] bg-[#0B0E11]/95 backdrop-blur-sm w-full">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo-foot.png"
              alt="Foot Stock"
              width={20}
              height={20}
              className="h-5 w-5 object-contain flex-shrink-0"
            />
            <p className="truncate text-sm font-semibold text-[#EAECEF]">
              {activeItem?.label ?? "Portal do Clube"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className={cn(
              "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 transition-colors",
              isLoggingOut
                ? "cursor-not-allowed text-[#707A8A]"
                : "text-[#929AA5] hover:bg-[rgba(240,185,11,.08)] hover:text-[#EAECEF]"
            )}
            aria-label="Sair do portal do clube"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ── Mobile: bottom tab bar ─────────────────────────────────────────── */}
      <nav
        aria-label="Navegação do clube"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[rgba(240,185,11,.1)] bg-[#0B0E11]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <div className="flex h-14">
          {mobilePrimaryItems.map((item) => {
            const isActive = item.exact
              ? currentPath === item.href
              : currentPath.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
                  isActive ? "text-[#F0B90B]" : "text-[#929AA5] hover:text-[#EAECEF]"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            aria-current={isMoreActive ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
              isMoreActive ? "text-[#F0B90B]" : "text-[#929AA5] hover:text-[#EAECEF]"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Mais</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile: sheet "Mais" ───────────────────────────────────────────── */}
      {isMoreOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setIsMoreOpen(false)}
            aria-label="Fechar menu"
          />
          <aside className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-[rgba(240,185,11,.1)] bg-[#0B0E11] p-4 md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#EAECEF]">Portal do Clube</h2>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-[#929AA5] hover:bg-[rgba(240,185,11,.08)] hover:text-[#EAECEF] transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="space-y-1" aria-label="Seções extras do clube">
              {mobileSecondaryItems.map((item) => {
                const isActive = item.exact
                  ? currentPath === item.href
                  : currentPath.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMoreOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "bg-[rgba(240,185,11,.12)] text-[#F0B90B]"
                        : "text-[#929AA5] hover:bg-[rgba(240,185,11,.05)] hover:text-[#EAECEF]"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-3 pt-3 border-t border-[rgba(240,185,11,.1)]">
              <Link
                href={ROUTES.MERCADO}
                onClick={() => setIsMoreOpen(false)}
                className="flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[#929AA5] hover:bg-[rgba(240,185,11,.05)] hover:text-[#EAECEF] transition-colors"
              >
                <Trophy className="h-4 w-4 flex-shrink-0" />
                <span>Voltar ao mercado</span>
              </Link>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
