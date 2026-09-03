// ============================================================================
// FootStock — Jest Integration Config
// Testes de integração com banco de dados real (PostgreSQL).
// Banco de teste separado obrigatório: TEST_DATABASE_URL
// ============================================================================

// Fuso canonico do FootStock — horario de Brasilia (GMT-3).
// Fixado aqui para que a suite seja deterministica em qualquer maquina/CI,
// espelhando o TZ dos containers de producao.
process.env.TZ = 'America/Sao_Paulo'

import type { Config } from 'jest'

const config: Config = {
  displayName: 'integration',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    // Excluir testes antigos baseados em mock — cobertos pelo jest.config.ts
    '<rootDir>/tests/integration/orders/orders-engine.test.ts',
    '<rootDir>/tests/integration/portfolio/position-repository.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/integration/globalTeardown.ts',
  testTimeout: 30000,
  moduleNameMapper: {
    // O app vive em footstock-next/src desde a reorganizacao do repo; o alias `@/`
    // do tsconfig de la aponta para ./src. Este mapper estava preso na raiz antiga,
    // entao TODO import '@/lib/...' dos testes de integracao morria em
    // "Could not locate module" -- inclusive o jest.mock('@/lib/auth') do setup.ts,
    // que derrubava a suite inteira antes do primeiro teste.
    '^@/(.*)$': '<rootDir>/footstock-next/src/$1',
    // O client do Prisma tem que ser O MESMO que o app usa. O da raiz e gerado do
    // `prisma/schema.prisma` do MOTOR, que e um subconjunto (39 models contra 60)
    // e esta atras do schema do app -- `globalForumPost.status`, por exemplo, nao
    // existe la. Com dois clients diferentes contra o mesmo banco, o teste falhava
    // acusando campo inexistente em coluna que existe.
    '^@prisma/client$': '<rootDir>/footstock-next/node_modules/@prisma/client',
    '^@prisma/adapter-pg$': '<rootDir>/footstock-next/node_modules/@prisma/adapter-pg',
    // `server-only` e um guard de bundle do Next: fora do bundler ele so lanca.
    // Modulos server-side legitimos (ex: @/lib/prisma) o importam, entao neutraliza.
    '^server-only$': '<rootDir>/tests/integration/helpers/server-only.stub.ts',
  },
  // Suprimir logs do Prisma durante testes
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: false,
    },
  },
  // Forçar saída após conclusão (evita hang por conexões abertas)
  forceExit: true,
  verbose: true,
  // Serializacao OBRIGATORIA, nao preferencia. Todas as suites batem no MESMO
  // banco (foot_stock_test) e no MESMO Redis, e a limpeza e global por dominio de
  // email (`limparUsuariosDeTeste` apaga tudo em @integration-test.local). Com
  // workers paralelos, o afterEach de uma suite apaga os usuarios que outra acabou
  // de criar: o sintoma sao falhas moveis e sem relacao com o que mudou
  // ("No record was found", ORDER_004 de concorrencia) que somem quando cada suite
  // roda sozinha. Ficava so como `--runInBand` no script npm, ou seja, valia para
  // `npm run test:integration` e NAO para `npx jest --config ...` nem para
  // `test:integration:watch` -- quem rodasse assim via um vermelho falso.
  maxWorkers: 1,
  bail: false,
}

export default config
