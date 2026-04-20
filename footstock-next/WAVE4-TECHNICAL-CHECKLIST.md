# WAVE 4 — TECHNICAL CHECKLIST & IMPLEMENTATION GUIDE

**Date:** 2026-04-20  
**Target:** All 7 tasks ready-to-code  
**Status:** Architecture approved, awaiting implementation

---

## PRE-IMPLEMENTATION CHECKLIST (Day 0)

- [ ] Read `N01-N07-STRATEGIC-PLAN.md` (full context)
- [ ] Read `WAVE4-EXECUTIVE-SUMMARY.md` (quick reference)
- [ ] Review `FINAL-READINESS.md` (baseline constraints)
- [ ] Verify test infrastructure (`npm run test`, `npx playwright test`)
- [ ] Confirm Codex availability (N-05, N-06 sessions)
- [ ] Create feature branches: `feat/N-01`, `feat/N-02`, etc.
- [ ] Create tracking tasks in issue tracker or task system

---

## TASK-BY-TASK IMPLEMENTATION GUIDE

### N-01: Banner Height Fix (60px Desktop)

**Files to Modify:**
```
/src/components/banners/BannerSlot.tsx
/src/components/banners/*.tsx  (all banner components)
/src/components/shared/sponsor-banner.tsx
```

**Current State:**
- Review BannerSlot for height CSS
- Check Tailwind classes for responsive behavior

**Changes Required:**
```diff
/* Before */
- className="h-auto"  OR  h-24  OR  h-screen

/* After */
+ className="h-[60px]"  /* 60px desktop */
+ OR md:h-[60px] if responsive
```

**Validation:**
- [ ] Desktop screenshot at 1920px width shows 60px banner
- [ ] Mobile still responsive
- [ ] No text overflow in banner
- [ ] Sponsor content not cut off

**Test:**
```bash
npx playwright test --grep "N-01"
```

**PR Template:**
```
Title: fix(N-01): correct banner height to 60px on desktop

- Fixed BannerSlot height CSS from variable to 60px
- Verified desktop + mobile responsive behavior
- Visual regression test: ✓ passed
```

---

### N-02: Remove TODOS Button from Filters

**File to Modify:**
```
/src/app/(app)/mercado/market-page-client.tsx
```

**Current State (lines 200-250):**
```tsx
// Division filter (currently: "all" | "SERIE_A" | "SERIE_B")
(["all", "SERIE_A", "SERIE_B"] as const).map((d) => (
  <button key={d} ...>
    {d === "all" ? "Todos" : d === "SERIE_A" ? "Serie A" : "Serie B"}
  </button>
))

// Sentiment filter (currently: "all" | "positive" | "neutral" | "negative")
(["all", "positive", "neutral", "negative"] as const).map((s) => (
  <button key={s} ...>
    {s === "all" ? "Todos" : ...}
  </button>
))
```

**Changes Required:**
```diff
# Option A: Remove "all" button entirely
- (["all", "SERIE_A", "SERIE_B"] as const)
+ (["SERIE_A", "SERIE_B"] as const)

# Then update filter logic to:
# - Default: both filters unselected = show all
# - When user clicks: select that filter
# - When user clicks again: deselect and revert to all

# Option B: Keep "all" but rename from "Todos"
- {d === "all" ? "Todos" : ...}
+ {d === "all" ? "Ver Todos" : ...}  OR hide if redundant
```

**Logic Update:**
```tsx
const handleDivisionClick = (d: Division) => {
  if (division === d) {
    // Deselect → revert to all
    setDivision("all")
  } else {
    // Select new division
    setDivision(d)
  }
}
```

**Analytics Update:**
```diff
- filter_type: "division" | "sentiment" | undefined
+ filter_type: "division" | "sentiment" | "none"

track("market_list_viewed", {
  filter_applied: division !== "all" || sentiment !== "all",
  filter_type: ...
})
```

