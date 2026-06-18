# Comparação: Manual do Motor (`motor/` atual) × Motor Legacy (`FootStock.jsx`)

> **Pergunta respondida:** o `MANUAL-DO-MOTOR.md` (que descreve o motor server-side em `motor/`) é semelhante ao motor que vive no código legacy do root (`footstock-web/src/FootStock.jsx`)?
>
> **Resposta curta: SIM — e de forma muito forte.** O motor atual é o **descendente direto** do protótipo legacy. Eles compartilham o mesmo DNA conceitual (as mesmas camadas, na mesma ideia) e a **maioria das constantes numéricas é idêntica**. O que mudou foi a **arquitetura** (de simulação no navegador para motor de servidor) e a **operabilidade** (ganhou um painel de controle que o legacy nunca teve). Em termos de "como o preço se mexe", o manual descreve fielmente a mesma máquina, evoluída.
>
> Esta comparação foi feita eixo a eixo por uma análise multi-agente (18 eixos comparados + verificação adversarial) e revisada contra o código-fonte real dos dois lados. Onde o legacy tem comentários desatualizados (ex.: o cabeçalho diz "circuit breaker ≥ 25%" mas o código dispara em 8%), vale **o que o código faz**, não o comentário.

---

## 1. Veredito por eixo (18 camadas/conceitos)

Legenda: **IGUAL** = idêntico · **QUASE IGUAL** = mesma lógica e mesmos números, detalhe menor difere · **MESMA IDEIA / Nº DIFERENTES** = mesmo conceito, calibração ou forma diferente · **SÓ NO MOTOR** = o manual descreve algo que o legacy não tem · **SÓ NO LEGACY** = o legacy tem algo que o motor não tem.

| # | Eixo | Veredito | Resumo |
|---|------|----------|--------|
| 1 | **Arquitetura / fonte da verdade** | MESMA IDEIA / Nº DIFERENTES | Legacy = simulação 100% client-side no browser (cada usuário roda a sua, reseta no reload); motor = servidor autoritativo (Postgres + Redis + broadcast). **Maior diferença estrutural.** |
| 2 | **Tick / composição** | MESMA IDEIA / Nº DIFERENTES | Ambos batem a 2s. Legacy compõe por **mutação in-place sequencial** (cada camada lê o preço já mexido) e usa `dt=1/390`; motor compõe por **soma de deltas** e usa `dt≈1.0`. |
| 3 | **Ornstein-Uhlenbeck + Âncora (L1+L2)** | QUASE IGUAL | Legacy combina ruído + reversão num só `ouStep`; motor separou em L1 (ruído puro) e L2 (âncora, cap 0,3%). Mesma física, organização diferente. |
| 4 | **GARCH-Lite (L3)** | QUASE IGUAL | **Constantes idênticas:** omega 0.000002, alpha 0.12, beta 0.85, cap de vol 1.8. Fórmula `ω+α·r²+β·v` igual. |
| 5 | **Order Flow Imbalance (L4)** | MESMA IDEIA / Nº DIFERENTES | Decay nos mesmos extremos (0,91 → 0,97). Motor = 5 valores discretos por cluster; legacy = rampa contínua no float (`0.97-0.06·min(1,float/6e6)`). |
| 6 | **Kyle's Lambda (L5)** | MESMA IDEIA / Nº DIFERENTES | Mesma intenção (ordem grande move mais). Legacy `λ=0.15/float` com caps ±0,15%/±0,30%; motor usa λ por cluster (0.0001–0.003) + `volumeRatio` + **viés de compra 1,05–1,08 (só no motor)**. |
| 7 | **Supply Scaling / escassez (L6)** | MESMA IDEIA / Nº DIFERENTES | Mesma fórmula-base (1,0× a 2,0×). **Diferença crítica:** no legacy a escassez é VIVA (multiplica a qty da ordem antes do Kyle); no motor a camada está MORTA (multiplica o `drift`, que está zerado pelo "Fix D"). |
| 8 | **Notícias (L7)** | MESMA IDEIA / Nº DIFERENTES | Constantes iguais: spread 10 ticks, absorção 40 ticks, spot cap 2,5%. Legacy aplica via **interpolação do Fair Value** (`fvShift=IMPACT_MATRIX·sent·0.3`); motor via **fila de delta de preço** (magnitude −1..+1). |
| 9 | **Nudge anti-travamento (L7.5)** | **SÓ NO MOTOR** | 150 ticks sem variar → ±0,01. Não existe no legacy (lá o piso é 0,01 universal). |
| 10 | **Velocity Cap (L8)** | QUASE IGUAL | **Idêntico:** 0,35%/tick (`0.0035`). Motor = por cluster (todos 0,0035) + ajustável no painel; legacy = global fixo. |
| 11 | **Correlação / efeito manada** | MESMA IDEIA / Nº DIFERENTES | **Rho idêntico:** A_TOP 0,35 / A_MID 0,15 / A_SMALL 0,08 / B 0,05; regional 0,10. Diferença: legacy aplica via Cholesky **dentro** do OU (antes do cap); motor aplica **depois** do velocity cap, com teto próprio de 0,07%. |
| 12 | **Freio de Aproximação (L9.5)** | **SÓ NO MOTOR** | 5% → 7% (1% de folga até o CB). Não existe no legacy. |
| 13 | **Meta de Volatilidade do Dia (L9)** | MESMA IDEIA / Nº DIFERENTES | **Meta idêntica: 2,5%/dia.** Legacy = rampa linear desde 0%, piso 10%; motor = 3 regimes (flat até 2,0% → rampa → congela a 2,5%), piso 20%. |
| 14 | **Circuit Breaker (L10)** | QUASE IGUAL | **Gatilho real idêntico: 8%** (legacy `dailyPct>=0.08`, L1136 — o comentário "25%" é STALE). Halt ~5 min em ambos. Motor adiciona **20% sob notícia** e ancora em `closePrice`; legacy só tem 8% e ancora em `openPrice` (intraday). |
| 15 | **Sessões (relógio)** | QUASE IGUAL | **Multiplicadores idênticos:** 1,0 / 0,30 / 0,20 / 0,10 / 0 (fechado). Motor congela via ×0; legacy via early-return. Horários de pregão diferem (legacy roda 11h→00:45). |
| 16 | **Clusters / params por clube** | MESMA IDEIA / Nº DIFERENTES | Os 5 clusters do motor **derivam** dos params por-clube do legacy. Extremos batem na mosca (A_TOP=URU3 0,0018/0,12; B_ILLIQ=CAV4 0,0040/0,25). Mas o motor **achatou** os valores intermediários e recalibrou (ex.: A_SMALL theta 0,08 do motor é menor que qualquer theta do legacy). |
| 17 | **Agentes de liquidez + Market Maker + Margem** | MESMA IDEIA / Nº DIFERENTES | Ambos têm market maker, agentes com momentum/mean-reversion e memória de preço (legacy 15 ticks). Gatilhos e pesos diferem na implementação. |
| 18 | **Sistema de controle de camadas (painel)** | **SÓ NO MOTOR** | Redis `motor:layers:config:v1`, clamps em 16 faixas, ajuste por cluster + global, cache 10s, ações admin (haltAll/injectNews/adjustPrice). **No legacy TUDO é hardcoded no JS — não há Redis, nem painel, nem clamps.** É a maior diferença de operabilidade — e é exatamente o capítulo do manual que não tem paralelo no legacy. |

