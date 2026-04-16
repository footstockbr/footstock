// ============================================================================
// FootStock — Motor Status Contract
// Contrato de integração: módulos que consomem o status do motor.
//
// CONTRATO PARA module-14 (OrderForm):
//   O OrderForm DEVE:
//   1. Importar useMotorStatusContext() de '@/contexts/motor-status-context'
//   2. Desestruturar { isOffline }
//   3. Desabilitar o botão "Confirmar Ordem" quando isOffline === true
//   4. Exibir tooltip ou mensagem: "Ordens desabilitadas — motor em manutenção"
//
// Exemplo de uso no OrderForm:
//   const { isOffline } = useMotorStatusContext()
//   <button disabled={isOffline} ...>
//     {isOffline ? 'Motor em manutenção' : 'Confirmar Ordem'}
//   </button>
//
// CONTRATO PARA outros módulos que precisam do status do motor:
//   - Usar useMotorStatusContext() (recomendado — evita múltiplos polls)
//   - NÃO usar useMotorStatus() diretamente (cria poll duplicado)
// ============================================================================

// TODO (module-14): implementar conforme contrato acima no OrderForm
