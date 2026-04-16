// ============================================================================
// FootStock — Glossário com 116 termos em 8 categorias
// Dados estáticos em memória — sem banco de dados
// Fonte: module-18/TASK-3/ST001
// ============================================================================

import { GLOSSARY_CATEGORY, type GlossaryCategory } from '@/lib/enums'

export interface GlossaryTerm {
  slug: string
  title: string
  definition: string
  category: GlossaryCategory
  examples?: string[]
  relatedTerms?: string[] // slugs de termos relacionados
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  // ─── Análise Técnica (18 termos) ─────────────────────────────────────────
  {
    slug: 'suporte',
    title: 'Suporte',
    definition: 'Nível de preço onde a demanda é forte o suficiente para interromper ou reverter uma queda. É uma "zona de preço" onde compradores historicamente aparecem com força.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    examples: ['FLM testou o suporte em FS$ 45,00 três vezes sem romper'],
    relatedTerms: ['resistencia', 'pullback'],
  },
  {
    slug: 'resistencia',
    title: 'Resistência',
    definition: 'Nível de preço onde a oferta é forte o suficiente para interromper ou reverter uma alta. Região onde vendedores historicamente entram em volume.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    examples: ['VALE3 encontrou resistência em FS$ 120,00'],
    relatedTerms: ['suporte', 'breakout'],
  },
  {
    slug: 'tendencia',
    title: 'Tendência',
    definition: 'Direção predominante do movimento de preço de um ativo ao longo do tempo. Pode ser de alta (bullish), baixa (bearish) ou lateral (sideways).',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['media-movel', 'breakout'],
  },
  {
    slug: 'media-movel',
    title: 'Média Móvel',
    definition: 'Indicador que calcula a média dos preços de fechamento de um ativo em um período definido, suavizando as variações diárias para identificar tendências.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    examples: ['MM20 cruzou acima da MM50 — sinal de alta'],
    relatedTerms: ['tendencia', 'macd'],
  },
  {
    slug: 'rsi',
    title: 'RSI',
    definition: 'Índice de Força Relativa (Relative Strength Index). Oscilador entre 0 e 100 que mede a velocidade e magnitude das variações de preço. Acima de 70 indica sobrecompra; abaixo de 30, sobrevenda.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    examples: ['RSI em 75 sugere possível correção'],
    relatedTerms: ['macd', 'divergencia'],
  },
  {
    slug: 'macd',
    title: 'MACD',
    definition: 'Moving Average Convergence Divergence. Indicador de momentum que mostra a relação entre duas médias móveis exponenciais. O cruzamento da linha MACD com a linha de sinal gera sinais de compra/venda.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['media-movel', 'rsi'],
  },
  {
    slug: 'bollinger-bands',
    title: 'Bollinger Bands',
    definition: 'Bandas de volatilidade colocadas acima e abaixo de uma média móvel. Quando o preço toca a banda superior, pode indicar sobrecompra; na banda inferior, sobrevenda.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['media-movel', 'volatilidade'],
  },
  {
    slug: 'candlestick',
    title: 'Candlestick',
    definition: 'Representação gráfica do preço de um ativo em um período, mostrando abertura, fechamento, máxima e mínima. Padrões de candles são amplamente usados para prever movimentos.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    examples: ['Doji, Martelo, Engolfo de Alta são padrões comuns'],
  },
  {
    slug: 'volume',
    title: 'Volume',
    definition: 'Quantidade total de contratos ou ações negociados em um período. Confirma a força de um movimento: alta com volume crescente é mais confiável.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['breakout'],
  },
  {
    slug: 'breakout',
    title: 'Breakout',
    definition: 'Rompimento de um nível significativo de suporte ou resistência com volume acima da média. Frequentemente sinaliza o início de um novo movimento direcional.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['suporte', 'resistencia', 'volume'],
  },
  {
    slug: 'pullback',
    title: 'Pullback',
    definition: 'Recuo temporário de preço contra a tendência principal antes de retomar o movimento original. Comum após um breakout; visto como oportunidade de entrada.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['tendencia', 'suporte'],
  },
  {
    slug: 'topo-duplo',
    title: 'Topo Duplo',
    definition: 'Padrão gráfico de reversão formado por dois picos de preço próximos na mesma região, separados por um vale. Sinaliza possível reversão de alta para baixa.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['resistencia', 'fundo-duplo'],
  },
  {
    slug: 'fundo-duplo',
    title: 'Fundo Duplo',
    definition: 'Padrão gráfico de reversão formado por dois fundos de preço próximos na mesma região. Sinaliza possível reversão de baixa para alta.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['suporte', 'topo-duplo'],
  },
  {
    slug: 'triangulo-ascendente',
    title: 'Triângulo Ascendente',
    definition: 'Padrão gráfico de continuação com topo horizontal e fundo ascendente. Geralmente resolve com rompimento para cima.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['breakout'],
  },
  {
    slug: 'fibonacci',
    title: 'Fibonacci',
    definition: 'Ferramenta de análise que usa os níveis da sequência de Fibonacci (38,2%, 50%, 61,8%) para identificar possíveis zonas de suporte e resistência em retrações.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['suporte', 'resistencia', 'pullback'],
  },
  {
    slug: 'pivot',
    title: 'Pivot',
    definition: 'Ponto de referência calculado a partir das máximas, mínimas e fechamentos anteriores. Usado para identificar suportes e resistências intradiários.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['suporte', 'resistencia'],
  },
  {
    slug: 'gap',
    title: 'Gap',
    definition: 'Abertura do preço em um nível significativamente diferente do fechamento anterior, criando um "vazio" no gráfico. Gaps de exaustão, continuação e rompimento têm interpretações distintas.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['candlestick', 'volume'],
  },
  {
    slug: 'divergencia',
    title: 'Divergência',
    definition: 'Situação onde o preço do ativo e um indicador (como RSI ou MACD) se movem em direções opostas. Divergência de alta sugere reversão para cima; de baixa, para baixo.',
    category: GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
    relatedTerms: ['rsi', 'macd'],
  },

