import { AppLayout } from '@/components/layout'

export default function NotificacoesPage() {
  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-24">
        <section className="rounded-xl border border-border-default bg-bg-card p-4">
          <h1 className="text-lg font-semibold text-text-primary">Inbox</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Suas notificacoes do sistema aparecem aqui: ordens, alertas de margem, planos e ligas.
          </p>
          <p className="mt-3 text-xs text-text-muted">
            Nenhuma notificacao no momento.
          </p>
        </section>
      </div>
    </AppLayout>
  )
}
