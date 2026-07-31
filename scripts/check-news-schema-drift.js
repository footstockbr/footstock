#!/usr/bin/env node
/**
 * Guard bloqueante: compara o model `News` entre os dois schemas Prisma do
 * monorepo e falha (exit != 0) quando divergirem.
 *
 * Por que isso existe (M067, item 010 do loop 07-28-noticias-multi-time-linha-por-time):
 *   - `prisma/schema.prisma` (raiz) é a fonte do Prisma Client do `motor`
 *     (Dockerfile raiz + motor/Dockerfile fazem `COPY prisma/ ./prisma/` e
 *     `prisma generate` a partir dela — nunca de footstock-next/prisma/).
 *   - `footstock-next/prisma/schema.prisma` é a fonte do Prisma Client do
 *     app Next.js e é o schema contra o qual `prisma migrate deploy` roda
 *     em produção (ver .github/workflows/deploy.yml).
 *   - Os dois precisam ficar em sync manualmente. Quando divergem, o motor
 *     gera um client desalinhado com o banco real: `NewsPublisher.ts` (~L94)
 *     captura `PrismaClientValidationError` e faz um `return` silencioso,
 *     perdendo a notícia sem sinal nenhum (violação de Zero Silêncio) — ver
 *     M067-SCHEMA-SYNC-EVIDENCE.md.
 *
 * O que o guard compara: a assinatura estrutural do bloco `model News { ... }`
 * (campos, tipos, atributos de campo e atributos de bloco `@@...`),
 * ignorando comentários (`//...` de linha inteira ou em final de linha, mas
 * nunca `//` dentro de string literal) e
 * diferenças de espaçamento — os dois arquivos legitimamente têm comentários
 * diferentes (paths de migration relativos a cada schema) sem que isso seja
 * drift real.
 *
 * Uso:
 *   node scripts/check-news-schema-drift.js
 *
 * Exit codes:
 *   0 = sem drift (ou --allow-missing e um dos dois schemas ausente)
 *   1 = drift detectado entre os dois models News
 *   2 = erro de uso/IO (schema ausente, model News ausente em um dos dois, etc.)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_ROOT = path.join(ROOT, 'prisma', 'schema.prisma');
const SCHEMA_NEXT = path.join(ROOT, 'footstock-next', 'prisma', 'schema.prisma');
const MODEL_NAME = 'News';

function readSchema(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERRO: schema nao encontrado: ${path.relative(ROOT, filePath)}`);
    process.exit(2);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Extrai o corpo bruto de `model {modelName} { ... }` de um arquivo .prisma
 * via contagem de chaves (robusto a chaves aninhadas eventuais em
 * atributos, embora Prisma nao costume ter).
 */
function extractModelBlock(content, modelName, filePath) {
  const startRe = new RegExp(`^model\\s+${modelName}\\s*\\{`, 'm');
  const match = startRe.exec(content);
  if (!match) {
    console.error(
      `ERRO: model ${modelName} nao encontrado em ${path.relative(ROOT, filePath)}`
    );
    process.exit(2);
  }

  const openBraceIdx = content.indexOf('{', match.index);
  let depth = 0;
  let endIdx = -1;
  for (let i = openBraceIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) {
    console.error(
      `ERRO: chave de fechamento do model ${modelName} nao encontrada em ${path.relative(ROOT, filePath)}`
    );
    process.exit(2);
  }

  // Corpo entre { e }, exclusive.
  return content.slice(openBraceIdx + 1, endIdx);
}

/**
 * Corta o comentario de fim de linha (`// ...`) respeitando string literal.
 *
 * Por que scanner char-a-char e nao `line.split('//')[0]`: o split cego corta
 * tambem o `//` que vive DENTRO de aspas — ex. `@default("https://cdn/x.png")`
 * vira `@default("https:`. Como o truncamento seria IDENTICO nos dois schemas,
 * um drift real que morasse justamente na parte cortada (outro host, outro
 * path) passaria como "sem drift": falso-negativo silencioso, exatamente o
 * modo de falha que este guard existe para impedir. Nenhum dos campos atuais
 * do model News tem `//` dentro de string, entao isso e blindagem preventiva
 * para o proximo campo com URL default.
 */
function stripLineComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString && ch === '\\') {
      i++; // escape dentro de string: `\"` nao fecha a aspa
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === '/' && line[i + 1] === '/') {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Normaliza o corpo do model para uma lista de linhas comparaveis:
 * - remove comentarios de linha inteira (`// ...`)
 * - remove comentarios em final de linha (`campo ... // ...`), sem tocar em
 *   `//` que faca parte de uma string literal (ver `stripLineComment`)
 * - colapsa espacos multiplos em um unico espaco
 * - remove linhas vazias resultantes
 * A ORDEM das linhas e preservada e significativa (ordem de campos importa).
 */
function normalizeModelBody(rawBody) {
  return rawBody
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) return ''; // comentario de linha inteira
      // remove comentario em final de linha, preservando o conteudo antes dele
      const withoutTrailingComment = stripLineComment(line);
      return withoutTrailingComment.trim().replace(/\s+/g, ' ');
    })
    .filter((line) => line.length > 0);
}

function diffLines(linesA, linesB, labelA, labelB) {
  const maxLen = Math.max(linesA.length, linesB.length);
  const diffs = [];
  for (let i = 0; i < maxLen; i++) {
    const a = linesA[i];
    const b = linesB[i];
    if (a !== b) {
      diffs.push({
        index: i,
        [labelA]: a === undefined ? '(ausente)' : a,
        [labelB]: b === undefined ? '(ausente)' : b,
      });
    }
  }
  return diffs;
}

function main() {
  const relRoot = path.relative(ROOT, SCHEMA_ROOT);
  const relNext = path.relative(ROOT, SCHEMA_NEXT);

  const contentRoot = readSchema(SCHEMA_ROOT);
  const contentNext = readSchema(SCHEMA_NEXT);

  const bodyRoot = extractModelBlock(contentRoot, MODEL_NAME, SCHEMA_ROOT);
  const bodyNext = extractModelBlock(contentNext, MODEL_NAME, SCHEMA_NEXT);

  const linesRoot = normalizeModelBody(bodyRoot);
  const linesNext = normalizeModelBody(bodyNext);

  const same =
    linesRoot.length === linesNext.length &&
    linesRoot.every((line, i) => line === linesNext[i]);

  if (same) {
    console.log(
      `OK: model ${MODEL_NAME} identico (${linesRoot.length} linhas normalizadas) entre ${relRoot} e ${relNext}`
    );
    process.exit(0);
  }

  console.error(`DRIFT DETECTADO: model ${MODEL_NAME} diverge entre os dois schemas Prisma.`);
  console.error(`  - ${relRoot}`);
  console.error(`  - ${relNext}`);
  console.error('');
  const diffs = diffLines(linesRoot, linesNext, 'root', 'next');
  for (const d of diffs) {
    console.error(`  linha normalizada #${d.index}:`);
    console.error(`    ${relRoot}: ${d.root}`);
    console.error(`    ${relNext}: ${d.next}`);
  }
  console.error('');
  console.error(
    'Motivo pelo qual isso bloqueia: o motor gera seu Prisma Client a partir de ' +
      `${relRoot} (ver Dockerfile/motor/Dockerfile), enquanto o app Next.js e as ` +
      `migrations de producao usam ${relNext} (ver .github/workflows/deploy.yml). ` +
      'Um drift aqui produz um client desalinhado com o banco real e o motor perde ' +
      'noticias em silencio (NewsPublisher.ts captura PrismaClientValidationError e ' +
      'retorna sem sinal). Sincronize os dois blocos `model News` manualmente antes ' +
      'de prosseguir.'
  );
  process.exit(1);
}

// So executa (e so chama process.exit) quando invocado como CLI. Sob `require`
// o modulo apenas expoe os helpers, permitindo unit test de `stripLineComment`
// sem derrubar o processo do runner.
if (require.main === module) {
  main();
}

module.exports = { stripLineComment, normalizeModelBody, extractModelBlock };
