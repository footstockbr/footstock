import type { Metadata } from 'next'
import { ValueAnalysisClient } from './value-analysis-client'

export const metadata: Metadata = {
  title: 'Análise de valor',
}

export default function AdminAnaliseDeValorPage() {
  return <ValueAnalysisClient />
}
