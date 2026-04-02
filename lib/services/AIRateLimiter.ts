// Reexport do AIRateLimiter para manter consistência com a spec (lib/services/)
// Implementação real em lib/redis/AIRateLimiter.ts
export { AIRateLimiter, aiRateLimiter } from '@/lib/redis/AIRateLimiter'
