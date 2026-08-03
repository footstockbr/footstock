// ============================================================================
// Gate editorial de escopo — matriz de decisão completa.
//
// Cada caso abaixo é um item real da amostra colhida do admin em 2026-08-03,
// não um cenário inventado: NBA, Chelsea, Neymar sem clube, leilão duplicado e
// a enxurrada de futebol europeu. O teste falha se qualquer um deles voltar a
// ser publicável.
// ============================================================================

import {
  decideEditorialPublication,
  isOutOfScopeByTitle,
  type EditorialRowView,
} from '../editorial-gate'
import { isLlmUnavailableReason, LLM_UNAVAILABLE_REASONS } from '../types'

/** Linha com clube local ancorado num asset que existe na tabela `assets`. */
const LOCAL: EditorialRowView = { ticker: 'FLM3', assetId: 'asset-uuid-FLM3' }
/** Linha sem clube nenhum — o que a amostra mostrava como "Sem time". */
const NO_TEAM: EditorialRowView = { ticker: '', assetId: null }
/** Ticker resolvido mas ausente de `assets` (clube fora do app). */
const FOREIGN: EditorialRowView = { ticker: 'CHE3', assetId: null }

describe('decideEditorialPublication', () => {
  describe('LLM saudável (há veredito)', () => {
    test('clube local ancorado → publica, não degradado', () => {
      const decision = decideEditorialPublication({ fallbackReason: null, rows: [LOCAL] })

      expect(decision).toEqual({ publish: true, blockReason: null, degraded: false })
    })

    test('veredito "teams: []" → bloqueia, mesmo que o fallback tenha achado ticker', () => {
      // Este é o caso do "Neymar questiona ausência de dois brasileiros em lista
      // de maiores goleiros": o LLM diz corretamente que nenhum clube da lista é
      // afetado, mas o resolvedor determinístico pode casar um alias no título.
      // O veredito do LLM tem que vencer, senão o fallback ressuscita a notícia.
      const decision = decideEditorialPublication({
        fallbackReason: 'llm_no_team',
        rows: [LOCAL],
      })

      expect(decision).toEqual({
        publish: false,
        blockReason: 'out_of_scope_llm',
        degraded: false,
      })
    })

    test('clube estrangeiro sem asset local → bloqueia por asset_unresolved', () => {
      // "O 'problemaço' envolvendo brasileiro que Xabi Alonso precisa resolver
      // no Chelsea": mesmo que o LLM devolvesse um ticker, ele não existe em
      // `assets` e portanto não é time deste app.
      const decision = decideEditorialPublication({ fallbackReason: null, rows: [FOREIGN] })

      expect(decision).toEqual({
        publish: false,
        blockReason: 'asset_unresolved',
        degraded: false,
      })
    })

    test('grupo misto publica: basta UMA linha ancorada localmente', () => {
      const decision = decideEditorialPublication({
        fallbackReason: null,
        rows: [FOREIGN, LOCAL],
      })

      expect(decision.publish).toBe(true)
      expect(decision.blockReason).toBeNull()
    })
  })

  describe('LLM indisponível (terceira via — nem fail-open nem fail-closed)', () => {
    test('crédito esgotado + clube local resolvido → publica DEGRADADO', () => {
      // O feed não fica vazio quando o LLM cai: o resolvedor determinístico
      // (precision-first, alimentado por `assets.search_text`) segura a operação.
      const decision = decideEditorialPublication({
        fallbackReason: 'credit_circuit_open',
        rows: [LOCAL],
      })

      expect(decision).toEqual({ publish: true, blockReason: null, degraded: true })
    })

    test('crédito esgotado sem clube local → bloqueia por no_local_team', () => {
      // Este é o bug de 2026-08-03 inteiro: com o circuito aberto TODA notícia
      // classificava para ticker '' / relevance 0 / teams [] e mesmo assim era
      // publicada como "Sem time / Neutral". Inclusive LeBron nos 76ers.
      const decision = decideEditorialPublication({
        fallbackReason: 'credit_circuit_open',
        rows: [NO_TEAM],
      })

      expect(decision).toEqual({
        publish: false,
        blockReason: 'no_local_team',
        degraded: true,
      })
    })

    test.each([...LLM_UNAVAILABLE_REASONS])(
      'motivo %s é tratado como degradação, não como veredito',
      (reason) => {
        expect(decideEditorialPublication({ fallbackReason: reason, rows: [LOCAL] })).toEqual({
          publish: true,
          blockReason: null,
          degraded: true,
        })
      },
    )
  })

  describe('heurística de pauta fora de escopo (só no modo degradado)', () => {
    // Sem LLM, ancorar clube por alias no título é sinal fraco: a menção pode ser
    // incidental. Estes são os títulos reais da amostra que ancoravam e não deviam.
    const OUT_OF_SCOPE_TITLES = [
      'Fim de semana em mansão e póquer com Neymar: os lotes do 6º Leilão do Instituto',
      'Camisa do Flamengo entra em leilão beneficente',
      'Ex-jogador do Palmeiras vira técnico de basquete na NBA',
      'Torcedor do Corinthians vence etapa da Fórmula 1',
      'Rifa do Instituto arrecada para o São Paulo',
    ]

    test.each(OUT_OF_SCOPE_TITLES)('degradado + título "%s" → bloqueia', (title) => {
      const decision = decideEditorialPublication({
        fallbackReason: 'credit_circuit_open',
        rows: [LOCAL],
        title,
      })

      expect(decision).toEqual({
        publish: false,
        blockReason: 'out_of_scope_heuristic',
        degraded: true,
      })
    })

    test('com LLM saudável a heurística NÃO roda — o veredito do modelo é a autoridade', () => {
      // "Flamengo leiloa camisas para custear reforço" é pauta financeira legítima.
      // Second-guessar o LLM aqui suprimiria notícia real.
      const decision = decideEditorialPublication({
        fallbackReason: null,
        rows: [LOCAL],
        title: 'Flamengo leiloa camisas históricas para custear reforço',
      })

      expect(decision).toEqual({ publish: true, blockReason: null, degraded: false })
    })

    test('degradado com título comum publica normalmente', () => {
      const decision = decideEditorialPublication({
        fallbackReason: 'credit_circuit_open',
        rows: [LOCAL],
        title: 'Flamengo anuncia contratação de zagueiro por R$ 40 milhões',
      })

      expect(decision).toEqual({ publish: true, blockReason: null, degraded: true })
    })

    test('título ausente equivale a título que não casa nada', () => {
      expect(
        decideEditorialPublication({ fallbackReason: 'credit_circuit_open', rows: [LOCAL] }).publish,
      ).toBe(true)
    })

    test('acento e caixa não escapam da heurística', () => {
      expect(isOutOfScopeByTitle('LEILÃO do Botafogo')).toBe(true)
      expect(isOutOfScopeByTitle('Vôlei tem jogo no Maracanã')).toBe(true)
    })

    test('o termo tem que ser palavra inteira, não substring', () => {
      // 'f1' dentro de 'f1nal' ou 'nba' dentro de 'nbank' não podem casar.
      expect(isOutOfScopeByTitle('Grêmio vence a f1nalissima')).toBe(false)
      expect(isOutOfScopeByTitle('Patrocínio do nbanco fecha com o Santos')).toBe(false)
    })

    test('a heurística não bloqueia quando não há âncora local — o motivo continua no_local_team', () => {
      // Precedência importa para a telemetria: sem clube nenhum o problema é a
      // falta de âncora, não a pauta.
      const decision = decideEditorialPublication({
        fallbackReason: 'credit_circuit_open',
        rows: [NO_TEAM],
        title: 'Leilão beneficente da NBA arrecada fundos',
      })

      expect(decision.blockReason).toBe('no_local_team')
    })
  })

  describe('classificação dos motivos', () => {
    test('llm_no_team NÃO é indisponibilidade — é veredito válido', () => {
      // A distinção é o eixo do gate inteiro. Se `llm_no_team` entrasse no
      // conjunto de indisponibilidade, o fallback por título voltaria a poder
      // republicar tudo que o LLM tinha acabado de rejeitar.
      expect(isLlmUnavailableReason('llm_no_team')).toBe(false)
      expect(LLM_UNAVAILABLE_REASONS.has('llm_no_team' as never)).toBe(false)
    })

    test('ausência de motivo significa "o LLM respondeu"', () => {
      expect(isLlmUnavailableReason(null)).toBe(false)
      expect(isLlmUnavailableReason(undefined)).toBe(false)
    })

    test('parse inválido conta como indisponibilidade', () => {
      // Resposta que não parseia é indistinguível de resposta ausente: não há
      // veredito editorial nenhum para respeitar.
      expect(isLlmUnavailableReason('parse_invalid')).toBe(true)
    })
  })

  describe('bordas', () => {
    test('grupo vazio não publica', () => {
      const decision = decideEditorialPublication({ fallbackReason: null, rows: [] })

      expect(decision.publish).toBe(false)
    })

    test('ticker presente sem assetId não ancora', () => {
      expect(decideEditorialPublication({ rows: [FOREIGN] }).publish).toBe(false)
    })

    test('assetId presente sem ticker não ancora', () => {
      const orphan: EditorialRowView = { ticker: '', assetId: 'asset-uuid-x' }

      expect(decideEditorialPublication({ rows: [orphan] }).publish).toBe(false)
    })
  })
})
