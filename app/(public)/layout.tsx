import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: true, follow: true },
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-bg-primary">
      <main className="mx-auto max-w-2xl px-4 py-12">
        {children}
      </main>
    </div>
  )
}
