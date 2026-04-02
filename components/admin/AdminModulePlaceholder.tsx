interface AdminModulePlaceholderProps {
  title: string
  description: string
}

export function AdminModulePlaceholder({ title, description }: AdminModulePlaceholderProps) {
  return (
    <section className="rounded-xl border border-border-default bg-bg-card p-5">
      <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
      <p className="mt-3 text-xs text-text-muted">Tela em adequacao ao brief.</p>
    </section>
  )
}
