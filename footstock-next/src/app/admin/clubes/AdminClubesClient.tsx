'use client'

// ============================================================================
// Foot Stock — AdminClubesClient
// Camada interativa da aba Clubes: tabela + modal de edição por ativo.
//
// SEGURANÇA: searchText é buscado do backend (SUPER_ADMIN endpoint) APENAS
// quando o admin abre o modal de edição — nunca fica no bundle estático.
// ============================================================================

import { useState, useCallback } from 'react'
import { Pencil, TrendingUp, TrendingDown, Minus, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AssetRow {
  id: string
  ticker: string
  displayName: string
  division: string
  currentPrice: number
  openPrice: number
  currentSupply: number
  holders: number
}

interface FullAsset {
  id: string
  ticker: string
  displayName: string
  division: string
  colorPrimary: string
  colorSecondary: string
  logoUrl: string | null
  totalShares: number
  fairValue: number
  financials: Record<string, unknown> | null
  searchText: string
}

interface EditForm {
  name: string
  division: 'SERIE_A' | 'SERIE_B'
  colorPrimary: string
  colorSecondary: string
  logoUrl: string
  totalShares: string
  fairValue: string
  ipoPrice: string
  searchText: string
}

const DIVISION_LABELS: Record<string, string> = {
  SERIE_A: 'Série A',
  SERIE_B: 'Série B',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1E2329',
  border: '1px solid #2a2d35',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fff',
  fontSize: '13px',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '5px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#8f95a5',
}

const formGroupStyle: React.CSSProperties = {
  marginBottom: '13px',
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AdminClubesClient({ initialAssets }: { initialAssets: AssetRow[] }) {
  const router = useRouter()

  // Modal state
  const [editingTicker, setEditingTicker] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // ---------------------------------------------------------------------------
  // Abrir modal: busca dados completos do ativo (incluindo searchText)
  // ---------------------------------------------------------------------------
  const openEditModal = useCallback(async (ticker: string) => {
    setEditingTicker(ticker)
    setLoadingEdit(true)
    setFieldErrors({})
    try {
      const res = await fetch(`/api/v1/admin/assets/${ticker}`, { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error?.message ?? 'Erro ao carregar dados do clube')
        setEditingTicker(null)
        return
      }
      const { data } = await res.json()
      const full = data as FullAsset
      const fin = full.financials ?? {}
      setEditForm({
        name: full.displayName,
        division: full.division as 'SERIE_A' | 'SERIE_B',
        colorPrimary: full.colorPrimary,
        colorSecondary: full.colorSecondary,
        logoUrl: full.logoUrl ?? '',
        totalShares: String(full.totalShares),
        fairValue: String(full.fairValue),
        ipoPrice: String((fin.ipoPrice as number) ?? full.fairValue),
        searchText: full.searchText,
      })
    } catch {
      alert('Erro de conexão ao carregar dados do clube')
      setEditingTicker(null)
    } finally {
      setLoadingEdit(false)
    }
  }, [])

  const closeModal = useCallback(() => {
    setEditingTicker(null)
    setEditForm(null)
    setFieldErrors({})
  }, [])

  // ---------------------------------------------------------------------------
  // Salvar edições via PATCH
  // ---------------------------------------------------------------------------
  const saveEdit = useCallback(async () => {
    if (!editingTicker || !editForm) return
    setSaving(true)
    setFieldErrors({})
    try {
      const body: Record<string, unknown> = {
        displayName: editForm.name,
        division: editForm.division,
        colorPrimary: editForm.colorPrimary,
        colorSecondary: editForm.colorSecondary,
        logoUrl: editForm.logoUrl || null,
        totalShares: Number(editForm.totalShares),
        fairValue: Number(editForm.fairValue),
        ipoPrice: Number(editForm.ipoPrice),
        searchText: editForm.searchText,
      }

      const res = await fetch(`/api/v1/admin/assets/${editingTicker}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const resData = await res.json()

      if (!res.ok) {
        if (resData?.error?.fieldErrors) {
          setFieldErrors(resData.error.fieldErrors)
          return
        }
        alert(resData?.error?.message ?? 'Erro ao salvar')
        return
      }

      closeModal()
      // Reinicia o server component para refletir os dados atualizados
      router.refresh()
    } catch {
      alert('Erro de conexão ao salvar')
    } finally {
      setSaving(false)
    }
  }, [editingTicker, editForm, closeModal, router])

  const set = useCallback(
    <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
      setEditForm((f) => (f ? { ...f, [key]: value } : f)),
    []
  )

  // ---------------------------------------------------------------------------
  // Render tabela
  // ---------------------------------------------------------------------------
  return (
    <>
      <div
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] overflow-hidden"
        data-testid="admin-clubes-table"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(240,185,11,.1)] bg-[rgba(240,185,11,.02)]">
              <th className="text-left px-4 py-3 text-xs text-[#929AA5] font-medium">Clube</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Preço</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Variação</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Supply</th>
              <th className="text-right px-4 py-3 text-xs text-[#929AA5] font-medium">Holders</th>
              <th className="text-center px-4 py-3 text-xs text-[#929AA5] font-medium">Editar</th>
            </tr>
          </thead>
          <tbody>
            {initialAssets.map((asset) => {
              const price = asset.currentPrice
              const open = asset.openPrice
              const changePct = open > 0 ? ((price - open) / open) * 100 : 0
              const positive = changePct > 0
              const neutral = changePct === 0

              return (
                <tr
                  key={asset.ticker}
                  className="border-b border-[rgba(240,185,11,.04)] hover:bg-[rgba(240,185,11,.02)]"
                  data-testid={`admin-clubes-row-${asset.ticker}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-[#F0B90B] w-12">
                        {asset.ticker}
                      </span>
                      <div>
                        <span className="text-sm text-[#c5b99a]">{asset.displayName}</span>
                        <span className="ml-2 text-[10px] text-[#555d6c]">
                          {DIVISION_LABELS[asset.division] ?? asset.division}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-[#EAECEF]">
                    FS$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-sm font-mono font-medium flex items-center justify-end gap-0.5 ${
                        neutral ? 'text-[#929AA5]' : positive ? 'text-[#4ade80]' : 'text-[#F6465D]'
                      }`}
                    >
                      {neutral ? (
                        <Minus className="h-3 w-3" />
                      ) : positive ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {changePct > 0 ? '+' : ''}
                      {changePct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[#929AA5]">
                    {asset.currentSupply.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-[#c5b99a]">
                    {asset.holders.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEditModal(asset.ticker)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[rgba(240,185,11,.2)] bg-[rgba(240,185,11,.04)] hover:bg-[rgba(240,185,11,.12)] text-[#F0B90B] transition-colors"
                      title={`Editar ${asset.displayName}`}
                      data-testid={`admin-clubes-edit-button-${asset.ticker}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal de Edição ── */}
      {editingTicker && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
          data-testid="modal-clube-overlay"
        >
          <div
            className="bg-[#181A20] border border-[#2a2d35] rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            data-testid="modal-clube"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div data-testid="modal-clube-title">
                <div className="text-base font-bold text-white">
                  Editar Clube
                </div>
                <div className="text-xs text-[#8f95a5] mt-0.5 font-mono">
                  {editingTicker}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-[#8f95a5] hover:text-white transition-colors"
                data-testid="modal-clube-close-button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingEdit ? (
              <div className="flex items-center justify-center py-10 gap-3 text-[#8f95a5]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Carregando dados do clube...</span>
              </div>
            ) : editForm ? (
              <>
                {/* Ticker — somente leitura */}
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Ticker (somente leitura)</label>
                  <input
                    style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
                    value={editingTicker}
                    readOnly
                    data-testid="modal-clube-ticker-readonly"
                  />
                  <p style={{ fontSize: '10px', color: '#555d6c', marginTop: '3px' }}>
                    O ticker é imutável pois é usado como chave em toda a plataforma.
                  </p>
                </div>

                {/* Nome fictício */}
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Nome do Clube (fictício)</label>
                  <input
                    style={inputStyle}
                    value={editForm.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Nome fictício do clube"
                    data-testid="modal-clube-name-input"
                  />
                  {fieldErrors.displayName && (
                    <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                      {fieldErrors.displayName[0]}
                    </p>
                  )}
                </div>

                {/* Divisão */}
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Divisão</label>
                  <select
                    style={inputStyle}
                    value={editForm.division}
                    onChange={(e) => set('division', e.target.value as 'SERIE_A' | 'SERIE_B')}
                    data-testid="modal-clube-division-select"
                  >
                    <option value="SERIE_A">Série A</option>
                    <option value="SERIE_B">Série B</option>
                  </select>
                </div>

                {/* Total de ações + Valor Justo (IPO price) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
                  <div>
                    <label style={labelStyle}>Total de Ações</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      value={editForm.totalShares}
                      onChange={(e) => set('totalShares', e.target.value)}
                      placeholder="Quantidade total de ações"
                      data-testid="modal-clube-total-shares-input"
                    />
                    {fieldErrors.totalShares && (
                      <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                        {fieldErrors.totalShares[0]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Preço IPO (FS$)</label>
                    <input
                      style={inputStyle}
                      type="number"
                      step="0.01"
                      min={0.01}
                      value={editForm.ipoPrice}
                      onChange={(e) => set('ipoPrice', e.target.value)}
                      placeholder="Valor em FS$"
                      data-testid="modal-clube-ipo-price-input"
                    />
                    {fieldErrors.ipoPrice && (
                      <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                        {fieldErrors.ipoPrice[0]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Valor Inicial (Fair Value) */}
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Valor Inicial / Fair Value (FS$)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={editForm.fairValue}
                    onChange={(e) => set('fairValue', e.target.value)}
                    placeholder="Valor em FS$"
                    data-testid="modal-clube-fair-value-input"
                  />
                  {fieldErrors.fairValue && (
                    <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                      {fieldErrors.fairValue[0]}
                    </p>
                  )}
                </div>

                {/* Cores */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
                  <div>
                    <label style={labelStyle}>Cor Primária</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="color"
                        style={{ ...inputStyle, width: '42px', padding: '3px', flexShrink: 0 }}
                        value={editForm.colorPrimary}
                        onChange={(e) => set('colorPrimary', e.target.value)}
                        data-testid="modal-clube-color-primary-picker"
                      />
                      <input
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                        value={editForm.colorPrimary}
                        onChange={(e) => set('colorPrimary', e.target.value)}
                        placeholder="#RRGGBB"
                        data-testid="modal-clube-color-primary-hex"
                      />
                    </div>
                    {fieldErrors.colorPrimary && (
                      <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                        {fieldErrors.colorPrimary[0]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Cor Secundária</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="color"
                        style={{ ...inputStyle, width: '42px', padding: '3px', flexShrink: 0 }}
                        value={editForm.colorSecondary}
                        onChange={(e) => set('colorSecondary', e.target.value)}
                        data-testid="modal-clube-color-secondary-picker"
                      />
                      <input
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                        value={editForm.colorSecondary}
                        onChange={(e) => set('colorSecondary', e.target.value)}
                        placeholder="#RRGGBB"
                        data-testid="modal-clube-color-secondary-hex"
                      />
                    </div>
                    {fieldErrors.colorSecondary && (
                      <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                        {fieldErrors.colorSecondary[0]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Logo URL */}
                <div style={formGroupStyle}>
                  <label style={labelStyle}>URL do Logo (opcional)</label>
                  <input
                    style={inputStyle}
                    type="url"
                    value={editForm.logoUrl}
                    onChange={(e) => set('logoUrl', e.target.value)}
                    placeholder="https://cdn.exemplo.com/logo.png"
                    data-testid="modal-clube-logo-url-input"
                  />
                  {fieldErrors.logoUrl && (
                    <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                      {fieldErrors.logoUrl[0]}
                    </p>
                  )}
                </div>

                {/* searchText — Time Real vinculado (ADMIN ONLY) */}
                <div style={formGroupStyle}>
                  <label style={labelStyle}>
                    Time Real Vinculado — aliases de busca
                    <span
                      style={{
                        marginLeft: '6px',
                        background: '#F6465D22',
                        color: '#F6465D',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontSize: '9px',
                        fontWeight: 700,
                      }}
                    >
                      ADMIN ONLY — NUNCA visível ao usuário
                    </span>
                  </label>
                  <textarea
                    style={{
                      ...inputStyle,
                      minHeight: '72px',
                      fontFamily: 'monospace',
                      resize: 'vertical',
                      fontSize: '12px',
                    }}
                    value={editForm.searchText}
                    onChange={(e) => set('searchText', e.target.value)}
                    placeholder="nome-real, apelido, abreviação"
                    data-testid="modal-clube-search-text-input"
                  />
                  <p style={{ fontSize: '10px', color: '#555d6c', marginTop: '3px' }}>
                    Aliases separados por vírgula. Permite que pesquisas pelo nome real do time encontrem este ativo.
                    Este campo nunca é retornado ao cliente.
                  </p>
                  {fieldErrors.searchText && (
                    <p style={{ fontSize: '11px', color: '#F6465D', marginTop: '3px' }}>
                      {fieldErrors.searchText[0]}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    onClick={closeModal}
                    style={{
                      padding: '8px 14px',
                      background: 'transparent',
                      border: '1px solid #2a2d35',
                      borderRadius: '6px',
                      color: '#8f95a5',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    data-testid="modal-clube-cancel-button"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    style={{
                      padding: '8px 14px',
                      background: saving ? '#555' : '#F0B90B',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#000',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    data-testid="modal-clube-save-button"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
