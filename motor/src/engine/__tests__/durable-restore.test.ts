/**
 * @jest-environment node
 */
// ============================================================================
// MarketEngine — restore duravel pos-restart do estado pausado (Task 008, loop
// 06-29-motor-toggles-nao-param, cenario 5).
//
// Fluxo de restart real (sem reaplicar halt-all em memoria):
//   - Pre-condicao: estado persistido no DB com isHalted=true, haltReason='HALT_ALL',
//     haltedUntil=null (efeito de MarketEngine.haltAll(), MarketEngine.ts:1208-1234).
//   - Acao: nova instancia do motor reconstroi o estado a partir do DB. A
//     reconciliacao halt vive em MarketEngine.loadAssets() (MarketEngine.ts:402-410):
//        haltedUntilMs = asset.haltedUntil?.getTime() ?? null
//        isCbHaltActive = isHalted && haltReason==='CIRCUIT_BREAKER'
//                         && haltedUntilMs !== null && haltedUntilMs > loadTime
//        isAdminHalt    = isHalted && haltReason !== 'CIRCUIT_BREAKER'
//        isPaused       = recoveryPrice === null && (isCbHaltActive || isAdminHalt)
//   - Pos-condicao: a instancia reconstruida carrega isPaused=true e runTick
//     (via PriceCalculator.calculate, codigo real) congela o preco ate resume-all.
//
// `reconcileHaltOnRestore` replica a decisao acima (mesma estrategia do teste
// MarketEngine.A_TOP.persist.test.ts, que replica `shouldPersist` citando a linha
// de origem). O congelamento e provado com o PriceCalculator REAL — nenhum mock.
// ============================================================================
import { PriceCalculator } from '../PriceCalculator'
import { buildInitialState, ASSET_FIXTURES } from '../../harness/fixtures'
import { getClusterParams } from '../../microstructure/clusters'

interface PersistedAssetRow {
  isHalted: boolean
  haltReason: string | null
  haltedUntil: Date | null
}

/**
 * Espelha INTEGRALMENTE MarketEngine.loadAssets() MarketEngine.ts:402-410,
 * incluindo o gate `recoveryPrice === null` (MarketEngine.ts:410). Retorna a
 * decisao de pausa duravel que a instancia reconstruida adota no boot.
 *
 * `recoveryPrice` (default null) replica o efeito do auto-recovery de preco
 * inflado (loadAssets MarketEngine.ts:368-388): quando o ativo e resetado ao FV
 * canonico (recoveryPrice !== null), o boot NAO mantem a pausa duravel, mesmo
 * que isHalted/haltReason indiquem halt. O default null preserva o caminho
 * comum (admin halt sem auto-recovery) usado pelos cenarios 5.1 e 5.2.
 */
function reconcileHaltOnRestore(
  asset: PersistedAssetRow,
  loadTime: number,
  recoveryPrice: number | null = null,
): boolean {
  const haltedUntilMs = asset.haltedUntil?.getTime() ?? null
  const isCbHaltActive =
    asset.isHalted &&
    asset.haltReason === 'CIRCUIT_BREAKER' &&
    haltedUntilMs !== null &&
    haltedUntilMs > loadTime
  const isAdminHalt = asset.isHalted && asset.haltReason !== 'CIRCUIT_BREAKER'
  return recoveryPrice === null && (isCbHaltActive || isAdminHalt)
}

const URU3 = ASSET_FIXTURES.find(f => f.ticker === 'URU3')!

