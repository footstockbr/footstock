'use client'

import dynamic from 'next/dynamic'

const DevDataTestOverlay = dynamic(
  () => import('./DataTestOverlay').then((mod) => mod.DevDataTestOverlay),
  { ssr: false }
)

export function DevOverlayProvider() {
  return <DevDataTestOverlay />
}
