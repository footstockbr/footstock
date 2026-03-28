"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  X,
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const SidebarContent = () => (
    <>
      <div className="h-14 flex items-center px-4 border-b border-[rgba(201,168,76,.1)] gap-2">
        <Shield className="h-5 w-5 text-[#c9a84c]" />
        <span className="text-sm font-bold text-[#f0ead6]">Admin Panel</span>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-[rgba(201,168,76,.1)] text-[#c9a84c] font-medium"
                  : "text-[#7a7060] hover:text-[#c5b99a] hover:bg-[rgba(201,168,76,.05)]"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(201,168,76,.1)] p-4">
        <Link
          href={ROUTES.MERCADO}
          className="flex items-center gap-2 text-sm text-[#7a7060] hover:text-[#c5b99a] transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Voltar ao app</span>
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-[#080808] flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 border-r border-[rgba(201,168,76,.1)] flex-col bg-[#0a0908] flex-shrink-0">
        <SidebarContent />
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
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#0a0908] border-r border-[rgba(201,168,76,.1)] transition-transform duration-200 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu de administração"
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile header with hamburger */}
        <div className="md:hidden h-14 flex items-center px-4 border-b border-[rgba(201,168,76,.1)] bg-[#0a0908]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#7a7060] hover:text-[#c9a84c] hover:bg-[rgba(201,168,76,.08)] transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <Shield className="h-4 w-4 text-[#c9a84c]" />
            <span className="text-sm font-bold text-[#f0ead6]">Admin Panel</span>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
