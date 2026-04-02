'use client'

// ============================================================================
// Foot Stock — ForumClient
// Componente client do fórum: CreatePost colapsável no mobile
// Fonte: module-18/TASK-2/ST004
// ============================================================================

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { AppHeader } from '@/components/layout'
import { CreatePost } from '@/components/forum/CreatePost'
import { ForumFilters } from '@/components/forum/ForumFilters'
import { PostList } from '@/components/forum/PostList'
import { useSession } from '@/hooks/useSession'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/cn'
import type { ForumSortOrder } from '@/lib/repositories/ForumRepository'

export default function ForumClient() {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const isMobile = useMediaQuery('(max-width: 767px)')

  const [ticker, setTicker] = useState<string | undefined>(undefined)
  const [sort, setSort] = useState<ForumSortOrder>('recent')
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false)

  // RESOLVED: T006 – handlePostSuccess sem useCallback → nova ref a cada render
  const handlePostSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.forum.all })
    if (isMobile) setIsCreatePostOpen(false)
  }, [queryClient, isMobile])

  if (!user) {
    return (
      <div className="space-y-4 p-4" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <AppHeader />

      {/* Desktop: CreatePost sempre visível */}
      {!isMobile && (
        <div className="px-4">
          <CreatePost onSuccess={handlePostSuccess} />
        </div>
      )}

      <div className="px-4">
        <ForumFilters
          selectedTicker={ticker}
          sort={sort}
          onTickerChange={setTicker}
          onSortChange={setSort}
        />
      </div>

      <div className="px-4">
        <PostList
          ticker={ticker}
          sort={sort}
          currentUserId={user.id}
          userAdminRole={user.adminRole ?? null}
        />
      </div>

      {/* Mobile: botão flutuante + CreatePost colapsável */}
      {isMobile && (
        <>
          {/* CreatePost com animação */}
          <div
            className={cn(
              'fixed bottom-20 left-0 right-0 px-4 z-30 transition-all duration-200 ease-in-out',
              isCreatePostOpen
                ? 'translate-y-0 opacity-100 pointer-events-auto'
                : 'translate-y-4 opacity-0 pointer-events-none'
            )}
          >
            <CreatePost onSuccess={handlePostSuccess} />
          </div>

          {/* Botão "+" flutuante */}
          {!isCreatePostOpen && (
            <button
              type="button"
              aria-label="Criar novo post"
              aria-expanded={isCreatePostOpen}
              onClick={() => setIsCreatePostOpen(true)}
              className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-accent text-black shadow-lg flex items-center justify-center text-2xl font-bold hover:bg-accent/90 transition-colors"
            >
              +
            </button>
          )}

          {/* Botão fechar quando aberto */}
          {isCreatePostOpen && (
            <button
              type="button"
              aria-label="Fechar criação de post"
              onClick={() => setIsCreatePostOpen(false)}
              className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-slate-700 text-text-primary shadow-lg flex items-center justify-center text-xl hover:bg-slate-600 transition-colors"
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  )
}