  // ─── Fundamentalista (12 termos) ─────────────────────────────────────────
  {
    slug: 'p-l',
    title: 'P/L',
    definition: 'Preço sobre Lucro. Indica quantos anos levaria para recuperar o investimento com base no lucro atual da empresa. Um P/L baixo pode indicar ativo barato; alto, pode indicar expectativas elevadas de crescimento.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    examples: ['P/L de 10 significa que o mercado paga 10x o lucro anual'],
    relatedTerms: ['roe', 'ev-ebitda'],
  },
  {
    slug: 'p-vpa',
    title: 'P/VPA',
    definition: 'Preço sobre Valor Patrimonial por Ação. Compara o preço de mercado com o valor contábil. P/VPA abaixo de 1 pode indicar que o ativo está sendo negociado abaixo do valor patrimonial.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['p-l'],
  },
  {
    slug: 'roe',
    title: 'ROE',
    definition: 'Return on Equity (Retorno sobre Patrimônio Líquido). Mede a eficiência com que uma empresa usa seu patrimônio para gerar lucro. Quanto maior, mais eficiente.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['roic', 'ebitda'],
  },
  {
    slug: 'ebitda',
    title: 'EBITDA',
    definition: 'Lucro antes de juros, impostos, depreciação e amortização. Indica a geração de caixa operacional da empresa, eliminando efeitos de decisões financeiras e contábeis.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['ev-ebitda', 'free-cash-flow'],
  },
  {
    slug: 'dividend-yield',
    title: 'Dividend Yield',
    definition: 'Percentual do preço pago como dividendo. Calculado como dividendo anual dividido pelo preço atual. Relevante para investidores focados em renda.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['free-cash-flow'],
  },
  {
    slug: 'free-cash-flow',
    title: 'Free Cash Flow',
    definition: 'Fluxo de caixa livre: o dinheiro que sobra após as despesas operacionais e investimentos em capital. Indica a saúde financeira real da empresa.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['ebitda', 'capex'],
  },
  {
    slug: 'alavancagem-fund',
    title: 'Alavancagem',
    definition: 'Razão entre dívida total e patrimônio líquido. Alta alavancagem aumenta tanto o potencial de retorno quanto o risco de inadimplência.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['ebitda'],
  },
  {
    slug: 'roic',
    title: 'ROIC',
    definition: 'Return on Invested Capital. Mede a eficiência com que a empresa usa todo o capital investido (próprio + de terceiros) para gerar lucro operacional.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['roe'],
  },
  {
    slug: 'ev-ebitda',
    title: 'EV/EBITDA',
    definition: 'Enterprise Value sobre EBITDA. Múltiplo de valuation que compara o valor total da empresa (incluindo dívida) com sua geração de caixa operacional.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['p-l', 'ebitda'],
  },
  {
    slug: 'margem-liquida',
    title: 'Margem Líquida',
    definition: 'Percentual do lucro líquido em relação à receita total. Indica quanto de cada real faturado se converte em lucro após todos os custos e impostos.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['ebitda'],
  },
  {
    slug: 'capex',
    title: 'Capex',
    definition: 'Capital Expenditure: gastos com aquisição ou manutenção de ativos fixos (infraestrutura, equipamentos). Alto Capex pode indicar empresa em fase de expansão.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['free-cash-flow'],
  },
  {
    slug: 'working-capital',
    title: 'Working Capital',
    definition: 'Capital de Giro: diferença entre ativos circulantes e passivos circulantes. Indica a liquidez operacional da empresa para honrar obrigações de curto prazo.',
    category: GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
    relatedTerms: ['free-cash-flow'],
  },

