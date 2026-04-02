// ============================================================================
// Foot Stock — Erros LGPD
// Códigos de erro prefixo LGPD/RATE — alinhados com ERROR-CATALOG.md
// ============================================================================

export class LGPDError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400
  ) {
    super(message)
    this.name = 'LGPDError'
  }
}

// Tabela de códigos LGPD
export const LGPD_ERRORS = {
  AUTH_REQUIRED:    { code: 'LGPD_001', status: 401, message: 'Autenticação necessária para acessar dados LGPD' },
  INVALID_BODY:     { code: 'LGPD_010', status: 400, message: 'Corpo da requisição inválido. Envie { granted: boolean }' },
  INVALID_PURPOSE:  { code: 'LGPD_020', status: 400, message: 'Finalidade de consentimento inválida' },
  CANNOT_REVOKE:    { code: 'LGPD_050', status: 422, message: 'Consentimento essencial não pode ser revogado' },
  DUPLICATE:        { code: 'LGPD_081', status: 409, message: 'Consentimento duplicado' },
  EXPORT_NOT_FOUND: { code: 'LGPD_060', status: 404, message: 'Nenhum job de export encontrado' },
  EXPORT_FAILED:    { code: 'LGPD_061', status: 500, message: 'Falha ao processar export. DPO notificado.' },
  RATE_LIMIT:       { code: 'LGPD_RATE_001', status: 429, message: 'Você já solicitou um export. Aguarde 24h.' },
} as const