**Test Cases:**
```bash
npx playwright test --grep "N-02-filter"

# Test 1: No filter selected = all assets shown
# Test 2: Click SERIE_A = only SERIE_A shown
# Test 3: Click SERIE_A again = revert to all
# Test 4: Click SERIE_A + Positivo = both filters applied
# Test 5: Click SERIE_A again (deselect) = only sentiment filter remains
# Test 6: "Todos" button not visible in DOM
# Test 7: clearFilters button works
# Test 8: Analytics event fires with correct filter_type
# Test 9: URL params update (if using search params)
# Test 10: Mobile responsive (filters still clickable)
# Test 11: Hover states on filter buttons
# Test 12: Keyboard navigation (Tab, Enter)
```

**PR Template:**
```
Title: feat(N-02): remove TODOS button from market filters

- Removed explicit "Todos" button from division and sentiment filters
- Deselecting a filter now reverts to "all"
- Updated analytics tracking (filter_type: "none" when deselected)
- Added 12 E2E test cases for all filter combos
- Visual regression test: ✓ passed
```

---

### N-03: Favorite Team Star (⭐)

**Files to Create/Modify:**
```
/src/app/api/v1/favorites/route.ts  (NEW)
/src/components/market/asset-card.tsx
/src/prisma/schema.prisma  (add favoriteAsset field if missing)
```

**API Endpoint (NEW):**
```typescript
// POST /api/v1/favorites
// { assetId: string }
// Response: { success: boolean, isFavorite: boolean }

import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'AUTH_010' }, { status: 401 })

  const { assetId } = await req.json()
  
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { profile: true }
  })

  const isFavorite = user?.profile?.favoriteAsset === assetId
  
  await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      profile: {
        ...user?.profile,
        favoriteAsset: isFavorite ? null : assetId
      }
    }
  })

  return NextResponse.json({
    success: true,
    isFavorite: !isFavorite
  })
}
```

**AssetCard Update:**
```tsx
interface AssetCardProps {
  asset: AssetData
  isFavorite?: boolean
  onToggleFavorite?: (ticker: string) => void
}

export function AssetCard({ asset, isFavorite = false, onToggleFavorite }: AssetCardProps) {
  return (
    <div className="relative ...">
      {isFavorite && (
        <button
          data-testid={`asset-favorite-star-${asset.ticker}`}
          onClick={() => onToggleFavorite?.(asset.ticker)}
          className="absolute top-2 right-2 z-10 text-yellow-400"
          aria-label="Remove from favorites"
        >
          ⭐
        </button>
      )}
      {/* rest of card */}
    </div>
  )
}
```

**Market Page Client Update:**
```tsx
export function MarketPageClient() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Fetch current user favorites on mount
    fetch('/api/v1/me').then(r => r.json()).then(data => {
      if (data?.profile?.favoriteAsset) {
        setFavorites(new Set([data.profile.favoriteAsset]))
      }
    })
  }, [])

  const handleToggleFavorite = async (ticker: string) => {
    const res = await fetch('/api/v1/favorites', {
      method: 'POST',
      body: JSON.stringify({ assetId: ticker })
    })
    const data = await res.json()
    if (data.success) {
      setFavorites(prev => {
        const next = new Set(prev)
        if (data.isFavorite) {
          next.add(ticker)
        } else {
          next.delete(ticker)
        }
        return next
      })
    }
  }

  return (
    <div>
      {/* filters */}
      <div className="grid ...">
        {filtered.map(asset => (
          <AssetCard
            key={asset.ticker}
            asset={asset}
            isFavorite={favorites.has(asset.ticker)}
            onToggleFavorite={handleToggleFavorite}
          />
        ))}
      </div>
    </div>
  )
}
```

