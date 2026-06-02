// ============================================================================
// FootStock — Contrato de Enums Globais
// Verifica fonte única e unicidade de ImpactCategory, PlanType, NotificationType
// Rastreabilidade: INT-002, INT-044 | US-CT-002 | module-28/TASK-3/ST001
// ============================================================================

import * as fs from 'fs'
import * as path from 'path'
import { globSync } from 'glob'

// Importar todos os enums de @/lib/enums (const objects + tipos derivados)
import {
  IMPACT_CATEGORY,
  PLAN_TYPE,
  NOTIFICATION_TYPE,
  SENTIMENT,
} from '@/lib/enums'

const PROJECT_ROOT = path.join(__dirname, '../../..')
const SRC_PATTERN = ['src/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}']
const IGNORE_PATTERN = [
  '**/enums/**',
  '**/*.test.*',
  '**/*.contract.test.*',
  '**/node_modules/**',
]

function scanForRedefinition(enumName: string): string[] {
  const files: string[] = []
  for (const pattern of SRC_PATTERN) {
    const found = globSync(pattern, { cwd: PROJECT_ROOT, ignore: IGNORE_PATTERN })
    for (const file of found) {
      try {
        const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8')
        if (new RegExp(`(enum|const)\\s+${enumName}\\s*(=|\\{)`).test(content)) {
          files.push(file)
        }
      } catch {
        // arquivo inacessível — ignorar
      }
    }
  }
  return files
}

describe('Contrato de Enums Globais', () => {
  // ── IMPACT_CATEGORY ──────────────────────────────────────────────────────

  describe('IMPACT_CATEGORY (lib/enums)', () => {
    it('deve ser definido em @/lib/enums', () => {
      expect(IMPACT_CATEGORY).toBeDefined()
      expect(typeof IMPACT_CATEGORY).toBe('object')
    })

    it('deve ter ao menos 6 valores de impacto', () => {
      expect(Object.values(IMPACT_CATEGORY).length).toBeGreaterThanOrEqual(6)
    })

    it('todos os valores devem ser strings não vazias', () => {
      Object.values(IMPACT_CATEGORY).forEach((v) => {
        expect(typeof v).toBe('string')
        expect((v as string).length).toBeGreaterThan(0)
      })
    })

    it('não deve ser redefinido fora de lib/enums', () => {
      const redefinitions = scanForRedefinition('IMPACT_CATEGORY')
      expect(redefinitions).toHaveLength(0)
    })
  })

  // ── PLAN_TYPE ────────────────────────────────────────────────────────────

  describe('PLAN_TYPE (lib/enums)', () => {
    it('deve ser definido em @/lib/enums sem redefinição local', () => {
      expect(PLAN_TYPE).toBeDefined()
    })

    it('deve conter JOGADOR, CRAQUE, LENDA', () => {
      const values = Object.values(PLAN_TYPE)
      expect(values).toContain('JOGADOR')
      expect(values).toContain('CRAQUE')
      expect(values).toContain('LENDA')
    })

    it('não deve ser redefinido fora de lib/enums', () => {
      const redefinitions = scanForRedefinition('PLAN_TYPE')
      expect(redefinitions).toHaveLength(0)
    })
  })

  // ── NOTIFICATION_TYPE — enum separado sem colisão ────────────────────────

  describe('NOTIFICATION_TYPE — enum separado sem colisão', () => {
    it('deve existir como enum independente em @/lib/enums', () => {
      expect(NOTIFICATION_TYPE).toBeDefined()
    })

    it('não deve ter valores que colidam com IMPACT_CATEGORY', () => {
      const impactValues = new Set<string>(Object.values(IMPACT_CATEGORY))
      const notifValues = Object.values(NOTIFICATION_TYPE) as string[]
      notifValues.forEach((v) => {
        expect(impactValues.has(v)).toBe(false)
      })
    })

    it('não deve ter valores que colidam com PLAN_TYPE', () => {
      const planValues = new Set<string>(Object.values(PLAN_TYPE))
      const notifValues = Object.values(NOTIFICATION_TYPE) as string[]
      notifValues.forEach((v) => {
        expect(planValues.has(v)).toBe(false)
      })
    })
  })

  // ── SENTIMENT ────────────────────────────────────────────────────────────

  describe('SENTIMENT (lib/enums)', () => {
    it('deve existir em @/lib/enums', () => {
      expect(SENTIMENT).toBeDefined()
    })

    it('deve conter valores de sentimento reconhecíveis', () => {
      const values = Object.values(SENTIMENT)
      expect(values.length).toBeGreaterThanOrEqual(3)
      // Verifica que inclui algum valor neutro
      expect(values.some((v) => (v as string).includes('NEUTRO') || (v as string).includes('NEUTRAL'))).toBe(true)
    })
  })
})
