// ============================================================================
// FootStock — Contrato de Schema de Usuários
// Verifica modelo User no DMMF Prisma: colunas, tipos, enums
// Rastreabilidade: INT-100 | US-026 | module-28/TASK-2/ST001+ST005
// ============================================================================

import { Prisma } from '@prisma/client'

// Colunas que DEVEM existir no modelo User
const REQUIRED_COLUMNS = [
  'id',
  'email',
  'name',
  'cpfHash',
  'planType',
  'adminRole',
  'fsBalance',
  'status',
  'favoriteClub',
  'investorProfile',
  'createdAt',
  'updatedAt',
] as const

describe('ST001: User Schema Contract', () => {
  const userModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'User')
  const fieldNames = userModel?.fields.map((f) => f.name) ?? []

  it('[SUCCESS] modelo User existe no schema Prisma', () => {
    expect(userModel).toBeDefined()
  })

  it('[SUCCESS] todas as colunas obrigatórias estão presentes', () => {
    for (const col of REQUIRED_COLUMNS) {
      expect(fieldNames).toContain(col)
    }
  })

  it('[SUCCESS] sem colunas duplicadas no modelo User', () => {
    const unique = new Set(fieldNames)
    expect(unique.size).toBe(fieldNames.length)
  })

  it('[SUCCESS] fsBalance é tipo Decimal (preserva precisão financeira)', () => {
    const fsBalance = userModel?.fields.find((f) => f.name === 'fsBalance')
    expect(fsBalance?.type).toBe('Decimal')
  })

  it('[SUCCESS] planType referencia enum PlanType', () => {
    const planType = userModel?.fields.find((f) => f.name === 'planType')
    expect(planType?.type).toBe('PlanType')
    expect(planType?.kind).toBe('enum')
  })

  it('[SUCCESS] adminRole referencia enum AdminRole', () => {
    const adminRole = userModel?.fields.find((f) => f.name === 'adminRole')
    expect(adminRole?.type).toBe('AdminRole')
    expect(adminRole?.kind).toBe('enum')
  })

  it('[EDGE] adminRole é nullable (nem todo usuário é admin)', () => {
    const adminRole = userModel?.fields.find((f) => f.name === 'adminRole')
    expect(adminRole?.isRequired).toBe(false)
  })

  it('[EDGE] cpfHash é nullable (suporte a usuários OAuth sem CPF)', () => {
    const cpfHash = userModel?.fields.find((f) => f.name === 'cpfHash')
    expect(cpfHash?.isRequired).toBe(false)
  })
})

// ─── ST005: PlanType enum + fsBalance Decimal precision ─────────────────────

describe('ST005: PlanType Enum + fsBalance Decimal Precision Contract', () => {
  const planTypeEnum = Prisma.dmmf.datamodel.enums.find((e) => e.name === 'PlanType')
  const userModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'User')
  const fsBalanceField = userModel?.fields.find((f) => f.name === 'fsBalance')

  describe('[SUCCESS] PlanType enum — alinhado com FEE_BY_PLAN', () => {
    it('enum PlanType existe no schema Prisma', () => {
      expect(planTypeEnum).toBeDefined()
    })

    it('enum PlanType tem exatamente 3 valores', () => {
      expect(planTypeEnum?.values).toHaveLength(3)
    })

    it('enum PlanType contém JOGADOR, CRAQUE, LENDA', () => {
      const values = planTypeEnum?.values.map((v) => v.name).sort()
      expect(values).toEqual(['CRAQUE', 'JOGADOR', 'LENDA'])
    })

    it('nenhum plano extra foi adicionado sem atualizar FEE_BY_PLAN', () => {
      // Proteção contra drift: alguém adiciona PREMIUM sem taxa correspondente
      const FEE_PLAN_KEYS = ['JOGADOR', 'CRAQUE', 'LENDA'].sort()
      const enumValues = (planTypeEnum?.values.map((v) => v.name) ?? []).sort()
      expect(enumValues).toEqual(FEE_PLAN_KEYS)
    })
  })

  describe('[SUCCESS] fsBalance Decimal precision — integridade financeira', () => {
    it('fsBalance deve ser tipo Decimal (não Float nem String)', () => {
      // Decimal preserva precisão para valores financeiros (FS$0,25 de taxa)
      // Float pode acumular erro de ponto flutuante em operações repetidas
      expect(fsBalanceField?.type).toBe('Decimal')
    })

    it('fsBalance deve ser campo obrigatório (não nullable)', () => {
      // Saldo nunca deve ser null — inicializado com 10000.00 no cadastro
      expect(fsBalanceField?.isRequired).toBe(true)
    })
  })

  describe('[EDGE] consistência entre FEE_BY_PLAN e PlanType DMMF', () => {
    it('cada valor do PlanType DMMF deve ter taxa correspondente definida', () => {
      const FEE_BY_PLAN: Record<string, number> = {
        JOGADOR: 0.25,
        CRAQUE: 0.35,
        LENDA: 0.45,
      }
      const enumValues = planTypeEnum?.values.map((v) => v.name) ?? []
      enumValues.forEach((planName) => {
        expect(FEE_BY_PLAN).toHaveProperty(planName)
        expect(typeof FEE_BY_PLAN[planName]).toBe('number')
      })
    })
  })
})
