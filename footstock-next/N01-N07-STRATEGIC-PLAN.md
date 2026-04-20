# STRATEGIC IMPLEMENTATION PLAN — FootStock N-01 through N-07

**Date:** 2026-04-20  
**Scope:** 7 improvement tasks (Wave 4)  
**Team:** 1 Senior Architect + Codex pair-programming  
**Estimated Effort:** 40-60 hours  
**Success Criteria:** Zero regressions, ≥95% data-testid coverage, tier validation complete

---

## EXECUTIVE SUMMARY

FootStock has completed 14 tasks across 3 waves (modules 1-29). Wave 4 introduces 7 targeted improvements:
- **3 visual/UX fixes** (N-01, N-03, N-07): Quick wins, low risk
- **2 feature enhancements** (N-02, N-04): Medium complexity, parallel execution
- **2 QA/audit tasks** (N-05, N-06): High complexity, sequential dependency

This plan sequences work to maximize parallelization while respecting critical dependencies.

---

## DETAILED TASK BREAKDOWN

### N-01: Banner Height Fix — LOW complexity, HIGH impact
- **Description:** Correct banner heights to 60px on desktop (visual consistency)
- **Location:** `/src/components/banners/BannerSlot.tsx` + related slot components
- **Risk:** LOW — CSS-only change, isolated to banner layer
- **Effort:** 2-3 hours (code review + regression visual testing)
- **Dependencies:** None
- **Codex Involvement:** Not needed; straightforward CSS adjustment

### N-02: Remove TODOS Button from Filters — MEDIUM complexity
- **Description:** Eliminate explicit "TODOS" filter button; no filter selection = all items shown
- **Location:** `/src/app/(app)/mercado/market-page-client.tsx` (lines 200-250)
  - Sentiment filter: currently `"all" | "positive" | "neutral" | "negative"`
  - Division filter: currently `"all" | "SERIE_A" | "SERIE_B"`
  - Both have a "Todos" button that should be removed
- **Change Required:**
  - Remove "Todos" from button list
  - Clarify logic: when user deselects all, revert to all-selected state (UX pattern)
  - Update analytics tracking (`EVT-016: market_list_viewed`)
- **Risk:** MEDIUM — UI logic change, needs E2E testing for filter behavior
- **Effort:** 4-6 hours (implementation + E2E tests for all filter combos)
- **Dependencies:** None (independent)
- **Testing:** E2E test: `/tests/e2e/market-filters.spec.ts`

### N-03: Favorite Team Star — LOW complexity, UX delight
- **Description:** Highlight favorite team in list with ⭐ icon
- **Location:** `/src/components/market/asset-card.tsx`
- **Data Source:** User's favorite asset stored in `User.profile.favoriteAsset` (Prisma)
- **Change Required:**
  - Add `/api/v1/favorites` endpoint to toggle favorite status
  - Update `AssetCard` component to show ⭐ if favorite
  - Add `data-testid="asset-favorite-star-{ticker}"`
- **Risk:** LOW — new feature, no breaking changes
- **Effort:** 3-4 hours (API endpoint + UI + tests)
- **Dependencies:** None
- **Testing:** Unit test for favorite toggle; visual regression for ⭐ placement

### N-04: 7-Day Chart in Buy Modal — MEDIUM complexity, feature enhancement
- **Description:** Display 7-day portfolio history chart inside the buy order modal
- **Location:** `/src/components/orders/OrderForm.tsx` (modal context)
- **Data Source:** Existing `/api/v1/portfolio/history?period=7D` endpoint (verified in code)
- **Change Required:**
  - Fetch 7D history when order modal opens
  - Render PortfolioChart component (reuse from `/src/components/portfolio/PortfolioChart.tsx`)
  - Place chart above or below the order form
  - Add loading/error states
  - Add `data-testid="order-modal-7d-chart"`
