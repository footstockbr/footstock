// ============================================================================
// TEMPORARY: One-time migration endpoint for pending DDL changes
// Remove this file after migrations are applied to production.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results: string[] = []

  try {
    // Migration 1: add coach_name to assets
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "coach_name" TEXT`
      )
      results.push('OK: assets.coach_name added')
    } catch (e) {
      results.push(`SKIP: assets.coach_name — ${(e as Error).message}`)
    }

    // Migration 2: banner date/image fields
    const bannerCols = [
      ['start_date', 'TIMESTAMP(3)'],
      ['end_date', 'TIMESTAMP(3)'],
      ['image_desktop_url', 'TEXT'],
      ['image_mobile_url', 'TEXT'],
      ['image_vertical_url', 'TEXT'],
    ] as const

    for (const [col, type] of bannerCols) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "sponsor_banners" ADD COLUMN IF NOT EXISTS "${col}" ${type}`
        )
        results.push(`OK: sponsor_banners.${col} added`)
      } catch (e) {
        results.push(`SKIP: sponsor_banners.${col} — ${(e as Error).message}`)
      }
    }

    // Mark migrations as applied in _prisma_migrations
    const migrations = [
      {
        id: '20260416120000',
        name: '20260416120000_add_coach_name',
        checksum: 'manual',
      },
      {
        id: '20260416130000',
        name: '20260416130000_banner_dates_images',
        checksum: 'manual',
      },
    ]

    for (const m of migrations) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
           VALUES ($1, $2, $3, NOW(), 1)
           ON CONFLICT (id) DO NOTHING`,
          m.id,
          m.checksum,
          m.name
        )
        results.push(`OK: _prisma_migrations record for ${m.name}`)
      } catch (e) {
        results.push(`SKIP: _prisma_migrations ${m.name} — ${(e as Error).message}`)
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json(
      { error: 'Migration failed', details: (err as Error).message },
      { status: 500 }
    )
  }
}
