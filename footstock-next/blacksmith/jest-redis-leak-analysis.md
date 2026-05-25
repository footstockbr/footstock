# Plano de correcao executavel: leak de open-handle Redis nos testes Jest

## Objetivo

Eliminar o side-effect de import de `redisPublisher` em `src/lib/redis.ts` sem alterar o contrato operacional de producao do Redis.

Correcao aprovada para esta etapa: implementar a Opcao B, isto e, tornar `redisPublisher` lazy. A validacao deve provar que importar `@/lib/redis` ou qualquer service/route que importe `redisPublisher` nao instancia `ioredis` por acidente. `getRedisClient()` continua sendo a funcao que cria o cliente real, e `buildRedisOptions()` deve manter `lazyConnect: false`, `retryStrategy`, `enableReadyCheck` e `maxRetriesPerRequest` como estao.

Fora de escopo nesta etapa, salvo falha nos criterios de aceite: mudar politica de testes para bloquear Redis real em `NODE_ENV === 'test'`, alterar `.env`, remover `next/jest`, trocar `ioredis`, adicionar teardown global como correcao primaria.

## Estado atual verificado

- Arquivo afetado: `src/lib/redis.ts`.
- Linha atual de risco: `export const redisPublisher: Redis = getRedisClient() ?? _noopProxy`.
- Causa-raiz: qualquer import de `redisPublisher` executa `getRedisClient()` durante avaliacao do modulo. Como `next/jest` carrega `.env` e existe `REDIS_URL`, isso pode criar `new Redis(...)` sem uso real de Redis no teste.
- Gatilho reproduzido anteriormente: `tests/integration/billing-audit.test.ts` importa `@/app/api/v1/ai/analyze/route`, que importa `AIAdvisorService`, que importa `redisPublisher`. O request testado retorna antes de usar Redis, portanto o dano observado vem do import ansioso.
- `createSubscriber()` tambem cria `new Redis(redisUrl, buildRedisOptions())`, mas e uma factory explicita. No grep atual nao existe call-site real de `createSubscriber` no codigo de aplicacao. Ha apenas mock em `tests/integration/socketRooms.test.ts`.

## Call-sites reais de `redisPublisher`

Grep usado como base: importacoes reais de `redisPublisher` a partir de `@/lib/redis`, incluindo aliases `redisPublisher as redis`. Mocks de teste nao entram nesta tabela porque nao exercem o export real.

