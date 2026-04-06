"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { ROUTES } from "@/lib/constants/routes";

export function LogoutButton() {
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
      router.replace(ROUTES.HOME);
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="conta-logout-button"
      onClick={() => void handleLogout()}
      disabled={isLoggingOut}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-lg transition-colors text-left w-full ${
        isLoggingOut
          ? "cursor-not-allowed opacity-60"
          : "hover:bg-[rgba(239,68,68,.08)]"
      }`}
    >
      <LogOut className="h-5 w-5 text-[#F6465D]" />
      <span className="text-sm font-medium text-[#F6465D]">
        {isLoggingOut ? "Saindo..." : "Sair da conta"}
      </span>
    </button>
  );
}
