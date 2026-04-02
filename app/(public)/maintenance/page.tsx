export default function MaintenancePage() {
  return (
    <main className="min-h-dvh bg-bg-primary text-text-primary flex items-center justify-center px-4">
      <section className="w-full max-w-xl rounded-xl border border-border-default bg-bg-card p-6 space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Mercado em manutencao</h1>
        <p className="text-sm text-text-secondary">
          O sistema esta em modo somente leitura. Negociacoes e cancelamentos de ordens estao temporariamente suspensos.
        </p>
        <p className="text-xs text-text-muted">
          Tente novamente em alguns minutos.
        </p>
      </section>
    </main>
  )
}