  // ─── Trading (18 termos) ─────────────────────────────────────────────────
  {
    slug: 'ordem-a-mercado',
    title: 'Ordem a Mercado',
    definition: 'Ordem executada imediatamente ao melhor preço disponível. Garante a execução, mas não o preço exato.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['ordem-limitada', 'liquidez'],
  },
  {
    slug: 'ordem-limitada',
    title: 'Ordem Limitada',
    definition: 'Ordem que só é executada a um preço específico ou melhor. Garante o preço, mas não a execução.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['ordem-a-mercado'],
  },
  {
    slug: 'ordem-stop',
    title: 'Ordem Stop',
    definition: 'Ordem ativada quando o preço atinge um nível pré-definido. Usada para limitar perdas (stop loss) ou proteger ganhos (stop gain).',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['stop-loss', 'oco'],
  },
  {
    slug: 'oco',
    title: 'OCO',
    definition: 'One Cancels Other: par de ordens onde a execução de uma cancela automaticamente a outra. Permite definir simultaneamente um alvo de lucro e um limite de perda.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['ordem-stop', 'stop-loss', 'take-profit'],
  },
  {
    slug: 'day-trade',
    title: 'Day Trade',
    definition: 'Estratégia de compra e venda do mesmo ativo no mesmo pregão, buscando lucrar com variações intradiárias de preço.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['scalping', 'liquidez'],
  },
  {
    slug: 'swing-trade',
    title: 'Swing Trade',
    definition: 'Estratégia que mantém posições de dias a semanas, aproveitando oscilações de médio prazo no mercado.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['day-trade', 'tendencia'],
  },
  {
    slug: 'scalping',
    title: 'Scalping',
    definition: 'Estratégia de muito curto prazo que busca lucros pequenos em muitas operações rápidas, explorando micro-movimentos de preço.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['day-trade', 'spread'],
  },
  {
    slug: 'posicao',
    title: 'Posição',
    definition: 'Quantidade de ativos que um investidor detém em carteira. Pode ser posição comprada (long) ou vendida (short).',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['long-trading', 'short-trading'],
  },
  {
    slug: 'short-trading',
    title: 'Short',
    definition: 'Operação de venda a descoberto: vender um ativo que não se possui, apostando na queda do preço para recomprá-lo mais barato. No FootStock, é uma funcionalidade exclusiva do plano Lenda.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['long-trading', 'margem', 'posicao'],
  },
  {
    slug: 'long-trading',
    title: 'Long',
    definition: 'Posição comprada: deter ou comprar um ativo apostando na valorização do preço. A estratégia mais comum no mercado.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['short-trading', 'posicao'],
  },
  {
    slug: 'alavancagem-trading',
    title: 'Alavancagem',
    definition: 'Uso de capital emprestado para ampliar o potencial de retorno (e de perda) de uma operação. No FootStock, o plano Lenda permite alavancagem de 2x.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['margem', 'margin-call'],
  },
  {
    slug: 'margem',
    title: 'Margem',
    definition: 'Garantia depositada para abrir posições alavancadas. Se o valor da posição cair abaixo da margem mínima, é ativado o Margin Call.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['alavancagem-trading', 'margin-call'],
  },
  {
    slug: 'stop-loss',
    title: 'Stop Loss',
    definition: 'Ordem automática para encerrar uma posição ao atingir um preço de perda máxima pré-definido. Protege o capital do investidor.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['oco', 'take-profit'],
  },
  {
    slug: 'take-profit',
    title: 'Take Profit',
    definition: 'Ordem automática para encerrar uma posição ao atingir um nível de lucro alvo. Realiza o ganho sem depender de monitoramento constante.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['oco', 'stop-loss'],
  },
  {
    slug: 'liquidez',
    title: 'Liquidez',
    definition: 'Facilidade com que um ativo pode ser comprado ou vendido sem impactar significativamente seu preço. Ativos líquidos têm alto volume de negociação.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['volume', 'spread'],
  },
  {
    slug: 'spread',
    title: 'Spread',
    definition: 'Diferença entre o preço de compra (bid) e o preço de venda (ask) de um ativo. Um spread pequeno indica mercado líquido; spread grande indica baixa liquidez.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['liquidez'],
  },
  {
    slug: 'slippage',
    title: 'Slippage',
    definition: 'Diferença entre o preço esperado de uma ordem e o preço efetivamente executado. Comum em mercados com baixa liquidez ou ordens muito grandes.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['spread', 'liquidez'],
  },
  {
    slug: 'ordem-iceberg',
    title: 'Ordem Iceberg',
    definition: 'Ordem grande dividida automaticamente em pequenas ordens visíveis no book, ocultando o volume total para não mover o mercado.',
    category: GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
    relatedTerms: ['liquidez', 'slippage'],
  },

