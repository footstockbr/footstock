import { minorProfilingGuard, isMinor } from '@/lib/middleware/minorProfilingGuard'
import { subYears } from 'date-fns'

describe('minorProfilingGuard', () => {
  it('should block analytics for users under 18', () => {
    const user = { birthDate: subYears(new Date(), 17) }
    expect(minorProfilingGuard(user, 'analytics')).toBe(false)
  })

  it('should allow analytics for users over 18', () => {
    const user = { birthDate: subYears(new Date(), 25) }
    expect(minorProfilingGuard(user, 'analytics')).toBe(true)
  })

  it('should block behavioral_tracking for 16yo', () => {
    const user = { birthDate: subYears(new Date(), 16) }
    expect(minorProfilingGuard(user, 'behavioral_tracking')).toBe(false)
  })

  it('should allow when no birthDate provided', () => {
    const user = { birthDate: null }
    expect(minorProfilingGuard(user, 'analytics')).toBe(true)
  })
})

describe('isMinor', () => {
  it('should return true for 17yo', () => {
    expect(isMinor({ birthDate: subYears(new Date(), 17) })).toBe(true)
  })

  it('should return false for 18yo', () => {
    expect(isMinor({ birthDate: subYears(new Date(), 18) })).toBe(false)
  })
})
