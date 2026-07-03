/**
 * Normalizacao de parametros de retorno de gateway (incidente 2026-07-03).
 *
 * Gateways anexam parametros proprios a back_url de forma pouco previsivel: o
 * Mercado Pago anexou `?preapproval_id=...` a uma back_url que JA tinha query
 * string, produzindo `?sub=...&plan=CRAQUE?preapproval_id=...` — o valor de
 * `plan` chega como "CRAQUE?preapproval_id=..." e comparacoes por igualdade
 * exata quebram silenciosamente (plan=LENDA viraria fallback CRAQUE; o banner
 * payment=failed nao renderizaria).
 *
 * Regra: o retorno do gateway e INFORMATIVO, nunca confirmacao financeira; o
 * parse deve ser tolerante a lixo anexado. Esta funcao corta o valor no
 * primeiro separador de query encontrado dentro dele.
 */
export function normalizeGatewayReturnParam(raw: string | string[] | null | undefined): string {
  // Params duplicados na URL chegam como array em Next searchParams: usar o primeiro.
  const first = Array.isArray(raw) ? raw[0] : raw
  return (first ?? '').split(/[?&#]/)[0] ?? ''
}
