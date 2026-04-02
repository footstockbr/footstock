import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  displayName: 'contracts',
  testMatch: ['<rootDir>/tests/contracts/**/*.contract.test.ts'],
  testEnvironment: 'node',
  // Não incluir jest.setup.ts pois ele importa matchers jsdom (@testing-library/jest-dom)
  // Testes de contrato rodam em ambiente Node — sem DOM
  setupFilesAfterEnv: [],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.d.ts',
    '!lib/**/index.ts',
  ],
  coverageDirectory: 'coverage/contracts',
  // Isolamento: esta config NÃO interfere com suites unit/e2e
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
}

export default createJestConfig(config)
