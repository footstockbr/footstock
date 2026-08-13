import { leagueAutoEnrollService } from '@/lib/services/LeagueAutoEnrollService'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'

jest.mock('@/lib/repositories/LeagueRepository')

// ─── Mocks para rotas de tour ────────────────────────────────────────────────

const mockUserUpdate = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}))

const mockGetAuthUser = jest.fn()
jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}))

import { PATCH as patchTourCompleted } from '@/app/api/v1/users/me/tour-completed/route'
import { PATCH as patchTourSkip } from '@/app/api/v1/users/me/tour-skip/route'

describe('LeagueAutoEnrollService', () => {
  const userId = 'user-1'
  const leagueId = 'league-public-bronze'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('inscreve usuário em liga pública ativa (ENROLLED)', async () => {
    ;(leagueRepository.findActivePublicLeagueByDivision as jest.Mock).mockResolvedValue({ id: leagueId })
    ;(leagueRepository.addMember as jest.Mock).mockResolvedValue(undefined)

    const result = await leagueAutoEnrollService.enrollUserInPublicLeague(userId, 'JOGADOR')

    expect(result).toEqual({ status: 'ENROLLED', leagueId })
    expect(leagueRepository.addMember).toHaveBeenCalledWith(leagueId, userId)
  })

  test('não aplica maxMembers para liga PUBLICA', async () => {
    ;(leagueRepository.findActivePublicLeagueByDivision as jest.Mock).mockResolvedValue({ id: leagueId })
    ;(leagueRepository.addMember as jest.Mock).mockResolvedValue(undefined)

    const result = await leagueAutoEnrollService.enrollUserInPublicLeague(userId, 'JOGADOR')

    expect(result.status).toBe('ENROLLED')
    // addMember é chamado sem checagem prévia de capacidade
    expect(leagueRepository.addMember).toHaveBeenCalledWith(leagueId, userId)
  })

  test('retorna ALREADY_MEMBER quando membro já existe', async () => {
    ;(leagueRepository.findActivePublicLeagueByDivision as jest.Mock).mockResolvedValue({ id: leagueId })
    ;(leagueRepository.addMember as jest.Mock).mockRejectedValue({ code: 'P2002' })

    const result = await leagueAutoEnrollService.enrollUserInPublicLeague(userId, 'JOGADOR')

    expect(result).toEqual({ status: 'ALREADY_MEMBER', leagueId })
  })

  test('retorna NO_ACTIVE_PUBLIC_LEAGUE quando não há liga ativa', async () => {
    ;(leagueRepository.findActivePublicLeagueByDivision as jest.Mock).mockResolvedValue(null)

    const result = await leagueAutoEnrollService.enrollUserInPublicLeague(userId, 'JOGADOR')

    expect(result).toEqual({ status: 'NO_ACTIVE_PUBLIC_LEAGUE' })
    expect(leagueRepository.addMember).not.toHaveBeenCalled()
  })

  test('retorna FAILED em erro inesperado', async () => {
    ;(leagueRepository.findActivePublicLeagueByDivision as jest.Mock).mockResolvedValue({ id: leagueId })
    ;(leagueRepository.addMember as jest.Mock).mockRejectedValue(new Error('db timeout'))

    const result = await leagueAutoEnrollService.enrollUserInPublicLeague(userId, 'JOGADOR')

    expect(result.status).toBe('FAILED')
    expect((result as { reason: string }).reason).toBe('db timeout')
  })

  test('mapa plano-divisão respeita JOGADOR/CRAQUE/LENDA', () => {
    expect(leagueAutoEnrollService.getDivisionForPlan('JOGADOR')).toBe('BRONZE')
    expect(leagueAutoEnrollService.getDivisionForPlan('CRAQUE')).toBe('PRATA')
    expect(leagueAutoEnrollService.getDivisionForPlan('LENDA')).toBe('OURO')
  })
})

// ─── Integração: rotas de tour ───────────────────────────────────────────────

describe('Rotas de tour', () => {
  const userId = 'user-1'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function setupAuth(planType: string) {
    mockGetAuthUser.mockResolvedValue({
      user: { id: userId, planType },
      userId,
    })
  }

  test('PATCH /users/me/tour-completed aguarda auto-enroll e retorna status', async () => {
    setupAuth('JOGADOR')
    mockUserUpdate.mockResolvedValue({ id: userId, tourCompleted: true, planType: 'JOGADOR' })
    jest.spyOn(leagueAutoEnrollService, 'enrollUserInPublicLeague').mockResolvedValue({
      status: 'ENROLLED',
      leagueId: 'league-public-bronze',
    })

    const res = await patchTourCompleted()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.tourCompleted).toBe(true)
    expect(body.data.leagueEnrollment.status).toBe('ENROLLED')
    expect(leagueAutoEnrollService.enrollUserInPublicLeague).toHaveBeenCalledWith(userId, 'JOGADOR')
  })

  test('PATCH /users/me/tour-skip aguarda auto-enroll e retorna status', async () => {
    setupAuth('CRAQUE')
    mockUserUpdate.mockResolvedValue({
      id: userId,
      tourCompleted: true,
      tourSkippedAt: new Date(),
      planType: 'CRAQUE',
    })
    jest.spyOn(leagueAutoEnrollService, 'enrollUserInPublicLeague').mockResolvedValue({
      status: 'ALREADY_MEMBER',
      leagueId: 'league-public-prata',
    })

    const res = await patchTourSkip()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.tourCompleted).toBe(true)
    expect(body.data.tourSkippedAt).toBeDefined()
    expect(body.data.leagueEnrollment.status).toBe('ALREADY_MEMBER')
  })

  test('retorna 401 quando usuario nao autenticado', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const res = await patchTourCompleted()
    expect(res.status).toBe(401)
  })

  test('retorna resultado parcial quando tour persiste mas enrollment falha', async () => {
    setupAuth('LENDA')
    mockUserUpdate.mockResolvedValue({ id: userId, tourCompleted: true, planType: 'LENDA' })
    jest.spyOn(leagueAutoEnrollService, 'enrollUserInPublicLeague').mockResolvedValue({
      status: 'FAILED',
      reason: 'db timeout',
    })

    const res = await patchTourCompleted()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.tourCompleted).toBe(true)
    expect(body.data.leagueEnrollment.status).toBe('FAILED')
  })
})
