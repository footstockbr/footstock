import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')

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
