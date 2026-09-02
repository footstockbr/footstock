/**
 * Fase 3 (M072) — guarda estatica: nenhuma ordem morre sem motivo.
 *
 * Este teste NAO exercita comportamento; ele varre o codigo-fonte. O motivo e
 * que o defeito que a Fase 3 corrige nao aparece em runtime: uma escrita nova
 * que encerre uma ordem sem `cancelReason` roda perfeitamente, passa em todos os
 * testes de fluxo, e so se manifesta meses depois como "Cancelada" sem
 * explicacao no historico do cliente. Um teste de fluxo por caminho novo
 * dependeria de alguem lembrar de escrever o teste; esta varredura falha sozinha
 * no primeiro `updateMany` novo.
 *
 * Regra travada: toda escrita em `order.update`/`order.updateMany` que grave
 * `status` terminal nao-executado (CANCELLED ou EXPIRED) precisa gravar
 * `cancelReason` no MESMO objeto `data`.
 *
 * Vocabulario fechado em `docs/FASE3-ciclo-de-vida-da-ordem.md` §6. Valor fora
 * dele tambem reprova: a UI mapeia codigo -> texto humano
 * (`OrderHistory.tsx::CANCEL_REASON_NOTES`) e codigo desconhecido vira nota
 * ausente, ou seja, silencio de novo.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const SCAN_DIRS = ['src', 'scripts']

/** §6 do design. Adicionar aqui exige adicionar em `CANCEL_REASON_NOTES` tambem. */
const ALLOWED_REASONS = [
  'USER_REQUEST',
  'INSUFFICIENT_BALANCE',
  'ASSET_HALTED',
  'EXECUTION_RETRY_EXHAUSTED',
  'EXPIRED',
  'OCO_SIBLING',
  'PLAN_CANCELLED',
  'RECONCILIATION',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

interface WriteSite {
  file: string
  line: number
  block: string
}

/**
 * Recorta cada chamada `*.order.update(` / `*.order.updateMany(` ate o fecha-
 * parenteses correspondente, contando profundidade. Regex ate o proximo `})`
 * quebraria em `data: { version: { increment: 1 } }`, que existe no
 * `OrderService.cancelOrder` real.
 */
function findOrderWriteSites(): WriteSite[] {
  const sites: WriteSite[] = []
  const call = /\.order\.(update|updateMany)\s*\(/g

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const src = readFileSync(file, 'utf-8')
      let m: RegExpExecArray | null
      call.lastIndex = 0
      while ((m = call.exec(src)) !== null) {
        let depth = 0
        let i = m.index + m[0].length - 1
        const start = i
        for (; i < src.length; i++) {
          if (src[i] === '(') depth++
          else if (src[i] === ')') {
            depth--
            if (depth === 0) break
          }
        }
        sites.push({
          file: file.slice(ROOT.length + 1),
          line: src.slice(0, m.index).split('\n').length,
          block: src.slice(start, i + 1),
        })
      }
    }
  }
  return sites
}

const SITES = findOrderWriteSites()

/** Escreve status terminal nao-executado? (ignora `where`, que so filtra) */
function writesTerminalStatus(block: string): boolean {
  const data = block.indexOf('data:')
  if (data === -1) return false
  const tail = block.slice(data)
  return /status:\s*(['"]|ORDER_STATUS\.)(CANCELLED|EXPIRED)/.test(tail)
}

describe('cancelReason — cobertura estatica das escritas de ordem', () => {
  test('a varredura acha os sites (guarda contra regex que para de casar)', () => {
    // Se o padrao de acesso ao Prisma mudar, este teste vira verde vazio e passa
    // a nao proteger nada. O piso e o numero de sites conhecidos hoje.
    expect(SITES.length).toBeGreaterThanOrEqual(8)
  })

  test('toda escrita de status CANCELLED/EXPIRED grava cancelReason', () => {
    const offenders = SITES.filter((s) => writesTerminalStatus(s.block) && !/cancelReason/.test(s.block)).map(
      (s) => `${s.file}:${s.line}`
    )
    expect(offenders).toEqual([])
  })

  test('toda escrita de status CANCELLED/EXPIRED zera nextAttemptAt', () => {
    // Ordem terminal que continua com `nextAttemptAt` no futuro reaparece no
    // filtro de elegibilidade do motor. Nao quebra (o filtro de status barra),
    // mas deixa lixo que o proximo leitor vai interpretar como fila viva.
    const offenders = SITES.filter((s) => writesTerminalStatus(s.block) && !/nextAttemptAt/.test(s.block)).map(
      (s) => `${s.file}:${s.line}`
    )
    expect(offenders).toEqual([])
  })

  test('nenhum cancelReason fora do vocabulario fechado', () => {
    const literal = /cancelReason:\s*'([A-Z_]+)'/g
    const bad: string[] = []
    for (const s of SITES) {
      let m: RegExpExecArray | null
      literal.lastIndex = 0
      while ((m = literal.exec(s.block)) !== null) {
        if (!ALLOWED_REASONS.includes(m[1])) bad.push(`${s.file}:${s.line} -> ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })

  test('os motivos gravados no codigo tem texto humano na UI', () => {
    const ui = readFileSync(join(ROOT, 'src/components/orders/OrderHistory.tsx'), 'utf-8')
    const notes = ui.slice(ui.indexOf('CANCEL_REASON_NOTES'))
    for (const reason of ALLOWED_REASONS) {
      expect(notes).toContain(`${reason}:`)
    }
  })
})
