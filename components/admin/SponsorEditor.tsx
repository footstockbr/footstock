'use client'
import { useState } from 'react'

interface Sponsor {
  id: string
  name: string
  logoUrl: string
  link: string
  active: boolean
}

interface Props {
  sponsor?: Sponsor
  onSave: (sponsor: Partial<Sponsor>) => void
  onCancel: () => void
  loading?: boolean
}

export function SponsorEditor({ sponsor, onSave, onCancel, loading }: Props) {
  const [form, setForm] = useState({
    name: sponsor?.name ?? '',
    logoUrl: sponsor?.logoUrl ?? '',
    link: sponsor?.link ?? '',
    active: sponsor?.active ?? true,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Nome</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">URL do Logo</label>
        <input
          type="url"
          value={form.logoUrl}
          onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="https://..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Link</label>
        <input
          type="url"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="https://..."
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
          className="w-4 h-4 rounded accent-accent"
        />
        <label htmlFor="active" className="text-sm text-text-secondary">Ativo</label>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Salvando...' : sponsor ? 'Salvar alterações' : 'Criar patrocinador'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg border border-border-default text-sm text-text-secondary hover:bg-bg-card transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
