# WAVE 4 — IMPLEMENTATION PACKAGE

**Status:** Ready for execution  
**Date prepared:** 2026-04-20  
**Target timeline:** 2 weeks (40-60 hours)  
**Team:** 1 Senior Architect + Codex pair-programming

---

## Documents Included (Start Here)

### 1. **WAVE4-EXECUTIVE-SUMMARY.md** ← START HERE
   - 2-minute read for decision makers
   - Dependency graph + parallelization strategy
   - Codex engagement moments
   - Risk summary + success criteria
   - Stakeholder sign-off checklist (6 questions)

### 2. **N01-N07-STRATEGIC-PLAN.md** (Full technical analysis)
   - Detailed breakdown of all 7 tasks
   - Location + changes + risk assessment for each
   - Execution roadmap (calendar)
   - Testing strategy + DoD checklist
   - Deliverables + reference links

### 3. **WAVE4-TECHNICAL-CHECKLIST.md** (Implementation guide)
   - Task-by-task code changes
   - Before/after code snippets
   - Test cases for each task
   - Common patterns + templates
   - Gotchas + reference links

---

## QUICK REFERENCE

### Task Breakdown

| # | Task | Type | Hours | Risk | Codex? |
|---|------|------|-------|------|--------|
| N-01 | Banner 60px | Visual | 2-3h | LOW | No |
| N-02 | Remove TODOS | Feature | 4-6h | MEDIUM | No |
| N-03 | Favorite star | Feature | 3-4h | LOW | No |
| N-04 | 7D chart | Feature | 5-7h | MEDIUM | Maybe |
| N-05 | Tier validation | Logic | 8-10h | HIGH | **Yes** |
| N-06 | Modal audit | QA | 12-16h | HIGH | **Yes** |
| N-07 | Short testid | QA | 3-4h | MEDIUM | No |
| **Total** | — | — | **40-60h** | — | — |

### Execution Plan

**Phase 1 (Day 1) — Quick Wins:**
- N-01, N-03, N-07 run in parallel
- Effort: 8-11 hours
- Risk: LOW

**Phase 2 (Days 2-3) — Features:**
- N-02, N-04 run in parallel
- Effort: 9-13 hours
- Risk: MEDIUM

**Phase 3 (Days 4-7) — QA & Validation:**
- N-05 → N-06 (sequential)
- Effort: 20-26 hours
- Risk: HIGH (mitigated by Codex)

---

## ACTION ITEMS (Today)

1. **Read** `WAVE4-EXECUTIVE-SUMMARY.md` (5 min)
2. **Answer** 6 stakeholder questions:
   - N-01 banner: 60px all breakpoints or desktop-only?
   - N-02 filter: toggle or select-only?
   - N-03 star: overlay or replace image?
   - N-04 chart: 7D fixed or user-selectable?
   - N-05 LENDA: hide or "already subscribed"?
   - N-06 testids: versioning strategy?
3. **Schedule** Codex sessions:
   - N-05 tier validation: Days 3-4 (2-3 hours)
   - N-06 modal audit: Days 5-6 (2 hours)
4. **Confirm** test infrastructure ready:
   - `npm run test` ✓
   - `npx playwright test` ✓
5. **Go/no-go** decision → kickoff Phase 1

---

## DEPENDENCIES

```
None
  ├─ N-01 (Banner)
  ├─ N-03 (Favorite)
  └─ N-07 (Short testid)
       ↓
  N-02 (Filter) + N-04 (Chart) [parallel]
       ↓
  N-05 (Tier validation) ← CRITICAL
       ↓
  N-06 (Modal audit) [depends on N-05 stable]
```

---

## RISK REGISTER

