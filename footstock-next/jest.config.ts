import nextJest from 'next/jest'

const createJestConfig = nextJest({
  dir: './',
})

export default createJestConfig({
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/lib/utils/crypto.ts',
    'src/lib/services/age-verification.ts',
    'src/lib/utils/validators.ts',
  ],
})