**Test Cases:**
```bash
npx playwright test --grep "N-03"

# Test 1: Click star → API call made
# Test 2: After toggle, star appears/disappears
# Test 3: Refresh page → star still visible (persisted)
# Test 4: Only 1 asset can be favorite at a time (if design intended)
# Test 5: Testid attribute exists
# Test 6: Analytics event fires on toggle
```

**PR Template:**
```
Title: feat(N-03): add favorite team star indicator

- Added POST /api/v1/favorites endpoint to toggle favorite status
- Updated AssetCard to show ⭐ for favorite asset
- Added data-testid="asset-favorite-star-{ticker}"
- Favorite status persists across page reloads
- Unit tests: 4 cases (add, remove, persist, toggle)
- Visual regression test: ✓ passed
```

---

### N-04: 7-Day Chart in Buy Modal

**Files to Modify:**
```
/src/components/orders/OrderForm.tsx
/src/components/portfolio/PortfolioChart.tsx  (reuse)
```

**Implementation Approach:**
```tsx
// In OrderForm.tsx

const [historyData, setHistoryData] = useState<{ date: string; totalValue: number }[]>([])
const [loadingChart, setLoadingChart] = useState(false)

// Fetch on modal open
useEffect(() => {
  const fetchHistory = async () => {
    setLoadingChart(true)
    try {
      const res = await fetch('/api/v1/portfolio/history?period=7D')
      const data = await res.json()
      setHistoryData(data.data ?? [])
    } catch (err) {
      console.error('Failed to load chart', err)
    } finally {
      setLoadingChart(false)
    }
  }
  fetchHistory()
}, [])

return (
  <div className="...">
    {/* Chart Section (above or below form) */}
    {loadingChart ? (
      <div className="h-[200px] bg-[#181A20] rounded flex items-center justify-center">
        <span className="text-[#929AA5]">Loading chart...</span>
      </div>
    ) : historyData.length > 0 ? (
      <div data-testid="order-modal-7d-chart" className="mb-6">
        <PortfolioChart
          data={historyData}
          title="Portfolio History (7 days)"
          height={200}
        />
      </div>
    ) : null}

    {/* Order form (existing) */}
    <div className="...">
      {/* form fields */}
    </div>
  </div>
)
```

**Error Boundary:**
```tsx
<div data-testid="order-modal-7d-chart">
  <ErrorBoundary fallback={<ChartErrorState />}>
    <PortfolioChart data={historyData} />
  </ErrorBoundary>
</div>
```

**Test Cases:**
```bash
npx playwright test --grep "N-04"

# Test 1: Open order form → chart loads
# Test 2: Chart displays 7D data points
# Test 3: Empty portfolio → chart shows empty state
# Test 4: Chart renders without breaking form layout
# Test 5: API error → fallback UI shown
# Test 6: Skeleton loader appears during fetch
# Test 7: Testid attribute queryable
# Test 8: LCP < 3s with chart embedded
```

**PR Template:**
```
Title: feat(N-04): add 7-day portfolio chart to buy order modal

- Integrated PortfolioChart component in OrderForm modal
- Fetches /api/v1/portfolio/history?period=7D on modal open
- Added loading and error states
- Added data-testid="order-modal-7d-chart"
- Performance verified: LCP < 3s (Lighthouse)
- E2E tests: 8 cases
```

---

### N-05: Tier Validation in Upgrade Modals (CODEX SESSION)

**Files to Modify:**
```
/src/components/payments/PlanCTAButton.tsx
/src/components/payments/CheckoutButton.tsx
/src/lib/constants/tiers.ts  (NEW - add TIER_ORDER)
/src/app/api/v1/checkout/route.ts  (validation)
```

