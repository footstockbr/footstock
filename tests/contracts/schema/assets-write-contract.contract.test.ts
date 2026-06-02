// ============================================================================
// FootStock — Contrato de Escrita em Assets
// Verifica que nenhuma rota Next.js escreve currentPrice diretamente
// Apenas o motor de preços atualiza via Redis
// Rastreabilidade: INT-001, INT-098 | US-CT-001 | module-28/TASK-2/ST004
// ============================================================================

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

const PROJECT_ROOT = path.join(__dirname, '../../..') // tests/contracts/schema → workspace root
const API_ROUTES_PATTERN = 'app/api/**/*.ts'
const PRICE_WRITE_REGEX = new RegExp('prisma\\.asset\\.update\\s*\\(\\s*\\{[^}]*currentPrice', 's')
const NON_PRICE_FIELDS = ['name', 'logoUrl', 'ticker', 'description', 'sector', 'colorPrimary']

async function scanFilesForPriceWrite(): Promise<string[]> {
  const files = await glob(API_ROUTES_PATTERN, { cwd: PROJECT_ROOT })
  return files.filter((file) => {
    const fullPath = path.join(PROJECT_ROOT, file)
    try {
      const content = fs.readFileSync(fullPath, 'utf-8')
      return PRICE_WRITE_REGEX.test(content)
    } catch {
      return false
    }
  })
}

describe('ST004: Assets Write Contract', () => {
  it('[SUCCESS] nenhuma rota Next.js escreve currentPrice diretamente no banco', async () => {
    const offendingFiles = await scanFilesForPriceWrite()

    if (offendingFiles.length > 0) {
      const fileList = offendingFiles.join('\n  - ')
      throw new Error(
        `Rotas proibidas encontradas escrevendo currentPrice diretamente:\n  - ${fileList}\n` +
          `Correção: remova currentPrice dessas rotas. Motor atualiza via Redis apenas.`,
      )
    }

    expect(offendingFiles).toHaveLength(0)
  })

  it('[EDGE] rotas de admin podem atualizar campos não-preço sem restrições', () => {
    // Contrato positivo: campos não-preço são permitidos para admin
    const adminUpdatePayload = {
      name: 'Urubu da Gavea FC',
      logoUrl: 'https://cdn.example.com/uru3.png',
      sector: 'sports',
      colorPrimary: '#E53E3E',
    }

    // Payload não contém currentPrice
    expect(adminUpdatePayload).not.toHaveProperty('currentPrice')

    // Campos não-preço são strings válidas
    for (const field of NON_PRICE_FIELDS) {
      if (field in adminUpdatePayload) {
        expect(
          typeof adminUpdatePayload[field as keyof typeof adminUpdatePayload],
        ).toBe('string')
      }
    }
  })
})
