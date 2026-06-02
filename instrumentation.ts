// ============================================================================
// FootStock — Next.js Instrumentation
// Código executado UMA VEZ no startup do servidor (runtime Node.js apenas).
// Referência: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// ============================================================================

export async function register(): Promise<void> {
  // Executar apenas no runtime Node.js (não em Edge runtime ou build time)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNewsFavoriteClubNotifier } = await import(
      '@/lib/jobs/news-favorite-club-notifier'
    )
    startNewsFavoriteClubNotifier()
  }
}