**Create Tier Constant (NEW FILE):**
```typescript
// /src/lib/constants/tiers.ts

export const TIER_ORDER = {
  JOGADOR: 0,
  CRAQUE: 1,
  LENDA: 2,
} as const

export const TIER_LABELS = {
  JOGADOR: 'Jogador',
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
} as const

export const TIER_PRICES = {
  JOGADOR: 0,
  CRAQUE: 19.9,
  LENDA: 39.9,
} as const

// Filter available plans for upgrade (only show higher tiers)
export function getAvailablePlansForUpgrade(currentTier: keyof typeof TIER_ORDER): (keyof typeof TIER_ORDER)[] {
  const currentLevel = TIER_ORDER[currentTier]
  return (['JOGADOR', 'CRAQUE', 'LENDA'] as const).filter(
    plan => TIER_ORDER[plan] > currentLevel
  )
}
```

**Update PlanCTAButton:**
```tsx
// /src/components/payments/PlanCTAButton.tsx

import { getAvailablePlansForUpgrade } from '@/lib/constants/tiers'

interface PlanCTAButtonProps {
  planType: 'CRAQUE' | 'LENDA'
  currentTier: 'JOGADOR' | 'CRAQUE' | 'LENDA'  // NEW prop
  label: string
  ...
}

export function PlanCTAButton({ planType, currentTier, label, ... }: PlanCTAButtonProps) {
  const availablePlans = getAvailablePlansForUpgrade(currentTier)
  
  // Don't show button if this plan is not available for upgrade
  if (!availablePlans.includes(planType)) {
    return null
  }

  return (
    <>
      <Button onClick={handleUpgradeClick} ...>
        {label}
      </Button>
      {isOpen && <CheckoutButton planType={planType} currentTier={currentTier} />}
    </>
  )
}
```

**Update CheckoutButton:**
```tsx
// /src/components/payments/CheckoutButton.tsx

interface CheckoutButtonProps {
  planType: 'CRAQUE' | 'LENDA'
  currentTier: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  ...
}

export function CheckoutButton({ planType, currentTier, ... }: CheckoutButtonProps) {
  const availablePlans = getAvailablePlansForUpgrade(currentTier)
  
  // Validate on button click (prevent API workaround)
  const handleCheckout = async () => {
    if (!availablePlans.includes(planType)) {
      toast.error('Cannot downgrade to this plan')
      return
    }
    // ... existing checkout logic
  }

  return (
    <div>
      {/* Show only available plans */}
      {availablePlans.map(plan => (
        <button key={plan} onClick={() => handleCheckout(plan)}>
          Upgrade to {TIER_LABELS[plan]}
        </button>
      ))}
    </div>
  )
}
```

**Validate in API:**
```typescript
// /src/app/api/v1/checkout/route.ts

export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  const { planType } = await req.json()

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } })
  const currentTier = user?.planType

  // Prevent downgrade
  if (TIER_ORDER[planType] <= TIER_ORDER[currentTier]) {
    return NextResponse.json(
      { error: 'Cannot downgrade plan', code: 'UPGRADE_001' },
      { status: 400 }
    )
  }

  // ... existing checkout logic
}
```

**Test Matrix (5 cases):**
```typescript
describe('N-05: Tier Validation', () => {
  
  test('JOGADOR can see CRAQUE + LENDA buttons', async ({ page }) => {
    // Login as JOGADOR
    await page.goto('/planos')
    await expect(page.locator('button:has-text("Assinar Craque")')).toBeVisible()
    await expect(page.locator('button:has-text("Assinar Lenda")')).toBeVisible()
  })

  test('CRAQUE can see LENDA button only', async ({ page }) => {
    // Login as CRAQUE
    await page.goto('/planos')
    await expect(page.locator('button:has-text("Assinar Lenda")')).toBeVisible()
    await expect(page.locator('button:has-text("Assinar Craque")')).not.toBeVisible()
  })

  test('LENDA cannot see upgrade buttons', async ({ page }) => {
    // Login as LENDA
    await page.goto('/planos')
    await expect(page.locator('button:has-text("Assinar")')).not.toBeVisible()
  })

  test('API prevents downgrade attempt', async ({ request }) => {
    // Login as CRAQUE, try to POST /checkout { planType: JOGADOR }
    const res = await request.post('/api/v1/checkout', {
      data: { planType: 'JOGADOR' }
    })
    expect(res.status()).toBe(400)
    expect(res).toContainText('Cannot downgrade')
  })

  test('Tier switching works across page reloads', async ({ page, context }) => {
    // Promote user from JOGADOR to CRAQUE via admin API
    // Reload page
    // Verify buttons reflect new tier
    await page.reload()
    await expect(page.locator('button:has-text("Assinar Lenda")')).toBeVisible()
  })
})
```

