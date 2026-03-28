import { AppHeader } from './AppHeader'
import { BottomTabBar } from './BottomTabBar'

/**
 * Layout padrao das telas autenticadas.
 * Header + conteudo scrollavel + BottomTabBar fixa.
 * Padding bottom para compensar a BottomTabBar (56px + safe area).
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-dvh bg-bg-primary">
      <AppHeader />
      <main className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
      <BottomTabBar />
    </div>
  )
}
