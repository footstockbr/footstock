// ============================================================================
// Foot Stock — Type Helpers & Utility Types
// ============================================================================

// ---------------------------------------------------------------------------
// ST004: Tipos utilitários reutilizáveis
// ---------------------------------------------------------------------------

/** Torna o tipo anulável */
export type Nullable<T> = T | null;

/** Adiciona campos de timestamp a um tipo */
export type WithTimestamps<T> = T & {
  createdAt: string;
  updatedAt: string;
};

/** Estado assíncrono discriminado (idle | loading | success | error) */
export type AsyncState<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: string };

/** Torna campos específicos obrigatórios */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Torna campos específicos opcionais */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Extrai o tipo de elemento de um array */
export type ArrayElement<T extends readonly unknown[]> = T[number];

/** Estado de formulário com dirty tracking */
export type FormState<T> = {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
};

/** Handler de evento tipado */
export type EventHandler<T = void> = T extends void
  ? () => void
  : (payload: T) => void;

/** Identificador de recurso (UUID string) */
export type ResourceId = string & { readonly __brand: 'ResourceId' };

/** Timestamp ISO 8601 */
export type ISOTimestamp = string & { readonly __brand: 'ISOTimestamp' };

/** Valor monetário em centavos de FS$ (inteiro) */
export type FSCents = number & { readonly __brand: 'FSCents' };

/** Percentual decimal (0.0 a 1.0) */
export type DecimalPercent = number & { readonly __brand: 'DecimalPercent' };
