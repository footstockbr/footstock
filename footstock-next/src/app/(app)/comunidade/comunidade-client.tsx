"use client";

import { useState, useCallback } from "react";
import {
  MessageCircle,
  Heart,
  Flag,
  Trash2,
  ChevronDown,
  Send,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useForumPosts, type ForumPostView } from "@/hooks/useForumPosts";
import { useForumComments } from "@/hooks/useForumComments";
import { useAnalytics } from "@/hooks/useAnalytics";

// ─── Character counter colors ─────────────────────────────────────────────────

const MAX_CHARS = 280;

function charCountColor(len: number): string {
  if (len <= 200) return "text-[#2EBD85]"; // verde
  if (len <= 260) return "text-[#F0B90B]"; // amarelo
  return "text-[#F6465D]"; // vermelho
}

function charCountRingColor(len: number): string {
  if (len <= 200) return "stroke-[#2EBD85]";
  if (len <= 260) return "stroke-[#F0B90B]";
  return "stroke-[#F6465D]";
}

// ─── Circular progress indicator ──────────────────────────────────────────────

function CharCounter({ count }: { count: number }) {
  const pct = Math.min(count / MAX_CHARS, 1);
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const remaining = MAX_CHARS - count;

  return (
    <div className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-[#2B3139]"
        />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={charCountRingColor(count)}
        />
      </svg>
      <span className={`text-xs font-mono tabular-nums ${charCountColor(count)}`}>
        {remaining}
      </span>
    </div>
  );
}

// ─── Time ago helper ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "recentes", label: "Recentes" },
  { value: "curtidos", label: "Populares" },
] as const;

// ─── Post card (com comentarios por post — item 24) ───────────────────────────

interface ForumPostCardProps {
  post: ForumPostView;
  currentUserId: string | null;
  onToggleLike: (post: ForumPostView) => void;
  onFlag: (postId: string) => void;
  onDelete: (postId: string) => void;
  onTickerClick: (ticker: string) => void;
}