**Codex Review Checklist:**
- [ ] TIER_ORDER constant matches Prisma schema
- [ ] getAvailablePlansForUpgrade logic correct for all 3 tiers
- [ ] PlanCTAButton filters correctly before rendering
- [ ] CheckoutButton validates on both client + server
- [ ] All 5 test cases pass
- [ ] No API workarounds possible (server validates)

**PR Template:**
```
Title: fix(N-05): implement tier validation in upgrade modals

Co-Authored-By: Claude Codex <noreply@anthropic.com>

- Added TIER_ORDER constant to /src/lib/constants/tiers.ts
- Implemented getAvailablePlansForUpgrade() helper
- Updated PlanCTAButton to filter plans by tier
- Added server-side validation in /checkout endpoint
- Prevents downgrade attempts (client + server)
- Test matrix: 5 cases (JOGADOR/CRAQUE/LENDA × upgrade paths)
- Codex adversarial review: ✓ approved
```

---

### N-06: Modal Audit & Data-testid Addition (CODEX SESSION)

**Phase 1: Global Inventory (Day 1, ~30 min)**
```bash
# Grep for all modals
grep -r "Modal\|modal\|overlay\|dialog" /src/components --include="*.tsx" > /tmp/modals.txt
grep -r "open\|isOpen\|show\|visible" /src/components/payments --include="*.tsx" >> /tmp/modals.txt

# Manually review output:
# - /src/components/payments/PlanCTAButton.tsx  ✓ has testid
# - /src/components/profile/delete-account-modal.tsx  ? check
# - /src/components/orders/OrderForm.tsx  ? check modal context
# - /src/components/orders/ShortForm.tsx  ✓ for N-07
# - /src/components/leagues/*.tsx  ? check invite modal
# - Custom modals (dialog, overlay, confirm) across 20+ dirs
```

**Phase 2: Testid Naming Convention**
```typescript
// Consistent pattern across all modals:

// Wrapper
data-testid="modal-{feature}-{variant?}"
// Examples:
data-testid="modal-short"
data-testid="modal-delete-account"
data-testid="modal-plan-checkout-craque"
data-testid="modal-league-invite"

// Close button
data-testid="modal-{feature}-close"

// Primary CTA
data-testid="modal-{feature}-submit"
data-testid="modal-{feature}-confirm"

// Secondary CTA
data-testid="modal-{feature}-cancel"

// Special cases:
data-testid="guard-{feature}-locked"  // For overlay guards
data-testid="guard-{feature}-unlock-cta"
```

**Phase 3: Add Testids Systematically**

For each modal found:

1. **PlanCTAButton** (lines 57-110)
   ```diff
   + data-testid={`plan-checkout-modal-${planType.toLowerCase()}`}  ✓ already has
   ```

2. **DeleteAccountModal**
   ```diff
   - <div>...</div>
   + <div data-testid="modal-delete-account">
     - <button>Cancelar</button>
     + <button data-testid="modal-delete-account-cancel">Cancelar</button>
     - <button>Confirmar</button>
     + <button data-testid="modal-delete-account-confirm">Confirmar</button>
   </div>
   ```

