/**
 * Fonte unica das URLs de retorno do gateway de pagamento (success/failure/pending).
 * Antes, o checkout (PlanService) e a renovacao/dunning (DunningService) montavam essas strings
 * separadamente; quando o sucesso passou a apontar para /planos/sucesso (item 11), o dunning
 * ficou para tras apontando ainda para /planos?payment=success. Centralizar elimina esse drift.
 *
 * Incidente 2026-07-03: a successUrl carregava query propria (?sub=...&plan=...) e o Mercado
 * Pago anexou `?preapproval_id=...` por cima, malformando a URL de retorno. A successUrl agora
 * e PATH-BASED (/planos/sucesso/{subId}, sem query) — qualquer coisa que o gateway anexe vira
 * query string valida. O plano exibido e derivado do banco pela propria pagina, nunca de query.
 * failure/pending mantem query minima (?payment=...) e o consumidor normaliza o param via
 * normalizeGatewayReturnParam (tolerante a lixo anexado pelo gateway).
 */
export function buildGatewayReturnUrls(
  appUrl: string,
  subscriptionId: string
): { successUrl: string; failureUrl: string; pendingUrl: string } {
  return {
    successUrl: `${appUrl}/planos/sucesso/${subscriptionId}`,
    failureUrl: `${appUrl}/planos?payment=failed`,
    pendingUrl: `${appUrl}/planos?payment=pending&sub=${subscriptionId}`,
  }
}
