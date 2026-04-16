import type { Metadata } from 'next'
import { DividendosClient } from './dividendos-client'

export const metadata: Metadata = {
  title: 'Dividendos — FootStock',
}

export default function DividendosPage() {
  return <DividendosClient />
}