3. **OrderForm Modal** (lines 69-110)
   ```diff
   - <div style={{...}} onClick={() => setIsOpen(false)}>
   + <div data-testid="modal-order-form" style={{...}} onClick={() => setIsOpen(false)}>
     - <div style={{...}} onClick={(e) => e.stopPropagation()}>
     + <div data-testid="modal-order-form-content" style={{...}}>
       - <button onClick={() => setIsOpen(false)}>
       + <button data-testid="modal-order-form-cancel" onClick={() => setIsOpen(false)}>
   ```

4. **ShortForm Modal** (see N-07)
   ```diff
   - <div className="...modal-overlay...">
   + <div data-testid="modal-short" className="...modal-overlay...">
   ```

5. **Leverage Unlock Guard** (LeverageToggle.tsx)
   ```diff
   - <div className="...absolute...overlay...">
   + <div data-testid="guard-leverage-locked" className="...absolute...overlay...">
     - <button ...>Upgrade</button>
     + <button data-testid="guard-leverage-unlock-cta" ...>Upgrade</button>
   ```

6. **League Invite Modal** (leagues/*)
   ```diff
   - <Dialog open={isOpen}>
   + <Dialog open={isOpen} data-testid="modal-league-invite">
   ```

**Phase 4: Snapshot Tests**
```typescript
// tests/e2e/N-06-modals.spec.ts

import { test, expect } from '@playwright/test'

const MODAL_SELECTORS = [
  'modal-short',
  'modal-delete-account',
  'modal-plan-checkout-craque',
  'modal-plan-checkout-lenda',
  'modal-order-form',
  'modal-league-invite',
  'guard-leverage-locked',
  'guard-ai-advisor-locked',
  // ... add all found modals
]

test('All modals have testid attributes', async ({ page }) => {
  const modalsFound: string[] = []
  
  for (const selector of MODAL_SELECTORS) {
    const element = await page.$(`[data-testid="${selector}"]`)
    if (element) modalsFound.push(selector)
  }

  expect(modalsFound.length).toBeGreaterThan(5)
  expect(modalsFound).toMatchSnapshot('modal-inventory.json')
})

test('No duplicate testids', async ({ page }) => {
  const testids = await page.locator('[data-testid^="modal-"], [data-testid^="guard-"]')
    .allTextContents()
  
  const testidValues = testids.map(el => el.getAttribute('data-testid'))
  const unique = new Set(testidValues)
  
  expect(unique.size).toBe(testidValues.length)  // No duplicates
})
```

**Codex Review Checklist:**
- [ ] Global grep found ≥10 modals
- [ ] All testids follow naming convention
- [ ] No duplicate testids exist
- [ ] All close/submit/cancel buttons have testids
- [ ] Snapshot tests capture baseline
- [ ] ≥95% modal coverage achieved

**PR Template:**
```
Title: feat(N-06): audit and add data-testid to all modals and guards

Co-Authored-By: Claude Codex <noreply@anthropic.com>

- Global inventory: 15 modals + 4 guard overlays found
- Added consistent testid naming (modal-{feature}-{action})
- Updated DeleteAccountModal, OrderForm, ShortForm, LeagueInvite, etc.
- Added testids to all close/submit/cancel buttons
- Snapshot tests verify baseline + uniqueness
- Coverage: ≥95% of user-facing modals
- Codex scan + audit: ✓ approved
```

---

### N-07: Short Modal Data-testid + Modal Audit Subset

**File to Modify:**
```
/src/components/orders/ShortForm.tsx
```

**Current State:**
- ShortForm renders a modal; check for existing testid

**Changes Required:**
```tsx
// /src/components/orders/ShortForm.tsx

export function ShortForm(...) {
  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Open Short Form
      </button>

      {isOpen && (
        <div
          + data-testid="modal-short"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            + data-testid="modal-short-content"
            style={{ ... }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Form content */}
            <button
              + data-testid="modal-short-submit"
              onClick={handleSubmit}
            >
              Submit Short Order
            </button>
            <button
              + data-testid="modal-short-cancel"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
```

**Test Cases:**
```bash
npx playwright test --grep "N-07"