  // ─── Derivativos (10 termos) ─────────────────────────────────────────────
  {
    slug: 'opcao-de-compra',
    title: 'Opção de Compra',
    definition: 'Contrato que dá o direito (não obrigação) de comprar um ativo a um preço predeterminado (strike) até uma data de vencimento.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['opcao-de-venda', 'strike', 'premio'],
  },
  {
    slug: 'opcao-de-venda',
    title: 'Opção de Venda',
    definition: 'Contrato que dá o direito (não obrigação) de vender um ativo a um preço predeterminado (strike) até uma data de vencimento.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['opcao-de-compra', 'strike', 'premio'],
  },
  {
    slug: 'strike',
    title: 'Strike',
    definition: 'Preço de exercício de uma opção — o preço pelo qual o detentor pode comprar ou vender o ativo subjacente.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['opcao-de-compra', 'opcao-de-venda'],
  },
  {
    slug: 'premio',
    title: 'Prêmio',
    definition: 'Preço pago pelo comprador da opção ao vendedor pelo direito de exercê-la. Determinado por fatores como volatilidade, tempo até o vencimento e distância do strike.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['opcao-de-compra', 'gregas', 'volatilidade-implicita'],
  },
  {
    slug: 'exercicio',
    title: 'Exercício',
    definition: 'Ato de usar o direito conferido por uma opção para comprar ou vender o ativo pelo preço de strike.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['strike', 'opcao-de-compra'],
  },
  {
    slug: 'gregas',
    title: 'Gregas',
    definition: 'Métricas que quantificam a sensibilidade do prêmio de uma opção a variações nos fatores de risco: Delta (preço do ativo), Theta (tempo), Vega (volatilidade), etc.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['delta', 'theta', 'vega'],
  },
  {
    slug: 'delta',
    title: 'Delta',
    definition: 'Variação do prêmio da opção para cada R$1 de variação no preço do ativo subjacente. Delta 0.5 = prêmio sobe R$0,50 para cada R$1 de alta no ativo.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['gregas', 'vega'],
  },
  {
    slug: 'theta',
    title: 'Theta',
    definition: 'Decaimento temporal do prêmio de uma opção. Quanto mais próxima a data de vencimento, mais rápido o theta consome o valor da opção.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['gregas', 'premio'],
  },
  {
    slug: 'vega',
    title: 'Vega',
    definition: 'Sensibilidade do prêmio da opção a variações na volatilidade implícita. Vega positivo = posição se beneficia de aumento de volatilidade.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['gregas', 'volatilidade-implicita'],
  },
  {
    slug: 'volatilidade-implicita',
    title: 'Volatilidade Implícita',
    definition: 'Volatilidade futura esperada pelo mercado, derivada do preço atual das opções. Representa o "medo" ou "otimismo" do mercado para o ativo.',
    category: GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
    relatedTerms: ['vega', 'premio'],
  },

