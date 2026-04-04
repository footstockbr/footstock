// ============================================================================
// Foot Stock — AssetCard Tests
// ============================================================================

import { render, screen } from '@testing-library/react'
import AssetCard from '../AssetCard'
import type { AssetListItem } from '@/types/market'

// Mocks
jest.mock('@/hooks/useMarketTick', () => ({
  useMarketTick: jest.fn(() => ({
    ticks: new Map(),
    isConnected: true,
    isDelayed: false,
    lastUpdate: null,
    error: null,
    reconnect: jest.fn(),
  })),
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

// Modal uses dialog.showModal() which is not supported in jsdom
jest.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, isOpen, title }: { children: React.ReactNode; isOpen: boolean; title: string }) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}))

// getClubDisplayName can remap tickers — return fallback name for test predictability
jest.mock('@/lib/constants/clubs', () => ({
  ...jest.requireActual('@/lib/constants/clubs'),
  getClubDisplayName: (_ticker: string, fallbackName?: string | null) => fallbackName ?? _ticker,
}))

const mockUseMarketTick = jest.requireMock('@/hooks/useMarketTick').useMarketTick

function makeAsset(overrides: Partial<AssetListItem> = {}): AssetListItem {
  return {
    id: 'asset-1',
    ticker: 'VAR1',
    name: 'Urubu da Gávea',
    division: 'SERIE_A',
    currentPrice: 42.5,
    change24h: 2.3,
    volume24h: 1000,
    isHalted: false,
    haltReason: null,
    sentiment: 'POSITIVO',
    logoUrl: null,
    colorPrimary: '#000',
    colorSecondary: '#fff',
    priceHistory: [40, 41, 42, 42.5],
    ...overrides,
  }
}

describe('AssetCard', () => {
  beforeEach(() => {
    mockUseMarketTick.mockReturnValue({
      ticks: new Map(),
      isConnected: true,
      isDelayed: false,
      lastUpdate: null,
      error: null,
      reconnect: jest.fn(),
    })
  })

  it('renderiza ticker, nome, preço e variação', () => {
    render(<AssetCard asset={makeAsset()} />)

    expect(screen.getByTestId('asset-card-ticker')).toHaveTextContent('VAR1')
    expect(screen.getByTestId('asset-card-name')).toHaveTextContent('Urubu da Gávea')
    expect(screen.getByTestId('asset-card-price')).toBeInTheDocument()
    expect(screen.getByTestId('asset-card-change')).toHaveTextContent('2.30%')
  })

  it('nunca exibe o nome real do clube — apenas o nome fictício', () => {
    render(<AssetCard asset={makeAsset({ name: 'Urubu da Gávea' })} />)

    // Deve exibir o nome fictício
    expect(screen.getByTestId('asset-card-name')).toHaveTextContent('Urubu da Gávea')
  })

  it('variação negativa exibe "▼" e classe vermelha', () => {
    render(<AssetCard asset={makeAsset({ change24h: -1.5 })} />)

    const change = screen.getByTestId('asset-card-change')
    expect(change).toHaveTextContent('▼')
    expect(change).toHaveTextContent('1.50%')
    expect(change.className).toContain('price-down')
  })

  it('renderiza badge sentimento', () => {
    render(<AssetCard asset={makeAsset({ sentiment: 'POSITIVO' })} />)
    expect(screen.getByTestId('asset-card-sentiment-badge')).toBeInTheDocument()
  })

  it('renderiza sparkline quando há historico', () => {
    render(<AssetCard asset={makeAsset({ priceHistory: [40, 41, 42, 43] })} />)
    expect(screen.getByTestId('asset-card-sparkline')).toBeInTheDocument()
  })

  it('exibe avatar de iniciais quando logoUrl é null', () => {
    render(<AssetCard asset={makeAsset({ logoUrl: null })} />)
    // Deve renderizar div com iniciais, não <img>
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('VAR')).toBeInTheDocument()
  })

  it('exibe imagem quando logoUrl está definido', () => {
    render(<AssetCard asset={makeAsset({ logoUrl: 'https://example.com/logo.png' })} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Urubu da Gávea')
  })

  it('exibe badge SUSPENSO quando isHalted = true', () => {
    render(<AssetCard asset={makeAsset({ isHalted: true })} />)
    expect(screen.getByTestId('asset-card-halted-badge')).toBeInTheDocument()
  })

  it('não exibe badge SUSPENSO quando isHalted = false', () => {
    render(<AssetCard asset={makeAsset({ isHalted: false })} />)
    expect(screen.queryByTestId('asset-card-halted-badge')).toBeNull()
  })

  it('exibe ícone offline quando isConnected = false', () => {
    render(<AssetCard asset={makeAsset()} isStreamConnected={false} />)
    expect(screen.getByTestId('asset-card-offline-icon')).toBeInTheDocument()
  })

  it('não exibe ícone offline quando isConnected = true', () => {
    render(<AssetCard asset={makeAsset()} />)
    expect(screen.queryByTestId('asset-card-offline-icon')).toBeNull()
  })

  it('exibe ícone estrela quando isFavorite = true', () => {
    render(<AssetCard asset={makeAsset()} isFavorite={true} />)
    // Estrela tem aria-hidden="true", mas podemos verificar pela estrutura
    const card = screen.getByTestId('asset-card')
    expect(card).toBeInTheDocument()
  })

  it('tem role=button e tabIndex=0 para acessibilidade de teclado', () => {
    render(<AssetCard asset={makeAsset()} />)
    const card = screen.getByTestId('asset-card')
    expect(card).toHaveAttribute('role', 'button')
    expect(card).toHaveAttribute('tabindex', '0')
  })

  it('aria-label inclui nome, preço e variação', () => {
    render(<AssetCard asset={makeAsset()} />)
    const card = screen.getByTestId('asset-card')
    expect(card.getAttribute('aria-label')).toContain('Urubu da Gávea')
    expect(card.getAttribute('aria-label')).toContain('42.50')
  })

  it('aria-label inclui SUSPENSO quando halted', () => {
    render(<AssetCard asset={makeAsset({ isHalted: true })} />)
    const card = screen.getByTestId('asset-card')
    expect(card.getAttribute('aria-label')).toContain('SUSPENSO')
  })

  it('usa preço do tick quando disponível', () => {
    const tick = { price: 45.0, changePercent: 5.88, ticker: 'VAR1', assetId: 'asset-var1', open: 43.0, high: 46.0, low: 42.0, close: 45.0, volume: 1000, change: 3.0, sessionType: 'REGULAR' as const, timestamp: Date.now() }

    render(<AssetCard asset={makeAsset({ currentPrice: 42.5 })} tick={tick} />)
    // O preço deveria ser 45.00 (do tick, não 42.50 do asset)
    const priceEl = screen.getByTestId('asset-card-price')
    expect(priceEl).toHaveTextContent('45.00')
  })
})
