import { NotificationPreferences } from '@/components/settings/NotificationPreferences'

export const metadata = { title: 'Notificações — Configurações' }

export default function NotificationSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-text-primary mb-1">Preferências de Notificação</h1>
      <p className="text-sm text-text-secondary mb-6">Configure quais notificações receber e por qual canal.</p>
      <NotificationPreferences />
    </div>
  )
}