describe('Restore duravel pos-restart (cenario 5)', () => {
  test('halt admin (HALT_ALL) sobrevive ao restart: instancia reconstruida carrega isPaused=true', () => {
    const persisted: PersistedAssetRow = {
      isHalted: true,
      haltReason: 'HALT_ALL',
      haltedUntil: null, // halt admin nao tem retomada automatica
    }
    const loadTime = Date.UTC(2026, 5, 29, 12, 0, 0)
    expect(reconcileHaltOnRestore(persisted, loadTime)).toBe(true)
  })

  test('gate recoveryPrice (MarketEngine.ts:410): auto-recovery de preco inflado NAO mantem a pausa no boot', () => {
    // Mesmo halt admin do caso anterior, mas com auto-recovery disparado
    // (recoveryPrice !== null): o ativo e resetado ao FV canonico e o boot
    // descongela. Prova que o helper espelha o gate `recoveryPrice === null`
    // do MarketEngine.loadAssets, e nao apenas isCbHaltActive || isAdminHalt.
    const persisted: PersistedAssetRow = {
      isHalted: true,
      haltReason: 'HALT_ALL',
      haltedUntil: null,
    }
    const loadTime = Date.UTC(2026, 5, 29, 12, 0, 0)
    // Sem auto-recovery: pausa duravel preservada.
    expect(reconcileHaltOnRestore(persisted, loadTime, null)).toBe(true)
    // Com auto-recovery (preco resetado ao FV canonico): boot nao pausa.
    expect(reconcileHaltOnRestore(persisted, loadTime, 100.0)).toBe(false)
  })

  test('instancia reconstruida congela o preco por 151 ticks ate resume-all explicito', () => {
    const persisted: PersistedAssetRow = {
      isHalted: true,
      haltReason: 'HALT_ALL',
      haltedUntil: null,
    }
    const loadTime = Date.UTC(2026, 5, 29, 12, 0, 0)

    // Reconstrucao: nova instancia (calculator + estado warm-start), com isPaused
    // derivado do DB (loadAssets() MarketEngine.ts:439-440), sem reaplicar haltAll.
    const calculator = new PriceCalculator()
    const state = buildInitialState(URU3)
    const params = getClusterParams(state.cluster)
    const restoredPaused = reconcileHaltOnRestore(persisted, loadTime)
    state.isPaused = restoredPaused
    state.haltReason = restoredPaused ? persisted.haltReason : null

    // Pre-condicao do cenario 5: a instancia carrega o halt do armazenamento.
    expect(state.isPaused).toBe(true)
    expect(state.haltReason).toBe('HALT_ALL')

    const initialPrice = state.currentPrice
    for (let tick = 1; tick <= 151; tick++) {
      const result = calculator.calculate(state, params, 1.25, undefined, 0.02)
      expect(result.newPrice).toBe(initialPrice)
      expect(result.halted).toBe(true)
    }
    expect(state.currentPrice).toBe(initialPrice)

    // resume-all explicito: so agora o preco descongela.
    state.isPaused = false
    state.haltReason = null
    let moved = false
    let last = state.currentPrice
    for (let tick = 1; tick <= 30 && !moved; tick++) {
      const result = calculator.calculate(state, params, 0.9, undefined, 0.02)
      state.currentPrice = result.newPrice
      if (result.newPrice !== last) moved = true
      last = result.newPrice
    }
    expect(moved).toBe(true)
  })

  test('halt de CIRCUIT_BREAKER expirado NAO sobrevive ao restart (so admin persiste)', () => {
    const loadTime = Date.UTC(2026, 5, 29, 12, 0, 0)
    // CB com haltedUntil no passado: start() limpa do DB e a reconciliacao nega.
    const expiredCb: PersistedAssetRow = {
      isHalted: true,
      haltReason: 'CIRCUIT_BREAKER',
      haltedUntil: new Date(loadTime - 60_000),
    }
    expect(reconcileHaltOnRestore(expiredCb, loadTime)).toBe(false)

    // CB ainda ativo (haltedUntil futuro): sobrevive com retomada agendada.
    const activeCb: PersistedAssetRow = {
      isHalted: true,
      haltReason: 'CIRCUIT_BREAKER',
      haltedUntil: new Date(loadTime + 300_000),
    }
    expect(reconcileHaltOnRestore(activeCb, loadTime)).toBe(true)

    // Ativo nao-halted: nunca pausado.
    const live: PersistedAssetRow = { isHalted: false, haltReason: null, haltedUntil: null }
    expect(reconcileHaltOnRestore(live, loadTime)).toBe(false)
  })
})