| Arquivo | Binding local | Metodos/propriedades usados |
|---|---:|---|
| `src/app/api/cron/session-transition/route.ts` | `redis` | `get` linha 32, `set` linha 50 |
| `src/app/api/v1/admin/ai-prompt-config/route.ts` | `redis` | `get` linha 102, `setex` linhas 125 e 202, `del` linha 188 |
| `src/app/api/v1/admin/gateways/[code]/route.ts` | `redisPublisher` | `get` linha 10, `set` linha 117 |
| `src/app/api/v1/admin/gateways/config/route.ts` | `redisPublisher` | `get` linha 108, `set` linha 275 |
| `src/app/api/v1/admin/market/route.ts` | `redisPublisher` | `incr` linha 58, `expire` linha 60, `publish` linha 99 |
| `src/app/api/v1/admin/motor/global-halt/route.ts` | `redis` | `set` linha 18, `del` linha 32, `get` linha 46 |
| `src/app/api/v1/admin/motor/halt/[ticker]/route.ts` | `redisPublisher` | `set` linha 55, `publish` linhas 60 e 89, `del` linha 87 |
| `src/app/api/v1/admin/motor/layers/route.ts` | `redis` | `get` linha 97, `set` linha 166 |
| `src/app/api/v1/admin/sponsors/[id]/route.ts` | `redis` | `del` linha 50 |
| `src/app/api/v1/admin/sponsors/route.ts` | `redis` | `del` linha 107 |
| `src/app/api/v1/admin/users/[id]/reset-balance/route.ts` | `redis` | `publish` linha 78 |
| `src/app/api/v1/banners/route.ts` | `redis` | `get` linha 39, `set` linhas 100 e 132 |
| `src/app/api/v1/club/dashboard/history/route.ts` | `redisPublisher` | `get` linha 37, `set` linha 117 |
| `src/app/api/v1/club/metrics/route.ts` | `redisPublisher` | `get` linha 45, `set` linha 210 |
| `src/app/api/v1/positions/short/route.ts` | `redis` | `get` linha 65 |
| `src/app/api/v1/public/banners/route.ts` | `redis` | `get` linha 37, `set` linha 76 |
| `src/app/api/v1/vitals/route.ts` | `redis` | `pipeline` linha 67. No objeto retornado: `incr`, `expire`, `incrbyfloat`, `exec` |
| `src/lib/jobs/nsm-report.ts` | `redisPublisher` | `setex` linhas 68 e 86, `get` linha 72 |
| `src/lib/jobs/order-expiry.ts` | `redis` | `publish` linhas 58 e 76, `incr` linha 95 |
| `src/lib/middleware/checkDailyOrderLimit.ts` | `redis` | `decr` linha 87, `incr` linha 163, `expire` linha 167, `get` linha 193, `set` linha 215 |
| `src/lib/monitoring/health.ts` | `redisPublisher` | `ping` linha 99, `ttl` linha 120 |
| `src/lib/monitoring/nsm.ts` | `redisPublisher` | `get` linhas 88 e 127, `setex` linha 107 |
| `src/lib/services/AIAdvisorService.ts` | `redis` | `get` linhas 133, 246 e 266, `setex` linhas 161 e 385 |
| `src/lib/services/AutoModeration.ts` | `redis` | `get` linha 84, `set` linhas 105 e 145, `incr` linhas 207 e 236, `expire` linhas 208 e 237 |
| `src/lib/services/DividendService.ts` | `redis` | `keys` linha 312, `get` linha 317, `set` linha 342 |
| `src/lib/services/ForumService.ts` | `redis` | `get` linha 63, `setex` linha 71 |
| `src/lib/services/LeverageService.ts` | `redis` | `publish` linhas 196 e 305, `get` linha 238 |
| `src/lib/services/ModerationEngine.ts` | `redis` | `get` linhas 173 e 268, `setex` linhas 199, 282 e 284, `del` linha 220 |
| `src/lib/services/NewsInjectionService.ts` | `redisPublisher` | `publish` linhas 106 e 124 |
| `src/lib/services/OrderService.ts` | `redis` | `get` linhas 139, 207 e 514, `exists` linha 203, `publish` linhas 274, 275, 331, 441 e 442 |
| `src/lib/services/ShortService.ts` | `redis` | `get` linha 207, `publish` linha 246 |
| `src/lib/services/TransactionService.ts` | `redis` | `get` linhas 236, 295 e 310, `publish` linha 255, `setex` linha 335 |
| `src/lib/services/dividends/FinancialPeriodicDividendService.ts` | `redis` | `set` linha 318 |
| `src/lib/services/market-engine.service.ts` | `redisPublisher` | `get` linha 103 |
| `src/services/AliasService.ts` | `redis` | `get` linha 53, `setex` linhas 67 e 78, `del` linhas 142, 159, 171 e 173 |

Inventario agregado que a implementacao lazy deve preservar: `get`, `set`, `setex`, `publish`, `ping`, `ttl`, `incr`, `expire`, `del`, `pipeline`, `decr`, `keys`, `exists`. Para o retorno de `pipeline()`, preservar pelo menos `incr`, `expire`, `incrbyfloat` e `exec`.

Nao foi encontrado uso real de `redisPublisher.status`, `redisPublisher.on(...)`, `redisPublisher.once(...)`, `redisPublisher.disconnect()`, `redisPublisher.quit()`, `instanceof Redis`, spread/enumeracao do objeto, nem leitura direta de propriedade nao-funcao. Portanto, a correcao pode usar `Proxy`, desde que nao transforme `redisPublisher` em `Promise` e que preserve `this` nos metodos reais do `ioredis`.

## Plano tecnico

### 1. Preparacao antes de editar

1. Confirmar que nao ha mudancas locais inesperadas:

```bash
git status --short
```

2. Reexecutar o grep de call-sites se o branch tiver mudado. Se aparecer metodo novo, atualizar a tabela acima antes de implementar:

```bash
grep -RIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=coverage --exclude='*.map' 'redisPublisher' .
```

3. Nao alterar `buildRedisOptions()` nesta correcao. Em especial, nao trocar `lazyConnect: false` por `true`.

