# _READINESS-A-B.md — Motor FootStock (loop 06-17-motor-footstock-correcoes-variacoes)

Relatorio de prontidao A/B local. Gerado pela Task 022 (finalizacao) em 2026-06-18.

- Workspace: `output/workspace/foot-stock/motor`
- Harness de medicao deterministico: Item 003 (`src/harness/`), seed `1337`, 8.640 ticks/ativo, 2 ativos (URU3=A_TOP, ABT3=B_ILLIQ), book equilibrado.
- Baseline GOLDEN (pre-fix): `src/harness/baseline/golden-baseline.json` (todos os toggles legacy ON, dt=1.0).
- Estado FINAL (pos-fix): caminho default corrigido (toggles legacy OFF), dt default-safe legacy (5/390).

> **Natureza do gate local.** O A/B aqui e DETERMINISTICO e LOCAL: compara o golden pre-fix contra o motor corrigido sobre uma serie semeada num book equilibrado (sem order-flow/Redis/DB). Ele ANTECIPA CA1-CA6, mas NAO substitui o A/B real de staging (24h, order-flow real, >= 2 ativos elegiveis) exigido pelos gates externos antes da promocao a producao (ver `## Gates externos`).

---

## 1. Gates de suite (verdes)

| Gate | Comando | Resultado |
|------|---------|-----------|
| Suite completa do motor | `npm test` | **VERDE** — 57 suites, 552 testes passados |
| Harness vs baseline golden | `npm run ab:local` | **VERDE** — golden regravado byte-a-byte (deterministico, seed 1337) |

O `npm run ab:local` regenera o baseline golden PRE-FIX (referencia do sintoma); a medicao do estado corrigido vem do replay do harness no caminho default, validado pela suite (`src/harness/__tests__/harness.test.ts`).

---

## 2. A/B dos predicados CA1-CA6 locais (final vs baseline)

### URU3 (A_TOP — book estreito, profundo)

| Predicado | Baseline (pre-fix) | Final (pos-fix) | Alvo local | Veredito |
|-----------|--------------------|-----------------|------------|----------|
| CA1 p95 `|ret|` | 2,1509% | 0,0001% | <= 0,35% | PASS |
| CA1 p99 `|ret|` | 2,1509% | 0,0081% | <= 0,50% | PASS |
| CA1 max `|ret|` | 2,357% | 0,1615% | <= 0,35% | PASS |
| CA2 `% > 0,35%` | 100,0% | 0,0% | <= 1,0% | PASS |
| CA3 `% impacto saturado` | 100,0% | 0,0% | <= 0,1% | PASS |
| CA4 ofiState (final) | 0 | 0 | decai a ~0 | PASS |
| CA5 L5 impacto medio-abs | 0 | 0 | +/- 0,05% | PASS |
| CA6 `% mercado morto` | 0,0% | 98,73% | ver nota CA6 | DIVERGENCIA (ver secao 3) |
| MM `% ativo` | 100,0% | 0,0% | cai >= 60% | PASS |
| NaN/Infinity | 0 | 0 | 0 | PASS |

### ABT3 (B_ILLIQ — book largo, raso)

| Predicado | Baseline (pre-fix) | Final (pos-fix) | Alvo local | Veredito |
|-----------|--------------------|-----------------|------------|----------|
| CA1 p95 `|ret|` | 2,306% | 0,0324% | <= 0,35% | PASS |
| CA1 p99 `|ret|` | 2,306% | 0,0343% | <= 0,50% | PASS |
| CA1 max `|ret|` | 2,306% | 0,35% | <= 0,35% | PASS (no limite) |
| CA2 `% > 0,35%` | 89,537% | 0,243% | <= 1,0% | PASS |
| CA3 `% impacto saturado` | 72,95% | 0,0% | <= 0,1% | PASS |
| CA4 ofiState (final) | 0 | 0 | decai a ~0 | PASS |
| CA5 L5 impacto medio-abs | 0 | 0 | +/- 0,05% | PASS |
| CA6 `% mercado morto` | 7,05% | 94,63% | ver nota CA6 | DIVERGENCIA (ver secao 3) |
| MM `% ativo` | 100,0% | 100,0% | mantem em book largo | PASS (liquidez correta) |
| NaN/Infinity | 0 | 0 | 0 | PASS |

### Sintese por criterio (gate local)