**Placar:** 0 eixos divergentes de fato. 5 "iguais/quase iguais" (constantes batem), 10 "mesma ideia com calibração/forma diferente", 3 "só no motor" (evoluções). Zero "só no legacy" estrutural — tudo que o legacy faz, o motor faz (igual ou melhor).

---

## 2. O que é IDÊNTICO (constantes que batem na mosca)

Estas constantes são exatamente as mesmas nos dois motores — prova de que um nasceu do outro:

| Constante | Valor (ambos) |
|-----------|---------------|
| GARCH omega / alpha / beta | 0.000002 / 0.12 / 0.85 |
| GARCH cap de volatilidade | 1.8× |
| Velocity cap (limite por tick) | 0,35% (`0.0035`) |
| Meta de volatilidade diária | 2,5% (`0.025`) |
| Reversão fundamental (cap da âncora) | 0,3%/tick (`0.003`) |
| News spot cap | 2,5% (`0.025`) |
| News absorption | 40 ticks |
| News spread (fase forte) | 10 ticks |
| OFI decay (extremos) | 0,91 → 0,97 |
| Correlação rho | A_TOP 0,35 / A_MID 0,15 / A_SMALL 0,08 / B 0,05 |
| Correlação regional | 0,10 |
| Multiplicadores de sessão | 1,0 / 0,30 / 0,20 / 0,10 / 0 |
| Circuit breaker (gatilho real) | 8% |
| Halt duration | ~5 min (300.000 ms) |
| Frequência do tick | 2 s |
| Params do clube topo (A_TOP) | sigma 0,0018 / theta 0,12 (= URU3) |
| Params da raridade (B_ILLIQ) | sigma 0,0040 / theta 0,25 (= CAV4) |

---