  // ─── Gestão de Risco (14 termos) ─────────────────────────────────────────
  {
    slug: 'diversificacao',
    title: 'Diversificação',
    definition: 'Estratégia de distribuir investimentos entre diferentes ativos para reduzir o risco total da carteira. Baseia-se no princípio de que perdas em um ativo podem ser compensadas por ganhos em outros.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['correlacao', 'risco-idiossincrático'],
  },
  {
    slug: 'correlacao',
    title: 'Correlação',
    definition: 'Medida estatística que indica como dois ativos se movem em relação um ao outro. Correlação positiva = movem-se na mesma direção; negativa = em direções opostas.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['diversificacao', 'beta'],
  },
  {
    slug: 'beta',
    title: 'Beta',
    definition: 'Mede a sensibilidade de um ativo em relação ao mercado. Beta > 1 = mais volátil que o mercado; Beta < 1 = menos volátil; Beta negativo = movimenta-se inversamente ao mercado.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['correlacao', 'risco-sistematico'],
  },
  {
    slug: 'var',
    title: 'VaR',
    definition: 'Value at Risk: estimativa da perda máxima esperada de uma carteira em um período e nível de confiança específicos. Ex: VaR 95% de R$1.000 = probabilidade de 5% de perder mais que R$1.000 em um dia.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['drawdown'],
  },
  {
    slug: 'sharpe-ratio',
    title: 'Sharpe Ratio',
    definition: 'Medida de retorno ajustado ao risco: retorno da carteira acima da taxa livre de risco dividido pelo desvio padrão. Quanto maior, melhor a relação risco-retorno.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['diversificacao'],
  },
  {
    slug: 'drawdown',
    title: 'Drawdown',
    definition: 'Queda máxima de um investimento desde o pico até o vale mais recente. Indica o pior cenário que um investidor poderia ter experimentado.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['var', 'stop-loss'],
  },
  {
    slug: 'hedge',
    title: 'Hedge',
    definition: 'Estratégia de proteção que usa posições opostas ou instrumentos derivativos para reduzir o risco de variações adversas de preço.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['diversificacao', 'opcao-de-venda'],
  },
  {
    slug: 'risco-sistematico',
    title: 'Risco Sistemático',
    definition: 'Risco inerente ao mercado como um todo, que não pode ser eliminado pela diversificação. Inclui crises econômicas, mudanças de taxa de juros e eventos macroeconômicos.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['beta', 'risco-idiossincrático'],
  },
  {
    slug: 'risco-idiossincrático',
    title: 'Risco Idiossincrático',
    definition: 'Risco específico de um ativo ou empresa, que pode ser reduzido pela diversificação. Ex: escândalo corporativo, mudança de gestão, perda de contrato.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['risco-sistematico', 'diversificacao'],
  },
  {
    slug: 'kelly-criterion',
    title: 'Kelly Criterion',
    definition: 'Fórmula matemática para calcular o tamanho ideal de uma posição com base na probabilidade de sucesso e no retorno esperado. Maximiza o crescimento da carteira no longo prazo.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['position-sizing'],
  },
  {
    slug: 'position-sizing',
    title: 'Position Sizing',
    definition: 'Técnica de determinar o tamanho adequado de uma posição com base no capital disponível e no risco máximo aceitável por operação.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['kelly-criterion', 'stop-loss'],
  },
  {
    slug: 'circuit-breaker-risk',
    title: 'Circuit Breaker',
    definition: 'Mecanismo de suspensão automática das negociações ativado quando o mercado cai além de um limite pré-estabelecido, para evitar pânico generalizado.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['stop-compulsorio'],
  },
  {
    slug: 'margin-call',
    title: 'Margin Call',
    definition: 'Chamada de margem: notificação de que a conta caiu abaixo do nível mínimo de garantia exigido para manter posições alavancadas. Requer depósito adicional ou liquidação de posições.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['margem', 'stop-compulsorio'],
  },
  {
    slug: 'stop-compulsorio',
    title: 'Stop Compulsório',
    definition: 'Encerramento automático de posições pela plataforma quando o saldo cai abaixo do nível mínimo de segurança. Evita que o usuário fique com saldo negativo.',
    category: GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
    relatedTerms: ['margin-call', 'circuit-breaker-risk'],
  },