- **CA1 (global):** PASS nos dois ativos. Serrilhado ~2%/tick eliminado (p95 cai de ~2,15-2,31% para <= 0,033%).
- **CA2 (Onda 1):** PASS. MarketMaker silencia no book estreito (URU3 100% -> 0%, queda 100% >= 60%) e mantem liquidez no book largo (ABT3 100%). Saturacao zerada.
- **CA3 (Onda 2):** PASS. Impacto de agente nao satura mais o cap (lei sublinear de Kyle); OFI decai a ~0; impacto do L5 em book equilibrado == 0.
- **CA4 (Onda 3):** PASS. DT explicito e auditavel (default-safe legacy 5/390, nao o 1.0 acidental); volatilidade intraday sob o cap de 0,35%/tick.
- **CA5 (Onda 4):** PASS. 0 NaN/Infinity; 0 halts por re-ancora; sem retorno artificial por piso (piso numerico PRICE_EPSILON, nao a ancora R$1).
- **CA6 (regressao operacional):** PARCIAL local — halts indevidos NAO sobem (0 <= baseline+0,2pp), mas `% mercado morto` local e alto (ver secao 3). O criterio real `< 30%` depende de order-flow real e fica nos gates externos.

---

## 3. Divergencias documentadas (com dono)

### D1 — CA6 `% mercado morto` local alto (~95-99%)

- **Observado:** no harness corrigido, URU3=98,73% e ABT3=94,63% de ticks "quase mortos" (variacao `< 0,01%`), bem acima do alvo externo `< 30%`.
- **Causa raiz (esperada, nao e regressao):** o harness roda com **book equilibrado** (`pendingBuy == pendingSell == 0` a cada tick), ou seja, **sem order-flow**. Uma vez que os agentes foram corretamente domados (impacto sublinear, MM so atua onde o spread excede o alvo), o preco sintetico quase nao se move — nao ha fluxo direcional para movimenta-lo. Isso e um artefato do design local, nao do motor.
- **Gate local que o loop PODE checar (e PASSA):** mercado nao 100% congelado (`max |ret| > 0`), e o dt default-safe nao congela mais que o passo unitario (`CA6_default <= CA6_unit + 0,02`). Ambos validados em `harness.test.ts` (describe "Item T3.3").
- **Resolucao real:** o CA6 `< 30%` so e mensuravel com **order-flow real** em staging (A/B real de 24h). 
- **Dono:** operador tecnico (gate externo). Bloqueia promocao a producao ate medido com fluxo real.

### D2 — Timezone `daily_vol:{ticker}:{date}` (UTC vs BRT)

- **Status:** aberto, NAO bloqueia o loop. O loop usa o comportamento documentado e deixa teste de carry-over entre dias para flagrar regressao.
- **Dono:** operador tecnico / infra (gate externo).

Nenhuma `hipotese` aberta que afete runtime ficou sem dono.

---

## 4. PROGRESS / cobertura / regras Zero

- **PROGRESS.md:** 22 itens. Done: 20 `[x]`. Pendentes `[ ]`: Item 001 (preparo) e Item 022 (esta finalizacao). Failed: 0.
  - Item 001 (preparo) tem `execute_completed_at` no `_LOOP-CONFIG.json` (executado em 2026-06-17T21:26:40Z); o `[ ]` no PROGRESS e o estado normal de item de lifecycle preparo (nao recebe `[x]` de iteracao).
  - Item 022 (esta finalizacao) e marcado `[x]` pela fase `[post]` (`/loop:iteraction:review-executed-task`), nao por este comando.
- **Cobertura / ECU / regras Zero:** cada fix (Items 004-020) entrou com teste vermelho-antes/verde-depois + recomputo do CAx local vs golden; suite verde (552 testes). Zero Silencio/Zero Estados Indefinidos preservados nas camadas (caps, halts, finitude testados).

---

## 5. Gates externos (NAO iteraveis pelo /loop)

O loop produz o codigo, os testes e este relatorio. Os gates abaixo sao do operador, antes da promocao a producao:

- [ ] Leitura viva de env/Redis de producao (config real: tick=10s, DT, contagens de agentes).
- [ ] A/B real em staging por onda: >= 24h corridas OU >= 8.640 ticks validos por ativo, >= 2 ativos elegiveis, vs baseline real da producao.
- [ ] CA1-CA6 reconfirmados com order-flow real (em especial **CA6 `< 30%` mercado morto**, ver D1).
- [ ] CA7 (visual) em staging.
- [ ] Resolucao de infra do timezone `daily_vol` (D2).
- [ ] `/delivery:sign-off` final quando CA1-CA7 passarem e T5.2 estiver concluida.
- [ ] Promocao a producao SOMENTE com gate de staging `passou`.

---

## 6. Veredito local

**Suite verde + harness verde + CA1-CA5 locais dentro do alvo nos 2 ativos.** CA6 local diverge por artefato do book equilibrado (D1, dono = operador, gate externo). Nenhuma `hipotese` de runtime sem dono. **A promocao a producao depende dos gates externos acima, nao executados pelo loop.**
