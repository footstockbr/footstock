FootStock
A Bolsa do Futebol
Manual do Usuário · Versão 1.0 · 2026
"Invista nos clubes que voce torce."
O primeiro mercado de capitais simulado do futebol brasileiro.
40
Ativos negociáveis
116
Termos no Glossário
5
Tipos de Ordem
footstock.app · BETA · Confidencial
FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
footstock.app · Confidencial Página 2
SUMÁRIO

1. O que é o FootStock?
2. Como Começar
   · Cadastro e Planos
   · Interface e Navegação
3. O Mercado de Ativos
   · Clubes e Tickers
   · Preços e Valuation
   · Gráficos e Indicadores
   · Book de Ofertas e Microestrutura
4. Operações e Ordens
   · Ordem a Mercado
   · Ordem Limitada
   · OCO — Stop Loss e Take Profit
   · Short Selling
   · Ordens Agendadas
5. Carteira e Patrimônio
6. Sessões de Mercado
7. Notícias e Assessor IA
8. Comunidade e Ligas
9. Glossário Educativo
10. Planos e Assinatura
11. Conformidade e Segurança
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 3
    01
    O que é o FootStock?
    O FootStock é um simulador de mercado financeiro com temática futebolística. Funciona como uma
    bolsa de valores ficcionária onde cada clube do futebol brasileiro (Série A e Série B) é representado por
    um ativo — uma cota negociável, com preço determinado por fundamentos reais, fluxo de ordens e
    notícias do mercado.
    O app combina a emoção do futebol com a educação financeira, permitindo que usuários aprendam na
    prática como funcionam preços, ordens, liquidez, volatilidade, correlação entre ativos e outros
    conceitos do mercado de capitais — sem arriscar dinheiro real.
    Pilares do FootStock
    ■ Motor de Mercado Real
    Preços calculados por modelos quant: Ornstein-Uhlenbeck,
    GARCH, Kyle's Lambda e OFI
    ■ Fundamentos Reais
    Valuation baseado em receita, plantel, marca e divida (Sports
    Value / KPMG 2025)
    ■ Notícias Reais
    Feed de noticias reais dos clubes injetadas no motor de
    precos automaticamente
    ■ Assessor IA
    Analise por clube com inteligencia artificial e busca em tempo
    real na web
    ■ Ligas Competitivas
    Crie ou entre em ligas com amigos e dispute rankings de
    rentabilidade
    ■ Glossario Educativo
    116 termos de mercado financeiro explicados com linguagem
    acessivel
    Importante: O FootStock utiliza uma moeda virtual chamada FS$ (FootStockCoin). Todas as transações são
    simuladas e não envolvem dinheiro real. O objetivo é exclusivamente educativo e de entretenimento.
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 4
    02
    Como Começar
    2.1 Cadastro
    O cadastro é gratuito e leva menos de 2 minutos. Você precisará de:
    • Nome completo e e-mail válido
    • Senha (mínimo 6 caracteres)
    • CPF e data de nascimento (para conformidade com LGPD)
    • Telefone com DDD
    • Declaração de ser maior de 18 anos
    2.2 Planos e Saldo Inicial
    Plano Saldo Inicial Cotações Ordens/dia Funcionalidades
    ■ Jogador
    (Grátis) FS$ 2.000 Delay 1h 2/dia Ordem a Mercado
    ■ Craque
    R$ 19,90/mês FS$ 5.000 + 30 min 5/dia + Limite · IA Básica
    ■ Lenda
    R$ 39,90/mês FS$ 25.000 + Tempo real Ilimitado + Short · OCO · IA VIP · 2×
    2.3 Interface e Navegação
    A interface do FootStock é organizada em abas na parte inferior da tela. Todas as telas seguem o
    mesmo cabeçalho padrão:
12. Cabeçalho — Logo, status do mercado, badge do plano e avatar do usuário
13. Banner de patrocinador — Parceiros selecionados
14. Ticker de notícias — Última notícia ao vivo
15. Navegação — Dashboard · Mercado · Carteira · Assessor · Ligas · Notícias
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 5
    03
    O Mercado de Ativos
    3.1 Clubes e Tickers
    O FootStock possui 40 ativos negociáveis — 20 da Série A e 20 da Série B do futebol brasileiro. Cada
    clube é identificado por um ticker de 4 letras (ex: URU3 = Flamengo, POR3 = Palmeiras). Os nomes
    dos clubes são ficcionalizados para fins de simulação, mas os fundamentos financeiros são baseados
    em dados reais de 2024/2025.
    3.2 Valuation e Preço IPO
    O preço de cada ativo no momento do lançamento (IPO) é calculado por uma fórmula multi-fator
    inspirada na metodologia Sports Value/KPMG 2025:
    Componente Descrição Exemplo (Flamengo)
    Receita Anual Faturamento real do clube (2024) R$ 1,54 bilhão
    Múltiplo EV/Receita Calibrado por comparáveis do mercado 3,8× (top Série A)
    Valor do Plantel Transfermarkt dez/2024 R$ 1,4 bilhão
    Valor de Marca Sports Value 6ª ed. 2025 R$ 2,37 bilhões
    Dívida Operacional Deduzida do EV bruto R$ 310 milhões
    Free Float % do equity em circulação 28% (boa governança)
    3.3 Gráficos e Indicadores Técnicos
    Na tela de detalhe de cada ativo, você encontrará gráficos de preço em dois modos:
    • OHLC Candlestick — velas com abertura, máxima, mínima e fechamento
    • Linha — preço de fechamento ao longo do tempo
    Períodos disponíveis: 1H · 1D · 1S · 1M
    Indicadores técnicos (planos Craque e Lenda):
    • MM9 — Média Móvel de 9 períodos (curto prazo, cor âmbar)
    • MM21 — Média Móvel de 21 períodos (médio prazo, cor dourada)
    • Bandas de Bollinger — Volatilidade: SMA20 + 2 desvios-padrão
    • Modo Comparação — Normaliza até 4 ativos em base 100% para comparar performance
    3.4 Motor de Preços
    O motor de mercado do FootStock implementa 6 camadas de realismo, inspiradas nos mercados reais
    da B3:
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 6
    1
    .
    Ornstein-Uhlenbeck Preços gravitam ao Fair Value (mean reversion). Evita deriva infinita.
    2
    .
    GARCH Lite Volatilidade aumenta apos grandes movimentos. Clusters de vol reais.
    3
    .
    Order Flow
    Imbalance
    Pressao acumulada de ordens de compra vs. venda move o preco.
    4
    .
    Kyle's Lambda Suas ordens impactam o preco proporcionalmente ao tamanho.
    5
    .
    Impact Matrix Noticias movem o Fair Value conforme categoria e sentimento.
    6
    .
    Circuit Breaker Ativo suspendido por 5 min se variar +/-8% no dia.
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 7
    04
    Operações e Ordens
    O FootStock oferece 5 tipos de ordem, do mais simples ao mais sofisticado. O acesso a cada tipo
    depende do plano do usuário:
    Tipo de Ordem Descrição Plano
    ■ Ordem a Mercado Execucao imediata ao melhor preco disponivel (Ask na compra, Bid n... Jogador
    ■ Ordem Limitada Define preco maximo de compra ou minimo de venda. Fica pendente ... Craque
    ■ OCO (Stop/TP) Stop Loss + Take Profit simultaneos. Quando um dispara, o outro e c... Lenda
    ■ Short Selling Venda a descoberto: aposte na queda. Margem de 150% bloqueada Lenda
    ■ Ordem Agendada Programada para executar automaticamente em data e hora futuras Craque
    4.1 Ordem a Mercado (Fast)
    A ordem mais simples: executa imediatamente ao melhor preço disponível. Compra: paga o Ask
    (preço do vendedor). Venda: recebe o Bid (preço do comprador). Garante execução, mas não garante
    preço exato. Disponível para todos os planos.
    4.2 Ordem Limitada
    Você define o preço máximo que aceita pagar (compra) ou mínimo que aceita receber (venda). A
    ordem fica pendente no book até o mercado atingir o preço-alvo. Importante: a taxa operacional só é
    cobrada quando a ordem for efetivamente executada. Gerencie suas ordens pendentes em Extrato →
    Precificadas.
    4.3 OCO — One Cancels Other
    Estratégia avançada com dois gatilhos simultâneos:
    • Stop Loss (SL) — venda automática se o preço cair ao nível definido. Protege o capital.
    • Take Profit (TP) — venda automática se o preço subir ao alvo. Garante o lucro.
    Ao disparar um dos gatilhos, o outro é cancelado automaticamente. Gerencie em Extrato → SL / TP.
    4.4 Short Selling
    Venda a descoberto: você vende cotas que não possui, apostando que o preço vai cair. Para abrir um
    short, o FootStock bloqueia uma margem de 150% do valor da operação. Para fechar, você recompra
    as cotas: se o preço caiu, você lucra; se subiu, perde. Risco: teoricamente ilimitado, pois o preço pode
    subir indefinidamente. Gerencie seus shorts em Carteira → Shorts Abertos.
    4.5 Taxa Operacional
    Toda operação executada tem uma taxa operacional baseada no valor negociado:
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 8
    Valor da Operação Taxa
    Até FS$ 500 FS$ 0,25
    FS$ 500 a FS$ 1.000 FS$ 0,35
    Acima de FS$ 1.000 FS$ 0,45
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 9
    05
    Carteira e Patrimônio
    A aba Carteira exibe uma visão completa do seu portfólio e desempenho financeiro dentro do
    FootStock:
    ■ Posições Abertas
    Todos os ativos em carteira com quantidade, preco medio e
    P&L atual
    ■ Patrimônio Total
    Saldo livre + valor atual da carteira em FS$
■ P&L Total
Lucro ou prejuizo consolidado de todas as posicoes
■ Shorts Abertos
Posicoes vendidas a descoberto com margem bloqueada
■ Extrato
Historico completo de todas as operacoes realizadas
Dashboard de Patrimônio
O Dashboard exibe um gráfico de evolução do patrimônio total ao longo do tempo, com filtros de
período: 1H · 12H · 24H · 7D · 30D · 1A · Total. O gráfico registra automaticamente pontos a cada
operação realizada.
Preço Médio e P&L;
O preço médio de cada posição é calculado automaticamente pela média ponderada de todas as
compras. O P&L; (Profit & Loss) é a diferença entre o valor atual da posição e o valor total investido:
P&L; = (Preço Atual − Preço Médio) × Quantidade.
FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
footstock.app · Confidencial Página 10
06
Sessões de Mercado
O FootStock segue um calendário de sessões inspirado na B3 (horário de Brasília). Ordens só são
executadas durante as sessões ativas:
Sessão Horário (Brasília) O que acontece
■ Pré-abertura 10h45 – 11h00 Ordens podem ser registradas. Sem execução.
■ Negociação 11h00 – 00h45 Mercado aberto. Ordens executadas em tempo real.
■ Call de Fechamento 00h45 – 01h00 Leilão de fechamento. Preço de equilíbrio final.
■ After-Market 01h00 – 01h30 Negociação com menor liquidez pós-fechamento.
■ Mercado Fechado 01h30 – 10h45 Sem execuções. Ordens ficam pendentes.
Durante o mercado fechado, você ainda pode explorar ativos, ler notícias, montar estratégias e
gerenciar suas ordens pendentes. O chip de sessão no cabeçalho do app atualiza automaticamente a
cada 15 segundos.
FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
footstock.app · Confidencial Página 11
07
Noticias e Assessor IA
7.1 Feed de Noticias
A aba Notícias exibe um feed atualizado automaticamente a cada 5 minutos com notícias reais sobre
os clubes brasileiros. As notícias são coletadas via RSS e processadas pela IA para extrair sentimento
e impacto no preço.
Como as notícias afetam os preços:
Categoria Impacto Máximo Exemplo
Financeira Crítica ±5,0% Patrocínio master, bloqueio judicial
Esportiva Majoritária ±3,0% Título de campeonato, eliminação
Mercado de Ativos ±2,0% Venda ou contratação de jogador
Integridade / Saúde ±1,5% Doping, lesão de capitão
Institucional ±1,0% Eleição de presidente, aporte SAF
Esportiva Menor ±0,5% Jogo-treino, promoção de jovem
7.2 Assessor IA
O Assessor IA é uma ferramenta de análise fundamentalista que usa inteligência artificial para avaliar
cada clube e recomendar operações. Para cada ativo selecionado, a IA realiza busca em tempo real na
web e retorna:
• Resumo da situação atual do clube
• Pontos positivos (fatores bullish)
• Pontos negativos (fatores bearish)
• Sentimento geral: BULLISH · NEUTRO · BEARISH
• Recomendação: COMPRAR · MANTER · VENDER
• Nível de risco: BAIXO · MÉDIO · ALTO
Disponível em versão básica no plano Craque e versão VIP no plano Lenda.
FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
footstock.app · Confidencial Página 12
08
Comunidade e Ligas
8.1 Comunidade (Forum)
A aba Comunidade é um fórum onde os usuários compartilham análises, estratégias e comentários
sobre os ativos. Funcionalidades:
• Poste comentários de até 280 caracteres
• Filtre por ativo para ver só o que interessa
• Ordene por Recentes ou Top Likes
• Curta os melhores posts
• Conteúdo moderado automaticamente — dados pessoais são removidos
8.2 Ligas Competitivas
As Ligas permitem competir com outros usuários por rentabilidade. Existem três tipos:
Tipo Acesso Características
■ Liga de Amigos Craque+ Privada, link de convite, até 20 jogadores
■ Liga Pública Jogador+ Aberta a todos, ranking global
■ Liga PRO Lenda Com premiação, configurações avançadas
FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
footstock.app · Confidencial Página 13
09
Glossario Educativo
O FootStock possui um Glossário Educativo com 116 termos do mercado financeiro, organizados em
8 categorias. Acesse pelo menu do logo → ■ Glossário.
■ Valuation & Fundamentos
12 termos — IPO, Equity Value, EV, MKT Cap, Fair
Value, Free Float...
■ Mercado & Pregão
13 termos — Sessoes, Book, Bid/Ask, Spread, Circuit
Breaker...
■ Indicadores Tecnicos
12 termos — Candlestick, MM9/MM21, Bollinger,
GARCH, OFI...
■ Tipos de Ordem
9 termos — Market, Limit, OCO, Stop Loss, Take Profit,
Short...
■ Carteira & Rentabilidade
8 termos — P&L;, Preco Medio, Margem, Taxa,
Patrimonio...
■ Sentimento & Analise
5 termos — Sentimento, Impacto de Noticias, Kyle
Lambda...
■ Divisoes & Clubes
4 termos — Serie A/B, Ticker, SAF...
■ Planos & Funcionalidades
9 termos — Jogador, Craque, Lenda, Alavancagem, IA...
Além do Glossário, o app possui 32 ícones ■ distribuídos nos campos-chave da interface (MKT Cap,
Preço IPO, Equity Value, Bid/Ask, Spread, OFI, etc.). Ao tocar em qualquer ■, um painel desliza com a
definição completa do termo.
FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
footstock.app · Confidencial Página 14
10
Planos e Assinatura
O FootStock oferece 3 planos. O plano Jogador é gratuito e permanente. Os planos Craque e Lenda
são assinaturas mensais com desconto de 25% para pagamento anual:
Jogador Craque Lenda
Preço mensal Grátis R$ 19,90/mês R$ 39,90/mês
    Preço anual — R$ 14,92/mês R$ 29,92/mês
    Saldo inicial FS$ 2.000 FS$ 5.000 + FS$ 25.000 +
    Cotações Delay 1h Delay 30min Tempo real
    Ordens por dia 2 5 Ilimitado
    Ordem a Mercado ✓ ✓ ✓
    Ordem Limitada — ✓ ✓
    Ordem Agendada — ✓ ✓
    OCO (Stop/TP) — — ✓
    Short Selling — — ✓
    Alavancagem 2× — — ✓
    Assessor IA — Basico VIP (busca web)
    Ligas Publicas ✓ ✓ ✓
    Ligas de Amigos — ✓ ✓
    Ligas PRO — — ✓
    Formas de Pagamento
    O FootStock aceita pagamento via Mercado Pago (Pix, cartão, saldo MP), PagSeguro (Pix, boleto,
    cartão) e PayPal. Para planos anuais, o desconto de 25% é aplicado automaticamente na checkout.
    FOOTSTOCK — A Bolsa do Futebol · Manual do Usuário Versão 1.0 · 2026
    footstock.app · Confidencial Página 15
    11
    Conformidade e Seguranca
    ■ LGPD
    Dados coletados conforme Lei 13.709/2018. Direito de
    acesso, correcao e exclusao garantidos.
    ■ Autenticacao Segura
    Login com email/senha + suporte a autenticacao biometrica
    (Face ID / Touch ID) no painel admin.
    ■■Disclaimer
    O FootStock e uma plataforma educativa de simulacao.
    Nenhuma operacao envolve dinheiro real ou constitui
    ■ Dados Reais
    Valuations baseados em fontes publicas: Sports Value,
    Transfermarkt, Exame, CNN Brasil (2024-2025).
    ■ SAF
    Clubes com modelo SAF (Sociedade Anonima do Futebol)
    recebem tratamento diferenciado no valuation.
    ■ Dados de Pagamento
    O FootStock nao armazena dados de cartao. Pagamentos
    processados pelos gateways certificados PCI-DSS.
    FootStock — A Bolsa do Futebol · footstock.app
    Manual do Usuário v1.0 · Março 2026 · Confidencial · Todos os direitos reservados