  // ─── Mercado (16 termos) ─────────────────────────────────────────────────
  {
    slug: 'bull-market',
    title: 'Bull Market',
    definition: 'Período de valorização sustentada do mercado, geralmente definido como alta de 20% ou mais desde a mínima recente. Associado a otimismo e crescimento econômico.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['bear-market'],
  },
  {
    slug: 'bear-market',
    title: 'Bear Market',
    definition: 'Período de desvalorização sustentada do mercado, definido como queda de 20% ou mais desde a máxima recente. Associado a pessimismo e contração econômica.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['bull-market'],
  },
  {
    slug: 'circuit-breaker-mercado',
    title: 'Circuit Breaker',
    definition: 'Suspensão automática das negociações na Bolsa quando o Ibovespa cai além de limites pré-definidos (10%, 15%, 20%). Dá tempo para o mercado processar informações.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['pregao'],
  },
  {
    slug: 'pregao',
    title: 'Pregão',
    definition: 'Sessão oficial de negociações na Bolsa de Valores. No Brasil, o pregão regular ocorre das 10h às 17h55, com after-market das 17h30 às 19h.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['after-market'],
  },
  {
    slug: 'after-market',
    title: 'After Market',
    definition: 'Período de negociações após o encerramento do pregão regular. Permite ajustes com volume reduzido e faixa de variação limitada.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['pregao'],
  },
  {
    slug: 'lote-padrao',
    title: 'Lote Padrão',
    definition: 'Quantidade mínima de ações para negociação no mercado à vista, geralmente 100 unidades. Permite negociação em múltiplos do lote.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['fracionario'],
  },
  {
    slug: 'fracionario',
    title: 'Fracionário',
    definition: 'Mercado que permite negociação de quantidades menores que o lote padrão (1 a 99 ações). Tem liquidez menor e spread geralmente mais amplo.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['lote-padrao'],
  },
  {
    slug: 'blue-chip',
    title: 'Blue Chip',
    definition: 'Ações de empresas grandes, sólidas e bem estabelecidas, com histórico consistente de resultados. Alta liquidez e menor volatilidade em relação a empresas menores.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['market-cap', 'liquidez'],
  },
  {
    slug: 'mid-cap',
    title: 'Mid Cap',
    definition: 'Empresas de capitalização intermediária. Oferecem maior potencial de crescimento que as blue chips, com risco moderado.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['blue-chip', 'small-cap', 'market-cap'],
  },
  {
    slug: 'small-cap',
    title: 'Small Cap',
    definition: 'Empresas de pequena capitalização. Maior potencial de valorização, mas também maior risco e menor liquidez.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['mid-cap', 'blue-chip', 'market-cap'],
  },
  {
    slug: 'ipo',
    title: 'IPO',
    definition: 'Initial Public Offering (Oferta Pública Inicial): primeira vez que uma empresa emite ações para o público em geral na Bolsa de Valores.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['follow-on'],
  },
  {
    slug: 'follow-on',
    title: 'Follow-on',
    definition: 'Nova emissão de ações por uma empresa já listada em Bolsa, para captar capital adicional. Também chamado de "oferta subsequente".',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['ipo'],
  },
  {
    slug: 'buyback',
    title: 'Buyback',
    definition: 'Recompra de ações pela própria empresa no mercado, reduzindo o número de ações em circulação. Geralmente sinaliza que a gestão acredita que o papel está subvalorizado.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['market-cap', 'float'],
  },
  {
    slug: 'market-cap',
    title: 'Market Cap',
    definition: 'Capitalização de mercado: valor total de todas as ações de uma empresa em circulação. Calculado multiplicando o preço por ação pelo número total de ações.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['float', 'blue-chip'],
  },
  {
    slug: 'float',
    title: 'Float',
    definition: 'Parcela das ações de uma empresa disponível para negociação no mercado secundário, excluindo ações de controladores e insiders.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['market-cap', 'liquidez'],
  },
  {
    slug: 'volatilidade',
    title: 'Volatilidade',
    definition: 'Medida estatística da variação do preço de um ativo em relação à sua média. Alta volatilidade = variações bruscas; baixa volatilidade = movimentos suaves.',
    category: GLOSSARY_CATEGORY.MERCADO_PREGAO,
    relatedTerms: ['volatilidade-implicita', 'beta'],
  },