### 2. Implementar `redisPublisher` lazy

Substituir somente a forma de exportar `redisPublisher`. `getRedisClient()` continua igual e continua criando `new Redis(redisUrl, buildRedisOptions())` quando chamado.

Implementacao concreta recomendada em `src/lib/redis.ts`:

```ts
type RedisLike = Redis

type NoopPipeline = {
  incr: (..._args: unknown[]) => NoopPipeline
  expire: (..._args: unknown[]) => NoopPipeline
  incrbyfloat: (..._args: unknown[]) => NoopPipeline
  exec: () => Promise<null>
}

const _noopPipeline = new Proxy({} as NoopPipeline, {
  get: (_target, prop) => {
    if (prop === 'then') return undefined
    if (prop === 'exec') return () => Promise.resolve(null)
    return () => _noopPipeline
  },
})

const _noopProxy = new Proxy({} as RedisLike, {
  get: (_target, prop) => {
    if (prop === 'then') return undefined
    if (prop === 'pipeline') return () => _noopPipeline
    return (..._args: unknown[]) => Promise.resolve(null)
  },
})

function resolveRedisPublisher(): RedisLike {
  return getRedisClient() ?? _noopProxy
}

export const redisPublisher: Redis = new Proxy({} as Redis, {
  get: (_target, prop) => {
    if (prop === 'then') return undefined
    if (prop === Symbol.toStringTag) return 'RedisLazyPublisher'

    const client = resolveRedisPublisher()
    const value = Reflect.get(client, prop, client)

    if (typeof value === 'function') {
      return value.bind(client)
    }

    return value
  },
  set: (_target, prop, value) => {
    const client = resolveRedisPublisher()
    return Reflect.set(client, prop, value, client)
  },
})
```

Regras obrigatorias da implementacao:

- `redisPublisher` continua sendo um objeto exportado, nao uma funcao e nao uma `Promise`.
- `redisPublisher.then` deve ser `undefined`, para impedir assimilacao acidental por `await`, `Promise.resolve` ou ferramentas que detectem thenables.
- O trap `get` nao pode chamar `getRedisClient()` para `then` nem para `Symbol.toStringTag`.
- Qualquer metodo real lido do cliente deve ser retornado com `bind(client)`. Isso protege metodos do `ioredis` que dependem de `this`, inclusive `pipeline()`.
- Quando nao houver `REDIS_URL`/`REDIS_CLOUD_URL`, manter fail-open. Os metodos usados pelos call-sites devem retornar `Promise.resolve(null)` e `pipeline()` deve retornar um pipeline no-op com `incr`, `expire`, `incrbyfloat` e `exec`.
- Nao criar singleton separado para o proxy. O singleton real continua sendo `_global._redisClientFN` dentro de `getRedisClient()`.
- Nao adicionar branch `NODE_ENV === 'test'` nesta etapa.

Efeito esperado em producao: o import deixa de abrir Redis sozinho, mas o primeiro acesso real a `redisPublisher.get(...)`, `set(...)`, `publish(...)`, `pipeline()` etc. chama `getRedisClient()` e cria o cliente com `lazyConnect: false`. A politica de conexao, retry e ready-check do `ioredis` permanece a mesma a partir do primeiro uso real.

### 3. Tratar `createSubscriber()`

Nao ha call-site real atual de `createSubscriber()`, entao ele nao e a causa do leak reproduzido. A acao correta nesta etapa e explicitar o contrato e nao mascarar o problema com mudanca de ambiente de teste.

Manter o comportamento de producao:

```ts
export function createSubscriber(): Redis | null {
  const redisUrl = process.env.REDIS_CLOUD_URL || process.env.REDIS_URL
  if (!redisUrl) return null
  return new Redis(redisUrl, buildRedisOptions())
}
```

Contrato obrigatorio para futuros call-sites:

- `createSubscriber()` e uma factory explicita e pode abrir conexao imediatamente porque `lazyConnect: false` deve ser preservado.
- Quem chamar `createSubscriber()` em teste ou producao deve possuir o ciclo de vida da conexao dedicada.
- Todo call-site futuro deve usar `try/finally` e chamar `await subscriber.quit()` quando possivel, com fallback para `subscriber.disconnect()`.
- Se um teste Jest passar a chamar `createSubscriber()` sem teardown, a correcao e adicionar teardown no teste ou no owner da conexao, nao mudar `buildRedisOptions()`.

