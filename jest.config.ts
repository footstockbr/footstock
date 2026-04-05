import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/.stryker-tmp/',
    // Playwright specs — executados separadamente com playwright
    '\\.spec\\.ts$',
    // Tests na pasta footstock-next têm seu próprio jest.config
    '/footstock-next/',
    // motor/dist são arquivos compilados — rodar apenas os .ts
    '/motor/dist/',
    // Testes de acessibilidade que usam Playwright (não Jest)
    'tests/a11y/',
    // Testes de contrato têm config Jest isolada — executar via npm run test:contracts
    'tests/contracts/',
    // Testes de integração requerem banco de dados — não disponível no CI/Vercel
    'tests/integration/',
  ],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.ts',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
    // Módulo 14 — orders engine: cobertura mínima ≥90% (WSJF Risk CRÍTICO)
    './lib/services/OrderService.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './lib/services/ShortService.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './lib/services/TransactionService.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    // Contratos imutáveis: 100% obrigatório
    './lib/contracts/order-contract.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './lib/contracts/transaction-contract.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
  // Tests que precisam de ambiente Node (API routes, motor, serviços sem DOM)
  testEnvironmentOptions: {},
}

export default createJestConfig(config)
