// TEMPORARY: Seed endpoint to fix Clube Parceiro FC userType
// Remove after use.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ONETIME_TOKEN = 'fs-seed-club-2026-04-16-q7j3p'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    authHeader === `Bearer ${ONETIME_TOKEN}`
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all users with adminRole CLUB_PARTNER but userType != TIME_PARCEIRO
    const clubPartners = await prisma.user.findMany({
      where: {
        adminRole: 'CLUB_PARTNER',
        NOT: { userType: 'TIME_PARCEIRO' },
      },
      select: { id: true, name: true, email: true, userType: true },
    })

    if (clubPartners.length === 0) {
      return NextResponse.json({ message: 'No users to update', updated: 0 })
    }

    // Update all CLUB_PARTNER users to have userType TIME_PARCEIRO
    const result = await prisma.user.updateMany({
      where: {
        adminRole: 'CLUB_PARTNER',
        NOT: { userType: 'TIME_PARCEIRO' },
      },
      data: { userType: 'TIME_PARCEIRO' },
    })

    return NextResponse.json({
      success: true,
      updated: result.count,
      users: clubPartners.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        previousType: u.userType,
        newType: 'TIME_PARCEIRO',
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Seed failed', details: (err as Error).message },
      { status: 500 }
    )
  }
}