  // ─── Futebol (14 termos) ─────────────────────────────────────────────────
  {
    slug: 'brasileirao-serie-a',
    title: 'Brasileirão Série A',
    definition: 'Campeonato Brasileiro de Futebol — primeira divisão. Disputado por 20 clubes em turno único, com impacto direto no preço dos ativos dos clubes no FootStock.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['g4', 'rebaixamento'],
  },
  {
    slug: 'copa-do-brasil',
    title: 'Copa do Brasil',
    definition: 'Torneio eliminatório nacional que oferece vaga na Libertadores ao campeão. Vitórias e eliminações afetam o sentimento de mercado dos clubes participantes.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['libertadores'],
  },
  {
    slug: 'libertadores',
    title: 'Libertadores',
    definition: 'Copa Libertadores da América — principal torneio de clubes da América do Sul. Participação e desempenho têm impacto positivo significativo no preço dos ativos.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['copa-do-brasil', 'g4'],
  },
  {
    slug: 'g4',
    title: 'G4',
    definition: 'As 4 primeiras colocações do Brasileirão, que garantem vaga na fase de grupos da Libertadores. Estar no G4 tem efeito positivo no valor dos ativos dos clubes.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['brasileirao-serie-a', 'libertadores'],
  },
  {
    slug: 'rebaixamento',
    title: 'Rebaixamento',
    definition: 'Queda de um clube para a Série B ao terminar entre os 4 últimos colocados do Brasileirão. Evento com maior impacto negativo no preço do ativo do clube.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['brasileirao-serie-a', 'acesso'],
  },
  {
    slug: 'acesso',
    title: 'Acesso',
    definition: 'Promoção de um clube da Série B para a Série A. Evento positivo que pode valorizar o ativo do clube que sobe.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['rebaixamento'],
  },
  {
    slug: 'rodada',
    title: 'Rodada',
    definition: 'Conjunto de partidas disputadas em uma semana do Brasileirão. Resultados das rodadas geram oscilações nos preços dos ativos dos clubes envolvidos.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['brasileirao-serie-a'],
  },
  {
    slug: 'classico',
    title: 'Clássico',
    definition: 'Partida entre rivais históricos (ex: Fla-Flu, Derbi Paulista). Clássicos têm maior volatilidade nos ativos dos clubes envolvidos nos dias anteriores e posteriores.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['derby', 'rodada'],
  },
  {
    slug: 'derby',
    title: 'Derby',
    definition: 'Confronto entre clubes da mesma cidade ou região. No FootStock, derbies são marcados como eventos de alta volatilidade no motor de precificação.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['classico'],
  },
  {
    slug: 'fair-play-financeiro',
    title: 'Fair Play Financeiro',
    definition: 'Regulamento que exige equilíbrio entre receitas e gastos dos clubes. Sanções por descumprimento afetam negativamente o ativo do clube no FootStock.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['receita-de-bilheteria', 'direitos-de-tv'],
  },
  {
    slug: 'receita-de-bilheteria',
    title: 'Receita de Bilheteria',
    definition: 'Renda obtida pelos clubes com a venda de ingressos para os jogos. Representa componente do Dividendo Esportivo pago aos detentores do ativo.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['fair-play-financeiro', 'dividendo-esportivo'],
  },
  {
    slug: 'direitos-de-tv',
    title: 'Direitos de TV',
    definition: 'Receita obtida pelos clubes pela transmissão de jogos. Clubes com maiores direitos de TV tendem a ter ativos mais valorizados e estáveis no FootStock.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['fair-play-financeiro'],
  },
  {
    slug: 'passe',
    title: 'Passe',
    definition: 'Contrato de vínculo entre jogador e clube. Contratações de reforços de alto nível geralmente aumentam o sentimento positivo em relação ao ativo do clube.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['emprestimo-futebol'],
  },
  {
    slug: 'emprestimo-futebol',
    title: 'Empréstimo',
    definition: 'Cessão temporária de um jogador de um clube para outro. Pode liberar recursos financeiros e afetar o sentimento de mercado dependendo do jogador envolvido.',
    category: GLOSSARY_CATEGORY.DIVISOES_CLUBES,
    relatedTerms: ['passe'],
  },

