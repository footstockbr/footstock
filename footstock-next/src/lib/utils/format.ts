/**
 * Formatação monetária — BRL
 * Centralizado para evitar duplicação entre componentes admin.
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
