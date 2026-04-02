// ============================================================================
// Foot Stock — API Client (axios com interceptors JWT + refresh)
// ============================================================================

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createClient } from '@supabase/supabase-js'
import { API_TIMEOUT_MS } from '@/lib/constants/timing'
import type { ApiResponse, ApiErrorResponse } from '@/types/api'

// ---------------------------------------------------------------------------
// Supabase client (browser-only, singleton)
// ---------------------------------------------------------------------------

let supabaseClient: ReturnType<typeof createClient> | null = null
let missingPublicEnvWarned = false

const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
}

function getSupabaseClient() {
  if (!supabaseClient && typeof window !== 'undefined') {
    if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
      if (!missingPublicEnvWarned) {
        console.error(
          'NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes no client.'
        )
        missingPublicEnvWarned = true
      }
      return null
    }
    supabaseClient = createClient(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey
    )
  }
  return supabaseClient
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const apiClient: AxiosInstance = axios.create({
  // Browser: usa origem atual para evitar cross-origin em portas diferentes (3000/3007 etc.)
  // Server/runtime fora do browser: mantém URL absoluta configurável.
  baseURL: typeof window === 'undefined' ? publicEnv.appUrl : '',
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// ---------------------------------------------------------------------------
// Request interceptors
// ---------------------------------------------------------------------------

// Seguranca: bloquear requisicoes HTTP em producao (somente HTTPS)
apiClient.interceptors.request.use(config => {
  if (
    process.env.NODE_ENV === 'production' &&
    config.baseURL &&
    !config.baseURL.startsWith('https://')
  ) {
    return Promise.reject(new Error('Requisicoes HTTP bloqueadas em producao. Use HTTPS.'))
  }
  return config
})

// Injeta Bearer token do Supabase
apiClient.interceptors.request.use(async config => {
  const supabase = getSupabaseClient()
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
  }
  return config
})

// ---------------------------------------------------------------------------
// Response interceptor (401 -> refresh -> retry)
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config
    const status = error.response?.status
    const requestUrl = originalRequest?.url ?? ''
    const isAuthEndpoint = requestUrl.startsWith('/api/v1/auth/')

    // Endpoints de auth retornam 401 "esperado" (credenciais inválidas, etc.).
    // Nesses casos não devemos tentar refresh nem redirecionar para login.
    if (isAuthEndpoint) {
      return Promise.reject(error)
    }

    // Token expirado — tentar refresh uma vez
    if (
      status === 401 &&
      originalRequest &&
      !(originalRequest as typeof originalRequest & { _retry?: boolean })._retry
    ) {
      ;(originalRequest as typeof originalRequest & { _retry?: boolean })._retry = true
      const supabase = getSupabaseClient()
      if (supabase) {
        const { error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError) {
          return apiClient(originalRequest)
        }
      }
      // Refresh falhou — redirecionar para login
      if (typeof window !== 'undefined') window.location.href = '/'
    }

    return Promise.reject(error)
  }
)

// ---------------------------------------------------------------------------
// Typed helper methods
// ---------------------------------------------------------------------------

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
  const response = await apiClient.get<ApiResponse<T>>(url, { params })
  return response.data
}

export async function apiPost<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
  const response = await apiClient.post<ApiResponse<T>>(url, data)
  return response.data
}

export async function apiPut<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
  const response = await apiClient.put<ApiResponse<T>>(url, data)
  return response.data
}

export async function apiDel<T>(url: string): Promise<ApiResponse<T>> {
  const response = await apiClient.delete<ApiResponse<T>>(url)
  return response.data
}
