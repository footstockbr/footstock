import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notificações — FootStock',
  description: 'Gerencie suas notificações e alertas do FootStock.',
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return children
}