Exemplo de padrao obrigatorio para futuro uso:

```ts
const subscriber = createSubscriber()
if (!subscriber) return
try {
  // subscribe, on, message handlers
} finally {
  await subscriber.quit().catch(() => subscriber.disconnect())
}
```

Gatilho para revisar `createSubscriber()`: se depois da implementacao lazy os criterios de aceite ainda mostrarem open-handle e o stack/log apontar chamada real de `createSubscriber()`, criar uma tarefa separada para adicionar owner/teardown no call-site identificado. Nao aplicar guard generico por `NODE_ENV === 'test'` sem decisao explicita de politica de testes hermeticos.

### 4. Testes minimos a adicionar ou ajustar

Adicionar cobertura em teste unitario de `src/lib/redis.ts` ou arquivo equivalente, mockando `ioredis`, para travar o contrato lazy.

Casos obrigatorios:

1. Com `REDIS_URL` definida, importar `@/lib/redis` nao chama o construtor mockado de `ioredis`.
2. A primeira chamada `await redisPublisher.get('k')` chama o construtor uma vez e invoca `get` no cliente real com `this` correto.
3. Chamadas seguintes reutilizam o mesmo singleton.
4. `redisPublisher.then` e `undefined` e nao instancia Redis.
5. `redisPublisher.pipeline().incr(...).expire(...).incrbyfloat(...).exec()` funciona com cliente real e preserva o retorno real de `pipeline()`.
6. Sem `REDIS_URL`/`REDIS_CLOUD_URL`, `redisPublisher.get`, `set`, `setex`, `publish`, `ping`, `ttl`, `incr`, `expire`, `del`, `decr`, `keys`, `exists` resolvem `null`, e `pipeline().exec()` resolve `null` sem throw.
7. Importar `createSubscriber` nao instancia Redis. Chamar `createSubscriber()` com URL instancia Redis exatamente uma vez, e o teste deve desconectar/limpar o mock.

## Criterios de aceite

Executar a sequencia abaixo a partir da raiz do repo.

1. Qualidade estatica:

```bash
npm run lint
npm run typecheck
```

Resultado esperado: ambos encerram com exit code 0. Nao pode haver erro de tipo causado pelo `Proxy`, pelo no-op pipeline ou pelo tipo exportado `Redis`.

2. Testes unitarios padrao:

```bash
npm run test:unit
```

Resultado esperado: exit code 0, mesma contagem base desta auditoria, isto e, 14 test suites e 224 testes passados, salvo mudanca intencional de testes registrada no commit. Nao pode aparecer `Jest did not exit one second after the test run has completed` nem aviso equivalente de processo nao encerrado.

3. Testes de integracao padrao:

```bash
npm run test:integration
```

Resultado esperado: exit code 0, mesma contagem base desta auditoria, isto e, 7 suites passadas, 4 skipped, 217 testes passados e 121 skipped, salvo mudanca intencional de testes registrada no commit. Nao pode aparecer `Jest did not exit one second after the test run has completed` nem aviso equivalente de worker/processo nao encerrado.

4. Deteccao de open handles em integracao:

```bash
npx jest tests/integration --runInBand --detectOpenHandles
```

Resultado esperado: exit code 0, mesma contagem de integracao do item anterior, nenhum handle reportado pelo Jest e nenhum aviso de nao encerramento.

5. Deteccao de open handles em unitarios:

```bash
npx jest tests/unit --runInBand --detectOpenHandles
```

Resultado esperado: exit code 0, mesma contagem de unitarios do item 2, nenhum handle reportado pelo Jest e nenhum aviso de nao encerramento.

6. Reproducao focada do gatilho conhecido:

```bash
npx jest tests/integration/billing-audit.test.ts -t "GET /api/v1/ai/analyze" --runInBand --silent
```

Resultado esperado: exit code 0 e ausencia do aviso `Jest did not exit one second after the test run has completed`.

7. Prova negativa de import ansioso, se houver teste novo de contrato:

```bash
npx jest tests/unit --runInBand -t "redisPublisher"
```

Resultado esperado: o teste que importa `@/lib/redis` com `REDIS_URL` definida confirma que o construtor mockado de `ioredis` nao foi chamado ate o primeiro acesso real a metodo.

