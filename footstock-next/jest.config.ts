import nextJest from 'next/jest'

const createJestConfig = nextJest({
  dir: './',
})

export default createJestConfig({
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
  ],
  collectCoverageFrom: [
    'src/lib/utils/crypto.ts',
    'src/lib/services/age-verification.ts',
    'src/lib/utils/validators.ts',
    'src/app/api/**/*.ts',
    'src/lib/services/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 60,
      functions: 60,
    },
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/tests/e2e/',
  ],
  setupFilesAfterFramework: [],
// coverageThreshold is valid Jest config but not in next/jest's InitialProjectOptions type
} as never)
