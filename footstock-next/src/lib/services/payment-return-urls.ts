/**
 * Fonte unica das URLs de retorno do gateway de pagamento (success/failure/pending).
 * Antes, o checkout (PlanService) e a renovacao/dunning (DunningService) montavam essas strings
 * separadamente; quando o sucesso passou a apontar para /planos/sucesso (item 11), o dunning
 * ficou para tras apontando ainda para /planos?payment=success. Centralizar elimina esse drift.
 */
export function buildGatewayReturnUrls(
  appUrl: string,
  subscriptionId: string,
  planType?: string
): { successUrl: string; failureUrl: string; pendingUrl: string } {
  const qs = new URLSearchParams({ sub: subscriptionId })
  if (planType) qs.set('plan', planType)
  return {
    successUrl: `${appUrl}/planos/sucesso?${qs.toString()}`,
    failureUrl: `${appUrl}/planos?payment=failed`,
    pendingUrl: `${appUrl}/planos?payment=pending&sub=${subscriptionId}`,
  }
}
