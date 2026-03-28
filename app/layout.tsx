import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/components/providers/QueryProvider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Foot Stock', template: '%s | Foot Stock' },
  description:
    'O mercado de ações do futebol brasileiro. Compre e venda ações de jogadores em tempo real.',
  keywords: [
    'foot stock',
    'futebol',
    'ações',
    'mercado',
    'jogadores',
    'brasileirão',
    'trading',
    'investimento esportivo',
  ],
  icons: {
    icon: [
      { url: '/favicon_io/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon_io/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon_io/favicon.ico' },
    ],
    apple: '/favicon_io/apple-touch-icon.png',
    other: [{ rel: 'manifest', url: '/favicon_io/site.webmanifest' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#080808',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-bg-primary text-text-primary antialiased min-h-dvh`}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
