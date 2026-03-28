'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils/cn'

export interface TabItem {
  value: string
  label: string
  disabled?: boolean
}

export interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Tabs com indicador ativo animado e navegacao por teclado */
export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const enabledTabs = tabs.reduce<number[]>((acc, tab, i) => {
      if (!tab.disabled) acc.push(i)
      return acc
    }, [])

    const currentEnabledIndex = enabledTabs.indexOf(index)
    if (currentEnabledIndex === -1) return

    let nextIndex: number | undefined

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = enabledTabs[(currentEnabledIndex + 1) % enabledTabs.length]
      nextIndex = next
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = enabledTabs[(currentEnabledIndex - 1 + enabledTabs.length) % enabledTabs.length]
      nextIndex = next
    }

    if (nextIndex !== undefined) {
      const nextTab = tabs[nextIndex]
      if (!nextTab) return
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      buttons?.[nextIndex]?.focus()
      onChange(nextTab.value)
    }
  }

  return (
    <div
      ref={tabListRef}
      role="tablist"
      className={cn(
        'flex gap-1 bg-bg-surface p-1 rounded-lg border border-border-muted',
        className
      )}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          role="tab"
          tabIndex={value === tab.value ? 0 : -1}
          aria-selected={value === tab.value}
          aria-disabled={tab.disabled}
          disabled={tab.disabled}
          onClick={() => onChange(tab.value)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className={cn(
            'flex-1 px-3 py-1.5 text-sm font-medium rounded-md',
            'transition-all duration-fast',
            value === tab.value
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card',
            tab.disabled && 'opacity-40 cursor-not-allowed'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
