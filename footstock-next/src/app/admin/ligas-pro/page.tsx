'use client'

import { useState, useEffect } from 'react'
import { Trophy, Plus, Check, AlertCircle } from 'lucide-react'

interface Sponsor {
  id:       string
  name:     string
  isActive: boolean
  logoUrl:  string | null
}

interface SponsorBanner {
  id:       string
  title:    string
  position: string
  imageUrl: string | null
  isActive: boolean
}

interface ProLeague {
  id:                 string
  name:               string
  status:             string
  startsAt:           string
  endsAt:             string
  permiteAlavancagem: boolean
  sponsor:            { id: string; name: string } | null
}

const EMPTY_FORM = {
  name:               '',
  startsAt:           '',
  endsAt:             '',
  sponsorId:          '',
  bannerId:           '',
  permiteAlavancagem: false,
}

export default function AdminLigasProPage() {
  const [leagues, setLeagues]     = useState<ProLeague[]>([])
  const [sponsors, setSponsors]   = useState<Sponsor[]>([])
  const [banners, setBanners]     = useState<SponsorBanner[]>([])
  const [form, setForm]           = useState(EMPTY_FORM)
  const [loading, setLoading]     = useState(false)
  const [feedback, setFeedback]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [previewBanner, setPreviewBanner] = useState<SponsorBanner | null>(null)

  useEffect(() => {
    fetchLeagues()
    fetchSponsors()
    fetchBanners()
  }, [])

  useEffect(() => {
    if (form.bannerId) {
      const b = banners.find((b) => b.id === form.bannerId) ?? null
      setPreviewBanner(b)
    } else {
      setPreviewBanner(null)
    }
  }, [form.bannerId, banners])

  async function fetchLeagues() {
    try {
      const res = await fetch('/api/v1/leagues?type=PRO')
      if (!res.ok) return
      const json = await res.json()
      setLeagues(json.data ?? [])
    } catch { /* ignorar */ }
  }

  async function fetchSponsors() {
    try {
      const res = await fetch('/api/v1/admin/league-sponsors', { credentials: 'include' })
      if (!res.ok) return
      const json = await res.json()
      // Endpoint já filtra inativos por padrão; isActive=true em todos
      setSponsors(json.data ?? [])
    } catch { /* ignorar */ }
  }

  async function fetchBanners() {
    try {
      const res = await fetch('/api/v1/admin/sponsors/banners', { credentials: 'include' })
      if (!res.ok) return
      const json = await res.json()
      setBanners((json.data ?? []).filter((b: SponsorBanner) => b.isActive))
    } catch { /* ignorar */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)

    try {
      const res = await fetch('/api/v1/admin/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               form.name,
          startsAt:           new Date(form.startsAt).toISOString(),
          endsAt:             new Date(form.endsAt).toISOString(),
          sponsorId:          form.sponsorId || undefined,
          bannerId:           form.bannerId || undefined,
          permiteAlavancagem: form.permiteAlavancagem,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setFeedback({ ok: false, msg: json.error ?? 'Erro ao criar liga.' })
        return
      }

      setFeedback({ ok: true, msg: `Liga PRO "${form.name}" criada com sucesso.` })
      setForm(EMPTY_FORM)
      setShowForm(false)
      fetchLeagues()
    } catch {
      setFeedback({ ok: false, msg: 'Erro de conexao.' })
    } finally {
      setLoading(false)
    }
  }

  const activeSponsorBanners = form.sponsorId
    ? banners.filter((b) => {
        const sponsor = sponsors.find((s) => s.id === form.sponsorId)
        return sponsor ? b.isActive : b.isActive
      })
    : banners

  return (
    <div data-testid="page-admin-ligas-pro" className="p-4 sm:p-6 space-y-6">
      {/* Cabecalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#F0B90B]" />
            Ligas PRO
          </h1>
          <p className="text-sm text-[#929AA5] mt-0.5">
            Criação e gestão de ligas PRO com patrocinadores, troféus e toggle de alavancagem.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0B90B] text-black text-sm font-semibold hover:bg-[#d4a017] transition-colors"
          data-testid="btn-create-pro-league"
        >
          <Plus className="h-4 w-4" />
          Nova Liga PRO
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            feedback.ok
              ? 'bg-green-900/30 border border-green-700/40 text-green-400'
              : 'bg-red-900/30 border border-red-700/40 text-red-400'
          }`}
          role="alert"
        >
          {feedback.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {feedback.msg}
        </div>
      )}

      {/* Formulario de criacao */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#1E2329] rounded-xl p-4 space-y-4 border border-white/10"
          data-testid="form-create-pro-league"
        >
          <h2 className="text-base font-semibold text-[#EAECEF]">Nova Liga PRO</h2>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-gray-400">Nome *</span>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full bg-[#2B3139] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
                placeholder="Ex: Liga PRO Verao 2026"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-400">Inicio *</span>
                <input
                  required
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="mt-1 w-full bg-[#2B3139] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Fim *</span>
                <input
                  required
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  className="mt-1 w-full bg-[#2B3139] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-gray-400">Patrocinador (opcional)</span>
              <select
                value={form.sponsorId}
                onChange={(e) => setForm((f) => ({ ...f, sponsorId: e.target.value }))}
                className="mt-1 w-full bg-[#2B3139] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
              >
                <option value="">Sem patrocinador</option>
                {sponsors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-gray-400">Banner (opcional)</span>
              <select
                value={form.bannerId}
                onChange={(e) => setForm((f) => ({ ...f, bannerId: e.target.value }))}
                className="mt-1 w-full bg-[#2B3139] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
              >
                <option value="">Sem banner especifico</option>
                {activeSponsorBanners.map((b) => (
                  <option key={b.id} value={b.id}>{b.title} ({b.position})</option>
                ))}
              </select>
            </label>

            {/* Preview do banner selecionado */}
            {previewBanner?.imageUrl && (
              <div className="rounded-lg border border-white/10 p-2 bg-[#2B3139]">
                <p className="text-xs text-gray-400 mb-2">Preview do banner:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewBanner.imageUrl}
                  alt={`Preview ${previewBanner.title}`}
                  className="w-full object-contain rounded max-h-24"
                />
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.permiteAlavancagem}
                onChange={(e) => setForm((f) => ({ ...f, permiteAlavancagem: e.target.checked }))}
                className="rounded border-white/20 bg-[#2B3139] text-[#F0B90B] focus:ring-[#F0B90B] h-4 w-4"
              />
              <div>
                <span className="text-sm text-[#EAECEF]">Alavancagem 2x habilitada</span>
                <p className="text-xs text-gray-500">Permite ordens alavancadas para todos os planos nesta liga</p>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setFeedback(null) }}
              className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-gray-400 hover:text-[#EAECEF] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-[#F0B90B] text-black text-sm font-semibold disabled:opacity-60 hover:bg-[#d4a017] transition-colors"
              data-testid="btn-confirm-create-pro-league"
            >
              {loading ? 'Criando...' : 'Confirmar criação'}
            </button>
          </div>

          <p className="text-xs text-gray-600 text-center">
            A liga PRO será visível publicamente após a criação.
          </p>
        </form>
      )}

      {/* Lista de ligas PRO existentes */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Ligas PRO existentes</h2>
        {leagues.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-6">Nenhuma liga PRO criada ainda.</p>
        ) : (
          <ul className="space-y-3">
            {leagues.map((l) => (
              <li
                key={l.id}
                className="bg-[#1E2329] rounded-xl p-3 border border-white/10 flex items-start justify-between gap-3"
                data-testid={`league-pro-item-${l.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-[#F0B90B] text-black">PRO</span>
                    <span className="text-sm font-semibold text-[#EAECEF] truncate">{l.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${l.status === 'ACTIVE' ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                      {l.status}
                    </span>
                  </div>
                  {l.sponsor && (
                    <p className="text-xs text-gray-500 mt-1">Patrocinada por {l.sponsor.name}</p>
                  )}
                  {l.permiteAlavancagem && (
                    <p className="text-xs text-amber-500 mt-0.5">Alavancagem 2x habilitada</p>
                  )}
                  <p className="text-xs text-gray-600 mt-0.5">
                    {new Date(l.startsAt).toLocaleDateString('pt-BR')} — {new Date(l.endsAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