- **Risk:** MEDIUM — depends on existing endpoint working; chart rendering can be heavy
- **Effort:** 5-7 hours (API integration + chart embedding + tests)
- **Dependencies:** None (endpoint exists)
- **Testing:** E2E: open order modal, verify chart renders; performance check (LCP)

### N-05: Tier Validation in Upgrade Modals — HIGH complexity, HIGH priority (BUG FIX)
- **Description:** When user on JOGADOR plan views upgrade modal, show only CRAQUE & LENDA
  When user on CRAQUE plan views upgrade modal, show only LENDA (not CRAQUE)
- **Location:** `/src/components/payments/PlanCTAButton.tsx` (lines 57-110)
  `/src/components/payments/CheckoutButton.tsx` (target)
- **Root Cause:** Current modal shows all plans regardless of current tier
- **Tier Hierarchy:**
  ```
  JOGADOR (tier 0) → CRAQUE (tier 1) → LENDA (tier 2)
  ```
- **Change Required:**
  - Add `TIER_ORDER` constant (reference: `/src/app/api/v1/admin/users/[id]/promote-plan/route.ts` line 14 uses `PLAN_HIERARCHY`)
  - In `CheckoutButton`: filter plans by `tier > currentUserTier`
  - Update `PlanCTAButton` to pass `currentTier` to modal
  - Validate in `/api/v1/checkout` endpoint (prevent downgrading via API manipulation)
- **Risk:** HIGH — logic bug affecting billing flow; needs test cases for all tier combos
- **Effort:** 8-10 hours (logic implementation + tier validation + 5 test cases)
- **Dependencies:** None (but should complete before N-06 final audit)
- **Testing:**
  - Test 1: JOGADOR sees [CRAQUE, LENDA]
  - Test 2: CRAQUE sees [LENDA]
  - Test 3: LENDA sees nothing (modal hidden or disabled)
  - Test 4: API validation prevents downgrade attempt
  - Test 5: Switching between different user tiers works correctly

### N-06: Data-testid Audit & Addition (Modals + Guards) — HIGH complexity, QA coverage
- **Description:** Comprehensive audit of all modals and guard components; add missing data-testid
- **Location:** All modals across:
  - `/src/components/payments/` (PlanCTAButton, CheckoutButton)
  - `/src/components/profile/delete-account-modal.tsx`
  - `/src/components/orders/` (OrderForm modal context, ShortForm modal)
  - `/src/components/leagues/` (create/invite modals)
  - Custom modals in various pages
  - Guard components: leverage unlock overlay, plan upgrade gates
- **Current Status:**
  - `PlanCTAButton` has `data-testid={`plan-checkout-modal-${planType.toLowerCase()}`}` (line 59)
  - Others may be partial or missing
- **Change Required:**
  1. Global inventory: `grep -r "Modal\|modal\|overlay" /src/components --include="*.tsx"` to find all
  2. For each modal, add/audit:
     - `data-testid="modal-{feature}-{variant}"` on wrapper
     - `data-testid="modal-{feature}-close"` on close button
     - `data-testid="modal-{feature}-submit"` on primary CTA
     - `data-testid="modal-{feature}-cancel"` on secondary CTA
  3. For each guard/overlay (leverage, plan access):
     - `data-testid="guard-{feature}-locked"`
     - `data-testid="guard-{feature}-unlock-cta"`
- **Risk:** HIGH — sprawling audit, easy to miss modals; must do global search
- **Effort:** 12-16 hours (discovery + implementation + regression testing)
- **Dependencies:** N-05 should complete first (tier validation modal logic stable)
- **Testing:** Playwright snapshot test of all modals; verify testid uniqueness

### N-07: Short Modal Data-testid + Modal Audit Subset — MEDIUM complexity, QA hygiene
- **Description:** Specifically add `data-testid="modal-short"` to ShortForm modal; prioritize modal audit subset
- **Location:** `/src/components/orders/ShortForm.tsx` (lines 1-350)
- **Change Required:**
  - Add `data-testid="modal-short-form"` wrapper
  - Add `data-testid="modal-short-submit"` on confirm button
  - Add `data-testid="modal-short-cancel"` on cancel button
  - Complete partial audit from N-06 (focus on orders, payments, leagues modals only)
