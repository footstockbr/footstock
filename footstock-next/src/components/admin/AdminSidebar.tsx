"use client";
// ============================================================================
// Foot Stock — AdminSidebar
// Sidebar do painel admin com links filtrados por role e navegação mobile por tabs.
// Rastreabilidade: INT-085, TASK-1/ST004
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Gauge,
  Users,
  CreditCard,
  ShieldAlert,
  Newspaper,
  BarChart3,
  Shield,
  Trophy,
  HandshakeIcon,
  Network,
  LogOut,
  MoreHorizontal,
  X,
  Bell,
  FileText,
  Settings,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { cn } from "@/lib/utils";
import { canAccess, type AdminResource } from "@/lib/auth/canAccess";
import { ROUTES } from "@/lib/constants/routes";
import type { AdminRole } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  resource: AdminResource;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: ROUTES.ADMIN, label: "Dashboard", icon: LayoutDashboard, resource: "admin:dashboard", exact: true },
  { href: ROUTES.ADMIN_MOTOR, label: "Motor", icon: Gauge, resource: "motor:read" },
  { href: ROUTES.ADMIN_ENGAJAMENTO, label: "Engajamento", icon: BarChart3, resource: "engagement:read" },
  { href: ROUTES.ADMIN_NOTICIAS, label: "Notícias", icon: Newspaper, resource: "news:read" },
  { href: ROUTES.ADMIN_USUARIOS, label: "Usuários", icon: Users, resource: "users:read" },
  { href: ROUTES.ADMIN_FINANCEIRO, label: "Financeiro", icon: CreditCard, resource: "financial:read" },
  { href: ROUTES.ADMIN_MODERACAO, label: "Moderação", icon: ShieldAlert, resource: "forum:moderate" },
  { href: ROUTES.ADMIN_CLUBES, label: "Clubes", icon: Trophy, resource: "leagues:moderate" },
  { href: ROUTES.ADMIN_PATROCINADORES, label: "Patrocinadores", icon: HandshakeIcon, resource: "assets:write" },
  { href: ROUTES.ADMIN_AFILIADOS, label: "Afiliados", icon: Network, resource: "admin:manage" },
  { href: ROUTES.ADMIN_LGPD, label: "LGPD / DPO", icon: FileText, resource: "admin:audit" },
  { href: ROUTES.ADMIN_CONFIGURACOES, label: "Configurações", icon: Settings, resource: "admin:config" },
];

// Primeiros 5 hrefs aparecem diretamente no bottom tab bar mobile
const PRIMARY_MOBILE_HREFS: Set<string> = new Set([
  ROUTES.ADMIN,
  ROUTES.ADMIN_MOTOR,
  ROUTES.ADMIN_ENGAJAMENTO,
  ROUTES.ADMIN_NOTICIAS,
  ROUTES.ADMIN_USUARIOS,
]);

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "SuperAdmin",
  ADMINISTRADOR: "Administrador",
  MONITOR: "Monitor",
  EDITOR: "Editor",
  MODERADOR: "Moderador",
  CLUB_PARTNER: "Clube Parceiro",
};

interface AdminSidebarProps {
  adminRole: AdminRole;
}

export function AdminSidebar({ adminRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathname ?? "";
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => canAccess(adminRole, item.resource)),
    [adminRole]
  );

  const mobilePrimaryItems = useMemo(
    () => visibleItems.filter((item) => PRIMARY_MOBILE_HREFS.has(item.href)),
    [visibleItems]
  );

  const mobileSecondaryItems = useMemo(
    () => visibleItems.filter((item) => !PRIMARY_MOBILE_HREFS.has(item.href)),
    [visibleItems]
  );

  const isMoreActive = mobileSecondaryItems.some(
    (item) =>
      currentPath === item.href ||
      (!item.exact && currentPath.startsWith(item.href))
  );

  const activeItem = visibleItems.find(
    (item) =>
      item.exact
        ? currentPath === item.href
        : currentPath.startsWith(item.href)
  );

  const roleLabel = ROLE_LABEL[adminRole] ?? adminRole;

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

  // ── Sidebar desktop ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Sidebar — desktop */}
      <aside data-testid="admin-sidebar" className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-[rgba(240,185,11,.1)] bg-[#0a0908] h-dvh sticky top-0">
        <div className="h-14 flex items-center px-4 border-b border-[rgba(240,185,11,.1)] gap-2">
          <Shield className="h-5 w-5 text-[#F0B90B]" />
          <div>
            <p className="text-sm font-bold text-[#EAECEF]">Admin Panel</p>
            <p className="text-[11px] text-[#F0B90B]">{roleLabel}</p>
          </div>
        </div>

        <nav data-testid="admin-sidebar-nav" className="flex-1 py-2 overflow-y-auto" aria-label="Navegação do painel admin">
          {visibleItems.map((item) => {
            const isActive = item.exact
              ? currentPath === item.href
              : currentPath.startsWith(item.href);
            const Icon = item.icon;
            const slug = item.label
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, "-");
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`admin-sidebar-nav-item-${slug}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md mx-2 px-3 py-2.5 text-sm transition-colors min-h-[44px]",
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

        <div className="border-t border-[rgba(240,185,11,.1)] p-3">
          <button
            type="button"
            data-testid="admin-sidebar-logout-button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors min-h-[44px]",
              isLoggingOut
                ? "cursor-not-allowed text-[#707A8A]"
                : "text-[#929AA5] hover:bg-[rgba(240,185,11,.05)] hover:text-[#EAECEF]"
            )}
          >
            <LogOut className="h-4 w-4" />
            <span>{isLoggingOut ? "Saindo..." : "Sair"}</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile: header sticky ──────────────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 border-b border-[rgba(240,185,11,.1)] bg-[#0a0908]/95 backdrop-blur-sm w-full">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#EAECEF]">
              {activeItem?.label ?? "Admin"}
            </p>
            <p className="text-[11px] text-[#F0B90B]">{roleLabel}</p>
          </div>

          <div className="flex items-center gap-1">
            <Link
              href={ROUTES.INBOX}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-[#929AA5] hover:bg-[rgba(240,185,11,.08)] hover:text-[#EAECEF] transition-colors"
              aria-label="Notificações"
            >
              <Bell className="h-5 w-5" />
            </Link>
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
              aria-label="Sair do painel admin"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile: bottom tab bar ─────────────────────────────────────────── */}
      <nav
        aria-label="Navegação principal admin"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[rgba(240,185,11,.1)] bg-[#0a0908]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
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

          {mobileSecondaryItems.length > 0 && (
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
          )}
        </div>
      </nav>

      {/* ── Mobile: sheet "Mais" ───────────────────────────────────────────── */}
      {isMoreOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setIsMoreOpen(false)}
            aria-label="Fechar menu de módulos extras"
          />
          <aside className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-[rgba(240,185,11,.1)] bg-[#0a0908] p-4 md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#EAECEF]">Módulos admin</h2>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-[#929AA5] hover:bg-[rgba(240,185,11,.08)] hover:text-[#EAECEF] transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="space-y-1" aria-label="Módulos extras do admin">
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
          </aside>
        </>
      )}
    </>
  );
}