## 3. O que MUDOU de verdade (o motor evoluiu)

1. **De navegador para servidor (a mudança mais importante).** O legacy é uma simulação client-side: cada usuário roda a sua própria no browser, e os preços **resetam ao IPO a cada reload** — não há fonte da verdade compartilhada (apesar de um comentário de "invariante de supply" sugerir o contrário). O motor é um **serviço de servidor autoritativo**: um único preço por clube, persistido em Postgres, distribuído via Redis, igual para todos. Isto é o que torna o produto um "mercado real" em vez de um demo.

2. **Ruído e âncora separados.** O legacy junta mean-reversion + ruído num único passo (`ouStep`); o motor separou em L1 (ruído puro) e L2 (âncora), o que dá controle independente sobre "nervosismo" e "força do ímã". O manual documenta essa separação.

3. **Ganhou um painel de controle.** Toda a Parte 6 do manual (Redis, clamps, ajuste por cluster, multiplicadores de sessão) **não existe no legacy**. No legacy, mudar qualquer parâmetro exige editar o JavaScript e fazer deploy. No motor, o admin ajusta em tempo real (com travas de segurança).

4. **Camadas de segurança novas:** o **Nudge** (L7.5, anti-travamento) e o **Freio de Aproximação** (L9.5, evita o disjuntor em loop) são exclusivos do motor.

5. **Circuit breaker mais esperto:** o motor relaxa o gatilho para 20% durante notícias (para a curva de absorção não ser cortada) e ancora no fechamento do dia; o legacy só tem o gatilho fixo de 8% sobre o preço de abertura.

6. **Viés de compra no Kyle (1,05–1,08):** o motor embute uma leve tendência de alta no impacto de ordens grandes; o legacy é simétrico.

7. **`dt` do passo:** o legacy usa `dt=1/390` (fração do pregão); o motor usa `dt≈1.0`. Isso muda a escala do `√dt` no ruído — mas como o motor recalibra sigma/cap em cima disso, o comportamento visível foi mantido.

---

## 4. O que o LEGACY tem e o motor mudou de lugar/desligou

- **Supply scaling vivo:** no legacy a escassez realmente amplifica o impacto das ordens (multiplica a quantidade antes do Kyle). No motor, a camada equivalente (L6) está **morta** porque amplifica o `drift`, que foi zerado ("Fix D"). Ou seja: um mecanismo que funcionava no protótipo está hibernando no motor — coerente com o aviso da §9 do manual.
- **Notícia via Fair Value:** o legacy move o preço por notícia interpolando o FV alvo ao longo de 40 ticks (descoberta de preço gradual e suave). O motor empurra o preço direto por uma fila de delta. Resultado parecido (notícia digerida em ~80s), caminho diferente.
- **3º relógio:** o legacy tem um timer de notícias próprio a cada 8s (além do tick de 2s e do watcher de sessão de 15s). No motor a injeção de notícia é orquestrada de outro jeito (cron + admin).
- **Âncora do disjuntor:** legacy mede o afastamento contra o **preço de abertura** do dia; motor mede contra o **fechamento** — diferença sutil mas real no que conta como "8% do dia".

---

## 5. Pequenos ajustes de precisão no manual (opcionais)

A comparação revelou pontos onde o manual descrevia o **default de código**, enquanto produção roda valores diferentes (via env/Redis). Status:

- **Intervalo do tick — RESOLVIDO.** O manual dizia "2 segundos" (default de `MarketEngine.ts`); produção roda **10s** (`MOTOR_TICK_INTERVAL_MS=10000`, decisão estratégica de custo — ver §6.1). O `MANUAL-DO-MOTOR.md` já foi corrigido para 10s, com recálculo de todas as conversões "ticks → minutos".
- **Velocity cap — CONFIRMADO (0,35%), sem ação.** Verificado no Redis/env de produção (§7): não há override, então o `maxTickChange` vivo é **0,35%** — exatamente o que o manual já diz. A suposição de 2,5% foi **refutada pela leitura do ambiente vivo**. Nenhuma mudança necessária no manual.
- **Calibração dos clusters — DOCUMENTADO.** A "escada" de clusters tem os extremos idênticos ao legacy (A_TOP=URU3, B_ILLIQ=CAV4) e o meio recalibrado via INTAKE canônico. O caso do **theta do A_SMALL (0,08)** — fora da escada e sem decisão registrada — já está detalhado em §5.2.1 e §9 do manual e na §6.4 desta comparação. **Ação:** confirmar a intenção com quem definiu o INTAKE.

---

## 6. Por que essas diferenças existem (motivos e rastreabilidade)

