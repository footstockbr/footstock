# Manual do Motor Foot Stock

### Como o preço dos clubes se mexe, camada por camada, e como você controla a oscilação

> Este manual foi escrito para quem **opera o produto**, não só para quem programa. A linguagem é proposital­mente simples: cada camada tem uma analogia, um medidor de impacto e uma lista clara de botões que você pode girar. Sempre que algo for técnico, há uma explicação em português comum ao lado.
>
> O motor é o "coração" do Foot Stock: é o programa que, a cada poucos segundos, decide o novo preço de cada clube. Ele não inventa preço do nada: ele **soma vários empurrõezinhos**, cada um vindo de uma "camada" diferente. Entender essas camadas é entender por que o gráfico de um clube sobe, desce, treme ou fica parado, e como você muda esse comportamento.

---

## Sumário

1. [Visão geral em 2 minutos](#1-visão-geral-em-2-minutos)
2. [A batida do motor (o "tick")](#2-a-batida-do-motor-o-tick)
3. [Como ler as fichas das camadas](#3-como-ler-as-fichas-das-camadas)
4. [As camadas, uma a uma (na ordem em que rodam)](#4-as-camadas-uma-a-uma-na-ordem-em-que-rodam)
   - [4.1 — Meta de Volatilidade do Dia (L9, pré-cheque)](#41--meta-de-volatilidade-do-dia-o-limite-de-agitação-do-dia)
   - [4.2 — Batida do Coração / Ruído (L1)](#42--batida-do-coração-o-ruído-aleatório)
   - [4.3 — Ímã do Preço Justo (L2)](#43--ímã-do-preço-justo-a-âncora)
   - [4.4 — Termômetro de Nervosismo (L3)](#44--termômetro-de-nervosismo-a-volatilidade-que-pega-no-embalo)
   - [4.5 — Empurrão da Fila de Ordens (L4)](#45--empurrão-da-fila-de-ordens-compra-vs-venda)
   - [4.6 — Empurrão da Ordem Grande (L5)](#46--empurrão-da-ordem-grande-impacto-de-tamanho)
   - [4.7 — Digestão de Notícias (L7)](#47--digestão-de-notícias-a-fila-de-pressão)
   - [4.8 — Micro-choque anti-travamento (L7.5 Nudge)](#48--micro-choque-anti-travamento-l75-nudge)
   - [4.9 — Limite de Velocidade (L8)](#49--limite-de-velocidade-a-trava-anti-disparada)
   - [4.10 — Efeito Manada (Correlação)](#410--efeito-manada-correlação-entre-clubes)
   - [4.11 — Freio de Aproximação (L9.5)](#411--freio-de-aproximação-l95-evita-o-disjuntor-em-loop)
   - [4.12 — O Disjuntor (Circuit Breaker, L10)](#412--o-disjuntor-circuit-breaker)
5. [Subsistemas de apoio (não são "camadas", mas mandam muito)](#5-subsistemas-de-apoio)
   - [5.1 — Relógio do Mercado (Sessões)](#51--relógio-do-mercado-as-sessões)
   - [5.2 — O DNA dos clubes (os 5 Clusters)](#52--o-dna-dos-clubes-os-5-clusters)
   - [5.3 — A porta das ordens reais (Order Flow)](#53--a-porta-das-ordens-reais-order-flow)
   - [5.4 — Robôs de mercado e trava de margem](#54--robôs-de-mercado-e-trava-de-margem)
6. [O Painel de Controle (como você ajusta tudo isso)](#6-o-painel-de-controle)
7. [Tabela mestra: quanto cada camada impacta a oscilação](#7-tabela-mestra-de-impacto)
8. [Receitas práticas de ajuste](#8-receitas-práticas-de-ajuste)
9. [Glossário](#9-glossário)

---

## 1. Visão geral em 2 minutos

**O que o motor faz.** A cada **10 segundos** (uma "batida", chamada de **tick**), o motor recalcula o preço de **todos os clubes** ao mesmo tempo. Cada clube tem o seu preço atualizado, gravado no banco e enviado para a tela do usuário em tempo real. (O intervalo de 10s é o **default do próprio código** hoje, ajustável por variável de ambiente — ver §2.)

**Como ele decide o novo preço.** Ele NÃO multiplica efeitos em cascata. Ele faz algo mais simples de entender: cada camada calcula **um empurrãozinho** (para cima ou para baixo, em reais), e o motor **soma todos esses empurrões**. O resultado da soma é o quanto o preço vai mexer naquele tick. Pense numa fila de pessoas empurrando um carrinho: cada uma empurra um pouco, e o carrinho anda conforme a soma das forças.

```
        L1 ruído  +  L2 ímã  +  L3 nervoso  +  L4 fila  +  L5 ordem grande
      + L7 notícia  +  L7.5 cutucão  +  robôs (impacto dos agentes)
      = EMPURRÃO TOTAL  ->  L8 corta o excesso (limite de velocidade, 0,35%/tick)
                         ->  + Correlação (efeito manada)  ->  L8 reaplica (re-corta o total)
                         ->  L9.5 freio perto do limite
                         ->  L10 disjuntor (se passou de 8%, descarta tudo e congela)
      = NOVO PREÇO do clube neste tick
```

**Quem segura a oscilação.** Algumas camadas **criam** movimento (ruído, notícias, fluxo de ordens, os robôs de mercado). Outras **seguram** (o ímã do preço justo, o limite de velocidade, o disjuntor). O comportamento que o usuário vê no gráfico é o equilíbrio entre essas duas famílias.

**Os 5 tipos de clube.** Cada clube pertence a uma de 5 "categorias de personalidade" (os **clusters**). Clubes gigantes e muito negociados (A_TOP) oscilam pouco e de forma calma; raridades quase paradas (B_ILLIQ) oscilam muito e de forma brusca. Essa diferença vem dos parâmetros-base de cada cluster (ver §5.2).

**Onde você controla.** Existe um **painel de configuração** (guardado no Redis, na chave `motor:layers:config:v1`). O motor lê esse painel a cada tick e ajusta o comportamento das camadas. Todo valor que você coloca passa por uma **trava de segurança** (clamp): se você digitar um número fora da faixa permitida, o motor corta para o limite seguro. Importante: **nem tudo é ajustável pelo painel** — alguns números estão fixos no código (ver §6).

---

## 2. A batida do motor (o "tick")

Cada batida segue sempre os mesmos passos. Em linguagem simples:

1. **Relógio.** O motor olha que horas são (horário de Brasília) e descobre em qual fase do dia o mercado está (pré-abertura, pregão, leilão de fechamento, after-market ou fechado). Isso define o "quanto o mercado está aceso" naquele momento (ver §5.1).
2. **Lê o painel.** Busca a configuração que você ajustou (os parâmetros por cluster e os multiplicadores de sessão).
3. **Reset de virada (uma vez por dia).** A "agitação acumulada do dia", o volume e o **fechamento de referência** do disjuntor são re-ancorados **só na pré-abertura** (não a cada virada de sessão) — é o "rollover" diário.
4. **Clubes pausados primeiro.** Qualquer clube que esteja parado (por disjuntor ou por pausa do admin) só avisa a tela que está parado — não recalcula preço.
5. **Para cada clube ativo:** lê quanta gente quer comprar e quanta quer vender, sorteia um número aleatório (o "ruído" do tick), **roda primeiro os robôs do clube** (que devolvem um empurrão agregado e um volume sintético) e chama a **pilha de camadas** — o empurrão dos robôs entra na soma como **mais uma força**, antes do limite de velocidade e do disjuntor.
6. **Limite + Disjuntor.** A soma total (camadas + robôs + correlação) passa pela trava de velocidade (0,35%/tick) e pelo disjuntor: se o preço candidato estourou o limite de segurança (8% de distância do fechamento do dia, ou 20% se houver notícia), o clube é **congelado** e a volta é agendada (~5 min). O piso de R$ 1,00 é respeitado.
7. **Casa as ordens reais.** Executa as ordens a mercado dos usuários e dispara as ordens-limite que atingiram o alvo (por padrão, no preço **pré-robôs**).
8. **Grava e transmite.** Atualiza o preço, monta a "explicação" do candle (quem moveu o preço e quanto), grava no banco e publica na tela. Clubes A_TOP gravam histórico todo tick; os demais a cada ~1 minuto, para o gráfico não ficar "em degraus".
9. **Pós-processo.** Guarda os movimentos deste tick para a Correlação usar no próximo e checa as margens das posições short (com trava anti-liquidação-dupla, ver §5.4).

> **Um tick de cada vez.** Se um tick demorar mais que o intervalo (ex.: banco lento), o próximo ciclo é **pulado** em vez de rodar em paralelo — uma guarda de reentrância que evita corromper o estado dos clubes.

> **Por que 10 segundos?** O intervalo de 10s entre ticks é o **default do código** (`TICK_INTERVAL_MS`, ajustável por `MOTOR_TICK_INTERVAL_MS`, com piso de 1s e proteção contra valores inválidos). É lento o bastante para o servidor recalcular **todos** os clubes com folga (menos custo de CPU/infra, gráfico mais estável) e rápido o bastante para o mercado parecer "vivo". O que isso muda para você, operador: como quase todos os limites do motor são definidos **por tick** (velocity cap 0,35%/tick, a meta diária acumula por tick, os "N ticks" das notícias e do nudge), com tick de 10s o preço dá **~6 passos por minuto**, e cada solavanco representa 10 segundos de "tempo de mercado". **Todas as conversões de "N ticks → minutos" deste manual usam 10s/tick.** Atenção operacional: se você um dia mudar o tick (ex.: para 2s), o comportamento visível muda junto — a mesma notícia de 40 ticks que a 10s/tick leva ~6,7 min passaria a levar ~80s, e o mesmo cap de 0,35%/tick viraria 5× mais movimento por minuto.

---

## 3. Como ler as fichas das camadas

Cada camada (seção 4) tem a mesma estrutura, para você comparar rápido:

- **O que faz** — em uma frase.
- **Como funciona** — a analogia + o mecanismo em português comum.
- **Impacto na oscilação** — um medidor de 5 barras e um rótulo de direção:

| Medidor | Significado |
|---------|-------------|
| `■■■■■` | **Crítico** — mexer aqui muda o produto inteiro |
| `■■■■□` | **Alto** — efeito grande e visível |
| `■■■□□` | **Médio** — efeito perceptível, mas contido |
| `■■□□□` | **Baixo** — efeito pequeno hoje |

| Rótulo de direção | O que significa |
|-------------------|-----------------|
| **AMPLIFICA** | Cria/aumenta a oscilação (faz o gráfico tremer/andar mais) |
| **ANCORA** | Puxa o preço de volta a um centro (segura a oscilação) |
| **LIMITA** | Corta exageros (põe teto na oscilação) |
| **MISTO** | Tem partes que amplificam e partes que seguram |

- **Botões que você controla** — o que está no painel, a faixa segura e o efeito de girar.
- **Cenários de ajuste** — o que acontece se você sobe, baixa ou "desliga".

---

## 4. As camadas, uma a uma (na ordem em que rodam)

> A ordem abaixo é a **ordem real de execução** dentro de um tick. A numeração dos nomes (L1, L2...) é histórica e nem sempre bate com a ordem — por isso a lista segue o fluxo, não o número.

---

### 4.1 — Meta de Volatilidade do Dia (o "limite de agitação do dia")

**O que faz.** É um "freio do dia inteiro". O motor soma o tamanho de cada movimento ao longo do dia num contador de agitação. Conforme esse contador se aproxima da meta (~2,5% de variação acumulada no dia), a camada vai **reduzindo a força das oscilações aleatórias** para o clube não ficar serrilhando o dia todo.

**Como funciona.** Pense num carro que vai tirando o pé do acelerador conforme se aproxima do limite de velocidade do dia:
- Abaixo de **2,0%** acumulado: tudo normal.
- Entre **2,0% e 2,5%**: o motor reduz gradualmente a força do ruído (chega a deixar só 20% da força original).
- Ao bater **2,5%**: congela 100% da parte aleatória **(apenas L1 e L3)**. ⚠️ **Importante:** o freeze NÃO para o resto — o ímã do preço justo (L2), o fluxo de ordens (L4), o impacto de ordem grande (L5), as notícias (L7) **e os agentes de liquidez continuam agindo em força plena** (L4/L5/L7 e os agentes não leem o multiplicador da L9). Ou seja, "freio do dia" freia só o ruído aleatório, não o mercado inteiro.

Esse "freio" é entregue para as camadas L1 (ruído) e L3 (nervosismo) na forma de um multiplicador. Detalhe: o contador usa o valor do tick **anterior** (atraso proposital de 1 tick).

**Impacto na oscilação:** `■■■■□` **Alto** · **LIMITA**
É um teto de agitação por dia. Sem ele, um clube agitado balançaria o dia inteiro sem cansar. Com ele, a oscilação "se esgota" e o gráfico se acalma à tarde.

**Botões que você controla:** ⚠️ **Nenhum no painel.** Os limites (2,0% e 2,5%) estão fixos no código. Você só influencia esta camada **indiretamente**, mexendo no ruído (L1/sigma) e nos multiplicadores de sessão — quanto mais agitado o tick, mais rápido o contador chega na meta e o freio entra.

**Cenários:** se os clubes estão se esgotando cedo demais (ficam parados de tarde), é porque a meta diária está sendo atingida rápido — a saída é **baixar o sigma** dos clusters ou os multiplicadores de sessão, não esta camada (ela não tem botão).

---

### 4.2 — Batida do Coração (o ruído aleatório)

**O que faz.** É a camada que dá "vida" ao preço. A cada tick, ela aplica um empurrãozinho **aleatório** (às vezes para cima, às vezes para baixo, em média zero). É a tremedeira natural de qualquer bolsa.

**Como funciona.** O motor sorteia um número aleatório e multiplica por três coisas: (1) o **sigma**, que é o "volume" do tremor; (2) o preço atual (assim um clube caro treme mais em reais, mas na mesma porcentagem); (3) dois reguladores de contexto — o freio da meta diária (L9) e o multiplicador da sessão. Pense num metrônomo balançando: o **sigma é a amplitude do balanço**. Quanto maior o sigma, maiores os solavancos.

> **Curiosidade de nome.** "Ornstein-Uhlenbeck" classicamente inclui também o "ímã" que puxa o preço de volta ao centro. Aqui essa parte foi separada de propósito e colocada na camada L2, para não contar duas vezes. **Esta L1 é só o ruído.**

**Impacto na oscilação:** `■■■■□` **Alto** · **AMPLIFICA**
É a **fonte primária** do movimento de cada tick. Sem ela (ou com sigma no mínimo), o preço fica praticamente imóvel. As outras camadas, em geral, só puxam de volta, limitam ou redistribuem o que esta L1 gera.

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **sigma** (por cluster) | 0,01% a 2% por tick | A_TOP 0,18% → B_ILLIQ 0,40% | É o botão de **NERVOSISMO** do clube. Dobrar o sigma tende a dobrar o tamanho típico de cada oscilação. |

**Cenários:**
- **Subir o sigma** → clube mais nervoso e emocionante (gráfico mais movimentado). Bom para engajamento; se exagerar, parece cassino e dispara mais halts.
- **Baixar o sigma** → mercado mais calmo, gráfico quase liso.
- **"Desligar"** → sigma no mínimo (0,01%) praticamente congela o tremor; o preço só reage a notícias, ordens e ao ímã do preço justo.
- **Freios indiretos:** a sessão fechada (multiplicador 0) zera o tremor, e a meta diária (L9) reduz/zera o tremor sozinha quando o clube já oscilou muito no dia.

---

### 4.3 — Ímã do Preço Justo (a âncora)

**O que faz.** É o "ímã" que puxa o preço de volta ao **valor justo** que você definiu para o clube (no painel admin, campo `currentFairValue`). Se o preço está acima do justo, empurra um pouco para baixo; se está abaixo, empurra um pouco para cima. É a força que dá **rumo** ao preço e impede que ele fuja para sempre.

**Como funciona.** A cada tick, a camada olha a **distância** entre o preço atual e o valor justo e devolve uma fração dessa distância como correção. Quanto mais longe, maior o empurrão; ao chegar no justo, o empurrão zera. Pense numa **mola**: esticada longe do repouso, puxa forte; perto do repouso, quase não puxa. Mas há um teto de segurança: por mais esticada que a mola esteja, o empurrão por tick **nunca passa de 0,3% do preço**. Isso garante que mesmo um clube muito mal precificado volte ao justo **gradualmente**, sem solavanco.

**Impacto na oscilação:** `■■■■□` **Alto** · **ANCORA**
É a **única** camada que dá um rumo de longo prazo. Sem ela, o preço faria um passeio aleatório sem centro. Ela não cria oscilação nova — ela a **contém**, definindo o ponto de equilíbrio em torno do qual tudo o mais oscila.

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **theta** (por cluster) | 0,01 a 1,0 | A_TOP 0,12 → B_ILLIQ 0,25 | A **força do ímã**. Subir = preço gruda no justo e volta logo após um susto. Baixar = preço vagueia mais longe por mais tempo. |
| **fundamentalReversionRate** (teto, global) | 0,01% a 5% por tick | 0,3% | O **limite de velocidade do ímã** por tick. Subir = volta mais brusca; baixar = volta lenta e suave. |
| **valor justo** (`currentFairValue`, painel) | — | por clube | Move **para onde** o ímã puxa (não a força). |

**Cenários:**
- **Subir o theta** → clube comportado, gruda no valor justo, corrige rápido qualquer exagero.
- **Baixar o theta** → mercado livre/nervoso, com tendências e oscilações mais longas (o preço pode descolar bastante do justo).
- **"Desligar"** → theta perto de zero (ou qualquer sessão com multiplicador 0): o preço perde o centro de gravidade e fica à mercê só do ruído e das outras forças.

---

### 4.4 — Termômetro de Nervosismo (a volatilidade que pega no embalo)

**O que faz.** Controla o **tamanho** das oscilações (não a direção). Ela mede o quanto o clube andou no último tick e decide se o próximo movimento deve ser maior ou menor. A ideia central é o **"agrupamento de volatilidade"**: dia agitado puxa mais agitação; dia calmo puxa mais calmaria.

**Como funciona.** Pense num termômetro de nervosismo **com memória**. A cada tick ele soma três ingredientes:
1. **omega** — um piso fixo de nervosismo (o mercado nunca vira uma linha reta totalmente).
2. **alpha × (tamanho do último movimento)²** — se o clube deu um pulo grande, isso aquece bastante o termômetro (o "ao quadrado" faz pulos grandes pesarem muito mais).
3. **beta × (nervosismo de antes)** — a **memória**: o nervosismo de hoje herda quase todo o de ontem e esfria devagar.

Com os padrões (alpha 0,12 e beta 0,85), **85% do nervosismo é herdado** do tick anterior. Por isso o nervosismo sobe rápido num susto, mas demora vários ticks para esfriar — é isso que cria os períodos de agitação agrupada. Há um teto de segurança (**vol_cap**): o nervosismo nunca passa de 1,8× o nível base, limitando o tremor a ~1,34% por tick mesmo em pânico.

**Impacto na oscilação:** `■■■■□` **Alto** · **AMPLIFICA (com freio de teto)**
Define a amplitude das oscilações e alimenta o ruído da L1. Sustos viram períodos longos de turbulência. Mas o vol_cap e os multiplicadores de L9/sessão podem reduzir ou até zerar tudo.

**Botões que você controla:** ⚠️ **Estes são GLOBAIS** (valem para todos os clusters de uma vez; o painel não dá nervosismo diferente por cluster via GARCH — para isso use o sigma da L1).

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **garch.alpha** (reatividade a sustos) | 0,01 a 0,50 | 0,12 | Maior = mercado mais explosivo e reativo a choques. |
| **garch.beta** (memória/persistência) | 0,01 a 0,99 | 0,85 | Maior (perto de 0,99) = a agitação demora muito a esfriar (turbulência longa). |
| **garch.omega** (piso de nervosismo) | quase 0 a 0,0001 | 0,000002 | Ajuste fino do piso; efeito visível pequeno. |
| **garch.vol_cap** (teto de segurança) | 1,0 a 5,0 | 1,8 | Maior = libera oscilações enormes em stress; em 1,0 trava o nervosismo no nível base. |

> **Regra de ouro:** alpha + beta não deve passar de ~1. Os dois altos juntos deixam a agitação quase eterna. O teto do beta (0,99) existe justamente para isso.

**Cenários:**
- **Subir alpha** → reação forte ao último movimento (mercado "elétrico").
- **Subir beta** → turbulência grudada, sensação de mercado "ligado" por muito tempo.
- **Subir vol_cap** → oscilações muito maiores em stress (pode disparar o disjuntor mais fácil).
- **"Desligar"** → não dá pelos parâmetros (são clampados, nunca chegam a zero). O "freeze" real vem de fora: meta diária L9 chegando a zero, ou sessão fechada.

---

### 4.5 — Empurrão da Fila de Ordens (compra vs venda)

**O que faz.** É a camada que liga **ordens REAIS de gente comprando e vendendo** ao preço. A cada tick ela olha quanto volume quer comprar e quanto quer vender naquele clube. Mais gente comprando → empurra para cima; mais gente vendendo → empurra para baixo. E tem memória: a pressão não some de um tick para o outro, vai esfriando aos poucos.

**Como funciona.** Primeiro calcula um "placar" do desequilíbrio: `(compra − venda) ÷ (compra + venda)`, que fica sempre entre **−1** (só venda) e **+1** (só compra), com 0 sendo empate. Depois mistura com o placar anterior (uma média com memória). O **rho** diz quanto da pressão antiga se mantém. Por fim, multiplica pelo **alphaOfi** (a força do empurrão) e pelo preço — e ainda escala esse empurrão pelo **dimmer de sessão** (de madrugada some, no pregão é força total). Analogia: uma fila de torcedores empurrando uma roleta — o placar é para que lado empurram mais; o rho é a inércia da roleta; o alphaOfi é a força do braço de cada um. Se não há **nenhuma** ordem pendente, o empurrão do tick é zero — mas a memória **não congela**: o placar continua esfriando sozinho (`novo = rho × anterior`), convergindo para zero sem trocar de sinal.

**Impacto na oscilação:** `■■■□□` **Médio** · **AMPLIFICA**
O empurrão por tick é pequeno — no máximo ~0,2% do preço na raridade mais sensível (B_ILLIQ), e bem menos nos demais (≈0,03% no A_TOP, 0,05% no A_MID, 0,08% no A_SMALL, 0,12% no B_LIQUID), caindo ainda mais fora do pregão. Mas, como há memória, ele **se acumula** e gera tendências direcionais ao longo de vários ticks.

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **ofiDecay / rho** (memória, por cluster) | 0,5 a 0,9999 | A_TOP 0,91 → B_ILLIQ 0,97 | Maior = a pressão "gruda" por mais ticks (tendências longas, mais momentum). Menor = pressão evapora rápido (oscilação curta e nervosa). |
| **alphaOfi** (força) | ⚠️ **não está no painel** — só via código | A_TOP 0,0003 → B_ILLIQ 0,0020 | Quanto cada unidade de desequilíbrio pesa no preço. |

**Cenários:**
- **Subir o rho** → mercado "teimoso": após uma onda de compra/venda, o preço continua andando na mesma direção por mais tempo (parece mais "inteligente").
- **Baixar o rho** → imediatista e ruidoso, sem rastro de momentum.
- **"Desligar"** → na prática, baixar tudo ou desligar o Order Flow (ver §5.3) corta o elo entre as ordens reais e o preço: o jogo perde o feedback "minha aposta moveu o mercado".

---

### 4.6 — Empurrão da Ordem Grande (impacto de tamanho)

**O que faz.** Faz o preço se mover quando entra **muita ordem de uma vez**. A ideia: ordem grande mexe mais que ordem pequena. Tem um detalhe de "viés": **compra grande sobe MAIS do que venda grande desce** (simulando que comprador agressivo costuma carregar informação positiva).

**Como funciona.** Pense numa **piscina**: jogar um balde de água faz mais onda numa piscina pequena (clube ilíquido) do que num lago (clube grande). A matemática é: o empurrão é proporcional a `(fluxo líquido ÷ volume base do clube) × preço × fator de impacto (lambda)`, onde **fluxo líquido = |compra − venda|**. Repare: o que conta é o **desequilíbrio**, não o volume bruto — se compra e venda se anulam (book equilibrado), o empurrão é **exatamente zero**. O sinal (subir/descer) segue o lado dominante. Quanto menor o volume base, maior a "onda": por isso o lambda cresce do A_TOP (0,0001) ao B_ILLIQ (0,003) — **30× maior** numa raridade. Há ainda um leve viés de compra: quando o lado dominante é compra, multiplica por **1,01 a 1,02** (na venda, sem bônus), inclinando de leve para alta ao longo do tempo. O empurrão final também é escalado pelo dimmer de sessão.

**Impacto na oscilação:** `■■■□□` **Médio** · **AMPLIFICA**
Soma um empurrão quando há desequilíbrio de fluxo, muito mais forte em clubes pequenos. Mas é contido por design (calibrado abaixo de 0,35%/tick) e cortado pelo limite de velocidade (L8).

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **lambda_scale** (global) | 0,1× a 5× | 1,0× (neutro) | Multiplica o lambda de **todos** os clusters de uma vez. Subir = qualquer onda de ordens mexe muito mais o preço. Baixar a 0,1 = o volume quase não move o preço. |

> O viés compra-vs-venda (1,01–1,02) e os lambdas por cluster são **fixos no código** — o painel só dá o multiplicador global uniforme.

**Cenários:**
- **Subir lambda_scale** → mercado "nervoso a fluxo": emocionante, mas arriscado em clubes pequenos (que já partem de lambda alto).
- **Baixar a 0,1** → quase desliga o efeito de tamanho; oscilações passam a vir do ruído (L1) e dos fundamentos (L2).

---

### 4.7 — Digestão de Notícias (a fila de pressão)

**O que faz.** Cuida do impacto de **NOTÍCIAS** sobre o preço. Quando uma notícia entra (clube vendeu craque, ganhou título, escândalo), ela **não** joga o preço todo de uma vez. Ela espalha o impacto ao longo de vários ticks: primeiro um empurrão forte, depois um "rabo" de ajuste que vai sumindo.

**Como funciona.** Pense numa notícia como um copo de **tinta jogado num aquário**: a cor não aparece toda de uma vez, ela se espalha e depois dilui. O motor pega a força da notícia (de −1 a +1) e a aplica em duas fases ao longo de uma janela de ~50 ticks (**≈8 minutos** a 10s/tick):
- **Fase 1 — Espalhamento (~10 ticks):** empurrão forte, começa em 100% e cai para ~50% da força.
- **Fase 2 — Absorção (~40 ticks):** o que sobrou derrete de 50% até zero.

Por cima, há um **teto por tick**: por mais forte que seja a notícia, um único tick nunca move mais de **±2,5%** do preço. Sem notícia ativa, a camada fica invisível (empurrão zero). Dá para ter várias notícias na fila ao mesmo tempo.

**Impacto na oscilação:** `■■■■□` **Alto** · **MISTO**
É a **maior fonte de movimento direcional e sustentado** do motor (cria tendências visíveis de alta/baixa). Ao mesmo tempo, o desenho em duas fases + o teto de 2,5%/tick **amortece** (em vez de um pulo único gigante, vem espalhado). **Só atua quando há notícia** — em regime calmo, é neutra.

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **pressure_spread_ticks** (fase forte) | 1 a 100 ticks | 10 (~1,7 min) | Maior = a notícia bate forte por mais tempo (pico sustentado). Muda o **ritmo**, não o tamanho total. |
| **absorption_ticks** (rabo) | 5 a 200 ticks | 40 (~6,7 min) | Maior = o efeito demora mais a sumir (mercado "lembra" da notícia por mais tempo). |
| **spot_cap** (teto por tick) | 0,1% a 10% | 2,5% | Maior = notícias dão solavancos mais bruscos por tick. Menor = força tudo a entrar suave. Não muda o efeito total, só a velocidade por tick. |

**Cenários:**
- **Subir spread + absorption** → mercado "narrativo", tendências longas por notícia.
- **Reduzir os dois** → reação rápida e efêmera.
- **"Desligar"** → não há liga/desliga próprio; basta não injetar notícias. Levar o spot_cap ao mínimo (0,1%) quase neutraliza o impacto instantâneo.

---

### 4.8 — Micro-choque anti-travamento (L7.5 Nudge)

**O que faz.** É um "cutucão" de emergência contra preço travado. Se um clube passou **150 ticks (~25 min, a 10s/tick) sem variar nada**, esta camada aplica um micro-choque de **±0,01** só para o gráfico não virar uma linha reta morta.

**Como funciona.** É um detalhe estético/de vivacidade. Não tem botão no painel — as constantes (150 ticks, 0,01 de delta, piso de R$ 1,00) são fixas no código.

**Impacto na oscilação:** `■■□□□` **Baixo** · **AMPLIFICA (só em clube parado)**
Praticamente invisível num clube que já se mexe; só age para tirar um clube do "coma".

**Botões que você controla:** ⚠️ **Nenhum no painel** (fixo no código).

---

### 4.9 — Limite de Velocidade (a trava anti-disparada)

**O que faz.** É um **teto de segurança** que limita o quanto o preço pode subir OU cair num único tick. Depois que todas as camadas anteriores (L1 até L7.5) **e o empurrão dos robôs** somam suas forças, esta camada **apara** o resultado se ele passar do limite. Padrão: **0,35% do preço por tick**, para cada lado. Ela não empurra o preço em direção nenhuma — só impede exageros.

**Como funciona.** Pense num **limitador de velocidade de carro**: o motor pode querer ir a 200 km/h, mas o limitador trava em 100. As camadas de cima dizem "quero mover X%"; se X for maior que o teto, o L8 corta para o teto; se for menor, deixa passar inteiro. É simétrico (trava subidas e quedas igual).

> **Atenção:** o L8 roda **duas vezes**. Primeiro corta a soma das camadas L1–L7.5 **+ o empurrão dos robôs**; depois que a Correlação (efeito manada) entra, o L8 é **reaplicado sobre o total** (camadas + robôs + correlação). Por isso o movimento final **respeita o teto de 0,35%/tick** — a correlação também passa pela trava. Só o freio de aproximação e o disjuntor agem depois, e no limite o disjuntor pode descartar o tick inteiro.

**Impacto na oscilação:** `■■■■□` **Alto** · **LIMITA**
É o teto duro que define a amplitude máxima de cada tick. Não gera oscilação, mas é o que impede uma disparada quando OFI + Kyle + notícia + ruído somam muito.

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **velocityCap.max_per_tick** (por cluster) | 0,01% a 5% por tick | 0,35% (igual nos 5 clusters) | Subir (ex.: 1–2%) = mercado mais nervoso, candles maiores, reações rápidas. Baixar (ex.: 0,1%) = movimentos lentos e arrastados, sensação de estabilidade. |

**Cenários:**
- **Subir** → mercado mais volátil e dramático.
- **Baixar** → os mesmos eventos viram movimentos lentos (uma notícia forte demora mais a refletir no preço).
- **"Desligar"** → não dá (o piso é 0,01%, nunca zero). Subir a 5% libera quase todo movimento; descer a 0,01% quase congela.
- **Dica:** hoje o teto é **igual** nos 5 clusters. Se quiser diferenciar (deixar raridades mais selvagens), ajuste cluster a cluster.

---

### 4.10 — Efeito Manada (correlação entre clubes)

**O que faz.** Faz clubes do **mesmo grupo (cluster)** e do **mesmo estado** se moverem parcialmente juntos, criando um **"efeito manada"** controlado. É o que faz um rali ou uma queda parecerem "do mercado", não de um clube isolado.

**Como funciona.** A cada tick, para cada clube, o motor olha quanto os "colegas" do mesmo cluster e estado subiram/caíram no tick **anterior**, tira a média e empurra o preço um pouquinho na mesma direção. O quanto ele segue depende do **rho** (força da imitação): gigantes (A_TOP) imitam mais (0,35); pequenos quase nada (0,05). Mesmo estado adiciona +0,10. Analogia: um **cardume** — peixes grandes arrastam o cardume junto; peixes isolados nadam mais sozinhos. Para evitar avalanche (todo mundo derrubando todo mundo), há uma trava própria minúscula: no máximo ~**0,07% por tick**.

> **Detalhe importante:** a Correlação entra **depois** do primeiro corte do L8, mas também respeita o teto: o L8 é **reaplicado sobre o total já com a correlação**, então o movimento final respeita o teto de 0,35%/tick. A correlação ainda tem a sua trava própria minúscula (~0,07%/tick), além do freio de aproximação e do disjuntor.

**Impacto na oscilação:** `■■■□□` **Médio** · **MISTO**
Amplifica movimentos coletivos, mas com tetos pequenos de propósito (para não virar cascata).

**Botões que você controla:** ⚠️ **Nenhum no painel.** Tudo aqui é **constante no código**: `CLUSTER_RHO` (força por cluster), `REGIONAL_RHO` (0,10, mesmo estado), `CORRELATION_CAP_PERCENT` (0,07%, o teto). Mudar exige **deploy de código**.

**Cenários (só via código):** subir o rho do A_TOP deixa o topo do mercado mais "manada"; zerar rho ou o cap neutraliza a correlação (clubes oscilam isolados).

---

### 4.11 — Freio de Aproximação (L9.5, evita o disjuntor em loop)

**O que faz.** É um freio inteligente que entra **perto do limite do disjuntor**. Conforme o preço se afasta da âncora e chega perto da banda de halt, ele reduz **só os empurrões que AFASTAM** o preço da âncora (os que aproximam de volta passam livres). Objetivo: chegar suave na borda, em vez de bater no disjuntor e ficar disparando halt em loop.

**Como funciona.** Começa a frear em **5%** de afastamento e zera (freia totalmente o que afasta) em **7%**. Como o disjuntor dispara em 8%, isso deixa **1% de folga** — uma "zona de amortecimento" antes do congelamento.

**Impacto na oscilação:** `■■■□□` **Médio** · **LIMITA (direcional)**
Suaviza a chegada na borda. Sem ele, o preço bateria seco no disjuntor com mais frequência.

**Botões que você controla:** ⚠️ **Nenhum no painel** (5% e 7% são fixos no código).

---

### 4.12 — O Disjuntor (Circuit Breaker)

**O que faz.** É a **última linha de defesa**. Se o preço candidato (depois de somar tudo) estiver a **8% ou mais** de distância do preço de fechamento do dia (**20%** se houver notícia ativa), ele **descarta o movimento daquele tick**, mantém o preço onde estava e **congela o clube por ~5 minutos**.

**Como funciona.** Pense num **fusível**: quando a corrente passa do limite, ele desarma e só religa depois de um tempo. A cada tick, antes de aceitar o novo preço, o motor mede a distância até o fechamento. Se bate o gatilho, não aplica o movimento e marca o clube como pausado; o motor agenda a volta automática. Há também um portão no começo do tick: se o clube já está pausado, o motor nem processa. O "fechamento" de referência é re-fixado **uma vez por dia, na pré-abertura** (não a cada virada de sessão), e o gatilho de cada clube vem do parâmetro do seu cluster no painel (com o padrão de 8% como fallback).

**Impacto na oscilação:** `■■■■■` **Crítico** · **LIMITA**
É o teto absoluto da oscilação: nenhum movimento aceito leva o preço a mais de 8% (ou 20% sob notícia) do fechamento. Mexer no gatilho **redesenha o quanto o produto inteiro pode balançar** num dia.

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **circuitBreaker.halt_trigger** (gatilho) | 1% a 50% | 8% | Baixar (ex.: 4%) = muitas paradas, mercado "travado/protegido". Subir (ex.: 20%) = dias selvagens, halts raros. |
| **circuitBreaker.halt_duration_s** (castigo) | 10s a 3600s | 300s (5 min) | Quanto tempo o clube fica congelado após desarmar. |
| **NEWS_CB_THRESHOLD** (gatilho sob notícia) | ⚠️ **fixo no código** | 20% | Gatilho mais frouxo enquanto há notícia, para a curva de absorção (~50 ticks) não ser cortada no meio. |

> **Volta suave da notícia.** Quando a notícia expira, o gatilho **não** salta de 20% de volta para 8% de uma vez: ele **desce gradualmente** de 20% até 8% ao longo de uma janela de carência (`NEWS_CB_GRACE_TICKS`, padrão **60 ticks ≈ 10 min**, ajustável por variável de ambiente), dando tempo ao preço de voltar para dentro da banda normal sem ser congelado.

**Cenários:**
- **Baixar o halt_trigger** → mercado nervoso/protegido (muitas paradas, preço anda pouco antes de travar).
- **Subir o halt_trigger** → dias mais voláteis e dramáticos.
- **"Desligar"** → não dá pelo painel (mínimo 1% = quase tudo trava; máximo 50% = quase nunca dispara).

---

## 5. Subsistemas de apoio

Estes **não entram na soma de empurrões** como L1–L10, mas influenciam o resultado tanto (ou mais) que as camadas.

---

### 5.1 — Relógio do Mercado (as sessões)

**O que faz.** Olha que horas são (Brasília) e decide a fase do dia. Cada fase tem um **multiplicador de volatilidade** — um "dimmer" que escala **todas** as oscilações de **todos** os clubes ao mesmo tempo.

**Como funciona.** Pense num **botão dimmer de luz** aplicado ao mercado inteiro:

| Sessão | Multiplicador padrão | O que significa |
|--------|---------------------|-----------------|
| **TRADING** (pregão) | **1,00** | Luz total — a referência |
| **PRE_OPENING** (pré-abertura) | 0,30 | 30% da força |
| **CLOSING_CALL** (leilão de fechamento) | 0,20 | 20% |
| **AFTER_MARKET** (pós-pregão) | 0,10 | 10% |
| **CLOSED** (madrugada/fechado) | **0,00** | Apagado — preços congelados |

Esse fator multiplica o ruído (L1), o nervosismo (L3) **e também o ímã do preço justo (L2)**. Por isso, de madrugada (fator 0), não só o tremor para: o próprio puxão de volta ao justo congela, e os preços ficam **literalmente parados** onde fecharam.

**Impacto na oscilação:** `■■■■■` **Crítico** · **MISTO**
É o **dimmer mestre**: amplifica (fator >1), amortece (<1) ou congela (0) o movimento de todos os clubes de uma vez. É o controle de **maior alcance** da pilha.

**Botões que você controla:**

| Botão | Faixa segura | Padrão | O que faz |
|-------|--------------|--------|-----------|
| **vol_multiplier por sessão** | 0 a 5 | TRADING 1,0 etc. | Subir TRADING de 1,0 para 2,0 quase **dobra** o tamanho típico dos solavancos no pregão inteiro, em todos os clubes. Zerar uma sessão congela os preços nela. |

> **Dois efeitos colaterais:** (1) zerar uma sessão também desliga a correção ao valor justo (L2) nela; (2) o teto clampa em 5× — você não passa disso mesmo digitando mais.

**Cenários:**
- **Subir TRADING** → pregão mais nervoso e volátil (o botão de maior impacto, pois é a maior parte do dia).
- **Subir CLOSED acima de 0** → o mercado passa a oscilar de madrugada (deixa de existir "mercado fechado" de fato).
- **Limitação:** é global por horário — não dá para deixar só um cluster mais nervoso por aqui (para isso, use os parâmetros de cluster).

---

### 5.2 — O DNA dos clubes (os 5 Clusters)

**O que faz.** Os clusters **não são uma camada** — são a "ficha de DNA" de cada classe de clube, que **alimenta todas as camadas**. Cada clube é classificado em uma de 5 categorias, e cada categoria carrega parâmetros-base diferentes que dizem "quanto este tipo de clube costuma balançar, com que força volta ao normal, e quanto uma ordem grande mexe nele".

**As 5 categorias (do gigante à raridade):**

| Cluster | Perfil | sigma (tremor) | theta (ímã) | lambda (impacto) | volume base |
|---------|--------|----------------|-------------|------------------|-------------|
| **A_TOP** | Gigantes super-negociados | 0,18% | 0,12 | 0,0001 | 50.000 |
| **A_MID** | Grandes | 0,25% | 0,18 | 0,0002 | 20.000 |
| **A_SMALL** | Médios | 0,32% | 0,08 | 0,0005 | 8.000 |
| **B_LIQUID** | Pequenos com algum movimento | 0,35% | 0,23 | 0,001 | 3.000 |
| **B_ILLIQ** | Raridades quase paradas | 0,40% | 0,25 | 0,003 | 500 |

**A intuição:** num clube gigante há tanta gente negociando que um pedido se dilui e quase não move o preço. Numa raridade, um único pedido grande é enorme em relação ao que se negocia, então o preço pula. Por isso a "escada": quanto mais raro, **mais nervoso e brusco**.

**Impacto na oscilação:** `■■■■■` **Crítico** · **MISTO**
Mexer num parâmetro de cluster **reescala todas as camadas** que leem aquele parâmetro, e ao mesmo tempo para **todos os clubes** daquela categoria. É o ponto de controle mais poderoso — e mais perigoso.

**Botões que você controla (no painel):** `sigma`, `theta`, `spread_base` e `rho` (ofiDecay) — **por cluster**; e `lambda_scale`, GARCH — **globais**.

**⚠️ Botões que NÃO obedecem ao painel** (só código/banco): `baseVolume` (tamanho do mercado) e `alphaOfi` (força do fluxo).

**Cenários:**
- **Subir o sigma de B_ILLIQ** → raridades muito mais nervosas, sem tocar nos gigantes.
- **Baixar o theta de A_TOP** → gigantes vagueiam mais longe do justo (mais tendência).
- **"Desligar" um cluster** → não dá (clamps impedem zerar); o mais perto é sigma no mínimo + theta no máximo (preço quase imóvel, colado no justo).

---

### 5.3 — A porta das ordens reais (Order Flow)

**O que faz.** É o "cano" que transforma as ordens reais dos usuários em **pressão** que as camadas L4 (fila) e L5 (ordem grande) usam. A cada tick, tira uma "foto" (snapshot) de quanto volume quer comprar e quanto quer vender em cada clube. É o elo que liga **o comportamento de quem usa o app** às oscilações.

**Como funciona.** A cada tick o motor pergunta ao banco: "quanto de compra e de venda está pendente para este clube?". Soma separadamente compras e vendas (distinguindo ordens a mercado das ordens com preço-alvo) e entrega esses números para a L4 e a L5. Em paralelo, executa as ordens a mercado e dispara as ordens-limite quando o preço atinge o alvo.

**Impacto na oscilação:** `■■■■□` **Alto** · **AMPLIFICA (condicionado ao volume real)**
É a única ponte entre o que os usuários fazem e a oscilação. Especialmente potente em raridades. Quando não há ordens, fica neutra.

**Botões que você controla:**

| Botão | Onde | O que faz |
|-------|------|-----------|
| **ofiDecay / rho** | Painel (por cluster) | Memória da pressão (ver §4.5). |
| **lambda_scale** | Painel (global) | Sensibilidade a ordens grandes (ver §4.6). |
| **ORDER_FLOW_SNAPSHOT_ENABLED** | ⚠️ **variável de ambiente** (não Redis) | **Kill-switch de emergência.** Em `false`, a foto vem zerada → L4 e L5 param de empurrar → o preço passa a oscilar só por ruído/âncora/correlação, **ignorando os usuários** (mercado "fake"). |
| **alphaOfi, baseVolume** | ⚠️ **só código/banco** | Ganho do fluxo e liquidez presumida. |

> **Nota operacional:** o painel tem **cache de 10 segundos** — mudanças demoram até ~10s para valer. Clubes pausados não processam ordens.

---

### 5.4 — Robôs de mercado e trava de margem

**O que faz.** Cuida do "mercado vivo" e do risco, em duas frentes:
1. **Agentes de liquidez (robôs):** **6 tipos** de traders sintéticos por clube — Market Maker, Momentum (seguidor de tendência), Contrarian, Value Investor (fundamentalista), Random Trader (ruído) e Panic Seller — que geram volume e movimento mesmo quando há poucos usuários reais.
2. **Chamada de margem:** vigia as posições vendidas (short). Se a garantia consumida passa de 50%, alerta; se passa de 80% (sobra <20%), **liquida** a posição à força e protege o saldo do usuário para nunca ficar negativo.

> **Como os robôs entram no preço (regras atuais):**
> - O **Market Maker só age quando o book está realmente largo** (spread fracional acima de ~0,1%); em book apertado ele fica parado.
> - O impacto dos robôs é uma **lei sublinear de Kyle** sobre o **fluxo líquido assinado** (compra − venda): book equilibrado dá impacto ≈ 0, e dobrar o fluxo multiplica o impacto por ~1,41 (não por 2). Há uma **salvaguarda final de ±2%**, raramente atingida em regime normal.
> - O empurrão dos robôs entra **dentro** da pilha de cálculo (antes do limite de velocidade e do disjuntor), então passa pela trava de 0,35%/tick e pelo disjuntor **como qualquer outra força**.
> - Os robôs respeitam o **dimmer de sessão**: abaixo de 50% de luz (madrugada, after-market), o tick inteiro dos agentes vira "não fazer nada".

**Como funciona.** A cada tick, os robôs do clube decidem comprar/vender/segurar **antes** da pilha de camadas. O resultado vira um único **empurrão agregado** (lei de Kyle, sublinear, com salvaguarda de ±2%) e um **volume sintético** — e esse empurrão é somado às camadas L1–L7.5 e passa pelo limite de velocidade (L8) e pelo disjuntor (L10), igual a qualquer outra força.

A **liquidação de margem** fecha o short com uma recompra (BUY), que pode dar um gás extra a uma alta já em curso (efeito secundário). A liquidação usa uma **trava anti-corrida** (claim atômico `OPEN → CLOSED` dentro de uma transação serializável): se dois fluxos tentarem liquidar a mesma posição ao mesmo tempo, **só um vence** e o outro vira no-op — sem crédito/liberação em dobro. Os valores (PnL, retorno, saldo) são **recalculados a partir da releitura fresca** da posição dentro da transação.

**Impacto na oscilação:** `■■■□□` **Médio** · **MISTO**
Os robôs mantêm o mercado vivo (volume e movimento) quando há poucos usuários: ruído amplifica, momentum amplifica tendência, formador de mercado e fundamentalista amortecem. Eles contribuem **dentro do mesmo teto de 0,35%/tick** das demais forças.

**Botões que você controla:** ⚠️ **Nenhum no painel.** Tudo aqui é **constante no código** (ou variável de ambiente): pesos/contagens dos agentes por cluster, lambda de Kyle por cluster, a salvaguarda de ±2% do agregado, o gate de sessão (50%) e os limites de margem (50%/20%).

---

## 6. O Painel de Controle

### Como funciona

O painel vive no **Redis**, na chave `motor:layers:config:v1`. O motor o lê **a cada tick** (com cache de ~10 segundos) e ajusta o comportamento das camadas. Toda mudança que você faz é o motor que aplica no próximo ciclo — você não precisa reiniciar nada.

**Trava de segurança (clamp).** Todo valor que você coloca é cortado para uma faixa segura. Se você digitar algo absurdo (sigma = 10, por exemplo), o motor usa o máximo permitido (2%) e ignora o resto. Isso impede que um ajuste errado quebre o mercado.

**Quando o painel está vazio:** o motor cai nos valores-padrão de fábrica de cada cluster.

> 🔎 **Status verificado em produção (2026-06-17): o painel está VAZIO hoje.** A chave Redis `motor:layers:config:v1` **não existe** no ambiente de produção (confirmado por leitura direta do Redis vivo). Isso significa que, neste momento, **todos os valores que este manual chama de "padrão" são os valores que estão de fato rodando** — não há nenhum override de admin ativo. Dois corolários práticos: (1) para ajustar o mercado, você precisa **criar** a config no Redis (não há nada para "editar"); (2) os únicos overrides de produção hoje são por variável de ambiente — `MOTOR_TICK_INTERVAL_MS=10000` (tick 10s) e `MOTOR_TICK_DT_SECONDS` ausente (`dt=1.0`). O velocity cap vivo é **0,35%** (não há override).

### Tabela completa de botões do painel

| Camada | Botão | Escopo | Faixa segura | Padrão |
|--------|-------|--------|--------------|--------|
| L1 Ruído | `ou.sigma` | por cluster | 0,0001–0,02 | 0,0018–0,0040 |
| L2 Ímã | `ou.theta` | por cluster | 0,01–1,0 | 0,12–0,25 |
| L2 Ímã | `fundamentalReversion.reversion_rate` | global | 0,0001–0,05 | 0,003 |
| L3 Nervosismo | `garch.alpha` | global | 0,01–0,50 | 0,12 |
| L3 Nervosismo | `garch.beta` | global | 0,01–0,99 | 0,85 |
| L3 Nervosismo | `garch.omega` | global | 1e-7–1e-4 | 0,000002 |
| L3 Nervosismo | `garch.vol_cap` | global | 1,0–5,0 | 1,8 |
| L4 Fila | `ofi.rho` (ofiDecay) | por cluster | 0,5–0,9999 | 0,91–0,97 |
| L5 Ordem grande | `kylesLambda.lambda_scale` | global | 0,1–5,0 | 1,0 |
| L7 Notícias | `pressureQueue.pressure_spread_ticks` | global | 1–100 | 10 |
| L7 Notícias | `pressureQueue.absorption_ticks` | global | 5–200 | 40 |
| L7 Notícias | `pressureQueue.spot_cap` | global | 0,001–0,10 | 0,025 |
| L8 Limite | `velocityCap.max_per_tick` | por cluster | 0,0001–0,05 | 0,0035 |
| L10 Disjuntor | `circuitBreaker.halt_trigger` | por cluster | 0,01–0,50 | 0,08 |
| L10 Disjuntor | `circuitBreaker.halt_duration_s` | global | 10–3600 | 300 |
| Sessões | `sessionManagement.sessions[].vol_multiplier` | por sessão | 0–5 | ver §5.1 |

### Controles manuais (override do admin)

Além do painel de parâmetros, o admin tem ações diretas: **pausar/retomar um clube**, **pausar tudo/retomar tudo** (emergência), **ajustar preço manualmente** (re-ancora o fechamento para não disparar o disjuntor) e **injetar notícia** (relaxa o disjuntor para 20% durante a janela).

---

## 7. Tabela mestra de impacto

Ranking de cada camada/subsistema por quanto afeta a oscilação que o usuário vê:

| # | Camada / Subsistema | Impacto | Direção | Ajustável no painel? |
|---|---------------------|---------|---------|----------------------|
| 1 | **Clusters (DNA dos clubes)** | `■■■■■` Crítico | MISTO | Parcial (sigma/theta/spread/rho sim; volume/alpha não) |
| 2 | **Sessões (relógio)** | `■■■■■` Crítico | MISTO | Sim (multiplicador por sessão) |
| 3 | **Disjuntor (L10)** | `■■■■■` Crítico | LIMITA | Sim (gatilho + duração) |
| 4 | **Ruído / Batida do coração (L1)** | `■■■■□` Alto | AMPLIFICA | Sim (sigma) |
| 5 | **Ímã do Preço Justo (L2)** | `■■■■□` Alto | ANCORA | Sim (theta + teto) |
| 6 | **Termômetro de Nervosismo (L3)** | `■■■■□` Alto | AMPLIFICA | Sim (global: alpha/beta/cap) |
| 7 | **Digestão de Notícias (L7)** | `■■■■□` Alto | MISTO | Sim (ritmo + teto) |
| 8 | **Limite de Velocidade (L8)** | `■■■■□` Alto | LIMITA | Sim (max por tick) |
| 9 | **Meta de Volatilidade do Dia (L9)** | `■■■■□` Alto | LIMITA | Não (só indireto) |
| 10 | **Order Flow (porta das ordens)** | `■■■■□` Alto | AMPLIFICA | Parcial (rho/lambda sim; kill-switch via env) |
| 11 | **Empurrão da Fila (L4)** | `■■■□□` Médio | AMPLIFICA | Sim (rho) |
| 12 | **Empurrão da Ordem Grande (L5)** | `■■■□□` Médio | AMPLIFICA | Sim (lambda_scale global) |
| 13 | **Efeito Manada (Correlação)** | `■■■□□` Médio | MISTO | Não (código) |
| 14 | **Freio de Aproximação (L9.5)** | `■■■□□` Médio | LIMITA | Não (código) |
| 15 | **Robôs + Margem** | `■■■□□` Médio | MISTO | Não (código) |
| 16 | **Cutucão anti-travamento (L7.5)** | `■■□□□` Baixo | AMPLIFICA | Não (código) |

---

## 8. Receitas práticas de ajuste

> Todas usam **só os botões do painel**. Comece sempre com mudanças pequenas e observe alguns minutos (lembre do cache de ~10s).

**"Quero o mercado mais emocionante (mais oscilação)"**
1. Suba o `sigma` dos clusters em ~20–30% (começa pelos pequenos: B_LIQUID, B_ILLIQ).
2. Suba o `velocityCap.max_per_tick` de 0,35% para ~0,6–0,8% (deixa os candles maiores).
3. Opcional: suba `garch.beta` para ~0,90 (turbulência dura mais).
4. ⚠️ Cuidado: isso aproxima do disjuntor — você verá mais halts. Se incomodar, suba também o `halt_trigger` (ex.: 8% → 12%).

**"Quero acalmar o mercado (mais estável)"**
1. Baixe o `sigma` dos clusters em ~20–30%.
2. Suba o `theta` (ímã mais forte → o preço gruda no justo).
3. Baixe o `velocityCap.max_per_tick` para ~0,15–0,2%.
4. Opcional: baixe `garch.alpha` (menos reação a sustos).

**"Notícias estão dando solavancos bruscos demais"**
1. Baixe o `pressureQueue.spot_cap` de 2,5% para ~1% (espalha o impacto por mais ticks).
2. Suba o `absorption_ticks` (o efeito vira mais longo e suave).

**"O mercado parece morto/parado durante o dia"**
1. Verifique a **sessão**: fora do pregão o dimmer é baixo de propósito. Se for de madrugada (CLOSED = 0), é esperado.
2. Se for no pregão: pode ser a **meta diária** se esgotando — suba um pouco o `sigma` para repor energia, mas saiba que ela vai estrangular de novo ao bater 2,5% no dia.
3. Confira se o `ORDER_FLOW_SNAPSHOT_ENABLED` não está em `false` (kill-switch ligado).

**"Emergência: preciso congelar tudo agora"**
1. Use a ação manual **Pausar Tudo (haltAll)** — congela todos os clubes na hora.
2. Ou zere o `vol_multiplier` da sessão atual (congela os preços, mas mantém o mercado "aberto" sem movimento).
3. Para cortar só a influência dos usuários (mantendo o resto): `ORDER_FLOW_SNAPSHOT_ENABLED=false`.

**"Quero raridades mais selvagens, sem mexer nos gigantes"**
1. Suba `sigma`, baixe `theta` e suba `ofiDecay` **apenas** dos clusters B_LIQUID e B_ILLIQ.
2. (O `lambda_scale` é global — evite usá-lo aqui, pois afeta os gigantes também.)

---

## 9. Glossário

| Termo | Em português comum |
|-------|--------------------|
| **Tick** | Uma "batida" do motor (a cada 10 segundos em produção), quando todos os preços são recalculados. |
| **Camada (layer)** | Um pedaço do motor que calcula um empurrãozinho no preço. O preço final é a soma de todos. |
| **Delta** | O tamanho do empurrão (em reais), positivo (sobe) ou negativo (desce). |
| **Sigma** | O "volume" do tremor aleatório de um clube. Maior sigma = mais nervoso. |
| **Theta** | A força do "ímã" que puxa o preço de volta ao valor justo. |
| **Cluster** | Uma das 5 categorias de personalidade do clube (A_TOP a B_ILLIQ). |
| **Valor justo (fair value)** | O preço "correto" do clube definido pelo admin; o ímã puxa para lá. |
| **OFI (Order Flow Imbalance)** | O placar de compra vs venda (de −1 a +1). |
| **Lambda (Kyle)** | O quanto uma ordem grande move o preço. |
| **GARCH** | O modelo do "termômetro de nervosismo" (volatilidade com memória). |
| **Circuit breaker (disjuntor)** | A trava que congela o clube se o preço se afasta demais (8%/20%) do fechamento. |
| **Velocity cap** | O limite de quanto o preço pode mexer num único tick (0,35% padrão). |
| **Sessão** | A fase do dia (pré-abertura, pregão, fechamento, after, fechado). |
| **Multiplicador de volatilidade** | O "dimmer" que liga/abaixa a força das oscilações por horário. |
| **Clamp (trava)** | O corte de segurança que mantém todo valor do painel dentro da faixa permitida. |
| **Redis** | O lugar onde o painel de configuração fica guardado e de onde o motor lê. |
| **Halt** | Clube congelado (parado de negociar) por um tempo. |
| **Short / margem** | Aposta na queda do preço; a margem é a garantia que cobre o risco dessa aposta. |
