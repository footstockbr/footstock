"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
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
  ChevronRight,
  Menu,
} from "lucide-react";
import { ROUTES } from "@/lib/constants/routes";

const NAV_ITEMS = [
  { href: ROUTES.ADMIN, label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: ROUTES.ADMIN_MOTOR, label: "Motor de Mercado", icon: Gauge },
  { href: ROUTES.ADMIN_USUARIOS, label: "Usuários", icon: Users },
  { href: ROUTES.ADMIN_FINANCEIRO, label: "Financeiro", icon: CreditCard },
  { href: ROUTES.ADMIN_MODERACAO, label: "Moderação", icon: ShieldAlert },
  { href: ROUTES.ADMIN_NOTICIAS, label: "Notícias", icon: Newspaper },
  { href: ROUTES.ADMIN_ENGAJAMENTO, label: "Engajamento", icon: BarChart3 },
  { href: ROUTES.ADMIN_CLUBES, label: "Clubes", icon: Trophy },
  { href: ROUTES.ADMIN_PATROCINADORES, label: "Patrocinadores", icon: HandshakeIcon },
  { href: ROUTES.ADMIN_AFILIADOS, label: "Afiliados", icon: Network },
];

function SidebarNav({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
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
    <>
      <div className="h-14 flex items-center px-4 border-b border-[rgba(240,185,11,.1)] gap-2">
        <Shield className="h-5 w-5 text-[#F0B90B]" />
        <span className="text-sm font-bold text-[#EAECEF]">Admin Panel</span>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-[rgba(240,185,11,.1)] text-[#F0B90B] font-medium"
                  : "text-[#929AA5] hover:text-[#c5b99a] hover:bg-[rgba(240,185,11,.05)]"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(240,185,11,.1)] p-4">
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className={`flex items-center gap-2 text-sm transition-colors ${
            isLoggingOut
              ? "cursor-not-allowed text-[#707A8A]"
              : "text-[#929AA5] hover:text-[#c5b99a]"
          }`}
        >
          <LogOut className="h-4 w-4" />
          <span>{isLoggingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>
    </>
  );
}

export function AdminSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 border-r border-[rgba(240,185,11,.1)] flex-col bg-[#0a0908] flex-shrink-0">
        <SidebarNav />
      </aside>

      {/* Sidebar overlay — mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#0a0908] border-r border-[rgba(240,185,11,.1)] transition-transform duration-200 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu de administração"
      >
        <SidebarNav onLinkClick={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile header with hamburger */}
      <div className="md:hidden h-14 flex items-center px-4 border-b border-[rgba(240,185,11,.1)] bg-[#0a0908]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[#929AA5] hover:text-[#F0B90B] hover:bg-[rgba(240,185,11,.08)] transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <Shield className="h-4 w-4 text-[#F0B90B]" />
          <span className="text-sm font-bold text-[#EAECEF]">Admin Panel</span>
        </div>
      </div>
    </>
  );
}
