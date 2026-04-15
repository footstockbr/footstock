'use client'

import { useState, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { Search, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { UserActions } from './UserActions'
import type { AdminUserItem } from '@/lib/types/admin'
import { PLAN_LABELS, PLAN_BADGE_VARIANTS } from '@/lib/constants/admin-ui'

interface UserFilters {
  search: string
  planType: string
  adminRole: string
  status: string
  userType: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function UserList({ currentAdminRole }: { currentAdminRole?: string | null }) {
  const [filters, setFilters] = useState<UserFilters>({ search: '', planType: '', adminRole: '', status: '', userType: '' })
  const [searchInput, setSearchInput] = useState('') // valor imediato do input
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Debounce 300ms para busca — spec §Módulo 5
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }))
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) })
    if (filters.search) params.set('search', filters.search)
    if (filters.planType) params.set('planType', filters.planType)
    if (filters.adminRole) params.set('adminRole', filters.adminRole)
    if (filters.status) params.set('status', filters.status)
    if (filters.userType) params.set('userType', filters.userType)
    return `/api/v1/admin/users?${params}`
  }, [filters, page])

  const { data, error, isLoading, mutate } = useSWR(buildUrl(), fetcher, {
    keepPreviousData: true,
  })

  const users: AdminUserItem[] = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  function handleFilterChange(key: keyof UserFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const selectClass = 'h-10 min-h-[44px] w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] px-3 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]'

  return (
    <div data-testid="admin-user-list">
      {/* Barra de busca */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#707A8A] pointer-events-none" />
          <input
            type="search"
            data-testid="admin-user-search-input"
            placeholder="Buscar por nome ou email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Buscar usuário"
            className="h-10 min-h-[44px] w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] pl-9 pr-3 text-sm text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#F0B90B] min-h-[44px]"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filtros adicionais */}
      {filtersOpen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <select value={filters.planType} onChange={(e) => handleFilterChange('planType', e.target.value)} aria-label="Filtrar por plano" className={selectClass}>
            <option value="">Todos os planos</option>
            <option value="JOGADOR">Jogador</option>
            <option value="CRAQUE">Craque</option>
            <option value="LENDA">Lenda</option>
          </select>
          <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} aria-label="Filtrar por status" className={selectClass}>
            <option value="">Todos status</option>
            <option value="active">Ativo</option>
            <option value="suspended">Suspenso</option>
          </select>
          <select value={filters.userType} onChange={(e) => handleFilterChange('userType', e.target.value)} aria-label="Filtrar por tipo de usuário" className={selectClass}>
            <option value="">Todos tipos</option>
            <option value="NORMAL">Normal</option>
            <option value="TIME_PARCEIRO">Time Parceiro</option>
            <option value="INFLUENCIADOR">Influenciador</option>
          </select>
          <select value={filters.adminRole} onChange={(e) => handleFilterChange('adminRole', e.target.value)} aria-label="Filtrar por papel administrativo" className={selectClass}>
            <option value="">Todos os papéis</option>
            <option value="SUPER_ADMIN">SuperAdmin</option>
            <option value="ADMINISTRADOR">Administrador</option>
            <option value="MONITOR">Monitor</option>
            <option value="EDITOR">Editor</option>
            <option value="MODERADOR">Moderador</option>
          </select>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)]" aria-busy={isLoading}>
        {error && (
          <div className="flex items-center gap-3 p-6 text-sm text-[#F6465D]" role="alert">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Erro ao carregar usuários.</span>
            <button onClick={() => mutate()} className="ml-auto flex items-center gap-1.5 text-[#929AA5] hover:text-[#F0B90B] min-h-[44px] min-w-[44px]">
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </button>
          </div>
        )}

        {isLoading && !data && (
          <div className="p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-[rgba(240,185,11,.04)] last:border-0 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-[#2a2420] flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3.5 bg-[#2a2420] rounded w-1/3 mb-1.5" />
                  <div className="h-3 bg-[#1e1a16] rounded w-1/2" />
                </div>
                <div className="h-5 w-16 bg-[#2a2420] rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-[#929AA5]">Nenhum usuário encontrado</p>
          </div>
        )}

        {!error && users.length > 0 && (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full" aria-label="Lista de usuários">
                <thead>
                  <tr className="border-b border-[rgba(240,185,11,.08)]">
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Usuário</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Plano</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Status</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Role Admin</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Cadastro</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs text-[#929AA5] font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} data-testid="admin-user-row" className="border-b border-[rgba(240,185,11,.04)] hover:bg-[rgba(240,185,11,.02)]">
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-[#EAECEF]">{user.name}</p>
                          <p className="text-xs text-[#929AA5]">{user.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={PLAN_BADGE_VARIANTS[user.planType]} size="xs">
                          {PLAN_LABELS[user.planType] ?? user.planType}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium ${user.status === 'active' ? 'text-[#4ade80]' : 'text-[#F6465D]'}`}>
                          {user.status === 'active' ? 'Ativo' : 'Suspenso'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#929AA5]">
                        {user.adminRole ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#929AA5]">
                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <UserActions
                          user={user}
                          currentAdminRole={currentAdminRole}
                          onActionComplete={() => mutate()}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden flex flex-col gap-2 p-3">
              {users.map((user) => {
                const initials = user.name
                  .split(' ')
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()

                return (
                  <div key={user.id} className="flex items-center gap-3 rounded-lg border border-[rgba(240,185,11,.1)] p-4 bg-[#1E2329] hover:bg-[#232930] transition-colors">
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#F0B90B] to-[#d4971e] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#0B0E11]">{initials}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-[#EAECEF] truncate">{user.name}</p>
                        {user.status === 'active' && (
                          <div className="h-2 w-2 rounded-full bg-[#4ade80] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-[#929AA5] truncate">{user.email}</p>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge variant={PLAN_BADGE_VARIANTS[user.planType]} size="xs">
                        {PLAN_LABELS[user.planType] ?? user.planType}
                      </Badge>
                      <span className="text-[9px] font-mono font-bold text-[#2EBD85]">
                        +FS${(user.fsBalance ?? 0).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Paginação */}
            <nav aria-label="Paginação de usuários" className="flex items-center justify-between px-4 py-3 border-t border-[rgba(240,185,11,.08)]">
              <span className="text-xs text-[#929AA5]">
                Página {pagination.page} de {pagination.totalPages} · {pagination.total} usuários
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Página anterior"
                  className="h-8 w-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[rgba(240,185,11,.18)] text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  aria-label="Próxima página"
                  className="h-8 w-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[rgba(240,185,11,.18)] text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </div>
  )
}