function ForumPostCard({
  post,
  currentUserId,
  onToggleLike,
  onFlag,
  onDelete,
  onTickerClick,
}: ForumPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState("");
  const { comments, isLoading, isError, addComment, isAdding } = useForumComments(
    post.id,
    expanded,
  );

  async function submitComment() {
    const text = draft.trim();
    if (!text || isAdding) return;
    try {
      await addComment(text);
      setDraft("");
    } catch {
      // erro ja exibido via toast no hook
    }
  }

  const isAuthor = !!currentUserId && post.userId === currentUserId;

  return (
    <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar name={post.authorName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#EAECEF] truncate">{post.authorName}</p>
          <p className="text-[10px] text-[#707A8A]">{timeAgo(post.createdAt)}</p>
        </div>
        {post.ticker && (
          <button
            onClick={() => onTickerClick(post.ticker!)}
            className="text-xs font-mono font-bold text-[#F0B90B] hover:underline"
          >
            {post.ticker}
          </button>
        )}
      </div>

      {/* Content */}
      <p className="text-sm text-[#929AA5] leading-relaxed">{post.content}</p>

      {/* Actions */}
      <div className="flex items-center gap-4 mt-3">
        {/* Like toggle */}
        <button
          onClick={() => onToggleLike(post)}
          className={`flex items-center gap-1 text-xs transition-colors ${
            post.hasUserLiked ? "text-[#F6465D]" : "text-[#929AA5] hover:text-[#F6465D]"
          }`}
          aria-label={post.hasUserLiked ? "Descurtir post" : "Curtir post"}
        >
          <Heart className={`h-3.5 w-3.5 ${post.hasUserLiked ? "fill-current" : ""}`} />
          {post.likesCount}
        </button>

        {/* Balao de comentarios (item 24) */}
        <button
          onClick={() => setExpanded((v) => !v)}
          data-testid={`forum-comment-toggle-${post.id}`}
          aria-expanded={expanded}
          className="flex items-center gap-1 text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors"
          aria-label={expanded ? "Ocultar comentarios" : "Comentar"}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {expanded && comments.length > 0 ? comments.length : null}
        </button>

        {/* Flag/report */}
        {currentUserId && post.userId !== currentUserId && (
          <button
            onClick={() => onFlag(post.id)}
            className="flex items-center gap-1 text-xs text-[#929AA5] hover:text-[#F0B90B] transition-colors"
            aria-label="Denunciar post"
          >
            <Flag className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete (author only) */}
        {isAuthor &&
          (confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#F6465D]">Excluir?</span>
              <button
                onClick={() => onDelete(post.id)}
                className="text-xs text-[#F6465D] font-semibold hover:underline"
              >
                Sim
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[#929AA5] hover:underline"
              >
                Nao
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-xs text-[#929AA5] hover:text-[#F6465D] transition-colors"
              aria-label="Excluir post"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ))}
      </div>

      {/* Comentarios por post (item 24) */}
      {expanded && (
        <div
          className="mt-3 border-t border-[rgba(240,185,11,.1)] pt-3 space-y-3"
          data-testid={`forum-comments-${post.id}`}
        >
          {isLoading ? (
            <p className="text-xs text-[#707A8A]">Carregando comentarios...</p>
          ) : isError ? (
            <p className="text-xs text-[#F6465D]">Erro ao carregar comentarios. Tente novamente.</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-[#707A8A]">Seja o primeiro a comentar.</p>
          ) : (
            <ul className="space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <Avatar name={c.authorName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#EAECEF]">
                      {c.authorName}
                      <span className="ml-1.5 text-[10px] font-normal text-[#707A8A]">
                        {timeAgo(c.createdAt)}
                      </span>
                    </p>
                    <p className="text-xs text-[#929AA5] break-words">{c.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {currentUserId && (
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
                placeholder="Escreva um comentario..."
                rows={1}
                maxLength={MAX_CHARS}
                data-testid={`forum-comment-input-${post.id}`}
                className="flex-1 resize-none rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] px-3 py-2 text-xs text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[rgba(240,185,11,.4)]"
              />
              <button
                onClick={() => void submitComment()}
                disabled={!draft.trim() || isAdding}
                data-testid={`forum-comment-submit-${post.id}`}
                aria-label="Publicar comentario"
                className="shrink-0 rounded-lg bg-[#F0B90B] p-2 text-[#0B0E11] transition-opacity disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export interface ComunidadeClientProps {
  currentUserId?: string;
}

export function ComunidadeClient({ currentUserId }: ComunidadeClientProps) {
  const {
    posts,
    pagination,
    isLoading,
    sort,
    setSort,
    ticker,
    setTicker,
    page,
    setPage,
    createPost,
    isCreating,
    toggleLike,
    deletePost,
    flagPost,
  } = useForumPosts();
  const { track } = useAnalytics();

  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [postTicker, setPostTicker] = useState("");

  const handleSubmit = useCallback(async () => {
    if (content.trim().length === 0 || content.length > MAX_CHARS) return;
    try {
      await createPost(content.trim(), postTicker.trim() || undefined);
      setContent("");
      setPostTicker("");
      setShowForm(false);
    } catch {
      // Erro tratado no hook
    }
  }, [content, postTicker, createPost]);

  const handleToggleLike = useCallback(
    (post: ForumPostView) => {
      toggleLike(post.id);
      // EVT-032: forum_post_liked — rastreia curtida (apenas ao curtir, nao descurtir)
      if (!post.hasUserLiked) {
        track("forum_post_liked", { plan: "JOGADOR" as const });
      }
    },
    [toggleLike, track]
  );

  return (
    <Tabs defaultValue="forum">
      <TabsList className="w-full">
        <TabsTrigger value="forum">Fórum</TabsTrigger>
      </TabsList>

      {/* ─── FORUM TAB ─────────────────────────────────────────────────────── */}
      <TabsContent value="forum" className="mt-4">
        {/* Botão criar post */}
        <Button
          variant="primary"
          size="md"
          fullWidth
          className="mb-4"
          onClick={() => setShowForm((p) => !p)}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          {showForm ? "Cancelar" : "Nova publicação"}
        </Button>

        {/* ─── Form de criação com character counter ───────────────────────── */}
        {showForm && (
          <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.25)] p-4 mb-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
              placeholder="O que está acontecendo no mercado?"
              rows={3}
              maxLength={MAX_CHARS}
              className="w-full bg-transparent text-sm text-[#EAECEF] placeholder:text-[#707A8A] resize-none focus:outline-none"
              aria-label="Conteúdo do post"
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(240,185,11,.1)]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={postTicker}
                  onChange={(e) => setPostTicker(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="Ticker (opcional)"
                  className="h-8 w-28 rounded border border-[rgba(240,185,11,.15)] bg-[#181A20] px-2 text-xs text-[#EAECEF] font-mono placeholder:text-[#707A8A] focus:outline-none focus:border-[rgba(240,185,11,.4)]"
                  aria-label="Ticker do ativo"
                />
              </div>
              <div className="flex items-center gap-3">
                <CharCounter count={content.length} />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={
                    isCreating ||
                    content.trim().length === 0 ||
                    content.length > MAX_CHARS
                  }
                  isLoading={isCreating}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Publicar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Filtros ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex rounded-lg border border-[rgba(240,185,11,.12)] overflow-hidden">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  sort === opt.value
                    ? "bg-[#F0B90B] text-[#181A20] font-semibold"
                    : "bg-[#1E2329] text-[#929AA5] hover:text-[#EAECEF]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {ticker && (
            <button
              onClick={() => setTicker(undefined)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#F0B90B]/10 text-[#F0B90B] text-xs font-mono"
            >
              {ticker} <span className="text-[10px]">x</span>
            </button>
          )}
        </div>

        {/* ─── Lista de posts ──────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.08)] p-4 animate-pulse"
              >
                <div className="h-4 w-32 bg-[#2B3139] rounded mb-2" />
                <div className="h-3 w-full bg-[#2B3139] rounded mb-1" />
                <div className="h-3 w-2/3 bg-[#2B3139] rounded" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-10 w-10 text-[#707A8A] mx-auto mb-3" />
            <p className="text-sm text-[#929AA5]">
              Nenhuma publicação ainda. Seja o primeiro!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((post) => (
              <ForumPostCard
                key={post.id}
                post={post}
                currentUserId={currentUserId ?? null}
                onToggleLike={handleToggleLike}
                onFlag={flagPost}
                onDelete={deletePost}
                onTickerClick={setTicker}
              />
            ))}
          </div>
        )}

        {/* ─── Paginação ───────────────────────────────────────────────────── */}
        {pagination && pagination.hasNext && (
          <div className="flex justify-center mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(page + 1)}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              Carregar mais
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
