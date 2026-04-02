# Contract Tests — Foot Stock

## O que são testes de contrato?

Testes de contrato verificam as **interfaces entre módulos** do sistema. Diferente de testes unitários (funcionalidades isoladas) ou e2e (fluxos de ponta a ponta), os testes de contrato garantem que:

- **Produtores** publicam dados no formato exato esperado pelos **consumidores**
- **Schemas de banco** não têm conflitos entre os 28+ módulos
- **Enums globais** têm fonte única e não são redefinidos localmente
- **SLAs de frequência** são respeitados (ex.: market:tick a cada ≤2100ms)

Nenhum banco real ou Redis real é necessário — os testes usam mocks isolados.

---

## Contratos implementados

### 1. market:tick (Redis pub/sub)

- **Produtor:** `motor` → publica a cada ~2000ms por ticker ativo
- **Consumidores:** `module-9` (SSE stream), `module-11` (P&L em tempo real)
- **Arquivo de teste:** `tests/contracts/redis/market-tick.contract.test.ts`
- **Formato:** `{ ticker, price, change24h, volume, bid, ask, spread, sentiment, timestamp, halted? }`
- **SLA:** tick a cada ≤2100ms para todos os 40 tickers
- **Status:** [x] implementado

### 2. news:inject (Redis pub/sub)

- **Produtores:** `module-17` (RSS automático), `module-22` (admin inject via POST)
- **Consumidores:** `module-18` (persistência), `motor` (ajuste de precificação)
- **Arquivo de teste:** `tests/contracts/redis/news-inject.contract.test.ts`
- **Formato:** `{ title, ticker?, impactCategory, sentiment: number(-1..1), source, publishedAt }`
- **Enum:** `ImpactCategory` importado exclusivamente do schema Prisma
- **Status:** [x] implementado

### 3. Schema contracts (Prisma DMMF)

- **Arquivo:** `tests/contracts/schema/users.contract.test.ts`
- **Escopo:** Colunas obrigatórias do modelo User, tipos (fsBalance = Decimal), enums (PlanType, AdminRole)
- **Status:** [x] implementado

### 4. Order state machine (Prisma)

- **Arquivo:** `tests/contracts/schema/orders-state-machine.contract.test.ts`
- **Escopo:** Transições válidas/inválidas do `OrderStatus`: `OPEN → FILLED|CANCELLED|EXPIRED|PARTIAL`
- **Status:** [x] implementado

### 5. Transaction atomicity

- **Arquivo:** `tests/contracts/schema/transaction-atomicity.contract.test.ts`
- **Escopo:** `balanceAfter = balanceBefore - (qty × price) - fee`, rollback em falha, taxas por plano
- **Status:** [x] implementado

### 6. Assets write contract

- **Arquivo:** `tests/contracts/schema/assets-write-contract.contract.test.ts`
- **Escopo:** Nenhuma rota `app/api/**/*.ts` escreve `currentPrice` diretamente — apenas o motor via Redis
- **Status:** [x] implementado

### 7. Enum uniqueness contract

- **Arquivo:** `tests/contracts/domain/enum-impact-category.contract.test.ts`
- **Escopo:** `ImpactCategory`, `PlanType`, `NotificationType` — fonte única em `@/lib/enums`, sem redefinições locais
- **Status:** [x] implementado

### 8. Admin audit trail

- **Arquivo:** `tests/contracts/domain/admin-audit-trail.contract.test.ts`
- **Escopo:** Toda ação admin gera registro em `admin_market_actions` com campos obrigatórios; `adminId` nunca null
- **Status:** [x] implementado

### 9. Scoring convergence

- **Arquivo:** `tests/contracts/domain/scoring-convergence.contract.test.ts`
- **Escopo:** 5 pilares (rentabilidade/sofisticação/diversificação/consistência/bonusEducativo), soma ≤100
- **Status:** [x] implementado

### 10. Age verification / ECA Digital

- **Arquivo:** `tests/contracts/domain/age-verification-flagcheck.contract.test.ts`
- **Escopo:** FlagCheck flow (adulto/menor/fallback), CPF nunca plaintext, resposta sem PII além de `isAdult`
- **Status:** [x] implementado

---

## Dependências

| Módulo | Artefato | Usado em |
|--------|----------|---------|
| motor | `market:tick` publisher | Contratos Redis (TASK-1) |
| module-6 | `prisma/schema.prisma` | Contratos de schema (TASK-2) |
| module-7 | tipos MarketTick | contract-test-helpers.ts |
| module-14 | FEE_BY_PLAN, state machine | Contratos de schema (TASK-2) |
| module-17 | `news:inject` publisher | Contratos Redis (TASK-1) |
| module-22/23/24 | audit trail | Contratos domain (TASK-3) |
| module-20 | ScoringEngine | Contratos domain (TASK-3) |
| module-4/13 | FlagCheck / ECA Digital | Contratos domain (TASK-3) |

---

## Como executar

```bash
# Executar todos os contratos
npm run test:contracts

# Com passWithNoTests (antes de TASK-1/2/3 estarem completas)
npm run test:contracts -- --passWithNoTests

# Executar categoria específica
npx jest tests/contracts/redis/ --config tests/contracts/jest.contract.config.ts --verbose
npx jest tests/contracts/schema/ --config tests/contracts/jest.contract.config.ts --verbose
npx jest tests/contracts/domain/ --config tests/contracts/jest.contract.config.ts --verbose

# Com cobertura
npm run test:contracts -- --coverage
```

---

## Como adicionar um novo contrato

1. Criar arquivo em `tests/contracts/{categoria}/{nome}.contract.test.ts`
2. Adicionar entrada neste README com produtor, consumidor, formato e status
3. Importar helpers de `tests/contracts/helpers/contract-test-helpers.ts`
4. Adicionar ao label de categoria na `jest.contract.config.ts` se necessário

---

## Integração CI/CD

A suite de contratos roda automaticamente no job `contract-tests` do GitHub Actions.
Arquivo: `.github/workflows/ci.yml` (job: contract-tests)
Dependência: job `validate` deve passar antes.
Paralelismo: roda em paralelo com os demais jobs de CI.