# Test 1: Open short form modal
# Test 2: Query modal by data-testid="modal-short"
# Test 3: Query submit button by data-testid="modal-short-submit"
# Test 4: Query cancel button by data-testid="modal-short-cancel"
# Test 5: Clicking cancel closes modal
# Test 6: Testids are unique (not duplicated elsewhere)
```

**PR Template:**
```
Title: feat(N-07): add data-testid to ShortForm modal

- Added data-testid="modal-short" to wrapper
- Added data-testid="modal-short-submit" to submit button
- Added data-testid="modal-short-cancel" to cancel button
- E2E tests verify all testids are queryable
- Part of modal audit subset (N-06 focuses on global coverage)
```

---

## COMMON PATTERNS

### Modal Wrapper Template
```tsx
{isOpen && (
  <div
    data-testid="modal-{feature}"
    style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}
    onClick={() => setIsOpen(false)}
  >
    <div
      data-testid="modal-{feature}-content"
      style={{ background: '#1E2329', borderRadius: '12px', padding: '24px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Content */}
      <button data-testid="modal-{feature}-submit">Submit</button>
      <button data-testid="modal-{feature}-cancel">Cancel</button>
    </div>
  </div>
)}
```

### Guard Overlay Template
```tsx
{isLocked && (
  <div
    data-testid="guard-{feature}-locked"
    className="absolute inset-0 bg-[rgba(0,0,0,0.6)] flex items-center justify-center"
    onClick={(e) => e.stopPropagation()}
  >
    <button
      data-testid="guard-{feature}-unlock-cta"
      onClick={() => openUpgradeModal()}
    >
      Unlock with plan upgrade
    </button>
  </div>
)}
```

### API Response Template
```typescript
interface SuccessResponse<T = any> {
  success: true
  data: T
}

interface ErrorResponse {
  success: false
  error: {
    code: string // e.g., "AUTH_010", "UPGRADE_001"
    message: string
  }
}
```

---

## DEPLOYMENT & ROLLBACK

### Deployment Order
1. **Phase 1 (Day 1):** N-01, N-03, N-07 → merge to main
2. **Phase 2 (Days 2-3):** N-02, N-04 → merge to main
3. **Phase 3a (Days 4-5):** N-05 → merge to main (monitor for tier issues)
4. **Phase 3b (Days 6-7):** N-06 → merge to main (QA audit)

### Rollback Order (if needed)
```bash
# Rollback all 7 tasks:
git revert HEAD~7..HEAD

# Or selective:
git revert {N-05-commit-hash}  # If tier issues only
```

### Staging Validation
```bash
# Before main merge, verify on staging:
npm run build
npm run test
npx playwright test --project=chromium
npm run lighthouse  # for N-04 performance
```

---

## NOTES & GOTCHAS

- **N-02 Filter Logic:** Ensure toggle logic doesn't conflict with URL search params (if used)
- **N-04 Chart Performance:** May need to lazy-load PortfolioChart to avoid LCP regression
- **N-05 Tier Order:** JOGADOR=0, CRAQUE=1, LENDA=2 matches `/src/app/api/v1/admin/users/[id]/promote-plan/route.ts`
- **N-06 Modal Count:** Expect 10-15 modals across codebase; prioritize by user frequency
- **Testid Naming:** Avoid special characters; use kebab-case (modal-short, not modal_short)

---

## REFERENCE LINKS

- `/src/app/api/v1/portfolio/history/route.ts` — Existing 7D history endpoint
- `/src/components/payments/PlanCTAButton.tsx` — Reference modal + testid pattern
- `/src/components/orders/OrderForm.tsx` — Reference form component
- `/src/app/(app)/mercado/market-page-client.tsx` — Reference filter logic
- `/FINAL-READINESS.md` — Baseline constraints

---

**Checklist completed:** Ready for Phase 1 kickoff ✓
