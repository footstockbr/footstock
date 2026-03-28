import type { ReactNode } from "react";
import { AppHeader } from "@/components/shared/app-header";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-testid="app-shell" className="min-h-dvh flex flex-col bg-[#080808]">
      {/* Skip navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[500] focus:bg-[#c9a84c] focus:text-[#080808] focus:px-4 focus:py-2 focus:rounded-md focus:font-medium"
      >
        Pular para o conteúdo
      </a>

      <AppHeader />

      <main
        id="main-content"
        data-testid="main-content"
        className="flex-1 pb-nav"
        tabIndex={-1}
      >
        {children}
      </main>

      <BottomTabBar />
    </div>
  );
}