| Risk | Prob | Impact | Mitigation |
|------|------|--------|-----------|
| N-05 tier logic edge cases | MED | HIGH | Codex adversarial review + 5 test matrix |
| N-06 modal count overflow | MED | MED | Early inventory (Day 1); prioritize by frequency |
| N-04 chart perf regress | LOW | MED | Lazy-load + skeleton; Lighthouse check |
| N-02 filter conflicts | LOW | MED | E2E tests for all 12 combos |

**Overall Confidence:** 80%

---

## SUCCESS CRITERIA

All 7 tasks merged with:
- ✅ Zero regressions (E2E 100% pass)
- ✅ Data-testid coverage ≥95% modals
- ✅ Tier validation: 5/5 test cases pass
- ✅ Visual consistency: 0 pixel mismatches
- ✅ Performance: N-04 LCP < 3s
- ✅ Code review: Codex approved N-05 + N-06

---

## STAKEHOLDER SIGN-OFF

- [ ] Review WAVE4-EXECUTIVE-SUMMARY.md
- [ ] Answer 6 blocking questions
- [ ] Confirm Codex session booking
- [ ] Approve timeline (2 weeks)
- [ ] Sign off on success criteria
- [ ] Authorize Phase 1 kickoff

**Approval:** _____________________ (Name/Date)

---

## FILE STRUCTURE

```
footstock-next/
├── WAVE4-README.md (this file)
├── WAVE4-EXECUTIVE-SUMMARY.md (2 min read)
├── N01-N07-STRATEGIC-PLAN.md (full plan, 20 min)
├── WAVE4-TECHNICAL-CHECKLIST.md (implementation guide)
├── src/
│   ├── components/
│   │   ├── banners/BannerSlot.tsx (N-01)
│   │   ├── market/asset-card.tsx (N-03)
│   │   ├── orders/OrderForm.tsx (N-04)
│   │   ├── orders/ShortForm.tsx (N-07)
│   │   ├── payments/PlanCTAButton.tsx (N-05, N-06)
│   │   └── ... (other modals)
│   ├── app/
│   │   ├── (app)/mercado/market-page-client.tsx (N-02)
│   │   └── api/v1/
│   │       ├── portfolio/history/route.ts (N-04, verified)
│   │       ├── favorites/route.ts (N-03, NEW)
│   │       └── checkout/route.ts (N-05)
│   └── lib/
│       └── constants/tiers.ts (N-05, NEW)
├── tests/e2e/
│   ├── N-01-*.spec.ts
│   ├── N-02-filters.spec.ts
│   ├── N-03-*.spec.ts
│   ├── N-04-*.spec.ts
│   ├── N-05-tier-validation.spec.ts
│   ├── N-06-modals.spec.ts
│   └── N-07-*.spec.ts
```

---

## NEXT ACTIONS

### For Product Manager
1. Review WAVE4-EXECUTIVE-SUMMARY.md
2. Answer 6 stakeholder questions
3. Schedule kickoff meeting

### For Engineering
1. Read WAVE4-TECHNICAL-CHECKLIST.md
2. Prepare feature branches (feat/N-01, etc.)
3. Set up test infrastructure
4. Book Codex sessions

### For QA
1. Review testing strategy (WAVE4-TECHNICAL-CHECKLIST.md, section "TESTING MATRIX")
2. Prepare E2E test structure
3. Plan visual regression testing

### For DevOps
1. Prepare staging environment for Phase 3
2. Set up rollback plan
3. Configure Lighthouse monitoring for N-04

---

## CONTACT & ESCALATION

- **Strategic Questions:** Review WAVE4-EXECUTIVE-SUMMARY.md
- **Technical Deep Dive:** Review N01-N07-STRATEGIC-PLAN.md
- **Implementation Questions:** Review WAVE4-TECHNICAL-CHECKLIST.md
- **Codex Sessions:** Book via `/skill:mcp-codex` (N-05, N-06)
- **Blockers:** Create GitHub issue with `wave-4` label

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-20  
**Status:** Ready for execution ✓

See **WAVE4-EXECUTIVE-SUMMARY.md** to start.