A boa notícia: **quase nenhuma dessas diferenças é "drift" acidental.** Elas foram estudadas, decididas e registradas em três artefatos formais que ainda existem no repositório:

1. **O estudo comparativo `--deep`** `forged-goods/research/foot-stock-motor-legacy-vs-deployed.md` (2026-05-14) — comparou os dois motores item a item em 13 categorias (A a M), com evidência primária em `.claude/study/foot-stock-motor-legacy-vs-deployed/`.
2. **O plano de reconciliação** `blacksmith/foot-stock-motor-action-plan.md` — transformou o estudo em **12 decisões formais** tomadas via `/skill:auq-interview` em 4 rodadas (2026-05-14), declaradas **imutáveis**, mais **3 divergências arquivadas** como tech-debt aceito.
3. **Os ADRs do motor** `motor/ARCHITECTURE-DECISIONS.md` — ADR-001 (leader election), ADR-002 (SSE, com revisão de custo), ADR-003 (circuit breaker 8%), ADR-004 (long leverage 2x).

Ou seja: as divergências que a §1 lista mapeiam quase 1 para 1 contra uma decisão documentada. Os motivos se agrupam em **seis famílias**:

### 6.1 — Redução de custo de backend (tech-debt conscientemente aceito)

O plano de reconciliação (2026-05-14) registrou **três divergências** mudadas "para reduzir custo de backend que estava insustentável" (Anthropic + Redis + compute), arquivadas como decisão fechada. **Mas a verificação no ambiente vivo (ver §7, em 2026-06-17) mostra que apenas UMA dessas três continua ativa hoje:**

| Mudança | Legacy / código | Registrado (mai/2026) | Vivo hoje (verificado) | Mecanismo |
|---------|-----------------|------------------------|------------------------|-----------|
| **Intervalo do tick** | 2s | 10s | **10s ✅ ATIVO** | env `MOTOR_TICK_INTERVAL_MS=10000` |
| **Velocity cap (L8)** | 0,35% (`0.0035`) | 2,5% (`0.025`) | **0,35% — NÃO 2,5%** | sem override (Redis ausente, sem env) |
| **Momentum threshold** | 0,5% (`0.005`) | 2% (`0.02`) | constante de código | hardcoded (não env, não Redis) |

A intenção de maio era um conjunto coerente (tick mais lento + cap maior + menos ordens), mas **na prática só o tick de 10s persistiu**. O velocity cap vivo é **0,35%** — o default de código, sem nenhum override (a chave Redis `motor:layers:config:v1` nem existe; ver §7). Efeito colateral analítico: com o tick 5× mais lento e o **mesmo** cap por tick, a volatilidade-máxima-por-minuto de produção ficou **~5× menor** que a da spec legacy. A migração do SSE Vercel→Railway (ADR-002 rev2) e o classificador Sonnet 4.5 (J3, "~75× mais barato") seguem como economia de custo de outra natureza.

> ✅ **Correção (verificado no vivo).** Versões anteriores desta comparação supuseram que produção rodava velocity cap 2,5%. **Isso NÃO se confirma.** O `maxTickChange` vivo é **0,35%**, idêntico ao default de código e ao que o `MANUAL-DO-MOTOR.md` já documenta — o manual está correto nesse ponto. Detalhe da verificação em §7.

### 6.2 — Tech feasibility / arquitetura (o legacy rodava no navegador)

A maior diferença — de simulação client-side para servidor autoritativo — **não foi escolha estética, foi necessidade técnica**. O legacy rodava 100% no browser, então "nem cogitou" concerns de servidor. Ao migrar para um serviço real, vieram obrigatoriamente:

- **Leader election via Redis SETNX** (ADR-001) — para múltiplas instâncias não calcularem preços em paralelo.
- **SSE em vez de WebSocket** (ADR-002) — porque o Next.js no Vercel é serverless e WebSocket exige conexão persistente bidirecional, incompatível.
- **Scheduler com cron, persistência (Postgres/Redis), heartbeat, JWT/CORS, fuso DST-aware** (categorias F6 e M do estudo) — todos "puramente operacionais", sem espelho no legacy.

A separação do Ornstein-Uhlenbeck em L1 (ruído) + L2 (âncora) e a fila de notícias via pub/sub Redis também são parte desse refactor em arquitetura de camadas (L1..L10).

### 6.3 — Correção de bug (não é design, é conserto)

