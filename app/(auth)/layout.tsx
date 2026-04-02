import type { Metadata } from 'next'
import { AuthLayout } from '@/components/layout/AuthLayout'

export const metadata: Metadata = {
  title: 'Entrar | Foot Stock',
  description: 'Entre na sua conta Foot Stock',
  robots: { index: false, follow: false },
}

export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthLayout>{children}</AuthLayout>
}
