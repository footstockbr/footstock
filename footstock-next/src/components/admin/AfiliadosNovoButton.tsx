'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FormState {
  email: string
  affiliateType: 'INFLUENCIADOR' | 'TIME_PARCEIRO'
  commissionPercentage: number
}

const INITIAL_FORM: FormState = {
  email: '',
  affiliateType: 'INFLUENCIADOR',
  commissionPercentage: 10,
}

export function AfiliadosNovoButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleClose = () => {
    setOpen(false)
    setError(null)
    setSuccess(false)
    setForm(INITIAL_FORM)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/admin/affiliates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          affiliateType: form.affiliateType,
          commissionPercentage: form.commissionPercentage / 100,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json?.error?.message ?? 'Erro ao criar afiliado')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        handleClose()
        window.location.reload()
      }, 1200)
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        data-testid="admin-afiliados-novo-button"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4 mr-1" />
        Novo afiliado
      </Button>

      {open && (
        <div
          data-testid="admin-afiliados-novo-modal"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={handleClose}
        >
          <div
            style={{
              background: '#1E2329',
              border: '1px solid rgba(240,185,11,.15)',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#EAECEF', fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>
              Novo Afiliado
            </h2>

            {success ? (
              <p style={{ color: '#2EBD85', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>
                ✓ Afiliado criado com sucesso!
              </p>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#929AA5', marginBottom: '4px' }}>
                    E-MAIL DO USUÁRIO
                  </label>
                  <input
                    data-testid="admin-afiliados-novo-email-input"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="usuario@email.com"
                    style={{
                      width: '100%', background: '#181A20',
                      border: '1px solid rgba(240,185,11,.1)', borderRadius: '6px',
                      color: '#EAECEF', padding: '8px 10px', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#929AA5', marginBottom: '4px' }}>
                    TIPO
                  </label>
                  <select
                    data-testid="admin-afiliados-novo-tipo-select"
                    value={form.affiliateType}
                    onChange={(e) => setForm({ ...form, affiliateType: e.target.value as FormState['affiliateType'] })}
                    style={{
                      width: '100%', background: '#181A20',
                      border: '1px solid rgba(240,185,11,.1)', borderRadius: '6px',
                      color: '#EAECEF', padding: '8px 10px', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  >
                    <option value="INFLUENCIADOR">Influenciador</option>
                    <option value="TIME_PARCEIRO">Time Parceiro</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#929AA5', marginBottom: '4px' }}>
                    COMISSÃO (%)
                  </label>
                  <input
                    data-testid="admin-afiliados-novo-comissao-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    required
                    value={form.commissionPercentage}
                    onChange={(e) => setForm({ ...form, commissionPercentage: parseFloat(e.target.value) || 0 })}
                    style={{
                      width: '100%', background: '#181A20',
                      border: '1px solid rgba(240,185,11,.1)', borderRadius: '6px',
                      color: '#EAECEF', padding: '8px 10px', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                {error && (
                  <p style={{ fontSize: '12px', color: '#F6465D', margin: 0 }}>{error}</p>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    data-testid="admin-afiliados-novo-cancel-button"
                    onClick={handleClose}
                    style={{
                      flex: 1, padding: '9px', borderRadius: '6px', fontSize: '12px',
                      background: 'transparent', border: '1px solid rgba(240,185,11,.2)',
                      color: '#929AA5', cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    data-testid="admin-afiliados-novo-submit-button"
                    disabled={loading}
                    style={{
                      flex: 1, padding: '9px', borderRadius: '6px', fontSize: '12px',
                      background: loading ? 'rgba(240,185,11,.4)' : '#F0B90B',
                      border: 'none', color: '#080B12', fontWeight: 700,
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? 'Criando...' : 'Criar afiliado'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
