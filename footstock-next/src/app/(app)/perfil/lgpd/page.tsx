import { redirect } from 'next/navigation'
import { ROUTES } from '@/lib/constants/routes'

/**
 * /perfil/lgpd — canonical alias for the LGPD consent management page.
 * Redirects permanently to /perfil/consentimentos.
 * Referenced in: Privacy Policy public page, email footers, DPO responses.
 */
export default function LgpdRedirectPage() {
  redirect(ROUTES.PERFIL_CONSENTIMENTOS ?? '/perfil/consentimentos')
}
