import { verifyJwt, JwtVerifyError, extractTokenFromRequest } from '../auth'
import jwt from 'jsonwebtoken'

const SECRET = 'test-secret'
beforeAll(() => {
  process.env.JWT_SECRET = SECRET
})

test('verify valid token', () => {
  const t = jwt.sign({ sub: 'u1', planType: 'CRAQUE' }, SECRET)
  expect(verifyJwt(t).planType).toBe('CRAQUE')
})

test('throws on missing token', () => {
  expect(() => verifyJwt(null)).toThrow(JwtVerifyError)
})

test('throws on expired', () => {
  const t = jwt.sign({ sub: 'u1', planType: 'CRAQUE', exp: 1 }, SECRET)
  expect(() => verifyJwt(t)).toThrow(/expired/)
})

test('throws on invalid sig', () => {
  const t = jwt.sign({ sub: 'u1', planType: 'CRAQUE' }, 'wrong')
  expect(() => verifyJwt(t)).toThrow(/Invalid sig/)
})

test('throws on missing planType', () => {
  const t = jwt.sign({ sub: 'u1' }, SECRET)
  expect(() => verifyJwt(t)).toThrow(/required claims/)
})

test('extracts from Bearer header', () => {
  expect(
    extractTokenFromRequest({ headers: { authorization: 'Bearer abc' } })
  ).toBe('abc')
})

test('extracts from query param', () => {
  expect(extractTokenFromRequest({ url: '/stream?token=xyz' })).toBe('xyz')
})
