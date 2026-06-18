# Diagnóstico: por que as variações do motor implantado estão "bizarras" e como reaproximar do legacy

> **Queixa do cliente:** o motor implantado oscila de forma divergente e ocasionalmente bizarra; o legacy entregava um resultado muito mais equilibrado e satisfatório.
>
> **Veredito:** a queixa é **procedente e tem causa-raiz precisa e mecânica.** São **DOIS problemas independentes** introduzidos ao portar a simulação do navegador (legacy) para o serviço de servidor (motor):
>
> 1. **Os agentes de liquidez (sobretudo o Market Maker) cravam ±2% por tick, o dia inteiro** — por fora da trava de velocidade **e** por fora do circuit breaker. **Esta é a causa dominante.**
> 2. **O ruído (L1/L3) está ~50–65× forte demais** por uma má-recalibração de escala de tempo (`dt`) — mas a meta diária (L9) o **congela após ~90s** de cada sessão, então ele explica o "surto violento na abertura", não o dia todo.
>
> Tudo abaixo vem da leitura do código real (`AgentOrchestrator.ts`, `MarketMakerAgent.ts`, `BaseAgent.ts`, `L1_OrnsteinUhlenbeck.ts`, `L3_GARCHLite.ts`, `L9_DailyVolTarget.ts`, `PriceCalculator.ts`, `MarketEngine.ts`), do estado vivo de produção (ver §7 da comparação) e de uma simulação Monte Carlo do **pipeline completo** (ruído + L9 freeze + trava + agentes). Números relativos são robustos; absolutos são estimativas (não um backtest do motor inteiro com order flow real e notícias).

---

## Sumário executivo (a simulação que prova a prioridade)

Simulação do pipeline completo de um ativo A_TOP por ~3,3h de pregão (1200 ticks de 10s):

| Cenário | Movimento/tick (mediana) | % de ticks > 0,35% | Impacto de agente (mediana) | Veredito |
|---------|--------------------------|---------------------|------------------------------|----------|
| **IMPLANTADO HOJE** | **2,15%** | **100%** | **2,00% (no cap)** | bizarro |
| Só corrigir o ruído (dt+L3) | 2,00% | **100%** | 2,00% | **não muda nada** |
| Só corrigir os agentes | 0,00% | 0,1% | ~0% | quase resolvido |
| **Corrigir ruído + agentes** | **0,00%** | **0,0%** | ~0% | calmo (legacy-like) |

**A leitura crítica:** corrigir só o ruído **deixa o problema de pé** (continua 2%/tick, 100% dos ticks no limite), porque os agentes seguem cravando ±2%. **Corrigir os agentes resolve quase tudo sozinho.** Logo, a prioridade é **agentes primeiro**, ruído depois.

---

## 1. Como EXATAMENTE está tendo todas estas diferenças

### 1A. Causa dominante — os agentes de liquidez cravam ±2%/tick, o dia inteiro

O motor tem 6 tipos de "robô-trader" (Market Maker, Value, Momentum, Contrarian, Random, Panic). A cada tick, cada um decide BUY/SELL/HOLD com um `priceModifier` e uma `quantity`; o orquestrador soma `sign × |priceModifier| × quantity` e aplica como **movimento direto de preço**, limitado a ±2% (`AgentOrchestrator.ts:34,175-196`). Há **três bugs** que se combinam:

**Bug 3.1 — o Market Maker dispara em TODOS os ticks (erro de unidade).** Ele só deveria agir quando o spread está largo: `if (ctx.spread < TARGET_SPREAD) HOLD` com `TARGET_SPREAD = 0.001` (`MarketMakerAgent.ts:19-21`). Mas `ctx.spread` chega como **valor absoluto** (`newPrice × 0.002`, em `MarketEngine.ts`), enquanto `TARGET_SPREAD` é uma **fração** (0,1%). Para um preço de R$100, `ctx.spread = 0,20`, e `0,20 < 0,001` é sempre falso → **o MM nunca segura, dispara sempre**, alternando BUY/SELL a cada tick (`lastSide` inverte).

