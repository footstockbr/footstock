// Fuso canonico do FootStock — horario de Brasilia (GMT-3).
// Fixado aqui para que a suite seja deterministica em qualquer maquina/CI,
// espelhando o TZ dos containers de producao.
process.env.TZ = 'America/Sao_Paulo'

import nextJest from 'next/jest.js'

// O app Next real vive em footstock-next/ (src/app). A raiz do monorepo nao
// tem pages/ nem app/; next/jest com dir './' abortava o parse do config com
// "Couldn't find any `pages` or `app` directory" e impedia a descoberta da
// suite do guard em scripts/__tests__/check-news-schema-drift.test.js.
const createJestConfig = nextJest({ dir: './footstock-next' })

const config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Suites da raiz ainda importam @/lib/*; o codigo ativo esta em footstock-next/src.
    '^@/(.*)$': '<rootDir>/footstock-next/src/$1',
  },
  // Sandboxes do Stryker duplicam package.json e mocks; se entrarem no haste-map
  // geram colisoes e ruido sem valor de teste.
  modulePathIgnorePatterns: ['<rootDir>/.stryker-tmp/'],
  watchPathIgnorePatterns: ['<rootDir>/.stryker-tmp/'],
  // Suites ativas na raiz do monorepo apos a migracao para footstock-next/.
  // __tests__/ na raiz e orfao (API ValuationService/minorProfilingGuard do lib/
  // raiz removido); reabilitar so com rewrite dos testes para o codigo atual.
  testMatch: [
    '<rootDir>/scripts/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/scripts/**/*.(test|spec).[jt]s?(x)',
    '<rootDir>/tests/unit/**/*.(test|spec).[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/.stryker-tmp/',
    // Playwright specs — executados separadamente com playwright
    '\\.spec\\.ts$',
    // Tests na pasta footstock-next têm seu próprio jest.config
    '/footstock-next/',
    // motor tem suite e config proprias
    '/motor/',
    // motor/dist são arquivos compilados — rodar apenas os .ts
    '/motor/dist/',
    // Testes de acessibilidade que usam Playwright (não Jest)
    'tests/a11y/',
    // Testes de contrato têm config Jest isolada — executar via npm run test:contracts
    'tests/contracts/',
    // Testes de integração requerem banco de dados — não disponível no CI/Vercel
    'tests/integration/',
    // Orfaos da raiz pos-migracao (ver comentario em testMatch)
    '<rootDir>/__tests__/',
    // backups e pacotes satelite
    '/_components_legacy_backup/',
    '/_lib_legacy_backup/',
    '/_app_legacy_backup/',
    '/_hooks_legacy_backup/',
    '/_pages_legacy_backup/',
    '/_types_legacy_backup/',
    '/_utils_legacy_backup/',
    '/mobile-expo/',
    '/footstock-web/',
  ],
  // Cobertura local do monorepo raiz: scripts de guard + unitarios em tests/unit.
  // Thresholds legados de lib/ (removido da raiz) foram retirados para nao
  // exigir paths que nao existem mais.
  collectCoverageFrom: [
    'scripts/**/*.{js,ts}',
    'tests/unit/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.ts',
  ],

  // Tests que precisam de ambiente Node (API routes, motor, serviços sem DOM)
  testEnvironmentOptions: {},
}

export default createJestConfig(config)
