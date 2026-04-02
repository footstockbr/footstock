import { AppHeader } from './AppHeader'
import { BottomTabBar } from './BottomTabBar'
import { DesktopSidebar } from './DesktopSidebar'

/**
 * Layout padrao das telas autenticadas.
 * Header + conteudo scrollavel + BottomTabBar fixa.
 * Padding bottom para compensar a BottomTabBar (56px + safe area).
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-bg-primary">
      <DesktopSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <div className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
        <BottomTabBar />
      </div>
    </div>
  )
}
