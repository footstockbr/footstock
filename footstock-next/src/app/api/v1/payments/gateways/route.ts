import { getAuthUser } from '@/lib/auth'
import { ok, errors } from '@/lib/api'
import { resolveOfferedCheckoutGateways } from '@/lib/payments/enabled-gateways.server'

// GET /api/v1/payments/gateways
// Retorna os gateways de checkout efetivamente habilitados (credenciais
// presentes), na ordem canonica de exibicao. Consumido pelos componentes de
// assinatura para montar o seletor de pagamento sem expor um gateway quebrado.
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Oferecer apenas gateways capazes de recorrência real (planos são recorrentes) —
  // exclui gateways que só fazem pagamento único (ver enabled-gateways.server.ts).
  return ok({ gateways: resolveOfferedCheckoutGateways() })
}