- **Supply scaling morto (drift = 0):** o comentário no código é explícito — `Fix D: drift estrutural removido — pressão vendedora permanente causava sangria contínua`. Era um bug (o drift empurrava os preços para baixo continuamente); a correção foi zerá-lo, o que de quebra desligou o efeito da camada L6.
- **Circuit breaker "25%":** o comentário do legacy dizia 25%, mas o código sempre foi 8%. A decisão B3 foi **manter 8% + corrigir o comentário** — classificado explicitamente como "doc legacy errado", não decisão de design. (Coerência com o velocity cap de 2,5%: 8% equivale a ~3 ticks no cap máximo.)

### 6.4 — Spec "INTAKE canônico" (calibração formal dos clusters)

Os parâmetros dos clusters (sigma, theta, GARCH alpha/beta, decay, maxTickChange) carregam no código a anotação **`// INTAKE canônico`** — ou seja, vêm de uma especificação de intake formal, não foram inventados. Os endpoints batem com os clubes legacy de referência (A_TOP=URU3, B_ILLIQ=CAV4) porque o INTAKE foi calibrado a partir deles.

> **A única exceção sem motivo registrado: o theta do A_SMALL (0,08).** Ele é o **único dos 5 thetas que NÃO tem o comentário `// INTAKE canônico`** no código, está fora da escada monotônica e abaixo de todo o range do legacy (mínimo 0,10). Nenhuma das 12 decisões, nenhum ADR e nenhuma linha do estudo cobre esse valor. Conclusão honesta: **não há "porquê" documentado para o theta do A_SMALL** — é o candidato mais provável a desvio não-intencional da spec. Recomendação: confirmar com quem definiu o INTAKE.

### 6.5 — Evolução de produto (features novas, decididas formalmente)

Coisas que o legacy não tinha e foram adicionadas como produto, cada uma com decisão registrada:

| Feature | Por quê | Decisão |
|---------|---------|---------|
| **Long leverage 2x (só LENDA)** | Diferencial do tier premium + receita de juros; posições já abertas em prod inviabilizam reverter | ADR-004 (H6/H7) |
| **Delay por plano (1h/30min/0)** | Pilar de monetização ("mainstream da indústria") | decisão I1-I3 |
| **STOP_LOSS / TAKE_PROFIT** | Restritos a LENDA, para honrar a regra original do cliente (OCO era LENDA-only no legacy) | decisão G5/G6 |

### 6.6 — Refactor de operabilidade + safety nets

- **Sistema de controle de camadas (painel Redis):** existe para o admin poder calibrar em tempo real o que no legacy exigia editar JS e fazer deploy. É a maior diferença de operabilidade — e o capítulo do manual sem paralelo no legacy.
- **Modelo de agentes (probabilístico → contagem fixa por cluster, reduzida ~50%):** decisão D1-D6, com o objetivo declarado de **"aproximar a frequência de ordens ao que o legacy produzia"** (exigiu A/B em staging).
- **Meta de volatilidade diária em 3 regimes** (em vez da rampa linear do legacy): decisão B6, "mais granular no deployado; aceitar".
- **Safety nets que o legacy não tinha:** cap de correlação 0,07% (B8/E6, "safety extra"), `MAX_AGGREGATE_IMPACT` 2% dos agentes (C12), piso de preço, thresholds de margin call. O **Freio de Aproximação (L9.5)** entra aqui — proteção contra o circuit breaker disparar em loop.
- **Nudge (L7.5):** caso especial — não é invenção do motor nem do legacy "antigo". O cliente o adicionou na versão `legacy-new2.jsx` (150 ticks sem variar → micro-choque), e a decisão I7 foi **implementá-lo para "honrar a intenção declarada do cliente"**. O comentário em `nudge-constants.ts` confirma: "±0.01 (porte do legacy FootStock-new2.jsx)".

### 6.7 — Resumo dos motivos por eixo

| Diferença (§1) | Família do motivo | Rastreabilidade |
|----------------|-------------------|-----------------|
| Arquitetura client→server | Tech feasibility | ADR-001, ADR-002 |
| Tick 2s→10s | **Custo** (arquivado) | study A2 / action-plan |
| Velocity cap 0,35%→2,5% (prod) | **Custo** (arquivado) | study B5 / action-plan |
| OU dividido em L1+L2 | Refactor de arquitetura | study (camadas L1..L10) |
| GARCH idêntico | INTAKE canônico (preservado) | clusters.ts / study C1-C4 |
| OFI float→cluster discreto | Refactor de operabilidade | clusters.ts |
| Kyle + viés de compra | Refactor + INTAKE | study B7 |
| Supply scaling morto | **Bug fix** (Fix D) | comentário clusters.ts |
| Notícias RSS + Sonnet 4.5 | Custo + tech feasibility | study J1-J4 |
| Nudge (L7.5) | Honra intenção do cliente | decisão I7 |
| Correlação após cap + cap 0,07% | Safety net | study B8/E6 |
| ApproachBrake (L9.5) | Safety net | motor-only |
| Daily vol 3 regimes | Refactor (granularidade) | decisão B6 |
| CB 8% + news-20% + closePrice | Preservado + bug doc (25%→8%) | ADR-003 / B3 |
| Sessões (x0 vs early-return, DST) | Preservado + tech feasibility | study F1-F6 |
| Clusters 38→5 | INTAKE canônico | clusters.ts |
| **theta A_SMALL 0,08** | **SEM motivo registrado** (possível desvio) | nenhuma fonte |
| Agentes probabilístico→contagem (−50%) | Refactor + calibração | decisão D1-D6 |
| Sistema de controle (painel) | Operabilidade | motor-only |
| Leverage/delay/stop-take | Evolução de produto | ADR-004, I1-I3, G5/G6 |