- **Risk:** MEDIUM — scoped, testable in isolation
- **Effort:** 3-4 hours (implementation + targeted E2E)
- **Dependencies:** None (N-06 is broader, N-07 is focused)
- **Testing:** E2E: open short form, verify testids exist, can query all 3 buttons

---

## DEPENDENCY GRAPH

```
                    ┌─────────────────┐
                    │   N-01: Banner  │
                    │  (60px height)  │
                    └────────┬────────┘
                             │
                          (none)
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
    ┌───┴───┐  ┌──────────┐  ┌──────────┐  ┌────┴────┐
    │ N-02  │  │ N-03 ⭐  │  │ N-04 📊  │  │ N-07   │
    │Filter │  │Favorite  │  │ 7D Chart │  │ Short  │
    │ TODOS │  │  Star    │  │  in Buy  │  │ Modal  │
    └───┬───┘  └──────────┘  └──────────┘  └────┬───┘
        │                                       │
        └───────────────┬──────────────────────┘
                        │
                 (N-06 should follow)
                        │
            ┌───────────┴───────────┐
            │                       │
        ┌───┴──────┐        ┌──────┴───┐
        │ N-05: Tier│      │ N-06:   │
        │ Validation │      │ Audit   │
        │ (BLOCKER) │      │ Modals  │
        └──────────┘       └─────────┘
```

---

## PARALLELIZATION STRATEGY

### Phase 1: Quick Wins (Parallel) — 8-10 hours
**Rationale:** No dependencies; visual changes + simple features
| Task | Effort | Dependencies | Risk |
|------|--------|--------------|------|
| N-01 | 2-3h | None | LOW |
| N-03 | 3-4h | None | LOW |
| N-07 | 3-4h | None | MEDIUM |
| **Total** | **8-11h** | — | **LOW** |

**Deliverable:** PR with 3 merged commits

---

### Phase 2: Feature Enhancements (Parallel) — 9-13 hours
**Rationale:** Medium complexity; independent logic
| Task | Effort | Dependencies | Risk |
|------|--------|--------------|------|
| N-02 | 4-6h | None | MEDIUM |
| N-04 | 5-7h | Existing `/api/v1/portfolio/history` | MEDIUM |
| **Total** | **9-13h** | — | **MEDIUM** |

**Deliverable:** 2 PRs with E2E tests

---

### Phase 3: QA & Validation (Sequential) — 20-26 hours
**Rationale:** N-05 blocks final N-06 audit; high complexity requires focused effort
| Task | Effort | Dependencies | Risk | Sequence |
|------|--------|--------------|------|----------|
| N-05 | 8-10h | None | **HIGH** | **First** |
| N-06 | 12-16h | N-05 stable | **HIGH** | **After N-05** |
| **Total** | **20-26h** | — | **HIGH** | Sequential |

**Deliverable:** 2 PRs with tier test suite + modal audit checklist

---

## EXECUTION ROADMAP

