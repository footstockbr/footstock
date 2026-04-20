# WAVE 4 EXECUTIVE SUMMARY — FootStock N-01 to N-07

**Prepared:** 2026-04-20  
**Status:** Ready for Execution  
**Team:** 1 Senior Architect + Codex  
**Timeline:** 2 weeks (40-60 hours)

---

## DEPENDENCY GRAPH & PARALLELIZATION

```
╔════════════════════════════════════════════════════════════════════════╗
║                       PHASE 1: QUICK WINS (8-11h)                      ║
║                       ┌─────────────────────────┐                       ║
║                       │  Run in PARALLEL        │                       ║
║                       └─────────────────────────┘                       ║
║    N-01               N-03               N-07                           ║
║  (2-3h)             (3-4h)             (3-4h)                          ║
║  Banner           Favorite ⭐         Short Modal                      ║
║  Height           Star                Data-testid                     ║
║  (CSS)            (API+UI)            (QA)                            ║
║                                                                        ║
║  Risk: LOW        Risk: LOW           Risk: MEDIUM                    ║
╚════════════════════════════════════════════════════════════════════════╝
                                ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: FEATURES (9-13h)                             │
│                    ┌───────────────────────────┐                         │
│                    │ Run in PARALLEL           │                         │
│                    └───────────────────────────┘                         │
│   N-02                          N-04                                     │
│  (4-6h)                       (5-7h)                                    │
│ Filter TODOS                7D Chart                                    │
│ Removal              in Buy Modal                                      │
│ (Logic)              (Chart Embed)                                     │
│                                                                         │
│ Risk: MEDIUM           Risk: MEDIUM                                   │
└──────────────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: QA & VALIDATION (20-26h)                     │
│              ┌───────────────────────────────────────┐                   │
│              │ SEQUENTIAL (Codex pair-programming)   │                   │
│              └───────────────────────────────────────┘                   │
│                                                                         │
│   N-05                               N-06                              │
│  (8-10h)                           (12-16h)                           │
│ Tier Validation          Modal Audit + Testids                        │
│ in Upgrades              (Global Coverage)                            │
│ (CRITICAL BUG FIX)       (QA Completeness)                            │
│                                                                         │
│ Risk: HIGH         (Sequential — N-05 must complete first)            │
└──────────────────────────────────────────────────────────────────────────┘

Total Effort: 40-60 hours over 2 weeks
```

---

## TASK SUMMARY TABLE

| # | Task | Type | Effort | Risk | Impact | Codex? |
|---|------|------|--------|------|--------|--------|
| N-01 | Banner height (60px) | Visual | 2-3h | LOW | HIGH | No |
| N-02 | Remove TODOS from filters | Feature | 4-6h | MEDIUM | MEDIUM | No |
| N-03 | Favorite team star (⭐) | Feature | 3-4h | LOW | DELIGHT | No |
| N-04 | 7-day chart in modal | Feature | 5-7h | MEDIUM | MEDIUM | Maybe |
| N-05 | Tier validation (BUG FIX) | Logic | 8-10h | HIGH | HIGH | **Yes** |
| N-06 | Modal audit + testids | QA | 12-16h | HIGH | CRITICAL | **Yes** |
| N-07 | Short modal testid | QA | 3-4h | MEDIUM | MEDIUM | No |
| **Total** | — | — | **40-60h** | — | — | — |

---

## KEY FINDINGS

### 1. No Blocking Dependencies (Except N-05 → N-06)
- **N-01, N-03, N-07:** Run in parallel (Day 1)
- **N-02, N-04:** Run in parallel (Day 2-3)
- **N-05 → N-06:** Sequential only (N-05 must complete before N-06 final validation)

### 2. Root Causes Identified

**N-01 (Banner):** CSS height inconsistency across breakpoints
```css
/* Current: varying heights (mobile vs desktop) */
/* Target: 60px on desktop, responsive on mobile */
```

**N-02 (Filters):** UX clarity — explicit "TODOS" button confusing
```
Current state: division="all" | "SERIE_A" | "SERIE_B"
Target state: Remove "Todos" button; auto-select all when deselected
```

**N-03 (Star):** Missing favorite indicator
```
Current: No visual distinction for favorite asset
Target: Show ⭐ on asset card + store in User.profile
```

**N-04 (Chart):** Modal lacks historical context
```
Current: Order form shows only current price
Target: Embed 7-day portfolio chart via /api/v1/portfolio/history
```

**N-05 (Tier):** Logic bug — modal shows all plans regardless of user tier
```
Current: JOGADOR sees [CRAQUE, LENDA] + can upgrade to same tier
Target: JOGADOR → [CRAQUE, LENDA]; CRAQUE → [LENDA]; LENDA → none
```

**N-06 (Testids):** Incomplete test ID coverage on modals
```
Current: Some modals have testids; audit required for global coverage
Target: ≥95% of modals + guards have data-testid attributes
```

**N-07 (Short Modal):** ShortForm modal missing specific testid
```
Current: Uses generic modal wrapper
Target: Add data-testid="modal-short-*" for E2E queries
```

