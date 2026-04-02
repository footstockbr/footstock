import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notificações — Foot Stock',
  description: 'Gerencie suas notificações e alertas do Foot Stock.',
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return children
}
