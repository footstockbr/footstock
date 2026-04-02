import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-bg-primary text-text-primary flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-xl border border-border-default bg-bg-card p-6 text-center">
        <h1 className="text-2xl font-semibold">404</h1>
        <p className="mt-2 text-sm text-text-secondary">Pagina nao encontrada.</p>
        <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline">
          Voltar para o inicio
        </Link>
      </section>
    </main>
  )
}
