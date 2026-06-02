// ============================================================================
// FootStock — Jest Integration Config
// Testes de integração com banco de dados real (PostgreSQL).
// Banco de teste separado obrigatório: TEST_DATABASE_URL
// ============================================================================

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
    '^@/(.*)$': '<rootDir>/$1',
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
  // maxWorkers: 1, // Executar sequencialmente — testes compartilham banco de dados de teste
  bail: false,
}

export default config