```
Week 1 — Monday
├─ Morning: Setup + Phase 1 kickoff
│  ├─ N-01: Review banner CSS structure
│  ├─ N-03: API endpoint + icon integration
│  └─ N-07: Short modal testid
├─ Afternoon: N-02 implementation
│  └─ Remove "Todos" buttons + filter logic
└─ EOD: Phase 1 merged (4 commits)

Week 1 — Tuesday
├─ Morning: Phase 2 kickoff
│  ├─ N-02: E2E tests for filter combos
│  └─ N-04: Chart integration start
├─ Afternoon: N-04 continuation
│  ├─ API fetch + loading state
│  ├─ Chart rendering (reuse PortfolioChart)
│  └─ Error boundaries
└─ EOD: Phase 2 E2E passing

Week 1 — Wednesday-Thursday
├─ Morning: Phase 3 kickoff
│  └─ N-05: Tier hierarchy implementation
│     ├─ TIER_ORDER constant
│     ├─ Modal filter logic
│     ├─ API validation
│     └─ 5 test cases
├─ Afternoon: N-05 code review
│  └─ Fix any tier validation edge cases
└─ EOD: N-05 merged (1 commit)

Week 2 — Friday
├─ Morning: Phase 3 continuation
│  └─ N-06: Modal audit (global search)
│     ├─ Inventory of all modals
│     ├─ Add testids systematically
│     └─ Snapshot tests
├─ Afternoon: N-06 finalization
│  └─ Regression testing
└─ EOD: N-06 merged (1 commit)

Week 2 — Spike/Buffer
└─ Performance validation + rollback prep
```

---

## CODEX ENGAGEMENT PLAN

### Recommended Codex Sessions

1. **N-05 Tier Validation (Day 3-4)** — CRITICAL
   - **Input:** Current PlanCTAButton logic + PLAN_HIERARCHY pattern
   - **Task:** Implement TIER_ORDER constant + filter logic
   - **Adversarial Review:** Codex validates all 5 tier test cases pass
   - **Duration:** 2-3 hours pair programming

2. **N-06 Modal Audit (Day 5-6)** — HIGH VALUE
   - **Input:** Global codebase scan for modals
   - **Task:** Generate comprehensive testid checklist + add IDs systematically
   - **Validation:** Codex runs snapshot tests; reports any missing or duplicate testids
   - **Duration:** 2 hours scan + implementation

3. **N-04 Chart Integration (Day 2)** — OPTIONAL (if blocked)
   - **Input:** PortfolioChart component structure + OrderForm layout
   - **Task:** Embed chart in modal; validate data flow
   - **Duration:** 1-2 hours if performance issues arise

---

## RISK MITIGATION

### Risk: N-05 Tier Logic Has Edge Cases
- **Mitigation:** Codex validates all 5 test cases before merge
- **Backup:** Manual RBAC validation in staging environment
- **Rollback:** Revert to previous modal behavior (show all plans)

### Risk: N-06 Modal Audit Finds Too Many Modals
- **Mitigation:** Global grep early (Day 1) to estimate scope
- **Backup:** Prioritize modals by user-facing frequency (orders > leagues > admin)
- **Scope Boundary:** Use N-07 as guide (short modal as reference)

### Risk: N-04 Chart Performance Regresses
- **Mitigation:** Lazy-load chart component; test LCP
- **Backup:** Show skeleton loader while chart fetches
- **Budget:** Allocate 1-2 hours for performance optimization

### Risk: N-02 Filter Logic Breaks Existing Behavior
- **Mitigation:** E2E tests for all filter state combos (3 division × 4 sentiment = 12 combos)
- **Backup:** Keep old logic as fallback; feature-flag if needed
- **Testing:** Test clearing filters manually + via "Clear Filters" button

---

## TESTING STRATEGY

### Unit Tests (Phase 1-2)
- N-03 favorite toggle: 4 test cases (add, remove, toggle, persist)
- N-02 filter logic: 12 test cases (all combos)
- N-04 chart data: 3 test cases (empty, data, error)

### E2E Tests (Phase 2-3)
- N-02 filters: Playwright test for each filter combo
- N-04 chart: Open order modal, verify chart loads + renders
- N-05 tier: 5 test cases for each tier upgrade path
- N-06 modals: Snapshot test + testid uniqueness check
- N-07 short: Query short modal by testid + verify all buttons

### Visual Regression (Phase 1)
- N-01 banner: Compare desktop height before/after
- N-03 star: Compare asset card with/without ⭐
- N-07 short: Compare short form modal before/after testids

### Performance (Phase 2-3)
- N-04 chart: Lighthouse LCP < 3s in modal context
- N-06 modals: No jank from testid additions

