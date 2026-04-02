import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts'],
  coverageThreshold: {
    global: { lines: 50, functions: 40, branches: 40 },
    'src/news/NewsQueue.ts': { lines: 100, functions: 100, branches: 80 },
    'src/news/FallbackPool.ts': { lines: 100, functions: 100, branches: 80 },
    'src/news/RSSFetcher.ts': { lines: 100, functions: 100, branches: 90 },
    'src/news/NewsClassifier.ts': { lines: 100, functions: 100, branches: 90 },
    'src/news/NewsPublisher.ts': { lines: 100, functions: 100, branches: 90 },
    'src/contracts/news-inject-contract.ts': { lines: 100, functions: 100, branches: 90 },
    'src/engine/OrderExecutor.ts': { lines: 90, functions: 90, branches: 80 },
    'src/engine/OrderMatcher.ts': { lines: 90, functions: 90, branches: 80 },
    'src/engine/ScheduledOrderRunner.ts': { lines: 90, functions: 90, branches: 80 },
    'src/engine/MarginCallChecker.ts': { lines: 90, functions: 90, branches: 80 },
  },
  coverageReporters: ['text', 'text-summary', 'lcov'],
}

export default config
