// CardUpdaterService — Detecta e trata cartões próximos de expirar (CL-253)

export class CardUpdaterService {
  /** Dias antes da expiração para disparar notificação */
  static readonly WARNING_DAYS = 30

  /**
   * Verifica se um cartão está próximo de expirar
   * @param expiryMonth mês de expiração (1-12)
   * @param expiryYear ano de expiração (4 dígitos)
   */
  static isExpiringSoon(expiryMonth: number, expiryYear: number): boolean {
    const now = new Date()
    const expiryDate = new Date(expiryYear, expiryMonth - 1, 1) // primeiro dia do mês
    expiryDate.setMonth(expiryDate.getMonth() + 1) // último dia do mês = primeiro do próximo

    const diffMs = expiryDate.getTime() - now.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays > 0 && diffDays <= this.WARNING_DAYS
  }

  /** Verifica se um cartão já expirou */
  static isExpired(expiryMonth: number, expiryYear: number): boolean {
    const now = new Date()
    const expiryDate = new Date(expiryYear, expiryMonth - 1, 1)
    expiryDate.setMonth(expiryDate.getMonth() + 1)
    return now >= expiryDate
  }

  /** Calcula dias até a expiração */
  static daysUntilExpiry(expiryMonth: number, expiryYear: number): number {
    const now = new Date()
    const expiryDate = new Date(expiryYear, expiryMonth - 1, 1)
    expiryDate.setMonth(expiryDate.getMonth() + 1)
    const diffMs = expiryDate.getTime() - now.getTime()
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  }
}