---

## DEFINITION OF DONE (per task)

Each task must satisfy:
1. ✅ Code merged to main
2. ✅ All tests passing (unit + E2E + visual)
3. ✅ No regressions in existing flows
4. ✅ Code reviewed (if Codex involved: adversarial review)
5. ✅ Documentation updated (if API/props change)
6. ✅ Commit message follows project conventions

### Phase 1 DoD
- N-01: CSS height verified on desktop breakpoints
- N-03: Favorite toggle persists across page reloads
- N-07: Short modal testids queryable in E2E

### Phase 2 DoD
- N-02: Filter deselection reverts to "all"; no "Todos" button visible
- N-04: Chart renders in modal; 7D data fetched correctly

### Phase 3 DoD
- N-05: Tier validation passes all 5 test cases
- N-06: All modals have testids; no duplicates; snapshot tests stable

---

## SUCCESS CRITERIA

| Metric | Target | Validation |
|--------|--------|-----------|
| All 7 tasks merged | 7/7 | `git log --oneline \| grep -E "N-0[1-7]"` |
| Zero regressions | 0 | E2E suite passes 100% |
| Data-testid coverage | ≥95% modals | Audit checklist complete |
| Tier validation | 5/5 test cases | Codex adversarial review + staging test |
| Visual consistency | 0 pixel mismatches | Visual regression tests |
| Performance | LCP < 3s (N-04) | Lighthouse on `/mercado` + buy modal |

---

## DELIVERABLES

1. **Analysis Document** (this file)
2. **Phase 1 PR:** N-01 + N-03 + N-07 (3 commits)
3. **Phase 2 PR:** N-02 + N-04 (2 commits with E2E tests)
4. **Phase 3a PR:** N-05 (1 commit with 5 tier test cases)
5. **Phase 3b PR:** N-06 (1 commit with modal audit + snapshot tests)
6. **Test Suite:** `tests/e2e/N-*.spec.ts` for all 7 tasks
7. **Tier Validation Checklist:** 5×3 matrix (tier combo × upgrade direction)
8. **Modal Audit Checklist:** Global inventory + testid assignments

---

## QUESTIONS FOR STAKEHOLDER

1. **N-01 Banner Height:** Should 60px apply to all breakpoints or desktop-only?
2. **N-02 Filter Logic:** When user clicks a filter button, should it toggle or select-only? (Current: toggle)
3. **N-03 Favorite Star:** Should favorite star replace the asset image or overlay it?
4. **N-04 Chart:** Should 7D chart be default or user-selectable (1D, 7D, 30D options)?
5. **N-05 Tier Modal:** If user on LENDA, should modal hide or show "Already subscribed" message?
6. **N-06 Audit:** Should we version testids (e.g., `modal-short-v2`) for backward compat?

---

## REFERENCES

- **Codebase Structure:** `/src/components`, `/src/app/api/v1`
- **Existing Modals:** PlanCTAButton (ref), DeleteAccountModal (delete-account-modal.tsx), ShortForm (orders/ShortForm.tsx)
- **Plan Hierarchy:** `/src/app/api/v1/admin/users/[id]/promote-plan/route.ts` (line 14)
- **Market Filters:** `/src/app/(app)/mercado/market-page-client.tsx` (lines 150-250)
- **Portfolio History API:** `/src/app/api/v1/portfolio/history/route.ts` (verified 7D support)
- **Order Form:** `/src/components/orders/OrderForm.tsx` (lines 54-200)
- **Final Readiness:** `/docs/FINAL-READINESS.md` (baseline)

---

## NEXT STEPS

1. **Stakeholder review** → confirm 6 questions above
2. **Phase 1 kickoff** → assign N-01, N-03, N-07 to team
3. **Codex registration** → book sessions for N-05 (tier logic) + N-06 (audit)
4. **Test infrastructure** → ensure Playwright + Jest configured
5. **Go/no-go** → final sign-off before Day 1 development
