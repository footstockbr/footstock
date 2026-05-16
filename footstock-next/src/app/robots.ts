import type { MetadataRoute } from 'next'

const PRODUCTION_URL = 'https://www.footstock.com.br'

function resolveBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv && !fromEnv.includes('build.placeholder')) {
    return fromEnv.replace(/\/$/, '')
  }
  return PRODUCTION_URL
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveBaseUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/club/',
          '/conta/',
          '/inbox/',
          '/portfolio/',
          '/mercado/',
          '/ordens/',
          '/assessor/',
          '/dividendos/',
          '/assinatura/',
          '/perfil/',
          '/ligas/',
          '/onboarding/',
          '/redefinir-senha/',
          '/recuperar-senha/',
          '/verificar-idade/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
