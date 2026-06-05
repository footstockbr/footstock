'use client'

import dynamic from 'next/dynamic'

const DevDataTestOverlay = dynamic(
  () => import('./DataTestOverlay').then((mod) => mod.DevDataTestOverlay),
  { ssr: false }
)

export function DevOverlayProvider() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_OVERLAY !== '1') return null
  return <DevDataTestOverlay />
}