  // ─── Motor FootStock (14 termos) ─────────────────────────────────────────
  {
    slug: 'preco-fs',
    title: 'Preço FS$',
    definition: 'Preço de um ativo no FootStock, denominado em FS$ (moeda virtual). Determinado pelo Motor de Precificação com base em resultados esportivos, sentimento e volume.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['motor-de-precificacao', 'tick-size'],
  },
  {
    slug: 'tick-size',
    title: 'Tick Size',
    definition: 'Menor variação de preço possível em um ativo do FootStock. Define a granularidade das variações de preço no motor.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['preco-fs'],
  },
  {
    slug: 'sentimento-de-mercado',
    title: 'Sentimento de Mercado',
    definition: 'Indicador que agrega as opiniões e análises dos usuários do fórum para cada ativo, influenciando o preço no Motor de Precificação.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['impacto-de-noticia', 'motor-de-precificacao'],
  },
  {
    slug: 'impacto-de-noticia',
    title: 'Impacto de Notícia',
    definition: 'Peso que uma notícia tem sobre o preço de um ativo. O Serviço de Injeção de Notícias classifica cada notícia por impacto (CRITICAL, HIGH, MEDIUM, LOW) e categoria.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['sentimento-de-mercado', 'motor-de-precificacao'],
  },
  {
    slug: 'motor-de-precificacao',
    title: 'Motor de Precificação',
    definition: 'Sistema central do FootStock que calcula o preço dos ativos a cada tick, combinando resultados esportivos, notícias, volume de negociação e sentimento do mercado.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['sentimento-de-mercado', 'impacto-de-noticia', 'preco-fs'],
  },
  {
    slug: 'fs-moeda',
    title: 'FS$',
    definition: 'Moeda virtual do FootStock. Todos os ativos são precificados e negociados em FS$. Novos usuários entram no plano Jogador com FS$ 2.000 de saldo inicial.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['preco-fs', 'plano-jogador'],
  },
  {
    slug: 'portfolio-fs',
    title: 'Portfólio',
    definition: 'Conjunto de posições abertas e histórico de trades de um usuário no FootStock. Inclui ativos comprados, posições short (Lenda) e resultado geral.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['posicao'],
  },
  {
    slug: 'taxa-aluguel-short',
    title: 'Taxa de Aluguel de Short',
    definition: 'Taxa diária cobrada sobre posições de venda a descoberto no FootStock (0,5%/dia). Exclusiva do plano Lenda.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['short-trading', 'plano-lenda'],
  },
  {
    slug: 'dividendo-esportivo',
    title: 'Dividendo Esportivo',
    definition: 'Distribuição de FS$ para detentores de ativos quando o clube associado conquista um resultado esportivo significativo (vitória em clássico, título, acesso).',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['dividendo-financeiro', 'plano-craque'],
  },
  {
    slug: 'dividendo-financeiro',
    title: 'Dividendo Financeiro',
    definition: 'Distribuição de FS$ baseada no desempenho financeiro do clube (receitas, fair play). Pago mensalmente e disponível a partir do plano Craque.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['dividendo-esportivo', 'plano-craque'],
  },
  {
    slug: 'score-de-liga',
    title: 'Score de Liga',
    definition: 'Pontuação calculada pelo Motor de Scoring para classificação em ligas. Considera 5 pilares: rentabilidade, diversificação, timing, consistência e fair play.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['portfolio-fs'],
  },
  {
    slug: 'plano-jogador',
    title: 'Plano Jogador',
    definition: 'Plano gratuito do FootStock. Permite negociação básica com até 2 ordens por dia, ordens a mercado e cotações com atraso de 1 hora.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['plano-craque', 'plano-lenda', 'fs-moeda'],
  },
  {
    slug: 'plano-craque',
    title: 'Plano Craque',
    definition: 'Plano intermediário do FootStock. Oferece até 5 ordens por dia, ordens limitadas/agendadas, cotações com atraso de 30 minutos e acesso a ligas privadas.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['plano-jogador', 'plano-lenda'],
  },
  {
    slug: 'plano-lenda',
    title: 'Plano Lenda',
    definition: 'Plano premium do FootStock. Dados em tempo real, ordens ilimitadas, short selling, alavancagem 2x, assessor IA e todas as funcionalidades da plataforma.',
    category: GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
    relatedTerms: ['plano-craque', 'short-trading', 'alavancagem-trading'],
  },
]

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

/** Retorna todos os termos de uma categoria */
export function getTermsByCategory(category: GlossaryCategory): GlossaryTerm[] {
  return GLOSSARY_TERMS.filter(t => t.category === category)
}

/** Retorna um termo pelo slug */
export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find(t => t.slug === slug)
}

/**
 * Mapeamento de 32 campos-chave da aplicação para slugs do glossário.
 * Usado pelos InfoIcons contextuais espalhados pela UI.
 * Fonte: module-18/TASK-6/ST001
 */
export const FIELD_TERM_MAP: Record<string, string> = {
  'preco-medio': 'preco-fs',
  'stop-loss': 'stop-loss',
  'take-profit': 'take-profit',
  'margem': 'margem',
  'pnl': 'p-l',
  'dividend-yield': 'dividend-yield',
  'ordem-a-mercado': 'ordem-a-mercado',
  'ordem-limitada': 'ordem-limitada',
  'slippage': 'slippage',
  'spread': 'spread',
  'liquidez': 'liquidez',
  'volatilidade': 'volatilidade',
  'market-cap': 'market-cap',
  'beta': 'beta',
  'rsi': 'rsi',
  'macd': 'macd',
  'suporte': 'suporte',
  'resistencia': 'resistencia',
  'bollinger-bands': 'bollinger-bands',
  'media-movel': 'media-movel',
  'drawdown': 'drawdown',
  'sharpe-ratio': 'sharpe-ratio',
  'posicao': 'posicao',
  'short': 'short-trading',
  'long': 'long-trading',
  'alavancagem': 'alavancagem-trading',
  'margin-call': 'margin-call',
  'circuit-breaker': 'circuit-breaker-mercado',
  'oco': 'oco',
  'sentimento-de-mercado': 'sentimento-de-mercado',
  'dividendo-esportivo': 'dividendo-esportivo',
  'preco-fs': 'preco-fs',
}

/** Busca full-text em título e definição (case-insensitive) */
export function searchTerms(query: string): GlossaryTerm[] {
  if (!query.trim()) return GLOSSARY_TERMS
  const lower = query.toLowerCase()
  return GLOSSARY_TERMS.filter(
    t =>
      t.title.toLowerCase().includes(lower) ||
      t.definition.toLowerCase().includes(lower) ||
      t.slug.includes(lower)
  )
}
