/**
 * Testes do guard `scripts/check-news-schema-drift.js`.
 *
 * Origem (finding 010-F4 do loop 07-28-noticias-multi-time-linha-por-time):
 * a normalizacao cortava comentario de fim de linha com `line.split('//')[0]`,
 * um split cego que tambem decapitava `//` dentro de string literal. O
 * truncamento acontecia igual nos dois schemas, entao um drift real que
 * morasse na parte cortada (ex: hosts diferentes em `@default("https://...")`)
 * passava como "sem drift" — falso-negativo silencioso no unico guard que
 * impede o motor de gerar um Prisma Client desalinhado com o banco.
 * O caso 'drift dentro de @default("https://...")' saia com exit 0 antes do fix.
 *
 * Como rodar:
 *   node scripts/__tests__/check-news-schema-drift.test.js
 *
 * Sem framework de proposito: o jest da raiz do repo esta quebrado desde que o
 * app foi para `footstock-next/` (`next/jest` com dir './' aborta com
 * "Couldn't find any `pages` or `app` directory"), e um guard de CI nao pode
 * ficar sem teste esperando esse conserto. O arquivo e dual-mode: se os globais
 * do jest existirem (harness consertado no futuro, `__tests__/` cai no
 * testMatch default), registra os mesmos casos via `it()` em vez de rodar o
 * runner proprio — assim nao vira um "suite sem teste" quebrando o CI.
 */
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GUARD_PATH = path.resolve(__dirname, '..', 'check-news-schema-drift.js');
const PRODUCT_ROOT = path.resolve(__dirname, '..', '..');
const { stripLineComment, normalizeModelBody } = require(GUARD_PATH);

function buildSchemaFile(newsBodyLines) {
  return [
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
    'model News {',
    ...newsBodyLines,
    '}',
    '',
  ].join('\n');
}

/**
 * Roda o guard contra um par de schemas sinteticos.
 *
 * O guard resolve os dois schemas por `__dirname/..`, sem parametro de path;
 * copiar o arquivo real para dentro de uma arvore temporaria e o jeito de
 * exercitar o codigo de producao byte-a-byte sem inventar uma API de injecao
 * que ninguem usa (os 3 workflows do CI chamam `node scripts/check-news-schema-drift.js` nu).
 */
function runGuardWith(rootBodyLines, nextBodyLines) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'news-schema-drift-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'prisma'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'footstock-next', 'prisma'), { recursive: true });

    const guardCopy = path.join(tmp, 'scripts', 'check-news-schema-drift.js');
    fs.copyFileSync(GUARD_PATH, guardCopy);
    fs.writeFileSync(path.join(tmp, 'prisma', 'schema.prisma'), buildSchemaFile(rootBodyLines));
    fs.writeFileSync(
      path.join(tmp, 'footstock-next', 'prisma', 'schema.prisma'),
      buildSchemaFile(nextBodyLines)
    );

    const res = spawnSync(process.execPath, [guardCopy], { encoding: 'utf8' });
    return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const BASE = ['  id String @id @default(cuid())', '  title String'];

const CASES = [
  [
    'stripLineComment corta comentario de fim de linha fora de string',
    () => {
      assert.strictEqual(
        stripLineComment('  ticker String? // ticker do ativo').trim(),
        'ticker String?'
      );
    },
  ],
  [
    'stripLineComment preserva `//` dentro de string literal',
    () => {
      const line = '  banner String? @default("https://cdn.exemplo/x.png")';
      assert.strictEqual(stripLineComment(line), line);
    },
  ],
  [
    'stripLineComment corta o comentario que vem DEPOIS de uma string com `//`',
    () => {
      const line = '  banner String? @default("https://a/x.png") // fallback';
      assert.strictEqual(
        stripLineComment(line).trim(),
        'banner String? @default("https://a/x.png")'
      );
    },
  ],
  [
    'stripLineComment nao fecha a aspa num `\\"` escapado',
    () => {
      const line = '  legend String @default("aspas \\" e https://x") // nota';
      assert.strictEqual(
        stripLineComment(line).trim(),
        'legend String @default("aspas \\" e https://x")'
      );
    },
  ],
  [
    'stripLineComment devolve a linha intacta quando nao ha comentario',
    () => {
      assert.strictEqual(stripLineComment('  id String @id'), '  id String @id');
    },
  ],
  [
    'normalizeModelBody descarta comentario de linha inteira e colapsa espacos',
    () => {
      const body = ['  // so um comentario', '  id     String   @id', ''].join('\n');
      assert.deepStrictEqual(normalizeModelBody(body), ['id String @id']);
    },
  ],
  [
    'normalizeModelBody mantem distinguiveis dois defaults de URL que so diferem depois do `//`',
    () => {
      const a = normalizeModelBody('  banner String @default("https://cdn.a/x.png")');
      const b = normalizeModelBody('  banner String @default("https://cdn.b/x.png")');
      assert.notDeepStrictEqual(a, b);
    },
  ],
  [
    'guard sai 0 quando os models sao iguais e so os comentarios diferem',
    () => {
      const res = runGuardWith(
        [...BASE, '  ticker String? // path relativo ao schema da raiz'],
        [...BASE, '  ticker String? // path relativo ao schema do next']
      );
      assert.strictEqual(res.status, 0, res.stderr);
      assert.ok(res.stdout.includes('OK: model News identico'), res.stdout);
    },
  ],
  [
    'guard sai 1 quando um campo diverge de forma obvia',
    () => {
      const res = runGuardWith(
        [...BASE, '  clicks Int @default(0)'],
        [...BASE, '  clicks Int @default(1)']
      );
      assert.strictEqual(res.status, 1, res.stderr);
      assert.ok(res.stderr.includes('DRIFT DETECTADO'), res.stderr);
    },
  ],
  [
    'guard sai 1 quando o drift mora DENTRO de um @default("https://...") (010-F4)',
    () => {
      // Antes do fix os dois lados viravam `banner String @default("https:` e o
      // guard reportava exit 0 — o falso-negativo que este caso tranca.
      const res = runGuardWith(
        [...BASE, '  banner String @default("https://cdn.alpha/x.png")'],
        [...BASE, '  banner String @default("https://cdn.beta/x.png")']
      );
      assert.strictEqual(res.status, 1, res.stderr);
      assert.ok(res.stderr.includes('cdn.alpha'), res.stderr);
      assert.ok(res.stderr.includes('cdn.beta'), res.stderr);
    },
  ],
  [
    'nao-regressao: os dois schemas Prisma REAIS continuam em sync (exit 0)',
    () => {
      const res = spawnSync(process.execPath, [GUARD_PATH], {
        cwd: PRODUCT_ROOT,
        encoding: 'utf8',
      });
      assert.ok(!(res.stderr || '').includes('DRIFT DETECTADO'), res.stderr);
      assert.strictEqual(res.status, 0, res.stderr);
    },
  ],
];

const underJest = typeof describe === 'function' && typeof it === 'function';

if (underJest) {
  describe('check-news-schema-drift', () => {
    for (const [name, fn] of CASES) {
      it(name, fn);
    }
  });
} else {
  let failed = 0;
  for (const [name, fn] of CASES) {
    try {
      fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${name}`);
      console.error(`     ${err && err.message ? err.message : err}`);
    }
  }
  console.log(`\n${CASES.length - failed}/${CASES.length} casos passaram`);
  process.exit(failed === 0 ? 0 : 1);
}