Se qualquer comando falhar, nao considerar a correcao concluida. Se apenas os comandos sem `--detectOpenHandles` emitirem aviso mas os comandos com `--detectOpenHandles` nao reportarem handles, registrar o comando exato, o arquivo de teste que reproduz e instrumentar construcao de `ioredis` para identificar se houve primeiro uso real de Redis ou chamada de `createSubscriber()`.

## Riscos e falhas previsiveis

1. Proxy sem `bind` quebra metodos do `ioredis`.
   - Sinal: erros internos de `this` indefinido, `pipeline()` quebrado ou comandos que nao chegam ao cliente mockado.
   - Mitigacao: todo valor funcional retornado por `Reflect.get(client, prop, client)` deve ser `value.bind(client)`.

2. `redisPublisher` vira thenable por acidente.
   - Sinal: `await redisPublisher`, `Promise.resolve(redisPublisher)` ou ferramentas de teste ficam pendentes ou executam traps inesperados.
   - Mitigacao: `prop === 'then'` retorna sempre `undefined` sem resolver cliente.

3. No-op incompleto quebra fail-open quando Redis nao esta configurado.
   - Sinal: `redis.pipeline().incr(...)` lanca antes do catch esperado, ou algum metodo agregado da tabela deixa de existir.
   - Mitigacao: no-op deve cobrir todos os metodos agregados e o pipeline minimo usado por `src/app/api/v1/vitals/route.ts`.

4. Mudanca indevida de cold-start em producao.
   - Sinal: alteracao de `buildRedisOptions()`, `lazyConnect: true`, remocao do retry ou branch por `NODE_ENV`.
   - Mitigacao: revisar diff. A unica mudanca aceita nesta etapa e atrasar a chamada a `getRedisClient()` do import para o primeiro acesso real ao publisher. Quando chamado, `getRedisClient()` deve continuar criando Redis com `lazyConnect: false`.

5. Teste continua abrindo Redis porque executa comando real, nao apenas import.
   - Sinal: construtor de `ioredis` e chamado durante teste apos `redisPublisher.get/set/publish/...` real.
   - Mitigacao: isso nao e regressao da Opcao B. Identificar o teste e decidir explicitamente se ele deve mockar Redis, usar infraestrutura Redis real com teardown, ou entrar numa politica separada de testes hermeticos.

6. `createSubscriber()` vira nova fonte de open-handle.
   - Sinal: grep passa a mostrar call-site real ou stack/log mostra construcao por `createSubscriber()`.
   - Mitigacao: adicionar owner de ciclo de vida no call-site com `quit()`/`disconnect()` em `finally`. Nao trocar para `lazyConnect: true` como atalho.

7. Consumidor futuro passa a ler propriedade nao coberta, por exemplo `status`, `on`, `disconnect` ou `quit`.
   - Sinal: novo grep mostra acesso nao listado neste documento.
   - Mitigacao: atualizar a tabela e adicionar teste de contrato antes de aceitar o novo uso. Para metodos reais, o proxy tende a funcionar por `Reflect.get` e `bind`; para propriedades, validar retorno com Redis real e sem URL.

8. Contagem de testes muda durante a correcao por motivo externo.
   - Sinal: comandos passam, mas contagens divergem do baseline.
   - Mitigacao: registrar no commit qual teste foi adicionado/removido. Sem justificativa, tratar como falha de aceite.

## Decisoes pendentes nomeadas

- `D-REDIS-HERMETIC-TESTS`: decidir se o projeto quer politica formal em que Jest padrao nunca fala com Redis real. Se aprovada no futuro, implementar opt-in explicito para Redis real, por exemplo `REDIS_INTEGRATION_REAL=1`, com infraestrutura e teardown. Esta decisao nao faz parte da correcao atual.
- `D-CREATESUBSCRIBER-OWNER`: se surgir call-site real de `createSubscriber()`, definir o owner da conexao dedicada e onde o teardown sera executado.
- `hipotese H-UNIT-IMPORT`: o aviso observado em `npm run test:unit` tambem e causado por import ansioso de `redisPublisher`. Validar pelos criterios de aceite. Se falso, abrir investigacao separada com o primeiro construtor real de `ioredis` instrumentado.
