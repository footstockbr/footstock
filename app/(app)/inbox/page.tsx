import { InboxPage } from '@/components/inbox/InboxPage'

export const metadata = { title: 'Inbox — Foot Stock' }

export default function InboxRoute() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-text-primary mb-4">Inbox</h1>
      <InboxPage />
    </div>
  )
}
