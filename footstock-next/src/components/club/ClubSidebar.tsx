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
  Menu,
  Trophy,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { ROUTES } from "@/lib/constants/routes";

const NAV_ITEMS = [
  { href: ROUTES.CLUB, label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: `${ROUTES.CLUB}/desempenho`, label: "Desempenho do Ativo", icon: TrendingUp },
  { href: `${ROUTES.CLUB}/holders`, label: "Base de Holders", icon: Users },
  { href: `${ROUTES.CLUB}/relatorios`, label: "Relatórios", icon: BarChart3 },
  { href: `${ROUTES.CLUB}/calendario`, label: "Calendário Esportivo", icon: Calendar },
  { href: `${ROUTES.CLUB}/comunicados`, label: "Comunicados", icon: FileText },
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
      router.replace(ROUTES.LOGIN);
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <>
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

      <nav className="flex-1 py-2 overflow-y-auto" aria-label="Navegação do portal do clube">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-[rgba(240,185,11,.1)] text-[#F0B90B] font-medium"
                  : "text-[#929AA5] hover:text-[#EAECEF] hover:bg-[rgba(240,185,11,.05)]"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(240,185,11,.1)] p-3 space-y-1">
        <Link
          href={ROUTES.MERCADO}
          onClick={onLinkClick}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#929AA5] hover:text-[#EAECEF] hover:bg-[#1E2329] transition-colors min-h-[44px]"
        >
          <Trophy className="h-4 w-4 flex-shrink-0" />
          <span>Voltar ao mercado</span>
        </Link>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors min-h-[44px] ${
            isLoggingOut
              ? "cursor-not-allowed text-[#707A8A] bg-[#1E2329]/40"
              : "text-[#929AA5] hover:text-[#EAECEF] hover:bg-[#1E2329]"
          }`}
        >
          <LogOut size={18} aria-hidden="true" />
          <span>{isLoggingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>
    </>
  );
}

export function ClubSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 border-r border-[rgba(240,185,11,.1)] flex-col bg-[#0B0E11]/70 flex-shrink-0">
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
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#0B0E11] border-r border-[rgba(240,185,11,.1)] transition-transform duration-200 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu do portal do clube"
      >
        <SidebarNav onLinkClick={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile header with hamburger */}
      <div className="md:hidden h-14 flex items-center px-4 border-b border-[rgba(240,185,11,.1)] bg-[#0B0E11]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[#929AA5] hover:text-[#F0B90B] hover:bg-[rgba(240,185,11,.08)] transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <Image
            src="/logo-foot.png"
            alt="Foot Stock"
            width={20}
            height={20}
            className="h-5 w-5 object-contain"
          />
          <span className="text-sm font-bold text-[#EAECEF]">Portal do Clube</span>
        </div>
      </div>
    </>
  );
}
