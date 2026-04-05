import '@testing-library/jest-dom'

// Polyfill TextEncoder/TextDecoder para jsdom (necessário por @noble/hashes via Prisma/cuid2)
if (typeof global.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder as typeof global.TextEncoder
  global.TextDecoder = TextDecoder as typeof global.TextDecoder
}
