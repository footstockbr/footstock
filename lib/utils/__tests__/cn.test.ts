import { cn } from '../cn'

describe('cn utility', () => {
  it('merges multiple class strings', () => {
    expect(cn('px-4', 'py-2', 'text-sm')).toBe('px-4 py-2 text-sm')
  })

  it('resolves Tailwind conflicts keeping the last value', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles conditional and falsy values', () => {
    const isActive = true
    const isDisabled = false

    expect(cn('base', isActive && 'active', isDisabled && 'disabled', undefined, null)).toBe(
      'base active'
    )
  })
})