---

## 7. O que está REALMENTE implementado em produção (verificação no vivo — 2026-06-17)

As seções anteriores descrevem sobretudo o **código** (defaults de `clusters.ts` + constantes das camadas). Para saber o que de fato roda, conectei ao ambiente de produção no Railway (Redis e env do serviço `motor`) em 2026-06-17, leitura read-only.

### 7.1 — O painel de controle de camadas está VAZIO em produção

A chave Redis `motor:layers:config:v1` — a fonte do "painel de controle" descrito no manual — **não existe** em produção:

- `DBSIZE` = **254** chaves (o Redis está vivo e o motor o usa: `motor:status`, `motor:leader`, `motor:heartbeat`, `motor:last_tick`, `motor:fencing-token`, `motor:metrics:*` todas presentes).
- `EXISTS motor:layers:config:v1` = **0**. Nenhuma chave casando `*config*` ou `*layers*`.

**Consequência — o achado mais importante deste documento:** como a chave não existe, o motor cai em `defaultRuntimeConfig()` e **TODOS os parâmetros de camada rodam no default de código** (`clusters.ts` + constantes). O painel existe, está pronto, mas **nunca foi populado**. Na prática, hoje, **os valores que o manual documenta como "default" SÃO os valores vivos**: sigma 0,0018–0,0040, theta 0,12/0,18/**0,08**/0,23/0,25, GARCH 0,000002/0,12/0,85/cap 1,8, ofiDecay 0,91–0,97, circuit breaker 8%, **velocity cap 0,35%**, etc. Para o operador: ajustar o mercado hoje exige **primeiro criar** a config no Redis — não há nada para "editar" ainda, e qualquer parâmetro sem override roda no default.

### 7.2 — Os únicos overrides de produção vêm de variáveis de ambiente

Lendo o env do serviço `motor`:

| Variável | Valor vivo | Efeito |
|----------|-----------|--------|
| `MOTOR_TICK_INTERVAL_MS` | **10000** | Tick de **10s** (o código tem fallback 2000; produção seta 10000 explicitamente). Confirma a decisão estratégica. |
| `MOTOR_TICK_DT_SECONDS` | *(unset)* | `dt = 1.0` no OU e na âncora (L1/L2). |
| `MOTOR_SCHEDULER_ENABLED` | **true** | O scheduler do próprio motor está **ON** (o plano de maio o tinha OFF; a migração de jobs M6 já ocorreu). |
| `ORDER_FLOW_SNAPSHOT_ENABLED` | *(unset)* | Order flow **ligado** (default) — o comportamento dos usuários influencia o preço. |

Não existe `VELOCITY_CAP` nem `MOMENTUM_THRESH` como variável de ambiente no código do motor — só `MOTOR_TICK_INTERVAL_MS` e `MOTOR_TICK_DT_SECONDS`. Logo, **não há override possível por env para o velocity cap**: ele vale 0,35% (default de código).

### 7.3 — Reconciliação com o registro de maio de 2026

| Item | Registro mai/2026 | Vivo (jun/2026) | Veredito |
|------|-------------------|------------------|----------|
| Tick | 10s | **10s** | ✅ Persistiu (via env) |
| Velocity cap | 2,5% | **0,35%** | ❌ NÃO persistiu — está no default de código |
| Scheduler do motor | OFF (crons no Vercel) | **ON** | Mudou desde maio (migração concluída) |

A divergência de velocity cap (0,35%→2,5%) listada em maio como "tech-debt arquivado" **não está ativa hoje**. Hipótese: foi revertida no código (`clusters.ts` atual tem 0,0035) e nunca reaplicada via Redis. Isso reforça uma observação de comportamento: com o tick 5× mais lento (10s) **e sem** o cap maior, a volatilidade máxima por minuto de produção é hoje menor do que tanto o legacy quanto o plano de maio previam.

