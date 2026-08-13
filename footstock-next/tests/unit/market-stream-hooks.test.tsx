/**
 * @jest-environment jsdom
 */
import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAllMarketTicks } from '@/hooks/useAllMarketTicks'
import { useMarketTick } from '@/hooks/useMarketTick'
import { fetchMotorToken } from '@/lib/motor-token-client'

jest.mock('@/lib/motor-token-client', () => ({
  fetchMotorToken: jest.fn(),
  scheduleMotorTokenRefresh: jest.fn(),
}))

class MockEventSource {
  static instances: MockEventSource[] = []
  url = ''
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 0
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emitMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }

  emitError() {
    if (this.onerror) {
      this.onerror()
    }
  }

  emitOpen() {
    if (this.onopen) {
      this.onopen()
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.EventSource = MockEventSource as any

describe('market stream hooks', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    ;(fetchMotorToken as jest.Mock).mockResolvedValue({ token: 'tok', expiresAt: Date.now() + 60_000 })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  function tickPayload(ticks: unknown[]) {
    return { type: 'TICK', timestamp: Date.now(), ticks }
  }

  describe('useAllMarketTicks', () => {
    test('inicializa em connecting e transita para open', async () => {
      const { result } = renderHook(() => useAllMarketTicks())
      expect(result.current.connectionState).toBe('connecting')

      await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
      act(() => MockEventSource.instances[0].emitOpen())
      expect(result.current.connectionState).toBe('open')
    })

    test('atualiza mapa com tick LIVE e metadados', async () => {
      const { result } = renderHook(() => useAllMarketTicks())
      await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
      const es = MockEventSource.instances[0]
      act(() => es.emitOpen())

      act(() =>
        es.emitMessage(
          tickPayload([
            {
              ticker: 'PETR4',
              state: 'LIVE',
              delayed: false,
              delayMs: 0,
              price: 29.0,
              changePercent: 1.5,
              timestamp: Date.now(),
              snapshotAgeMs: 0,
              isHalted: false,
            },
          ])
        )
      )

      await waitFor(() => expect(result.current.ticks['PETR4']).toBeDefined())
      expect(result.current.ticks['PETR4']).toMatchObject({
        lastPrice: 29.0,
        change24h: 1.5,
        state: 'LIVE',
        delayed: false,
        delayMs: 0,
        isStale: false,
      })
    })

    test('BUFFERING preserva último snapshot e marca stale', async () => {
      const { result } = renderHook(() => useAllMarketTicks())
      await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
      const es = MockEventSource.instances[0]
      act(() => es.emitOpen())

      act(() =>
        es.emitMessage(
          tickPayload([
            {
              ticker: 'PETR4',
              state: 'LIVE',
              delayed: false,
              delayMs: 0,
              price: 29.0,
              changePercent: 1.5,
              timestamp: Date.now(),
              snapshotAgeMs: 0,
            },
          ])
        )
      )
      await waitFor(() => expect(result.current.ticks['PETR4']).toBeDefined())

      act(() =>
        es.emitMessage(
          tickPayload([
            {
              ticker: 'PETR4',
              state: 'BUFFERING',
              delayed: true,
              delayMs: 3_600_000,
              price: null,
              changePercent: null,
              timestamp: null,
              snapshotAgeMs: null,
            },
          ])
        )
      )

      await waitFor(() => expect(result.current.isBuffering).toBe(true))
      expect(result.current.ticks['PETR4']).toMatchObject({
        lastPrice: 29.0,
        state: 'BUFFERING',
        isStale: true,
      })
    })

    test('múltiplos erros marcam offline', async () => {
      const { result } = renderHook(() => useAllMarketTicks())
      await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
      const es = MockEventSource.instances[0]

      act(() => es.emitError())
      act(() => es.emitError())
      act(() => es.emitError())

      expect(result.current.isOffline).toBe(true)
      expect(result.current.connectionState).toBe('error')
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe('useMarketTick', () => {
    test('retorna tick específico e metadados', async () => {
      const { result } = renderHook(() => useMarketTick('PETR4'))
      await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
      const es = MockEventSource.instances[0]
      act(() => es.emitOpen())

      act(() =>
        es.emitMessage(
          tickPayload([
            { ticker: 'FLM3', state: 'LIVE', delayed: false, delayMs: 0, price: 10, changePercent: 0, timestamp: Date.now(), snapshotAgeMs: 0 },
            { ticker: 'PETR4', state: 'DELAYED', delayed: true, delayMs: 1_800_000, price: 28.5, changePercent: -0.5, timestamp: Date.now(), snapshotAgeMs: 120_000 },
          ])
        )
      )

      await waitFor(() => expect(result.current.tick).not.toBeNull())
      expect(result.current.tick).toMatchObject({
        ticker: 'PETR4',
        lastPrice: 28.5,
        change24h: -0.5,
        state: 'DELAYED',
        delayed: true,
        delayMs: 1_800_000,
        snapshotAgeMs: 120_000,
      })
    })

    test('BUFFERING mantém último tick conhecido como stale', async () => {
      const { result } = renderHook(() => useMarketTick('PETR4'))
      await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
      const es = MockEventSource.instances[0]
      act(() => es.emitOpen())

      act(() =>
        es.emitMessage(
          tickPayload([
            { ticker: 'PETR4', state: 'LIVE', delayed: false, delayMs: 0, price: 29, changePercent: 1, timestamp: Date.now(), snapshotAgeMs: 0 },
          ])
        )
      )

      act(() =>
        es.emitMessage(
          tickPayload([
            { ticker: 'PETR4', state: 'BUFFERING', delayed: true, delayMs: 3_600_000, price: null, changePercent: null, timestamp: null, snapshotAgeMs: null },
          ])
        )
      )

      await waitFor(() => expect(result.current.isBuffering).toBe(true))
      expect(result.current.tick).toMatchObject({
        lastPrice: 29,
        state: 'BUFFERING',
        isStale: true,
      })
    })
  })
})
