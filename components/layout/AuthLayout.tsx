/**
 * Layout para telas de auth (login, register, onboarding).
 * Sem navigation, conteudo centralizado.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-dvh bg-bg-primary">
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        {children}
      </main>
    </div>
  )
}