> **Método (auditável, sem escrita):** conexão ao Redis de produção pelo proxy TCP público do Railway (`railway run --service redis`, autenticação via `REDIS_URL`), comandos read-only `EXISTS`/`GET`/`DBSIZE`/`--scan`. Env do serviço `motor` via `railway run --service motor`. Nenhuma escrita executada; nenhuma credencial exposta no processo.

---

## 8. Conclusão

O manual descreve **o mesmo motor** que está no código legacy, em uma versão amadurecida. Se você ler o manual e depois olhar o `FootStock.jsx`, vai reconhecer cada camada: Ornstein-Uhlenbeck, GARCH-Lite, Order Flow, Kyle's Lambda, escassez, notícias, velocity cap, meta diária, correlação, disjuntor, sessões, agentes de liquidez — com praticamente os mesmos números. As diferenças não são de "como o preço se mexe" (isso é quase idêntico), e sim de **onde o motor roda** (servidor vs navegador) e de **quanto controle você tem sobre ele** (painel Redis vs código hardcoded). O manual é, portanto, uma descrição fiel — e o legacy serve como a "prova de origem" de quase todas as constantes que o manual documenta.

> ⚠️ **Ressalva importante (a queixa do cliente sobre variações bizarras).** "Como o preço se mexe" é quase idêntico **no nível das constantes** (mesma sigma/theta/GARCH/caps), mas o **comportamento dinâmico vivo NÃO é equilibrado como o legacy** — por dois bugs independentes introduzidos na migração navegador→servidor. **Causa dominante:** os agentes de liquidez (sobretudo o Market Maker) **cravam ±2% por tick o dia inteiro**, por fora da trava de velocidade e do circuit breaker (o MM dispara todo tick por um erro de unidade no spread, e seu impacto satura o cap de ±2%). **Causa secundária:** o ruído (L1/L3) está ~50–65× forte demais por má-recalibração do `dt` (1/390→1.0), mas a meta diária (L9) o congela após ~90s, então ele só explica o "surto de abertura". Simulação do pipeline completo: **100% dos ticks movem ~2% hoje**; corrigir só o ruído **não muda nada** (continua 2%/tick); corrigir os agentes resolve ~99%. **Diagnóstico completo, com causa-raiz, correções priorizadas e projeção de impacto, em [`DIAGNOSTICO-VARIACOES-vs-LEGACY.md`](DIAGNOSTICO-VARIACOES-vs-LEGACY.md).**

---

## 9. Pós-correções: o motor reaproximou do legacy (medição local, 2026-06-18)

> **Nota de escopo (numbers são do harness LOCAL).** Esta seção fecha a ressalva da §8 (o comportamento dinâmico vivo divergia do legacy). As correções foram aplicadas pelo loop `06-17-motor-footstock-correcoes-variacoes` (itens 002..020) e medidas pelo harness determinístico `src/harness/runHarness.ts` (Item 003) — seed `1337`, 8640 ticks/ativo, book equilibrado, sem DB/Redis/order-flow/notícias/correlação. **Execução usada como insumo: 2026-06-18.** Os números abaixo são do harness local; a confirmação de paridade com o legacy em produção depende dos gates externos (§9.3).

### 9.1 — As correções aplicadas (itens 002..020)

A causa dominante e a secundária da ressalva da §8 foram corrigidas. Mapeamento por item:

- **Causa dominante (agentes cravando ±2%/tick):** Item 004 (T1.1, unidade do spread do Market Maker), Item 006 (T1.3, impacto linear saturante → lei de Kyle sublinear), Item 007 (T1.4, impacto dos agentes passa a respeitar a trava de velocidade e o CB), Itens 008/009 (T2.1/T2.2, desacoplar `quantity`/`state.volume`, quebrando o feedback loop).
- **Causa secundária (ruído L1/L3 ~50–65× por `dt` mal-recalibrado):** Itens 013/014/015 (T3.2/T3.3/T3.4, `lastReturn` por tick + `√dt`, restaurar a escala temporal, validar `MOTOR_TICK_DT_SECONDS`).
- **Suporte:** 005 (gating por sessão), 010/011 (L4 decai sem ordens, L5 fluxo líquido), 012 (correlação por delta), 016 (escalar camadas por `volatilityMultiplier`), 017 (não reancorar `closePrice`), 018 (hidratação Redis), 019 (nudge por tolerância percentual), 020 (piso de preço sem distorcer retorno). Itens 002 (instrumentação) e 003 (harness/baseline) montaram a base de medição.

