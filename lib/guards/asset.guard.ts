// ============================================================================
// Foot Stock — Type Guards de Ativo
// ============================================================================

import { DIVISION, SENTIMENT } from '@/lib/enums';
import type { Asset } from '@/types/models';

// ---------------------------------------------------------------------------
// ST006: Guards de ativo
// ---------------------------------------------------------------------------

const DIVISION_VALUES = new Set<string>(Object.values(DIVISION));
const SENTIMENT_VALUES = new Set<string>(Object.values(SENTIMENT));

/** Verifica se o valor é um objeto Asset válido */
export function isAsset(value: unknown): value is Asset {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.ticker === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.division === 'string' &&
    DIVISION_VALUES.has(obj.division) &&
    typeof obj.currentPrice === 'number' &&
    typeof obj.isHalted === 'boolean' &&
    typeof obj.sentiment === 'string' &&
    SENTIMENT_VALUES.has(obj.sentiment) &&
    typeof obj.colors === 'object' &&
    obj.colors !== null &&
    typeof obj.financials === 'object' &&
    obj.financials !== null &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}

/** Verifica se o ativo está com negociação suspensa (circuit breaker) */
export function isAssetHalted(asset: Asset): boolean {
  return asset.isHalted;
}
