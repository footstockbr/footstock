#!/usr/bin/env node
/**
 * T-23: Guard de drift entre os dois schemas Prisma do projeto.
 *
 * Verifica que as colunas `origin` e `fallback_reason` existem em AMBOS os
 * schemas (motor e footstock-next). O guard obriga alterar os dois schemas
 * no mesmo push — se um schema tem a coluna e o outro nao, o script falha
 * com exit 1 e mensagem explicando o drift.
 *
 * Uso:
 *   node motor/scripts/check-news-schema-drift.js
 *
 * Exit codes:
 *   0 - schemas sincronizados (ambos tem as colunas)
 *   1 - drift detectado ou erro de leitura
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const SCHEMAS = [
  { label: 'motor', file: path.join(ROOT, 'prisma', 'schema.prisma') },
  { label: 'footstock-next', file: path.join(ROOT, 'footstock-next', 'prisma', 'schema.prisma') },
]

const REQUIRED_COLUMNS = ['origin', 'fallback_reason']

let driftDetected = false

for (const col of REQUIRED_COLUMNS) {
  const presence = {}
  for (const { label, file } of SCHEMAS) {
    if (!fs.existsSync(file)) {
      console.error(`[drift-guard] schema nao encontrado: ${file}`)
      process.exit(1)
    }
    const content = fs.readFileSync(file, 'utf8')
    // Busca a coluna no modelo News (map "origin" ou "fallback_reason")
    const pattern = new RegExp(`@map\\("${col}"\\)`)
    presence[label] = pattern.test(content)
  }

  const labels = Object.keys(presence)
  const values = Object.values(presence)
  const allPresent = values.every(Boolean)
  const allAbsent = values.every((v) => !v)

  if (allPresent) {
    console.log(`[drift-guard] coluna "${col}": presente em ${labels.join(' e ')} — OK`)
  } else if (allAbsent) {
    console.log(`[drift-guard] coluna "${col}": ausente em ambos — OK (migration ainda nao aplicada)`)
  } else {
    driftDetected = true
    const present = labels.filter((l) => presence[l])
    const missing = labels.filter((l) => !presence[l])
    console.error(
      `[drift-guard] DRIFT detectado na coluna "${col}": ` +
      `presente em ${present.join(', ')}, AUSENTE em ${missing.join(', ')}. ` +
      `Altere os dois schemas no mesmo push.`
    )
  }
}

if (driftDetected) {
  console.error('\n[drift-guard] FALHOU: drift entre schemas. Corrija antes do push.')
  process.exit(1)
}

console.log('\n[drift-guard] OK: schemas sincronizados.')
process.exit(0)