### 9.2 — Predicados CA recalculados (pré-fix golden × pós-fix 2026-06-18)

Mesma série de 8640 ticks/ativo do harness. "Pré-fix" reproduz o estado vivo descrito na §8 (serrilhado ~2%/tick).

| Predicado | URU3 (A_TOP) pré | URU3 pós | ABT3 (B_ILLIQ) pré | ABT3 pós |
|-----------|------------------|----------|--------------------|----------|
| CA1 `p95` de `|ret|` | 2,151% | 0,0006% | 2,306% | 0,040% |
| CA1 `max` de `|ret|` | 2,357% | **0,350%** | 2,306% | **0,350%** |
| CA2 (% ticks > 0,35%) | 100% | 0,012% | 89,54% | 0,43% |
| CA3 (% impacto agente saturado) | 100% | **0%** | 72,95% | **0%** |
| `MM_pctActive` | 100% | **0%** | 100% | 100% |

O serrilhado de ~2%/tick — a queixa do cliente — desapareceu na medição local: a trava de velocidade de 0,35% volta a ser o teto efetivo (CA1 `max` = 0,35% nos dois ativos), os agentes não saturam mais o cap (CA3 0%), e o Market Maker para de cravar o cap em book estreito (`MM_pctActive` 0% no A_TOP). Isso reaproxima o comportamento dinâmico do equilíbrio do legacy, exatamente como a §8 previa ("corrigir os agentes resolve ~99%"). A tabela completa (CA1 `p50`/`p99`, CA4/CA5/CA6) está em [`DIAGNOSTICO-VARIACOES-vs-LEGACY.md`](DIAGNOSTICO-VARIACOES-vs-LEGACY.md) §7.2.

### 9.3 — `hipotese`/decisões pendentes e gates externos

- `hipotese`: o predicado CA6 ("mercado morto") sobe para ~98% no harness — artefato do book equilibrado sem order-flow/notícias, **não** projeção de produção. Ver `DIAGNOSTICO` §7.3 para o tratamento das três decisões pendentes (CA6, distribuição de `MM_pctActive`, velocity cap 0,35% como teto de produto).
- A divergência viva da §7.3 (velocity cap registro-de-maio 2,5% × código vivo 0,35%) **permanece** e é hoje o teto que a medição local confirma: CA1 `max` = 0,35%. Ratificar como decisão de produto.
- **Confirmação final depende dos gates externos:** `typecheck`/Jest do motor, A/B em staging (24–48h, decisões D1–D6 do plano de reconciliação) e verificação read-only de produção no Railway. Até lá, os números desta seção são medição local, não paridade garantida em produção.

---

*Comparação gerada por análise multi-agente (18 eixos, extração + comparação + verificação adversarial) sobre `motor/src/**` e `footstock-web/src/FootStock.jsx` (linhas 415–1200). 8 dos 18 vereditos tiveram a verificação adversarial concluída manualmente contra o código (limite semanal de tokens interrompeu esses subagentes); todos os 18 vereditos se sustentam. Fonte da verdade: o código, não os comentários (vários comentários do legacy estão desatualizados, notavelmente o "circuit breaker 25%" que na prática é 8%).*

*A §6 (motivos e rastreabilidade) foi construída a partir das fontes de decisão oficiais do projeto: o estudo `--deep` `forged-goods/research/foot-stock-motor-legacy-vs-deployed.md` (2026-05-14, 13 categorias A–M); o plano de reconciliação `blacksmith/foot-stock-motor-action-plan.md` (12 decisões via `/skill:auq-interview` + 3 divergências de custo arquivadas); os ADRs em `motor/ARCHITECTURE-DECISIONS.md` (ADR-001 a 004); e os marcadores de decisão no próprio código (`// INTAKE canônico`, `// Fix D: drift estrutural removido`, `nudge-constants.ts`). Único ponto sem motivo documentado em nenhuma dessas fontes: o `theta` do cluster A_SMALL (0,08).*

*A §7 (o que está realmente implementado) foi verificada por leitura read-only do ambiente de produção no Railway em 2026-06-17 — Redis (`EXISTS`/`GET`/`DBSIZE`/`--scan` sobre `motor:layers:config:v1` e `motor:*`) e variáveis de ambiente do serviço `motor`. Achado central: o painel de controle de camadas (`motor:layers:config:v1`) não existe em produção, então todos os parâmetros rodam no default de código; o único override vivo é o tick de 10s via `MOTOR_TICK_INTERVAL_MS`. O velocity cap vivo é 0,35% (a divergência de 2,5% do registro de maio não está ativa).*
