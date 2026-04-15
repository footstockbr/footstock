// module-20: LeagueRepository — acesso a dados de ligas via Prisma

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import type { League, LeagueMember, LeagueMemberRanking, LeagueDuration, PlanType } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function generateId(len = 8): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

/** Calcula endsAt baseado na duração da liga */
function calcEndsAt(duration: LeagueDuration, from: Date): Date {
  const d = new Date(from)
  if (duration === '1S') d.setDate(d.getDate() + 7)
  else if (duration === '1M') d.setDate(d.getDate() + 30)
  else d.setDate(d.getDate() + 180) // TEMPORADA
  return d
}

/** Gera token assinado com HMAC-SHA256 (expiração 30 dias) */
function generateInviteToken(payload: object, leagueStartsAt?: Date): string {
  const secret = process.env.INVITE_TOKEN_SECRET ?? 'default-insecure-secret'
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  // Expira em 30 dias OU quando a liga iniciar (o que ocorrer primeiro)
  const expiresAt = leagueStartsAt
    ? Math.min(Date.now() + thirtyDaysMs, leagueStartsAt.getTime())
    : Date.now() + thirtyDaysMs
  const data = Buffer.from(JSON.stringify({ ...payload, expiresAt })).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

/** Verifica assinatura HMAC — retorna payload bruto ou null */
function parseAndVerifyToken(token: string): Record<string, unknown> | null {
  try {
    const [data, sig] = token.split('.')
    if (!data || !sig) return null
    const secret = process.env.INVITE_TOKEN_SECRET ?? 'default-insecure-secret'
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url')
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (Date.now() > parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

// ─── Serialização ─────────────────────────────────────────────────────────────

type DbLeague = {
  id: string; name: string; slug: string; type: string; division: string
  duration: string; sponsorId: string | null; createdBy: string | null
  startsAt: Date; endsAt: Date | null; status: string; createdAt: Date
  permiteAlavancagem?: boolean
  _count?: { members: number }
  // Patrocinador: incluído somente se ativo (isActive=true). Caso inativo, aparece como null.
  sponsor?: { id: string; name: string; logoUrl?: string | null; isActive?: boolean } | null
}

function serializeLeague(l: DbLeague, extra?: Partial<League>): League {
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    type: l.type as League['type'],
    division: l.division as League['division'],
    duration: l.duration as LeagueDuration,
    sponsorId: l.sponsorId,
    createdBy: l.createdBy,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt?.toISOString() ?? null,
    status: l.status as League['status'],
    createdAt: l.createdAt.toISOString(),
    memberCount: l._count?.members,
    permiteAlavancagem: l.permiteAlavancagem ?? false,
    // Ocultar patrocinador inativo: não exibir no frontend se isActive=false
    sponsor: l.sponsor && l.sponsor.isActive !== false
      ? { id: l.sponsor.id, name: l.sponsor.name }
      : null,
    ...extra,
  }
}

// ─── LeagueRepository ─────────────────────────────────────────────────────────

export interface CreateLeagueDTO {
  name: string
  type: 'PUBLICA' | 'AMIGOS' | 'PRO'
  duration: LeagueDuration
  division: League['division']
  emblemUrl?: string
  sponsorId?: string
  createdBy: string
  permiteAlavancagem?: boolean
}

export class LeagueRepository {
  async findAll(options: {
    type?: string
    status?: string
    page: number
    limit?: number
  }): Promise<{ data: League[]; total: number }> {
    const limit = options.limit ?? 20
    const skip = (options.page - 1) * limit
    const where: Record<string, unknown> = {}
    if (options.type) where.type = options.type
    if (options.status) where.status = options.status

    const [leagues, total] = await Promise.all([
      prisma.league.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { members: true } },
          sponsor: { select: { id: true, name: true, isActive: true } },
        },
      }),
      prisma.league.count({ where }),
    ])

    return { data: leagues.map((l) => serializeLeague(l)), total }
  }

  async findById(
    id: string,
    currentUserId?: string
  ): Promise<(League & { members: LeagueMember[] }) | null> {
    const league = await prisma.league.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true } },
        sponsor: { select: { id: true, name: true } },
        members: {
          select: {
            id: true, leagueId: true, userId: true,
            score: true, rank: true, joinedAt: true, lastScoreAt: true,
            scoreBreakdown: true, updatedAt: true,
            user: { select: { name: true, planType: true } },
          },
          orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
        },
      },
    })

    if (!league) return null

    const isMember = currentUserId
      ? league.members.some((m) => m.userId === currentUserId)
      : undefined
    const userRank = currentUserId
      ? (league.members.find((m) => m.userId === currentUserId)?.rank ?? null)
      : null

    const members: LeagueMember[] = league.members.map((m) => ({
      id: m.id,
      leagueId: m.leagueId,
      userId: m.userId,
      score: Number(m.score),
      rank: m.rank,
      joinedAt: m.joinedAt.toISOString(),
      lastScoreAt: m.lastScoreAt?.toISOString() ?? null,
      scoreBreakdown: m.scoreBreakdown as unknown as import('@/types').ScoreBreakdown | null,
      updatedAt: m.updatedAt.toISOString(),
    }))

    return { ...serializeLeague(league, { isMember, userRank }), members }
  }

  async create(data: CreateLeagueDTO): Promise<League> {
    const now = new Date()
    const slug = `${slugify(data.name)}-${generateId(6)}`
    const endsAt = calcEndsAt(data.duration, now)

    const league = await prisma.league.create({
      data: {
        name: data.name,
        slug,
        type: data.type,
        division: data.division,
        duration: data.duration,
        sponsorId: data.sponsorId ?? null,
        createdBy: data.createdBy,
        startsAt: now,
        endsAt,
        status: 'ACTIVE',
        permiteAlavancagem: data.permiteAlavancagem ?? false,
      },
      include: {
        _count: { select: { members: true } },
      },
    })

    return serializeLeague(league)
  }

  async addMember(leagueId: string, userId: string): Promise<void> {
    // Verificar limite de 20 para ligas AMIGOS
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { _count: { select: { members: true } } },
    })

    if (!league) throw new LeagueError(LEAGUE_ERRORS.NOT_FOUND)

    if (league.type === 'AMIGOS' && league._count.members >= league.maxMembers) {
      throw new LeagueError({
        ...LEAGUE_ERRORS.FULL,
        message: `Liga cheia (${league._count.members}/${league.maxMembers} membros)`,
      })
    }

    try {
      await prisma.leagueMember.create({
        data: { leagueId, userId, joinedAt: new Date() },
      })
    } catch (err: unknown) {
      // P2002 = unique constraint violation
      if ((err as { code?: string })?.code === 'P2002') {
        throw new LeagueError(LEAGUE_ERRORS.ALREADY_MEMBER)
      }
      throw err
    }
  }

  async getRanking(leagueId: string, currentUserId?: string): Promise<LeagueMemberRanking[]> {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
      include: {
        user: { select: { name: true, planType: true } },
      },
    })

    return members.map((m) => {
      const isCurrentUser = currentUserId ? m.userId === currentUserId : false
      const isTop3 = m.rank <= 3

      // Privacidade: rank 4+ recebe nome truncado (2 chars + asteriscos)
      // Exceção: top 3 e o próprio usuário sempre veem nome completo
      const displayName = isCurrentUser || isTop3
        ? m.user.name
        : m.user.name.slice(0, 2) + '*'.repeat(Math.max(0, m.user.name.length - 2))

      return {
        rank: m.rank,
        userId: m.userId,
        userName: displayName,
        userPlan: m.user.planType as PlanType,
        score: (m.scoreBreakdown ?? {
          rentabilidade: 0, sofisticacao: 0, diversificacao: 0,
          consistencia: 0, bonusEducativo: 0, total: 0,
          finalScore: Number(m.score), fatorEquidade: 1,
        }) as unknown as LeagueMemberRanking['score'],
        joinedAt: m.joinedAt.toISOString(),
        isCurrentUser,
      }
    })
  }

  async generateInviteToken(leagueId: string): Promise<string> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { startsAt: true, status: true },
    })
    // Se liga ainda não iniciou (status PENDING), token expira quando iniciar
    const leagueStartsAt = league?.status === 'PENDING' ? league.startsAt : undefined

    // Gerar nonce único — salvo em league.inviteCode para suportar revogação
    const nonce = generateId(16)
    await prisma.league.update({
      where: { id: leagueId },
      data: { inviteCode: nonce },
    })

    return generateInviteToken({ leagueId, type: 'league-invite', nonce }, leagueStartsAt)
  }

  /** Valida token e verifica nonce atual no banco — async para suportar revogação */
  async validateInviteToken(token: string): Promise<{ leagueId: string } | null> {
    const parsed = parseAndVerifyToken(token)
    if (!parsed || typeof parsed.leagueId !== 'string' || typeof parsed.nonce !== 'string') {
      return null
    }
    const league = await prisma.league.findUnique({
      where: { id: parsed.leagueId },
      select: { inviteCode: true },
    })
    // Nonce do token deve coincidir com o nonce atual no banco
    if (!league?.inviteCode || league.inviteCode !== parsed.nonce) return null
    return { leagueId: parsed.leagueId }
  }

  /** Revoga o link de convite atual — tokens antigos passam a ser inválidos */
  async revokeInviteToken(leagueId: string): Promise<void> {
    await prisma.league.update({
      where: { id: leagueId },
      data: { inviteCode: null },
    })
  }

  async findByUserId(userId: string): Promise<League[]> {
    const memberships = await prisma.leagueMember.findMany({
      where: { userId },
      include: {
        league: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
    })

    return memberships.map((m) => serializeLeague(m.league))
  }
}

export const leagueRepository = new LeagueRepository()
