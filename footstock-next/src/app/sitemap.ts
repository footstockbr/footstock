import type { MetadataRoute } from 'next'

const PRODUCTION_URL = 'https://www.footstock.com.br'

function resolveBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv && !fromEnv.includes('build.placeholder')) {
    return fromEnv.replace(/\/$/, '')
  }
  return PRODUCTION_URL
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = resolveBaseUrl()
  const now = new Date()

  const publicRoutes: Array<{
    path: string
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
    priority: number
  }> = [
    { path: '/', changeFrequency: 'daily', priority: 1.0 },
    { path: '/login', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/cadastro', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/privacidade', changeFrequency: 'yearly', priority: 0.3 },
  ]

  return publicRoutes.map(({ path, changeFrequency, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
