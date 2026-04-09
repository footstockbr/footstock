'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import type { ImpactMatrixDTO } from '@/lib/types/admin'

const CATEGORIES = [
  { key: 'financeiraCritica', label: 'Financeira Crítica', defaultValue: 0.05 },
  { key: 'esportivaMajoritaria', label: 'Esportiva Majoritária', defaultValue: 0.03 },
  { key: 'mercadoAtivos', label: 'Mercado de Ativos', defaultValue: 0.02 },
  { key: 'integridadeSaude', label: 'Integridade/Saúde', defaultValue: 0.015 },
  { key: 'institucional', label: 'Institucional', defaultValue: 0.01 },
  { key: 'esportivaMenor', label: 'Esportiva Menor', defaultValue: 0.005 },
] as const

async function fetchMatrix(): Promise<ImpactMatrixDTO> {
  const res = await fetch('/api/v1/admin/motor/impact-matrix', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function saveMatrix(data: ImpactMatrixDTO): Promise<ImpactMatrixDTO> {
  const res = await fetch('/api/v1/admin/motor/impact-matrix', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed')
  const { data: result } = await res.json()
  return result
}

export function ImpactMatrix() {
  const [formData, setFormData] = useState<ImpactMatrixDTO>({
    financeiraCritica: 0.05,
    esportivaMajoritaria: 0.03,
    mercadoAtivos: 0.02,
    integridadeSaude: 0.015,
    institucional: 0.01,
    esportivaMenor: 0.005,
  })

  const [isSaved, setIsSaved] = useState(false)

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['impact-matrix'],
    queryFn: fetchMatrix,
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: saveMatrix,
    onSuccess: () => {
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    },
  })

  // Sincronizar com dados da API
  useEffect(() => {
    if (matrix) {
      setFormData(matrix)
    }
  }, [matrix])

  const handleSliderChange = (key: keyof ImpactMatrixDTO, value: number) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <div className="mb-1">
        <h2 className="text-sm font-semibold text-[#EAECEF]">Matriz de Impacto</h2>
      </div>
      <p className="text-xs text-[#929AA5] mb-4">Impacto spot máximo por categoria (cap ±2.5%)</p>

      <div className="space-y-4">
        {CATEGORIES.map(({ key, label }) => {
          const value = formData[key] ?? 0
          const percentage = (value * 100).toFixed(1)

          return (
            <div key={key}>
              <label className="text-xs text-[#929AA5] mb-2 flex items-center justify-between">
                <span>{label}</span>
                <span className="font-mono font-bold text-[#F0B90B]">{percentage}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="0.10"
                step="0.001"
                value={value}
                onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                className="w-full accent-[#F0B90B]"
              />
            </div>
          )
        })}
      </div>

      <Button
        onClick={handleSave}
        disabled={saveMutation.isPending || isSaved}
        variant="primary"
        size="md"
        fullWidth
        isLoading={saveMutation.isPending}
        className="mt-5"
      >
        {isSaved ? '✓ Salvo!' : '💾 Salvar Matriz'}
      </Button>
    </div>
  )
}