---

## CODEX ENGAGEMENT MOMENTS

### Session 1: N-05 Tier Validation (Day 3-4, ~2-3 hours)
**Why Codex?** Complex billing logic; needs adversarial review
- Input: `PlanCTAButton.tsx` + `CheckoutButton.tsx` + PLAN_HIERARCHY pattern
- Output: Tier-filtered modal logic + 5 test cases
- Validation: All 5 combos pass (JOGADOR→*, CRAQUE→*, LENDA→*)

### Session 2: N-06 Modal Audit (Day 5-6, ~2 hours)
**Why Codex?** Global codebase scan + pattern application
- Input: Grep for all modals across 20+ component directories
- Output: Testid checklist + systematic additions
- Validation: Snapshot tests + no duplicate IDs

### Session 3 (Optional): N-04 Chart Performance (if blocked)
- Input: PortfolioChart perf metrics in buy modal context
- Output: Optimization (lazy-load, skeleton, budget)

---

## TESTING MATRIX

### Unit Tests
- **N-03:** 4 test cases (favorite toggle add/remove/persist/state)
- **N-02:** 12 test cases (3 division × 4 sentiment combos)
- **N-04:** 3 test cases (empty/data/error states)

### E2E Tests
- **N-01:** Visual regression (60px height on desktop)
- **N-02:** Click division → click sentiment → verify filter applied
- **N-03:** Click star → verify persistence after reload
- **N-04:** Open order modal → verify chart loads + renders
- **N-05:** Login as JOGADOR → click upgrade → see [CRAQUE, LENDA] only
- **N-06:** Query all testids; verify 0 duplicates
- **N-07:** Open short form → query modal-short-submit button

### Performance Checks
- **N-04:** LCP < 3s with chart embedded in modal
- **N-06:** No visual jank from testid additions

---

## SUCCESS CRITERIA (GO/NO-GO)

| Criterion | Target | Status |
|-----------|--------|--------|
| All 7 tasks merged | 7/7 commits | — |
| Zero regressions | E2E 100% pass | — |
| Data-testid coverage | ≥95% modals | — |
| Tier logic validation | 5/5 test cases | — |
| Visual consistency | 0 pixel mismatches | — |
| Performance (N-04) | LCP < 3s | — |
| Codex review gates | N-05 + N-06 approved | — |

---

## STAKEHOLDER SIGN-OFF CHECKLIST

- [ ] Confirm N-01 banner target height (60px all breakpoints or desktop-only?)
- [ ] Confirm N-02 filter toggle vs. select-only behavior
- [ ] Confirm N-03 star placement (overlay or replace image?)
- [ ] Confirm N-04 chart default period (7D, or user-selectable?)
- [ ] Confirm N-05 LENDA modal behavior (hide or "already subscribed"?)
- [ ] Confirm N-06 testid versioning strategy (for backward compat?)
- [ ] Allocate Codex sessions (N-05 + N-06)
- [ ] Finalize Week 1-2 calendar

---

## RISK SUMMARY

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| N-05 tier logic edge cases | MEDIUM | HIGH | Codex adversarial review + 5 test matrix |
| N-06 modal count > capacity | MEDIUM | MEDIUM | Early global grep (Day 1); prioritize by frequency |
| N-04 chart perf regresses | LOW | MEDIUM | Lazy-load + skeleton loader + Lighthouse check |
| N-02 filter state conflicts | LOW | MEDIUM | E2E tests for all 12 combos |

---

## EFFORT CONFIDENCE

- **Phase 1:** 95% confidence (visual/simple features)
- **Phase 2:** 85% confidence (depends on existing API stability)
- **Phase 3a (N-05):** 75% confidence (complex logic; Codex review mitigates)
- **Phase 3b (N-06):** 70% confidence (depends on modal count in codebase)

**Total Confidence: 80%** — All tasks achievable within 40-60 hour window

---

## DETAILED PLAN LOCATION

See full strategic plan: **`N01-N07-STRATEGIC-PLAN.md`**

### Sections Included
1. Executive Summary
2. Detailed Task Breakdown (7 tasks × 8 attributes each)
3. Dependency Graph
4. Parallelization Strategy (3 phases)
5. Execution Roadmap (calendar)
6. Codex Engagement Plan
7. Risk Mitigation
8. Testing Strategy
9. Definition of Done
10. Success Criteria
11. Deliverables Checklist
12. Stakeholder Questions

---

## NEXT ACTIONS (TODAY)

1. **Stakeholder review** → answer 6 blocking questions
2. **Codex booking** → schedule N-05 (Day 3-4) and N-06 (Day 5-6) sessions
3. **Repo setup** → ensure Playwright + Jest + test dirs exist
4. **Team kickoff** → assign Phase 1 tasks to architects
5. **Go/no-go** → final sign-off before Day 1 development

---

**Prepared by:** Claude Code (Architecture Agent)  
**Review Status:** Ready for stakeholder validation  
**Version:** 1.0
