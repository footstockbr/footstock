import type { ReactNode } from "react";
import { AppHeader } from "@/components/shared/app-header";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";
import { AdminRouteGuard } from "@/components/shared/admin-route-guard";
import { PushSyncBootstrap } from "@/components/shared/push-sync-bootstrap";
import { MotorStatusProvider } from "@/contexts/motor-status-context";
import { MotorOfflineBanner } from "@/components/market/motor-offline-banner";
import { CancellationLockBannerLoader } from "@/components/subscription/CancellationLockBannerLoader";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MotorStatusProvider>
      <AdminRouteGuard />
      <PushSyncBootstrap />
      {/* T-013: Onboarding tour adaptativo — auto-inicia quando tourCompleted=false */}
      <OnboardingTour />
      <div data-testid="app-shell" className="min-h-dvh md:h-dvh md:overflow-hidden flex bg-[#0B0E11]">
        {/* Skip navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[500] focus:bg-[#F0B90B] focus:text-[#0B0E11] focus:px-4 focus:py-2 focus:rounded-md focus:font-medium"
        >
          Pular para o conteúdo
        </a>

        <DesktopSidebar />

        <div className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">
          <AppHeader />
          <MotorOfflineBanner />
          <CancellationLockBannerLoader />

          <main
            id="main-content"
            data-testid="main-content"
            className="flex-1"
            tabIndex={-1}
          >
            {children}
          </main>

          {/* Rodape consistente no shell autenticado (antes so existia no layout publico).
              No mobile, o padding inferior libera espaco para a BottomTabBar fixa (56px) e
              passa a ser o elemento que garante a area segura, no lugar do pb do <main>. */}
          <footer
            data-testid="app-footer"
            className="border-t border-[rgba(240,185,11,.12)] px-4 py-6 pb-[calc(24px+56px+env(safe-area-inset-bottom))] md:pb-6"
          >
            <p className="max-w-3xl mx-auto text-center text-xs text-[#707A8A]">
              © {new Date().getFullYear()} FootStock. Plataforma educacional de simulação financeira.
            </p>
          </footer>

          <BottomTabBar />
        </div>
      </div>
    </MotorStatusProvider>
  );
}