**Bug 3.2 — o impacto do MM satura o teto de ±2%.** O impacto do MM é `±0.001 × quantity`, com `quantity = min(5000, floor(volume24h × 0.001))` (`MarketMakerAgent.ts:33-34`). Para um A_TOP (volume ~50.000), `quantity ≈ 50` → impacto `0.001 × 50 = 0.05 = 5%` → **estoura o cap de ±2%**. Como o MM alterna o lado a cada tick, o impacto agregado vira **+2%, −2%, +2%, −2%…** — um **serrilhado de 2% a cada 10 segundos**. (O `priceModifier` deveria ser o impacto por unidade e `quantity` o tamanho; multiplicar os dois e tratar como fração de preço é um erro de categoria que satura o cap trivialmente. O legacy fazia impacto **sublinear via Kyle's Lambda**, por ordem e raramente.)

**Bug 3.3 — os agentes passam por fora da trava de velocidade E do circuit breaker.** O impacto dos agentes é aplicado **depois** do `PriceCalculator`, em `MarketEngine.ts:456-459`: `finalPrice = max(1, newPrice × (1 + agentImpact))`. A trava de 0,35% (L8) só limita a soma L1–L7.5 **dentro** do `PriceCalculator`; e o circuit breaker (L10) checa o `candidatePrice` **antes** dos agentes (`PriceCalculator.ts:169-175`). Então o serrilhado de ±2% dos agentes **não é contido por nenhuma proteção** e nem dispara halt.

**Agravante — a "redução de agentes" (decisão D1-D6) é no-op.** A matriz de contagens (`AgentOrchestrator.ts:56-71`, V1=54 / V2=28 agentes) é passada como `weight` ao construtor, mas `weight` é `readonly` e **nunca é usado** em nenhum `decide()` nem no `aggregateImpact` (`BaseAgent.ts:33`). Cada cluster instancia **um agente por tipo** (A_TOP=6, B_ILLIQ=2 instâncias) e cada um decide 1 vez/tick. Reduzir as contagens em staging (`MOTOR_AGENT_COUNTS_V2=true`) **não muda o comportamento** — só altera um número inerte. Em produção a flag está OFF (V1), mas isso é irrelevante porque o lever não faz nada.

> **Resultado (simulação):** o impacto dos agentes fica **cravado em ±2% em ~100% dos ticks**, alternando direção. É um serrilhado de 2% a cada 10s, o dia inteiro, sem proteção. Mais: como a alternância não é perfeitamente simétrica e momentum/contrarian/panic entram quando o preço se afasta, os agentes também causam **deriva** (na simulação, ~20% de range intradia quando o ruído está calmo) — explica tanto o "bizarro" (serrilhado) quanto o "divergente" (deriva).

### 1B. Causa secundária — o ruído (L1/L3) está ~50–65× forte demais, mas só nos primeiros ~90s

O choque aleatório por tick é `sigma × √dt × N`. **As constantes de sigma (0,0018–0,0040) foram copiadas do legacy** ("INTAKE canônico") — onde eram aplicadas com `dt = 1/390` (`√dt ≈ 0,0506`). Dois bugs inflam isso:

- **Bug 1 — `dt` saltou de `1/390` para `1.0`** (`L1_OrnsteinUhlenbeck.ts:20,38`; a env `MOTOR_TICK_DT_SECONDS` está vazia em produção → default 1). Com `√dt = 1,0`, o ruído da L1 fica ~`1/0,0506 ≈ 19,75×` maior.
- **Bug 2 — a L3 (GARCH) virou ruído absoluto independente.** No legacy o GARCH era um **multiplicador (1,0–1,8×)** sobre o único ruído. No implantado, a L3 **soma** seu próprio `√variance × noise × P` — **sem `√dt`** (`L3_GARCHLite.ts:59`), com a variância ancorada em `BASE_VARIANCE = 0.0001` (`√ ≈ 1%`, muito acima da sigma dos clusters), e usando **o mesmo `noise` da L1** (`PriceCalculator.ts:102-103`) → somam construtivamente.

**Mas a meta diária (L9) congela isso rápido.** A L9 acumula `|delta|/preço` por tick e, ao passar de 2,5%, zera o multiplicador de sigma (`L9_DailyVolTarget.ts:45-56`). Com o ruído saturando a trava de 0,35%, o acumulado bate 2,5% em **~9 ticks (~90 segundos)** → o ruído L1/L3 **congela pelo resto da sessão** (~14h). Detalhe-chave: a L9 acumula só o delta **interno** (`PriceCalculator.ts:178-179`), **não** o impacto dos agentes — por isso os agentes **nunca** são congelados.

Efeito visível: **cada sessão abre com ~90s de serrilhado violento (ruído batendo na trava), depois o ruído some** e sobra o serrilhado dos agentes. Por isso, no cômputo do dia inteiro, o ruído é secundário; mas ele é real e perceptível na abertura.

### 1C. Contribuintes menores
- **`dt = 1.0` também afeta a âncora (L2)** (`L2_FundamentalAnchor.ts:21`): puxão ~390× mais forte por tick, batendo no teto de 0,3% — mais "tranco".
- **theta do A_SMALL = 0,08** (ímã fraco, fora da escada; ver comparação §6.4): clubes A_SMALL revertem devagar → derivam mais sob o serrilhado dos agentes.
- **Tick de 10s** não causa o problema (o problema é o tamanho do passo), mas espaça e dá destaque a cada tranco.

---

## 2. O que pode ser feito para igualar mais o resultado ao legacy

Como os agentes são a causa dominante, **a remediação começa por eles.**

### Fix 3 — domar os agentes (PRIORIDADE; resolve ~99% do dia)
Três correções, da mais barata à mais completa:
- **3a (1 linha) — corrigir a unidade do spread do Market Maker.** Comparar **fração** com fração: usar `ctx.spread / ctx.currentPrice < TARGET_SPREAD` (ou passar o spread já fracional). Assim o MM só age quando o spread está genuinamente largo — para de disparar todo tick.
- **3b (calibração) — corrigir a fórmula de impacto.** `priceModifier × quantity` satura o cap trivialmente. Opções: (i) impacto **sublinear** estilo Kyle (notional/float, como o legacy), (ii) reduzir `priceModifier`/`quantity` em 1–2 ordens de grandeza, ou (iii) baixar `MAX_AGGREGATE_IMPACT` de 2% para algo como 0,1–0,2%. Sem isso, qualquer agente "agressivo" volta a cravar o cap.
- **3c (segurança) — aplicar o impacto dos agentes ANTES da trava de velocidade e dentro do circuit breaker.** Mover o `agentImpact` para dentro do `PriceCalculator` (somar ao `totalDelta` antes do L8/L10), para que a trava e o disjuntor também limitem os agentes. Hoje eles escapam de ambos.
- **3d (fidelidade ao legacy) — tornar os agentes probabilísticos e fazer o `weight` valer.** O legacy disparava agentes com baixa probabilidade por tick (0,01–0,10) e cooldown. Restaurar isso (e usar `weight`/contagem de fato) reaproxima a **frequência** de ordens do legacy — era a intenção da decisão D1-D6, hoje no-op.

### Fix 1 + Fix 2 — restaurar a escala de ruído (para a abertura)
- **Fix 1 (env, instantâneo, reversível):** `MOTOR_TICK_DT_SECONDS ≈ 0,00256` (= 1/390). Corrige L1 e L2.
- **Fix 2a (1 linha):** aplicar `√dt` na L3 (`L3_GARCHLite.ts:59`), espelhando a L1.
- **Fix 2b (calibração):** ancorar `BASE_VARIANCE` na `sigma²` do cluster — ou restaurar a L3 como multiplicador sobre a L1 (modelo do legacy), eliminando o ruído duplo.
- ⚠️ **Fix 1/2 sem o Fix 3 NÃO resolve a queixa** (a simulação mostra que continua 2%/tick, 100% dos ticks no limite). É necessário para a abertura, mas só faz diferença visível **depois** que os agentes forem domados.

### Não mexer
- **Velocity cap (0,35%)** e **circuit breaker (8%)**: depois dos fixes, voltam a ser redes de segurança raras — desde que o Fix 3c traga os agentes para dentro do alcance deles.

---

## 3. Quanto cada mudança aproxima do legacy e afasta do bizarro

Mesma simulação de pipeline completo (A_TOP, 1200 ticks):

| Cenário | Movimento/tick (mediana) | % ticks > 0,35% | Impacto de agente | Quão perto do legacy |
|---------|--------------------------|------------------|--------------------|----------------------|
| **Implantado hoje** | 2,15% | 100% | 2,00% (cravado) | bizarro |
| **Só Fix ruído (1+2)** | 2,00% | 100% | 2,00% | **praticamente igual ao hoje — não usar isolado** |
| **Só Fix agentes (3)** | 0,00% | 0,1% | ~0% | **~99% resolvido** |
| **Fix agentes + Fix ruído** | 0,00% | 0,0% | ~0% | **calmo, legacy-like** |

**Tradução:**
- **Fix 3 (agentes)** sozinho derruba o serrilhado de ~2,15%/tick para ~0% e zera os ticks que estouram 0,35%. **É o que faz o motor parar de parecer bizarro/divergente o dia inteiro** — e é majoritariamente código localizado (Market Maker + fórmula de impacto + onde o impacto é aplicado).
- **Fix 1+2 (ruído)** acrescenta a correção do **surto de abertura** (os primeiros ~90s de cada sessão), que o Fix 3 não cobre. Juntos, o comportamento fica equilibrado como o legacy.
- **Ordem recomendada:** Fix 3a+3b+3c primeiro (mata a causa dominante), depois Fix 1+2 (limpa a abertura), por fim Fix 3d e o ajuste fino (3b avançado, base do GARCH, theta A_SMALL) para o match fino.

**Resposta direta à pergunta 3:** corrigindo os agentes, o motor sai de **~2% de serrilhado por tick em 100% dos ticks** para **praticamente plano**, eliminando o "bizarro/divergente" do dia inteiro — sozinho fecha ~99% da queixa. Somando a correção de ruído, a abertura também fica suave e o resultado fica **lado a lado com o legacy** que o cliente aprovava.

---

## 4. Achados adicionais e correções (revisão adversarial — Codex gpt-5.4, researcher + code-debugger)

Uma revisão adversarial independente (Codex, papéis de pesquisador e depurador, leitura direta do código) **confirmou** o diagnóstico de §1–§3 e **acrescentou uma terceira família de causas** que eu havia subestimado: erros de **modelagem de volume/book** e de **referência temporal** que produzem **divergência persistente** mesmo depois que o ruído e os agentes forem domados. Diagnóstico de alta confiança (`diagnosis_confidence: high`); reprodução não executada aqui (`reproduction.confirmed: false`), sustentada por leitura de código com `arquivo:linha`.

### 4.1 — Correções/refino do que já estava no documento
- **O fix do Market Maker exige mais que a unidade do spread.** Mesmo corrigindo a comparação para fracional, o `ctx.spread` injetado é **hardcoded e sintético** (`newPrice * 0.002`, `MarketEngine.ts:450-453`) — não vem do book nem de `params.spread`. Como `0.002 > 0.001` sempre, o MM continuaria disparando todo tick. **A correção real é alimentar o MM com o spread fracional real do book (`(ask−bid)/mid`) ou `params.spread`.**
- **O impacto dos agentes é um erro de unidade**, não só uma saturação: `aggregateImpact` trata `priceModifier × quantity` como **retorno fracional** (`AgentOrchestrator.ts:175-185`). O MM satura o cap de ±2% já com `quantity ≥ 20` (não 50).
- **A correlação NÃO usa "delta do tick anterior"** (como a comparação afirmava) — ela usa o **deslocamento acumulado do dia** contra o `closePrice` (`MarketEngine.ts:557-569`, `MotorTick.ts:12-25`: `close = state.closePrice`). Isso mantém pressão direcional persistente entre pares do cluster. (Corrige a §1 da comparação.) Ela escapa do velocity cap (L8), mas **não fica sem freio**: tem cap próprio de 0,07% + ApproachBrake + circuit breaker.
- **O "freeze em ~90s" é estimativa**, não garantido pelo código — depende do caminho realizado (plausível sob saturação perto do cap de 0,35%).
- **`dt=1.0 unset em produção`** foi confirmado por leitura **viva** do env do serviço `motor` (ver comparação §7); pelo código isolado só se afirma o default `1`.

### 4.2 — Novas causas-raiz (todas confirmadas no código, `diagnosis_confidence: high` salvo indicação)

| # | Causa | Mecanismo | Evidência |
|---|-------|-----------|-----------|
| **A1** | **`state.volume` é inflado pelo book pendente** | A cada tick, soma `pendingBuy+pendingSell` (ordens **abertas/resting**, não executadas) em `state.volume` → uma ordem parada é **recontada** indefinidamente | `MarketEngine.ts:400-406,519-522` |
| **A2** | **Loop de realimentação de volume** | `syntheticVolume` (soma das quantities dos agentes) volta para `state.volume`, que vira `volume24h`, que escala o `quantity` do MarketMaker e do Panic → **auto-amplificação** | `AgentOrchestrator.ts:220-223`, `MarketEngine.ts:504-507`, `MarketMakerAgent.ts:32-35`, `PanicSellerAgent.ts:24-29` |
| **A5** | **L4 (OFI) não decai sem ordens novas** | Se `pendingBuy+pendingSell==0`, L4 retorna sem atualizar `ofiState` → a pressão de compra/venda **gruda** indefinidamente. No legacy o imbalance decaía **todo tick** (`imbV*imbDecay`) | `L4_OrderFlowImbalance.ts:35-37` vs `FootStock.jsx:1161-1166` |
| **A6** | **L5 (Kyle) usa volume TOTAL do book, não fluxo líquido/executado** | `totalVolume=buy+sell`, sinal pelo lado dominante → um book grande **quase equilibrado** ainda gera impacto grande numa direção, repetido a cada tick | `L5_KyleLambda.ts:37-55` |
| **A7** | **L4 e L5 double-count o mesmo book** | Os dois leem o mesmo `pendingBuy/SellVolume` no mesmo tick → o book pendente vira simultaneamente memória direcional (L4) e impacto mecânico (L5), repetido enquanto a ordem existir | `L4:31-52` + `L5:37-55` |
| **A8** | **GARCH usa retorno acumulado do dia, não por tick** | `lastReturn=(currentPrice−closePrice)/closePrice` (`closePrice` é âncora diária) → variância fica alta e enviesada mesmo sem choque novo no tick | `L3_GARCHLite.ts:36-39` |
| **A11** | **Hidratação Redis sem validação (`risco`)** | `parseFloat` cru grava em `variance`/`ofiState`/`dailyVolAccum` sem checar `NaN/Infinity` → estado inválido pode propagar. `diagnosis_confidence: medium` (hipótese operacional, não causa confirmada do sintoma) | `PriceCalculator.ts:333-341` |

**Releitura do quadro:** os agentes (§1A) continuam sendo a causa dominante do serrilhado, mas **A1/A2/A5/A6/A7** explicam por que o preço **diverge e deriva de forma persistente** (não só serrilha) — e por que reduzir só o ruído não resolveria. Esses itens devem ser tratados no **mesmo nível de gravidade** dos agentes fora do cap/CB.

### 4.3 — Correções mínimas propostas (com nível de confiança), na ordem recomendada

| Ordem | Correção | Arquivo:linha | `fix_confidence` |
|-------|----------|---------------|------------------|
| 1 | **Trazer o impacto dos agentes para DENTRO do PriceCalculator** (somar como delta antes de L8/correlação/brake/L10), em vez de `finalPrice = price×(1+agentImpact)` por fora | `MarketEngine.ts:443-459` + `PriceCalculator.ts` | high |
| 2 | **Corrigir a fórmula de impacto dos agentes** — cada agente retorna `signedVolume`/`deltaNotional`; orquestrador converte por função de impacto **sublinear** (reusar o Kyle do motor), em vez de `priceModifier×quantity` linear | `AgentOrchestrator.ts:175-185` | medium |
| 3 | **Corrigir o trigger do MarketMaker** — `ctx.spread` deve ser spread fracional real do book (`(ask−bid)/mid`) ou `params.spread`, comparado na mesma unidade | `MarketEngine.ts:444-453`, `MarketMakerAgent.ts:19-35` | high |
| 4 | **Desacoplar `quantity` de MM/Panic do `state.volume`** — usar `params.baseVolume`/faixa fixa por cluster/profundidade real do book | `MarketMakerAgent.ts:32-35`, `PanicSellerAgent.ts:24-29` | high |
| 5 | **Parar de somar book pendente em `state.volume`** — `state.volume` deve refletir **executado** (fills), não aberto; manter "book pressure" como métrica separada | `MarketEngine.ts:519-522` | high |
| 6 | **L4 deve decair sem ordens** — quando `total==0`, fazer `ofiState = rho × ofiState` em vez de retornar cru | `L4_OrderFlowImbalance.ts:35-45` | high |
| 7 | **L5 deve usar fluxo líquido/executado** — basear impacto em `abs(buy−sell)` ou volume executado do tick, não `buy+sell` | `L5_KyleLambda.ts:37-55` | medium |
| 8 | **Corrigir a base temporal da correlação** — gravar `previousPrice` por ativo e popular `previousTickDeltas` com `(currentPrice−previousPrice)/previousPrice` | `MarketEngine.ts:557-569`, `MotorTick.ts:12-25` | high |
| 9 | **Corrigir `lastReturn` do GARCH + aplicar `√dt` em L3** (com `DT` consistente com L1) | `L3_GARCHLite.ts:36-39,52-60` | high |
| 10 | **Restaurar a escala temporal** — `MOTOR_TICK_DT_SECONDS` na fração de pregão da calibração legacy, OU recalibrar formalmente todos os params para `DT=1` | `L1:20`, `L2:21` | medium |
| 11 | **Validar hidratação Redis** — aceitar só `Number.isFinite`; senão default + warn | `PriceCalculator.ts:333-341` | high |

**O que NÃO fazer (anti-band-aid, do depurador):** (a) NÃO baixar o `MAX_AGGREGATE_IMPACT` como paliativo — mascara a física errada sem remover a causa; (b) NÃO mexer no nudge primeiro (não é a causa dominante — e ele dispara após ~25 min a 10s/tick, não 5 min); (c) NÃO abrir refatoração ampla do motor antes de corrigir os pontos de cadeia causal acima.

**Predicado de aceite (staging):** `p95(|finalPrice/prevPrice − 1|) ≤ 0,35%` e **% de ticks acima de 0,35% perto de zero** em ativos sem notícia; `% de ticks com MarketMaker ativo` deixa de ser ~100%; `% de ticks com impacto de agente saturado (≥1,9%)` cai para ~0; `ofiState` decai monotonicamente em sequência sem ordens novas.

---

## 5. Achados adicionais e correções (revisão adversarial — Kimi `kimi-for-coding`, researcher + code-debugger)

Uma segunda revisão adversarial independente (Kimi, papéis de pesquisador e depurador, leitura direta do código) confirmou §1–§4 e acrescentou **mais cinco causas que ninguém tinha pego**, além de duas **correções factuais a esta documentação**. Todos os itens abaixo foram verificados no código (alguns por mim, diretamente, para os que corrigem fatos).

### 5.1 — Correções factuais a este conjunto de documentos
- **`LiquidityAgents.ts` é CÓDIGO MORTO (N9).** O entrypoint (`src/index.ts:105`) instancia `MarketEngine`, que usa `agentOrchestrator` de `src/agents/AgentOrchestrator` (`MarketEngine.ts:16,299,456`). `LiquidityAgents.ts` (singleton `liquidityAgents`, `:154`) **nunca é chamado em runtime** — `MarketEngineService.ts` só o cita num comentário e re-exporta `MarketEngine`. **Consequência:** os agentes VIVOS são os **6 tipados** (MarketMaker, Momentum, Contrarian, ValueInvestor, RandomTrader, PanicSeller), NÃO os "5 perfis" do LiquidityAgents. O `MANUAL-DO-MOTOR.md` §5.4 (e a §5.4 da comparação) descreviam o sistema morto — **corrigido no manual**. (A boa notícia: o diagnóstico de §1/§4 já analisou o sistema VIVO correto, com o bug do MarketMaker.)
- **A meta diária (L9) NÃO congela order flow nem notícias (N12).** Só L1/L2/L3 leem `volatilityMultiplier`/`dailySigmaMultiplier`; **L4/L5/L6/L7 não** (confirmado: nenhum deles referencia os multiplicadores). Então, quando L9 "congela" a >=2,5% (ou fora do pregão), o **OFI (L4), o Kyle (L5) e as notícias (L7) continuam empurrando o preço em força plena**. O manual descrevia L9 como "freio do dia inteiro" — agora com a ressalva de que ele só freia a parte aleatória (L1/L3), não o fluxo de ordens nem notícias.

### 5.2 — Novas causas-raiz (confirmadas no código)

| # | Causa | Mecanismo | Evidência |
|---|-------|-----------|-----------|
| **N1** | **Agentes atuam em força plena fora do pregão principal** | Todos os agentes só checam `session !== 'CLOSED'` e **nenhum escala por `volatilityMultiplier`**. Em PRE_OPENING (0,3×), CLOSING_CALL (0,2×) e AFTER_MARKET (0,1×), L1–L3 estão suavizadas, mas os agentes mantêm ±2%/tick → fora do horário principal o preço é **dominado por agentes sintéticos** (serrilhado quando deveria estar quase parado) | agentes `:12-16`; `MarketEngine.ts:443-459` |
| **N7** | **Warm-start e retomada de CB reancoram a janela de 8%** | `closePrice = currentPrice` no startup (`:262`), na retomada do circuit breaker (`:169`) e na virada de sessão (`:359`). Em dia volátil: sobe 8%, trava, retoma, sobe +8% do **novo** close... → **deriva acumulada > 8%** do fechamento original, sem um único gap violento. O legacy comparava com `openPrice` e não reancorava | `MarketEngine.ts:169,262,359` |
| **N6** | **Agentes aplicados ANTES do matching de ordens reais** | `finalPrice` (já com o impacto sintético dos agentes) é o preço usado em `matchOrders` (`:510-513`) → ordens reais de usuários executam a um preço **contaminado por movimento sintético sem contraparte** | `MarketEngine.ts:443-522` |
| **N2** | **Nudge compara preço arredondado a 2 casas** | `+(P+totalDelta).toFixed(2)` vs `+P.toFixed(2)` (`:262-263`) → movimentos sub-centavo não resetam o contador de inatividade; em ativos baratos (R$3, onde 1 centavo = 0,33%) o nudge pode disparar após movimentos reais pequenos, empurrando para o fairValue (contra-movimento) | `PriceCalculator.ts:262-263` |
| **N5** | **Piso de R$1 distorce retornos perto do piso** | `Math.max(NUDGE_MIN_PRICE, …)` em `MarketEngine.ts:459` e `PriceCalculator.ts:166` age como "parede" assimétrica: um ativo a R$1,01 que cairia 2% é truncado para R$1,00 (−1%), distorcendo a distribuição de retornos em stress | `MarketEngine.ts:459`, `PriceCalculator.ts:166` |
| **N11** | **Viés de compra do Kyle (1,05–1,08) em book equilibrado** | `isBuyDominant = buy >= sell`: com buy=1000/sell=999, aplica assimetria 1,05–1,08; com buy=999/sell=1000, não aplica → a magnitude compradora é 5–8% maior que a vendedora para o mesmo book quase equilibrado → **deriva de alta persistente** (refina o item 7 do Codex) | `L5_KyleLambda.ts:24-30,46-54` |
| **N8** | **`MOTOR_TICK_DT_SECONDS` sem validação (`risco`)** | `parseFloat` cru (`L1:20`, `L2:21`): `NaN`/negativo/zero propagam para `√dt` e os deltas. Não é a causa atual (unset→1.0), mas é vulnerabilidade operacional | `L1:20`, `L2:21` |

### 5.3 — Refinamento de priorização (do depurador Kimi)
Pergunta testada: **corrigir só o trigger do MarketMaker já acalma o dia?** Kimi confirmou, lendo os agentes: o MarketMaker é o **único que dispara em ~100% dos ticks e satura o cap sozinho**; os demais têm gatilhos restritos e impacto pequeno (Value só fora de ±5%/+10% do FV; Momentum só com |Δdia|>2%; Contrarian só >3%; Random impacto minúsculo). **Logo, corrigir o trigger do MM é o passo de maior impacto imediato** — porém **insuficiente isolado**: (a) o `ctx.spread` é hardcoded (`MarketEngine.ts:450`), então é preciso alimentar spread real, não só corrigir a unidade; e (b) a fórmula de impacto (`priceModifier × quantity`) continua errada e voltaria a saturar se outro agente (ex.: Panic em stress) disparar. Trigger + fórmula andam juntos.

### 5.4 — Ordem integrada de correção (Codex 1–11 + Kimi N1–N12)
Mapa de inserção (sem redundância): os itens Kimi **N7, N9, N12, N2, N5 são novos e não cobertos** pelas 11 do Codex; **N1, N6, N11, N8 complementam/refinam** itens existentes. Sequência sugerida:
1. **Codex#3 + N1** — trigger do MM com spread fracional real **+ gating por sessão/`volatilityMultiplier`** nos agentes.
2. **Codex#1 + N6** — trazer impacto dos agentes para dentro do PriceCalculator (sujeito a L8/L10) **+ decidir se ordens reais executam ao preço pré-agente**.
3. **Codex#2** — corrigir a fórmula de impacto dos agentes (sublinear/Kyle).
4. **Codex#4–5** — desacoplar quantity de `state.volume`; parar de somar book pendente em `state.volume`.
5. **Codex#6–7 + N11** — L4 decai sem ordens; L5 usa fluxo líquido/executado; zerar/reduzir a assimetria de compra.
6. **N12** — escalar L4/L5/L6/L7 por `volatilityMultiplier` (e respeitar o freeze da L9).
7. **N7** — não reancorar `closePrice` no warm-start/retomada (usar `openPrice`/close persistido).
8. **Codex#9–10 + N8** — `lastReturn` por tick + `√dt` na L3; restaurar escala temporal; validar `MOTOR_TICK_DT_SECONDS`.
9. **Codex#11** — validar hidratação Redis.
10. **N2** — nudge com tolerância percentual, não arredondamento a 2 casas.
11. **N5** — piso de preço sem distorcer retorno.
12. **N9** — corrigir o manual (LiquidityAgents morto). *(feito)*

---

## 6. Riscos e validação

- **Estimativas analíticas**, não backtest do motor completo (sem order flow real, notícias, correlação inter-ativos). Os números relativos (hoje × cada fix) são robustos; os absolutos são ordem de grandeza.
- **O Fix 3c (mover agentes para dentro da trava/CB) muda a semântica** de quem limita o quê — validar que não introduz halt em excesso.
- **Validar em staging com A/B** (o plano de reconciliação já exige A/B para mudanças de motor, decisão D1-D6). Sequência segura: (1) Fix 3a+3b em staging; (2) medir serrilhado/% ticks>0,35%/range intradia por 24–48h; (3) Fix 3c; (4) Fix 1+2 (env do `dt` é reversível na hora); (5) ajuste fino; (6) promover.
- **Custo:** nenhum impacto negativo — o tick segue 10s (economia preservada). Menos saturação de cap e menos halts tendem a **reduzir** trabalho de backend, não aumentar.
- **Atenção:** a flag `MOTOR_AGENT_COUNTS_V2` **não** serve como mitigação (é no-op); não confie nela para "acalmar" os agentes.

---

## 7. Atualização pós-correções — medição local do harness (2026-06-18)

> **Nota de escopo (numbers são do harness LOCAL).** Os predicados desta seção vêm do harness determinístico `src/harness/runHarness.ts` (Item 003) rodado com o código corrigido pelos itens 002..020 deste loop (`output/workspace/foot-stock/motor/src/`, working tree entregue). Configuração: seed `1337`, 8640 ticks/ativo, book equilibrado (`pendingBuy=pendingSell=0`), sem DB/Redis/order-flow/notícias/correlação inter-ativos. **Execução do harness usada como insumo: 2026-06-18 (replay pós-fix com todos os toggles `legacy*` desligados; baseline pré-fix em `src/harness/baseline/golden-baseline.json`, gerado pelo Item 003).** A confirmação final NÃO está dada aqui: depende dos gates externos (ver §7.4).

### 7.1 — Correções aplicadas (itens 002..020 deste loop)

As correções priorizadas na §2 e na §4.3/§5.4 foram materializadas pelos itens do loop `06-17-motor-footstock-correcoes-variacoes`:

| Item | Trilha | Correção aplicada |
|------|--------|-------------------|
| 002 | T0.1 | Instrumentação de log por tick (base de medição) |
| 003 | — | Harness de medição + baseline golden pré-fix (`golden-baseline.json`) |
| 004 | T1.1 | **Causa dominante:** unidade do spread do Market Maker (fracional vs absoluto) — o MM não dispara mais em todo tick |
| 005 | T1.2 | Gating dos agentes por sessão |
| 006 | T1.3 | Fórmula de impacto dos agentes: linear saturante → lei sublinear de Kyle |
| 007 | T1.4 | Impacto dos agentes trazido para DENTRO do `PriceCalculator` (passa pela trava de velocidade e pelo CB) |
| 008 | T2.1 | `state.volume` = volume executado (não soma book pendente) |
| 009 | T2.2 | Desacoplar `quantity` dos agentes de `state.volume` (quebra o feedback loop) |
| 010 | T2.3 | L4 decai sem ordens |
| 011 | T2.4 | L5 usa fluxo líquido/executado |
| 012 | T3.1 | Correlação por delta de tick |
| 013 | T3.2 | `lastReturn` por tick + `√dt` na L3 |
| 014 | T3.3 | Restaurar a escala temporal do `dt` |
| 015 | T3.4 | Validar `MOTOR_TICK_DT_SECONDS` |
| 016 | T4.1 | Escalar L4/L5/L6/L7 por `volatilityMultiplier` (respeitando o freeze da L9) |
| 017 | T4.2 | Não reancorar `closePrice` no warm-start/retomada |
| 018 | T4.3 | Validar hidratação Redis |
| 019 | T4.4 | Nudge com tolerância percentual (não arredondamento a 2 casas) |
| 020 | T4.5 | Piso de preço sem distorcer o retorno |

### 7.2 — Predicados CA recalculados pelo harness local (pré-fix golden × pós-fix 2026-06-18)

Percentuais sobre 8640 ticks/ativo. "Pré-fix" = `golden-baseline.json` (Item 003); "Pós-fix" = harness com o código dos itens 002..020.

| Predicado | URU3 (A_TOP) pré | URU3 pós | ABT3 (B_ILLIQ) pré | ABT3 pós |
|-----------|------------------|----------|--------------------|----------|
| CA1 `p50` de `|ret|` | 2,128% | 0,00006% | 2,254% | 0,019% |
| CA1 `p95` de `|ret|` | 2,151% | 0,0006% | 2,306% | 0,040% |
| CA1 `p99` de `|ret|` | 2,151% | 0,0025% | 2,306% | 0,095% |
| CA1 `max` de `|ret|` | 2,357% | **0,350%** | 2,306% | **0,350%** |
| CA2 (% ticks > 0,35%) | 100% | 0,012% | 89,54% | 0,43% |
| CA3 (% impacto agente saturado ≥1,9%) | 100% | **0%** | 72,95% | **0%** |
| CA4 `ofiDecay.meanAbs` (book equilibrado) | 0 | 0 | 0 | 0 |
| CA5 `l5MeanImpact.meanAbs` | 0 | 0 | 0 | 0 |
| CA6 (% "mercado morto") | 0% | 98,39% | 7,05% | 98,61% |
| `MM_pctActive` | 100% | **0%** | 100% | 100% |

Leitura: o serrilhado de ~2%/tick desapareceu (CA1 `p95` caiu ~3.600× no A_TOP e ~57× no B_ILLIQ); a saturação de impacto do agente foi a zero (CA3 0%); a trava de velocidade de 0,35% agora é o teto efetivo (CA1 `max` = exatamente 0,0035 nos dois ativos, batendo a §2 "Fix 3 resolve ~99% do dia"). O Market Maker deixou de cravar o cap em book estreito (`MM_pctActive` 0% no A_TOP, cujo spread 0,05% < TARGET 0,1%) e permanece ativo em book largo (B_ILLIQ 1,5%), confirmando o fix de unidade do Item 004 (T1.1).

### 7.3 — Divergências remanescentes e `hipotese`/decisões pendentes para ratificação

1. **CA6 "mercado morto" sobe para ~98% no harness.** `hipotese`: é artefato do harness, não regressão de produção. Com book equilibrado (sem order-flow/notícias/correlação) e retorno por tick agora sub-centavo (CA1 `p50` ~6e-7 no A_TOP), o preço não muda ≥ 1 centavo na maioria dos ticks — então CA6 conta esses ticks como "morto". Em produção há order flow real, notícias e correlação inter-ativos que reanimam o preço; o CA6 local **não** projeta diretamente mercado morto em produção. **Decisão pendente:** ratificar em A/B de staging que a amplitude intradiária real fica ENTRE o serrilhado pré-fix e o congelamento do harness (alvo: amplitude próxima do legacy).
2. **`MM_pctActive` 0/1 constante por ativo.** `hipotese`: no harness o spread é fixo por cluster, então o MM é binário (0 no A_TOP, 1 no B_ILLIQ). Em produção, com spread real variável, espera-se disparo intermitente. **Decisão pendente:** validar a distribuição de `MM_pctActive` em staging.
3. **Velocity cap 0,35%/tick @10s como teto de produto.** CA1 `max` agora é exatamente 0,35% nos dois ativos. **Decisão pendente (produto, fora do motor):** confirmar se 0,35%/tick é o alvo desejado ou se deve ser recalibrado — relacionado à divergência de maio (`COMPARACAO §7.3`: registro de maio previa 2,5%, código vivo está em 0,35%).

### 7.4 — Confirmação depende dos gates externos

Os números de §7.2 são do **harness local determinístico** (miolo do tick: `pendingBuy/Sell → noise → calculate() → agentCtx → tickAsset() → finalPrice`), **não** do sistema vivo completo. A confirmação final exige: (a) `npm run typecheck` + `npm test` (Jest) do motor verdes; (b) **A/B em staging** por 24–48h medindo serrilhado / % ticks > 0,35% / amplitude intradiária (decisões D1–D6 do plano de reconciliação, que exigem A/B para mudanças de motor); (c) verificação read-only de produção no Railway. Enquanto esses gates não fecharem, os predicados acima são uma **medição local de regressão**, não uma garantia de paridade com o legacy em produção.

---

*Diagnóstico (aprofundado) produzido em 2026-06-17 a partir de: `MANUAL-DO-MOTOR.md`, `COMPARACAO-MANUAL-VS-MOTOR-LEGACY.md` (incl. §7, estado vivo), leitura do código real do motor (`src/agents/*.ts`, `src/engine/layers/L1/L3/L9/L2`, `src/engine/PriceCalculator.ts`, `src/engine/MarketEngine.ts`) e do legacy (`footstock-web/src/FootStock.jsx`), e simulação Monte Carlo do pipeline completo. Fonte da verdade: o código.*

*Revisão adversarial externa: a §4 incorpora a revisão do **Codex (gpt-5.4)** nos papéis de pesquisador e depurador de código (`ai-forge/MCP/agents/study-researcher-rules.md` e `code-debugger.md`), com leitura direta do código (`arquivo:linha`) em 2026-06-17 — confirmou §1–§3 e acrescentou A1/A2/A5/A6/A7/A8/A11 + correções priorizadas com nível de confiança. A §5 incorpora a revisão do **Kimi (`kimi-for-coding`)** nos mesmos papéis (pesquisador + depurador), via CLI `kimi --print` com leitura direta do código em 2026-06-17 — confirmou §1–§4, corrigiu dois fatos da documentação (N9 LiquidityAgents é código morto; N12 a L9 não congela order flow/notícias) e acrescentou N1/N2/N5/N6/N7/N8/N11. Os achados que corrigem fatos (N7, N9, N12) foram reverificados por leitura direta antes da mescla.*
