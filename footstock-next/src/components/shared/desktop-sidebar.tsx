"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Shield, Trophy } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants/routes";

const BASE_NAV_ITEMS = [
  { href: ROUTES.MERCADO, label: "Mercado" },
  { href: ROUTES.PORTFOLIO, label: "Carteira" },
  { href: ROUTES.NOTICIAS, label: "Notícias" },
  { href: ROUTES.LIGAS, label: "Ligas" },
  { href: ROUTES.COMUNIDADE, label: "Comunidade" },
  { href: ROUTES.ASSESSOR, label: "Assessor IA" },
  { href: ROUTES.PERFIL, label: "Perfil" },
];

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMINISTRADOR", "MONITOR", "EDITOR", "MODERADOR"];

function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathname ?? "";
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data?.adminRole) setAdminRole(json.data.adminRole);
      })
      .catch(() => {});
  }, []);

  const isAdmin = adminRole && ADMIN_ROLES.includes(adminRole);
  const isClubPartner = adminRole === "CLUB_PARTNER";

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
    <aside className="hidden md:flex md:w-64 md:h-dvh md:sticky md:top-0 md:self-start md:flex-col md:border-r md:border-[rgba(240,185,11,.1)] md:bg-[#0B0E11]/70 md:z-40">
      <div className="h-14 border-b border-[rgba(240,185,11,.1)] px-4 flex items-center">
        <Link href={ROUTES.MERCADO} className="flex items-center gap-2">
          <Image
            src="/logo-foot.png"
            alt="Foot Stock"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
            priority
          />
          <span className="text-sm font-semibold text-[#EAECEF]">Foot Stock</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Menu principal desktop">
        {BASE_NAV_ITEMS.map((item) => {
          const isActive =
            currentPath === item.href ||
            (item.href !== ROUTES.MERCADO && currentPath.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
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

        {isAdmin && (
          <Link
            href={ROUTES.ADMIN}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm min-h-[44px] transition-colors mt-2 border-t border-[rgba(240,185,11,.08)] pt-3",
              currentPath.startsWith(ROUTES.ADMIN)
                ? "bg-[rgba(240,185,11,.12)] text-[#F0B90B] border border-[rgba(240,185,11,.25)]"
                : "text-[#929AA5] hover:text-[#EAECEF] hover:bg-[#1E2329]"
            )}
          >
            <Shield className="h-4 w-4" />
            Admin
          </Link>
        )}

        {isClubPartner && (
          <Link
            href={ROUTES.CLUB}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm min-h-[44px] transition-colors mt-2 border-t border-[rgba(240,185,11,.08)] pt-3",
              currentPath.startsWith(ROUTES.CLUB)
                ? "bg-[rgba(240,185,11,.12)] text-[#F0B90B] border border-[rgba(240,185,11,.25)]"
                : "text-[#929AA5] hover:text-[#EAECEF] hover:bg-[#1E2329]"
            )}
          >
            <Trophy className="h-4 w-4" />
            Portal do Clube
          </Link>
        )}
      </nav>

      <div className="mt-auto border-t border-[rgba(240,185,11,.1)] p-3">
        <button
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
