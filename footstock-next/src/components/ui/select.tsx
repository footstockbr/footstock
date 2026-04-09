'use client'

/**
 * Select — componente nativo estilizado.
 * API compatível com shadcn/ui Select para uso em CheckoutButton e similares.
 */

import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

// ── Context ──────────────────────────────────────────────────────────────────

interface SelectContextValue {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

const SelectContext = createContext<SelectContextValue>({
  value: '',
  onValueChange: () => {},
})

// ── Select (root) ─────────────────────────────────────────────────────────────

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  children: React.ReactNode
}

export function Select({ value, onValueChange, disabled, children }: SelectProps) {
  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

// ── SelectTrigger ─────────────────────────────────────────────────────────────

interface SelectTriggerProps {
  className?: string
  children: React.ReactNode
  'data-testid'?: string
}

export function SelectTrigger({ className, children, 'data-testid': testId }: SelectTriggerProps) {
  return (
    <div
      className={cn(
        'relative flex items-center w-full rounded-md border px-3 py-2 text-sm cursor-pointer',
        className
      )}
      data-testid={testId}
    >
      {children}
      <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
    </div>
  )
}

// ── SelectValue ───────────────────────────────────────────────────────────────

interface SelectValueProps {
  placeholder?: string
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const { value } = useContext(SelectContext)
  return (
    <span className="flex-1 truncate">
      {value || <span className="opacity-60">{placeholder}</span>}
    </span>
  )
}

// ── SelectContent + SelectItem ─────────────────────────────────────────────────
// Implementados como select nativo invisível sobreposto ao trigger visual.

interface SelectContentProps {
  className?: string
  children: React.ReactNode
}

export function SelectContent({ children }: SelectContentProps) {
  // SelectContent é estrutural — os items são coletados para construir o <select> nativo.
  return <>{children}</>
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function SelectItem({ value, children }: SelectItemProps) {
  // Renderizado dentro do <select> nativo no SelectRoot.
  return <option value={value}>{children}</option>
}

// ── SelectRoot (versão composta com select nativo oculto) ─────────────────────

/**
 * Versão simplificada: envolve tudo com um <select> nativo sobreposto ao trigger visual.
 * Isso garante compatibilidade total com mobile e acessibilidade.
 */

interface NativeSelectProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  options: { value: string; label: string }[]
  triggerClassName?: string
  'data-testid'?: string
}

export function NativeSelect({
  value,
  onValueChange,
  disabled,
  placeholder,
  options,
  triggerClassName,
  'data-testid': testId,
}: NativeSelectProps) {
  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-center w-full rounded-md border px-3 py-2 text-sm pointer-events-none',
          triggerClassName
        )}
      >
        <span className="flex-1 truncate">
          {value
            ? options.find((o) => o.value === value)?.label
            : <span className="opacity-60">{placeholder}</span>
          }
        </span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </div>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        data-testid={testId}
        aria-label={placeholder}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
