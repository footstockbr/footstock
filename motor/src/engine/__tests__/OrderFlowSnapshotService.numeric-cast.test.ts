import { OrderFlowSnapshotService } from '../OrderFlowSnapshotService'

/**
 * Regressao OFI-22P02 (2026-09-02).
 *
 * Em `... a.current_price * (1 - ${BAND})` o Postgres tipa o parametro pelo vizinho:
 * o literal `1` chega sem tipo e vale como integer, entao o $n unifica como integer e
 * o bind de 0.15 estoura
 *   22P02 invalid input syntax for type integer: "0.15"
 * O `catch` de `capture()` engole isso e devolve UNAVAILABLE para todos os ativos —
 * a falha era 100% dos ticks e completamente silenciosa nas metricas de ordem.
 *
 * A suite antiga so lia `explainSql()`, que interpola a banda como LITERAL de string
 * (`0.15` cru, que o Postgres tipa como numeric sozinho) e nunca passou perto do bind
 * real. Por isso ela seguiu verde durante o bug inteiro.
 *
 * Aqui a query REAL de `capture()` e executada contra um stub que reproduz a regra de
 * inferencia do Postgres. Nao e o Postgres, e um modelo dele — por isso o primeiro
 * teste prova que o stub de fato pega o defeito antes de os outros usarem o stub como
 * evidencia.
 */

class PgInvalidTextRepresentation extends Error {
  code = '22P02'
}

type Recorded = { strings: readonly string[]; values: unknown[] }

/**
 * Modelo da unificacao de tipo do Postgres para parametros de $queryRaw:
 * se o parametro NAO declara o proprio tipo (`::algo` logo depois) e o texto
 * imediatamente antes termina num operador aritmetico precedido de literal inteiro
 * cru, o parametro herda integer — e um valor fracionario estoura 22P02.
 */
function makePgStub(rows: unknown[], recorded: Recorded[] = []) {
  return jest.fn((strings: readonly string[], ...values: unknown[]) => {
    recorded.push({ strings, values })
    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      const after = strings[i + 1] ?? ''
      if (/^::\s*[a-z]/i.test(after)) continue // tipo declarado explicitamente
      const before = strings[i] ?? ''
      const inheritsInteger = /(?:^|[\s(])\d+\s*[-+*/]\s*$/.test(before)
      if (inheritsInteger && typeof value === 'number' && !Number.isInteger(value)) {
        return Promise.reject(
          new PgInvalidTextRepresentation(`invalid input syntax for type integer: "${value}"`)
        )
      }
    }
    return Promise.resolve(rows)
  })
}

const ROWS = [
  {
    asset_id: 'asset-1',
    open_buy_qty: BigInt(10),
    open_sell_qty: BigInt(3),
    total_open_buy_qty: BigInt(12),
    total_open_sell_qty: BigInt(4),
    market_buy_qty: BigInt(5),
    market_sell_qty: BigInt(0),
    order_count: BigInt(2),
    top_order_ids: ['ord-1', 'ord-2'],
  },
]

const TICK = new Date('2026-09-02T12:00:00.000Z')

describe('OrderFlowSnapshotService — cast ::numeric da banda de proximidade', () => {
  it('o stub reproduz o 22P02: sem o cast, o mesmo bind falha', async () => {
    // Guarda do proprio instrumento. Se este teste parar de falhar sem cast, os
    // outros dois deste arquivo viram teatro.
    const stub = makePgStub(ROWS)
    const semCast = ['a.current_price * (1 - ', ') THEN o.quantity'] as unknown as TemplateStringsArray
    await expect(stub(semCast, 0.15)).rejects.toMatchObject({ code: '22P02' })

    const comCast = ['a.current_price * (1 - ', '::numeric) THEN o.quantity'] as unknown as TemplateStringsArray
    await expect(stub(comCast, 0.15)).resolves.toBe(ROWS)
  })

  it('capture() executa de verdade: a banda vai parametrizada e com tipo declarado', async () => {
    const recorded: Recorded[] = []
    const prisma = { $queryRaw: makePgStub(ROWS, recorded) }
    const service = new OrderFlowSnapshotService(prisma as never)

    const snapshots = await service.capture(['asset-1'], TICK)

    // Se o cast sumir, o stub rejeita, o catch de capture() degrada e este assert cai.
    expect(snapshots.get('asset-1')).toMatchObject({
      orderSnapshotSource: 'DB',
      openBuyQty: 10,
      openSellQty: 3,
      qualityFlags: [],
    })

    expect(recorded).toHaveLength(1)
    const { strings, values } = recorded[0]!

    // A banda entra como PARAMETRO (nao interpolada no texto) — duas vezes, (1 - b) e (1 + b).
    const bandIdx = values.map((v, i) => (v === 0.15 ? i : -1)).filter((i) => i >= 0)
    expect(bandIdx).toHaveLength(2)
    for (const i of bandIdx) {
      expect(strings[i]).toMatch(/\(1\s*[-+]\s*$/)
      expect(strings[i + 1]).toMatch(/^::numeric\b/)
    }
    // numeric e nao float8: assets.current_price e orders.price sao numeric(18,8).
    for (const i of bandIdx) {
      expect(strings[i + 1]).not.toMatch(/^::(float|double|real|int)/i)
    }
  })

  it('nenhum parametro de capture() herda tipo do vizinho aritmetico', async () => {
    const recorded: Recorded[] = []
    const prisma = { $queryRaw: makePgStub(ROWS, recorded) }
    await new OrderFlowSnapshotService(prisma as never).capture(['asset-1', 'asset-2'], TICK)

    const { strings, values } = recorded[0]!
    const semTipo = values
      .map((_, i) => i)
      .filter((i) => {
        const before = strings[i] ?? ''
        const after = strings[i + 1] ?? ''
        return /(?:^|[\s(])\d+\s*[-+*/]\s*$/.test(before) && !/^::\s*[a-z]/i.test(after)
      })

    expect(semTipo).toEqual([])
  })
})
